import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdvisorAnalysis, AdvisorEvidenceResponse } from "@/lib/cip/advisor";
import type { ResumeAssetContext, ResumeAssetDraft } from "@/lib/cip/resume-assets";
import { sourceAnalysesToEvidence, type SourceAnalysisItem } from "@/lib/cip/source-analysis";

export type IntakeSource = {
  intake?: Record<string, unknown>;
  draft?: {
    strengths?: string[];
    possibleRoles?: string[];
    evidenceChecklist?: string[];
    nextQuestions?: string[];
  };
  advisor?: Partial<AdvisorAnalysis>;
};

export interface LoadedResumeAssetContext {
  latestSource: IntakeSource | null;
  latestAdvisor: Partial<AdvisorAnalysis> | null;
  targetLanes: ResumeAssetContext["targetLanes"];
  positioningInputs: ResumeAssetContext["positioning"];
  proofItems: ResumeAssetContext["proofItems"];
  context: ResumeAssetContext;
}

export interface SavedResumeDraft {
  draft: ResumeAssetDraft;
  savedAt: string;
}

export async function loadResumeAssetContext(
  supabase: SupabaseClient,
  userId: string,
): Promise<LoadedResumeAssetContext> {
  const [
    { data: intakeData },
    { data: analysisData },
    { data: evidenceRows },
    { data: sourceRows },
    { data: reviewRows },
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
      .from("career_sources")
      .select("extracted_text")
      .eq("user_id", userId)
      .eq("source_type", "evidence_response")
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("career_sources")
      .select("extracted_text")
      .eq("user_id", userId)
      .eq("source_type", "source_analysis")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("career_sources")
      .select("extracted_text")
      .eq("user_id", userId)
      .eq("source_type", "analysis_review")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const latestSource = parseIntakeSource(intakeData?.extracted_text ?? null);
  const latestAdvisor = parseAnalysisAdvisor(analysisData?.extracted_text ?? null) ?? latestSource?.advisor ?? null;
  const savedEvidence = (evidenceRows ?? [])
    .map((row) => parseEvidenceResponse(row.extracted_text))
    .filter(Boolean) as AdvisorEvidenceResponse[];
  const sourceEvidence = sourceAnalysesToEvidence(
    (sourceRows ?? []).flatMap((row) => parseSourceAnalysisItems(row.extracted_text)),
  );
  const analysisReviews = (reviewRows ?? []).map((row) => summarizeAnalysisReview(row.extracted_text)).filter(Boolean);

  const targetLanes = buildTargetLanes(latestSource, latestAdvisor);
  const positioningInputs = buildPositioningInputs(latestSource, latestAdvisor);
  const proofItems = buildProofItems(latestSource, latestAdvisor);

  return {
    latestSource,
    latestAdvisor,
    targetLanes,
    positioningInputs,
    proofItems,
    context: {
      intake: latestSource?.intake ?? {},
      advisor: latestAdvisor,
      targetLanes,
      positioning: positioningInputs,
      proofItems,
      evidenceResponses: savedEvidence,
      sourceEvidence,
      analysisReviews,
    },
  };
}

export async function loadLatestSavedResumeDraft(
  supabase: SupabaseClient,
  userId: string,
): Promise<SavedResumeDraft | null> {
  const { data } = await supabase
    .from("career_sources")
    .select("extracted_text, created_at")
    .eq("user_id", userId)
    .eq("source_type", "resume_draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.extracted_text) return null;
  try {
    const parsed = JSON.parse(data.extracted_text);
    const draft = parsed?.draft;
    if (!draft || typeof draft !== "object" || typeof draft.summary !== "string") return null;
    return {
      draft: draft as ResumeAssetDraft,
      savedAt: String(parsed?.saved_at ?? data.created_at ?? ""),
    };
  } catch {
    return null;
  }
}

export function parseIntakeSource(value: string | null): IntakeSource | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as IntakeSource;
  } catch {
    return null;
  }
}

export function parseAnalysisAdvisor(value: string | null): Partial<AdvisorAnalysis> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed?.advisor ?? null;
  } catch {
    return null;
  }
}

