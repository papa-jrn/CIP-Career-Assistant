import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "@/lib/cip/__fixtures__/fake-supabase";
import { currentCareersUrls, describeCareersUrl, loadCareersUrlCorrections, resolveCareersUrl } from "@/lib/cip/employer-careers-url";
import { loadTargetWorkspace } from "@/lib/cip/target-workspace-loader";
import { renderWorkspace } from "@/lib/cip/target-workspace-view";
import { advanceJobSearchRun, loadTargetCareerPages, startJobSearchRun } from "@/lib/cip/job-search-run";
import { loadJobSearchConfig } from "@/lib/cip/job-search-config";
import type { JobSearchProvider } from "@/lib/cip/job-search-engine";

const state = vi.hoisted(() => ({ client: null as unknown, user: "user-a" as string | null }));
vi.mock("@/lib/supabase/server", () => ({ createServer: () => state.client }));
import { POST } from "./careers-url";

const USER = "user-a";
const NAME = "Riverside Health";
const OLD = "https://guessed.example.org/careers";
const NEW = "https://careers.example.org/opportunities";
let fake: ReturnType<typeof createFakeSupabase>;

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("PUBLIC_SUPABASE_ANON_KEY", "test-only");
  state.user = USER;
  fake = createFakeSupabase({
    watched_employers: [{ id: "employer-1", user_id: USER, name: NAME, careers_url: OLD, target_roles: [], fit_score: 70 }],
    employer_candidates: [{ user_id: "other-user", name: "Private Employer" }],
  });
  state.client = Object.assign(fake.client, {
    auth: { getUser: async () => ({ data: { user: state.user ? { id: state.user } : null } }) },
  });
});

async function save(fields: Record<string, string>, hx = true, origin = "http://localhost:4321") {
  const response = await POST({
    request: new Request("http://localhost:4321/api/employers/careers-url", {
      method: "POST", headers: { origin, ...(hx ? { "HX-Request": "true" } : {}) },
      body: new URLSearchParams({ employerName: NAME, ...fields }),
    }), cookies: {},
  } as never);
  // Model the database-generated timestamp for newest-first reloads.
  (fake.db.career_sources ?? []).forEach((row, index) => { row.created_at = `2026-10-26T12:00:0${index}Z`; });
  return response;
}

const config = () => loadJobSearchConfig((name) => name === "OPENAI_API_KEY" ? "fixture-only" : undefined);
function provider(): JobSearchProvider {
  return {
    name: "fixture", runStep: vi.fn(async () => ({
      ok: true as const,
      payload: { status: "completed", output: [
        { type: "web_search_call", action: { type: "search", query: "fixture" } },
        { type: "message", content: [{ type: "output_text", text: JSON.stringify({
          summary: "Fixture, not live jobs", postings: [],
          employers_checked: [{ name: NAME, careers_page_url: OLD, status: "page_found_but_could_not_read_listings", note: "Fixture unreadable" }],
        }) }] },
      ] },
    })),
  };
}

async function search() {
  const cfg = config();
  const started = await startJobSearchRun(fake.client, USER, crypto.randomUUID(), { config: cfg });
  if (started.kind !== "started") throw new Error("Fixture run did not start");
  const engine = provider();
  const fetcher = vi.fn(async () => ({ status: 404, text: "" }));
  await advanceJobSearchRun(fake.client, USER, started.runId, { config: cfg, provider: engine, fetcher });
  const request = vi.mocked(engine.runStep).mock.calls[0][0] as { input: Array<{ content: string }> };
  const task = JSON.parse(request.input[1].content).task;
  return { task, fetcher };
}

