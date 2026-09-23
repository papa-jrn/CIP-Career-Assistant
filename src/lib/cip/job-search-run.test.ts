import { describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "@/lib/cip/__fixtures__/fake-supabase";
import { fixtureArea } from "@/lib/cip/__fixtures__/search-fixtures";
import { DEFAULT_LIMITS, loadJobSearchConfig, type JobSearchConfig } from "@/lib/cip/job-search-config";
import type { JobSearchProvider } from "@/lib/cip/job-search-engine";
import {
  advanceJobSearchRun,
  buildSummary,
  computeDueState,
  countByState,
  loadLatestVerifiedPostings,
  loadRunView,
  startJobSearchRun,
  type RunView,
} from "@/lib/cip/job-search-run";
import { escapeHtml, renderJobSearchPanel, renderJobSearchSummary } from "@/lib/cip/job-search-view";

const USER = "user-1";
const NOW = "2026-09-23T12:00:00.000Z";
const now = () => NOW;

function config(overrides: Partial<JobSearchConfig> = {}): JobSearchConfig {
  const base = loadJobSearchConfig((name) => (name === "OPENAI_API_KEY" ? "sk-test" : undefined));
  return { ...base, ...overrides, limits: { ...base.limits, ...(overrides.limits ?? {}) } };
}

function employers(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    user_id: USER,
    name: `Employer ${index + 1}`,
    region: "Test Region",
    priority: "medium",
    fit_score: 70 - index,
    fit_summary: "",
    target_roles: [],
    careers_url: null,
  }));
}

function posting(overrides: Record<string, unknown> = {}) {
  return {
    title: "Program Operations Lead",
    employer: "Employer 1",
    worksite_text: null,
    worksite_city: null,
    worksite_state: null,
    source_url: "https://jobs.example.org/postings/1",
    requisition_id: "R-1",
    posted_or_closing_date: null,
    salary_text: null,
    remote_status: "not_stated",
    matched_role_term: "Program Operations Lead",
    evidence_excerpt: "Program Operations Lead",
    ...overrides,
  };
}

function providerReturning(postings: unknown[], calls: string[] = []): JobSearchProvider {
  return {
    name: "fake",
    async runStep() {
      calls.push("call");
      return {
        ok: true,
        payload: {
          status: "completed",
          usage: { input_tokens: 20_000, output_tokens: 1_000, output_tokens_details: { reasoning_tokens: 100 } },
          output: [
            { type: "web_search_call", action: { type: "search", query: "q" } },
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    summary: "s",
                    employers_checked: [{ name: "Employer 1", careers_page_url: "https://jobs.example.org/", status: "read_openings", note: "" }],
                    postings,
                  }),
                },
              ],
            },
          ],
        },
      };
    },
  };
}

const failingProvider: JobSearchProvider = { name: "fake", runStep: async () => ({ ok: false, status: 500, message: "boom" }) };

const pageFetcher = async (url: string) =>
  url.endsWith("/1")
    ? { status: 200, text: `<h1>Program Operations Lead</h1> Req R-1 ${"details ".repeat(80)}` }
    : { status: 404, text: "" };

