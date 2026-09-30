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
  normalizeUrl,
  parseStepPayload,
  planSearchSteps,
  type JobSearchProvider,
  type SearchStep,
  type SourceTier,
} from "@/lib/cip/job-search-engine";
import { verifyPostings, type PageFetcher, type VerificationResult, safePageFetcher } from "@/lib/cip/job-verifier";
import { toOutboundFacets, violatesExclusions, type OutboundSearchFacets, type SearchBrief } from "@/lib/cip/search-brief";
import { geocodeCoordinates } from "@/lib/cip/geography-engine";
import {
  directReadKnownTargets,
  directReadStuckTargets,
  type DirectReadOutcome,
  type DirectReadTrace,
} from "@/lib/cip/job-search-direct";
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
  /** True when this row was re-verified and carried forward from an earlier run (build step 4). */
  carried_forward: boolean;
}

export interface RunView {
  run: RunRow;
  observations: ObservationRow[];
  /** What changed since the previous searched run; present only on a finished run with a prior run. */
  diff?: WeeklyDiff;
}

/** The weekly change readout (Rethink §10 / step 5): new, still-open, and newly-closed since last run. */
export interface WeeklyDiff {
  /** finished_at of the run this one is compared against; null when there is no prior run to compare. */
  previousRunAt: string | null;
  /** Postings not present in the previous run (matched by canonical URL or employer+requisition). */
  newCount: number;
  /** Postings present last run and still live (not closed/gone) this run. */
  returningCount: number;
  /** Postings that were live last run and are now closed/gone, or no longer listed at all. */
  closedCount: number;
  /** Raw source_urls of the "new" postings, so the view can badge exactly those cards. */
  newSourceUrls: Set<string>;
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
  "id,run_id,title,employer_text,worksite_text,source_url,requisition_id,posted_text,salary_text,remote_status,matched_role_term,source_tier,verification_state,verification_note,verification_checked_at,location_status,location_distance_miles,location_note,exclusion_hit,first_seen_at,carried_forward";

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

