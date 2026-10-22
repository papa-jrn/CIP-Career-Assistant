import type { RecommendationCategory } from "@/lib/cip/recommendation";
import type { ImportedJob } from "@/lib/cip/imported-jobs";

/**
 * Whether an imported job suits this person (§7).
 *
 * Kept entirely separate from whether the listing is real. A genuine, live
 * posting can be a poor fit, and an appealing job can be unverifiable; the two
 * conclusions are produced independently and shown side by side, so neither
 * launders the other.
 *
 * Everything here is derived from what the user actually supplied: their stated
 * preferences, their saved career lanes, and the posting text they pasted.
 * Nothing infers a salary, a credential, an eligibility or an experience level
 * that is not written down somewhere. Where the posting is silent, the answer
 * is "unknown", which is a real finding rather than a gap to fill.
 */
export const IMPORTED_JOB_FIT_SOURCE_TYPE = "imported_job_fit";

/** How the assessment was produced. Shown to the user, never hidden. */
export type FitBasis = "deterministic" | "user";

export interface FitFinding {
  /** What the posting itself says, versus what we inferred about the user. */
  kind: "match" | "mismatch" | "unknown";
  label: string;
  detail: string;
  /** Where this came from, so a reader can check it. */
  source: "your preferences" | "your career lanes" | "the posting text" | "the posting link";
}

export interface FitAssessment {
  importId: string;
  recommendation: RecommendationCategory;
  confidence: "low" | "medium" | "high";
  /** What to actually do next, in words. Never a score. */
  nextAction: string;
  findings: FitFinding[];
  basis: FitBasis;
  assessedAt: string;
  /** Set when the user overrode the app's conclusion. */
  userNote?: string;
}

export interface FitContext {
  salaryFloorUsd?: number;
  workModes: string[];
  exclusions: { industries: string[]; roles: string[]; employers: string[] };
  /** Career lane names the user is actually pursuing. */
  laneRoles: string[];
}

const MONEY = /\$\s?([0-9]{2,3}(?:,[0-9]{3})+|[0-9]{5,6})(?:\s*(?:-|to|–)\s*\$?\s?([0-9]{2,3}(?:,[0-9]{3})+|[0-9]{5,6}))?/;

/** The lowest number the posting states, if it states one at all. */
export function statedSalary(text: string): number | null {
  const match = MONEY.exec(text || "");
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) && value >= 10_000 ? value : null;
}

/** Work model the posting states in its own words, or null when it does not. */
export function statedWorkModel(text: string): "remote" | "hybrid" | "onsite" | null {
  const lower = (text || "").toLowerCase();
  if (/\bfully remote\b|\b100% remote\b|\bremote\b/.test(lower) && !/\bno remote\b|\bnot remote\b/.test(lower)) return "remote";
  if (/\bhybrid\b/.test(lower)) return "hybrid";
  if (/\bon-?site\b|\bin-?person\b|\bin office\b/.test(lower)) return "onsite";
  return null;
}

function overlapsLane(job: ImportedJob, laneRoles: string[]): string | null {
  const title = job.title.toLowerCase();
  for (const lane of laneRoles) {
    const words = lane.toLowerCase().split(/\s+/).filter((word) => word.length > 4);
    if (words.some((word) => title.includes(word))) return lane;
  }
  return null;
}

function hitsExclusion(job: ImportedJob, context: FitContext): string | null {
  const haystack = `${job.title} ${job.employer} ${job.originalMaterial}`.toLowerCase();
  for (const role of context.exclusions.roles) {
    if (role && job.title.toLowerCase().includes(role.toLowerCase())) return `role you excluded: ${role}`;
  }
  for (const employer of context.exclusions.employers) {
    if (employer && job.employer.toLowerCase().includes(employer.toLowerCase())) return `employer you excluded: ${employer}`;
  }
  for (const industry of context.exclusions.industries) {
    if (industry && haystack.includes(industry.toLowerCase())) return `industry you excluded: ${industry}`;
  }
  return null;
}

