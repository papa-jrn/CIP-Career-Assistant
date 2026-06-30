import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdvisorAnalysis, EvidenceLedgerItem, ExplorationArea } from "@/lib/cip/advisor";
import { calculateEvidenceSufficiency, type EvidenceSufficiencyScore } from "@/lib/cip/evidence-sufficiency";
import {
  loadResumeAssetContext,
  parseAnalysisAdvisor,
  parseIntakeSource,
  buildTargetLanes,
  type IntakeSource,
} from "@/lib/cip/resume-asset-context";
import { formatRegion } from "@/lib/cip/weekly-strategy";

/**
 * Career Intelligence Report assembler.
 *
 * Deterministic by design (the project's anti-hallucination + integrity rules, §8 / §19):
 * this assembles and presents what the system ALREADY knows from saved, additive analysis.
 * It does NOT call an LLM and it does NOT invent content. Every claim keeps its source
 * status so the report can show a visible confidence label next to it.
 *
 * Persistence mirrors `resume_draft`: an additive `career_sources` row
 * (source_type "career_report", trust_state "system_generated").
 */

export type ConfidenceLabel = "verified" | "stated" | "inferred" | "needs_confirmation" | "insufficient";

export interface ReportLedgerEntry {
  claim: string;
  confidence: ConfidenceLabel;
  evidence: string;
  whyItMatters: string;
  nextValidationStep: string;
}

export interface ReportLane {
  label: "Primary lane" | "Strong alternate" | "Research lane";
  role: string;
  rationale: string;
  missing: string;
}

export interface ReportExplorationArea {
  area: string;
  whyExplore: string;
  evidenceToFind: string[];
  firstExperiment: string;
}

export interface ReportOpportunitySnapshot {
  watchedEmployerCount: number;
  opportunityMatchCount: number;
  regionFocus: string[];
  topEmployers: Array<{ name: string; fitScore: number | null }>;
  topMatches: Array<{ title: string | null; company: string | null; matchScore: number | null }>;
}

export interface CareerReport {
  /** Whether enough analysis exists to render a real report. */
  status: "ready" | "needs_analysis" | "needs_intake" | "error";
  generatedAt: string;
  /** ISO timestamp of the analysis the report was built from. */
  analysisAt: string | null;
  /** Where the headline summary came from — never misrepresented. */
  summarySource: "advisor" | "intake_draft" | "none";
  summary: string;
  /** Mode the underlying analysis ran in (ai | deterministic) — surfaced honestly. */
  analysisMode: AdvisorAnalysis["mode"] | null;
  positioning: string[];
  lanes: ReportLane[];
  ledger: ReportLedgerEntry[];
  explorationAreas: ReportExplorationArea[];
  skillGaps: string[];
  claimSafetyNotes: string[];
  sufficiency: EvidenceSufficiencyScore | null;
  opportunity: ReportOpportunitySnapshot | null;
  /** Next-action cadence, derived from gaps + questions + experiments. */
  actionCadence: string[];
  nextStepHref: string;
  nextStepLabel: string;
}

/** Map the advisor's internal status → a human confidence label. */
export function confidenceFromStatus(status: EvidenceLedgerItem["status"]): ConfidenceLabel {
  switch (status) {
    case "verified_from_resume":
      return "verified";
    case "stated_by_user":
      return "stated";
    case "inferred_medium_confidence":
      return "inferred";
    case "needs_user_confirmation":
      return "needs_confirmation";
    case "not_enough_evidence":
      return "insufficient";
    default:
      return "insufficient";
  }
}

export async function loadLatestSavedReport(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ report: CareerReport | null; savedAt: string | null }> {
  const { data } = await supabase
    .from("career_sources")
    .select("extracted_text, created_at")
    .eq("user_id", userId)
    .eq("source_type", "career_report")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.extracted_text) return { report: null, savedAt: null };
  try {
    const parsed = JSON.parse(data.extracted_text);
    const report = parsed?.report;
    if (!report || typeof report !== "object" || typeof report.status !== "string") {
      return { report: null, savedAt: null };
    }
    return { report: report as CareerReport, savedAt: String(parsed?.saved_at ?? data.created_at ?? "") };
  } catch {
    return { report: null, savedAt: null };
  }
}

