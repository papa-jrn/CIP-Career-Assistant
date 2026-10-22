import { z } from "zod";
import { normalizeUrl } from "@/lib/cip/job-search-engine";
import { normOrg } from "@/lib/cip/employer-resolution";
import type { VerificationState } from "@/lib/cip/job-verifier";

/**
 * A job the user found somewhere else and brought in themselves.
 *
 * Section 7 of the Workbench Redesign Plan. The rule that shapes everything
 * here: pasted text is user-supplied material, not a verified listing, and the
 * three questions stay separate -
 *   1. is this listing really the employer's, and is it live?
 *   2. is the work a credible fit for this person?
 *   3. is it worth their effort?
 * A real job can be a bad fit; an appealing job can be unverifiable. Neither
 * answer is allowed to stand in for the other.
 *
 * Storage: an additive `career_sources` record rather than a row in
 * `job_search_observations`. Observations belong to a search run and are read
 * run-first everywhere, and an import has no run. Keeping imports out of that
 * table also means an unverified import cannot reach lane scoring, which
 * section 7 requires - it is true by construction rather than by a filter
 * somebody has to remember. Dispositions still work, because
 * `posting_dispositions` is keyed by normalized URL and knows nothing of runs.
 */
export const IMPORTED_JOB_SOURCE_TYPE = "imported_job";

/** How the import arrived. Pasted text is never a verified listing. */
export type ImportedJobMaterial = "url" | "pasted" | "url_and_pasted";

export interface ImportedJobVerification {
  state: VerificationState;
  note: string;
  checkedAt: string;
}

export interface ImportedJob {
  importId: string;
  title: string;
  employer: string;
  sourceUrl: string;
  /** Stable identity for dedupe and for matching a saved disposition. */
  normalizedUrl: string;
  employerKey: string;
  requisitionId?: string;
  worksiteText?: string;
  /** Exactly what the user pasted, kept as supplied. */
  originalMaterial: string;
  material: ImportedJobMaterial;
  userNote?: string;
  capturedAt: string;
  /** Null until a check has actually run. Never assumed. */
  verification: ImportedJobVerification | null;
  /**
   * Fit assessment. Deliberately separate from verification, and null until
   * one has been produced - an empty evaluation is reported as incomplete
   * rather than filled with a guess.
   */
  fit: null;
}

const MAX_MATERIAL = 40_000;

export const importedJobInput = z
  .object({
    title: z.string().trim().min(2, "Add the job title.").max(200),
    employer: z.string().trim().min(2, "Add the employer.").max(200),
    sourceUrl: z.string().trim().max(2000).optional().or(z.literal("")),
    originalMaterial: z.string().trim().max(MAX_MATERIAL).optional().or(z.literal("")),
    requisitionId: z.string().trim().max(80).optional().or(z.literal("")),
    worksiteText: z.string().trim().max(200).optional().or(z.literal("")),
    userNote: z.string().trim().max(1000).optional().or(z.literal("")),
  })
  .refine((value) => Boolean(value.sourceUrl) || Boolean(value.originalMaterial), {
    message: "Add the job's web address, the text of the posting, or both.",
    path: ["sourceUrl"],
  })
  .refine((value) => !value.sourceUrl || isHttpUrl(value.sourceUrl), {
    message: "The web address must start with http:// or https://.",
    path: ["sourceUrl"],
  });

export type ImportedJobInput = z.infer<typeof importedJobInput>;

/** Only http(s). Anything else is a scheme we will not store as a link. */
export function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function buildImportedJob(
  input: ImportedJobInput,
  context: { importId: string; capturedAt: string },
): ImportedJob {
  const sourceUrl = (input.sourceUrl ?? "").trim();
  const originalMaterial = (input.originalMaterial ?? "").trim();
  const material: ImportedJobMaterial = sourceUrl && originalMaterial
    ? "url_and_pasted"
    : sourceUrl
      ? "url"
      : "pasted";

  return {
    importId: context.importId,
    title: input.title.trim(),
    employer: input.employer.trim(),
    sourceUrl,
    normalizedUrl: sourceUrl ? normalizeUrl(sourceUrl) : "",
    employerKey: normOrg(input.employer),
    requisitionId: input.requisitionId?.trim() || undefined,
    worksiteText: input.worksiteText?.trim() || undefined,
    originalMaterial: originalMaterial.slice(0, MAX_MATERIAL),
    material,
    userNote: input.userNote?.trim() || undefined,
    capturedAt: context.capturedAt,
    verification: null,
    fit: null,
  };
}

