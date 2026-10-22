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
