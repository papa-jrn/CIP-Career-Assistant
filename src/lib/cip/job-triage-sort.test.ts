import { describe, expect, it } from "vitest";
import type { ObservationRow } from "@/lib/cip/job-search-run";
import { indexDispositions, type PostingDisposition } from "@/lib/cip/posting-dispositions";
import { sortJobsForTriage } from "@/lib/cip/job-search-view";

/**
 * Ordering a long job list: fit first, then verification freshness.
 *
 * The distinction that drives all of this: the app writes a preliminary
 * search-guidance chip for every posting it finds, and that is NOT a fit
 * assessment. Treating the two as the same made every job look assessed, so
 * "Hide not-yet-assessed" matched nothing and a preliminary chip read like a
 * conclusion the user had earned.
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

const recommendation = (category: string) =>
  ({ category, confidence: "medium", rationale: "", signals: [], namedContact: null }) as never;

const fit = (recommendationCategory: string) =>
  ({ importId: "x", recommendation: recommendationCategory, confidence: "medium", nextAction: "", findings: [], basis: "deterministic", assessedAt: "2026-10-22T12:00:00.000Z" }) as never;

function annotations(options: {
  preliminary?: Record<string, string>;
  fits?: Record<string, string>;
  dispositions?: PostingDisposition[];
}) {
  return {
    recommendations: new Map(Object.entries(options.preliminary ?? {}).map(([url, category]) => [url, recommendation(category)])),
    fits: new Map(Object.entries(options.fits ?? {}).map(([url, category]) => [url, fit(category)])),
    dispositions: indexDispositions(options.dispositions ?? []),
    resolution: { watchedNames: [], byUrl: new Map() },
  } as never;
}

const url = (name: string) => `https://jobs.example.org/${name}`;

describe("a real assessment outranks preliminary guidance", () => {
  it("puts an assessed job above a preliminary one, even a promising preliminary one", () => {
    const rows = [row({ id: "preliminary-apply", source_url: url("p") }), row({ id: "assessed-monitor", source_url: url("a") })];
    const sorted = sortJobsForTriage(rows, annotations({
      preliminary: { [url("p")]: "apply" },
      fits: { [url("a")]: "monitor" },
    }));
    expect(sorted.map((r) => r.id)).toEqual(["assessed-monitor", "preliminary-apply"]);
  });

  it("orders real assessments most actionable first", () => {
    const rows = ["monitor", "apply", "talk_first", "check_funding"].map((c) => row({ id: c, source_url: url(c) }));
    const sorted = sortJobsForTriage(rows, annotations({
      fits: Object.fromEntries(["monitor", "apply", "talk_first", "check_funding"].map((c) => [url(c), c])),
    }));
    expect(sorted.map((r) => r.id)).toEqual(["apply", "talk_first", "check_funding", "monitor"]);
  });

  it("still orders within preliminary guidance, so a long unassessed list is not arbitrary", () => {
    const rows = ["monitor", "apply", "talk_first"].map((c) => row({ id: c, source_url: url(c) }));
    const sorted = sortJobsForTriage(rows, annotations({
      preliminary: Object.fromEntries(["monitor", "apply", "talk_first"].map((c) => [url(c), c])),
    }));
    expect(sorted.map((r) => r.id)).toEqual(["apply", "talk_first", "monitor"]);
  });
});

describe("what sinks, and in what order", () => {
  it("sinks a job the user passed on below everything else", () => {
    const passed: PostingDisposition = {
      normalized_url: "jobs.example.org/passed", source_url: url("passed"),
      employer_key: "an employer", requisition_id: null, status: "passed", note: "", updated_at: "2026-10-22T12:00:00.000Z",
    };
    const rows = [
      row({ id: "i-passed", source_url: url("passed") }),
      row({ id: "preliminary-skip", source_url: url("ps") }),
      row({ id: "assessed-skip", source_url: url("as") }),
      row({ id: "nothing-known", source_url: url("nk") }),
    ];
    const sorted = sortJobsForTriage(rows, annotations({
      preliminary: { [url("ps")]: "skip" },
      fits: { [url("as")]: "skip" },
      dispositions: [passed],
    }));
    // No information is not a decision to walk away, so it ranks above every
    // flavour of skip; the user's own pass is last.
    expect(sorted.map((r) => r.id)).toEqual(["nothing-known", "assessed-skip", "preliminary-skip", "i-passed"]);
  });

  it("puts a job the user is acting on first", () => {
    const watching: PostingDisposition = {
      normalized_url: "jobs.example.org/w", source_url: url("w"),
      employer_key: "an employer", requisition_id: null, status: "watching", note: "", updated_at: "2026-10-22T12:00:00.000Z",
    };
    const rows = [row({ id: "assessed-apply", source_url: url("a") }), row({ id: "i-am-watching", source_url: url("w") })];
    const sorted = sortJobsForTriage(rows, annotations({ fits: { [url("a")]: "apply" }, dispositions: [watching] }));
    expect(sorted[0].id).toBe("i-am-watching");
  });
});

describe("freshness breaks ties", () => {
  it("puts the most recently checked first among equals", () => {
    const rows = [
      row({ id: "stale", source_url: url("a"), verification_checked_at: "2026-10-01T12:00:00.000Z" }),
      row({ id: "fresh", source_url: url("b"), verification_checked_at: "2026-10-22T12:00:00.000Z" }),
    ];
    expect(sortJobsForTriage(rows, annotations({})).map((r) => r.id)).toEqual(["fresh", "stale"]);
  });

  it("puts a never-checked job after a checked one", () => {
    const rows = [
      row({ id: "never", source_url: url("a"), verification_checked_at: null }),
      row({ id: "checked", source_url: url("b"), verification_checked_at: "2026-10-01T12:00:00.000Z" }),
    ];
    expect(sortJobsForTriage(rows, annotations({})).map((r) => r.id)).toEqual(["checked", "never"]);
  });
});

describe("robustness", () => {
  it("does not reorder the caller's array", () => {
    const rows = [row({ id: "a", source_url: url("a") }), row({ id: "b", source_url: url("b") })];
    sortJobsForTriage(rows, annotations({}));
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("works with no annotations at all", () => {
    expect(() => sortJobsForTriage([row()], undefined)).not.toThrow();
  });
});
