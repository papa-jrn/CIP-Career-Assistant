import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: "user-a" as string | null,
  rows: [] as Array<Record<string, unknown>>,
  inserted: [] as Array<Record<string, unknown>>,
  insertError: null as { message: string } | null,
  readError: null as { message: string } | null,
}));

vi.mock("@/lib/supabase/server", () => ({ createServer: () => db }));

const db = {
  auth: { getUser: async () => ({ data: { user: state.user ? { id: state.user } : null } }) },
  from: () => {
    const query: Record<string, unknown> = {
      select: () => query,
      eq: () => query,
      order: () => query,
      limit: async () => ({ data: state.readError ? null : state.rows, error: state.readError }),
      insert: async (record: Record<string, unknown>) => {
        if (!state.insertError) state.inserted.push(record);
        return { error: state.insertError };
      },
    };
    return query;
  },
};

import { POST } from "./save";

const storedRow = (question: string, answer: string) => ({
  extracted_text: JSON.stringify({ response: { question, answer, confidence: "known" } }),
  created_at: "2026-10-28T12:00:00.000Z",
});

function request(fields: Record<string, string>, origin = "http://localhost:4321") {
  return POST({
    request: new Request("http://localhost:4321/api/evidence/save", {
      method: "POST",
      headers: { origin, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields),
    }),
    cookies: {},
  } as never);
}

const valid = { question_id: "q1", question: "What scope did you own?", answer: "Five teams, no direct reports.", confidence: "known" };

beforeEach(() => {
  vi.stubEnv("PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("PUBLIC_SUPABASE_ANON_KEY", "test-only");
  state.user = "user-a";
  state.rows = [];
  state.inserted = [];
  state.insertError = null;
  state.readError = null;
});

describe("saving evidence: the list refreshes without a reload", () => {
  it("returns the confirmation and an out-of-band swap of the saved list", async () => {
    // The defect this covers: the save succeeded but the panel still read
    // "No evidence answers saved yet" until the page was reloaded, so a
    // successful save looked like a failed one.
    state.rows = [storedRow("What scope did you own?", "Five teams, no direct reports.")];
    const body = await (await request(valid)).text();

    expect(body).toContain("Evidence saved.");
    expect(body).toContain('id="saved-evidence-list"');
    expect(body).toContain('hx-swap-oob="true"');
    expect(body).toContain("Five teams, no direct reports.");
    expect(body).not.toContain("No evidence answers saved yet");
  });

  it("includes every saved answer, not only the one just submitted", async () => {
    state.rows = [storedRow("Newest", "newest answer"), storedRow("Older", "older answer")];
    const body = await (await request(valid)).text();
    expect(body).toContain("newest answer");
    expect(body).toContain("older answer");
    expect(body.indexOf("Newest")).toBeLessThan(body.indexOf("Older"));
  });

  it("escapes stored answers in the swapped fragment", async () => {
    state.rows = [storedRow("<script>alert(1)</script>", "a & b")];
    const body = await (await request(valid)).text();
    expect(body).not.toContain("<script>alert(1)</script>");
    expect(body).toContain("&lt;script&gt;");
  });

  it("still confirms the save when the list cannot be re-read", async () => {
    // The row is already written. Replacing the panel with an error here would
    // say the wrong thing about a save that worked.
    state.readError = { message: "read failed" };
    const body = await (await request(valid)).text();
    expect(body).toContain("Evidence saved.");
    expect(body).not.toContain("hx-swap-oob");
    expect(state.inserted).toHaveLength(1);
  });

  it("sends no list when the save itself failed", async () => {
    state.insertError = { message: "insert failed" };
    const response = await request(valid);
    const body = await response.text();
    expect(response.status).toBe(500);
    expect(body).not.toContain("hx-swap-oob");
    expect(body).not.toContain("Evidence saved.");
  });
});

describe("saving evidence: boundary, unchanged by this fix", () => {
  it("rejects a cross-origin request", async () => {
    expect((await request(valid, "https://untrusted.example")).status).toBe(403);
    expect(state.inserted).toEqual([]);
  });

  it("requires a signed-in user", async () => {
    state.user = null;
    expect((await request(valid)).status).toBe(401);
    expect(state.inserted).toEqual([]);
  });

  it("asks for more detail instead of saving a near-empty answer", async () => {
    const response = await request({ ...valid, answer: "too short" });
    expect(response.status).toBe(400);
    expect(state.inserted).toEqual([]);
  });
});
