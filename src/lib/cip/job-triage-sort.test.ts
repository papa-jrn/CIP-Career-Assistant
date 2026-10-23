import { describe, expect, it } from "vitest";
import type { ObservationRow } from "@/lib/cip/job-search-run";
import { indexDispositions, type PostingDisposition } from "@/lib/cip/posting-dispositions";
import { sortJobsForTriage } from "@/lib/cip/job-search-view";

/**
 * Ordering a long job list: fit first, then verification freshness.
 *
 * The founder's rule. Grouping already separates verified postings from leads,
 * so this decides what rises within a group.
 */

const row = (over: Partial<ObservationRow> = {}): ObservationRow =>
  ({
    id: "o1", title: "A role", employer_text: "An employer", worksite_text: "Lebanon, NH",
    source_url: "https://jobs.example.org/1", requisition_id: null, posted_text: null, salary_text: null,
    remote_status: "not_stated", matched_role_term: null, evidence_excerpt: null, source_tier: "general",
    verification_state: "verified_open", verification_note: null, verification_checked_at: null,
    location_status: "within", location_distance_miles: null, location_note: null, exclusion_hit: null,
    first_seen_at: "2026-10-20T12:00:00.000Z", carried_forward: false, ...over,
  }) as ObservationRow;

const annotations = (fits: Record<string, string>, dispositions: PostingDisposition[] = []) => ({
  recommendations: new Map(Object.entries(fits).map(([url, category]) => [url, { category, confidence: "medium", rationale: "", signals: [], namedContact: null } as never])),
  dispositions: indexDispositions(dispositions),
  resolution: { watchedNames: [], byUrl: new Map() },
});

describe("sorting by fit", () => {
  it("puts the most actionable conclusions first and skips last", () => {
    const rows = [
      row({ id: "skip", source_url: "https://jobs.example.org/skip" }),
      row({ id: "talk", source_url: "https://jobs.example.org/talk" }),
      row({ id: "apply", source_url: "https://jobs.example.org/apply" }),
      row({ id: "monitor", source_url: "https://jobs.example.org/monitor" }),
    ];
    const sorted = sortJobsForTriage(rows, annotations({
      "https://jobs.example.org/skip": "skip",
      "https://jobs.example.org/talk": "talk_first",
      "https://jobs.example.org/apply": "apply",
      "https://jobs.example.org/monitor": "monitor",
    }) as never);
    expect(sorted.map((r) => r.id)).toEqual(["apply", "talk", "monitor", "skip"]);
  });

  it("sorts an unassessed job below anything assessed but above a skip", () => {
    const rows = [
      row({ id: "skip", source_url: "https://jobs.example.org/skip" }),
      row({ id: "unassessed", source_url: "https://jobs.example.org/none" }),
      row({ id: "monitor", source_url: "https://jobs.example.org/monitor" }),
    ];
    const sorted = sortJobsForTriage(rows, annotations({
      "https://jobs.example.org/skip": "skip",
      "https://jobs.example.org/monitor": "monitor",
    }) as never);
    expect(sorted.map((r) => r.id)).toEqual(["monitor", "unassessed", "skip"]);
  });

  it("lets the user's own decision outrank the app's suggestion", () => {
    const rows = [
      row({ id: "app-says-apply", source_url: "https://jobs.example.org/apply" }),
      row({ id: "i-passed", source_url: "https://jobs.example.org/passed" }),
    ];
    const passed: PostingDisposition = {
      normalized_url: "jobs.example.org/passed", source_url: "https://jobs.example.org/passed",
      employer_key: "an employer", requisition_id: null, status: "passed", note: "", updated_at: "2026-10-22T12:00:00.000Z",
    };
    const sorted = sortJobsForTriage(rows, annotations({ "https://jobs.example.org/apply": "apply" }, [passed]) as never);
    // The job the user passed on sinks even though the app has nothing against it.
    expect(sorted[sorted.length - 1].id).toBe("i-passed");
  });
});

describe("sorting by freshness within the same fit", () => {
  it("puts the most recently checked first", () => {
    const rows = [
      row({ id: "stale", source_url: "https://jobs.example.org/a", verification_checked_at: "2026-10-01T12:00:00.000Z" }),
      row({ id: "fresh", source_url: "https://jobs.example.org/b", verification_checked_at: "2026-10-22T12:00:00.000Z" }),
    ];
    expect(sortJobsForTriage(rows, annotations({}) as never).map((r) => r.id)).toEqual(["fresh", "stale"]);
  });

  it("puts a never-checked job after a checked one", () => {
    const rows = [
      row({ id: "never", source_url: "https://jobs.example.org/a", verification_checked_at: null }),
      row({ id: "checked", source_url: "https://jobs.example.org/b", verification_checked_at: "2026-10-01T12:00:00.000Z" }),
    ];
    expect(sortJobsForTriage(rows, annotations({}) as never).map((r) => r.id)).toEqual(["checked", "never"]);
  });

  it("does not reorder the caller's array", () => {
    const rows = [row({ id: "a", source_url: "https://jobs.example.org/a" }), row({ id: "b", source_url: "https://jobs.example.org/b" })];
    sortJobsForTriage(rows, annotations({}) as never);
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("works with no annotations at all", () => {
    expect(() => sortJobsForTriage([row()], undefined)).not.toThrow();
  });
});
