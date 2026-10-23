import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildImportedJob, importedJobInput, importedJobPayload } from "@/lib/cip/imported-jobs";
const state = vi.hoisted(() => ({ user: "user-a" as string | null, rows: [] as Array<Record<string, unknown>>, saved: [] as unknown[], fail: false }));
vi.mock("@/lib/supabase/server", () => ({ createServer: () => ({ auth: { getUser: async () => ({ data: { user: state.user ? { id: state.user } : null } }) }, from: () => {
  const filters: Array<[string, unknown]> = [];
  const query = { select: () => query, eq: (key: string, value: unknown) => { filters.push([key, value]); return query; }, order: () => query, limit: async () => ({ data: state.rows.filter(row => filters.every(([key, value]) => row[key] === value)), error: null }) }; return query;
} }) }));
vi.mock("@/lib/cip/job-archive", () => ({ setImportedArchive: async (...args: unknown[]) => { if (state.fail) throw Error("failed"); state.saved.push(args.slice(1)); } }));
import { POST } from "./archive-import";
const job = buildImportedJob(importedJobInput.parse({ title: "Director", employer: "Example", originalMaterial: "A pasted description of operations work." }), { importId: "one", capturedAt: "2026-10-01" });
const request = (fields: Record<string, string>, origin = "http://localhost:4321") => POST({ request: new Request("http://localhost:4321/api/jobs/archive-import", { method: "POST", headers: { origin }, body: new URLSearchParams(fields) }), cookies: {} } as never);
beforeEach(() => { vi.stubEnv("OPENAI_API_KEY", ""); state.user = "user-a"; state.rows = [{ user_id: "user-a", source_type: "imported_job", extracted_text: JSON.stringify(importedJobPayload(job)) }]; state.saved = []; state.fail = false; });
describe("imported job archive endpoint", () => {
  it("authenticates and checks the origin before reading or writing", async () => {
    expect((await request({ importId: "one", action: "archive" }, "https://untrusted.example")).status).toBe(403);
    state.user = null; expect((await request({ importId: "one", action: "archive" })).status).toBe(401);
    expect(state.saved).toEqual([]);
  });
  it("will not archive another user's job or an invalid action", async () => {
    expect((await request({ importId: "one", action: "delete" })).status).toBe(400);
    state.rows[0].user_id = "another-user";
    expect((await request({ importId: "one", action: "archive" })).status).toBe(404);
    expect(state.saved).toEqual([]);
  });
  it("records explicit archive and restore decisions and returns to the correct view", async () => {
    const archived = await request({ importId: "one", action: "archive" });
    expect(archived.status).toBe(303); expect(archived.headers.get("Location")).toBe("/opportunities?jobs=active#imported-jobs");
    expect(state.saved[0]).toEqual(["user-a", expect.objectContaining({ importId: "one" }), true]);
    await request({ importId: "one", action: "restore" });
    expect(state.saved[1]).toEqual(["user-a", expect.objectContaining({ importId: "one" }), false]);
  });
  it("does not claim success when storage fails", async () => {
    state.fail = true; const result = await request({ importId: "one", action: "archive" });
    expect(result.status).toBe(500); expect(result.headers.get("Location")).toBeNull();
  });
});