export function parseEvidenceResponse(value: string | null): AdvisorEvidenceResponse | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    const response = parsed?.response;
    if (!response?.question || !response?.answer) return null;
    return {
      question: String(response.question),
      answer: String(response.answer),
      confidence: String(response.confidence || "not_sure"),
      proofUrl: String(response.proofUrl || ""),
      sourceNote: String(response.sourceNote || ""),
    };
  } catch {
    return null;
  }
}

export function parseSourceAnalysisItems(value: string | null): SourceAnalysisItem[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed?.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

export function summarizeAnalysisReview(value: string | null) {
  if (!value) return "";
  try {
    const parsed = JSON.parse(value);
    const review = parsed?.review;
    const answers = Array.isArray(review?.answers)
      ? review.answers
          .slice(0, 4)
          .map((answer: { question?: unknown; verdict?: unknown; directAnswer?: unknown }) =>
            `${String(answer.question || "Strategic question")} [${String(answer.verdict || "reviewed")}]: ${String(answer.directAnswer || "")}`,
          )
      : [];
    return [review?.summary, ...answers].filter(Boolean).join("\n");
  } catch {
    return "";
  }
}

export function buildTargetLanes(source: IntakeSource | null, advisor: Partial<AdvisorAnalysis> | null) {
  const briefs = Array.isArray(advisor?.roleBriefs) ? advisor.roleBriefs : [];
  if (briefs.length) {
    return briefs.slice(0, 3).map((brief, index) => ({
      label: index === 0 ? "Primary lane" : index === 1 ? "Strong alternate" : "Research lane",
      role: brief.role,
      rationale: brief.whyItFits,
      missing: brief.evidenceNeeded,
    }));
  }

  const roles = source?.draft?.possibleRoles ?? [];
  if (roles.length) {
    return roles.slice(0, 3).map((role, index) => ({
      label: index === 0 ? "Primary lane" : index === 1 ? "Strong alternate" : "Research lane",
      role,
      rationale: "Pulled from the saved intake draft. Run evidence analysis before turning this into final resume positioning.",
      missing: "Needs proof, salary fit, target industry comparison, and real posting validation.",
    }));
  }

  return [
    {
      label: "Primary lane",
      role: "Best-supported target role",
      rationale: "Choose the role family with the strongest evidence, clearest compensation path, and least narrative strain.",
      missing: "Needs latest evidence analysis.",
    },
    {
      label: "Strong alternate",
      role: "Adjacent role family",
      rationale: "Keep one credible adjacent direction so the user is not locked into a single search phrase.",
      missing: "Needs posting comparison and proof check.",
    },
    {
      label: "Research lane",
      role: "Experimental direction",
      rationale: "Use this as a market test before building a full resume variant.",
      missing: "Needs employer and job-board validation.",
    },
  ];
}

export function buildPositioningInputs(source: IntakeSource | null, advisor: Partial<AdvisorAnalysis> | null) {
  const positioning = Array.isArray(advisor?.positioning) ? advisor.positioning : [];
  const gaps = Array.isArray(advisor?.skillGaps) ? advisor.skillGaps : [];
  const questions = Array.isArray(advisor?.followUpQuestions) ? advisor.followUpQuestions : [];
  return [
    {
      label: "Core promise",
      detail: positioning[0] ?? source?.draft?.strengths?.[0] ?? "What problem does this person reliably solve for an employer?",
    },
    {
      label: "Proof to feature",
      detail: positioning[1] ?? source?.draft?.evidenceChecklist?.[0] ?? "Which evidence-backed story should anchor the resume, LinkedIn, outreach, and interviews?",
    },
    {
      label: "Risk to resolve",
      detail: gaps[0] ?? questions[0] ?? "What question would a hiring manager still have after reading the current materials?",
    },
  ];
}

export function buildProofItems(source: IntakeSource | null, advisor: Partial<AdvisorAnalysis> | null) {
  const ledger = Array.isArray(advisor?.evidenceLedger) ? advisor.evidenceLedger : [];
  const verified = ledger
    .filter((item) => item.status === "verified_from_resume" || item.status === "stated_by_user")
    .slice(0, 4)
    .map((item) => ({
      claim: item.claim,
      evidence: item.evidence,
    }));

  if (verified.length) return verified;

  return (source?.draft?.strengths ?? []).slice(0, 4).map((strength) => ({
    claim: strength,
    evidence: "Draft signal from intake. Verify before using as resume copy.",
  }));
}
