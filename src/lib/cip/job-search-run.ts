import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSearchBrief, type AreaResolver } from "@/lib/cip/brief-loader";
import {
  addUsage,
  checkBudget,
  EMPTY_USAGE,
  estimateCost,
  type JobSearchConfig,
  type RunUsage,
} from "@/lib/cip/job-search-config";
import {
  buildStepRequest,
  dedupeWithinRun,
  parseStepPayload,
  planSearchSteps,
  type JobSearchProvider,
  type SearchStep,
  type SourceTier,
} from "@/lib/cip/job-search-engine";
import { verifyPostings, type PageFetcher, type VerificationResult, safePageFetcher } from "@/lib/cip/job-verifier";
import { toOutboundFacets, violatesExclusions, type OutboundSearchFacets, type SearchBrief } from "@/lib/cip/search-brief";
import { geocodeCoordinates } from "@/lib/cip/geography-engine";
import { directReadStuckTargets, type DirectReadTrace } from "@/lib/cip/job-search-direct";
import { assessWorksite, type LocationAssessment } from "@/lib/cip/search-geography";

/**
 * Weekly job-search runs (Rethink §12, build step 3). Each run is an append-only record. A run
 * is executed as a series of bounded steps, one provider call each, advanced by separate
 * requests, so no single request has to outlive a serverless time limit and progress is visible.
 *
 * Guarantees implemented here:
 *  - idempotency: the same run key returns the same run, and only one run per user may be active
 *  - a per-user weekly run cap and per-run token/call/spend caps, checked before each provider call
 *  - a failed provider call is recorded as failed/partial, never as "no matches"
 *  - postings are stored with their verification state; nothing is deleted or silently dropped
 */

export type RunStatus = "queued" | "running" | "succeeded" | "partial" | "failed" | "not_configured" | "budget_limited";

export interface CoverageEntry {
  name: string;
  status: string;
  note: string;
  careersPageUrl: string | null;
  tier: SourceTier;
  step: number;
}

export interface TraceEntry {
  step: number;
  tier: SourceTier;
  actions: string[];
  postingsFound: number;
  rejected: Array<{ title: string; reason: string }>;
  incomplete: boolean;
  usage: RunUsage;
  error?: string;
  /** Employers whose job list the search could not read, so the app read it directly (fallback). */
  directReads?: DirectReadTrace[];
}

export interface RunRow {
  id: string;
  status: RunStatus;
  model: string;
  brief: SearchBrief | Record<string, never>;
  outbound_facets: OutboundSearchFacets | Record<string, never>;
  plan: SearchStep[];
  next_step: number;
  limits: Record<string, number>;
  trace: TraceEntry[];
  coverage: CoverageEntry[];
  usage: RunUsage | Record<string, never>;
  estimated_cost_usd: number | null;
  cost_basis: "estimated" | "unavailable";
  summary: string;
  error: string | null;
  started_at: string;
  finished_at: string | null;
  updated_at: string;
}

export interface ObservationRow {
  id: string;
  run_id: string;
  title: string;
  employer_text: string;
  worksite_text: string | null;
  source_url: string;
  requisition_id: string | null;
  posted_text: string | null;
  salary_text: string | null;
  remote_status: string;
  matched_role_term: string | null;
  source_tier: SourceTier;
  verification_state: string;
  verification_note: string | null;
  verification_checked_at: string | null;
  location_status: string | null;
  location_distance_miles: number | null;
  location_note: string | null;
  exclusion_hit: string | null;
  first_seen_at: string;
}

export interface RunView {
  run: RunRow;
  observations: ObservationRow[];
}

export interface RunDeps {
  config: JobSearchConfig;
  now?: () => string;
  /** Test seam: replaces live geocoding of the user's saved places. */
  areaResolver?: AreaResolver;
}

export type WorksiteGeocoder = (query: string) => Promise<{ latitude: number; longitude: number } | null>;

const MAX_WORKSITE_GEOCODES_PER_STEP = 10;
const GEOCODE_SPACING_MS = 1_100;

