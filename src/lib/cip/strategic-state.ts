import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdvisorAnalysis } from "@/lib/cip/advisor";
import { parseConversationOutcome, type ConversationOutcome } from "@/lib/cip/conversation-outcomes";
import {
  buildTargetLanes,
  parseAnalysisAdvisor,
  parseIntakeSource,
  type IntakeSource,
} from "@/lib/cip/resume-asset-context";

export interface StrategicLaneScore {
  lane: string;
  label: string;
  score: number;
  direction: "up" | "down" | "steady";
  reasons: string[];
  explanation: string;
}

export interface StrategicEmployerScore {
  name: string;
  region: string;
  source: "watched" | "candidate";
  score: number;
  direction: "up" | "down" | "steady";
  reasons: string[];
  explanation: string;
  nextMove: string;
}

export interface StrategicFollowUpObligation {
  contactName: string;
  relatedLane: string;
  relatedEmployer: string;
  promisedFollowUp: string;
  followUpDueDate: string;
  nextAction: string;
  urgency: "overdue" | "due_soon" | "scheduled" | "unscheduled";
  reasons: string[];
}

export interface StrategicResumeLaneRecommendation {
  lane: string;
  label: string;
  score: number;
  direction: "up" | "down" | "steady";
  reasons: string[];
  nextMove: string;
}

export interface StrategicState {
  generatedAt: string;
  lanes: StrategicLaneScore[];
  employers: StrategicEmployerScore[];
  employerCandidates: StrategicEmployerScore[];
  followUpObligations: StrategicFollowUpObligation[];
  resumeLaneRecommendation: StrategicResumeLaneRecommendation | null;
  deltas: string[];
  conversationOutcomeCount: number;
}

export interface WatchedEmployerLike {
  name: string;
  region?: string | null;
  priority?: string | null;
  fit_score?: number | null;
  fit_summary?: string | null;
  target_roles?: string[] | null;
  careers_url?: string | null;
}

export interface EmployerCandidateLike extends WatchedEmployerLike {
  review_state?: string | null;
  confidence?: string | null;
}

export interface NetworkAnalysisLike {
  laneValidations?: Array<{
    lane?: string;
    score?: number;
    status?: string;
    signals?: string[];
  }>;
}

export interface VerifiedPostingLike {
  title: string;
  employer: string;
  matchedRoleTerm?: string | null;
  tier?: string | null;
}

export interface StrategicStateInputs {
  latestSource?: IntakeSource | null;
  latestAdvisor?: Partial<AdvisorAnalysis> | null;
  conversationOutcomes?: ConversationOutcome[];
  watchedEmployers?: WatchedEmployerLike[];
  employerCandidates?: EmployerCandidateLike[];
  latestNetworkAnalysis?: NetworkAnalysisLike | null;
  /** Verified-open, non-excluded, in-area postings from the latest searched run (lane validation). */
  verifiedPostings?: VerifiedPostingLike[];
}

export async function loadStrategicState(
  supabase: SupabaseClient,
  userId: string,
): Promise<StrategicState> {
  return buildStrategicState(await loadStrategicInputs(supabase, userId));
}

