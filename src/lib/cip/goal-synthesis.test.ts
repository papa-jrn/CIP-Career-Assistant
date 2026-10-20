import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDeterministicAnalysis, selectAnalysisTask, type AdvisorAnalysis, type AdvisorAnalysisContext, type AdvisorEvidenceResponse } from "./advisor";
import { goalContext, inputId, reconcileGoalAnalysis, type GoalProposal } from "./goal-synthesis";
import { renderGoalReviews } from "./goal-synthesis-view";
import { intakeFormSchema } from "./intake";
const intake = intakeFormSchema.parse({ resume_text: "Experienced professional leading technical delivery, operations, and mentoring across teams." });
const draft = { strengths: ["Technical delivery"], possibleRoles: ["Technical leader"], nextQuestions: [], evidenceChecklist: [] };
const goal = (answer: string): AdvisorEvidenceResponse => ({ question: "goal: Career direction", answer, confidence: "needs_verification", sourceNote: "User intention; not proof of capability or market demand." });
const founder = goal("I want to launch my own subscription product and test whether it can support my income.");
const prior: Partial<AdvisorAnalysis> = { summary: "Employment in technical leadership", roleBriefs: [{ role: "Technical leader", whyItFits: "Led technical delivery and mentoring.", evidenceNeeded: "Scope of decisions", searchTargets: [] }] };
function context(item = founder): AdvisorAnalysisContext { return { priorAnalysis: prior, currentGoalUpdates: [item], newEvidenceResponses: [], newEvidenceCount: 0 }; }
function base(): AdvisorAnalysis { return buildDeterministicAnalysis(intake, draft, [], {}); }
function proposal(item = founder): GoalProposal { return { inputId: inputId(item), direction: "Explore an independent product direction", understanding: "You want to explore a different route to income.", contextAssessment: "This can run alongside employment exploration; the intention does not prove feasibility.", connections: [{ lane: "Technical leader", relationship: "complements", explanation: "Product delivery may provide additional technical decision-making examples.", sourceRef: "prior_analysis", sourceQuote: "Led technical delivery and mentoring." }], planImplications: ["Explore the stated direction alongside existing income options."], uncertainties: ["Demand, capacity, and financial feasibility have not been established."], nextAction: "Run one small test with prospective users and record what you learn.", confidence: "medium" }; }
beforeEach(() => vi.stubEnv("OPENAI_API_KEY", ""));
describe("source-linked goal synthesis", () => {
  it.each([
    "I want to launch a subscription product and create my own job.",
    "I want to move from management into hands-on conservation work.",
    "I need a shorter workweek so I can care for a family member.",
  ])("does not equate included input with adequate interpretation: %s", answer => {
    const input = goal(answer);
    const result = reconcileGoalAnalysis(base(), context(input), [], intake, []);
    expect(result.goalReviews?.[0].sourceText).toBe(answer);
    expect(result.goalReviews?.[0].status).toBe("pending");
    expect(result.changeLog.summary).toContain("pending");
    expect(goalContext({ ...context(input), priorAnalysis: result }, []).pending).toEqual([inputId(input)]);
  });
  it("recognizes a complete grounded plan revision without any newly saved evidence", () => {
    const result = reconcileGoalAnalysis(base(), context(), [], intake, [proposal()]);
    expect(result.changeLog.hasChanges).toBe(true);
    expect(result.changeLog.directionChanges).toEqual([proposal().direction]);
    expect(result.changeLog.planImplications).toEqual(proposal().planImplications);
    expect(result.goalReviews?.[0]).toMatchObject({ origin: "stated", status: "review_ready", confidence: "medium" });
    expect(result.summary).toContain(proposal().direction);
  });
  it("does not turn an intention-only revision into proof-score movement", () => {
    const candidate = base();
    candidate.changeLog.strengthened = ["Invented increase in technical capability"];
    const result = reconcileGoalAnalysis(candidate, context(), [], intake, [proposal()]);
    expect(result.changeLog.strengthened).toEqual([]);
    expect(result.changeLog.directionChanges).toHaveLength(1);
  });
  it("retains an addressed interpretation without repeating a direction change", () => {
    const first = reconcileGoalAnalysis(base(), context(), [], intake, [proposal()]);
    const second = reconcileGoalAnalysis(base(), { ...context(), priorAnalysis: first }, [], intake, []);
    expect(second.goalReviews).toEqual(first.goalReviews);
    expect(second.changeLog.directionChanges).toEqual([]);
    expect(goalContext({ ...context(), priorAnalysis: second }, []).pending).toEqual([]);
  });
  it.each([
    { ...proposal(), nextAction: "" },
    { ...proposal(), uncertainties: [] },
    { ...proposal(), planImplications: [] },
    { ...proposal(), connections: [{ ...proposal().connections[0], lane: "Invented lane" }] },
    { ...proposal(), connections: [{ ...proposal().connections[0], sourceQuote: "Invented success and paying customers" }] },
    { ...proposal(), connections: [{ ...proposal().connections[0], sourceRef: "unknown-source" }] },
  ])("keeps incomplete or ungrounded model output pending", candidate => {
    expect(reconcileGoalAnalysis(base(), context(), [], intake, [candidate]).goalReviews?.[0].status).toBe("pending");
  });
  it("keeps attributed prior-analysis context available when a quote moves into saved review history", () => {
    const historical = { ...prior, claimSafetyNotes: ['Earlier analysis described "technical leadership" as an inference.'] };
    const candidate = { ...proposal(), connections: [{ ...proposal().connections[0], sourceQuote: 'Earlier analysis described "technical leadership" as an inference.' }] };
    const result = reconcileGoalAnalysis(base(), { ...context(), priorAnalysis: historical }, [], intake, [candidate]);
    expect(result.goalReviews?.[0].status).toBe("review_ready");
    expect(result.goalReviews?.[0].connections[0].sourceQuote).toBe(candidate.connections[0].sourceQuote);
  });
  it("does not invent a lane connection when no current lane fits", () => {
    const result = reconcileGoalAnalysis(base(), context(), [], intake, [{ ...proposal(), connections: [], contextAssessment: "This goal is a separate experiment; no existing lane supplies a clear match yet." }]);
    expect(result.goalReviews?.[0].status).toBe("review_ready");
    expect(result.goalReviews?.[0].connections).toEqual([]);
  });
  it("labels an implied goal as inference, not a user-stated preference", () => {
    const input = { question: "Recent work", answer: "I have enjoyed mentoring apprentices more than supervising schedules.", confidence: "known" };
    const ctx = { priorAnalysis: prior, newEvidenceResponses: [input] };
    const result = reconcileGoalAnalysis(base(), ctx, [input], intake, [{ ...proposal(input), direction: "Possible interest in mentoring work" }]);
    expect(result.goalReviews?.[0].origin).toBe("inferred");
    expect(renderGoalReviews(result.goalReviews)).toContain("Possible implied goal — please confirm");
  });
  it("rejects invented input IDs and does not treat corrections as already reviewed", () => {
    const first = reconcileGoalAnalysis(base(), context(), [], intake, [proposal()]);
    const correction = { ...goal("I want to keep this as a side project rather than replace employment."), supersedesGoalId: inputId(founder) };
    const ctx = { priorAnalysis: first, currentGoalUpdates: [correction] };
    const result = reconcileGoalAnalysis(base(), ctx, [], intake, [{ ...proposal(), inputId: "invented" }]);
    expect(result.goalReviews).toHaveLength(1);
    expect(result.goalReviews?.[0]).toMatchObject({ inputId: inputId(correction), status: "pending" });
  });
  it("does not let a stale pending placeholder become the interpreted direction", () => {
    const result = reconcileGoalAnalysis(base(), context(), [], intake, [{ ...proposal(), direction: "User-stated direction awaiting synthesis" }]);
    expect(result.goalReviews?.[0].direction).toBe("Technical leader");
    expect(result.changeLog.directionChanges).not.toContain("User-stated direction awaiting synthesis");
  });
  it("uses goal-reconciliation mode even when evidence readiness is complete", () => {
    expect(selectAnalysisTask({ phase: "complete", pendingGoalCount: 1, newConversationSignalCount: 0, newEvidenceCount: 0, evidenceResponseCount: 30 })).toContain("Goal-to-strategy reconciliation");
  });
  it("fallback retains goals but does not claim to have synthesized them", () => {
    const result = buildDeterministicAnalysis(intake, draft, [founder], context());
    expect(result.goalReviews?.[0].status).toBe("pending");
    expect(result.goalReviews?.[0].connections).toEqual([]);
    expect(result.summary).not.toContain("unchanged");
  });
  it("escapes source text and proposed actions in the shared view", () => {
    const result = reconcileGoalAnalysis(base(), context(), [], intake, [{ ...proposal(), nextAction: '<script>alert("x")</script>' }]);
    const html = renderGoalReviews(result.goalReviews);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("AI inference · medium confidence");
    expect(html).toContain("Correct or replace this goal");
  });
});
