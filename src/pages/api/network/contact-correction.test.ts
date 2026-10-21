import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseContactCorrection } from "@/lib/cip/conversation-corrections";

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

import { POST } from "./contact-correction";

const conversationRow = { id: "row-1", user_id: "user-a", source_type: "conversation_outcome" };

function request(fields: Record<string, string>, origin = "http://localhost:4321") {
  return POST({
    request: new Request("http://localhost:4321/api/network/contact-correction", {
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
  state.rows = [conversationRow];
  state.saved = [];
  state.fail = false;
  state.filters = [];
});

describe("conversation contact correction boundary", () => {
  it("rejects cross-origin writes and unauthenticated corrections", async () => {
    expect((await request({ targetId: "row-1", contactName: "Vince Berk" }, "https://untrusted.example")).status).toBe(403);
    state.user = null;
    expect((await request({ targetId: "row-1", contactName: "Vince Berk" })).status).toBe(401);
    expect(state.saved).toEqual([]);
  });

  it("cannot correct another user's conversation", async () => {
    state.rows = [{ ...conversationRow, user_id: "user-b" }];
    expect((await request({ targetId: "row-1", contactName: "Vince Berk" })).status).toBe(404);
    expect(state.saved).toEqual([]);
    expect(state.filters).toContainEqual(["user_id", "user-a"]);
  });

  it("cannot point a correction at a record that is not a conversation", async () => {
    state.rows = [{ ...conversationRow, source_type: "resume_intake" }];
    expect((await request({ targetId: "row-1", contactName: "Vince Berk" })).status).toBe(404);
    expect(state.saved).toEqual([]);
  });

  it("requires a name and rejects an over-long one", async () => {
    expect((await request({ targetId: "row-1", contactName: "   " })).status).toBe(400);
    expect((await request({ targetId: "row-1", contactName: "V".repeat(81) })).status).toBe(400);
    expect((await request({ contactName: "Vince Berk" })).status).toBe(400);
    expect(state.saved).toEqual([]);
  });

  it("stores the correction additively, without touching the conversation", async () => {
    const response = await request({ targetId: "row-1", contactName: "Vince Berk", contactOrganization: "Quine" });
    expect(response.status).toBe(200);
    expect(state.saved).toHaveLength(1);
    expect(state.saved[0].user_id).toBe("user-a");
    expect(state.saved[0].source_type).toBe("conversation_contact_correction");
    expect(state.saved[0].trust_state).toBe("user_supplied");
    // The conversation row itself is untouched; the correction is a new record.
    expect(state.rows).toEqual([conversationRow]);

    const parsed = parseContactCorrection(String(state.saved[0].extracted_text), "now");
    expect(parsed).toMatchObject({ targetId: "row-1", contactName: "Vince Berk", contactOrganization: "Quine" });
  });

  it("returns the user to the page they corrected from", async () => {
    const response = await request({ targetId: "row-1", contactName: "Vince Berk", returnTo: "/network?view=signals" });
    expect(response.headers.get("HX-Redirect")).toBe("/network?view=signals&corrected=contact");
  });

  it("ignores an off-site return path", async () => {
    const response = await request({ targetId: "row-1", contactName: "Vince Berk", returnTo: "https://untrusted.example/steal" });
    expect(response.headers.get("HX-Redirect")).toBe("/network?corrected=contact");
  });

  it("keeps the entry and reports failure when the write fails", async () => {
    state.fail = true;
    const response = await request({ targetId: "row-1", contactName: "Vince Berk" });
    expect(response.status).toBe(500);
    expect(await response.text()).toContain("still here");
  });
});
