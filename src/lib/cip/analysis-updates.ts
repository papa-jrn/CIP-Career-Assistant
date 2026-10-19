import type { AdvisorEvidenceResponse } from "./advisor";
export type DatedEvidence = AdvisorEvidenceResponse & { savedAt: string | null; inputKind?: string };
/** Preserve exact new answers and separately retain user goals across subsequent passes. */
export function collectAnalysisUpdates(evidence: DatedEvidence[], priorAt: string | null) {
  const isGoal = (item: DatedEvidence) => item.inputKind === "goal" || /^goal:/i.test(item.question) || item.sourceNote?.startsWith("User intention;");
  return {
    newEvidenceResponses: evidence.filter(item => !priorAt || Boolean(item.savedAt && item.savedAt > priorAt)),
    currentGoalUpdates: evidence.filter(isGoal),
  };
}
