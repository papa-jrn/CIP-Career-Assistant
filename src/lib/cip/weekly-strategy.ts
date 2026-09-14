import type { SupabaseClient } from "@supabase/supabase-js";
import { loadStrategicState, type StrategicState } from "@/lib/cip/strategic-state";

type SnapshotRow = {
  week_start: string;
  summary: string;
  next_actions: string[];
  evidence: Array<Record<string, unknown>>;
  created_at?: string;
};

type SnapshotStrategicEvidence = {
  type: "strategic_state";
  conversation_outcome_count?: number;
  lane_scores?: Array<{ lane: string; label: string; score: number; direction: string; reasons?: string[]; explanation?: string }>;
  employer_scores?: Array<{ name: string; score: number; direction: string; reasons?: string[]; explanation?: string; nextMove?: string; next_move?: string }>;
  employer_candidate_scores?: Array<{ name: string; score: number; direction: string; reasons?: string[]; explanation?: string; nextMove?: string; next_move?: string }>;
  follow_up_obligations?: Array<{ contactName: string; nextAction: string; promisedFollowUp: string; followUpDueDate: string; urgency: string }>;
  resume_lane_recommendation?: { lane: string; label: string; score: number; direction: string; nextMove: string } | null;
  deltas?: string[];
};

export type BriefingDiff = {
  type: "briefing_diff";
  baseline: boolean;
  priorWeekStart: string | null;
  periodCovered: string;
  periodLabel: string;
  changeSummary: string;
  changed: string[];
  laneStrengthened: string[];
  laneWeakened: string[];
  employerMovedUp: string[];
  employerMovedDown: string[];
  contactsNeedingFollowUp: string[];
  overduePromises: string[];
  staleAssumptions: string[];
  displayChanged: string[];
  displayAssumptions: string[];
  assetChangesNeeded: string[];
  evidenceGaps: string[];
  jobEmployerChecks: string[];
  recommendedActions: string[];
};

