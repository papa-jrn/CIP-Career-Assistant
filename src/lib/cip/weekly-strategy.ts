import type { SupabaseClient } from "@supabase/supabase-js";
import { loadStrategicState } from "@/lib/cip/strategic-state";

export async function buildWeeklyStrategySnapshot(
  supabase: SupabaseClient,
  userId: string,
) {
  const [{ data: employers }, { data: matches }, strategicState] = await Promise.all([
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
    loadStrategicState(supabase, userId),
  ]);

  const watched = employers ?? [];
  const opportunityMatches = matches ?? [];
  const topEmployers = strategicState.employers.length
    ? strategicState.employers.slice(0, 5)
    : watched.slice(0, 5);
  const adapterBacklog = watched.filter((employer) => employer.adapter_status !== "supported").slice(0, 5);
  const regionFocus = [...new Set(watched.map((employer) => employer.region).filter(Boolean))];
  const weekStart = startOfWeek(new Date());
  const topLane = strategicState.lanes[0];
  const movedLane = strategicState.lanes.find((lane) => lane.direction !== "steady");
  const movedEmployer = strategicState.employers.find((employer) => employer.direction !== "steady");
  const movedCandidate = strategicState.employerCandidates.find((candidate) => candidate.direction !== "steady");
  const urgentFollowUp = strategicState.followUpObligations.find((obligation) => obligation.urgency === "overdue" || obligation.urgency === "due_soon");
  const resumeLane = strategicState.resumeLaneRecommendation;

  const nextActions = [
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
  ];

  const summary = strategicState.deltas.length
    ? `This snapshot includes ${strategicState.conversationOutcomeCount} conversation outcomes. ${strategicState.deltas.slice(0, 2).join(" ")}`
    : watched.length
      ? `This week focuses on ${watched.length} watched employers across ${regionFocus.map(formatRegion).join(", ")} with ${opportunityMatches.length} ranked opportunity matches.`
      : "This week starts by creating a trusted employer map before searching for individual roles.";

  const evidence = [
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