  // 4. Weekly cap (checked before any paid call, and before the slow brief build). A cap of 0 or
  //    less disables it (founder dev, via JOB_SEARCH_MAX_RUNS_PER_WEEK); per-run caps still apply.
  if (config.limits.maxRunsPerWeek > 0) {
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
  if (!step) return finalize(supabase, userId, run, { now, config, forcedStatus: null, fetcher: deps.fetcher ?? safePageFetcher });

  const verdict = checkBudget(usedSoFar, run.next_step, config);
  if (!verdict.ok) {
    return finalize(supabase, userId, run, { now, config, forcedStatus: "budget_limited", note: `Stopped early: ${verdict.reason}.`, fetcher: deps.fetcher ?? safePageFetcher });
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

  // On a target-page step, read saved targets' own boards directly: KNOWN-target reads for targets
  // with a stored, supported listing URL (deterministic, every run), then the FALLBACK read for any
  // target the search reported it could not read. Both share `alreadyReadHosts` so a board is read
  // once; the general search still runs and dedupe collapses any overlap.
  let directCandidates: DirectReadOutcome["candidates"] = [];
  let directUsage: RunUsage = EMPTY_USAGE;
  let directActions: string[] = [];
  let directReads: DirectReadTrace[] = [];
  let directCoverage: DirectReadOutcome["coverage"] = [];
  if (step.tier === "target_page") {
    const fetcher = deps.fetcher ?? safePageFetcher;
    const alreadyReadHosts = new Set(run.trace.flatMap((entry) => entry.directReads ?? []).map((read) => read.host));
    const knownTargets = await loadTargetCareerUrls(supabase, userId, step.targets ?? []);
    const known = knownTargets.length
      ? await directReadKnownTargets({
          targets: knownTargets,
          step,
          facets,
          config,
          provider,
          fetcher,
          usedSoFar: addUsage(usedSoFar, parsed.usage),
          alreadyReadHosts,
        })
      : null;
    const stuck = await directReadStuckTargets({
      entries: parsed.response.employers_checked,
      step,
      facets,
      config,
      provider,
      fetcher,
      usedSoFar: addUsage(addUsage(usedSoFar, parsed.usage), known?.usage ?? EMPTY_USAGE),
      alreadyReadHosts,
    });
    directCandidates = [...(known?.candidates ?? []), ...stuck.candidates];
    directUsage = addUsage(known?.usage ?? EMPTY_USAGE, stuck.usage);
    directActions = [...(known?.actions ?? []), ...stuck.actions];
    directReads = [...(known?.reads ?? []), ...stuck.reads];
    directCoverage = [...(known?.coverage ?? []), ...stuck.coverage];
  }
  const candidates = [
    ...parsed.response.postings.map((posting) => ({ ...posting, tier: step.tier as SourceTier, existing: false })),
    ...directCandidates.map((posting) => ({ ...posting, tier: posting.tier as SourceTier, existing: false })),
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

  const usage = addUsage(addUsage(usedSoFar, parsed.usage), directUsage);
  const cost = estimateCost(usage, config.pricing);
  const trace: TraceEntry = {
    step: step.index,
    tier: step.tier,
    actions: [...parsed.actions, ...directActions],
    postingsFound: rows.length,
    rejected: parsed.rejected,
    incomplete: parsed.incomplete,
    usage: addUsage(parsed.usage, directUsage),
    ...(directReads.length ? { directReads } : {}),
  };
  const coverage: CoverageEntry[] = parsed.response.employers_checked.map((entry) => ({
    name: entry.name,
    status: entry.status,
    note: entry.note.slice(0, 500),
    careersPageUrl: entry.careers_page_url,
    tier: step.tier,
    step: step.index,
  }));
  for (const entry of directCoverage) {
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
    return finalize(supabase, userId, refreshed, { now, config, forcedStatus: null, fetcher: deps.fetcher ?? safePageFetcher });
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
  options: { now: () => string; config: JobSearchConfig; forcedStatus: "budget_limited" | "failed_step" | null; note?: string; fetcher?: PageFetcher },
): Promise<RunView | null> {
  // Persistence (build step 4): re-verify still-live postings from the last run that this run did
  // not re-surface, and carry them forward so good finds do not vanish between runs (matters most
  // for web-search-only employers). Skipped on a hard failure, or when disabled/without a fetcher.
  if (options.forcedStatus !== "failed_step" && options.fetcher && options.config.limits.carryForwardMax > 0) {
    await carryForwardPriorPostings(supabase, userId, run.id, options.fetcher, options.config);
  }

  const observations = await loadObservations(supabase, userId, run.id);
  const counts = countByState(observations);
  const carriedCount = observations.filter((entry) => entry.carried_forward).length;
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
  const blockedNames = [...new Set(run.coverage.filter((entry) => entry.status === "direct_read_blocked").map((entry) => entry.name))];
  const summary = buildSummary({ status, observationsCount: observations.length, counts, stepsPlanned: run.plan.length, stepsRun, note: options.note, cost, directNames, unreadNames, blockedNames, carriedCount });

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
  /** Employers whose robots.txt asked automated readers not to access the job list. */
  blockedNames?: string[];
  /** Postings re-verified and carried forward from the previous run. */
  carriedCount?: number;
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
  const blocked = input.blockedNames?.length
    ? `${input.blockedNames.join(", ")} ${input.blockedNames.length === 1 ? "asks" : "ask"} automated readers not to access ${input.blockedNames.length === 1 ? "its" : "their"} job list${input.blockedNames.length === 1 ? "" : "s"} (robots.txt), so CIP could not read ${input.blockedNames.length === 1 ? "it" : "them"} directly; please check by hand.`
    : "";
  const carried = input.carriedCount
    ? `${input.carriedCount} posting${input.carriedCount === 1 ? " was" : "s were"} carried forward from your last search and re-checked.`
    : "";
  return [lead, found, carried, coverage, direct, unread, blocked, input.note, cost].filter(Boolean).join(" ");
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

/**
 * Stored careers/listing URLs for the named saved targets (watched employers first, then
 * candidates). Only targets that actually have a URL are returned; the deterministic known-target
 * reader tries each and silently skips any whose page is not a supported board.
 */
async function loadTargetCareerUrls(
  supabase: SupabaseClient,
  userId: string,
  names: string[],
): Promise<Array<{ name: string; url: string }>> {
  const wanted = [...new Set(names.map((name) => name.trim()).filter(Boolean))];
  if (!wanted.length) return [];
  const [{ data: watched }, { data: candidates }] = await Promise.all([
    supabase.from("watched_employers").select("name,careers_url").eq("user_id", userId).in("name", wanted),
    supabase.from("employer_candidates").select("name,careers_url").eq("user_id", userId).in("name", wanted),
  ]);
  const byName = new Map<string, string>();
  // Candidates first so watched employers win on a name collision.
  for (const row of [...(candidates ?? []), ...(watched ?? [])] as Array<{ name?: unknown; careers_url?: unknown }>) {
    const name = String(row.name ?? "").trim();
    const url = String(row.careers_url ?? "").trim();
    if (name && url) byName.set(name, url);
  }
  return [...byName].map(([name, url]) => ({ name, url }));
}

/**
 * Persistence (build step 4): re-verify still-live postings from the user's previous searched run
 * that this run did not re-surface, and insert them as observations on this run with their original
 * first_seen_at preserved. Re-verification is one page fetch per posting (no model call), bounded by
 * verifyConcurrency and carryForwardMax. A posting now closed/gone carries forward in that honest
 * state and is not carried again after that.
 */
async function carryForwardPriorPostings(
  supabase: SupabaseClient,
  userId: string,
  currentRunId: string,
  fetcher: PageFetcher,
  config: JobSearchConfig,
): Promise<void> {
  const { data: prev } = await supabase
    .from("job_search_runs")
    .select("id")
    .eq("user_id", userId)
    .in("status", ["succeeded", "partial", "budget_limited"])
    .neq("id", currentRunId)
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!prev) return;

  const [prior, current] = await Promise.all([
    loadObservations(supabase, userId, prev.id),
    loadObservations(supabase, userId, currentRunId),
  ]);

  // Keep only postings still worth carrying: not already known closed/gone, not excluded.
  const live = prior.filter(
    (row) => row.verification_state !== "source_reports_closed" && row.verification_state !== "no_longer_visible" && !row.exclusion_hit,
  );
  if (!live.length) return;

  // Skip anything this run already re-discovered, by canonical URL or by employer + requisition id.
  const seenUrls = new Set(current.map((row) => normalizeUrl(row.source_url)));
  const reqKey = (employer: string, req: string) => `${employer.toLowerCase()}|${req.toLowerCase()}`;
  const seenReqs = new Set(current.filter((row) => row.requisition_id).map((row) => reqKey(row.employer_text, row.requisition_id as string)));
  const toCarry = live
    .filter((row) => {
      if (seenUrls.has(normalizeUrl(row.source_url))) return false;
      if (row.requisition_id && seenReqs.has(reqKey(row.employer_text, row.requisition_id))) return false;
      return true;
    })
    .slice(0, config.limits.carryForwardMax);
  if (!toCarry.length) return;

  const results = await verifyPostings(
    toCarry.map((row) => ({ title: row.title, requisitionId: row.requisition_id, sourceUrl: row.source_url, statedDates: row.posted_text })),
    config.limits.verifyConcurrency,
    fetcher,
  );

  const rows = toCarry.map((row, index) => ({
    user_id: userId,
    run_id: currentRunId,
    title: row.title,
    employer_text: row.employer_text,
    worksite_text: row.worksite_text,
    source_url: row.source_url,
    requisition_id: row.requisition_id,
    posted_text: row.posted_text,
    salary_text: row.salary_text,
    remote_status: row.remote_status,
    matched_role_term: row.matched_role_term,
    source_tier: row.source_tier,
    verification_state: results[index].state,
    verification_note: `Carried forward from your last search and re-checked. ${results[index].note}`,
    verification_checked_at: results[index].checkedAt,
    location_status: row.location_status,
    location_distance_miles: row.location_distance_miles,
    location_note: row.location_note,
    exclusion_hit: row.exclusion_hit,
    first_seen_at: row.first_seen_at,
    carried_forward: true,
  }));
  await supabase.from("job_search_observations").insert(rows);
}

// A run whose results are worth diffing against: it actually searched and finished.
const SEARCHED_STATUSES: RunStatus[] = ["succeeded", "partial", "budget_limited"];

export function isClosedOrGone(row: { verification_state: string }): boolean {
  return row.verification_state === "source_reports_closed" || row.verification_state === "no_longer_visible";
}

function identityKeys(row: ObservationRow): { url: string; req: string | null } {
  return {
    url: normalizeUrl(row.source_url),
    req: row.requisition_id ? `${row.employer_text.toLowerCase()}|${row.requisition_id.toLowerCase()}` : null,
  };
}

/**
 * "What changed since your last search." Compares this run's shown postings against the previous
 * run's, by the same identity carry-forward uses (canonical URL or employer+requisition). New =
 * absent last run; returning = seen last run and still live; closed = was live last run and is now
 * closed/gone this run OR no longer listed at all. Excluded rows are not part of the change story.
 */
export function computeWeeklyDiff(
  current: ObservationRow[],
  previous: ObservationRow[],
  previousRunAt: string | null,
): WeeklyDiff {
  const cur = current.filter((row) => !row.exclusion_hit);
  const prev = previous.filter((row) => !row.exclusion_hit);
  const prevUrls = new Set(prev.map((row) => identityKeys(row).url));
  const prevReqs = new Set(prev.map((row) => identityKeys(row).req).filter((key): key is string => key !== null));
  const wasSeen = (row: ObservationRow) => {
    const { url, req } = identityKeys(row);
    return prevUrls.has(url) || (req !== null && prevReqs.has(req));
  };

  const newSourceUrls = new Set<string>();
  let newCount = 0;
  let returningCount = 0;
  let closedCount = 0;
  for (const row of cur) {
    if (wasSeen(row)) {
      if (isClosedOrGone(row)) closedCount += 1;
      else returningCount += 1;
    } else {
      newCount += 1;
      newSourceUrls.add(row.source_url);
    }
  }

  // Postings that were live last run but do not appear at all this run (carry-forward disabled or
  // over the cap): counted as no-longer-listed so the change total stays honest.
  const curUrls = new Set(cur.map((row) => identityKeys(row).url));
  const curReqs = new Set(cur.map((row) => identityKeys(row).req).filter((key): key is string => key !== null));
  for (const row of prev) {
    if (isClosedOrGone(row)) continue;
    const { url, req } = identityKeys(row);
    if (!curUrls.has(url) && !(req !== null && curReqs.has(req))) closedCount += 1;
  }

  return { previousRunAt, newCount, returningCount, closedCount, newSourceUrls };
}

// The most recent searched run before this one (used to diff "what changed").
async function loadPreviousSearchedRun(
  supabase: SupabaseClient,
  userId: string,
  currentRunId: string,
  currentFinishedAt: string | null,
): Promise<{ id: string; finished_at: string | null } | null> {
  let query = supabase
    .from("job_search_runs")
    .select("id,finished_at")
    .eq("user_id", userId)
    .in("status", SEARCHED_STATUSES)
    .neq("id", currentRunId)
    .order("finished_at", { ascending: false })
    .limit(1);
  if (currentFinishedAt) query = query.lt("finished_at", currentFinishedAt);
  const { data } = await query.maybeSingle();
  return (data as { id: string; finished_at: string | null } | null) ?? null;
}

export async function loadRunView(supabase: SupabaseClient, userId: string, runId: string): Promise<RunView | null> {
  const run = await loadRun(supabase, userId, runId);
  if (!run) return null;
  const observations = await loadObservations(supabase, userId, runId);
  const view: RunView = { run, observations };
  // Attach the weekly diff only for a finished, real search — never mid-run.
  if (SEARCHED_STATUSES.includes(run.status)) {
    const previous = await loadPreviousSearchedRun(supabase, userId, run.id, run.finished_at);
    if (previous) {
      const priorObservations = await loadObservations(supabase, userId, previous.id);
      view.diff = computeWeeklyDiff(observations, priorObservations, previous.finished_at);
    }
  }
  return view;
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

