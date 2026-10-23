import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseImportedJobCheck } from "@/lib/cip/imported-job-checks";
import { buildImportedJob, importedJobInput, importedJobPayload } from "@/lib/cip/imported-jobs";

const state = vi.hoisted(() => ({
  user: "user-a" as string | null,
  rows: [] as Array<Record<string, unknown>>,
  saved: [] as Array<Record<string, unknown>>,
  fail: false,
  filters: [] as Array<[string, unknown]>,
  verifyCalls: [] as Array<Record<string, unknown>>,
  verifyResult: { state: "verified_open", note: "Title matched.", checkedAt: "2026-10-22T12:00:00.000Z" } as Record<string, unknown>,
}));

vi.mock("@/lib/supabase/server", () => ({ createServer: () => db }));

// The real verifier is exercised in its own suite; here we assert this endpoint
// calls it with the right posting and stores what it returns, without hitting
// the network.
vi.mock("@/lib/cip/job-verifier", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    verifyPosting: async (posting: Record<string, unknown>) => {
      state.verifyCalls.push(posting);
      return state.verifyResult;
    },
  };
});

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
      order: () => query,
      limit: async (n: number) => ({ data: state.rows.filter((r) => filters.every((f) => f(r))).slice(0, n), error: null }),
      insert: async (record: Record<string, unknown>) => {
        if (!state.fail) state.saved.push(record);
        return { error: state.fail ? { message: "failed" } : null };
      },
    };
    return query;
  },
};

import { POST } from "./verify-import";

const job = buildImportedJob(
  importedJobInput.parse({
    title: "Director of Clinical Operations",
    employer: "Riverside Health",
    sourceUrl: "https://careers.riverside.org/jobs/1234",
    requisitionId: "REQ-9001",
  }),
  { importId: "imp-1", capturedAt: "2026-10-01T12:00:00.000Z" },
);

function ownedRow(j = job) {
  return { user_id: "user-a", source_type: "imported_job", extracted_text: JSON.stringify(importedJobPayload(j)) };
}