/** The saved records the strategic state is built from; also reused by the search brief. */
export async function loadStrategicInputs(
  supabase: SupabaseClient,
  userId: string,
): Promise<StrategicStateInputs> {
  const [
    { data: intakeRow },
    { data: analysisRow },
    { data: structuredConversationRows },
    { data: conversationRows },
    { data: employerRows },
    { data: candidateRows },
    { data: networkRow },
  ] = await Promise.all([
    supabase
      .from("career_sources")
      .select("extracted_text")
      .eq("user_id", userId)
      .eq("source_type", "resume_intake")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("career_sources")
      .select("extracted_text")
      .eq("user_id", userId)
      .eq("source_type", "evidence_analysis")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("conversation_outcomes")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("career_sources")
      .select("extracted_text, created_at")
      .eq("user_id", userId)
      .eq("source_type", "conversation_outcome")
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("watched_employers")
      .select("name,region,priority,fit_score,fit_summary,target_roles,careers_url")
      .eq("user_id", userId)
      .order("fit_score", { ascending: false }),
    supabase
      .from("employer_candidates")
      .select("name,region,priority,fit_score,fit_summary,target_roles,careers_url,review_state,confidence")
      .eq("user_id", userId)
      .neq("review_state", "promoted")
      .order("fit_score", { ascending: false })
      .limit(30),
    supabase
      .from("career_sources")
      .select("extracted_text")
      .eq("user_id", userId)
      .eq("source_type", "network_analysis")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const latestSource = parseIntakeSource(intakeRow?.extracted_text ?? null);
  const latestAdvisor = parseAnalysisAdvisor(analysisRow?.extracted_text ?? null) ?? latestSource?.advisor ?? null;
  const conversationOutcomes = dedupeConversationOutcomes([
    ...(structuredConversationRows ?? [])
      .map((row) => parseStructuredConversationRow(row))
      .filter(Boolean) as ConversationOutcome[],
    ...(conversationRows ?? [])
      .map((row) => parseSavedConversation(row.extracted_text, row.created_at))
      .filter(Boolean) as ConversationOutcome[],
  ]);

  return {
    latestSource,
    latestAdvisor,
    conversationOutcomes,
    watchedEmployers: (employerRows ?? []) as WatchedEmployerLike[],
    employerCandidates: (candidateRows ?? []) as EmployerCandidateLike[],
    latestNetworkAnalysis: parseNetworkAnalysis(networkRow?.extracted_text ?? null),
    verifiedPostings: await loadVerifiedPostingsForLanes(supabase, userId),
  };
}

// The latest searched run's verified-open postings that count as lane validation: not excluded and
// not outside the user's places (remote counts). Self-contained here to avoid importing the job-search
// module (which depends on the search brief, which depends on this file).
async function loadVerifiedPostingsForLanes(supabase: SupabaseClient, userId: string): Promise<VerifiedPostingLike[]> {
  const { data: run } = await supabase
    .from("job_search_runs")
    .select("id")
    .eq("user_id", userId)
    .in("status", ["succeeded", "partial"])
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!run) return [];
  const { data } = await supabase
    .from("job_search_observations")
    .select("title,employer_text,matched_role_term,source_tier,verification_state,exclusion_hit,location_status,remote_status")
    .eq("run_id", (run as { id: string }).id)
    .eq("user_id", userId);
  return ((data ?? []) as Array<Record<string, string | null>>)
    .filter(
      (row) =>
        row.verification_state === "verified_open" &&
        !row.exclusion_hit &&
        !(row.location_status === "outside" && row.remote_status !== "remote"),
    )
    .map((row) => ({ title: row.title ?? "", employer: row.employer_text ?? "", matchedRoleTerm: row.matched_role_term, tier: row.source_tier }));
}

export function buildStrategicState(inputs: StrategicStateInputs): StrategicState {
  const lanes = scoreLanes(inputs);
  const employers = scoreEmployers(inputs);
  const employerCandidates = scoreEmployerCandidates(inputs);
  const followUpObligations = buildFollowUpObligations(inputs.conversationOutcomes ?? []);
  const resumeLaneRecommendation = buildResumeLaneRecommendation(lanes);
  const deltas = [
    ...lanes
      .filter((lane) => lane.direction !== "steady")
      .slice(0, 4)
      .map((lane) => `${lane.label}: ${lane.lane} moved ${lane.direction} to ${lane.score}. ${lane.explanation}`.trim()),
    ...employers
      .filter((employer) => employer.direction !== "steady")
      .slice(0, 4)
      .map((employer) => `${employer.name} moved ${employer.direction} to ${employer.score}. ${employer.explanation}`.trim()),
    ...employerCandidates
      .filter((candidate) => candidate.direction !== "steady")
      .slice(0, 4)
      .map((candidate) => `Candidate ${candidate.name} moved ${candidate.direction} to ${candidate.score}. ${candidate.explanation}`.trim()),
    ...followUpObligations
      .filter((obligation) => obligation.urgency === "overdue" || obligation.urgency === "due_soon")
      .slice(0, 3)
      .map((obligation) => `Follow-up due: ${obligation.contactName}. ${obligation.nextAction || obligation.promisedFollowUp}`.trim()),
  ];

  return {
    generatedAt: new Date().toISOString(),
    lanes,
    employers,
    employerCandidates,
    followUpObligations,
    resumeLaneRecommendation,
    deltas,
    conversationOutcomeCount: inputs.conversationOutcomes?.length ?? 0,
  };
}

export function scoreLanes(inputs: StrategicStateInputs): StrategicLaneScore[] {
  const targetLanes = [
    ...buildTargetLanes(inputs.latestSource ?? null, inputs.latestAdvisor ?? null, { limit: 5 }),
    ...conversationOnlyLanes(inputs),
  ];
  const networkByLane = new Map(
    (inputs.latestNetworkAnalysis?.laneValidations ?? [])
      .filter((lane) => lane.lane)
      .map((lane) => [normalize(lane.lane ?? ""), lane]),
  );
  // Each verified posting validates the ONE lane its title fits best (not every lane that shares a
  // generic word), so a tech-exec role tagged loosely by the search can't leak into the ED lane.
  const postingByLane = assignPostingsToLanes(targetLanes, inputs.verifiedPostings ?? []);

  return targetLanes.map((lane, index): StrategicLaneScore => {
    const conversationResearchLane = lane.label === "Conversation research lane";
    const base = conversationResearchLane ? 42 : 74 - index * 8;
    let score = base;
    const reasons = [
      conversationResearchLane
        ? `Baseline for a conversation-only research lane: ${base}.`
        : `Baseline from current advisor lane order: ${base}.`,
    ];
    const network = bestMatch(lane.role, [...networkByLane.keys()]);
    if (network) {
      const networkLane = networkByLane.get(network);
      const networkScore = Number(networkLane?.score ?? 0);
      if (networkScore) {
        const adjustment = Math.round((networkScore - 50) / 5);
        score += adjustment;
        reasons.push(`Latest network analysis adjusted this lane by ${adjustment >= 0 ? "+" : ""}${adjustment}.`);
      }
    }

    for (const outcome of inputs.conversationOutcomes ?? []) {
      if (!matchesText(lane.role, outcome.relatedLane)) continue;
      const adjustment = conversationAdjustment(outcome);
      if (!adjustment) continue;
      score += adjustment;
      reasons.push(`${outcome.contactName}: ${outcome.signalDirection} ${outcome.signalType} (${adjustment >= 0 ? "+" : ""}${adjustment}).`);
    }

    // Gap A: the evidence re-analysis talks to the lanes. Strengthened/weakened changeLog deltas and
    // positioning phrases that match this lane adjust its score (bounded, reason-tagged). On their own
    // these can raise or lower the score but never exempt the research cap — résumé/analysis strength
    // alone does not promote a lane; that still needs a real external signal (below or a strong convo).
    const advisor = inputs.latestAdvisor ?? null;
    let strengthenedTotal = 0;
    for (const phrase of advisor?.changeLog?.strengthened ?? []) {
      if (strengthenedTotal >= 12 || !matchDeltaToLane(lane, phrase)) continue;
      const add = Math.min(8, 12 - strengthenedTotal);
      score += add;
      strengthenedTotal += add;
      reasons.push(`Evidence re-analysis strengthened this direction: ${trimPhrase(phrase)}`);
    }
    let weakenedTotal = 0;
    for (const phrase of advisor?.changeLog?.weakened ?? []) {
      if (weakenedTotal >= 12 || !matchDeltaToLane(lane, phrase)) continue;
      const sub = Math.min(8, 12 - weakenedTotal);
      score -= sub;
      weakenedTotal += sub;
      reasons.push(`Evidence re-analysis weakened this direction: ${trimPhrase(phrase)}`);
    }
    if ((advisor?.positioning ?? []).some((phrase) => matchDeltaToLane(lane, phrase))) {
      score += 4;
      reasons.push(`Current positioning names this direction.`);
    }

    // Gap B: verified-open postings from the latest search validate the lane. Each matching posting
    // adds a bounded boost AND exempts the lane from the research cap — the cap asks for "a real role,
    // employer, or current-work evidence," and a verified-open posting is exactly that.
    const matchingPostings = (inputs.verifiedPostings ?? []).filter((posting) => postingByLane.get(posting) === lane.role);
    if (matchingPostings.length) {
      score += Math.min(12, matchingPostings.length * 6);
      const sample = matchingPostings[0];
      reasons.push(
        `${matchingPostings.length} verified-open posting${matchingPostings.length === 1 ? "" : "s"} matched this lane (e.g. ${sample.title} at ${sample.employer}).`,
      );
    }
    const validatedByPosting = matchingPostings.length > 0;

    const cap = exploratoryLaneCap(lane, inputs.conversationOutcomes ?? []);
    if (cap && !validatedByPosting && score > cap) {
      score = cap;
      reasons.push(`Capped as research because current support is only a light new-target signal; needs a real role, employer, or current-work evidence before ranking higher.`);
    }

    const finalScore = clamp(score);
    return {
      lane: lane.role,
      label: lane.label,
      score: finalScore,
      direction: finalScore > base + 3 ? "up" : finalScore < base - 3 ? "down" : "steady",
      reasons: reasons.slice(0, 6),
      explanation: scoreExplanation(finalScore, reasons),
    };
  })
    .sort((a, b) => lanePriorityScore(b) - lanePriorityScore(a))
    .map((lane, index) => ({
      ...lane,
      label: rankedLaneLabel(lane, index),
    }));
}

function conversationOnlyLanes(inputs: StrategicStateInputs) {
  const existing = new Set(
    buildTargetLanes(inputs.latestSource ?? null, inputs.latestAdvisor ?? null, { limit: 5 })
      .map((lane) => normalize(lane.role)),
  );
  const seen = new Set<string>();
  return (inputs.conversationOutcomes ?? [])
    .filter((outcome) => outcome.relatedLane)
    .map((outcome) => ({
      label: "Conversation research lane",
      role: outcome.relatedLane,
      rationale: `${outcome.contactName} surfaced this as a lane or market signal.`,
      missing: "Needs evidence re-analysis before it becomes a resume or search priority.",
    }))
    .filter((lane) => {
      const key = normalize(lane.role);
      if (!key || existing.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
}

export function scoreEmployers(inputs: StrategicStateInputs): StrategicEmployerScore[] {
  return scoreEmployerLike(inputs.watchedEmployers ?? [], inputs.conversationOutcomes ?? [], "watched");
}

export function scoreEmployerCandidates(inputs: StrategicStateInputs): StrategicEmployerScore[] {
  const candidates = (inputs.employerCandidates ?? []).filter((candidate) => candidate.review_state !== "cleared");
  return scoreEmployerLike(candidates, inputs.conversationOutcomes ?? [], "candidate");
}

export function buildFollowUpObligations(outcomes: ConversationOutcome[]): StrategicFollowUpObligation[] {
  return outcomes
    .filter((outcome) => outcome.promisedFollowUp || outcome.followUpDueDate || outcome.nextAction || outcome.signalType === "follow_up_obligation")
    .map((outcome): StrategicFollowUpObligation => {
      const urgency = followUpUrgency(outcome.followUpDueDate);
      const reasons = [
        outcome.promisedFollowUp ? `Promised follow-up: ${outcome.promisedFollowUp}` : "",
        outcome.followUpDueDate ? `Due ${outcome.followUpDueDate}.` : "No due date captured yet.",
        outcome.relatedLane ? `Related lane: ${outcome.relatedLane}.` : "",
        outcome.relatedEmployer ? `Related employer: ${outcome.relatedEmployer}.` : "",
      ].filter(Boolean);
      return {
        contactName: outcome.contactName,
        relatedLane: outcome.relatedLane,
        relatedEmployer: outcome.relatedEmployer,
        promisedFollowUp: outcome.promisedFollowUp,
        followUpDueDate: outcome.followUpDueDate,
        nextAction: outcome.nextAction || outcome.promisedFollowUp || "Decide the next follow-up step.",
        urgency,
        reasons,
      };
    })
    .sort((a, b) => followUpSortValue(a) - followUpSortValue(b))
    .slice(0, 12);
}

export function buildResumeLaneRecommendation(lanes: StrategicLaneScore[]): StrategicResumeLaneRecommendation | null {
  const lane = lanes.find((item) => item.label !== "Conversation research lane") ?? lanes[0];
  if (!lane) return null;
  return {
    lane: lane.lane,
    label: lane.label,
    score: lane.score,
    direction: lane.direction,
    reasons: lane.reasons.slice(0, 4),
    nextMove: lane.direction === "down"
      ? "Recheck this lane before generating or refreshing the resume."
      : "Use this as the next resume variant to generate or refresh.",
  };
}

function scoreEmployerLike(
  employers: WatchedEmployerLike[],
  conversationOutcomes: ConversationOutcome[],
  source: "watched" | "candidate",
): StrategicEmployerScore[] {
  return employers.map((employer): StrategicEmployerScore => {
    const base = clamp(Number(employer.fit_score ?? 50));
    let score = base;
    const reasons = [`Baseline ${source === "watched" ? "watched-employer" : "employer-candidate"} fit score: ${base}.`];

    for (const outcome of conversationOutcomes) {
      const relatedEmployer = outcome.relatedEmployer || "";
      const employerMatch = matchesText(employer.name, relatedEmployer);
      const roleMatch = (employer.target_roles ?? []).some((role) => matchesText(role, outcome.relatedLane));
      if (!employerMatch && !roleMatch) continue;
      const adjustment = conversationAdjustment(outcome);
      if (!adjustment) continue;
      score += adjustment;
      const target = employerMatch ? "employer" : "target role";
      reasons.push(`${outcome.contactName}: ${target} signal ${outcome.signalDirection} (${adjustment >= 0 ? "+" : ""}${adjustment}).`);
    }

    const finalScore = clamp(score);
    return {
      name: employer.name,
      region: employer.region ?? "",
      source,
      score: finalScore,
      direction: finalScore > base + 3 ? "up" : finalScore < base - 3 ? "down" : "steady",
      reasons: reasons.slice(0, 5),
      explanation: scoreExplanation(finalScore, reasons),
      nextMove: nextEmployerMove(employer, finalScore),
    };
  }).sort((a, b) => b.score - a.score);
}

function parseSavedConversation(value: string | null, createdAt?: string | null) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    const outcome = parseConversationOutcome(parsed);
    return outcome ? { ...outcome, createdAt: outcome.createdAt ?? createdAt ?? undefined } : null;
  } catch {
    return null;
  }
}

function parseNetworkAnalysis(value: string | null): NetworkAnalysisLike | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed?.analysis ?? null;
  } catch {
    return null;
  }
}

