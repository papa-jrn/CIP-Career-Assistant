import { expect, it } from "vitest";
import { renderFitAssessment } from "./fit-assessment-view";
import type { FitAssessment } from "./imported-job-fit";
it("does not present an earlier generous score as current competitiveness", () => {
  const fit = { analysis: { version: 1, score: 10 } } as FitAssessment;
  expect(renderFitAssessment(fit)).toContain("Earlier fit assessment");
  expect(renderFitAssessment(fit)).not.toContain("10/10");
});