function request(fields: Record<string, string>, origin = "http://localhost:4321") {
  return POST({
    request: new Request("http://localhost:4321/api/jobs/verify-import", {
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
  state.rows = [ownedRow()];
  state.saved = [];
  state.fail = false;
  state.filters = [];
  state.verifyCalls = [];
  state.verifyResult = { state: "verified_open", note: "Title matched.", checkedAt: "2026-10-22T12:00:00.000Z" };
});

describe("checking an imported job: boundary", () => {
  it("rejects cross-origin and unauthenticated checks", async () => {
    expect((await request({ importId: "imp-1" }, "https://untrusted.example")).status).toBe(403);
    state.user = null;
    expect((await request({ importId: "imp-1" })).status).toBe(401);
    expect(state.verifyCalls).toEqual([]);
  });

  it("will not check a job that is not the signed-in user's", async () => {
    state.rows = [{ ...ownedRow(), user_id: "user-b" }];
    expect((await request({ importId: "imp-1" })).status).toBe(404);
    // Nothing is fetched for a record this user does not own.
    expect(state.verifyCalls).toEqual([]);
    expect(state.filters).toContainEqual(["user_id", "user-a"]);
  });

  it("requires a job to check", async () => {
    expect((await request({})).status).toBe(400);
    expect((await request({ importId: "nope" })).status).toBe(404);
    expect(state.verifyCalls).toEqual([]);
  });

  it("explains that a pasted-only job has nothing to check, rather than failing", async () => {
    const pasted = buildImportedJob(
      importedJobInput.parse({ title: "Director", employer: "Riverside Health", originalMaterial: "Pasted posting." }),
      { importId: "imp-2", capturedAt: "2026-10-01T12:00:00.000Z" },
    );
    state.rows = [ownedRow(pasted)];
    const response = await request({ importId: "imp-2" });
    expect(response.status).toBe(400);
    expect(await response.text()).toMatch(/no link to check/i);
    expect(state.verifyCalls).toEqual([]);
  });
});

describe("checking an imported job: what it does", () => {
  it("checks the posting the user saved, with its requisition", async () => {
    await request({ importId: "imp-1" });
    expect(state.verifyCalls).toHaveLength(1);
    expect(state.verifyCalls[0]).toMatchObject({
      title: "Director of Clinical Operations",
      sourceUrl: "https://careers.riverside.org/jobs/1234",
      requisitionId: "REQ-9001",
    });
  });

  it("stores the result as its own record, leaving the import untouched", async () => {
    await request({ importId: "imp-1" });
    expect(state.saved).toHaveLength(1);
    expect(state.saved[0].source_type).toBe("imported_job_check");
    expect(state.saved[0].user_id).toBe("user-a");
    // The import itself is not rewritten: history is additive.
    expect(state.rows).toEqual([ownedRow()]);

    const check = parseImportedJobCheck(String(state.saved[0].extracted_text), "now");
    expect(check).toMatchObject({ importId: "imp-1", state: "verified_open" });
  });

  it("records an unreadable page as unread, not as a verified or fake listing", async () => {
    state.verifyResult = { state: "verification_unavailable", note: "The page could not be fetched.", checkedAt: "2026-10-22T12:00:00.000Z" };
    await request({ importId: "imp-1" });
    const check = parseImportedJobCheck(String(state.saved[0].extracted_text), "now");
    expect(check?.state).toBe("verification_unavailable");
    expect(state.saved[0].trust_state).toBe("unverified");
    expect(String(state.saved[0].extracted_text)).not.toMatch(/\bfake\b|\bscam\b/i);
  });

  it("marks only a live, matching page as verified", async () => {
    await request({ importId: "imp-1" });
    expect(state.saved[0].trust_state).toBe("verified");

    state.saved = [];
    state.verifyResult = { state: "no_longer_visible", note: "Gone.", checkedAt: "2026-10-22T12:00:00.000Z" };
    await request({ importId: "imp-1" });
    expect(state.saved[0].trust_state).toBe("unverified");
  });

  it("keeps each check rather than replacing the last one", async () => {
    await request({ importId: "imp-1" });
    state.verifyResult = { state: "no_longer_visible", note: "Gone.", checkedAt: "2026-10-23T12:00:00.000Z" };
    await request({ importId: "imp-1" });
    expect(state.saved).toHaveLength(2);
    expect(parseImportedJobCheck(String(state.saved[0].extracted_text), "now")?.state).toBe("verified_open");
    expect(parseImportedJobCheck(String(state.saved[1].extracted_text), "now")?.state).toBe("no_longer_visible");
  });

  it("returns the user where they were, and ignores an off-site path", async () => {
    const inApp = await request({ importId: "imp-1", returnTo: "/opportunities?view=all" });
    expect(inApp.headers.get("HX-Redirect")).toBe("/opportunities?view=all&checked=1");
    const offSite = await request({ importId: "imp-1", returnTo: "https://untrusted.example" });
    expect(offSite.headers.get("HX-Redirect")).toContain("/opportunities");
    expect(offSite.headers.get("HX-Redirect")).not.toContain("untrusted");
  });

  it("puts the success query before the anchor and persists unavailable research honestly", async () => {
    const result = await request({ importId: "imp-1", returnTo: "/opportunities#imported-jobs" });
    expect(result.headers.get("HX-Redirect")).toBe("/opportunities?checked=1#imported-jobs");
    // A second check redirects to this same address. Force a full reload rather
    // than a fragment-only navigation that leaves htmx indicators on screen.
    expect(result.headers.get("HX-Refresh")).toBe("true");
    expect(parseImportedJobCheck(String(state.saved[0].extracted_text), "now")?.employerResearch).toMatchObject({ status: "unavailable", businessConsistency: "unknown" });
  });

  it("says so when the check ran but could not be saved", async () => {
    state.fail = true;
    const response = await request({ importId: "imp-1" });
    expect(response.status).toBe(500);
    expect(await response.text()).toMatch(/could not be saved/i);
  });
});
