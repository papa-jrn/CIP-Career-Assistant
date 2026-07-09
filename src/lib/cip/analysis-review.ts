import type { AdvisorAnalysis, AdvisorEvidenceResponse } from "@/lib/cip/advisor";
import type { IntakeForm } from "@/lib/cip/intake";

export type ReviewVerdict = "answered" | "partially_answered" | "not_enough_evidence" | "needs_follow_up";

export interface AnalysisReviewAnswer {
  question: string;
  verdict: ReviewVerdict;
  directAnswer: string;
  supportingEvidence: string[];
  missingEvidence: string[];
  recommendedNextAction: string;
}

export interface AnalysisReview {
  mode: "ai" | "deterministic";
  summary: string;
  answers: AnalysisReviewAnswer[];
}

// Max characters kept per strategic question. A question is a sentence, so
// 500 is generous; capping bounds prompt size and token spend regardless of
// what the user pastes in.
const MAX_QUESTION_LENGTH = 500;

export function parseStrategicQuestions(form: FormData) {
  return getText(form, "strategic_questions")
    .split(/\n+/)
    .map((question) => question.trim().slice(0, MAX_QUESTION_LENGTH))
    .filter(Boolean)
    .slice(0, 6);
}

export async function buildAnalysisReview({
  intake,
  evidenceResponses,
  latestAnalysis,
  questions,
}: {
  intake: IntakeForm;
  evidenceResponses: AdvisorEvidenceResponse[];
  latestAnalysis: Partial<AdvisorAnalysis> | null;
  questions: string[];
}): Promise<AnalysisReview> {
  const openAiKey = import.meta.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (openAiKey) {
    const ai = await tryBuildAiReview({ intake, evidenceResponses, latestAnalysis, questions, openAiKey });
    if (ai) return ai;
  }

  return buildDeterministicReview({ evidenceResponses, latestAnalysis, questions });
}

async function tryBuildAiReview({
  intake,
  evidenceResponses,
  latestAnalysis,
  questions,
  openAiKey,
}: {
  intake: IntakeForm;
  evidenceResponses: AdvisorEvidenceResponse[];
  latestAnalysis: Partial<AdvisorAnalysis> | null;
  questions: string[];
  openAiKey: string;
}) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: import.meta.env.OPENAI_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini",
      max_output_tokens: 5000,
      input: [
        {
          role: "system",
          content:
            "You are a rigorous career strategy partner. Answer the user's specific strategic questions using only the supplied intake, saved evidence, and latest analysis. Do not flatter. Do not invent facts. Label whether each question is answered, partially answered, unsupported, or needs follow-up. If evidence is weak, say so clearly and ask for the missing proof.",
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Answer the user's strategic career questions from the saved evidence.",
            questions,
            intake,
            evidenceResponses,
            latestAnalysis,
          }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "career_analysis_review",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["summary", "answers"],
            properties: {
              summary: { type: "string" },
              answers: {
                type: "array",
                minItems: 1,
                maxItems: 6,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: [
                    "question",
                    "verdict",
                    "directAnswer",
                    "supportingEvidence",
                    "missingEvidence",
                    "recommendedNextAction",
                  ],
                  properties: {
                    question: { type: "string" },
                    verdict: {
                      type: "string",
                      enum: ["answered", "partially_answered", "not_enough_evidence", "needs_follow_up"],
                    },
                    directAnswer: { type: "string" },
                    supportingEvidence: {
                      type: "array",
                      items: { type: "string" },
                      minItems: 1,
                      maxItems: 5,
                    },
                    missingEvidence: {
                      type: "array",
                      items: { type: "string" },
                      minItems: 1,
                      maxItems: 5,
                    },
                    recommendedNextAction: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    }),
  });

  if (!response.ok) return null;

  const payload = await response.json();
  const text = extractResponseText(payload);
  if (!text) return null;

  try {
    const parsed = JSON.parse(text) as Omit<AnalysisReview, "mode">;
    return {
      mode: "ai" as const,
      summary: parsed.summary,
      answers: parsed.answers,
    };
  } catch {
    return null;
  }
}

function buildDeterministicReview({
  evidenceResponses,
  latestAnalysis,
  questions,
}: {
  evidenceResponses: AdvisorEvidenceResponse[];
  latestAnalysis: Partial<AdvisorAnalysis> | null;
  questions: string[];
}): AnalysisReview {
  return {
    mode: "deterministic",
    summary:
      "This deterministic review can only do keyword overlap. Add OPENAI_API_KEY for a real strategic synthesis of the user's specific questions.",
    answers: questions.map((question) => {
      const terms = question
        .toLowerCase()
        .split(/\W+/)
        .filter((term) => term.length > 4);
      const matches = evidenceResponses.filter((response) =>
        terms.some((term) => `${response.question} ${response.answer}`.toLowerCase().includes(term)),
      );
      const hasMatch = matches.length > 0;
      return {
        question,
        verdict: hasMatch ? "partially_answered" : "not_enough_evidence",
        directAnswer: hasMatch
          ? "There is some related saved evidence, but this needs AI synthesis or a human review before becoming a firm strategic answer."
          : "The saved evidence does not clearly answer this yet.",
        supportingEvidence: hasMatch
          ? matches.slice(0, 3).map((match) => excerpt(`${match.question}: ${match.answer}`))
          : [latestAnalysis?.summary ?? "No matching saved evidence found."],
        missingEvidence: [
          "A direct answer in the user's own words",
          "Specific proof, metric, source, or example tied to this question",
        ],
        recommendedNextAction: "Add one targeted evidence answer for this question, then run AI review again.",
      };
    }),
  };
}

function extractResponseText(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const direct = (payload as { output_text?: unknown }).output_text;
  if (typeof direct === "string") return direct;

  const output = (payload as { output?: unknown }).output;
  if (!Array.isArray(output)) return null;

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string") return text;
    }
  }

  return null;
}

function excerpt(value: string, max = 220) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}...` : cleaned || "No evidence text supplied.";
}

function getText(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}
