import type { SupabaseClient } from "@supabase/supabase-js";

export async function buildWeeklyStrategySnapshot(
  supabase: SupabaseClient,
  userId: string,
) {
  const [{ data: employers }, { data: matches }] = await Promise.all([
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
  ]);

  const watched = employers ?? [];
  const opportunityMatches = matches ?? [];
  const topEmployers = watched.slice(0, 5);
  const adapterBacklog = watched.filter((employer) => employer.adapter_status !== "supported").slice(0, 5);
  const regionFocus = [...new Set(watched.map((employer) => employer.region).filter(Boolean))];
  const weekStart = startOfWeek(new Date());

  const nextActions = [
    topEmployers.length
      ? `Review career pages for ${topEmployers.slice(0, 3).map((employer) => employer.name).join(", ")}.`
      : "Build a watched-employer map from the Employers page.",
    adapterBacklog.length
      ? `Prioritize adapters or manual review for ${adapterBacklog.slice(0, 3).map((employer) => employer.name).join(", ")}.`
      : "Keep supported employer feeds fresh and watch for new matches.",
    opportunityMatches.length
      ? "Compare top opportunity matches against resume proof gaps before applying."
      : "Run labor-market research after watched employers are seeded.",
    "Turn one strong employer-role pair into a targeted networking or portfolio action.",
  ];

  const summary = watched.length
    ? `This week focuses on ${watched.length} watched employers across ${regionFocus.map(formatRegion).join(", ")} with ${opportunityMatches.length} ranked opportunity matches.`
    : "This week starts by creating a trusted employer map before searching for individual roles.";

  const evidence = [
    ...topEmployers.map((employer) => ({
      type: "watched_employer",
      name: employer.name,
      priority: employer.priority,
      fit_score: employer.fit_score,
      careers_url: employer.careers_url,
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