function conversationAdjustment(outcome: ConversationOutcome) {
  const base = {
    strengthens: 12,
    weakens: -12,
    contradicts: -18,
    neutral: 0,
    unclear: 3,
  }[outcome.signalDirection] ?? 0;
  const confidence = {
    high: 1,
    medium: 0.5,
    low: 0.25,
  }[outcome.confidence] ?? 0.75;
  const typeWeight = outcome.signalType === "new_target" ? 0.75 : 1;
  return Math.round(base * confidence * typeWeight);
}

function exploratoryLaneCap(
  lane: ReturnType<typeof buildTargetLanes>[number],
  outcomes: ConversationOutcome[],
) {
  const matching = outcomes.filter((outcome) => matchesText(lane.role, outcome.relatedLane));
  const laneText = normalize([lane.role, lane.rationale, lane.missing].join(" "));
  const speculativeAdvisorLane = (
    lane.label !== "Primary lane" &&
    (
      /\bentrepreneur(ship|ial)?\b/.test(laneText) ||
      /\bworkforce development\b/.test(laneText) ||
      /\b(explor|possible|potential|prior|past|old|stale|fresh evidence|current posting|real posting|worth exploring|needs validation|needs evidence)\b/.test(laneText)
    )
  );

  const positive = matching.filter((outcome) => outcome.signalDirection === "strengthens");
  const strongSupport = matching.some((outcome) =>
    outcome.confidence === "high" ||
    outcome.signalType === "lane_fit" ||
    outcome.signalType === "employer_fit" ||
    outcome.signalType === "compensation" ||
    outcome.signalType === "hiring_process" ||
    outcome.relatedEmployer ||
    outcome.promisedFollowUp ||
    outcome.followUpDueDate,
  );
  const onlyLightNewTargets = positive.length > 0 && matching.every((outcome) =>
    (outcome.signalType === "new_target" || outcome.signalType === "market_signal") &&
    outcome.confidence !== "high",
  );

  if (onlyLightNewTargets && !strongSupport) return 54;
  if (speculativeAdvisorLane && !strongSupport) return 58;
  return null;
}