describe("startJobSearchRun", () => {
  it("records 'not configured' without any provider call or plan", async () => {
    const { client, db } = createFakeSupabase({ watched_employers: employers(2) });
    const outcome = await startJobSearchRun(client, USER, "key-not-configured", { config: loadJobSearchConfig(() => undefined), now });
    expect(outcome).toMatchObject({ kind: "blocked", status: "not_configured" });
    expect(db.job_search_runs[0]).toMatchObject({ status: "not_configured", next_step: 0 });
  });

  it("refuses to plan an empty search rather than reporting a success", async () => {
    const { client, db } = createFakeSupabase();
    const outcome = await startJobSearchRun(client, USER, "key-empty-search", { config: config(), now });
    expect(outcome).toMatchObject({ kind: "blocked", status: "failed" });
    expect(String(db.job_search_runs[0].error)).toMatch(/Nothing to search/);
  });

  it("starts a run with a saved private brief, the outbound facets, and a plan", async () => {
    const { client, db } = createFakeSupabase({ watched_employers: employers(6) });
    const outcome = await startJobSearchRun(client, USER, "key-first-run", { config: config(), now });
    expect(outcome.kind).toBe("started");
    const run = db.job_search_runs[0];
    expect(run).toMatchObject({ status: "running", next_step: 0, model: "gpt-5.4", brief_schema_version: 1 });
    expect((run.plan as unknown[]).length).toBe(2); // 6 targets, 4 per step
    expect((run.outbound_facets as { targetOrganizations: string[] }).targetOrganizations).toHaveLength(6);
  });

  it("reuses the same run for a repeated key and never starts a second paid run", async () => {
    const { client, db } = createFakeSupabase({ watched_employers: employers(2) });
    const first = await startJobSearchRun(client, USER, "key-repeated-click", { config: config(), now });
    const second = await startJobSearchRun(client, USER, "key-repeated-click", { config: config(), now });
    expect(second).toMatchObject({ kind: "reused", runId: (first as { runId: string }).runId });
    expect(db.job_search_runs).toHaveLength(1);
  });

  it("allows only one active run, and marks a stalled one abandoned", async () => {
    const { client, db } = createFakeSupabase({ watched_employers: employers(2) });
    const first = await startJobSearchRun(client, USER, "key-run-one", { config: config(), now });
    const blocked = await startJobSearchRun(client, USER, "key-run-two", { config: config(), now });
    expect(blocked).toMatchObject({ kind: "already_active", runId: (first as { runId: string }).runId });

    const later = () => new Date(Date.parse(NOW) + 11 * 60_000).toISOString();
    const next = await startJobSearchRun(client, USER, "key-run-three", { config: config(), now: later });
    expect(next.kind).toBe("started");
    expect(db.job_search_runs.find((row) => row.idempotency_key === "key-run-one")).toMatchObject({ status: "failed" });
  });

  it("stops at the weekly cap before any paid call", async () => {
    const { client, db } = createFakeSupabase({ watched_employers: employers(2) });
    for (let i = 0; i < 3; i += 1) {
      db.job_search_runs.push({
        id: `old-${i}`,
        user_id: USER,
        idempotency_key: `old-key-${i}`,
        status: "succeeded",
        next_step: 2,
        started_at: new Date(Date.parse(NOW) - 86_400_000).toISOString(),
      });
    }
    const outcome = await startJobSearchRun(client, USER, "key-over-cap", { config: config(), now });
    expect(outcome).toMatchObject({ kind: "blocked", status: "budget_limited" });
  });

  it("does not count runs that never made a provider call toward the weekly cap", async () => {
    const { client, db } = createFakeSupabase({ watched_employers: employers(2) });
    for (let i = 0; i < 5; i += 1) {
      db.job_search_runs.push({ id: `blocked-${i}`, user_id: USER, idempotency_key: `blocked-${i}`, status: "failed", next_step: 0, started_at: NOW });
    }
    expect((await startJobSearchRun(client, USER, "key-after-blocked", { config: config(), now })).kind).toBe("started");
  });
});

