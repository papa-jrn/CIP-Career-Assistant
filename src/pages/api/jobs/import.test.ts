import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseImportedJob } from "@/lib/cip/imported-jobs";

const state = vi.hoisted(() => ({
  user: "user-a" as string | null,
  rows: [] as Array<Record<string, unknown>>,
  saved: [] as Array<Record<string, unknown>>,
  fail: false,
  filters: [] as Array<[string, unknown]>,
  observations: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/supabase/server", () => ({ createServer: () => db }));

const db = {
  auth: { getUser: async () => ({ data: { user: state.user ? { id: state.user } : null } }) },
  from: (table: string) => {
    const rowsFor = () => (table === "job_search_observations" ? state.observations : state.rows);
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    const query = {
      select: () => query,
      eq: (k: string, v: unknown) => {
        state.filters.push([k, v]);
        filters.push((r) => r[k] === v);
        return query;
      },
      order: () => query,
      limit: async (n: number) => ({
        data: rowsFor().filter((r) => filters.every((f) => f(r))).slice(0, n),
        error: null,
      }),
      maybeSingle: async () => ({ data: rowsFor().find((r) => filters.every((f) => f(r))) ?? null, error: null }),
      insert: async (record: Record<string, unknown>) => {
        if (!state.fail) state.saved.push(record);
        return { error: state.fail ? { message: "failed" } : null };
      },
    };
    return query;
  },
};

import { POST } from "./import";

function request(fields: Record<string, string>, origin = "http://localhost:4321") {
  return POST({
    request: new Request("http://localhost:4321/api/jobs/import", {
      method: "POST",
      headers: { origin, "HX-Request": "true", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields),
    }),
    cookies: {},
  } as never);
}

const JOB = {
  title: "Director of Clinical Operations",
  employer: "Riverside Health",
  sourceUrl: "https://careers.riverside.org/jobs/1234",
};

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("PUBLIC_SUPABASE_ANON_KEY", "test-only");
  state.user = "user-a";
  state.rows = [];
  state.observations = [];
  state.saved = [];
  state.fail = false;
  state.filters = [];
});

describe("importing a job: boundary", () => {
  it("rejects cross-origin and unauthenticated imports", async () => {
    expect((await request(JOB, "https://untrusted.example")).status).toBe(403);
    state.user = null;
    expect((await request(JOB)).status).toBe(401);
    expect(state.saved).toEqual([]);
  });

  it("requires a title, an employer, and either a link or the posting text", async () => {
    expect((await request({ ...JOB, title: "" })).status).toBe(400);
    expect((await request({ ...JOB, employer: "" })).status).toBe(400);
    expect((await request({ title: JOB.title, employer: JOB.employer })).status).toBe(400);
    expect(state.saved).toEqual([]);
  });

  it("refuses a link that is not http(s)", async () => {
    for (const sourceUrl of ["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd"]) {
      expect((await request({ ...JOB, sourceUrl })).status).toBe(400);
    }
    expect(state.saved).toEqual([]);
  });

  it("caps an oversized paste instead of storing it", async () => {
    const huge = await request({ ...JOB, originalMaterial: "x".repeat(110_000) });
    expect(huge.status).toBe(413);
    expect(state.saved).toEqual([]);
  });
});

describe("importing a job: what it stores", () => {
  it("saves the user's material against their own id, as user-supplied", async () => {
    const response = await request({ ...JOB, originalMaterial: "The full posting text." });
    expect(response.headers.get("HX-Redirect")).toContain("/opportunities");
    expect(state.saved).toHaveLength(1);
    expect(state.saved[0].user_id).toBe("user-a");
    expect(state.saved[0].source_type).toBe("imported_job");
    expect(state.saved[0].trust_state).toBe("user_supplied");

    const job = parseImportedJob(String(state.saved[0].extracted_text));
    expect(job).toMatchObject({ title: JOB.title, employer: JOB.employer, originalMaterial: "The full posting text." });
  });

  it("claims nothing about the listing or the fit on import", async () => {
    // §7: saving the input is not a verdict. Importing must not verify, judge
    // fit, watch the employer, apply, or contact anyone.
    await request(JOB);
    const job = parseImportedJob(String(state.saved[0].extracted_text));
    expect(job?.verification).toBeNull();
    expect(job?.fit).toBeNull();
    expect(state.saved).toHaveLength(1);
    expect(state.saved.some(r => r.source_type === "watched_employer")).toBe(false);
  });
});

describe("importing a job: not twice", () => {
  it("declines a job already imported under the same link", async () => {
    await request(JOB);
    state.rows = [{ user_id: "user-a", source_type: "imported_job", extracted_text: String(state.saved[0].extracted_text) }];
    state.saved = [];
    const again = await request({ ...JOB, sourceUrl: JOB.sourceUrl + "?utm_source=email" });
    expect(again.status).toBe(409);
    expect(state.saved).toEqual([]);
  });

  it("declines a job the weekly search already found", async () => {
    state.observations = [{ user_id: "user-a", title: JOB.title, employer_text: JOB.employer, source_url: JOB.sourceUrl, requisition_id: null }];
    const response = await request(JOB);
    expect(response.status).toBe(409);
    expect(state.saved).toEqual([]);
  });

  it("asks before adding a same-title, same-employer job, then allows it", async () => {
    state.observations = [{ user_id: "user-a", title: JOB.title, employer_text: JOB.employer, source_url: "https://elsewhere.example/9", requisition_id: null }];
    const asked = await request(JOB);
    expect(asked.status).toBe(409);
    expect(await asked.text()).toMatch(/may already have/i);

    const confirmed = await request({ ...JOB, confirmDuplicate: "yes" });
    expect(confirmed.status).toBe(200);
    expect(state.saved).toHaveLength(1);
  });

  it("allows a different role at the same employer without asking", async () => {
    state.observations = [{ user_id: "user-a", title: "Staff Nurse", employer_text: JOB.employer, source_url: "https://elsewhere.example/9", requisition_id: null }];
    expect((await request(JOB)).status).toBe(200);
    expect(state.saved).toHaveLength(1);
  });
});

describe("importing a job: failure", () => {
  it("keeps the entry and reports failure when the write fails", async () => {
    state.fail = true;
    const response = await request(JOB);
    expect(response.status).toBe(500);
    expect(await response.text()).toContain("still here");
  });
});
