import { retainCareerLanes } from "./lane-continuity";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdvisorAnalysis, AdvisorAnalysisContext, AdvisorEvidenceResponse } from "./advisor";
import type { IntakeForm } from "./intake";

const text = z.string().trim().min(8).max(3000);
export const goalReviewSchema = z.object({
  inputId: z.string().min(1).max(100),
  direction: text,
  understanding: text,
  contextAssessment: text,
  connections: z.array(z.object({
    lane: z.string().trim().min(1).max(300),
    relationship: z.enum(["complements", "tension", "alternative"]),
    explanation: text,
    sourceRef: z.string().min(1).max(100),
    sourceQuote: z.string().trim().min(6).max(1000),
  })).max(5),
  planImplications: z.array(text).min(1).max(4),
  uncertainties: z.array(text).min(1).max(4),
  nextAction: text,
  confidence: z.enum(["low", "medium", "high"]),
});
export type GoalProposal = z.infer<typeof goalReviewSchema>;
export type GoalReview = GoalProposal & { origin: "stated" | "inferred"; sourceText: string; status: "pending" | "review_ready"; version: 1 };
export const goalReviewJsonSchema = {
  type: "array", maxItems: 10, items: {
    type: "object", additionalProperties: false,
    required: ["inputId", "direction", "understanding", "contextAssessment", "connections", "planImplications", "uncertainties", "nextAction", "confidence"],
    properties: {
      inputId: { type: "string" }, direction: { type: "string" }, understanding: { type: "string" }, contextAssessment: { type: "string" },
      connections: { type: "array", maxItems: 5, items: {
        type: "object", additionalProperties: false, required: ["lane", "relationship", "explanation", "sourceRef", "sourceQuote"],
        properties: { lane: { type: "string" }, relationship: { type: "string", enum: ["complements", "tension", "alternative"] }, explanation: { type: "string" }, sourceRef: { type: "string" }, sourceQuote: { type: "string" } },
      } },
      planImplications: { type: "array", minItems: 1, maxItems: 4, items: { type: "string" } },
      uncertainties: { type: "array", minItems: 1, maxItems: 4, items: { type: "string" } },
      nextAction: { type: "string" }, confidence: { type: "string", enum: ["low", "medium", "high"] },
    },
  },
};
export function inputId(item: AdvisorEvidenceResponse) {
  return `goal-${createHash("sha256").update(JSON.stringify([item.question, item.answer, item.sourceNote ?? ""])).digest("hex").slice(0, 32)}`;
}
export function isStatedGoal(item: AdvisorEvidenceResponse) {
  return /^goal:/i.test(item.question) || Boolean(item.sourceNote?.startsWith("User intention;"));
}
function sourceText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(sourceText).join("\n");
  if (value && typeof value === "object") return Object.values(value).map(sourceText).join("\n");
  return "";
}
export function goalContext(context: AdvisorAnalysisContext, evidence: AdvisorEvidenceResponse[], intake?: IntakeForm) {
  const stated = new Map((context.currentGoalUpdates ?? []).map(item => [inputId(item), item]));
  const sources = new Map(evidence.map(item => [inputId(item), item.answer]));
  for (const [id, item] of stated) sources.set(id, item.answer);
  for (const item of context.newConversationSignals ?? []) sources.set(inputId(item), item.answer);
  if (intake) sources.set("intake", JSON.stringify(intake));
  if (context.priorAnalysis) sources.set("prior_analysis", sourceText(context.priorAnalysis));
  const lanes = new Set([...(context.existingLanes ?? []), ...(context.priorAnalysis?.roleBriefs ?? []).map(lane => lane.role)]);
  const superseded = new Set((context.currentGoalUpdates ?? []).map(goal => goal.supersedesGoalId).filter(Boolean));
  const previousReviews = Array.isArray(context.priorAnalysis?.goalReviews) ? context.priorAnalysis.goalReviews : [];
  const prior = previousReviews.filter(review => review && !superseded.has(review.inputId) && review.version === 1 && review.status === "review_ready" && review.direction !== "User-stated direction awaiting synthesis" && typeof review.sourceText === "string" && goalReviewSchema.safeParse(review).success);
  const pending = [...stated.keys()].filter(id => !prior.some(review => review.inputId === id));
  return {
    stated, sources, lanes, prior, pending,
    prompt: {
      statedGoals: [...stated].map(([id, item]) => ({ inputId: id, intention: item.answer })),
      pendingGoalIds: pending,
      reviewBatch: pending.slice(0, 3),
      potentialImpliedGoals: (context.newEvidenceResponses ?? []).filter(item => !isStatedGoal(item)).map(item => ({ inputId: inputId(item), text: item.answer })),
      newConversationInputs: (context.newConversationSignals ?? []).map(item => ({ inputId: inputId(item), text: item.answer })),
      contextSources: [...sources].map(([sourceRef, sourceText]) => ({ sourceRef, sourceText })),
      existingLanes: [...lanes],
      laneGrounding: (context.priorAnalysis?.roleBriefs ?? []).map(lane => ({ lane: lane.role, sourceRef: "prior_analysis", sourceQuote: lane.whyItFits || lane.role })),
      priorReviewIssues: context.priorAnalysis?.goalReviewIssues ?? [],
    },
  };
}
function pendingReview(id: string, sourceText: string): GoalReview {
  return { version: 1, inputId: id, sourceText, origin: "stated", status: "pending", direction: "User-stated direction awaiting synthesis", understanding: sourceText,
    contextAssessment: "The saved intention has not yet received a complete, grounded strategy interpretation.", connections: [],
    planImplications: ["This intention can guide exploration now; successful outcomes are not required before considering it."],
    uncertainties: ["Connections to existing lanes and feasibility still need interpretation; no market outcome is established by intention alone."],
    nextAction: "Review how this intention changes your options and choose a small test before committing further time or income.", confidence: "low" };
}
/** Structural coverage is NOT user agreement or proof of semantic correctness. */
export function reconcileGoalAnalysis(analysis: AdvisorAnalysis, context: AdvisorAnalysisContext, evidence: AdvisorEvidenceResponse[], intake: IntakeForm, candidates?: unknown): AdvisorAnalysis {
  analysis = { ...analysis, roleBriefs: retainCareerLanes(analysis.roleBriefs, context.priorAnalysis?.roleBriefs) };
  const goals = goalContext(context, evidence, intake);
  const allowedInferred = new Set([...(context.newEvidenceResponses ?? []), ...(context.newConversationSignals ?? [])].filter(item => !isStatedGoal(item)).map(inputId));
  const reviews = new Map<string, GoalReview>();
  const issues: Array<{ inputId: string; reason: string }> = [];
  for (const old of goals.prior) {
    // An unchanged valid assessment survives a later response omitting it. Sources remain attached.
    if (goals.stated.has(old.inputId) || old.origin === "inferred") reviews.set(old.inputId, old);
  }
  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  for (const raw of Array.isArray(candidates) ? candidates : []) {
    const parsed = goalReviewSchema.safeParse(raw);
    if (!parsed.success) { issues.push({ inputId: "unknown", reason: `Incomplete assessment: ${parsed.error.issues.map(issue => issue.path.join(".")).join(", ")}` }); continue; }
    const item = parsed.data;
    if (!goals.stated.has(item.inputId) && !allowedInferred.has(item.inputId)) { issues.push({ inputId: item.inputId, reason: "Unknown input reference" }); continue; }
    if (reviews.has(item.inputId) && !goals.pending.includes(item.inputId) && !(context.newEvidenceCount || context.newConversationSignals?.length)) continue;
    const grounded = item.connections.every(connection => goals.lanes.has(connection.lane) && goals.sources.has(connection.sourceRef) && normalize(goals.sources.get(connection.sourceRef)!).includes(normalize(connection.sourceQuote)));
    if (!grounded) {
      const invalid = item.connections.find(connection => !goals.lanes.has(connection.lane) || !goals.sources.has(connection.sourceRef) || !normalize(goals.sources.get(connection.sourceRef)!).includes(normalize(connection.sourceQuote)));
      issues.push({ inputId: item.inputId, reason: invalid && !goals.lanes.has(invalid.lane) ? "Unknown lane" : invalid && !goals.sources.has(invalid.sourceRef) ? "Unknown source reference" : "Source quote could not be matched" });
      continue;
    }
    if (item.direction === "User-stated direction awaiting synthesis") item.direction = item.connections[0]?.lane ?? "User-directed career exploration";
    reviews.set(item.inputId, { ...item, version: 1, sourceText: goals.sources.get(item.inputId) ?? "", origin: goals.stated.has(item.inputId) ? "stated" : "inferred", status: "review_ready" });
  }
  for (const [id, item] of goals.stated) if (!reviews.has(id)) {
    if (goals.pending.slice(0, 3).includes(id) && !issues.some(issue => issue.inputId === id)) issues.push({ inputId: id, reason: "Requested assessment was omitted or incomplete" });
    reviews.set(id, pendingReview(id, item.answer));
  }
  if (!reviews.size) return analysis;
  const changes = [...reviews.values()].filter(review => !goals.prior.some(old => old.inputId === review.inputId && JSON.stringify(goalReviewSchema.parse(old)) === JSON.stringify(goalReviewSchema.parse(review))));
  const pendingCount = [...reviews.values()].filter(review => review.status === "pending").length;
  const intentionOnly = context.newEvidenceResponses !== undefined && !context.newEvidenceResponses.some(item => !isStatedGoal(item)) && !context.newConversationSignals?.length && !context.newSourceEvidenceCount;
  const readyChanges = changes.filter(review => review.status === "review_ready");
  const summary = readyChanges.length
    ? `Direction added or revised: ${readyChanges.map(review => review.direction).join("; ")}. ${readyChanges.map(review => review.planImplications.join(" ")).join(" ")}`
    : pendingCount ? `${pendingCount} saved goal${pendingCount === 1 ? " still needs" : "s still need"} strategy interpretation. Your intentions can guide the plan now; a complete interpretation is still pending. User-stated direction: ${[...reviews.values()].filter(review => review.status === "pending").map(review => review.sourceText).join("; ")}` : analysis.summary;
  if (issues.length && analysis.mode === "ai") console.info("[goal-synthesis]", JSON.stringify(issues));
  return { ...analysis, summary, goalReviewIssues: issues, goalReviews: [...reviews.values()],
    changeLog: { ...analysis.changeLog,
      strengthened: intentionOnly ? [] : analysis.changeLog.strengthened,
      weakened: intentionOnly ? [] : analysis.changeLog.weakened,
      hasChanges: analysis.changeLog.hasChanges || readyChanges.length > 0,
      summary: pendingCount && !readyChanges.length ? `Goal review pending: ${pendingCount} intention${pendingCount === 1 ? " has" : "s have"} not received a complete interpretation. Included in a run does not mean addressed.` : readyChanges.length ? summary : analysis.changeLog.summary,
      directionChanges: readyChanges.map(review => review.direction),
      planImplications: readyChanges.flatMap(review => review.planImplications),
    },
  };
}