function rankedLaneLabel(lane: StrategicLaneScore, index: number) {
  if (lane.label === "Conversation research lane") return lane.label;
  if (index === 0) return "Primary lane";
  if (index === 1 && lane.score >= 70) return "Strong alternate";
  return "Research lane";
}

function lanePriorityScore(lane: StrategicLaneScore) {
  const text = normalize([lane.lane, lane.label, lane.explanation, ...lane.reasons].join(" "));
  const unsupportedExploratory =
    lane.score < 70 &&
    (
      text.includes("entrepreneur") ||
      text.includes("workforce development") ||
      text.includes("only a light new target signal") ||
      text.includes("needs a real role")
    );
  return unsupportedExploratory ? lane.score - 25 : lane.score;
}

function nextEmployerMove(employer: WatchedEmployerLike, score: number) {
  if (score >= 75 && employer.careers_url) return "Review current roles and prepare targeted outreach.";
  if (score >= 75) return "Find the careers page or a current hiring source.";
  if (score >= 60) return "Keep watching and look for one market-read contact.";
  return "Hold as context until stronger evidence appears.";
}

function parseStructuredConversationRow(value: unknown) {
  const outcome = parseConversationOutcome(value);
  return outcome ?? null;
}

function dedupeConversationOutcomes(outcomes: ConversationOutcome[]) {
  const seen = new Set<string>();
  return outcomes.filter((outcome) => {
    const key = [
      outcome.sourceRef,
      outcome.contactName,
      outcome.conversationDate,
      outcome.relatedLane,
      outcome.relatedEmployer,
    ].join("|").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function scoreExplanation(score: number, reasons: string[]) {
  const band = score >= 80
    ? "high-confidence"
    : score >= 65
      ? "promising"
      : score >= 50
        ? "watch"
        : "low-priority";
  const movement = reasons.length > 1
    ? reasons.slice(1, 3).join(" ")
    : reasons[0] ?? "";
  return `${band} score based on ${movement}`.trim();
}

function followUpUrgency(date: string): StrategicFollowUpObligation["urgency"] {
  if (!date) return "unscheduled";
  const today = new Date().toISOString().slice(0, 10);
  if (date < today) return "overdue";
  const days = Math.ceil((new Date(`${date}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000);
  return days <= 7 ? "due_soon" : "scheduled";
}

function followUpSortValue(obligation: StrategicFollowUpObligation) {
  const urgencyOrder = {
    overdue: 0,
    due_soon: 1,
    scheduled: 2,
    unscheduled: 3,
  }[obligation.urgency];
  const dateValue = obligation.followUpDueDate
    ? new Date(`${obligation.followUpDueDate}T00:00:00`).getTime()
    : Number.MAX_SAFE_INTEGER;
  return urgencyOrder * 10_000_000_000_000 + dateValue;
}

function bestMatch(value: string, candidates: string[]) {
  const normalized = normalize(value);
  return candidates.find((candidate) => normalized.includes(candidate) || candidate.includes(normalized)) ?? "";
}

function matchesText(left: string, right: string) {
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a) || sharedTokenCount(a, b) >= 2;
}

// A re-analysis delta / positioning phrase is about this lane when it shares enough language with the
// lane's role or its "why it fits" rationale.
// Generic rank/filler words that, shared alone, do NOT mean a re-analysis phrase is about a lane. A
// delta must share a DISTINCTIVE (domain) word with the lane's role or rationale — otherwise a long
// phrase about, say, "big tech roles where you're not the head" would bleed into a nonprofit lane
// just because both mention "roles" and "leadership".
const GENERIC_DELTA_TOKEN = new Set([
  "role", "roles", "leadership", "leader", "leaders", "experience", "success", "successful", "strategic",
  "strategy", "management", "managing", "manager", "organization", "organizations", "organizational",
  "director", "executive", "executives", "senior", "current", "recent", "evidence", "proven", "strong",
  "stronger", "weaker", "modern", "demonstrated", "similar", "potential", "expressed", "concerns", "concern",
  "support", "supported", "supports", "direction", "directions", "company", "companies", "user", "users",
  "where", "this", "that", "with", "head", "large", "well", "aligns", "align", "team", "teams", "work",
  "working", "worth", "level", "levels", "high", "highly", "good", "better", "best", "capacity", "capable",
  "suitable", "appropriate", "combines", "combined", "continue", "skills", "based", "positions", "position",
]);

function distinctiveTokens(text: string): Set<string> {
  return new Set(normalize(text).split(" ").filter((token) => token.length > 3 && !GENERIC_DELTA_TOKEN.has(token)));
}

function matchDeltaToLane(lane: { role: string; rationale?: string }, phrase: string) {
  if (!phrase?.trim()) return false;
  const laneTokens = distinctiveTokens(`${lane.role} ${lane.rationale ?? ""}`);
  if (!laneTokens.size) return false;
  for (const token of distinctiveTokens(phrase)) {
    if (laneTokens.has(token)) return true;
  }
  return false;
}

// Role-family synonyms: a posting title rarely shares a literal word with a lane's human name
// ("VP and Chief Information Officer" vs "Director of Media Innovation / CTO"). A lane is granted a
// family's equivalent titles ONLY when the lane's OWN text is in that family (so tech synonyms never
// attach to the nonprofit ED lane), and a posting validates a lane when its title contains one of
// those titles. This is what lets a real CIO/CTO/VP-Technology posting validate the tech-exec lane.
const ROLE_FAMILIES: Array<{ triggers: RegExp; titles: string[] }> = [
  {
    // Technology / digital executive.
    triggers: /\b(cto|cio|chief (technology|information|digital) officer|technology officer|information officer|director of (technology|it|information|digital)|head of (technology|digital|it)|it director|media innovation|digital innovation)\b/,
    titles: [
      "chief technology officer", "chief information officer", "chief digital officer", "chief innovation officer",
      "cto", "cio", "vp technology", "vp of technology", "vice president of technology", "vice president and chief",
      "director of technology", "director of information technology", "it director", "head of technology",
      "head of digital", "head of engineering", "vp of engineering", "technology officer", "information officer",
    ],
  },
  {
    // Nonprofit / organizational executive leadership.
    triggers: /\b(executive director|chief executive|\bceo\b|nonprofit leader|managing director)\b/,
    titles: ["executive director", "chief executive officer", "ceo", "president and ceo", "managing director"],
  },
  {
    // Education / workforce / teaching.
    triggers: /\b(teacher|educator|workforce|instructor|faculty|curriculum|teaching)\b/,
    titles: [
      "teacher", "instructor", "lecturer", "faculty", "director of education", "education director",
      "workforce development director", "training director", "program director",
    ],
  },
];

function laneSynonymTitles(laneRole: string): string[] {
  const text = normalize(laneRole);
  const titles: string[] = [];
  for (const family of ROLE_FAMILIES) if (family.triggers.test(text)) titles.push(...family.titles);
  return titles;
}

// How well a posting title fits a lane: a role-family synonym hit is strong (and decisive over token
// overlap); otherwise two or more shared significant title tokens. Below 2, no match.
function postingLaneScore(laneRole: string, synonymTitles: string[], normalizedTitle: string): number {
  if (synonymTitles.some((title) => normalizedTitle.includes(title))) return 100;
  return sharedTokenCount(normalizedTitle, normalize(laneRole));
}

// Assign each verified posting to the single lane its TITLE fits best (by synonym, else ≥2 shared
// tokens). Title-based on purpose: `matched_role_term` is the search's loose tag (a CIO can be tagged
// "executive director"), so using it leaks tech-exec roles into the ED lane.
function assignPostingsToLanes(lanes: Array<{ role: string }>, postings: VerifiedPostingLike[]) {
  const synonymsByLane = new Map(lanes.map((lane) => [lane.role, laneSynonymTitles(lane.role)]));
  const assignment = new Map<VerifiedPostingLike, string>();
  for (const posting of postings) {
    const title = normalize(posting.title);
    let bestLane: string | null = null;
    let bestScore = 1; // require a synonym hit or at least 2 shared tokens
    for (const lane of lanes) {
      const score = postingLaneScore(lane.role, synonymsByLane.get(lane.role) ?? [], title);
      if (score > bestScore) {
        bestScore = score;
        bestLane = lane.role; // ties keep the earlier (higher-priority) lane
      }
    }
    if (bestLane) assignment.set(posting, bestLane);
  }
  return assignment;
}

function trimPhrase(phrase: string) {
  const text = phrase.trim();
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

function sharedTokenCount(a: string, b: string) {
  const left = new Set(a.split(" ").filter((token) => token.length > 3));
  return b.split(" ").filter((token) => left.has(token)).length;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}
