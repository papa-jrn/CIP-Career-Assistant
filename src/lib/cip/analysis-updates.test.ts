import { describe, expect, it, vi } from "vitest";
import { collectAnalysisUpdates } from "./analysis-updates";
import { buildDeterministicAnalysis } from "./advisor";
import { intakeFormSchema } from "./intake";
vi.stubEnv("OPENAI_API_KEY", "");
const goal = { question: "goal: Career update", answer: "I want to finish and launch my AI SaaS product, test demand and find paying customers, creating my own job.", confidence: "needs_verification", sourceNote: "User intention; not proof of capability or market demand.", savedAt: "2026-10-19T16:20:00Z" };
const old = { question: "Team size", answer: "Supervised four people.", confidence: "known", savedAt: "2026-10-07T12:00:00Z" };
describe("explicit strategy updates", () => {
  it("identifies the actual new answer instead of only its count", () => {
    const updates = collectAnalysisUpdates([goal, old], "2026-10-19T16:00:00Z");
    expect(updates.newEvidenceResponses).toEqual([goal]);
    expect(updates.currentGoalUpdates[0].answer).toBe(goal.answer);
  });
  it("retains intentions on later passes without calling them new", () => {
    const updates = collectAnalysisUpdates([goal, old], "2026-10-19T16:30:00Z");
    expect(updates.newEvidenceResponses).toEqual([]);
    expect(updates.currentGoalUpdates).toEqual([goal]);
  });
  it("includes a founder's full intention in deterministic output without claiming viability", () => {
    const result = buildDeterministicAnalysis(intakeFormSchema.parse({ resume_text: "Operations leader with twenty years of experience managing teams and delivering digital projects." }), { strengths: [], possibleRoles: [], evidenceChecklist: [], nextQuestions: [] }, [goal, old], {
      ...collectAnalysisUpdates([goal, old], "2026-10-19T16:00:00Z"), newEvidenceCount: 1, priorAnalysis: { summary: "Prior employment direction" },
    });
    expect(result.summary).toContain(goal.answer);
    expect(result.explorationAreas[0].whyExplore).toContain(goal.answer);
    expect(result.explorationAreas[0].evidenceToFind.join()).toContain("does not establish commercial viability");
    expect(result.positioning.join()).toContain("User-stated direction");
  });
});
