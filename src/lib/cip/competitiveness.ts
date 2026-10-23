import { z } from "zod";
export const DIMENSIONS = ["core_work", "scope_seniority", "domain_context", "results"] as const;
export const dimensionSchema = z.object({
  dimension: z.enum(DIMENSIONS), rating: z.enum(["direct", "transferable", "gap", "unknown"]),
  evidenceStrength: z.enum(["concrete", "general", "none"]),
  explanation: z.string().min(12).max(500), postingQuote: z.string().max(600), evidenceRefs: z.array(z.string()).max(4),
}).strict();
export type CompetitiveDimension = z.infer<typeof dimensionSchema>;
export const readinessSchema = z.object({ status: z.enum(["ready", "needs_tailoring", "needs_evidence", "unavailable"]), explanation: z.string(), missingRequirements: z.array(z.string()) });
export type ResumeReadiness = z.infer<typeof readinessSchema>;
export function competitiveScore(dimensions: CompetitiveDimension[], requirements: Array<{ requirement?: string; qualificationKind?: string; importance: string; status: string }>, _preferenceConflict: boolean) {
  const mandatory = requirements.filter(item => item.importance !== "preferred");
  const gates = mandatory.filter(item => item.qualificationKind === "credential_or_eligibility" || (!item.qualificationKind && /degree|licen[cs]e|certification|work authorization|clearance/i.test(item.requirement ?? "")));
  if (gates.some(item => item.status === "gap")) return { score: 2, scoreReason: "A confirmed mandatory credential or eligibility barrier must be resolved before applying. Salary and personal preferences do not affect this competitiveness score." };
  if (!DIMENSIONS.every(key => dimensions.filter(item => item.dimension === key).length === 1)) return { score: null, scoreReason: "Not enough interpreted evidence to assess competitiveness across the core dimensions." };
  const known = dimensions.filter(item => item.rating !== "unknown" && item.evidenceStrength !== "none");
  const coreWork = dimensions.find(item => item.dimension === "core_work")!;
  if (!known.length || coreWork.rating === "unknown" || coreWork.evidenceStrength === "none") return { score: null, scoreReason: "Core job experience is not established yet. Answer the clarification questions; missing evidence is not proof of a poor match." };
  const weights = { core_work: 0.35, scope_seniority: 0.30, domain_context: 0.15, results: 0.20 };
  const availableWeight = known.reduce((sum, item) => sum + weights[item.dimension], 0);
  let score = Math.round(1 + 9 * known.reduce((sum, item) => sum + weights[item.dimension] * (item.rating === "direct" ? 1 : item.rating === "transferable" ? 0.7 : 0) * (item.evidenceStrength === "concrete" ? 1 : 0.6), 0) / availableWeight);
  const core = dimensions.filter(item => ["core_work", "scope_seniority"].includes(item.dimension));
  if (core.some(item => item.rating === "gap")) score = Math.min(score, 4);
  if (core.some(item => item.evidenceStrength === "general")) score = Math.min(score, 5);
  if (core.some(item => item.rating === "unknown" || item.evidenceStrength === "none")) score = Math.min(score, 6);
  if (core.some(item => item.rating === "transferable")) score = Math.min(score, 8);
  if (known.length < 4 || requirements.some(item => item.status !== "supported")) score = Math.min(score, 8);
  if (gates.some(item => item.status === "unknown")) score = Math.min(score, 5);
  if (mandatory.some(item => item.status === "gap")) score = Math.min(score, 6);
  if (requirements.filter(item => item.status === "supported").length < 4) score = Math.min(score, 8);
  return { score: Math.max(1, Math.min(10, score)), scoreReason: "Competitiveness considers core work (35%), scope (30%), context (15%) and results (20%). Unknown dimensions reduce confidence and limit exceptional scores; they are not counted as proven failures. Salary, desired career lane and other personal preferences are assessed separately. This is not a hiring probability." };
}

export function resumeReadiness(requirements: Array<{ requirement: string; importance: string; status: string; evidence: Array<{ refId: string }> }>, resumeRefs: Set<string>): ResumeReadiness {
  if (!resumeRefs.size) return { status: "unavailable", explanation: "No original resume was available to evaluate screening readiness.", missingRequirements: [] };
  const mandatory = requirements.filter(item => item.importance !== "preferred");
  const unknown = mandatory.filter(item => item.status !== "supported");
  const absent = mandatory.filter(item => !item.evidence.some(ref => resumeRefs.has(ref.refId)));
  return { status: unknown.length ? "needs_evidence" : absent.length ? "needs_tailoring" : "ready", explanation: unknown.length ? "Important requirements remain unresolved in your saved evidence. Clarify them before applying." : absent.length ? "Some qualifications are supported by other CIP context but are not demonstrated by the cited resume excerpts. Tailor the resume using truthful evidence." : "The cited resume excerpts support the assessed mandatory requirements. This does not predict how an employer or automated screening system will rank the application.", missingRequirements: [...new Set([...unknown, ...absent].map(item => item.requirement))] };
}