/** Goals must not disappear behind the advisor's 40-answer history window. Existing RLS applies. */
export async function loadSavedGoalEvidence(db: SupabaseClient, userId: string, includeNonGoals = false): Promise<AdvisorEvidenceResponse[]> {
  const goals: AdvisorEvidenceResponse[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from("career_sources").select("id,extracted_text,created_at").eq("user_id", userId).eq("source_type", "evidence_response")
      .order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + 499);
    if (error) throw new Error("Could not load saved goals; analysis stopped so none are silently omitted.");
    for (const row of data ?? []) {
      try {
        const payload = JSON.parse(row.extracted_text ?? "null");
        const response = payload?.response;
        if (typeof response?.question !== "string" || typeof response?.answer !== "string") continue;
        const stated = payload?.workbenchCapture?.kind === "goal" || isStatedGoal(response);
        if (stated || includeNonGoals) goals.push({ ...response,
          question: stated && !/^goal:/i.test(response.question) ? `goal: ${response.question}` : response.question,
          supersedesGoalId: payload?.workbenchCapture?.supersedesGoalId,
        });
      } catch { /* Unrelated malformed history cannot invent a goal. */ }
    }
    if ((data ?? []).length < 500) break;
  }
  const superseded = new Set(goals.map(goal => goal.supersedesGoalId).filter(Boolean));
  return [...new Map(goals.filter(goal => !superseded.has(inputId(goal))).map(goal => [inputId(goal), goal])).values()];
}
