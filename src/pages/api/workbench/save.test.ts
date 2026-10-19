import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { actionRecord, loadWorkActions, type WorkEvent } from "@/lib/cip/workbench-actions";
const state = vi.hoisted(() => ({ user: "user-a" as string | null, rows: [] as Array<Record<string, unknown>>, saved: [] as Array<Record<string, unknown>>, fail: false, filters: [] as Array<[string, unknown]> }));
vi.mock("@/lib/supabase/server", () => ({ createServer: () => db }));
const db = {
  auth: { getUser: async () => ({ data: { user: state.user ? { id: state.user } : null } }) },
  from: () => {
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    const query = {
      select: () => query,
      eq: (k: string, v: unknown) => { state.filters.push([k,v]); filters.push(r => r[k] === v); return query; },
      in: (k: string, values: unknown[]) => { filters.push(r => values.includes(r[k])); return query; },
      order: () => query,
      range: async (start: number, end: number) => ({ data: state.rows.filter(r => filters.every(f => f(r))).slice(start, end + 1), error: state.fail ? { message: "failed" } : null }),
      insert: async (record: Record<string, unknown>) => { if (!state.fail) state.saved.push(record); return { error: state.fail ? { message: "failed" } : null }; },
    };
    return query;
  },
};
import { POST } from "./save";
const event: WorkEvent = { version: 1, actionId: "b17c231d-326c-48da-b777-3c3a77111f21", title: "Check funding", context: "Example organization", kind: "funding", status: "active", note: "" };
function request(fields: Record<string,string>, origin = "http://localhost:4321") {
  return POST({ request: new Request("http://localhost:4321/api/workbench/save", { method: "POST", headers: { origin, "HX-Request": "true", "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields) }), cookies: {} } as never);
}
beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("PUBLIC_SUPABASE_ANON_KEY", "test-only");
  state.user = "user-a"; state.rows = []; state.saved = []; state.fail = false; state.filters = [];
});
describe("Workbench save boundary", () => {
  it("rejects cross-origin writes and unauthenticated updates", async () => {
    expect((await request({ operation: "create", title: "Check funding" }, "https://untrusted.example")).status).toBe(403);
    state.user = null;
    expect((await request({ operation: "create", title: "Check funding" })).status).toBe(401);
    expect(state.saved).toEqual([]);
  });
  it("saves captures as analysis evidence without creating completed tasks", async () => {
    const response = await request({ operation: "capture", kind: "goal", note: "Explore launching my own company." });
    expect(response.headers.get("HX-Redirect")).toBe("/workbench?view=work");
    expect(state.saved[0].user_id).toBe("user-a");
    const payload = JSON.parse(String(state.saved[0].extracted_text));
    expect(payload.workbenchAction).toBeUndefined();
    expect(payload.workbenchCapture.kind).toBe("goal");
    expect(payload.response.sourceNote).toContain("User intention");
  });
  it("cannot mutate another user's action", async () => {
    state.rows = [{ ...actionRecord(event), id: "1", user_id: "user-b", created_at: "2026-10-19" }];
    expect((await request({ operation: "outcome", actionId: event.actionId, status: "completed" })).status).toBe(404);
    expect(state.saved).toHaveLength(0);
    expect(state.filters).toContainEqual(["user_id", "user-a"]);
  });
  it("appends a single atomic evidence/outcome record", async () => {
    state.rows = [{ ...actionRecord(event), id: "1", user_id: "user-a", created_at: "2026-10-19" }];
    expect((await request({ operation: "outcome", actionId: event.actionId, status: "completed", note: "Reviewed the reports; current position remains unknown." })).status).toBe(200);
    expect(state.saved).toHaveLength(1);
    expect(JSON.parse(String(state.saved[0].extracted_text)).workbenchAction.status).toBe("completed");
    expect(state.rows).toHaveLength(1);
  });
  it("returns to completed work rather than recreating or reopening it", async () => {
    state.rows = [{ ...actionRecord({ ...event, status: "completed" }), id: "1", user_id: "user-a", created_at: "2026-10-19" }];
    const response = await request({ operation: "create", title: "  CHECK   FUNDING ", context: "Example organization" });
    expect(response.headers.get("HX-Redirect")).toContain(event.actionId);
    expect(state.saved).toEqual([]);
  });
  it("creates a user-owned action without manufacturing analysis evidence", async () => {
    expect((await request({ operation: "create", title: "Investigate local employer" })).status).toBe(200);
    expect(state.saved[0].source_type).toBe("workbench_action");
    expect(state.saved[0].user_id).toBe("user-a");
    expect(JSON.parse(String(state.saved[0].extracted_text)).response).toBeUndefined();
  });
  it("does not redirect or claim success after a failed write", async () => {
    state.fail = true;
    const response = await request({ operation: "capture", note: "A sufficiently detailed finding." });
    expect(response.status).toBe(500);
    expect(response.headers.get("HX-Redirect")).toBeNull();
    expect(state.saved).toEqual([]);
  });
  it("reads beyond one database page without dropping old lifecycle decisions", async () => {
    state.rows = Array.from({ length: 501 }, (_, i) => ({ ...actionRecord({ ...event, status: i === 0 ? "dismissed" : "active" }), id: String(i), user_id: "user-a", created_at: String(1000-i) }));
    const actions = await loadWorkActions(db as unknown as SupabaseClient, "user-a");
    expect(actions[0].status).toBe("dismissed");
    expect(actions[0].history).toHaveLength(501);
  });
  it("fails visibly rather than returning empty work on a database error", async () => {
    state.fail = true;
    await expect(loadWorkActions(db as unknown as SupabaseClient, "user-a")).rejects.toThrow("Could not load your work");
  });
});
