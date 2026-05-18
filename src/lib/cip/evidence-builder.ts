import type { AdvisorAnalysis } from "@/lib/cip/advisor";
import type { EvidenceSufficiencyPhase } from "@/lib/cip/evidence-sufficiency";
import type { IntakeForm } from "@/lib/cip/intake";

export interface EvidenceCard {
  id: string;
  source: "advisor_question" | "proof_gap" | "exploration_lane" | "story_builder" | "opportunity_mapping";
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

export interface EvidenceCardOptions {
  phase?: EvidenceSufficiencyPhase;
}

export function buildEvidenceCards(
  intake: Partial<IntakeForm>,
  draft?: { evidenceChecklist?: string[]; nextQuestions?: string[] },
  advisor?: Partial<AdvisorAnalysis>,
  options: EvidenceCardOptions = {},
): EvidenceCard[] {
  if (options.phase === "complete") return [];

  const cards: EvidenceCard[] = [];
  const enhancementOnly = options.phase === "enhancement";

  for (const [index, question] of (advisor?.followUpQuestions ?? draft?.nextQuestions ?? []).entries()) {
    const isOpportunityQuestion = isOpportunityMappingQuestion(question);
    const isEnhancementQuestion = enhancementOnly || isEnhancementPrompt(question);
    cards.push({
      id: `advisor-${index}`,
      source: isOpportunityQuestion || isEnhancementQuestion ? "opportunity_mapping" : "advisor_question",
      question,
      whyItMatters: isEnhancementQuestion
        ? "The evidence base is already strong. This final pass is only for strengthening the most useful positioning angles before opportunity mapping."
        : isOpportunityQuestion
        ? "The evidence base is strong enough to start turning the profile into a search, employer, and networking map."
        : "This answer helps turn the analysis from a hypothesis into a defensible career story.",
      helpfulAnswer: isEnhancementQuestion
        ? [
            "A missing accomplishment or project that would sharpen the strongest story",
            "A direction, industry, or employer type to avoid",
            "A private detail that can guide strategy without becoming public copy",
            "Which proof-backed story should anchor the next phase",
          ]
        : isOpportunityQuestion
        ? [
            "Target industries, employer types, or exclusions",
            "Geography, commute, remote, or hybrid constraints",
            "LinkedIn exports, alumni paths, or warm-introduction leads",
            "Which proof-backed story should open conversations",
          ]
        : [
            "A concrete example",
            "Who or what was affected",
            "What changed because of your work",
            "Any metric, artifact, link, or person who could verify it",
          ],
    });
  }

  if (enhancementOnly) return dedupeCards(cards).slice(0, 6);

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

export function renderEvidenceCardsHtml(cards: EvidenceCard[]) {
  if (!cards.length) return "";

  return `
    <div class="mt-6 grid gap-5">
      ${cards.map(renderEvidenceCard).join("")}
    </div>
  `;
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

function renderEvidenceCard(card: EvidenceCard, index: number) {
  return `
    <article class="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-xs font-semibold uppercase text-[var(--accent-strong)]">${escapeHtml(sourceLabel(card.source))}</p>
          <h2 class="mt-1 text-xl font-semibold">${escapeHtml(card.question)}</h2>
        </div>
        <span class="rounded-md border border-[var(--line)] bg-[var(--background)] px-2 py-1 text-xs font-semibold text-[var(--muted)]">Question ${index + 1}</span>
      </div>
      <p class="mt-3 text-sm leading-6 text-[var(--muted)]">${escapeHtml(card.whyItMatters)}</p>
      <div class="mt-4 rounded-md border border-[var(--line)] bg-[var(--background)] p-4">
        <p class="text-xs font-semibold uppercase text-[var(--muted)]">A useful answer includes</p>
        <ul class="mt-2 grid gap-2 text-sm text-[var(--muted)] md:grid-cols-2">
          ${card.helpfulAnswer.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </div>

      <form class="mt-5 grid gap-4" hx-post="/api/evidence/save" hx-target="#evidence-result-${escapeHtml(card.id)}" hx-swap="innerHTML">
        <input type="hidden" name="question_id" value="${escapeHtml(card.id)}" />
        <input type="hidden" name="question" value="${escapeHtml(card.question)}" />
        <label class="grid gap-2">
          <span class="text-sm font-semibold">Your answer</span>
          <textarea name="answer" required class="min-h-32 rounded-md border border-[var(--line)] bg-[var(--background)] p-3 text-sm" placeholder="Rough notes are fine. Situation, action, scope, result, proof."></textarea>
        </label>
        <div class="grid gap-4 md:grid-cols-3">
          <label class="grid gap-2">
            <span class="text-sm font-semibold">Confidence</span>
            <select name="confidence" class="rounded-md border border-[var(--line)] bg-[var(--background)] p-3 text-sm">
              <option value="known">I know this</option>
              <option value="needs_metric">Need metric</option>
              <option value="needs_source">Need source</option>
              <option value="not_sure">Not sure yet</option>
            </select>
          </label>
          <label class="grid gap-2 md:col-span-2">
            <span class="text-sm font-semibold">Proof link or source</span>
            <input name="proof_url" class="rounded-md border border-[var(--line)] bg-[var(--background)] p-3 text-sm" placeholder="URL, document name, person, project, or private source note" />
          </label>
        </div>
        <label class="grid gap-2">
          <span class="text-sm font-semibold">What should the AI be careful about?</span>
          <input name="source_note" class="rounded-md border border-[var(--line)] bg-[var(--background)] p-3 text-sm" placeholder="Example: private client, estimate only, needs exact date, don't use publicly yet." />
        </label>
        <div class="flex flex-wrap items-center gap-3">
          <button class="cip-fancy-button" type="submit"><span>Save evidence</span></button>
          <div id="evidence-result-${escapeHtml(card.id)}" class="text-sm text-[var(--muted)]" aria-live="polite"></div>
        </div>
      </form>
    </article>
  `;
}

function sourceLabel(source: string) {
  return source.replaceAll("_", " ");
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isOpenGap(gap: string) {
  const lower = gap.toLowerCase();
  return lower.startsWith("add ") || lower.startsWith("separate ") || lower.includes("needs") || lower.includes("missing");
}

function isOpportunityMappingQuestion(question: string) {
  const normalized = question.toLowerCase();
  return [
    "industr",
    "geograph",
    "remote",
    "employer",
    "linkedin",
    "connection",
    "alumni",
    "network",
    "introduction",
    "outreach",
  ].some((term) => normalized.includes(term));
}

function isEnhancementPrompt(question: string) {
  const normalized = question.toLowerCase();
  return ["enhance", "stronger", "sharpen", "underweighted", "anchor", "private", "avoid"].some((term) =>
    normalized.includes(term),
  );
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