/**
 * Build the report deterministically from saved analysis. Never fabricates.
 * If there is no analysis and no intake, returns a status that says so and
 * points the user to the right next step (the integrity rule, §19).
 */
export async function buildCareerReport(
  supabase: SupabaseClient,
  userId: string,
): Promise<CareerReport> {
  const generatedAt = new Date().toISOString();

  try {
    // Reuse the existing canonical context loader (single source of truth).
    const ctx = await loadResumeAssetContext(supabase, userId);
    const latestSource = ctx.latestSource;
    const latestAdvisor = ctx.latestAdvisor;

    const intake = (latestSource?.intake ?? {}) as Record<string, unknown>;

    // Pull the analysis timestamp for provenance.
    const analysisAt = await loadAnalysisTimestamp(supabase, userId);

    // No intake at all → cannot build anything honest.
    if (!latestSource) {
      return needsReport({
        status: "needs_intake",
        generatedAt,
        nextStepHref: "/intake",
        nextStepLabel: "Start intake",
      });
    }

    const evidenceResponses = ctx.context.evidenceResponses;
    const sourceEvidenceCount = ctx.context.sourceEvidence?.length ?? 0;
    const sufficiency = calculateEvidenceSufficiency(intake, evidenceResponses, {
      sourceEvidenceCount,
      evidenceRound: ctx.context.analysisReviews?.length ?? 0,
    });

    // No advisor analysis yet → show what we have from intake + clear next step.
    if (!latestAdvisor) {
      return {
        status: "needs_analysis",
        generatedAt,
        analysisAt,
        summarySource: "intake_draft",
        analysisMode: null,
        summary:
          "Your intake has been saved, but no evidence analysis has been run yet. The report fills in once the advisor has analyzed your resume and evidence — it never invents findings before that.",
        positioning: [],
        lanes: buildTargetLanes(latestSource, null).slice(0, 1).map((lane) => ({
          label: lane.label as ReportLane["label"],
          role: lane.role,
          rationale: lane.rationale,
          missing: lane.missing,
        })),
        ledger: [],
        explorationAreas: [],
        skillGaps: [],
        claimSafetyNotes: [],
        sufficiency,
        opportunity: await loadOpportunitySnapshot(supabase, userId),
        actionCadence: [
          "Run evidence analysis to produce the positioning, role lanes, and evidence ledger.",
          "Add proof-backed answers and linked sources to raise your Evidence Sufficiency score.",
        ],
        nextStepHref: "/evidence",
        nextStepLabel: "Run evidence analysis",
      };
    }

    // Full report from real analysis.
    const advisor = latestAdvisor;
    const ledger = (Array.isArray(advisor.evidenceLedger) ? advisor.evidenceLedger : []).map((item) => ({
      claim: item.claim,
      confidence: confidenceFromStatus(item.status),
      evidence: item.evidence,
      whyItMatters: item.whyItMatters,
      nextValidationStep: item.nextValidationStep,
    }));

    const explorationAreas: ReportExplorationArea[] = (Array.isArray(advisor.explorationAreas)
      ? advisor.explorationAreas
      : []
    ).map((area: ExplorationArea) => ({
      area: area.area,
      whyExplore: area.whyExplore,
      evidenceToFind: Array.isArray(area.evidenceToFind) ? area.evidenceToFind : [],
      firstExperiment: area.firstExperiment,
    }));

    const lanes = buildTargetLanes(latestSource, advisor).slice(0, 3).map((lane) => ({
      label: lane.label as ReportLane["label"],
      role: lane.role,
      rationale: lane.rationale,
      missing: lane.missing,
    }));

    const skillGaps = Array.isArray(advisor.skillGaps) ? advisor.skillGaps : [];
    const questions = Array.isArray(advisor.followUpQuestions) ? advisor.followUpQuestions : [];
    const experiments = explorationAreas.map((a) => a.firstExperiment).filter(Boolean);
    const actionCadence = [...skillGaps, ...questions, ...experiments].filter(Boolean).slice(0, 6);

    return {
      status: "ready",
      generatedAt,
      analysisAt,
      summarySource: "advisor",
      analysisMode: advisor.mode ?? null,
      summary: advisor.summary || "Career intelligence summary from your saved analysis.",
      positioning: Array.isArray(advisor.positioning) ? advisor.positioning : [],
      lanes,
      ledger,
      explorationAreas,
      skillGaps,
      claimSafetyNotes: Array.isArray(advisor.claimSafetyNotes) ? advisor.claimSafetyNotes : [],
      sufficiency,
      opportunity: await loadOpportunitySnapshot(supabase, userId),
      actionCadence,
      nextStepHref: sufficiency && sufficiency.phase === "complete" ? "/assets" : "/evidence",
      nextStepLabel:
        sufficiency && sufficiency.phase === "complete"
          ? "Prepare career assets"
          : "Strengthen the evidence",
    };
  } catch {
    return needsReport({
      status: "error",
      generatedAt,
      nextStepHref: "/evidence",
      nextStepLabel: "Open evidence workspace",
    });
  }
}

