import { z } from "zod";
import type { EmployerResearch } from "./imported-employer-research";
import type { VerificationResult } from "@/lib/cip/job-verifier";
import type { ImportedJob } from "@/lib/cip/imported-jobs";

/**
 * Checking an imported job against the employer's own page.
 *
 * Section 7 requires that earlier observations are retained rather than
 * overwritten, so each check is its own additive record and the import itself
 * is never edited. That also means a posting that was open last week and is
 * gone today keeps both facts, which is what makes "this changed" sayable at
 * all.
 *
 * What a check can and cannot establish is deliberately narrow. Reaching a page
 * and matching the title says the page is live. It does not say the employer is
 * hiring, that anyone will reply, or that the posting is legitimate. Failing to
 * read a page says only that: a login wall, a bot block and a deleted posting
 * are different things, and only the last is evidence of anything.
 */
export const IMPORTED_JOB_CHECK_SOURCE_TYPE = "imported_job_check";

export interface ImportedJobCheck {
  importId: string;
  state: VerificationResult["state"];
  note: string;
  checkedAt: string;
  /** The address actually fetched, which can differ from the one shown. */
  fetchedUrl: string;
  /** Observable clues only. None proves employer identity or safety. */
  observations?: ListingObservation[];
  employerResearch?: EmployerResearch;
}

const researchUrl = z.string().url().max(2000).refine(value => /^https?:\/\//i.test(value));
const savedResearchSchema = z.object({
  status: z.enum(["completed", "unavailable"]), note: z.string().max(2000),
  sources: z.array(z.object({ url: researchUrl, quote: z.string().max(800), purpose: z.enum(["business", "careers"]) })).max(2),
  listingCorroborated: z.boolean(), matchingRoleUrl: researchUrl.optional(),
  businessConsistency: z.enum(["consistent", "potential_mismatch", "unknown"]), confidence: z.enum(["low", "medium"]),
});

export interface ListingObservation {
  kind: "employer_name_in_domain" | "employer_name_not_in_domain" | "payment_request" | "sensitive_data_request";
  detail: string;
}

/** Conservative textual observations from the URL and material the user supplied. */
export function observeImportedListing(employer: string, sourceUrl: string, material: string): ListingObservation[] {
  const observations: ListingObservation[] = [];
  let host = "";
  try { host = new URL(sourceUrl).hostname.toLowerCase().replace(/^www\./, ""); } catch { /* user text only */ }
  const tokens = employer.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(token => token.length >= 5 && !["health", "group", "system", "company", "incorporated", "university"].includes(token));
  const matchingToken = tokens.find(token => host.includes(token));
  observations.push(matchingToken
    ? { kind: "employer_name_in_domain", detail: `The source hostname includes “${matchingToken}”. This is a clue to check, not proof that the page belongs to the employer.` }
    : { kind: "employer_name_not_in_domain", detail: "The source hostname does not visibly include a distinctive word from the employer name. This alone does not mean the page is false; many employers use hosted job systems." });

  const lower = material.toLowerCase();
  if (/\b(application|recruitment|processing) fee\b|\bpay (?:a|the) fee to apply\b|\bsend money to (?:apply|secure|accept)\b/.test(lower)) {
    observations.push({ kind: "payment_request", detail: "The supplied posting text mentions a fee or payment connected to applying. Verify independently before paying anything." });
  }
  if (/\b(send|provide|submit|text) (?:your )?(?:social security|ssn|bank account|credit card)\b|\bpayment details\b/.test(lower)) {
    observations.push({ kind: "sensitive_data_request", detail: "The supplied posting text appears to request sensitive identity or financial information. Confirm the request directly with the employer before sharing it." });
  }
  return observations;
}

export function importedJobCheckPayload(check: ImportedJobCheck) {
  return { importedJobCheck: check };
}

export function parseImportedJobCheck(value: string | null, createdAt: string): ImportedJobCheck | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    const check = parsed?.importedJobCheck;
    const importId = typeof check?.importId === "string" ? check.importId.trim() : "";
    const state = check?.state;
    const known = ["discovered_unverified", "verified_open", "source_reports_closed", "no_longer_visible", "verification_unavailable"];
    if (!importId || typeof state !== "string" || !known.includes(state)) return null;
    return {
      importId,
      state: state as VerificationResult["state"],
      note: typeof check.note === "string" ? check.note : "",
      checkedAt: typeof check.checkedAt === "string" && check.checkedAt ? check.checkedAt : createdAt,
      fetchedUrl: typeof check.fetchedUrl === "string" ? check.fetchedUrl : "",
      employerResearch: savedResearchSchema.safeParse(check.employerResearch).data,
      observations: Array.isArray(check.observations) ? check.observations.filter((item: ListingObservation) => item && typeof item.detail === "string" && ["employer_name_in_domain", "employer_name_not_in_domain", "payment_request", "sensitive_data_request"].includes(item.kind)) : [],
    };
  } catch {
    return null;
  }
}

