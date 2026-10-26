import { expect, it } from "vitest";
import { renderCompletedFit, renderFitProgress } from "./fit-action-view";
import type { FitAssessment } from "./imported-job-fit";
function fit(score: number | null): FitAssessment { return { importId: "one", assessedAt: "2026-10-23", basis: score == null ? "deterministic" : "ai_assisted", recommendation: "talk_first", confidence: "low", nextAction: "Review scope and evidence", findings: [], analysis: { version: 1, rubricVersion: 3, score, scoreReason: "Evidence limits", summary: "Comparison with your experience", requirements: [], lanes: [], contextRefs: [], limitations: [] } }; }
it("uses the familiar thinking animation and explains where the result will appear", () => {
  const html = renderFitProgress("progress-one");
  expect(html).toContain("cip-thinking-orbit");
  expect(html).toContain("cip-thinking-bar");
  expect(html).toContain('aria-live="polite"');
  expect(html).toContain("job will stay in place");
});
it("explains lower-fit grouping while keeping a readable completed assessment", () => {
  const html = renderCompletedFit(fit(3));
  expect(html).toContain("Your fit assessment is ready");
  expect(html).toContain("Competitive fit: 3/10");
  expect(html).toContain("On your next visit");
  expect(html).toContain("It has not been archived");
  expect(html).toContain("Comparison with your experience");
});
it("distinguishes a failed assessment from a low score", () => {
  const html = renderCompletedFit(fit(null));
  expect(html).toContain("Assessment needs attention");
  expect(html).toContain("remains unscored");
  expect(html).not.toContain("On your next visit");
});

it("flags a legacy cut-off summary without inventing its ending or changing the saved score", () => {
  const assessment = fit(8);
  assessment.analysis!.summary = "x".repeat(600);
  const html = renderCompletedFit(assessment);
  expect(html).toContain("This saved summary appears cut off");
  expect(html).toContain("Assess fit again");
  expect(html).toContain("Competitive fit: 8/10");
  expect(assessment.analysis!.summary).toBe("x".repeat(600));
  assessment.analysis!.summary = "x".repeat(599) + ".";
  expect(renderCompletedFit(assessment)).not.toContain("This saved summary appears cut off");
});
