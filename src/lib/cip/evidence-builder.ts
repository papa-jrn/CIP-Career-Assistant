import type { AdvisorAnalysis } from "@/lib/cip/advisor";
import type { IntakeForm } from "@/lib/cip/intake";

export interface EvidenceCard {
  id: string;
  source: "advisor_question" | "proof_gap" | "exploration_lane" | "story_builder";
  question: string;
  whyItMatters: string;
  helpfulAnswer: string[];
}

export interface EvidenceResponsePayload {
  questionId: string;
  question: string;
  answer: string;
  confidence: string;
  proofUrl: string;
  sourceNote: string;
}

export function buildEvidenceCards(
  intake: Partial<IntakeForm>,
  draft?: { evidenceChecklist?: string[]; nextQuestions?: string[] },
  advisor?: Partial<AdvisorAnalysis>,
): EvidenceCard[] {
  const cards: EvidenceCard[] = [];

  for (const [index, question] of (advisor?.followUpQuestions ?? draft?.nextQuestions ?? []).entries()) {
    cards.push({
      id: `advisor-${index}`,
      source: "advisor_question",
      question,
      whyItMatters: "This answer helps turn the analysis from a hypothesis into a defensible career story.",
      helpfulAnswer: [
        "A concrete example",
        "Who or what was affected",
        "What changed because of your work",
        "Any metric, artifact, link, or person who could verify it",
      ],
    });
  }

  for (const [index, gap] of (draft?.evidenceChecklist ?? []).entries()) {
    if (!isOpenGap(gap)) continue;
    cards.push({
      id: `gap-${index}`,
      source: "proof_gap",
      question: gapToQuestion(gap),
      whyItMatters: "The app should not use this claim strongly until the missing evidence is supplied or ruled out.",
      helpfulAnswer: [
        "Whether the evidence exists",
        "Where it can be found",
        "Whether it is public, private, or needs redaction",
        "How confident you are that it should influence career recommendations",
      ],
    });
  }

  for (const [laneIndex, lane] of (advisor?.explorationAreas ?? []).entries()) {
    for (const [itemIndex, item] of (lane.evidenceToFind ?? []).entries()) {
      cards.push({
        id: `lane-${laneIndex}-${itemIndex}`,
        source: "exploration_lane",
        question: `What proof do we have for "${item}" in the ${lane.area} lane?`,
        whyItMatters: lane.whyExplore ?? "This exploration lane needs evidence before it becomes a recommendation.",
        helpfulAnswer: [
          "Existing work, project, or story that supports it",
          "Missing proof that would make the lane stronger",
          "A small experiment that could test the lane",
        ],
      });
    }
  }

  if (cards.length < 4) {
    cards.push(
      {
        id: "story-process",
        source: "story_builder",
        question: "Tell me about a time you improved a process, workflow, system, or handoff.",
        whyItMatters: "Process-improvement stories often reveal transferable operating strength that resumes undersell.",
        helpfulAnswer: ["What was broken", "What you changed", "Who was affected", "What improved", "How we could prove it"],
      },
      {
        id: "story-scale",
        source: "story_builder",
        question: "Which accomplishment had more scale than your resume currently shows?",
        whyItMatters: "Scale is often the difference between a nice story and a strong positioning claim.",
        helpfulAnswer: ["Number of people, customers, students, dollars, projects, locations, or hours affected", "Before/after state", "Source of the estimate"],
      },
      {
        id: "story-hidden",
        source: "story_builder",
        question: "What is one useful thing you can do that people only discover after working with you?",
        whyItMatters: "Hidden strengths can become excellent interview stories if we can attach evidence.",
        helpfulAnswer: ["The strength", "A real example", "Why it matters at work", "Who has seen it"],
      },
    );
  }

  return dedupeCards(cards).slice(0, 12);
}

export function parseEvidenceResponse(form: FormData): EvidenceResponsePayload {
  return {
    questionId: getText(form, "question_id"),
    question: getText(form, "question"),
    answer: getText(form, "answer"),
    confidence: getText(form, "confidence"),
    proofUrl: getText(form, "proof_url"),
    sourceNote: getText(form, "source_note"),
  };
}

function isOpenGap(gap: string) {
  const lower = gap.toLowerCase();
  return lower.startsWith("add ") || lower.startsWith("separate ") || lower.includes("needs") || lower.includes("missing");
}

function gapToQuestion(gap: string) {
  if (gap.toLowerCase().startsWith("add ")) return `Can you add or describe this evidence: ${gap}?`;
  return `Can you clarify this proof gap: ${gap}?`;
}

function dedupeCards(cards: EvidenceCard[]) {
  const seen = new Set<string>();
  return cards.filter((card) => {
    const key = card.question.toLowerCase().replace(/\s+/g, " ").trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getText(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}
