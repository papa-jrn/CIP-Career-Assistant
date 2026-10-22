import { describe, expect, it } from "vitest";
import { buildImportedJob, describeProvenance, importedJobInput } from "./imported-jobs";
import {
  applyLatestCheck,
  checksForJob,
  describeCheckAge,
  describeCheckChange,
  importedJobCheckPayload,
  isCheckStale,
  parseImportedJobCheck,
  observeImportedListing,
  readableState,
  type ImportedJobCheck,
} from "./imported-job-checks";

const NOW = new Date("2026-10-22T12:00:00.000Z");

function job(importId = "imp-1") {
  return buildImportedJob(
    importedJobInput.parse({
      title: "Director of Clinical Operations",
      employer: "Riverside Health",
      sourceUrl: "https://careers.riverside.org/jobs/1234",
    }),
    { importId, capturedAt: "2026-10-01T12:00:00.000Z" },
  );
}

function check(over: Partial<ImportedJobCheck> = {}): ImportedJobCheck {
  return {
    importId: "imp-1",
    state: "verified_open",
    note: "Title matched on the page.",
    checkedAt: "2026-10-22T11:00:00.000Z",
    fetchedUrl: "https://careers.riverside.org/jobs/1234",
    ...over,
  };
}

describe("storing a check", () => {
  it("records cautious employer-domain and explicit red-flag observations without calling them proof", () => {
    const observations = observeImportedListing("Riverside Health", "https://careers.riverside.org/jobs/1", "Applicants must pay an application fee and provide your bank account.");
    expect(observations.map(item => item.kind)).toEqual(["employer_name_in_domain", "payment_request", "sensitive_data_request"]);
    expect(observations[0].detail).toMatch(/not proof/i);
    expect(observations[1].detail).toMatch(/verify independently/i);
  });

  it("does not call a hosted ATS domain a mismatch or claim fraud", () => {
    const observations = observeImportedListing("Riverside Health", "https://jobs.example-ats.com/123", "A job description.");
    expect(observations[0].kind).toBe("employer_name_not_in_domain");
    expect(observations[0].detail).toMatch(/does not mean the page is false/i);
    expect(observations.some(item => /fake|scam|fraud/i.test(item.detail))).toBe(false);
  });

  it("reads back what was stored", () => {
    const stored = JSON.stringify(importedJobCheckPayload(check()));
    expect(parseImportedJobCheck(stored, "now")).toMatchObject({ importId: "imp-1", state: "verified_open" });
  });

  it("refuses a record with no import or an unknown state", () => {
    expect(parseImportedJobCheck(null, "now")).toBeNull();
    expect(parseImportedJobCheck("not json", "now")).toBeNull();
    expect(parseImportedJobCheck(JSON.stringify({ importedJobCheck: { state: "verified_open" } }), "now")).toBeNull();
    expect(parseImportedJobCheck(JSON.stringify({ importedJobCheck: { importId: "imp-1", state: "made_up" } }), "now")).toBeNull();
  });
});

describe("history is kept, not overwritten", () => {
  const history = [
    check({ state: "no_longer_visible", checkedAt: "2026-10-22T11:00:00.000Z" }),
    check({ state: "verified_open", checkedAt: "2026-10-15T11:00:00.000Z" }),
    check({ state: "verified_open", checkedAt: "2026-10-08T11:00:00.000Z" }),
  ];

  it("keeps every check for the job, newest first", () => {
    const found = checksForJob("imp-1", history);
    expect(found).toHaveLength(3);
    expect(found[0].state).toBe("no_longer_visible");
  });

  it("does not mix in checks belonging to another import", () => {
    expect(checksForJob("imp-1", [...history, check({ importId: "imp-2" })])).toHaveLength(3);
  });

  it("applies the newest check without editing the stored job", () => {
    const original = job();
    const shown = applyLatestCheck(original, history);
    expect(shown.verification?.state).toBe("no_longer_visible");
    expect(original.verification).toBeNull();
  });

  it("orders by when the check ran, not the order it was handed", () => {
    const shuffled = [history[1], history[2], history[0]];
    expect(checksForJob("imp-1", shuffled)[0].state).toBe("no_longer_visible");
  });

  it("says when a posting's state changed between checks", () => {
    expect(describeCheckChange("imp-1", history)).toMatch(/was "page live and matching" and is now "no longer at that address"/);
  });

  it("says nothing when the state is unchanged", () => {
    expect(describeCheckChange("imp-1", [history[1], history[2]])).toBeNull();
  });

  it("says nothing when there is only one check to go on", () => {
    expect(describeCheckChange("imp-1", [check()])).toBeNull();
  });
});

describe("staleness", () => {
  it("treats a job that was never checked as needing one", () => {
    expect(isCheckStale(job(), NOW)).toBe(true);
    expect(describeCheckAge(job(), NOW)).toBe("Never checked.");
  });

  it("treats a recent check as current", () => {
    const shown = applyLatestCheck(job(), [check({ checkedAt: "2026-10-21T12:00:00.000Z" })]);
    expect(isCheckStale(shown, NOW)).toBe(false);
    expect(describeCheckAge(shown, NOW)).toBe("Checked yesterday.");
  });

  it("treats a check older than a week as worth repeating before acting", () => {
    const shown = applyLatestCheck(job(), [check({ checkedAt: "2026-10-10T12:00:00.000Z" })]);
    expect(isCheckStale(shown, NOW)).toBe(true);
    expect(describeCheckAge(shown, NOW)).toMatch(/worth repeating before you act/);
  });

  it("treats an unreadable timestamp as stale rather than current", () => {
    const shown = { ...job(), verification: { state: "verified_open" as const, note: "", checkedAt: "not a date" } };
    expect(isCheckStale(shown, NOW)).toBe(true);
  });
});

describe("what a check is allowed to mean", () => {
  it("a live page is a live page, not hiring intent", () => {
    const shown = applyLatestCheck(job(), [check({ state: "verified_open" })]);
    const text = describeProvenance(shown);
    expect(text).toMatch(/page is live/i);
    expect(text).toMatch(/not that the employer is actively hiring/i);
  });

  it("an unreadable page is never reported as a fake posting", () => {
    const shown = applyLatestCheck(job(), [check({ state: "verification_unavailable" })]);
    const text = describeProvenance(shown);
    expect(text).toMatch(/does not make a posting fake/i);
    expect(text).not.toMatch(/\bscam\b|\bfraud\b|\bfake listing\b/i);
  });

  it("describes each state in words a reader can act on", () => {
    expect(readableState("verified_open")).toBe("page live and matching");
    expect(readableState("source_reports_closed")).toBe("reported closed by the source");
    expect(readableState("no_longer_visible")).toBe("no longer at that address");
    expect(readableState("verification_unavailable")).toBe("could not be read");
    expect(readableState("discovered_unverified")).toBe("not checked");
  });
});
