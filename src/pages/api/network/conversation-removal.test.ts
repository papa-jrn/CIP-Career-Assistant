import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseConversationRemoval } from "@/lib/cip/conversation-removals";

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

import { POST } from "./conversation-removal";

const conversationRow = { id: "row-1", user_id: "user-a", source_type: "conversation_outcome" };

function request(fields: Record<string, string>, origin = "http://localhost:4321") {
  return POST({
    request: new Request("http://localhost:4321/api/network/conversation-removal", {
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

describe("conversation removal boundary", () => {
  it("rejects cross-origin and unauthenticated removals", async () => {
    expect((await request({ targetId: "row-1" }, "https://untrusted.example")).status).toBe(403);
    state.user = null;
    expect((await request({ targetId: "row-1" })).status).toBe(401);
    expect(state.saved).toEqual([]);
  });

  it("cannot remove another user's conversation", async () => {
    state.rows = [{ ...conversationRow, user_id: "user-b" }];
    expect((await request({ targetId: "row-1" })).status).toBe(404);
    expect(state.saved).toEqual([]);
    expect(state.filters).toContainEqual(["user_id", "user-a"]);
  });

  it("cannot remove a record that is not a conversation", async () => {
    state.rows = [{ ...conversationRow, source_type: "resume_intake" }];
    expect((await request({ targetId: "row-1" })).status).toBe(404);
    expect(state.saved).toEqual([]);
  });

  it("requires a conversation to act on", async () => {
    expect((await request({})).status).toBe(400);
    expect(state.saved).toEqual([]);
  });

  it("records the removal without deleting the conversation", async () => {
    const response = await request({ targetId: "row-1", reason: "Duplicate of the June note" });
    expect(response.status).toBe(200);
    expect(state.saved).toHaveLength(1);
    expect(state.saved[0].source_type).toBe("conversation_removed");
    expect(state.saved[0].user_id).toBe("user-a");
    // The conversation row itself is untouched - this is recoverable.
    expect(state.rows).toEqual([conversationRow]);
    expect(parseConversationRemoval(String(state.saved[0].extracted_text), "now")).toMatchObject({
      targetId: "row-1",
      removed: true,
      reason: "Duplicate of the June note",
    });
  });

  it("records a restore", async () => {
    const response = await request({ targetId: "row-1", removed: "false" });
    expect(response.headers.get("HX-Redirect")).toContain("conversation=restored");
    expect(parseConversationRemoval(String(state.saved[0].extracted_text), "now")?.removed).toBe(false);
  });

  it("returns the user to the page they acted from, and ignores off-site paths", async () => {
    const inApp = await request({ targetId: "row-1", returnTo: "/network?view=all" });
    expect(inApp.headers.get("HX-Redirect")).toBe("/network?view=all&conversation=removed");
    const offSite = await request({ targetId: "row-1", returnTo: "https://untrusted.example/steal" });
    expect(offSite.headers.get("HX-Redirect")).toBe("/network?conversation=removed");
  });

  it("changes nothing and reports failure when the write fails", async () => {
    state.fail = true;
    const response = await request({ targetId: "row-1" });
    expect(response.status).toBe(500);
    expect(await response.text()).toContain("Nothing was altered");
  });
});