/**
 * Compare the posting against what the user has told us, without inventing
 * anything the posting does not say.
 *
 * Deliberately conservative: it reports what it can see, names what it cannot,
 * and never converts an absence of information into a negative finding. A
 * posting that does not state pay produces "unknown", not "pay too low".
 */
export function assessImportedJobFit(
  job: ImportedJob,
  context: FitContext,
  assessedAt: string,
): FitAssessment {
  const findings: FitFinding[] = [];
  const text = `${job.title}\n${job.worksiteText ?? ""}\n${job.originalMaterial}`;

  const excluded = hitsExclusion(job, context);
  if (excluded) {
    findings.push({
      kind: "mismatch",
      label: "On your exclusion list",
      detail: `This matches an ${excluded}. You asked not to be shown these.`,
      source: "your preferences",
    });
  }

  const lane = overlapsLane(job, context.laneRoles);
  if (lane) {
    findings.push({
      kind: "match",
      label: "Fits a direction you are pursuing",
      detail: `The title overlaps your "${lane}" lane.`,
      source: "your career lanes",
    });
  } else if (context.laneRoles.length) {
    findings.push({
      kind: "unknown",
      label: "No obvious overlap with your lanes",
      detail: "The title does not clearly match a direction you are working on. That does not make it wrong, only unexplained.",
      source: "your career lanes",
    });
  }

  const pay = statedSalary(text);
  if (pay === null) {
    findings.push({
      kind: "unknown",
      label: "Pay not stated",
      detail: "The material you saved does not state a salary, so pay cannot be compared with your floor. Nothing is assumed about it.",
      source: "the posting text",
    });
  } else if (context.salaryFloorUsd && pay < context.salaryFloorUsd) {
    findings.push({
      kind: "mismatch",
      label: "Stated pay is below your floor",
      detail: `The posting states ${pay.toLocaleString()} and your floor is ${context.salaryFloorUsd.toLocaleString()}.`,
      source: "the posting text",
    });
  } else if (context.salaryFloorUsd) {
    findings.push({
      kind: "match",
      label: "Stated pay clears your floor",
      detail: `The posting states ${pay.toLocaleString()}, at or above your floor of ${context.salaryFloorUsd.toLocaleString()}.`,
      source: "the posting text",
    });
  }

  const model = statedWorkModel(text);
  if (!model) {
    findings.push({
      kind: "unknown",
      label: "Work model not stated",
      detail: "The material does not say whether this is remote, hybrid or on site.",
      source: "the posting text",
    });
  } else if (context.workModes.length && !context.workModes.includes(model)) {
    findings.push({
      kind: "mismatch",
      label: "Work model differs from what you want",
      detail: `The posting says ${model}; you asked for ${context.workModes.join(" or ")}.`,
      source: "your preferences",
    });
  } else if (context.workModes.length) {
    findings.push({
      kind: "match",
      label: "Work model matches",
      detail: `The posting says ${model}, which is one of the models you want.`,
      source: "your preferences",
    });
  }

  if (!job.originalMaterial) {
    findings.push({
      kind: "unknown",
      label: "No posting text saved",
      detail: "Only a link was saved, so duties, requirements and scope could not be compared. Paste the posting text for a fuller comparison.",
      source: "the posting link",
    });
  }

  const mismatches = findings.filter((finding) => finding.kind === "mismatch");
  const matches = findings.filter((finding) => finding.kind === "match");
  const unknowns = findings.filter((finding) => finding.kind === "unknown");

  let recommendation: RecommendationCategory = "monitor";
  let nextAction = "Hold this one until you know more about it.";
  let confidence: FitAssessment["confidence"] = "low";

  const conflicts = mismatches.map((finding) => finding.label.toLowerCase()).join("; ");
  const laneMatched = matches.some((finding) => finding.label.includes("direction you are pursuing"));

  if (excluded) {
    recommendation = "skip";
    nextAction = "You excluded this kind of role or employer. Skip it, or change the exclusion if it no longer reflects what you want.";
    confidence = "high";
  } else if (mismatches.length && !matches.length) {
    recommendation = "skip";
    nextAction = `This conflicts with what you asked for: ${conflicts}. Skip it unless you want to revisit that preference.`;
    confidence = "medium";
  } else if (mismatches.length) {
    // Both good and bad signs. Naming the conflict is the whole value here: a
    // summary that says "worth watching" while hiding two conflicts is the
    // kind of soft non-answer this app exists to avoid.
    recommendation = "monitor";
    nextAction = `Mixed. It conflicts with what you asked for (${conflicts}), and some of it does fit. Decide whether that trade is worth it before spending effort.`;
    confidence = "medium";
  } else if (unknowns.length >= 2) {
    recommendation = "check_funding";
    nextAction = "Too much is unknown to judge. Open the posting and paste its text, or ask someone who would know, before spending effort on it.";
    confidence = "low";
  } else if (matches.length >= 2 && laneMatched) {
    recommendation = "talk_first";
    nextAction = "This lines up with the direction you are pursuing and with what you asked for. Find someone who knows the team or the work before applying - a conversation tells you more than the posting will.";
    confidence = "medium";
  } else if (matches.length >= 2) {
    // It matches the constraints but not a direction the user is working on.
    recommendation = "talk_first";
    nextAction = "It matches what you asked for, but not a direction you are currently pursuing. Worth a conversation to find out whether it belongs on your list at all.";
    confidence = "low";
  } else if (matches.length) {
    recommendation = "monitor";
    nextAction = "One thing fits and the rest is unknown. Paste the posting text or check the listing to firm this up.";
    confidence = "low";
  }

  return { importId: job.importId, recommendation, confidence, nextAction, findings, basis: "deterministic", assessedAt };
}

