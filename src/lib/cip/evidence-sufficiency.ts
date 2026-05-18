import type { AdvisorEvidenceResponse } from "@/lib/cip/advisor";
import type { IntakeForm } from "@/lib/cip/intake";

export type EvidenceSufficiencyPhase = "building" | "strengthening" | "enhancement" | "complete";

export interface EvidenceSufficiencyScore {
  rawCareerYears: number;
  scoreYears: number;
  usefulEvidenceCount: number;
  score: number;
  phase: EvidenceSufficiencyPhase;
  reason: string;
}

export function calculateEvidenceSufficiency(
  intake: Partial<IntakeForm>,
  evidenceResponses: AdvisorEvidenceResponse[] = [],
  context: { evidenceRound?: number; sourceEvidenceCount?: number } = {},
): EvidenceSufficiencyScore {
  const rawCareerYears = detectCareerYears(intake);
  const scoreYears = clamp(rawCareerYears, 5, 20);
  const usefulEvidenceCount = countUsefulEvidence(evidenceResponses);
  const score = Math.round((usefulEvidenceCount / scoreYears) * 100);
  const evidenceRound = context.evidenceRound ?? 0;

  let phase: EvidenceSufficiencyPhase = "building";
  let reason = "The profile still needs core evidence before opportunity mapping.";

  if (usefulEvidenceCount >= 25) {
    phase = "complete";
    reason = "The profile has a high volume of useful evidence. More standard proof questions are likely diminishing returns.";
  } else if (evidenceRound >= 4) {
    phase = "complete";
    reason = "The user has completed several evidence-analysis rounds. The app should move forward unless a true contradiction blocks strategy.";
  } else if (score >= 100 && evidenceRound >= 3) {
    phase = "complete";
    reason = "The evidence score is saturated and the final refinement pass has had enough room to run.";
  } else if (score >= 100) {
    phase = "enhancement";
    reason = "The evidence score is saturated. Ask only one final enhancement round focused on strengthening the best positioning angles.";
  } else if (score >= 75) {
    phase = "strengthening";
    reason = "The profile has a solid evidence base. Ask only high-value questions that could change positioning or strategy.";
  }

  return {
    rawCareerYears,
    scoreYears,
    usefulEvidenceCount,
    score,
    phase,
    reason,
  };
}

export function isEvidenceComplete(score: EvidenceSufficiencyScore) {
  return score.phase === "complete";
}

export function isEvidenceSaturated(score: EvidenceSufficiencyScore) {
  return score.phase === "enhancement" || score.phase === "complete";
}

function countUsefulEvidence(evidenceResponses: AdvisorEvidenceResponse[]) {
  const seen = new Set<string>();
  const seenUrls = new Set<string>();
  let count = 0;

  for (const response of evidenceResponses) {
    const text = [response.question, response.answer, response.proofUrl, response.sourceNote].join(" ").trim();
    if (text.length < 40) continue;

    const confidence = response.confidence.toLowerCase();
    if (confidence === "not_sure" && !response.proofUrl && response.answer.length < 160) continue;

    const weight = evidenceWeight(response);
    const urls = extractUrls(text);
    const newUrls = urls.filter((url) => {
      if (seenUrls.has(url)) return false;
      seenUrls.add(url);
      return true;
    });

    if (newUrls.length) {
      count += newUrls.length * weight;
      continue;
    }

    const key = normalizeEvidenceKey(text);
    if (seen.has(key)) continue;
    seen.add(key);

    count += weight;
  }

  return Math.round(count * 10) / 10;
}

function detectCareerYears(intake: Partial<IntakeForm>) {
  const combined = [
    intake.resume_text,
    intake.hidden_achievements,
    intake.energizing_problems,
    intake.career_constraints,
    intake.industry_preferences,
    intake.public_evidence,
    intake.claim_boundaries,
  ]
    .filter(Boolean)
    .join("\n");

  const explicit = findExplicitYears(combined);
  if (explicit) return explicit;

  const currentYear = new Date().getFullYear();
  const years = [...combined.matchAll(/\b(19[7-9]\d|20[0-2]\d)\b/g)]
    .map((match) => Number(match[1]))
    .filter((year) => year >= 1970 && year <= currentYear);

  if (!years.length) return 10;

  return Math.max(1, currentYear - Math.min(...years));
}

function findExplicitYears(text: string) {
  const patterns = [
    /\b(\d{1,2})\+?\s+years?\s+(?:of\s+)?(?:work|career|professional|experience)/i,
    /\b(?:work|career|professional|experience)\s+(?:of\s+)?(\d{1,2})\+?\s+years?/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const years = Number(match[1]);
    if (Number.isFinite(years) && years > 0) return years;
  }

  return null;
}

function normalizeEvidenceKey(text: string) {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 180);
}

function extractUrls(text: string) {
  const urls = new Set<string>();
  for (const match of text.matchAll(/https?:\/\/[^\s<>"')]+/g)) {
    urls.add(match[0].replace(/[.,;:!?]+$/, "").toLowerCase());
  }
  return [...urls];
}

function evidenceWeight(response: AdvisorEvidenceResponse) {
  const text = [response.answer, response.sourceNote, response.confidence].join(" ").toLowerCase();
  if (text.includes("evidence strength: unverified")) return 0.25;
  if (text.includes("evidence strength: weak")) return 0.5;
  return 1;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
