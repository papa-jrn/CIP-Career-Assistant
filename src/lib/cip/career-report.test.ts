import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: {} as Record<string, Array<Record<string, unknown>>>,
  throwOn: "" as string,
}));

vi.mock("@/lib/supabase/server", () => ({ createServer: () => db }));

/** Minimal Supabase stand-in: returns rows per source_type. */
const db = {
  from: () => {
    let sourceType = "";
    const query: Record<string, unknown> = {
      select: () => query,
      eq: (key: string, value: unknown) => {
        if (key === "source_type") sourceType = String(value);
        if (state.throwOn && state.throwOn === sourceType) throw new Error("boom");
        return query;
      },
      neq: () => query,
      in: () => query,
      order: () => query,
      limit: () => query,
      range: async () => ({ data: state.rows[sourceType] ?? [], error: null }),
      maybeSingle: async () => ({ data: (state.rows[sourceType] ?? [])[0] ?? null, error: null }),
      then: undefined,
    };
    return query;
  },
};

import { buildCareerReport, confidenceFromStatus, formatReportRegions } from "./career-report";

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "");
  state.rows = {};
  state.throwOn = "";
});

/**
 * Assembling the report from saved records.
 *
 * The integrity rule that matters here (§19): the report never invents
 * findings. With no intake, no analysis, or a broken read, it has to say so and
 * point somewhere useful rather than produce something that looks finished.
 */

describe("confidence labels", () => {
  it("maps every ledger status to a label the reader can act on", () => {
    expect(confidenceFromStatus("verified_from_resume")).toBe("verified");
    expect(confidenceFromStatus("stated_by_user")).toBe("stated");
    expect(confidenceFromStatus("inferred_medium_confidence")).toBe("inferred");
    expect(confidenceFromStatus("needs_user_confirmation")).toBe("needs_confirmation");
    expect(confidenceFromStatus("not_enough_evidence")).toBe("insufficient");
  });

  it("falls back to insufficient for a status it does not recognise", () => {
    // Failing toward "we do not know" is the safe direction for a document the
    // user may hand to someone else.
    expect(confidenceFromStatus("something_new" as never)).toBe("insufficient");
  });
});

describe("region formatting", () => {
  it("formats a list without dropping entries", () => {
    expect(formatReportRegions(["NH", "VT"])).toHaveLength(2);
  });

  it("survives an empty or missing list", () => {
    expect(formatReportRegions([])).toEqual([]);
    expect(formatReportRegions(undefined as never)).toEqual([]);
  });
});

describe("what the report does when there is nothing to report", () => {
  it("asks for intake rather than producing an empty-looking report", async () => {
    const report = await buildCareerReport(db as never, "user-a");
    expect(report.status).toBe("needs_intake");
    expect(report.nextStepHref).toBe("/intake");
  });

  it("says analysis has not run, and says it has invented nothing", async () => {
    state.rows.resume_intake = [{
      created_at: "2026-10-01T00:00:00.000Z",
      extracted_text: JSON.stringify({ intake: { full_name: "Sam Rivera", resume_text: "Charge nurse, ten years." } }),
    }];
    const report = await buildCareerReport(db as never, "user-a");
    expect(report.status).toBe("needs_analysis");
    expect(report.summary.toLowerCase()).toContain("never invents");
  });

  it("reports an error state rather than a half-built report when a read fails", async () => {
    state.throwOn = "resume_intake";
    const report = await buildCareerReport(db as never, "user-a");
    expect(report.status).toBe("error");
    expect(report.nextStepHref).toBe("/evidence");
  });

  it("always stamps when it was generated, whatever the outcome", async () => {
    const report = await buildCareerReport(db as never, "user-a");
    expect(Number.isNaN(Date.parse(report.generatedAt))).toBe(false);
  });
});
