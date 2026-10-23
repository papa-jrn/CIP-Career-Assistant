import { describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "./__fixtures__/fake-supabase";
import { loadArchiveContext, setImportedArchive } from "./job-archive";
import { buildImportedJob, importedJobInput } from "./imported-jobs";
import { renderJobSearchPanel } from "./job-search-view";
import { indexDispositions } from "./posting-dispositions";
import type { RunView } from "./job-search-run";
const job = buildImportedJob(importedJobInput.parse({ title: "Director", employer: "Example", sourceUrl: "https://example.org/job" }), { importId: "one", capturedAt: "2026-10-01" });
vi.stubEnv("OPENAI_API_KEY", "");
describe("job archive persistence and searched lists", () => {
  it("reuses posting decisions for URL imports, scopes users, and restores", async () => {
    const { client, db } = createFakeSupabase();
    await setImportedArchive(client, "one", job, true);
    expect(db.posting_dispositions[0]).toMatchObject({ user_id: "one", status: "passed" });
    expect((await loadArchiveContext(client, "another")).dispositions.byUrl.size).toBe(0);
    await setImportedArchive(client, "one", job, false);
    expect(db.posting_dispositions).toHaveLength(1);
    expect(db.posting_dispositions[0].status).toBe("watching");
  });
  it("appends archive/restore events for pasted-only jobs", async () => {
    const { client, db } = createFakeSupabase();
    await setImportedArchive(client, "one", { ...job, sourceUrl: "", sourceLinks: [] }, true);
    await setImportedArchive(client, "one", { ...job, sourceUrl: "", sourceLinks: [] }, false);
    expect(db.career_sources).toHaveLength(2);
    const loaded = await loadArchiveContext(client, "one");
    expect(loaded.events.map(event => event.archived).sort()).toEqual([false, true]);
    expect((await loadArchiveContext(client, "another")).events).toEqual([]);
  });
  it("moves existing passed jobs out of active groups, keeps AI skips active, and offers restore", () => {
    const observations = ["passed", "active"].map(name => ({ source_url: `https://example.org/${name}`, title: name === "passed" ? "Archived physician role" : "Active director role", employer_text: "Example", verification_state: "verified_open", source_tier: "general", requisition_id: null, exclusion_hit: false, salary_text: null }));
    const view = { run: { id: "r", status: "succeeded", model: "m", plan: [], trace: [], coverage: [], usage: {}, estimated_cost_usd: null, summary: "Historical result", started_at: "2026-10-01", brief: {} }, observations } as unknown as RunView;
    const annotations = { recommendations: new Map(observations.map(row => [row.source_url, { category: "skip" as const, confidence: "medium" as const, rationale: "App suggestion", namedContact: null, signals: [] }])), dispositions: indexDispositions([{ normalized_url: "https://example.org/passed", source_url: "https://example.org/passed", employer_key: "example", requisition_id: null, status: "passed", note: "", updated_at: "2026-10-23" }]), resolution: { watchedNames: [], byUrl: new Map() } };
    const result = renderJobSearchPanel(view, { runKey: "test", due: { lastRunAt: null, dueAt: null, due: true }, configured: true }, annotations);
    const active = result.slice(0, result.indexOf('id="archived-search-jobs"'));
    expect(active).not.toContain("Archived physician role");
    expect(active).toContain("Active director role");
    expect(active).toContain("Not for me — archive");
    expect(result).toContain("Archived searched jobs (1)");
    expect(result).toContain("Restore job");
  });
});
