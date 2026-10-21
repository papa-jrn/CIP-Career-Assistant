import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseFollowUpResolution } from "@/lib/cip/follow-up-resolutions";

const state = vi.hoisted(() => ({
  user: "user-a" as string | null,
  rows: [] as Array<Record<string, unknown>>,
  saved: [] as Array<Record<string, unknown>>,
  fail: false,
  filters: [] as Array<[string, unknown]>,
}));

vi.mock("@/lib/supabase/server", () => ({ createServer: () => db }));

const db = {
  auth: { getUser: async () => ({ data: { user: state.user ? { id: state.user } : null } }) },
  from: () => {
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    const query = {
      select: () => query,
      eq: (k: string, v: unknown) => {
        state.filters.push([k, v]);
        filters.push((r) => r[k] === v);
        return query;
      },
      maybeSingle: async () => ({ data: state.rows.find((r) => filters.every((f) => f(r))) ?? null, error: null }),
      insert: async (record: Record<string, unknown>) => {
        if (!state.fail) state.saved.push(record);
        return { error: state.fail ? { message: "failed" } : null };
      },
    };
    return query;
  },
};

import { POST } from "./follow-up-resolution";

function request(fields: Record<string, string>, origin = "http://localhost:4321") {
  return POST({
    request: new Request("http://localhost:4321/api/network/follow-up-resolution", {
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
  state.rows = [];
  state.saved = [];
  state.fail = false;
  state.filters = [];
});

describe("follow-up resolution boundary", () => {
  it("rejects cross-origin and unauthenticated writes", async () => {
    expect((await request({ key: "ref:1", state: "met" }, "https://untrusted.example")).status).toBe(403);
    state.user = null;
    expect((await request({ key: "ref:1", state: "met" })).status).toBe(401);
    expect(state.saved).toEqual([]);
  });

  it("requires an obligation and a known state", async () => {
    expect((await request({ state: "met" })).status).toBe(400);
    expect((await request({ key: "ref:1" })).status).toBe(400);
    expect((await request({ key: "ref:1", state: "banana" })).status).toBe(400);
    expect((await request({ key: "r".repeat(401), state: "met" })).status).toBe(400);
    expect(state.saved).toEqual([]);
  });

  it("records the resolution against the signed-in user", async () => {
    const response = await request({ key: "ref:1", state: "met", note: "Emailed the summary" });
    expect(response.status).toBe(200);
    expect(state.saved).toHaveLength(1);
    expect(state.saved[0].user_id).toBe("user-a");
    expect(state.saved[0].source_type).toBe("follow_up_resolution");
    expect(parseFollowUpResolution(String(state.saved[0].extracted_text), "now")).toMatchObject({
      key: "ref:1",
      state: "met",
      note: "Emailed the summary",
    });
  });

  it("records dropping and reopening", async () => {
    await request({ key: "ref:1", state: "dropped" });
    expect(parseFollowUpResolution(String(state.saved[0].extracted_text), "now")?.state).toBe("dropped");
    await request({ key: "ref:1", state: "open" });
    expect(parseFollowUpResolution(String(state.saved[1].extracted_text), "now")?.state).toBe("open");
  });

  it("returns to the page acted from and ignores off-site paths", async () => {
    const inApp = await request({ key: "ref:1", state: "met", returnTo: "/follow-up?view=all" });
    expect(inApp.headers.get("HX-Redirect")).toBe("/follow-up?view=all&followup=met");
    const offSite = await request({ key: "ref:1", state: "met", returnTo: "https://untrusted.example" });
    expect(offSite.headers.get("HX-Redirect")).toBe("/follow-up?followup=met");
  });

  it("changes nothing and reports failure when the write fails", async () => {
    state.fail = true;
    const response = await request({ key: "ref:1", state: "met" });
    expect(response.status).toBe(500);
    expect(await response.text()).toContain("Nothing was altered");
  });
});