/** Every check for one import, newest first. */
export function checksForJob(importId: string, checks: ImportedJobCheck[]): ImportedJobCheck[] {
  return checks
    .filter((check) => check.importId === importId)
    .slice()
    .sort((a, b) => Date.parse(b.checkedAt || "") - Date.parse(a.checkedAt || ""));
}

/**
 * The import with its most recent check applied.
 *
 * The stored job is never mutated; the check is layered at read time, the same
 * way contact corrections are, so the original capture stays intact.
 */
export function applyLatestCheck(job: ImportedJob, checks: ImportedJobCheck[]): ImportedJob {
  const latest = checksForJob(job.importId, checks)[0];
  if (!latest) return job;
  if (job.capturedAt && latest.checkedAt < job.capturedAt) return { ...job, verification: null };
  return { ...job, verification: { state: latest.state, note: latest.note, checkedAt: latest.checkedAt } };
}

/** Days after which a check is too old to lean on for a consequential decision. */
export const STALE_CHECK_DAYS = 7;

/**
 * Whether a check is old enough that it should be repeated before the app
 * encourages the user to act on it. Section 7: recheck before a consequential
 * apply recommendation when the verification is stale.
 */
export function isCheckStale(job: ImportedJob, now: Date = new Date()): boolean {
  if (!job.verification?.checkedAt) return true;
  const checked = Date.parse(job.verification.checkedAt);
  if (Number.isNaN(checked)) return true;
  return now.getTime() - checked > STALE_CHECK_DAYS * 24 * 60 * 60 * 1000;
}

/** How long ago the listing was checked, in words, or that it never was. */
export function describeCheckAge(job: ImportedJob, now: Date = new Date()): string {
  if (!job.verification?.checkedAt) return "Never checked.";
  const checked = Date.parse(job.verification.checkedAt);
  if (Number.isNaN(checked)) return "Checked at an unrecorded time.";
  const days = Math.floor((now.getTime() - checked) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "Checked today.";
  if (days === 1) return "Checked yesterday.";
  if (days < STALE_CHECK_DAYS) return `Checked ${days} days ago.`;
  return `Checked ${days} days ago, which is old enough to be worth repeating before you act on it.`;
}

/**
 * Whether anything changed between the two most recent checks.
 *
 * Retaining history is only useful if the change is surfaced: a posting that
 * was open and is now gone is exactly the thing a user needs told.
 */
export function describeCheckChange(importId: string, checks: ImportedJobCheck[]): string | null {
  const history = checksForJob(importId, checks);
  if (history.length < 2) return null;
  const [latest, previous] = history;
  if (latest.state === previous.state) return null;
  return `This changed since the previous check: it was "${readableState(previous.state)}" and is now "${readableState(latest.state)}".`;
}

export function readableState(state: VerificationResult["state"]): string {
  switch (state) {
    case "verified_open":
      return "page live and matching";
    case "source_reports_closed":
      return "reported closed by the source";
    case "no_longer_visible":
      return "no longer at that address";
    case "verification_unavailable":
      return "could not be read";
    default:
      return "not checked";
  }
}

/** Keep the latest attempt distinct from the last supported finding for this revision. */
export function employerResearchForJob(job: ImportedJob, checks: ImportedJobCheck[]) {
  const history = checksForJob(job.importId, checks).filter(check => !job.capturedAt || check.checkedAt >= job.capturedAt);
  const latest = history[0];
  const supported = history.find(check => check.employerResearch?.status === "completed" && check.employerResearch.sources.length > 0);
  return {
    latest,
    supported,
    showingEarlier: Boolean(supported && latest && supported !== latest),
    research: supported?.employerResearch ?? latest?.employerResearch,
  };
}
