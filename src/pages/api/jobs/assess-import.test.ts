import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseImportedJobFit } from "@/lib/cip/imported-job-fit";
import { buildImportedJob, importedJobInput, importedJobPayload } from "@/lib/cip/imported-jobs";

const state = vi.hoisted(() => ({
  user: "user-a" as string | null,
  rows: {} as Record<string, Array<Record<string, unknown>>>,
  saved: [] as Array<Record<string, unknown>>,
  fail: false,
  archiveCalls: [] as Array<unknown[]>,
  filters: [] as Array<[string, unknown]>,
}));

vi.mock("@/lib/cip/job-archive", () => ({ setImportedArchive: async (...args: unknown[]) => { state.archiveCalls.push(args.slice(1)); } }));
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
  from: (table: string) => {
    let sourceType = table === "career_sources" ? "" : table;
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

vi.mock("@/lib/cip/job-verifier", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/cip/job-verifier")>(), safePageFetcher: vi.fn(async () => null) }));
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
  state.archiveCalls = [];
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

  it("explains the next action and leaves the score unknown without personal evidence", async () => {
    await request({ importId: "imp-1" });
    const fit = parseImportedJobFit(String(state.saved[0].extracted_text), "now");
    expect(fit?.nextAction.length).toBeGreaterThan(20);
    expect(fit?.analysis?.score).toBeNull();
    expect(fit?.analysis?.scoreReason).toMatch(/not enough/i);
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
    expect(state.archiveCalls).toEqual([["user-a", expect.objectContaining({ importId: "imp-1" }), true]]);
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

describe("assessment refresh and original profile context", () => {
  it("forces a refresh with query parameters before the anchor", async () => {
    const response = await request({ importId: "imp-1", returnTo: "/opportunities#imported-jobs" });
    expect(response.headers.get("HX-Redirect")).toBe("/opportunities?assessed=deterministic#imported-jobs");
    expect(response.headers.get("HX-Refresh")).toBe("true");
  });
  it("includes original resume evidence and each genuine lane in the saved fallback", async () => {
    state.rows.resume_intake = [{ user_id: "user-a", source_type: "resume_intake", extracted_text: JSON.stringify({ intake: { resume_text: "Bachelor's degree. Led operations and built cross-functional software teams over a varied career." }, advisor: { roleBriefs: [{ role: "Operations leadership", whyItFits: "Leadership evidence", evidenceNeeded: "Scope" }, { role: "Technology leadership", whyItFits: "Software work", evidenceNeeded: "Scale" }, { role: "Founder", whyItFits: "Product work", evidenceNeeded: "Pilot" }] } }) }];
    await request({ importId: "imp-1" });
    const result = parseImportedJobFit(String(state.saved[0].extracted_text), "now");
    expect(result?.analysis?.lanes.map(lane => lane.role)).toEqual(["Operations leadership", "Technology leadership", "Founder"]);
    expect(result?.analysis?.contextRefs).toContain("intake-resume_text-0");
    expect(state.filters).toContainEqual(["source_type", "evidence_response"]);
    expect(state.filters).toContainEqual(["source_type", "source_analysis"]);
  });
});

it("scopes searched assessments to the signed-in user and keeps unreadable descriptions unscored", async () => {
  const id = "12345678-1234-4234-8234-123456789abc";
  state.rows.job_search_observations = [{ id, user_id: "user-b", title: "Director", employer_text: "Employer", source_url: "https://example.org/job" }];
  expect((await request({ observationId: id })).status).toBe(404);
  state.rows.job_search_observations[0].user_id = "user-a";
  const response = await request({ observationId: id });
  expect(response.status).toBe(200);
  expect(response.headers.get("HX-Redirect")).toContain("#job-search-panel");
  const fit = parseImportedJobFit(String(state.saved[0].extracted_text), "now");
  expect(fit?.importId).toMatch(/^search-/);
  expect(fit?.analysis?.score).toBeNull();
  expect(state.filters).toContainEqual(["user_id", "user-a"]);
});

it("returns inline assessment updates without redirecting or regrouping the page", async () => {
  const response = await request({ importId: "imp-1", inlineResult: "yes" });
  expect(response.status).toBe(200);
  expect(response.headers.get("HX-Redirect")).toBeNull();
  expect(response.headers.get("HX-Refresh")).toBeNull();
  expect(JSON.parse(response.headers.get("HX-Trigger-After-Settle")!)).toEqual({ fitAssessmentReady: { targetId: "fit-assessment-imp-1" } });
  const body = await response.text();
  expect(body).toContain('id="fit-assessment-imp-1" hx-swap-oob="innerHTML"');
  expect(body).toContain("Assessment needs attention");
  expect(body).toContain("remains unscored");
  expect(state.saved).toHaveLength(1);
});
it("keeps the existing assessment readable when an inline save fails", async () => {
  state.fail = true;
  const response = await request({ importId: "imp-1", inlineResult: "yes" });
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain("hx-swap-oob");
  expect(response.headers.get("HX-Redirect")).toBeNull();
});

it("saves an experience clarification as user evidence and includes it in the assessment", async () => {
  const clarification = "I have worked in organic SEO for 12+ years as a web developer. WordPress was my main focus until the last year. I have managed AdWords for some clients.";
  const response = await request({ importId: "imp-1", inlineResult: "yes", clarification });
  expect(response.status).toBe(200);
  expect(state.saved).toHaveLength(2);
  const evidence = state.saved.find(item => item.source_type === "evidence_response")!;
  expect(evidence.user_id).toBe("user-a");
  expect(evidence.trust_state).toBe("user_submitted");
  expect(JSON.parse(String(evidence.extracted_text)).response).toMatchObject({ answer: clarification, confidence: "known" });
  const assessment = state.saved.find(item => item.source_type === "imported_job_fit")!;
  expect(parseImportedJobFit(String(assessment.extracted_text), "now")?.analysis?.contextRefs.some(ref => ref.startsWith("evidence_response-"))).toBe(true);
  expect(await response.text()).toContain("clarification was saved");
});