export async function buildWeeklyStrategySnapshot(
  supabase: SupabaseClient,
  userId: string,
) {
  const weekStart = startOfWeek(new Date());
  const [{ data: employers }, { data: matches }, { data: previousSnapshots }, strategicState] = await Promise.all([
    supabase
      .from("watched_employers")
      .select("name,region,priority,fit_score,adapter_status,target_roles,careers_url")
      .eq("user_id", userId)
      .order("fit_score", { ascending: false }),
    supabase
      .from("opportunity_matches")
      .select("match_score,confidence,opportunities(title,company,source_url)")
      .eq("user_id", userId)
      .order("match_score", { ascending: false })
      .limit(10),
    supabase
      .from("career_strategy_snapshots")
      .select("week_start,summary,next_actions,evidence,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(3),
    loadStrategicState(supabase, userId),
  ]);

  const watched = employers ?? [];
  const opportunityMatches = matches ?? [];
  const previousSnapshot = ((previousSnapshots ?? []) as SnapshotRow[]).find((snapshot) => snapshot.week_start !== weekStart)
    ?? ((previousSnapshots ?? []) as SnapshotRow[])[0]
    ?? null;
  const topEmployers = strategicState.employers.length
    ? strategicState.employers.slice(0, 5)
    : watched.slice(0, 5);
  const adapterBacklog = watched.filter((employer) => employer.adapter_status !== "supported").slice(0, 5);
  const regionFocus = [...new Set(watched.map((employer) => employer.region).filter(Boolean))];
  const topLane = strategicState.lanes[0];
  const movedLane = strategicState.lanes.find((lane) => lane.direction !== "steady");
  const movedEmployer = strategicState.employers.find((employer) => employer.direction !== "steady");
  const movedCandidate = strategicState.employerCandidates.find((candidate) => candidate.direction !== "steady");
  const urgentFollowUp = strategicState.followUpObligations.find((obligation) => obligation.urgency === "overdue" || obligation.urgency === "due_soon");
  const resumeLane = strategicState.resumeLaneRecommendation;
  const briefingDiff = buildBriefingDiff(strategicState, previousSnapshot, {
    watchedEmployerCount: watched.length,
    opportunityMatchCount: opportunityMatches.length,
    regionFocus,
    adapterBacklogNames: adapterBacklog.map((employer) => employer.name),
  });

  const nextActions = [
    ...briefingDiff.recommendedActions,
    movedLane
      ? `Respond to the lane movement: ${movedLane.lane} moved ${movedLane.direction}. ${movedLane.reasons[0] ?? ""}`
      : topLane
        ? `Keep testing the strongest lane: ${topLane.lane}.`
        : "Run evidence analysis to establish target lanes.",
    movedEmployer
      ? `Review ${movedEmployer.name}: it moved ${movedEmployer.direction}. ${movedEmployer.nextMove}`
      : topEmployers.length
        ? `Review career pages for ${topEmployers.slice(0, 3).map((employer) => employer.name).join(", ")}.`
      : "Build a watched-employer map from the Employers page.",
    movedCandidate
      ? `Re-rank employer candidate ${movedCandidate.name}: it moved ${movedCandidate.direction}. ${movedCandidate.nextMove}`
      : strategicState.employerCandidates.length
        ? `Review top employer candidate ${strategicState.employerCandidates[0].name} for promotion.`
        : "Run employer discovery to build the next candidate queue.",
    urgentFollowUp
      ? `Follow up with ${urgentFollowUp.contactName}: ${urgentFollowUp.nextAction}`
      : strategicState.followUpObligations.length
        ? `Schedule follow-up timing for ${strategicState.followUpObligations[0].contactName}.`
        : "Capture promised follow-ups after meaningful conversations.",
    resumeLane
      ? `Resume lane to work next: ${resumeLane.lane}. ${resumeLane.nextMove}`
      : "Run evidence analysis before refreshing career assets.",
    adapterBacklog.length
      ? `Prioritize adapters or manual review for ${adapterBacklog.slice(0, 3).map((employer) => employer.name).join(", ")}.`
      : "Keep supported employer feeds fresh and watch for new matches.",
    opportunityMatches.length
      ? "Compare top opportunity matches against resume proof gaps before applying."
      : "Run labor-market research after watched employers are seeded.",
    "Turn one strong employer-role pair into a targeted networking or portfolio action.",
  ].filter((action, index, actions) => actions.indexOf(action) === index).slice(0, 5);

  const summary = briefingDiff.changed.length
    ? briefingDiff.changeSummary
    : watched.length
      ? `No major strategy movement since the last briefing. Keep the week focused on ${watched.length} watched employers across ${regionFocus.map(formatRegion).join(", ")} with ${opportunityMatches.length} ranked opportunity matches.`
      : "No major strategy movement yet. Start by creating a trusted employer map before searching for individual roles.";

  const evidence = [
    briefingDiff,
    {
      type: "strategic_state",
      generated_at: strategicState.generatedAt,
      conversation_outcome_count: strategicState.conversationOutcomeCount,
      lane_scores: strategicState.lanes,
      employer_scores: strategicState.employers.slice(0, 8),
      employer_candidate_scores: strategicState.employerCandidates.slice(0, 8),
      follow_up_obligations: strategicState.followUpObligations,
      resume_lane_recommendation: strategicState.resumeLaneRecommendation,
      deltas: strategicState.deltas,
    },
    ...topEmployers.map((employer) => ({
      type: "propagated_employer",
      name: employer.name,
      score: "score" in employer ? employer.score : employer.fit_score,
      direction: "direction" in employer ? employer.direction : "steady",
      reasons: "reasons" in employer ? employer.reasons : [],
      next_move: "nextMove" in employer ? employer.nextMove : employer.careers_url,
    })),
    ...opportunityMatches.map((match) => ({
      type: "opportunity_match",
      match_score: match.match_score,
      confidence: match.confidence,
      opportunity: match.opportunities,
    })),
  ];

  const { error } = await supabase.from("career_strategy_snapshots").upsert(
    {
      user_id: userId,
      week_start: weekStart,
      region_focus: regionFocus,
      watched_employer_count: watched.length,
      opportunity_match_count: opportunityMatches.length,
      summary,
      next_actions: nextActions,
      evidence,
    },
    { onConflict: "user_id,week_start" },
  );

  return { error, summary, nextActions };
}

export function buildBriefingDiff(
  strategicState: StrategicState,
  previousSnapshot: SnapshotRow | null,
  context: {
    watchedEmployerCount: number;
    opportunityMatchCount: number;
    regionFocus: string[];
    adapterBacklogNames: string[];
  },
): BriefingDiff {
  const previous = previousSnapshot ? extractStrategicState(previousSnapshot.evidence) : null;
  const baseline = !previous;
  const changed: string[] = [];
  const laneStrengthened = compareScores(
    strategicState.lanes,
    previous?.lane_scores,
    (item) => item.lane,
    (item) => item.lane,
    (item, diff) => `${item.lane} rose ${diff >= 0 ? "+" : ""}${diff} to ${item.score}. ${item.explanation}`,
    "up",
  );
  const laneWeakened = compareScores(
    strategicState.lanes,
    previous?.lane_scores,
    (item) => item.lane,
    (item) => item.lane,
    (item, diff) => `${item.lane} fell ${diff} to ${item.score}. ${item.explanation}`,
    "down",
  );
  const employerMovedUp = compareScores(
    strategicState.employers,
    previous?.employer_scores,
    (item) => item.name,
    (item) => item.name,
    (item, diff) => `${item.name} moved up ${diff >= 0 ? "+" : ""}${diff} to ${item.score}. ${item.nextMove}`,
    "up",
  );
  const employerMovedDown = compareScores(
    strategicState.employers,
    previous?.employer_scores,
    (item) => item.name,
    (item) => item.name,
    (item, diff) => `${item.name} moved down ${diff} to ${item.score}. ${item.nextMove}`,
    "down",
  );
  // A lane or employer with no prior score is not "movement" — compareScores skips
  // it — but its first appearance is exactly what a weekly briefing should mention.
  const laneAppeared = findNewEntries(
    strategicState.lanes,
    previous?.lane_scores,
    (item) => item.lane,
    (item) => item.lane,
    (item) => `${item.lane} is new since the last briefing at ${item.score}. ${item.explanation}`,
  ).slice(0, 3);
  const employerAppeared = findNewEntries(
    strategicState.employers,
    previous?.employer_scores,
    (item) => item.name,
    (item) => item.name,
    (item) => `${item.name} is new since the last briefing at ${item.score}. ${item.nextMove}`,
  ).slice(0, 3);
  const contactsNeedingFollowUp = strategicState.followUpObligations
    .filter((obligation) => obligation.urgency === "due_soon" || obligation.urgency === "overdue")
    .map((obligation) => `${obligation.contactName}: ${obligation.nextAction || obligation.promisedFollowUp}`)
    .slice(0, 5);
  const overduePromises = strategicState.followUpObligations
    .filter((obligation) => obligation.urgency === "overdue")
    .map((obligation) => `${obligation.contactName}: ${obligation.promisedFollowUp || obligation.nextAction}`)
    .slice(0, 5);
  const staleAssumptions = strategicState.lanes
    .filter((lane) => lane.label === "Research lane" || lane.score < 60)
    .map((lane) => researchAssumptionText(lane.lane, lane.explanation))
    .slice(0, 4);
  const assetChangesNeeded = strategicState.resumeLaneRecommendation
    ? [`Refresh or review assets for ${strategicState.resumeLaneRecommendation.lane}: ${strategicState.resumeLaneRecommendation.nextMove}`]
    : ["Run evidence analysis before refreshing resume or outreach assets."];
  const evidenceGaps = strategicState.lanes
    .flatMap((lane) => lane.reasons.filter((reason) => /needs|capped|proof|evidence|posting/i.test(reason)).map((reason) => `${lane.lane}: ${humanizeSignalPhrases(reason)}`))
    .slice(0, 4);
  const jobEmployerChecks = [
    strategicState.employerCandidates[0] ? `Decide whether ${strategicState.employerCandidates[0].name} belongs on the watched-employer list or should be removed.` : "",
    context.adapterBacklogNames.length ? `Look for specific current openings at ${context.adapterBacklogNames.slice(0, 3).join(", ")} and capture any credible roles in Opportunities.` : "",
    context.opportunityMatchCount ? "Compare current opportunity matches against the top lane's proof gaps before applying." : "Run opportunity or employer research so the next briefing has specific roles to compare.",
  ].filter(Boolean);

  changed.push(...laneStrengthened, ...laneWeakened, ...employerMovedUp, ...employerMovedDown, ...laneAppeared, ...employerAppeared);
  if (baseline && strategicState.deltas.length) changed.push(...strategicState.deltas.slice(0, 4));
  if (!changed.length && strategicState.conversationOutcomeCount > (previous?.conversation_outcome_count ?? 0)) {
    changed.push(`${strategicState.conversationOutcomeCount - (previous?.conversation_outcome_count ?? 0)} new conversation outcome${strategicState.conversationOutcomeCount - (previous?.conversation_outcome_count ?? 0) === 1 ? "" : "s"} captured; no lane or employer crossed the movement threshold yet.`);
  }
  const displayChanged = changed.length
    ? changed.map(displayChangeText).slice(0, 5)
    : [];
  const displayAssumptions = staleAssumptions.map(displayAssumptionText).slice(0, 4);

  const recommendedActions = [
    contactsNeedingFollowUp[0] ? `Follow up: ${contactsNeedingFollowUp[0]}` : "",
    laneStrengthened[0] ? `Turn the strengthened lane into one concrete search or outreach test. ${laneStrengthened[0]}` : "",
    displayAssumptions[0] ? `Keep this as research, not a main search lane: ${displayAssumptions[0]}` : "",
    jobEmployerChecks[0] ?? "",
    assetChangesNeeded[0] ?? "",
    !changed.length && context.watchedEmployerCount ? "Pick one watched employer and verify whether a specific current role exists before changing strategy." : "",
    strategicState.conversationOutcomeCount ? "" : "Capture one market-read conversation outcome so the next briefing can compare real signals.",
  ].filter(Boolean).slice(0, 5);

  const currentWeekStart = startOfWeek(new Date());
  return {
    type: "briefing_diff",
    baseline,
    priorWeekStart: previousSnapshot?.week_start ?? null,
    periodCovered: previousSnapshot
      ? `${previousSnapshot.week_start} to ${currentWeekStart}`
      : `Baseline snapshot for ${currentWeekStart}`,
    periodLabel: baseline
      ? `Baseline snapshot for ${currentWeekStart}`
      : previousSnapshot
        ? `${previousSnapshot.week_start} to ${currentWeekStart}`
        : currentWeekStart,
    changeSummary: changed.length
      ? `${baseline ? "Baseline briefing" : "Briefing changed"}: ${changed.slice(0, 2).join(" ")}`
      : baseline
        ? "Baseline briefing created. Future snapshots will compare against this state."
        : "Nothing material changed since the last briefing.",
    changed,
    laneStrengthened,
    laneWeakened,
    employerMovedUp,
    employerMovedDown,
    contactsNeedingFollowUp,
    overduePromises,
    staleAssumptions,
    displayChanged,
    displayAssumptions,
    assetChangesNeeded,
    evidenceGaps,
    jobEmployerChecks,
    recommendedActions: recommendedActions.length
      ? recommendedActions
      : ["Run one market-read, refresh employer checks, and generate the next briefing after new evidence lands."],
  };
}

function researchAssumptionText(lane: string, explanation: string) {
  const lower = explanation.toLowerCase();
  if (lower.includes("light new-target signal") || lower.includes("needs a real role")) {
    return `${lane}: keep as research until a real posting, employer signal, or current-work proof supports it.`;
  }
  if (lower.includes("baseline from current advisor lane order")) {
    return `${lane}: advisor analysis surfaced this, but it still needs market proof before becoming a priority.`;
  }
  if (lower.includes("weakens")) {
    return `${lane}: recent conversation evidence weakened this path; decide whether to keep testing it or remove it.`;
  }
  return `${lane}: ${explanation}`;
}

const SIGNAL_DIRECTION_VERBS: Record<string, string> = {
  strengthens: "supported",
  weakens: "weakened",
  contradicts: "contradicted",
  neutral: "touched on",
  unclear: "left open",
};

const SIGNAL_TYPE_SUBJECTS: Record<string, string> = {
  lane_fit: "this lane",
  employer_fit: "this employer",
  compensation: "the pay picture",
  hiring_process: "the hiring process",
  culture: "the culture read",
  network_path: "the referral path",
  role_language: "how the role is described",
  dealbreaker: "a dealbreaker",
  new_target: "a new target",
  market_signal: "the market read",
  follow_up_obligation: "a follow-up promise",
};

// strategic-state builds reason strings for scoring audit, not for reading:
// "Alex Herzog: strengthens lane_fit (+6)." (lane, strategic-state.ts:253) and
// "Alex Herzog: CCTV signal strengthens (+6)." (employer, :371). Rewrite both as
// plain sentences and drop the score adjustment — internal signal codes and point
// values should never reach a weekly memo.
function humanizeSignalPhrases(text: string) {
  return text
    .replace(
      /([^:.]+): (strengthens|weakens|contradicts|neutral|unclear) ([a-z_]+) \([+-]?\d+\)\.?/gi,
      (_match, contact: string, direction: string, signalType: string) => {
        const verb = SIGNAL_DIRECTION_VERBS[direction.toLowerCase()] ?? "touched on";
        const subject = SIGNAL_TYPE_SUBJECTS[signalType.toLowerCase()] ?? signalType.replace(/_/g, " ");
        return `a conversation with ${contact.trim()} ${verb} ${subject}.`;
      },
    )
    .replace(
      /([^:.]+): (.+?) signal (strengthens|weakens|contradicts|neutral|unclear) \([+-]?\d+\)\.?/gi,
      (_match, contact: string, target: string, direction: string) => {
        const verb = SIGNAL_DIRECTION_VERBS[direction.toLowerCase()] ?? "touched on";
        return `a conversation with ${contact.trim()} ${verb} ${target.trim()}.`;
      },
    );
}

// Two wordings reach this function: strategic-state deltas ("X moved up to 72.")
// and this file's week-over-week comparison ("X moved up +6 to 72."), so every
// pattern accepts the optional signed difference. Order matters: the candidate
// pattern must be tried before the employer one, because "Candidate Acme moved
// up to 64." also matches the employer pattern with the name "Candidate Acme".
function displayChangeText(change: string) {
  const appeared = change.match(/^(.+?) is new since the last briefing at \d+\./i);
  if (appeared) {
    return `${appeared[1]} is new since the last briefing; decide this week whether it earns a real check or should drop off.`;
  }

  // Lane deltas carry a "<label>: " prefix, and labels are computed (rankedLaneLabel),
  // so match any short prefix rather than a hardcoded label list.
  const laneMovement = change.match(/^[^:]{1,60}: (.+?) moved (up|down)(?:\s[+-]?\d+)? to \d+\./i)
    ?? change.match(/^(.+?) (rose|fell) [+-]?\d+ to \d+\./i);
  if (laneMovement) {
    const [, lane, direction] = laneMovement;
    if (direction === "down" || direction === "fell") return `${lane} moved down into research/watch status; keep it visible, but do not let it drive the search until stronger evidence appears.`;
    return `${lane} gained support; turn it into one concrete market test before changing the resume strategy.`;
  }

  const candidateMovement = change.match(/^Candidate (.+?) moved (up|down)(?:\s[+-]?\d+)? to \d+\./i);
  if (candidateMovement) {
    const [, candidate, direction] = candidateMovement;
    if (direction === "up") return `${candidate} is a stronger employer candidate; review it for promotion to the watched list.`;
    return `${candidate} is a weaker employer candidate; remove it unless there is a concrete role to inspect.`;
  }

  const employerMovement = change.match(/^(.+?) moved (up|down)(?:\s[+-]?\d+)? to \d+\./i);
  if (employerMovement) {
    const [, employer, direction] = employerMovement;
    if (direction === "up") return `${employer} gained enough signal to check for specific current roles or a warm-contact path.`;
    return `${employer} weakened; keep it on the map only if a specific role or contact makes it worth the time.`;
  }

  // Strip the score band first: humanizing afterwards keeps the contact name from
  // being swallowed into the "<band> score based on <reason>" prefix.
  return humanizeSignalPhrases(change.replace(/\b(?:high-confidence|promising|watch|low-priority) score based on /gi, ""))
    .replace(/\s+/g, " ")
    .trim();
}

function displayAssumptionText(assumption: string) {
  return humanizeSignalPhrases(assumption.replace(/\b(?:high-confidence|promising|watch|low-priority) score based on /gi, ""))
    .replace(/advisor analysis surfaced this, but it still needs market proof before becoming a priority\./i, "worth testing only if real openings or current-work proof show up.")
    .replace(/\s+/g, " ")
    .trim();
}

export async function propagateStrategicStateAfterChange(
  supabase: SupabaseClient,
  userId: string,
) {
  try {
    const result = await buildWeeklyStrategySnapshot(supabase, userId);
    return {
      ok: !result.error,
      errorMessage: result.error?.message ?? "",
      summary: result.summary,
    };
  } catch (error) {
    return {
      ok: false,
      errorMessage: error instanceof Error ? error.message : "Unknown propagation error.",
      summary: "",
    };
  }
}

export function formatRegion(region: string) {
  return region
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function extractStrategicState(evidence: Array<Record<string, unknown>>): SnapshotStrategicEvidence | null {
  return (evidence ?? []).find((item) => item?.type === "strategic_state") as SnapshotStrategicEvidence | undefined ?? null;
}

function compareScores<T extends { score: number }, P extends { score: number }>(
  current: T[],
  previous: P[] | undefined,
  key: (item: T) => string,
  previousKey: (item: P) => string,
  render: (item: T, diff: number) => string,
  direction: "up" | "down",
) {
  const previousByKey = new Map(
    (previous ?? []).map((item) => [normalizeKey(previousKey(item)), Number(item.score ?? 0)]),
  );
  return current
    .map((item) => {
      const prior = previousByKey.get(normalizeKey(key(item)));
      if (prior === undefined) return null;
      const diff = item.score - prior;
      if (direction === "up" && diff < 4) return null;
      if (direction === "down" && diff > -4) return null;
      return render(item, diff);
    })
    .filter(Boolean) as string[];
}

// Entries present now but absent from the previous snapshot. Returns nothing when
// there is no previous list, so a baseline briefing does not report everything as new.
function findNewEntries<T, P>(
  current: T[],
  previous: P[] | undefined,
  key: (item: T) => string,
  previousKey: (item: P) => string,
  render: (item: T) => string,
) {
  if (!previous?.length) return [];
  const known = new Set((previous ?? []).map((item) => normalizeKey(previousKey(item))));
  return current.filter((item) => !known.has(normalizeKey(key(item)))).map(render);
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export interface StaleSignalNotice {
  newConversationCount: number;
  lastAnalysisAt: string | null;
  lastSignalAt: string | null;
}

/**
 * Phase 1 UX guard (Autumn 2026): conversation notes saved after the latest
 * evidence analysis are invisible to every downstream surface — snapshots and
 * the report reuse the last saved analysis — until a re-analysis runs. The
 * briefing and report pages show a nudge when this is true, so the user is
 * never left pressing "Generate" and silently getting nothing new.
 */
export async function getStaleSignalNotice(
  supabase: SupabaseClient,
  userId: string,
): Promise<StaleSignalNotice> {
  const [{ data: analysisRow }, { data: signalRows }] = await Promise.all([
    supabase
      .from("career_sources")
      .select("created_at")
      .eq("user_id", userId)
      .eq("source_type", "evidence_analysis")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("career_sources")
      .select("created_at")
      .eq("user_id", userId)
      .eq("source_type", "conversation_outcome")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const lastAnalysisAt = analysisRow?.created_at ?? null;
  const notes = signalRows ?? [];
  const newNotes = lastAnalysisAt
    ? notes.filter((note) => note.created_at > lastAnalysisAt)
    : notes;
  return {
    newConversationCount: newNotes.length,
    lastAnalysisAt,
    lastSignalAt: newNotes[0]?.created_at ?? null,
  };
}

function startOfWeek(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = copy.getDate() - day + (day === 0 ? -6 : 1);
  copy.setDate(diff);
  copy.setHours(0, 0, 0, 0);
  return copy.toISOString().slice(0, 10);
}