export function importedJobPayload(job: ImportedJob) {
  return { importedJob: job };
}

export function parseImportedJob(value: string | null): ImportedJob | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    const job = parsed?.importedJob;
    if (!job || typeof job.title !== "string" || typeof job.employer !== "string") return null;
    return {
      importId: String(job.importId ?? ""),
      title: job.title,
      employer: job.employer,
      sourceUrl: String(job.sourceUrl ?? ""),
      normalizedUrl: String(job.normalizedUrl ?? ""),
      employerKey: String(job.employerKey ?? ""),
      requisitionId: job.requisitionId || undefined,
      worksiteText: job.worksiteText || undefined,
      originalMaterial: String(job.originalMaterial ?? ""),
      material: (["url", "pasted", "url_and_pasted"].includes(job.material) ? job.material : "pasted") as ImportedJobMaterial,
      userNote: job.userNote || undefined,
      capturedAt: String(job.capturedAt ?? ""),
      verification: job.verification && typeof job.verification.state === "string"
        ? { state: job.verification.state, note: String(job.verification.note ?? ""), checkedAt: String(job.verification.checkedAt ?? "") }
        : null,
      fit: null,
    };
  } catch {
    return null;
  }
}

export interface DuplicateMatch {
  reason: "same_link" | "same_requisition" | "same_title_and_employer";
  existing: { title: string; employer: string; sourceUrl: string };
}

/**
 * Whether this job is already in the user's records.
 *
 * Checks imports and anything a search already found, because re-importing a
 * posting the weekly search surfaced should not create a second copy with its
 * own separate status. A URL match is definitive; a requisition at the same
 * employer is near-definitive; title plus employer is a likely-but-not-certain
 * match that the caller surfaces for the user to decide on.
 */
export function findDuplicate(
  candidate: Pick<ImportedJob, "normalizedUrl" | "employerKey" | "requisitionId" | "title">,
  existing: Array<{ title: string; employer: string; sourceUrl: string; normalizedUrl?: string; employerKey?: string; requisitionId?: string }>,
): DuplicateMatch | null {
  const title = candidate.title.trim().toLowerCase();
  for (const row of existing) {
    const rowUrl = row.normalizedUrl ?? (row.sourceUrl ? normalizeUrl(row.sourceUrl) : "");
    if (candidate.normalizedUrl && rowUrl && candidate.normalizedUrl === rowUrl) {
      return { reason: "same_link", existing: row };
    }
  }
  for (const row of existing) {
    const rowEmployer = row.employerKey ?? normOrg(row.employer);
    if (
      candidate.requisitionId &&
      row.requisitionId &&
      candidate.requisitionId.toLowerCase() === row.requisitionId.toLowerCase() &&
      candidate.employerKey === rowEmployer
    ) {
      return { reason: "same_requisition", existing: row };
    }
  }
  for (const row of existing) {
    const rowEmployer = row.employerKey ?? normOrg(row.employer);
    if (title && row.title.trim().toLowerCase() === title && candidate.employerKey === rowEmployer) {
      return { reason: "same_title_and_employer", existing: row };
    }
  }
  return null;
}

/**
 * What can honestly be said about this import's provenance right now.
 *
 * Kept separate from any fit assessment, and from any claim about hiring
 * intent: a live page proves a page is live, nothing more.
 */
export function describeProvenance(job: ImportedJob): string {
  if (!job.verification) {
    return job.sourceUrl
      ? "Saved from a link you supplied. Not checked against the employer's own source yet."
      : "Saved from text you pasted. This is your own material, not a verified listing.";
  }
  switch (job.verification.state) {
    case "verified_open":
      return "The linked page was reachable and matched this posting when checked. That means the page is live, not that the employer is actively hiring or will reply.";
    case "source_reports_closed":
      return "The source itself reports this posting as closed or expired.";
    case "no_longer_visible":
      return "The posting page is gone from that address. It may have been filled, withdrawn, or moved.";
    case "verification_unavailable":
      return "The page could not be read, so this could not be checked either way. Being unreadable does not make a posting fake - a login wall or bot block looks the same from here.";
    default:
      return "Saved. Not checked against the employer's own source yet.";
  }
}

/** The fit assessment, which slice 1 does not produce. Says so rather than guessing. */
export function describeFit(job: ImportedJob): string {
  if (job.fit === null) {
    return "No fit assessment yet. Whether this job suits you is a separate question from whether the listing is real, and neither answer stands in for the other.";
  }
  return "";
}
