import type { SupabaseClient } from "@supabase/supabase-js";
import { loadFundingProfiles, type FundingProfile } from "@/lib/cip/employer-financials";
import { loadRunView, type RunView } from "@/lib/cip/job-search-run";
import { loadRecommendationInputs } from "@/lib/cip/opportunity-recommendations";
import { loadDispositions } from "@/lib/cip/posting-dispositions";
import { loadStoredSearchPreferences } from "@/lib/cip/search-preferences";
import { buildStrategicState, loadStrategicInputs } from "@/lib/cip/strategic-state";
import { buildTargetDossiers, type DossierEmployer, type TargetDossier } from "@/lib/cip/target-dossier";

/**
 * Gathers everything the target workspace needs, once per page render, and hands it to the pure
 * assembler (`target-dossier.ts`). Read-only. A piece that cannot load (a missing table, no search
 * yet) degrades to "unknown" instead of breaking the page: the dossier already treats missing data
 * as unknown, never as a verdict.
 */

export interface TargetWorkspace {
  dossiers: TargetDossier[];
  /** The raw watched rows, so the page can show details the dossier does not carry (fit summary, notes, links). */
  employers: WatchedRow[];
  profiles: Map<string, FundingProfile>;
  fundingError: string | null;
  run: { startedAt: string; finishedAt: string | null; status: string } | null;
}

export interface WatchedRow {
  id: string;
  name: string;
  region: string;
  category: string | null;
  location: string | null;
  priority: string | null;
  fit_score: number | null;
  fit_summary: string | null;
  target_roles: string[] | null;
  source_url: string | null;
  careers_url: string | null;
  adapter_status: string | null;
  estimated_size: string | null;
  source_notes: Array<{ label: string; value: string; url: string }> | null;
  created_at: string | null;
  financials_mode?: string | null;
}

// A run whose results are worth showing: it actually searched (matches job-search-run's own definition).
const SEARCHED = ["succeeded", "partial", "budget_limited"];

async function loadLatestSearchedRun(supabase: SupabaseClient, userId: string): Promise<RunView | null> {
  const { data } = await supabase
    .from("job_search_runs")
    .select("id")
    .eq("user_id", userId)
    .in("status", SEARCHED)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? loadRunView(supabase, userId, (data as { id: string }).id) : null;
}

export async function loadTargetWorkspace(supabase: SupabaseClient, userId: string, now: string = new Date().toISOString()): Promise<TargetWorkspace> {
  const [{ data: employerRows }, strategicInputs, runView, dispositions, funding, prefs] = await Promise.all([
    supabase.from("watched_employers").select("*").eq("user_id", userId).order("fit_score", { ascending: false }).limit(300),
    loadStrategicInputs(supabase, userId),
    loadLatestSearchedRun(supabase, userId).catch(() => null),
    loadDispositions(supabase, userId).catch(() => []),
    loadFundingProfiles(supabase, userId),
    loadStoredSearchPreferences(supabase, userId).catch(() => null),
  ]);

  const employers = (employerRows ?? []) as WatchedRow[];
  const state = buildStrategicState(strategicInputs);
  // The salary floor the chips compare against: the latest run's own brief, else the user's saved minimum.
  const brief = runView?.run.brief as { compensation?: { floorUsd?: number | null } } | undefined;
  const floorUsd = typeof brief?.compensation?.floorUsd === "number" ? brief.compensation.floorUsd : prefs?.salaryFloorUsd ?? null;
  const inputs = await loadRecommendationInputs(supabase, userId, floorUsd, state);

  const dossierEmployers: DossierEmployer[] = employers.map((row) => ({
    id: row.id,
    name: row.name,
    region: row.region,
    category: row.category,
    location: row.location,
    priority: row.priority,
    fitScore: typeof row.fit_score === "number" ? row.fit_score : null,
    careersUrl: row.careers_url,
    createdAt: row.created_at,
    financialsMode: row.financials_mode,
  }));

  const dossiers = buildTargetDossiers({
    employers: dossierEmployers,
    inputs,
    scores: state.employers,
    outcomes: strategicInputs.conversationOutcomes ?? [],
    obligations: state.followUpObligations,
    run: runView ? { startedAt: runView.run.started_at, status: runView.run.status } : null,
    observations: runView?.observations ?? [],
    coverage: runView?.run.coverage ?? [],
    dispositions,
    profiles: funding.profiles,
    now,
  });

  return {
    dossiers,
    employers,
    profiles: funding.profiles,
    fundingError: funding.error,
    run: runView ? { startedAt: runView.run.started_at, finishedAt: runView.run.finished_at, status: runView.run.status } : null,
  };
}