describe("advanceJobSearchRun", () => {
  async function started(count = 2, cfg = config()) {
    const fake = createFakeSupabase({ watched_employers: employers(count) });
    const outcome = await startJobSearchRun(fake.client, USER, `key-${Math.random().toString(36).slice(2, 10)}`, { config: cfg, now });
    return { ...fake, runId: (outcome as { runId: string }).runId, cfg };
  }

  it("verifies each posting on its own page and records what it found, with usage", async () => {
    const { client, runId, cfg } = await started();
    const view = await advanceJobSearchRun(client, USER, runId, {
      config: cfg,
      provider: providerReturning([posting(), posting({ title: "Ghost Role", source_url: "https://jobs.example.org/postings/2", requisition_id: "R-2" })]),
      fetcher: pageFetcher,
      now,
    });
    expect(view?.run.status).toBe("succeeded");
    const byTitle = Object.fromEntries((view?.observations ?? []).map((row) => [row.title, row.verification_state]));
    expect(byTitle).toEqual({ "Program Operations Lead": "verified_open", "Ghost Role": "no_longer_visible" });
    expect(view?.run.usage).toMatchObject({ inputTokens: 20_000, outputTokens: 1_000, webSearchCalls: 1 });
    expect(view?.run.cost_basis).toBe("unavailable");
    expect(view?.run.coverage[0]).toMatchObject({ name: "Employer 1", status: "read_openings", tier: "target_page" });
    expect(view?.run.summary).toMatch(/1 verified open/);
  });

  it("never runs the same paid step twice when two calls overlap", async () => {
    const { client, runId, cfg } = await started();
    const calls: string[] = [];
    const deps = { config: cfg, provider: providerReturning([], calls), fetcher: pageFetcher, now };
    await Promise.all([advanceJobSearchRun(client, USER, runId, deps), advanceJobSearchRun(client, USER, runId, deps)]);
    expect(calls).toHaveLength(1);
  });

  it("collapses a posting repeated across steps and honors the postings cap", async () => {
    const { client, runId, cfg } = await started(6);
    const same = providerReturning([posting()]);
    await advanceJobSearchRun(client, USER, runId, { config: cfg, provider: same, fetcher: pageFetcher, now });
    const view = await advanceJobSearchRun(client, USER, runId, { config: cfg, provider: same, fetcher: pageFetcher, now });
    expect(view?.observations).toHaveLength(1);
    expect(view?.run.status).toBe("succeeded");
  });

  it("records a provider failure as failed, never as an empty successful search", async () => {
    const { client, runId, cfg } = await started();
    const view = await advanceJobSearchRun(client, USER, runId, { config: cfg, provider: failingProvider, now });
    expect(view?.run.status).toBe("failed");
    expect(view?.run.error).toMatch(/Provider error 500/);
    expect(view?.observations).toHaveLength(0);
    expect(view?.run.summary).toMatch(/says nothing about whether openings exist/);
  });

  it("keeps earlier results and reports 'partial' when a later step fails", async () => {
    const { client, runId, cfg } = await started(6);
    await advanceJobSearchRun(client, USER, runId, { config: cfg, provider: providerReturning([posting()]), fetcher: pageFetcher, now });
    const view = await advanceJobSearchRun(client, USER, runId, { config: cfg, provider: failingProvider, now });
    expect(view?.run.status).toBe("partial");
    expect(view?.observations).toHaveLength(1);
    expect(view?.run.summary).toMatch(/missing coverage is not the same as no openings/);
  });

  it("reports a completed search with zero results honestly as a success, not a failure", async () => {
    const { client, runId, cfg } = await started();
    const view = await advanceJobSearchRun(client, USER, runId, { config: cfg, provider: providerReturning([]), now });
    expect(view?.run.status).toBe("succeeded");
    expect(view?.run.summary).toMatch(/no matching postings/);
  });

  it("stops at a token limit instead of overspending, keeping partial results", async () => {
    const tight = config({ limits: { ...DEFAULT_LIMITS, maxRunTokens: 10_000 } });
    const { client, runId, cfg } = await started(6, tight);
    await advanceJobSearchRun(client, USER, runId, { config: cfg, provider: providerReturning([posting()]), fetcher: pageFetcher, now });
    const view = await advanceJobSearchRun(client, USER, runId, { config: cfg, provider: providerReturning([]), now });
    expect(view?.run.status).toBe("budget_limited");
    expect(view?.observations).toHaveLength(1);
    expect(view?.run.summary).toMatch(/token limit/);
  });

  it("flags postings that match an exclusion and does not fetch them", async () => {
    const fake = createFakeSupabase({
      watched_employers: employers(2),
      search_preference_items: [{ user_id: USER, kind: "exclusion_employer", value: "Employer 1", scope: "global", created_at: NOW, retired_at: null }],
    });
    const outcome = await startJobSearchRun(fake.client, USER, "key-exclusion", { config: config(), now });
    const fetcher = vi.fn(pageFetcher);
    const view = await advanceJobSearchRun(fake.client, USER, (outcome as { runId: string }).runId, {
      config: config(),
      provider: providerReturning([posting()]),
      fetcher,
      now,
    });
    expect(view?.observations[0].exclusion_hit).toMatch(/employer/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns nothing for another user's run", async () => {
    const { client, runId, cfg } = await started();
    expect(await advanceJobSearchRun(client, "someone-else", runId, { config: cfg, provider: providerReturning([]), now })).toBeNull();
    expect(await loadRunView(client, "someone-else", runId)).toBeNull();
  });
});

describe("worksite location", () => {
  const anchorRow = { user_id: USER, kind: "anchor", value: "White River Junction, VT", radius_miles: 25, scope: "global", created_at: NOW, retired_at: null };
  const everyTitle = async () => ({ status: 200, text: `Role A Role B Role C Role D ${"filler ".repeat(80)}` });

  async function withAnchor() {
    const fake = createFakeSupabase({ watched_employers: employers(2), search_preference_items: [anchorRow] });
    const outcome = await startJobSearchRun(fake.client, USER, "key-location", { config: config(), now, areaResolver: async () => fixtureArea });
    return { ...fake, runId: (outcome as { runId: string }).runId };
  }

  it("marks a far-away worksite 'outside' from a geocoded clean city/state, and keeps unresolvable ones unknown", async () => {
    const { client, runId } = await withAnchor();
    const geocoder = vi.fn(async (query: string) => (query.startsWith("Boston") ? { latitude: 42.36, longitude: -71.06 } : null));
    const view = await advanceJobSearchRun(client, USER, runId, {
      config: config(),
      provider: providerReturning([
        posting({ title: "Role A", source_url: "https://jobs.example.org/a", requisition_id: null, remote_status: "hybrid", worksite_city: "Boston", worksite_state: "MA", worksite_text: "Boston, MA" }),
        posting({ title: "Role B", source_url: "https://jobs.example.org/b", requisition_id: null, remote_status: "onsite", worksite_city: "Hanover", worksite_state: "NH", worksite_text: "Hanover, NH" }),
        posting({ title: "Role C", source_url: "https://jobs.example.org/c", requisition_id: null, remote_status: "onsite", worksite_city: "Nowhereville", worksite_state: "ZZ", worksite_text: "somewhere" }),
        posting({ title: "Role D", source_url: "https://jobs.example.org/d", requisition_id: null, remote_status: "remote" }),
      ]),
      fetcher: everyTitle,
      geocoder,
      geocodeSpacingMs: 0,
      now,
    });
    const byTitle = Object.fromEntries((view?.observations ?? []).map((row) => [row.title, row]));
    expect(byTitle["Role A"]).toMatchObject({ location_status: "outside", verification_state: "verified_open" });
    expect(byTitle["Role B"]).toMatchObject({ location_status: "within" }); // matched from the locality list, no lookup
    expect(byTitle["Role C"]).toMatchObject({ location_status: "unknown" }); // geocoder found nothing: stays unknown
    expect(byTitle["Role D"].location_status).toBeNull(); // remote: not judged by distance
    expect(geocoder.mock.calls.map((call) => call[0])).toEqual(["Boston, MA", "Nowhereville, ZZ"]);
    expect(countByState(view?.observations ?? []).outside).toBe(1);
  });

  it("puts outside-area postings in their own group, never under Verified open, and keeps remote ones local", () => {
    const base = {
      id: "o", run_id: "r", employer_text: "E", worksite_text: null, source_url: "https://x.org/p/1", requisition_id: null, posted_text: null,
      salary_text: null, matched_role_term: null, source_tier: "general" as const, verification_note: null, verification_checked_at: null,
      location_distance_miles: null, location_note: null, exclusion_hit: null, first_seen_at: NOW, verification_state: "verified_open",
    };
    const view: RunView = {
      run: { id: "r", status: "succeeded", model: "m", plan: [], trace: [], coverage: [], usage: {}, estimated_cost_usd: null, summary: "s", started_at: NOW } as never,
      observations: [
        { ...base, title: "Far", remote_status: "hybrid", location_status: "outside" },
        { ...base, title: "Near", remote_status: "onsite", location_status: "within" },
        { ...base, title: "Remote", remote_status: "remote", location_status: "outside" },
      ],
    };
    const html = renderJobSearchPanel(view, { runKey: "abc12345", due: computeDueState(null, 7, NOW), configured: true });
    const [beforeOutside, afterOutside] = html.split("Outside your places");
    expect(beforeOutside).toContain("Near");
    expect(beforeOutside).toContain("Remote");
    expect(beforeOutside).not.toContain(">Far<");
    expect(afterOutside).toContain("Far");
    expect(html).not.toContain("treat as a lead until verified"); // verified postings no longer carry the lead warning
  });
});

describe("pay on posting cards", () => {
  it("shows an hourly rate as a labeled annual estimate and compares it with the saved salary minimum", () => {
    const view: RunView = {
      run: {
        id: "r", status: "succeeded", model: "m", plan: [], trace: [], coverage: [], usage: {}, estimated_cost_usd: null, summary: "s", started_at: NOW,
        brief: { compensation: { floorUsd: 85_000 } },
      } as never,
      observations: [
        {
          id: "o", run_id: "r", title: "Executive Director", employer_text: "Bike Walk", worksite_text: null, source_url: "https://x.org/p/1",
          requisition_id: null, posted_text: null, salary_text: "USD $35 / hour", remote_status: "remote", matched_role_term: null,
          source_tier: "preferred_source", verification_state: "verified_open", verification_note: null, verification_checked_at: null,
          location_status: null, location_distance_miles: null, location_note: null, exclusion_hit: null, first_seen_at: NOW,
        },
      ],
    };
    const html = renderJobSearchPanel(view, { runKey: "abc12345", due: computeDueState(null, 7, NOW), configured: true });
    expect(html).toContain("$72,800");
    expect(html).toContain("(estimate)");
    expect(html).toContain("Below your $85,000 minimum");
  });
});

describe("summary, due state, and the panel", () => {
  it("computes due state from the last searching run", () => {
    expect(computeDueState(null, 7, NOW)).toEqual({ lastRunAt: null, dueAt: null, due: true });
    expect(computeDueState("2026-09-20T00:00:00.000Z", 7, NOW).due).toBe(false);
    expect(computeDueState("2026-09-10T00:00:00.000Z", 7, NOW).due).toBe(true);
  });

  it("counts states with exclusions separate and never counts unavailable as closed", () => {
    expect(
      countByState([
        { verification_state: "verified_open", exclusion_hit: null },
        { verification_state: "verification_unavailable", exclusion_hit: null },
        { verification_state: "no_longer_visible", exclusion_hit: null },
        { verification_state: "verified_open", exclusion_hit: "employer: X" },
      ]),
    ).toEqual({ verified: 1, unverified: 0, closedOrGone: 1, unavailable: 1, excluded: 1, outside: 0 });
    expect(
      buildSummary({ status: "succeeded", observationsCount: 0, counts: countByState([]), stepsPlanned: 2, stepsRun: 2, cost: { usd: null, basis: "unavailable" } }),
    ).toMatch(/pricing not configured/);
  });

  it("renders an in-progress run as a self-advancing panel with the shared loading animation", async () => {
    const fake = createFakeSupabase({ watched_employers: employers(2) });
    const outcome = await startJobSearchRun(fake.client, USER, "key-panel-running", { config: config(), now });
    const view = await loadRunView(fake.client, USER, (outcome as { runId: string }).runId);
    const html = renderJobSearchPanel(view, { runKey: "abc12345", due: computeDueState(null, 7, NOW), configured: true });
    expect(html).toContain('hx-post="/api/jobs/advance"');
    expect(html).toContain('hx-trigger="load"');
    expect(html).toContain("cip-thinking-panel");
    expect(html).toContain("Search in progress: step 1 of");
  });

  it("escapes posting text and refuses non-http links", () => {
    const view: RunView = {
      run: { id: "r", status: "succeeded", model: "m", plan: [], trace: [], coverage: [], usage: {}, estimated_cost_usd: null, summary: "<b>x</b>", started_at: NOW } as never,
      observations: [
        {
          id: "o",
          run_id: "r",
          title: "<script>alert(1)</script>",
          employer_text: 'Evil "Corp"',
          worksite_text: null,
          source_url: "javascript:alert(1)",
          requisition_id: null,
          posted_text: null,
          salary_text: null,
          remote_status: "not_stated",
          matched_role_term: null,
          source_tier: "general" as const,
          verification_state: "verified_open",
          verification_note: null,
          verification_checked_at: null,
          location_status: null,
          location_distance_miles: null,
          location_note: null,
          exclusion_hit: null,
          first_seen_at: NOW,
        },
      ],
    };
    const html = renderJobSearchPanel(view, { runKey: "abc12345", due: computeDueState(null, 7, NOW), configured: true });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain('href="javascript:');
    expect(escapeHtml("<&\"'>")).toBe("&lt;&amp;&quot;&#39;&gt;");
  });

  it("says plainly when the provider is not configured, without offering an enabled run button", () => {
    const html = renderJobSearchPanel(null, { runKey: "abc12345", due: computeDueState(null, 7, NOW), configured: false });
    expect(html).toContain("not set up on this server");
    expect(html).not.toContain("/api/jobs/run");
  });

  it("separates verified, unverified, closed, and excluded postings into distinct groups", () => {
    const base = {
      id: "o", run_id: "r", employer_text: "E", worksite_text: null, source_url: "https://x.org/p/1", requisition_id: null, posted_text: null,
      salary_text: null, remote_status: "not_stated", matched_role_term: null, source_tier: "target_page" as const, verification_note: null,
      verification_checked_at: null, location_status: null, location_distance_miles: null, location_note: null, exclusion_hit: null, first_seen_at: NOW,
    };
    const view: RunView = {
      run: { id: "r", status: "succeeded", model: "m", plan: [], trace: [], coverage: [], usage: {}, estimated_cost_usd: null, summary: "s", started_at: NOW } as never,
      observations: [
        { ...base, title: "A", verification_state: "verified_open" },
        { ...base, title: "B", verification_state: "discovered_unverified" },
        { ...base, title: "C", verification_state: "no_longer_visible" },
        { ...base, title: "D", verification_state: "verified_open", exclusion_hit: "employer: E" },
      ],
    };
    const html = renderJobSearchPanel(view, { runKey: "abc12345", due: computeDueState(null, 7, NOW), configured: true });
    for (const heading of ["Verified open", "Not verified yet", "Closed or gone", "Excluded by your rules"]) expect(html).toContain(heading);
  });
});

describe("cutover consumers", () => {
  const observation = (overrides: Record<string, unknown>) => ({
    id: crypto.randomUUID(), user_id: USER, run_id: "run-latest", title: "T", employer_text: "E", source_url: "https://x.org/p/1",
    remote_status: "onsite", verification_state: "verified_open", verification_checked_at: NOW, exclusion_hit: null,
    location_status: "within", first_seen_at: NOW, ...overrides,
  });

  it("summarizes only verified, non-excluded, in-area openings from the latest searching run", async () => {
    const { client, db } = createFakeSupabase();
    db.job_search_runs.push(
      { id: "run-old", user_id: USER, status: "succeeded", finished_at: "2026-09-01T00:00:00.000Z" },
      { id: "run-latest", user_id: USER, status: "partial", finished_at: "2026-09-20T00:00:00.000Z" },
      { id: "run-failed", user_id: USER, status: "failed", finished_at: "2026-09-22T00:00:00.000Z" },
    );
    db.job_search_observations.push(
      observation({ title: "Local verified" }),
      observation({ title: "Remote verified", remote_status: "remote", location_status: null }),
      observation({ title: "Far away", location_status: "outside" }),
      observation({ title: "Excluded", exclusion_hit: "employer: X" }),
      observation({ title: "Unverified", verification_state: "discovered_unverified" }),
      observation({ title: "Old run", run_id: "run-old" }),
    );
    const result = await loadLatestVerifiedPostings(client, USER, 10);
    expect(result.runId).toBe("run-latest");
    expect(result.count).toBe(2);
    expect(result.postings.map((posting) => posting.title).sort()).toEqual(["Local verified", "Remote verified"]);
    expect(await loadLatestVerifiedPostings(client, "someone-else")).toMatchObject({ runId: null, count: 0, postings: [] });
  });

  it("renders a read-only Briefing summary that links to Opportunities and never offers to run or advance", async () => {
    const fake = createFakeSupabase({ watched_employers: employers(2) });
    const outcome = await startJobSearchRun(fake.client, USER, "key-summary", { config: config(), now });
    const running = await loadRunView(fake.client, USER, (outcome as { runId: string }).runId);
    const due = computeDueState(null, 7, NOW);
    for (const html of [
      renderJobSearchSummary(running, { runKey: "abc12345", due, configured: true }),
      renderJobSearchSummary(null, { runKey: "abc12345", due, configured: true }),
      renderJobSearchSummary(null, { runKey: "abc12345", due, configured: false }),
    ]) {
      expect(html).not.toContain("hx-post");
      expect(html).not.toContain("/api/jobs/");
    }
    expect(renderJobSearchSummary(running, { runKey: "abc12345", due, configured: true })).toContain('href="/opportunities"');
    expect(renderJobSearchSummary(running, { runKey: "abc12345", due, configured: true })).toContain("in progress");
  });
});
