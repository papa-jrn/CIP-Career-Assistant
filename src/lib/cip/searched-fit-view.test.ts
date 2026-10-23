import { expect, it, vi } from "vitest";
import { renderJobSearchPanel } from "./job-search-view";
import { indexDispositions } from "./posting-dispositions";
import type { RunView } from "./job-search-run";
import type { FitAssessment } from "./imported-job-fit";
vi.stubEnv("OPENAI_API_KEY", "");
const observations = ["low", "unscored"].map(id => ({ id, source_url: "https://example.org/" + id, title: id === "low" ? "Lower fit role" : "Unreadable role", employer_text: "Example", verification_state: "verified_open", source_tier: "general", requisition_id: null, exclusion_hit: false, salary_text: null }));
const view = { run: { id: "r", status: "succeeded", plan: [], trace: [], coverage: [], usage: {}, summary: "Saved search", started_at: "2026-10-23", brief: {} }, observations } as unknown as RunView;
function fit(score: number | null): FitAssessment { return { importId: "one", assessedAt: "2026-10-23", basis: "ai_assisted", recommendation: "talk_first", confidence: "low", nextAction: "Confirm the evidence", findings: [], analysis: { version: 1, rubricVersion: 3, score, summary: "Evidence comparison", scoreReason: "Evidence limits", lanes: [], requirements: [], contextRefs: [], limitations: [] } }; }
it("collapses below-six jobs without archiving and keeps unscored jobs in active results", () => {
  const annotations = { fits: new Map([[observations[0].source_url, fit(5)], [observations[1].source_url, fit(null)]]), recommendations: new Map(), dispositions: indexDispositions([]), resolution: { watchedNames: [], byUrl: new Map() } };
  const result = renderJobSearchPanel(view, { runKey: "one", configured: true, due: { due: true, dueAt: null, lastRunAt: null } }, annotations);
  const lower = result.indexOf("Lower-fit opportunities (1)");
  expect(lower).toBeGreaterThan(0);
  expect(result.slice(0, lower)).toContain("Unreadable role");
  expect(result.slice(0, lower)).not.toContain("Lower fit role");
  expect(result.slice(lower)).toContain("Lower fit role");
  expect(result.slice(lower)).toContain("Assess fit again");
  expect(result).not.toContain("Archived searched jobs");
  expect(result).toContain('name="observationId"');
});
