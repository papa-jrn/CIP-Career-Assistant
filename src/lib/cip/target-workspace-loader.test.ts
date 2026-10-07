import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "@/lib/cip/__fixtures__/fake-supabase";
import { loadTargetWorkspace } from "@/lib/cip/target-workspace-loader";

// Invented organizations and people; an in-memory Supabase stand-in (no network, no database).

const USER = "user-1";
const NOW = "2026-10-07T12:00:00.000Z";

const watched = (name: string, over: Record<string, unknown> = {}) => ({
  id: `id-${name}`, user_id: USER, name, region: "Upper Valley", category: "community organizations", location: "Lebanon, NH", priority: "medium",
  fit_score: 70, fit_summary: "", target_roles: [], source_url: null, careers_url: "https://careers.example.org", adapter_status: "manual_review",
  estimated_size: null, source_notes: [], created_at: "2026-06-01T00:00:00.000Z", ...over,
});

const observation = (over: Record<string, unknown> = {}) => ({
  id: "o1", user_id: USER, run_id: "run-1", title: "Program Operations Lead", employer_text: "Granite Community Trust", worksite_text: "Lebanon, NH",
  source_url: "https://jobs.example.org/p/1", requisition_id: "R-1", posted_text: null, salary_text: "$95,000", remote_status: "not_stated",
  matched_role_term: "program operations", source_tier: "target_page", verification_state: "verified_open", verification_note: null,
  verification_checked_at: NOW, location_status: "within", location_distance_miles: 3, location_note: null, exclusion_hit: null,
  first_seen_at: "2026-10-07T09:30:00.000Z", carried_forward: false, ...over,
});

const run = (over: Record<string, unknown> = {}) => ({
  id: "run-1", user_id: USER, status: "succeeded", started_at: "2026-10-07T09:00:00.000Z", finished_at: "2026-10-07T09:20:00.000Z",
  brief: { compensation: { floorUsd: 85_000 } }, outbound_facets: {}, plan: [], next_step: 1, limits: {}, trace: [], coverage: [], usage: {},
  estimated_cost_usd: null, cost_basis: "unavailable", summary: "", error: null, model: "m", ...over,
});

const advisor = {
  user_id: USER, source_type: "evidence_analysis", created_at: "2026-10-01T00:00:00.000Z",
  extracted_text: JSON.stringify({ advisor: { roleBriefs: [{ role: "Executive Director / Nonprofit Media Leader", whyItFits: "Ran a media nonprofit.", evidenceNeeded: "Metrics." }] } }),
};

const network = {
  user_id: USER, source_type: "network_analysis", created_at: "2026-10-02T00:00:00.000Z",
  extracted_text: JSON.stringify({ analysis: { contactMatches: [{ contact: { name: "Sarah Lin", company: "Granite Community Trust" }, recommendedFirstAsk: "Ask how the team is structured." }] } }),
};

describe("loadTargetWorkspace", () => {
  it("assembles a dossier per watched employer from the saved records, scoped to the user", async () => {
    const { client } = createFakeSupabase({
      watched_employers: [watched("Granite Community Trust"), watched("Summit Machining", { category: "advanced manufacturing" }), { ...watched("Someone Else's Org"), user_id: "other-user" }],
      career_sources: [advisor, network],
      job_search_runs: [run()],
      job_search_observations: [observation(), observation({ id: "o2", user_id: "other-user", title: "Not Mine" })],
      employer_990_profiles: [{ user_id: USER, employer_key: "granite community trust", employer_name: "Granite Community Trust", ein: 1, organization_name: "Granite Community Trust", ntee_code: "", latest_revenue_usd: 820000, latest_expenses_usd: 790000, latest_assets_usd: 1600000, latest_filing_year: 2024, filing_count: 3, trend: "shrinking", revenue_series: [{ year: 2024, revenue: 820000 }, { year: 2023, revenue: 1000000 }, { year: 2022, revenue: 1150000 }], pdf_url: "", source_url: "", status: "ok", status_note: "", updated_at: NOW }],
    });

    const ws = await loadTargetWorkspace(client, USER, NOW);
    expect(ws.dossiers.map((d) => d.name).sort()).toEqual(["Granite Community Trust", "Summit Machining"]);
    expect(ws.employers).toHaveLength(2);

    const granite = ws.dossiers.find((d) => d.name === "Granite Community Trust")!;
    expect(granite.warmPaths).toEqual([{ name: "Sarah Lin", basis: "A saved contact in your network works at this employer", firstAsk: "Ask how the team is structured." }]);
    expect(granite.openings.verified.map((p) => p.title)).toEqual(["Program Operations Lead"]);
    expect(granite.openings.verified[0].isNew).toBe(true);
    expect(granite.funding).toMatchObject({ state: "ok", trend: "shrinking" });
    expect(granite.lanes.map((l) => l.label)).toContain("Primary lane");
    expect(granite.status).toBe("talk_first");
    expect(granite.action).toMatchObject({ kind: "reach_out", person: "Sarah Lin" });

    const summit = ws.dossiers.find((d) => d.name === "Summit Machining")!;
    expect(summit.warmPaths).toEqual([]);
    expect(summit.openings.verified).toEqual([]);
    expect(summit.funding.state).toBe("not_applicable"); // a manufacturer: filings do not apply
    expect(ws.run).toMatchObject({ status: "succeeded" });
  });

  it("uses the latest run that actually searched, ignoring a newer failed or running one", async () => {
    const { client } = createFakeSupabase({
      watched_employers: [watched("Granite Community Trust")],
      job_search_runs: [run(), run({ id: "run-2", status: "failed", started_at: "2026-10-07T11:00:00.000Z" }), run({ id: "run-3", status: "running", started_at: "2026-10-07T11:30:00.000Z" })],
      job_search_observations: [observation()],
    });
    const ws = await loadTargetWorkspace(client, USER, NOW);
    expect(ws.run?.startedAt).toBe("2026-10-07T09:00:00.000Z");
    expect(ws.dossiers[0].openings.verified).toHaveLength(1);
  });

  it("degrades to unknown, never an error, with no search yet, no strategy, and no financial profiles", async () => {
    const { client } = createFakeSupabase({ watched_employers: [watched("Granite Community Trust")] });
    const ws = await loadTargetWorkspace(client, USER, NOW);
    expect(ws.run).toBeNull();
    const d = ws.dossiers[0];
    expect(d.openings.verified).toEqual([]);
    expect(d.warmPaths).toEqual([]);
    expect(d.funding.state).toBe("not_looked_up");
    expect(d.action.kind).toBe("keep_watching"); // no lanes known, no person, no posting: nothing to claim
  });

  it("returns an empty workspace for a user with no watched employers", async () => {
    const { client } = createFakeSupabase();
    const ws = await loadTargetWorkspace(client, USER, NOW);
    expect(ws.dossiers).toEqual([]);
    expect(ws.employers).toEqual([]);
  });
});
