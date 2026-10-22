import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseImportedJobFit } from "@/lib/cip/imported-job-fit";
import { buildImportedJob, importedJobInput, importedJobPayload } from "@/lib/cip/imported-jobs";

const state = vi.hoisted(() => ({
  user: "user-a" as string | null,
  rows: {} as Record<string, Array<Record<string, unknown>>>,
  saved: [] as Array<Record<string, unknown>>,
  fail: false,
  filters: [] as Array<[string, unknown]>,
}));

vi.mock("@/lib/supabase/server", () => ({ createServer: () => db }));
vi.mock("@/lib/cip/search-preferences", () => ({
  loadStoredSearchPreferences: async () => ({
    salaryFloorUsd: 95_000,
    workModes: ["remote", "hybrid"],
    exclusions: { industries: [], roles: [], employers: [] },
  }),
}));

const db = {
  auth: { getUser: async () => ({ data: { user: state.user ? { id: state.user } : null } }) },
  from: () => {
    let sourceType = "";
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    const query = {
      select: () => query,
      eq: (k: string, v: unknown) => {
        if (k === "source_type") sourceType = String(v);
        state.filters.push([k, v]);
        filters.push((r) => r[k] === v);
        return query;
      },
      order: () => query,
      limit: async (n: number) => ({
        data: (state.rows[sourceType] ?? []).filter((r) => filters.every((f) => f(r))).slice(0, n),
        error: null,
      }),
      insert: async (record: Record<string, unknown>) => {
        if (!state.fail) state.saved.push(record);
        return { error: state.fail ? { message: "failed" } : null };
      },
    };
    return query;
  },
};

import { POST } from "./assess-import";

const job = buildImportedJob(
  importedJobInput.parse({
    title: "Director of Clinical Operations",
    employer: "Riverside Health",
    sourceUrl: "https://careers.riverside.org/jobs/1234",
    originalMaterial: "Fully remote leadership role. Salary $130,000 per year.",
  }),
  { importId: "imp-1", capturedAt: "2026-10-01T12:00:00.000Z" },
);

function request(fields: Record<string, string>, origin = "http://localhost:4321") {
  return POST({
    request: new Request("http://localhost:4321/api/jobs/assess-import", {
      method: "POST",
      headers: { origin, "HX-Request": "true", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields),
    }),
    cookies: {},
  } as never);
}

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("PUBLIC_SUPABASE_ANON_KEY", "test-only");
  state.user = "user-a";
  state.rows = {
    imported_job: [{ user_id: "user-a", source_type: "imported_job", extracted_text: JSON.stringify(importedJobPayload(job)) }],
    resume_intake: [],
    evidence_analysis: [],
  };
  state.saved = [];
  state.fail = false;
  state.filters = [];
});

describe("assessing fit: boundary", () => {
  it("rejects cross-origin and unauthenticated requests", async () => {
    expect((await request({ importId: "imp-1" }, "https://untrusted.example")).status).toBe(403);
    state.user = null;
    expect((await request({ importId: "imp-1" })).status).toBe(401);
    expect(state.saved).toEqual([]);
  });

  it("will not assess a job that is not the signed-in user's", async () => {
    state.rows.imported_job = [{ ...state.rows.imported_job[0], user_id: "user-b" }];
    expect((await request({ importId: "imp-1" })).status).toBe(404);
    expect(state.saved).toEqual([]);
    expect(state.filters).toContainEqual(["user_id", "user-a"]);
  });

  it("requires a job, and refuses a recommendation it does not recognise", async () => {
    expect((await request({})).status).toBe(400);
    expect((await request({ importId: "imp-1", recommendation: "definitely_apply" })).status).toBe(400);
    expect(state.saved).toEqual([]);
  });
});

describe("assessing fit: the app's own reading", () => {
  it("records an assessment marked as inferred, not as fact", async () => {
    const response = await request({ importId: "imp-1" });
    expect(response.status).toBe(200);
    expect(state.saved).toHaveLength(1);
    expect(state.saved[0].source_type).toBe("imported_job_fit");
    expect(state.saved[0].trust_state).toBe("inferred");

    const fit = parseImportedJobFit(String(state.saved[0].extracted_text), "now");
    expect(fit?.basis).toBe("deterministic");
    expect(fit?.importId).toBe("imp-1");
  });

  it("uses the user's stated preferences in the comparison", async () => {
    await request({ importId: "imp-1" });
    const fit = parseImportedJobFit(String(state.saved[0].extracted_text), "now");
    const labels = (fit?.findings ?? []).map((f) => f.label).join(" | ");
    expect(labels).toMatch(/clears your floor/i);
    expect(labels).toMatch(/Work model matches/i);
  });

  it("explains a next action rather than producing a score", async () => {
    await request({ importId: "imp-1" });
    const fit = parseImportedJobFit(String(state.saved[0].extracted_text), "now");
    expect(fit?.nextAction.length).toBeGreaterThan(20);
    expect(String(state.saved[0].extracted_text)).not.toMatch(/"score"|fitScore|matchPercent/);
  });

  it("leaves the import itself untouched", async () => {
    const before = JSON.stringify(state.rows.imported_job);
    await request({ importId: "imp-1" });
    expect(JSON.stringify(state.rows.imported_job)).toBe(before);
  });
});

describe("assessing fit: the user's correction", () => {
  it("records the user's own conclusion as theirs, with their reason", async () => {
    const response = await request({ importId: "imp-1", recommendation: "skip", note: "The commute is impossible." });
    expect(response.status).toBe(200);
    const fit = parseImportedJobFit(String(state.saved[0].extracted_text), "now");
    expect(fit).toMatchObject({ recommendation: "skip", basis: "user", userNote: "The commute is impossible." });
    expect(state.saved[0].trust_state).toBe("user_supplied");
  });

  it("keeps the app's earlier reading rather than replacing it", async () => {
    await request({ importId: "imp-1" });
    await request({ importId: "imp-1", recommendation: "skip", note: "Not for me." });
    expect(state.saved).toHaveLength(2);
    expect(parseImportedJobFit(String(state.saved[0].extracted_text), "now")?.basis).toBe("deterministic");
    expect(parseImportedJobFit(String(state.saved[1].extracted_text), "now")?.basis).toBe("user");
  });

  it("lets the user say apply even though the app never does", async () => {
    await request({ importId: "imp-1", recommendation: "apply", note: "I know this team." });
    expect(parseImportedJobFit(String(state.saved[0].extracted_text), "now")?.recommendation).toBe("apply");
  });
});

describe("assessing fit: failure", () => {
  it("says so when the assessment could not be saved", async () => {
    state.fail = true;
    const response = await request({ importId: "imp-1" });
    expect(response.status).toBe(500);
    expect(await response.text()).toMatch(/could not be saved/i);
  });
});