export function importedJobFitPayload(fit: FitAssessment) {
  return { importedJobFit: fit };
}

export function parseImportedJobFit(value: string | null, createdAt: string): FitAssessment | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    const fit = parsed?.importedJobFit;
    const importId = typeof fit?.importId === "string" ? fit.importId.trim() : "";
    const categories = ["talk_first", "check_funding", "apply", "monitor", "skip"];
    if (!importId || !categories.includes(fit?.recommendation)) return null;
    return {
      importId,
      recommendation: fit.recommendation as RecommendationCategory,
      confidence: ["low", "medium", "high"].includes(fit?.confidence) ? fit.confidence : "low",
      nextAction: typeof fit.nextAction === "string" ? fit.nextAction : "",
      findings: Array.isArray(fit.findings) ? (fit.findings as FitFinding[]) : [],
      basis: fit?.basis === "user" ? "user" : "deterministic",
      assessedAt: typeof fit.assessedAt === "string" && fit.assessedAt ? fit.assessedAt : createdAt,
      userNote: typeof fit.userNote === "string" && fit.userNote.trim() ? fit.userNote.trim() : undefined,
    };
  } catch {
    return null;
  }
}

/** The newest assessment for each job; a user's own correction supersedes the app's. */
export function latestFitFor(importId: string, assessments: FitAssessment[]): FitAssessment | null {
  const mine = assessments
    .filter((item) => item.importId === importId)
    .slice()
    .sort((a, b) => Date.parse(b.assessedAt || "") - Date.parse(a.assessedAt || ""));
  return mine[0] ?? null;
}

export function readableRecommendation(category: RecommendationCategory): string {
  switch (category) {
    case "apply":
      return "Apply";
    case "talk_first":
      return "Talk to someone first";
    case "check_funding":
      return "Research before investing effort";
    case "monitor":
      return "Hold and watch";
    case "skip":
      return "Skip";
    default:
      return "Hold and watch";
  }
}
