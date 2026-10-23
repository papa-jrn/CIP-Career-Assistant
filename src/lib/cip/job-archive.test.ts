import { describe, expect, it } from "vitest";
import { isImportedArchived } from "./job-archive";
import { buildImportedJob, importedJobInput } from "./imported-jobs";
import { indexDispositions, type PostingDisposition } from "./posting-dispositions";
import type { FitAssessment } from "./imported-job-fit";
const job = buildImportedJob(importedJobInput.parse({ title: "Director", employer: "Example", sourceUrl: "https://example.org/job" }), { importId: "one", capturedAt: "2026-10-01" });
const fit: FitAssessment = { importId: "one", recommendation: "skip", confidence: "high", nextAction: "Not for me", findings: [], basis: "user", assessedAt: "2026-10-23T10:00:00Z" };
const status: PostingDisposition = { normalized_url: job.normalizedUrl, source_url: job.sourceUrl, employer_key: "example", requisition_id: null, status: "passed", note: "", updated_at: "2026-10-23T11:00:00Z" };
describe("reversible job archives", () => {
  it("honors earlier user skips and existing searched-job passed decisions", () => {
    expect(isImportedArchived(job, [fit], indexDispositions([]))).toBe(true);
    expect(isImportedArchived(job, [], indexDispositions([status]))).toBe(true);
  });
  it("never archives an AI Skip suggestion", () => {
    expect(isImportedArchived(job, [{ ...fit, basis: "ai_assisted" }], indexDispositions([]))).toBe(false);
  });
  it("honors restore without losing history, and permits a later user rejection", () => {
    const restore = { ...status, status: "watching" as const };
    expect(isImportedArchived(job, [fit], indexDispositions([restore]))).toBe(false);
    expect(isImportedArchived(job, [{ ...fit, assessedAt: "2026-10-23T12:00:00Z" }], indexDispositions([restore]))).toBe(true);
  });
  it("supports pasted-only jobs with additive archive/restore events and isolates job ids", () => {
    const pasted = { ...job, sourceUrl: "", sourceLinks: [] };
    const events = [{ importId: "one", archived: true, at: "2026-10-23T11:00:00Z" }, { importId: "one", archived: false, at: "2026-10-23T12:00:00Z" }];
    expect(isImportedArchived(pasted, [fit], indexDispositions([]), events)).toBe(false);
    expect(isImportedArchived({ ...pasted, importId: "other" }, [fit], indexDispositions([]), events)).toBe(false);
  });
});