const RUN_COLUMNS =
  "id,status,model,brief,outbound_facets,plan,next_step,limits,trace,coverage,usage,estimated_cost_usd,cost_basis,summary,error,started_at,finished_at,updated_at";

const OBSERVATION_COLUMNS =
  "id,run_id,title,employer_text,worksite_text,source_url,requisition_id,posted_text,salary_text,remote_status,matched_role_term,source_tier,verification_state,verification_note,verification_checked_at,location_status,location_distance_miles,location_note,exclusion_hit,first_seen_at";

const ACTIVE: RunStatus[] = ["queued", "running"];

export type StartOutcome =
  | { kind: "started" | "reused" | "already_active"; runId: string }
  | { kind: "blocked"; runId: string; status: RunStatus; message: string };

export async function startJobSearchRun(
  supabase: SupabaseClient,
  userId: string,
  idempotencyKey: string,
  deps: RunDeps,
): Promise<StartOutcome> {
  const now = deps.now ?? (() => new Date().toISOString());
  const { config } = deps;

  // 1. A repeated click with the same key reuses the same run; it never starts another paid run.
  const { data: existing } = await supabase
    .from("job_search_runs")
    .select("id")
    .eq("user_id", userId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existing) return { kind: "reused", runId: existing.id };

  // 2. Only one active run per user. An active run with no progress for a while is abandoned.
  const { data: active } = await supabase
    .from("job_search_runs")
    .select("id,updated_at")
    .eq("user_id", userId)
    .in("status", ACTIVE)
    .maybeSingle();
  if (active) {
    const idleMs = Date.parse(now()) - Date.parse(active.updated_at);
    if (idleMs < config.limits.abandonedAfterMinutes * 60_000) return { kind: "already_active", runId: active.id };
    await supabase
      .from("job_search_runs")
      .update({
        status: "failed",
        error: `Abandoned: no progress for ${config.limits.abandonedAfterMinutes} minutes.`,
        finished_at: now(),
        updated_at: now(),
      })
      .eq("id", active.id)
      .eq("user_id", userId);
  }

  const shell = {
    user_id: userId,
    idempotency_key: idempotencyKey,
    provider: config.provider,
    model: config.model,
    limits: config.limits,
    started_at: now(),
    updated_at: now(),
  };

  // 3. Provider not configured: record it plainly, make no calls.
  if (!config.configured) {
    return recordBlocked(supabase, shell, "not_configured", "No search provider key is configured (OPENAI_API_KEY).", now);
  }

  // 4. Weekly cap (checked before any paid call, and before the slow brief build).
  const since = new Date(Date.parse(now()) - 7 * 86_400_000).toISOString();
  const { count } = await supabase
    .from("job_search_runs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("status", ["running", "succeeded", "partial", "failed"])
    .gt("next_step", 0) // only runs that actually made a provider call count toward the cap
    .gte("started_at", since);
  if ((count ?? 0) >= config.limits.maxRunsPerWeek) {
    return recordBlocked(
      supabase,
      shell,
      "budget_limited",
      `Weekly limit reached: ${config.limits.maxRunsPerWeek} searches in the last 7 days.`,
      now,
    );
  }

  // 5. Build the private brief, its outbound projection, and the step plan.
  const brief = await loadSearchBrief(supabase, userId, { now: now(), resolver: deps.areaResolver });
  const facets = toOutboundFacets(brief);
  const plan = planSearchSteps(facets, config.limits);
  if (!plan.length) {
    return recordBlocked(
      supabase,
      { ...shell, brief_override: { brief, facets } },
      "failed",
      "Nothing to search: save at least one place (or accept remote work) on Search preferences, or save target employers.",
      now,
    );
  }

  const { data: inserted, error } = await supabase
    .from("job_search_runs")
    .insert({
      ...shell,
      status: "running",
      brief_schema_version: brief.schemaVersion,
      brief_fingerprint: brief.fingerprint,
      brief,
      outbound_facets: facets,
      plan,
      next_step: 0,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    // A concurrent start can lose the race on the unique indexes; return the winner.
    const { data: winner } = await supabase
      .from("job_search_runs")
      .select("id")
      .eq("user_id", userId)
      .or(`idempotency_key.eq.${idempotencyKey},status.in.(queued,running)`)
      .limit(1)
      .maybeSingle();
    if (winner) return { kind: "already_active", runId: winner.id };
    throw new Error(error?.message ?? "Could not start the run.");
  }
  return { kind: "started", runId: inserted.id };
}

async function recordBlocked(
  supabase: SupabaseClient,
  shell: Record<string, unknown>,
  status: RunStatus,
  message: string,
  now: () => string,
): Promise<StartOutcome> {
  const { brief_override: override, ...row } = shell as Record<string, unknown> & {
    brief_override?: { brief: SearchBrief; facets: OutboundSearchFacets };
  };
  const { data, error } = await supabase
    .from("job_search_runs")
    .insert({
      ...row,
      status,
      brief_schema_version: override?.brief.schemaVersion ?? 0,
      brief_fingerprint: override?.brief.fingerprint ?? "none",
      brief: override?.brief ?? {},
      outbound_facets: override?.facets ?? {},
      error: message,
      summary: message,
      finished_at: now(),
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not record the run.");
  return { kind: "blocked", runId: data.id, status, message };
}

/**
 * Executes the next step of a running run. Safe to call repeatedly: a step is claimed with a
 * compare-and-set on `next_step`, so two overlapping calls cannot run the same paid step twice.
 */
export async function advanceJobSearchRun(
  supabase: SupabaseClient,
  userId: string,
  runId: string,
  deps: RunDeps & { provider: JobSearchProvider; fetcher?: PageFetcher; geocoder?: WorksiteGeocoder; geocodeSpacingMs?: number },
): Promise<RunView | null> {
  const now = deps.now ?? (() => new Date().toISOString());
  const { config, provider } = deps;

  const run = await loadRun(supabase, userId, runId);
  if (!run) return null;
  if (run.status !== "running") return loadRunView(supabase, userId, runId);

  const usedSoFar = normalizeUsage(run.usage);
  const step = run.plan[run.next_step];
  if (!step) return finalize(supabase, userId, run, { now, config, forcedStatus: null });

  const verdict = checkBudget(usedSoFar, run.next_step, config);
  if (!verdict.ok) {
    return finalize(supabase, userId, run, { now, config, forcedStatus: "budget_limited", note: `Stopped early: ${verdict.reason}.` });
  }

  // Claim the step (compare-and-set). If another call already claimed it, just report state.
  const { data: claimed } = await supabase
    .from("job_search_runs")
    .update({ next_step: run.next_step + 1, updated_at: now() })
    .eq("id", run.id)
    .eq("user_id", userId)
    .eq("status", "running")
    .eq("next_step", run.next_step)
    .select("id");
  if (!claimed?.length) return loadRunView(supabase, userId, runId);

  const facets = run.outbound_facets as OutboundSearchFacets;
  const request = buildStepRequest(step, facets, config);
  const result = await provider.runStep(request as unknown as Record<string, unknown>);

  if (!result.ok) {
    return failStep(supabase, userId, run, step, `Provider error ${result.status}: ${result.message.slice(0, 300)}`, EMPTY_USAGE, [], { now, config });
  }
  const parsed = parseStepPayload(result.payload);
  if (!parsed.ok) {
    return failStep(supabase, userId, run, step, parsed.error, parsed.usage, parsed.actions, { now, config });
  }

  // Merge with what earlier steps already stored, cap, then check location, exclusions, and the page itself.
  const existing = await loadObservations(supabase, userId, run.id);
  const existingKeys = existing.map((row) => ({ source_url: row.source_url, employer: row.employer_text, requisition_id: row.requisition_id, existing: true }));
  // Fallback: only for target employers whose job list the search reported it could not read.
  const direct =
    step.tier === "target_page"
      ? await directReadStuckTargets({
          entries: parsed.response.employers_checked,
          step,
          facets,
          config,
          provider,
          fetcher: deps.fetcher ?? safePageFetcher,
          usedSoFar: addUsage(usedSoFar, parsed.usage),
          alreadyReadHosts: new Set(run.trace.flatMap((entry) => entry.directReads ?? []).map((read) => read.host)),
        })
      : null;
  const candidates = [
    ...parsed.response.postings.map((posting) => ({ ...posting, tier: step.tier as SourceTier, existing: false })),
    ...(direct?.candidates ?? []).map((posting) => ({ ...posting, tier: posting.tier as SourceTier, existing: false })),
  ];
  const merged = dedupeWithinRun([...existingKeys, ...candidates.map((posting) => ({ ...posting, source_url: posting.source_url }))] as Array<{ source_url: string; employer: string; requisition_id: string | null; existing: boolean }>);
  const room = Math.max(0, config.limits.maxPostings - existing.length);
  const fresh = (merged.filter((item) => !item.existing) as unknown as typeof candidates).slice(0, room);

  const brief = run.brief as SearchBrief;
  const checkable = fresh.map((posting) => ({
    posting,
    exclusion: brief.exclusions ? violatesExclusions(brief, { employer: posting.employer, title: posting.title }) : null,
  }));
  const toVerify = checkable.filter((item) => !item.exclusion);
  const verified = await verifyPostings(
    toVerify.map((item) => ({
      title: item.posting.title,
      requisitionId: item.posting.requisition_id,
      sourceUrl: item.posting.source_url,
      statedDates: item.posting.posted_or_closing_date,
    })),
    config.limits.verifyConcurrency,
    deps.fetcher ?? safePageFetcher,
  );
  const verificationByPosting = new Map<unknown, VerificationResult>(toVerify.map((item, index) => [item.posting, verified[index]]));

  // Location: use the locality list when it matches; otherwise geocode the clean city/state the
  // search reported (never the free-text blob), one lookup at a time. Unresolvable stays unknown.
  const geocoder: WorksiteGeocoder = deps.geocoder ?? geocodeCoordinates;
  const spacing = deps.geocodeSpacingMs ?? GEOCODE_SPACING_MS;
  let geocodesUsed = 0;
  const locations = new Map<unknown, LocationAssessment | null>();
  for (const { posting } of checkable) {
    if (posting.remote_status === "remote") {
      locations.set(posting, null);
      continue;
    }
    const anchors = brief.anchors ?? [];
    const cleanText = posting.worksite_city && posting.worksite_state ? `${posting.worksite_city}, ${posting.worksite_state}` : posting.worksite_text;
    let assessed = assessWorksite(anchors, { locationText: cleanText });
    if ((assessed.status === "unknown" || assessed.status === "ambiguous") && anchors.length && posting.worksite_city && posting.worksite_state && geocodesUsed < MAX_WORKSITE_GEOCODES_PER_STEP) {
      if (geocodesUsed > 0 && spacing > 0) await new Promise((done) => setTimeout(done, spacing));
      geocodesUsed += 1;
      const point = await geocoder(`${posting.worksite_city}, ${posting.worksite_state}`).catch(() => null);
      if (point) assessed = assessWorksite(anchors, { latitude: point.latitude, longitude: point.longitude });
    }
    locations.set(posting, assessed);
  }

  const rows = checkable.map(({ posting, exclusion }) => {
    const location = locations.get(posting) ?? null;
    const verification = verificationByPosting.get(posting);
    return {
      user_id: userId,
      run_id: run.id,
      title: posting.title,
      employer_text: posting.employer,
      worksite_text: posting.worksite_text,
      source_url: posting.source_url,
      requisition_id: posting.requisition_id,
      posted_text: posting.posted_or_closing_date,
      salary_text: posting.salary_text,
      remote_status: posting.remote_status,
      matched_role_term: posting.matched_role_term || null,
      evidence_excerpt: posting.evidence_excerpt.slice(0, 1200) || null,
      source_tier: posting.tier,
      verification_state: verification?.state ?? "discovered_unverified",
      verification_note: verification?.note ?? (exclusion ? `Not checked: matches your exclusion (${exclusion}).` : null),
      verification_checked_at: verification?.checkedAt ?? null,
      location_status: location?.status ?? null,
      location_distance_miles: location?.distanceMiles ?? null,
      location_note: location?.note ?? null,
      exclusion_hit: exclusion,
    };
  });
  if (rows.length) {
    const { error } = await supabase.from("job_search_observations").insert(rows);
    if (error) {
      return failStep(supabase, userId, run, step, `Could not save results: ${error.message}`, parsed.usage, parsed.actions, { now, config });
    }
  }

  const usage = addUsage(addUsage(usedSoFar, parsed.usage), direct?.usage ?? EMPTY_USAGE);
  const cost = estimateCost(usage, config.pricing);
  const trace: TraceEntry = {
    step: step.index,
    tier: step.tier,
    actions: [...parsed.actions, ...(direct?.actions ?? [])],
    postingsFound: rows.length,
    rejected: parsed.rejected,
    incomplete: parsed.incomplete,
    usage: addUsage(parsed.usage, direct?.usage ?? EMPTY_USAGE),
    ...(direct?.reads.length ? { directReads: direct.reads } : {}),
  };
  const coverage: CoverageEntry[] = parsed.response.employers_checked.map((entry) => ({
    name: entry.name,
    status: entry.status,
    note: entry.note.slice(0, 500),
    careersPageUrl: entry.careers_page_url,
    tier: step.tier,
    step: step.index,
  }));
  for (const entry of direct?.coverage ?? []) {
    coverage.push({ name: entry.name, status: entry.status, note: entry.note.slice(0, 600), careersPageUrl: entry.careersPageUrl, tier: step.tier, step: step.index });
  }

  await supabase
    .from("job_search_runs")
    .update({
      usage,
      estimated_cost_usd: cost.usd,
      cost_basis: cost.basis,
      trace: [...run.trace, trace],
      coverage: [...run.coverage, ...coverage],
      updated_at: now(),
    })
    .eq("id", run.id)
    .eq("user_id", userId);

  const refreshed = await loadRun(supabase, userId, run.id);
  if (refreshed && refreshed.next_step >= refreshed.plan.length) {
    return finalize(supabase, userId, refreshed, { now, config, forcedStatus: null });
  }
  return loadRunView(supabase, userId, run.id);
}

async function failStep(
  supabase: SupabaseClient,
  userId: string,
  run: RunRow,
  step: SearchStep,
  error: string,
  usage: RunUsage,
  actions: string[],
  deps: { now: () => string; config: JobSearchConfig },
): Promise<RunView | null> {
  const total = addUsage(normalizeUsage(run.usage), usage);
  const cost = estimateCost(total, deps.config.pricing);
  const trace: TraceEntry = {
    step: step.index,
    tier: step.tier,
    actions,
    postingsFound: 0,
    rejected: [],
    incomplete: false,
    usage,
    error,
  };
  await supabase
    .from("job_search_runs")
    .update({
      usage: total,
      estimated_cost_usd: cost.usd,
      cost_basis: cost.basis,
      trace: [...run.trace, trace],
      updated_at: deps.now(),
    })
    .eq("id", run.id)
    .eq("user_id", userId);

  const refreshed = (await loadRun(supabase, userId, run.id)) ?? run;
  return finalize(supabase, userId, refreshed, { ...deps, forcedStatus: "failed_step", note: error });
}

async function finalize(
  supabase: SupabaseClient,
  userId: string,
  run: RunRow,
  options: { now: () => string; config: JobSearchConfig; forcedStatus: "budget_limited" | "failed_step" | null; note?: string },
): Promise<RunView | null> {
  const observations = await loadObservations(supabase, userId, run.id);
  const counts = countByState(observations);
  const hadFailure = run.trace.some((entry) => entry.error) || options.forcedStatus === "failed_step";
  const hadTruncation = run.trace.some((entry) => entry.incomplete);
  const stepsRun = run.trace.length;

  let status: RunStatus;
  if (options.forcedStatus === "budget_limited") status = "budget_limited";
  else if (hadFailure) status = stepsRun > run.trace.filter((entry) => entry.error).length || observations.length ? "partial" : "failed";
  else status = hadTruncation ? "partial" : "succeeded";

  const cost = estimateCost(normalizeUsage(run.usage), options.config.pricing);
  const directNames = [...new Set(run.trace.flatMap((entry) => entry.directReads ?? []).map((read) => read.employer))];
  const unreadNames = [...new Set(run.coverage.filter((entry) => entry.status === "direct_read_failed" || entry.status === "direct_read_unsupported").map((entry) => entry.name))];
  const summary = buildSummary({ status, observationsCount: observations.length, counts, stepsPlanned: run.plan.length, stepsRun, note: options.note, cost, directNames, unreadNames });

  await supabase
    .from("job_search_runs")
    .update({
      status,
      summary,
      error: hadFailure ? (options.note ?? run.trace.find((entry) => entry.error)?.error ?? null) : null,
      finished_at: options.now(),
      updated_at: options.now(),
    })
    .eq("id", run.id)
    .eq("user_id", userId);
  return loadRunView(supabase, userId, run.id);
}

export function isOutsideArea(item: { location_status?: string | null; remote_status?: string | null }) {
  return item.location_status === "outside" && item.remote_status !== "remote";
}

export function countByState(
  observations: Array<{ verification_state: string; exclusion_hit: string | null; location_status?: string | null; remote_status?: string | null }>,
) {
  const counts = { verified: 0, unverified: 0, closedOrGone: 0, unavailable: 0, excluded: 0, outside: 0 };
  for (const item of observations) {
    const closed = item.verification_state === "source_reports_closed" || item.verification_state === "no_longer_visible";
    if (item.exclusion_hit) counts.excluded += 1;
    else if (!closed && isOutsideArea(item)) counts.outside += 1;
    else if (item.verification_state === "verified_open") counts.verified += 1;
    else if (item.verification_state === "source_reports_closed" || item.verification_state === "no_longer_visible") counts.closedOrGone += 1;
    else if (item.verification_state === "verification_unavailable") counts.unavailable += 1;
    else counts.unverified += 1;
  }
  return counts;
}

export function buildSummary(input: {
  status: RunStatus;
  observationsCount: number;
  counts: ReturnType<typeof countByState>;
  stepsPlanned: number;
  stepsRun: number;
  note?: string;
  cost: { usd: number | null; basis: "estimated" | "unavailable" };
  directNames?: string[];
  unreadNames?: string[];
}) {
  const { counts } = input;
  const found = input.observationsCount
    ? `${input.observationsCount} posting${input.observationsCount === 1 ? "" : "s"} found: ${counts.verified} verified open, ${counts.unverified + counts.unavailable} not yet verifiable, ${counts.closedOrGone} closed or gone${counts.outside ? `, ${counts.outside} outside your places` : ""}${counts.excluded ? `, ${counts.excluded} excluded by your rules` : ""}.`
    : input.status === "succeeded"
      ? "The search completed and found no matching postings in the places it could read."
      : "No postings were found.";
  const coverage = `Ran ${input.stepsRun} of ${input.stepsPlanned} search steps.`;
  const cost = input.cost.usd === null ? "Cost is not estimated (pricing not configured)." : `Estimated cost about $${input.cost.usd.toFixed(2)}.`;
  const lead =
    input.status === "failed"
      ? "The search failed, so this says nothing about whether openings exist."
      : input.status === "partial"
        ? "The search was only partly completed; missing coverage is not the same as no openings."
        : input.status === "budget_limited"
          ? "The search stopped at a limit; results below are partial."
          : "";
  const direct = input.directNames?.length
    ? `For ${input.directNames.join(", ")}, the search could not read the job list, so the app read the employer's own public job list directly.`
    : "";
  const unread = input.unreadNames?.length ? `Could not read the job list for ${input.unreadNames.join(", ")}; please check ${input.unreadNames.length === 1 ? "it" : "them"} by hand.` : "";
  return [lead, found, coverage, direct, unread, input.note, cost].filter(Boolean).join(" ");
}

function normalizeUsage(value: RunRow["usage"]): RunUsage {
  const usage = value as Partial<RunUsage>;
  return {
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    reasoningTokens: usage.reasoningTokens ?? 0,
    webSearchCalls: usage.webSearchCalls ?? 0,
  };
}

export async function loadRun(supabase: SupabaseClient, userId: string, runId: string): Promise<RunRow | null> {
  const { data } = await supabase.from("job_search_runs").select(RUN_COLUMNS).eq("id", runId).eq("user_id", userId).maybeSingle();
  return (data as RunRow | null) ?? null;
}

export async function loadObservations(supabase: SupabaseClient, userId: string, runId: string): Promise<ObservationRow[]> {
  const { data } = await supabase
    .from("job_search_observations")
    .select(OBSERVATION_COLUMNS)
    .eq("run_id", runId)
    .eq("user_id", userId)
    .order("first_seen_at", { ascending: true });
  return (data ?? []) as ObservationRow[];
}

export async function loadRunView(supabase: SupabaseClient, userId: string, runId: string): Promise<RunView | null> {
  const run = await loadRun(supabase, userId, runId);
  if (!run) return null;
  return { run, observations: await loadObservations(supabase, userId, runId) };
}

export async function loadLatestRunView(supabase: SupabaseClient, userId: string): Promise<RunView | null> {
  const { data } = await supabase
    .from("job_search_runs")
    .select("id")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? loadRunView(supabase, userId, data.id) : null;
}

export interface VerifiedPostingSummary {
  title: string;
  employer: string;
  sourceUrl: string;
  verifiedAt: string | null;
}

/**
 * The postings from the latest run that actually searched (succeeded or partial) which were
 * verified open on their source page, are not excluded, and are not outside the user's places
 * (remote roles count). This is what the briefing and the career report summarize, replacing
 * the retired board-era `opportunity_matches`.
 */
export async function loadLatestVerifiedPostings(
  supabase: SupabaseClient,
  userId: string,
  limit = 10,
): Promise<{ runId: string | null; finishedAt: string | null; count: number; postings: VerifiedPostingSummary[] }> {
  const { data: run } = await supabase
    .from("job_search_runs")
    .select("id,finished_at")
    .eq("user_id", userId)
    .in("status", ["succeeded", "partial"])
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!run) return { runId: null, finishedAt: null, count: 0, postings: [] };

  const rows = await loadObservations(supabase, userId, run.id);
  const local = rows.filter((row) => row.verification_state === "verified_open" && !row.exclusion_hit && !isOutsideArea(row));
  return {
    runId: run.id,
    finishedAt: run.finished_at,
    count: local.length,
    postings: local.slice(0, limit).map((row) => ({
      title: row.title,
      employer: row.employer_text,
      sourceUrl: row.source_url,
      verifiedAt: row.verification_checked_at,
    })),
  };
}

/** Last run that actually searched (succeeded or partial) and when the next is due. */
export async function loadDueState(
  supabase: SupabaseClient,
  userId: string,
  config: Pick<JobSearchConfig, "limits">,
  now: string,
) {
  const { data } = await supabase
    .from("job_search_runs")
    .select("finished_at")
    .eq("user_id", userId)
    .in("status", ["succeeded", "partial"])
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return computeDueState(data?.finished_at ?? null, config.limits.dueAfterDays, now);
}

export function computeDueState(lastFinishedAt: string | null, dueAfterDays: number, now: string) {
  if (!lastFinishedAt) return { lastRunAt: null, dueAt: null, due: true };
  const dueAt = new Date(Date.parse(lastFinishedAt) + dueAfterDays * 86_400_000).toISOString();
  return { lastRunAt: lastFinishedAt, dueAt, due: Date.parse(now) >= Date.parse(dueAt) };
}

