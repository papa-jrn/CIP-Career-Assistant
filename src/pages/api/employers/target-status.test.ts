import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: "user-a" as string | null,
  rows: {} as Record<string, Array<Record<string, unknown>>>,
  saved: [] as Array<Record<string, unknown>>,
  fail: false,
  filters: [] as Array<[string, unknown]>,
}));

vi.mock("@/lib/supabase/server", () => ({ createServer: () => db }));

const db = {
  auth: { getUser: async () => ({ data: { user: state.user ? { id: state.user } : null } }) },
  from: (table: string) => {
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
        data: (state.rows[table] ?? []).filter((r) => filters.every((f) => f(r))).slice(0, n),
        error: null,
      }),
      insert: async (record: Record<string, unknown>) => {
        if (!state.fail) state.saved.push({ ...record, __table: table });
        return { error: state.fail ? { message: 'relation "employer_target_events" does not exist' } : null };
      },
    };
    return query;
  },
};

import { POST } from "./target-status";

function request(fields: Record<string, string>, origin = "http://localhost:4321") {
  return POST({
    request: new Request("http://localhost:4321/api/employers/target-status", {
      method: "POST",
      headers: { origin, "HX-Request": "true", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields),
    }),
    cookies: {},
  } as never);
}

beforeEach(() => {
  vi.stubEnv("PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("PUBLIC_SUPABASE_ANON_KEY", "test-only");
  state.user = "user-a";
  state.rows = {
    watched_employers: [{ user_id: "user-a", name: "Riverside Health" }],
    employer_candidates: [{ user_id: "user-a", name: "Granite Trust" }],
  };
  state.saved = [];
  state.fail = false;
  state.filters = [];
});

describe("setting a target status: boundary", () => {
  it("rejects cross-origin and unauthenticated writes", async () => {
    expect((await request({ employerName: "Riverside Health", status: "researching" }, "https://untrusted.example")).status).toBe(403);
    state.user = null;
    expect((await request({ employerName: "Riverside Health", status: "researching" })).status).toBe(401);
    expect(state.saved).toEqual([]);
  });

  it("refuses a status the workspace does not define", async () => {
    expect((await request({ employerName: "Riverside Health", status: "keen" })).status).toBe(400);
    expect((await request({ employerName: "Riverside Health" })).status).toBe(400);
    expect(state.saved).toEqual([]);
  });

  it("refuses an employer the user is not tracking or considering", async () => {
    const response = await request({ employerName: "Somewhere Else", status: "researching" });
    expect(response.status).toBe(404);
    expect(state.saved).toEqual([]);
    expect(state.filters).toContainEqual(["user_id", "user-a"]);
  });

  it("accepts a discovery candidate, not only a watched employer", async () => {
    expect((await request({ employerName: "Granite Trust", status: "not_interested" })).status).toBe(200);
    expect(state.saved).toHaveLength(1);
  });

  it("matches the employer despite naming drift", async () => {
    expect((await request({ employerName: "riverside  health", status: "paused" })).status).toBe(200);
  });
});

describe("setting a target status: what it records", () => {
  it("records the decision as the user's, against their own id", async () => {
    await request({ employerName: "Riverside Health", status: "applying", note: "Submitted on Monday." });
    expect(state.saved).toHaveLength(1);
    expect(state.saved[0]).toMatchObject({
      __table: "employer_target_events",
      user_id: "user-a",
      employer_key: "riverside health",
      name: "Riverside Health",
      status: "applying",
      note: "Submitted on Monday.",
      source: "user",
    });
  });

  it("stores the parent so excluding a parent can suppress its members", async () => {
    await request({ employerName: "Valley Hospital", status: "not_interested", parentOrganization: "Riverside Health" });
    // Not tracked, so it is refused - the parent only matters for one that is.
    expect(state.saved).toEqual([]);

    state.rows.employer_candidates = [{ user_id: "user-a", name: "Valley Hospital" }];
    await request({ employerName: "Valley Hospital", status: "not_interested", parentOrganization: "Riverside Health System" });
    expect(state.saved[0]).toMatchObject({ parent_key: "riverside health system" });
  });

  it("appends rather than replacing, so a decision can be reversed later", async () => {
    await request({ employerName: "Riverside Health", status: "not_interested" });
    await request({ employerName: "Riverside Health", status: "monitoring" });
    expect(state.saved).toHaveLength(2);
    expect(state.saved.map((r) => r.status)).toEqual(["not_interested", "monitoring"]);
  });

  it("does not touch the job search's employer exclusions", async () => {
    // §14 leaves that as a separate, explicit preference change; widening a
    // search exclusion from a workspace click would be an unasked-for change.
    await request({ employerName: "Riverside Health", status: "not_interested" });
    expect(state.saved.every((r) => r.__table === "employer_target_events")).toBe(true);
  });

  it("names the missing migration rather than failing blankly", async () => {
    state.fail = true;
    const response = await request({ employerName: "Riverside Health", status: "researching" });
    expect(response.status).toBe(500);
    expect(await response.text()).toMatch(/apply the latest Supabase migrations/i);
  });
});
