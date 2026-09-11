// Regression coverage for the Autumn 2026 loop failure (Next Steps.md Round 3,
// plan Phase 1): the engine used to mark itself "complete" after a few analysis
// rounds and then ignored every new conversation the user entered. These tests
// pin the repaired behavior: readiness phases never shut the engine down, new
// strategic inputs always trigger change detection, and an honest "nothing
// changed" is produced when no new input exists.

import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAdvisorAnalysis, selectAnalysisTask, type AdvisorAnalysis } from "@/lib/cip/advisor";
import { calculateEvidenceSufficiency, type EvidenceSufficiencyScore } from "@/lib/cip/evidence-sufficiency";
import { intakeFormSchema } from "@/lib/cip/intake";

// Force the deterministic advisor path in tests; never call the real API.
vi.stubEnv("OPENAI_API_KEY", "");
vi.stubEnv("OPENAI_MODEL", "test-model");

afterEach(() => {
  vi.unstubAllEnvs();
});

// A complete IntakeForm via the real schema so every field has its default.
const intake = intakeFormSchema.parse({
  resume_text:
    "Operations and communications lead, 2012 to present. Ran programs, teams, budgets, and vendor relationships across several organizations.",
});

const draft = {
  strengths: ["operations leadership", "communications"],
  possibleRoles: ["Program Operations Lead"],
  evidenceChecklist: [],
  nextQuestions: [],
};

let seed = 0;
function makeEvidence(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    question: `Evidence question ${seed + i}`,
    answer: `Detailed answer ${seed + i}: led a cross-functional effort, improved turnaround time, stakeholders confirmed the result, with follow-up artifacts, metrics, and sources attached.`,
    confidence: "known",
    proofUrl: "",
    sourceNote: "",
  })).map((item) => {
    seed += 1;
    return item;
  });
}

const sarahConversation = {
  question: 'What did the conversation captured in "sarah-nonprofit-chat" teach you about your market, lanes, or targets?',
  answer:
    "Sarah was direct: local nonprofits never hire an AI operations strategist under that title. The real buying language is program operations and workflow modernization. Compensation runs lower than tech but mission fit is strong. She offered two named introductions.",
  confidence: "first-hand conversation notes",
  sourceNote: "Loop-back conversation notes saved 2026-08-01",
};

describe("evidence sufficiency (loop repair)", () => {
  it("never reaches 'complete' because of analysis-round count alone (the founder regression)", () => {
    const score = calculateEvidenceSufficiency(intake, makeEvidence(3), { evidenceRound: 12 });
    expect(score.phase).not.toBe("complete");
    expect(score.phase).toBe("building");
  });

  it("still marks readiness complete on evidence volume, as 'enough to act' only", () => {
    const score = calculateEvidenceSufficiency(intake, makeEvidence(30));
    expect(score.phase).toBe("complete");
    expect(score.reason).toMatch(/not a stop sign/i);
  });
});

describe("analysis task selection (loop repair)", () => {
  it("selects change detection when new signals exist, even at readiness complete", () => {
    const task = selectAnalysisTask({
      phase: "complete",
      newConversationSignalCount: 2,
      newEvidenceCount: 0,
      evidenceResponseCount: 40,
    });
    expect(task).toMatch(/change-detection/i);
    expect(task).not.toMatch(/do not ask for more proof/i);
  });

  it("selects opportunity mapping only when complete AND nothing new arrived", () => {
    const task = selectAnalysisTask({
      phase: "complete",
      newConversationSignalCount: 0,
      newEvidenceCount: 0,
      evidenceResponseCount: 40,
    });
    expect(task).toMatch(/opportunity-mapping/i);
    expect(task).toMatch(/say so honestly/i);
  });

  it("selects the standard task below saturation", () => {
    const task = selectAnalysisTask({
      phase: "building",
      newConversationSignalCount: 0,
      newEvidenceCount: 0,
      evidenceResponseCount: 4,
    });
    expect(task).toMatch(/re-analyze/i);
  });
});

describe("advisor change detection (founder scenario)", () => {
  const completeReadiness: EvidenceSufficiencyScore = {
    rawCareerYears: 14,
    scoreYears: 14,
    usefulEvidenceCount: 30,
    score: 214,
    phase: "complete",
    reason: "",
  };

  it("engages with a new conversation signal even when readiness is complete", async () => {
    const prior: Partial<AdvisorAnalysis> = {
      summary: "AI operations strategist is the strongest lane.",
      followUpQuestions: ["Which 3-5 industries should we actively target first, and which should remain excluded?"],
    };

    const analysis = await buildAdvisorAnalysis(intake, draft, makeEvidence(30), {
      sufficiency: completeReadiness,
      priorAnalysis: prior,
      priorAnalysisAt: "2026-07-06T12:00:00.000Z",
      newConversationSignals: [sarahConversation],
      newEvidenceCount: 0,
    });

    expect(analysis.mode).toBe("deterministic");
    expect(analysis.changeLog.hasChanges).toBe(true);
    expect(analysis.changeLog.summary).toMatch(/1 new conversation signal/);
    expect(analysis.changeLog.summary).toMatch(/2026-07-06/);
    // The engine must visibly engage the new input, not emit generic questions.
    expect(analysis.followUpQuestions[0]).toMatch(/conversation signals/i);
    // The signal becomes first-class ledger evidence.
    expect(analysis.evidenceLedger.some((item) => item.claim.startsWith("New conversation signal"))).toBe(true);
  });

  it("reports honestly when nothing new has arrived since the prior analysis", async () => {
    const analysis = await buildAdvisorAnalysis(intake, draft, makeEvidence(5), {
      priorAnalysis: { summary: "prior pass", followUpQuestions: ["Q1?"] },
      priorAnalysisAt: "2026-07-06T12:00:00.000Z",
    });

    expect(analysis.changeLog.hasChanges).toBe(false);
    expect(analysis.changeLog.summary).toMatch(/no new evidence answers or conversation signals/i);
    expect(analysis.changeLog.summary).toMatch(/unchanged/);
  });

  it("retires prior questions the new signals appear to answer", async () => {
    const prior: Partial<AdvisorAnalysis> = {
      summary: "prior pass",
      followUpQuestions: [
        "Do local nonprofits ever use the program operations title, and is their compensation workable for you?",
      ],
    };

    const analysis = await buildAdvisorAnalysis(intake, draft, makeEvidence(2), {
      priorAnalysis: prior,
      priorAnalysisAt: "2026-07-06T12:00:00.000Z",
      newConversationSignals: [sarahConversation],
      newEvidenceCount: 0,
    });

    expect(analysis.changeLog.hasChanges).toBe(true);
    expect(analysis.changeLog.newlyAnswered.length).toBe(1);
    expect(analysis.changeLog.newlyAnswered[0]).toMatch(/program operations title/i);
  });

  it("treats a first pass as a baseline without fabricating a diff", async () => {
    const analysis = await buildAdvisorAnalysis(intake, draft, makeEvidence(2), {
      newConversationSignals: [sarahConversation],
      newEvidenceCount: 0,
    });

    expect(analysis.changeLog.hasChanges).toBe(true);
    expect(analysis.changeLog.summary).toMatch(/no prior saved analysis/i);
  });
});