describe("Careers address save, reload and next-search flow", () => {
  it("appends the user's choice, reloads it in the dossier and sends it to both search readers", async () => {
    expect((await save({ careersUrl: NEW, note: "Found in the employer footer" })).status).toBe(200);
    expect(fake.db.career_sources[0]).toMatchObject({ user_id: USER, source_type: "employer_careers_url", trust_state: "user_supplied" });
    expect(fake.db.watched_employers[0].careers_url).toBe(OLD);
    const corrections = currentCareersUrls(await loadCareersUrlCorrections(fake.client, USER));
    const resolved = resolveCareersUrl({ name: NAME, careers_url: OLD }, corrections);
    expect(resolved).toMatchObject({ url: NEW, origin: "user_supplied", replaced: OLD });
    expect(describeCareersUrl(resolved)).toContain("you supplied");
    const workspace = await loadTargetWorkspace(fake.client, USER);
    expect(workspace.dossiers[0].careersUrl).toBe(NEW);
    const html = renderWorkspace(workspace.dossiers, { run: workspace.run, renderFunding: () => "" });
    expect(html).toContain(`href="${NEW}"`);
    expect(html).not.toContain(OLD);
    const { task, fetcher } = await search();
    expect(task.known_careers_pages).toEqual([{ name: NAME, url: NEW, origin: "user_supplied" }]);
    expect(fetcher).toHaveBeenCalledWith(NEW);
    expect(fetcher).not.toHaveBeenCalledWith(OLD);
    expect(JSON.stringify(task)).not.toContain("Found in the employer footer");
  });

  it("does not label a newly corrected page as read by an earlier search", async () => {
    await save({ careersUrl: NEW });
    fake.db.job_search_runs.push({
      id: "earlier", user_id: USER, status: "succeeded", started_at: "2026-10-01T12:00:00Z", finished_at: "2026-10-01T12:01:00Z",
      brief: {}, outbound_facets: {}, plan: [], next_step: 1, limits: {}, trace: [], usage: {}, summary: "", error: null,
      coverage: [{ name: NAME, status: "read_openings", note: "Read the old page", careersPageUrl: OLD, tier: "target_page", step: 0 }],
    });
    const workspace = await loadTargetWorkspace(fake.client, USER);
    expect(workspace.dossiers[0].careersUrl).toBe(NEW);
    expect(workspace.dossiers[0].openings.careers).toBe("not_checked");
    expect(workspace.dossiers[0].openings.careersNote).toContain("did not check this new choice");
  });
  it("removes a rejected careers URL from the dossier and both direct reads without cancelling other search", async () => {
    await save({ none: "yes", careersUrl: OLD });
    expect(await loadTargetCareerPages(fake.client, USER, [NAME])).toEqual([{ name: NAME, url: null, origin: "none_known" }]);
    const workspace = await loadTargetWorkspace(fake.client, USER);
    expect(workspace.dossiers[0].careersUrl).toBeNull();
    const { task, fetcher } = await search();
    expect(task.known_careers_pages).toEqual([{ name: NAME, url: null, origin: "none_known" }]);
    expect(task.instruction).toContain("sector boards and open-web");
    expect(fetcher).not.toHaveBeenCalled();
    expect(fake.db.job_search_runs[0].status).toBe("succeeded");
  });

  it("allows a later correction to replace a no-page answer without deleting its history", async () => {
    await save({ none: "yes" });
    await save({ careersUrl: NEW });
    expect(fake.db.career_sources).toHaveLength(2);
    expect(await loadTargetCareerPages(fake.client, USER, [NAME])).toEqual([{ name: NAME, url: NEW, origin: "user_supplied" }]);
  });

  it("keeps confirmation before the anchor and forces repeated saves to reload", async () => {
    const response = await save({ careersUrl: NEW, returnTo: "/employers?view=saved#target-employer-1" });
    expect(response.headers.get("HX-Redirect")).toBe("/employers?view=saved&careers=saved#target-employer-1");
    expect(response.headers.get("HX-Refresh")).toBe("true");
    const native = await save({ careersUrl: NEW, returnTo: "/employers#target-employer-1" }, false);
    expect(native.status).toBe(303);
    expect(native.headers.get("Location")).toBe("/employers?careers=saved#target-employer-1");
  });

  it("does not redirect off-site", async () => {
    const response = await save({ careersUrl: NEW, returnTo: "//untrusted.example/path" });
    expect(response.headers.get("HX-Redirect")).toBe("/employers?careers=saved");
  });

  it("rejects cross-origin, anonymous and other-user writes without saving", async () => {
    expect((await save({ careersUrl: NEW }, true, "https://untrusted.example")).status).toBe(403);
    state.user = null;
    expect((await save({ careersUrl: NEW })).status).toBe(401);
    state.user = USER;
    expect((await save({ employerName: "Private Employer", careersUrl: NEW })).status).toBe(404);
    expect(fake.db.career_sources ?? []).toEqual([]);
  });

  it("rejects an invalid or missing URL", async () => {
    expect((await save({ careersUrl: "javascript:alert(1)" })).status).toBe(400);
    expect((await save({})).status).toBe(400);
    expect(fake.db.career_sources ?? []).toEqual([]);
  });
});