async function loadAnalysisTimestamp(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("career_sources")
    .select("created_at")
    .eq("user_id", userId)
    .eq("source_type", "evidence_analysis")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.created_at ?? null;
}

async function loadOpportunitySnapshot(
  supabase: SupabaseClient,
  userId: string,
): Promise<ReportOpportunitySnapshot | null> {
  const [{ data: watched }, { data: matches }] = await Promise.all([
    supabase
      .from("watched_employers")
      .select("name, region, fit_score")
      .eq("user_id", userId)
      .order("fit_score", { ascending: false }),
    supabase
      .from("opportunity_matches")
      .select("match_score, opportunities(title, company)")
      .eq("user_id", userId)
      .order("match_score", { ascending: false })
      .limit(5),
  ]);

  const watchedList = watched ?? [];
  if (!watchedList.length && !(matches ?? []).length) return null;

  const regionFocus = [...new Set(watchedList.map((e) => e.region).filter(Boolean))];

  return {
    watchedEmployerCount: watchedList.length,
    opportunityMatchCount: (matches ?? []).length,
    regionFocus,
    topEmployers: watchedList.slice(0, 5).map((e) => ({ name: e.name, fitScore: e.fit_score })),
    topMatches: (matches ?? []).map((m) => {
      const opp = m.opportunities as { title?: string | null; company?: string | null } | null;
      return { title: opp?.title ?? null, company: opp?.company ?? null, matchScore: m.match_score };
    }),
  };
}

function needsReport(args: {
  status: CareerReport["status"];
  generatedAt: string;
  nextStepHref: string;
  nextStepLabel: string;
}): CareerReport {
  return {
    status: args.status,
    generatedAt: args.generatedAt,
    analysisAt: null,
    summarySource: "none",
    summary: "",
    analysisMode: null,
    positioning: [],
    lanes: [],
    ledger: [],
    explorationAreas: [],
    skillGaps: [],
    claimSafetyNotes: [],
    sufficiency: null,
    opportunity: null,
    actionCadence: [],
    nextStepHref: args.nextStepHref,
    nextStepLabel: args.nextStepLabel,
  };
}

/** Format the region list for display (reuses the shared helper). */
export function formatReportRegions(regions: string[]): string[] {
  return (regions ?? []).map(formatRegion);
}

// Re-export the shared parsers so the report page / API don't import from two places.
export { parseIntakeSource, parseAnalysisAdvisor };
export type { IntakeSource };
