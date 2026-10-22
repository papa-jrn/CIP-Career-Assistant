import { describe, expect, it } from "vitest";
import {
  buildImportedJob,
  describeFit,
  describeProvenance,
  findDuplicate,
  importedJobInput,
  importedJobPayload,
  importedJobAnalysisText,
  isHttpUrl,
  latestImportedJobs,
  parseImportedJob,
  type ImportedJob,
} from "./imported-jobs";

/**
 * Bringing in a job found elsewhere (Workbench Redesign Plan §7).
 *
 * The constraints under test are integrity constraints, not conveniences:
 * pasted text is not a verified listing, a live page is not hiring intent, an
 * unreadable page is not a fake posting, and "is this real" never answers "does
 * this suit me".
 */

const ctx = { importId: "imp-1", capturedAt: "2026-10-22T12:00:00.000Z" };

function input(over: Record<string, string> = {}) {
  return importedJobInput.parse({
    title: "Director of Clinical Operations",
    employer: "Riverside Health",
    sourceUrl: "https://careers.riverside.org/jobs/1234?utm_source=x",
    ...over,
  });
}

describe("what the form accepts", () => {
  it("requires a title and an employer", () => {
    expect(importedJobInput.safeParse({ title: "", employer: "Riverside Health" }).success).toBe(false);
    expect(importedJobInput.safeParse({ title: "Director", employer: "" }).success).toBe(false);
  });

  it("requires either a link or the posting text", () => {
    const neither = importedJobInput.safeParse({ title: "Director", employer: "Riverside Health" });
    expect(neither.success).toBe(false);
    expect(importedJobInput.safeParse({ title: "Director", employer: "Riverside", sourceUrl: "https://e.org/1" }).success).toBe(true);
    expect(importedJobInput.safeParse({ title: "Director", employer: "Riverside", originalMaterial: "Full posting text." }).success).toBe(true);
  });

  it("refuses a link that is not http(s)", () => {
    for (const url of ["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "ftp://example.org/x"]) {
      expect(isHttpUrl(url)).toBe(false);
      expect(importedJobInput.safeParse({ title: "Director", employer: "Riverside", sourceUrl: url }).success).toBe(false);
    }
  });

  it("accepts ordinary http and https links", () => {
    expect(isHttpUrl("https://careers.example.org/jobs/1")).toBe(true);
    expect(isHttpUrl("http://careers.example.org/jobs/1")).toBe(true);
  });

  it("accepts two separate links and does not merge their pasted versions", () => {
    const parsed = input({
      originalMaterial: "Employer version: salary is listed.",
      secondarySourceUrl: "https://linkedin.com/jobs/view/123",
      secondaryMaterial: "LinkedIn version: salary omitted.",
    });
    const job = buildImportedJob(parsed, ctx);
    expect(job.sourceLinks).toEqual([
      { label: "careers.riverside.org", url: job.sourceUrl, material: "Employer version: salary is listed." },
      { label: "linkedin.com", url: "https://linkedin.com/jobs/view/123", material: "LinkedIn version: salary omitted." },
    ]);
    expect(importedJobAnalysisText(job)).toContain("--- careers.riverside.org");
    expect(importedJobAnalysisText(job)).toContain("--- linkedin.com");
    expect(importedJobAnalysisText(job)).not.toContain("salary is listed.\\nLinkedIn");
  });

  it("rejects invalid or duplicated second links", () => {
    expect(importedJobInput.safeParse({ title: "Director", employer: "Riverside", sourceUrl: "https://careers.example/jobs/1", secondarySourceUrl: "file:///bad" }).success).toBe(false);
    expect(importedJobInput.safeParse({ title: "Director", employer: "Riverside", sourceUrl: "https://careers.example/jobs/1", secondarySourceUrl: "https://careers.example/jobs/1" }).success).toBe(false);
  });
});

describe("building the record", () => {
  it("keeps the user's material exactly as supplied", () => {
    const material = "Full posting text, pasted by the user.\nWith a second line.";
    const job = buildImportedJob(input({ originalMaterial: material }), ctx);
    expect(job.originalMaterial).toBe(material);
    expect(job.capturedAt).toBe(ctx.capturedAt);
  });

  it("records how the job arrived", () => {
    expect(buildImportedJob(input(), ctx).material).toBe("url");
    expect(buildImportedJob(input({ sourceUrl: "", originalMaterial: "Pasted." }), ctx).material).toBe("pasted");
    expect(buildImportedJob(input({ originalMaterial: "Pasted." }), ctx).material).toBe("url_and_pasted");
  });

  it("starts with no verification and no fit, rather than assuming either", () => {
    const job = buildImportedJob(input(), ctx);
    expect(job.verification).toBeNull();
    expect(job.fit).toBeNull();
  });

  it("normalizes the link so a saved status can match it later", () => {
    const job = buildImportedJob(input(), ctx);
    expect(job.normalizedUrl).toBeTruthy();
    expect(job.normalizedUrl).not.toContain("utm_source");
  });

  it("survives a round trip through storage", () => {
    const job = buildImportedJob(input({ originalMaterial: "Posting text." }), ctx);
    const read = parseImportedJob(JSON.stringify(importedJobPayload(job)));
    expect(read).toMatchObject({ title: job.title, employer: job.employer, sourceUrl: job.sourceUrl, material: "url_and_pasted" });
  });

  it("reads older records without a sourceLinks array", () => {
    const old = { importedJob: { ...buildImportedJob(input({ originalMaterial: "Old pasted text." }), ctx), sourceLinks: undefined } };
    expect(parseImportedJob(JSON.stringify(old))?.sourceLinks).toEqual([{ label: "Primary source", url: old.importedJob.sourceUrl, material: "Old pasted text." }]);
  });

  it("shows only the newest additive revision for each import", () => {
    const older = buildImportedJob(input(), ctx);
    const newer = { ...older, title: "Updated title" };
    expect(latestImportedJobs([newer, older])).toEqual([newer]);
  });

  it("returns null for a record it cannot read, rather than a half-built job", () => {
    expect(parseImportedJob(null)).toBeNull();
    expect(parseImportedJob("not json")).toBeNull();
    expect(parseImportedJob(JSON.stringify({ importedJob: { title: "No employer" } }))).toBeNull();
  });
});

describe("not importing the same job twice", () => {
  const existing = [{
    title: "Director of Clinical Operations",
    employer: "Riverside Health",
    sourceUrl: "https://careers.riverside.org/jobs/1234",
    requisitionId: "REQ-9001",
  }];

  it("matches the same link even when tracking parameters differ", () => {
    const job = buildImportedJob(input(), ctx);
    expect(findDuplicate(job, existing)?.reason).toBe("same_link");
  });

  it("matches the same requisition at the same employer under a different link", () => {
    const job = buildImportedJob(input({ sourceUrl: "https://jobs.other-board.com/x/99", requisitionId: "REQ-9001" }), ctx);
    expect(findDuplicate(job, existing)?.reason).toBe("same_requisition");
  });

  it("flags the same title at the same employer as a likely duplicate", () => {
    const job = buildImportedJob(input({ sourceUrl: "https://jobs.other-board.com/x/100" }), ctx);
    expect(findDuplicate(job, existing)?.reason).toBe("same_title_and_employer");
  });

  it("does not match a different role at the same employer", () => {
    const job = buildImportedJob(input({ title: "Staff Nurse", sourceUrl: "https://careers.riverside.org/jobs/7777" }), ctx);
    expect(findDuplicate(job, existing)).toBeNull();
  });

  it("does not match the same title at a different employer", () => {
    const job = buildImportedJob(input({ employer: "Granite Trust", sourceUrl: "https://granite.org/jobs/3" }), ctx);
    expect(findDuplicate(job, existing)).toBeNull();
  });

  it("does not treat two jobs with no link as duplicates on that basis alone", () => {
    const a = buildImportedJob(input({ title: "Role A", sourceUrl: "", originalMaterial: "A" }), ctx);
    expect(findDuplicate(a, [{ title: "Role B", employer: "Riverside Health", sourceUrl: "" }])).toBeNull();
  });
});

describe("what the app is willing to claim", () => {
  const job = (over: Partial<ImportedJob> = {}) => ({ ...buildImportedJob(input(), ctx), ...over });

  it("says pasted text is the user's own material, not a listing", () => {
    const pasted = job({ sourceUrl: "", verification: null });
    expect(describeProvenance(pasted)).toMatch(/your own material, not a verified listing/i);
  });

  it("says an unchecked link is unchecked", () => {
    expect(describeProvenance(job())).toMatch(/not checked/i);
  });

  it("does not turn a live page into hiring intent", () => {
    const verified = job({ verification: { state: "verified_open", note: "", checkedAt: ctx.capturedAt } });
    const text = describeProvenance(verified);
    expect(text).toMatch(/page is live/i);
    expect(text).toMatch(/not that the employer is actively hiring/i);
  });

  it("does not call an unreadable posting fake", () => {
    const blocked = job({ verification: { state: "verification_unavailable", note: "", checkedAt: ctx.capturedAt } });
    const text = describeProvenance(blocked);
    expect(text).toMatch(/could not be read/i);
    expect(text).toMatch(/does not make a posting fake/i);
    expect(text).not.toMatch(/\bscam\b|\bfraud\b/i);
  });

  it("reports a closed posting as the source reporting it, not as its own finding", () => {
    const closed = job({ verification: { state: "source_reports_closed", note: "", checkedAt: ctx.capturedAt } });
    expect(describeProvenance(closed)).toMatch(/the source itself reports/i);
  });

  it("keeps fit a separate question and admits when it has no answer", () => {
    const text = describeFit(job());
    expect(text).toMatch(/no fit assessment yet/i);
    expect(text).toMatch(/separate question/i);
  });
});

describe("posting identity ignores tracking, not function", () => {
  it("treats the same posting with and without tracking tags as one job", () => {
    const plain = buildImportedJob(input({ sourceUrl: "https://careers.riverside.org/jobs/1234" }), ctx);
    const tagged = buildImportedJob(input({ sourceUrl: "https://careers.riverside.org/jobs/1234?utm_source=linkedin&fbclid=abc" }), ctx);
    expect(tagged.normalizedUrl).toBe(plain.normalizedUrl);
  });

  it("keeps functional parameters, which decide which posting the page shows", () => {
    const a = buildImportedJob(input({ sourceUrl: "https://jobs.example.org/view?jobId=55" }), ctx);
    const b = buildImportedJob(input({ sourceUrl: "https://jobs.example.org/view?jobId=77" }), ctx);
    expect(a.normalizedUrl).not.toBe(b.normalizedUrl);
    // Parameter names are case-sensitive, so the original casing is kept.
    expect(a.normalizedUrl).toContain("jobId=55");
  });

  it("does not care about parameter order", () => {
    const a = buildImportedJob(input({ sourceUrl: "https://jobs.example.org/v?b=2&a=1" }), ctx);
    const b = buildImportedJob(input({ sourceUrl: "https://jobs.example.org/v?a=1&b=2" }), ctx);
    expect(a.normalizedUrl).toBe(b.normalizedUrl);
  });
});
