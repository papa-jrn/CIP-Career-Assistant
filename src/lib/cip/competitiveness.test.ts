import { describe, it, expect } from "vitest";
import { competitiveScore, DIMENSIONS, resumeReadiness, type CompetitiveDimension } from "./competitiveness";
const dimensions = (): CompetitiveDimension[] => DIMENSIONS.map(dimension => ({ dimension, rating: "direct", evidenceStrength: "concrete", explanation: "Actual work and outcomes at the required scope.", postingQuote: "Lead work", evidenceRefs: ["resume"] }));
const requirements = () => Array.from({ length: 4 }, () => ({ importance: "required", status: "supported" }));
describe("credible competitiveness", () => {
  it("does not inflate broad leadership claims or title matches into high scores", () => {
    const broad = dimensions().map(item => ({ ...item, evidenceStrength: "general" as const }));
    expect(competitiveScore(broad, requirements(), false).score).toBeLessThanOrEqual(5);
    expect(competitiveScore([], requirements(), false).score).toBeNull();
  });
  it("caps adjacent experience and unknown organizational scale", () => {
    const adjacent = dimensions(); adjacent[1].rating = "transferable";
    expect(competitiveScore(adjacent, requirements(), false).score).toBeLessThanOrEqual(8);
    adjacent[1].rating = "unknown";
    expect(competitiveScore(adjacent, requirements(), false).score).toBeLessThanOrEqual(6);
  });
  it("distinguishes a confirmed clinical license barrier from missing qualification evidence", () => {
    expect(competitiveScore(dimensions(), [{ requirement: "Registered nursing license", qualificationKind: "credential_or_eligibility", importance: "required", status: "gap" }], false).score).toBe(2);
    expect(competitiveScore(dimensions(), [{ requirement: "Registered nursing license", qualificationKind: "credential_or_eligibility", importance: "required", status: "unknown" }], false).score).toBeLessThanOrEqual(5);
  });
  it("reserves exceptional scores for complete direct concrete evidence without mixing in preferences", () => {
    expect(competitiveScore(dimensions(), requirements(), false).score).toBe(10);
    expect(competitiveScore(dimensions(), requirements(), true).score).toBe(10);
    const outcomes = dimensions(); outcomes[3].rating = "unknown";
    expect(competitiveScore(outcomes, requirements(), false).score).toBe(8);
  });
  it("keeps preferred qualifications separate from mandatory barriers", () => {
    expect(competitiveScore(dimensions(), [...requirements(), { importance: "preferred", status: "unknown" }], false).score).toBe(8);
  });
});
describe("resume screening readiness", () => {
  it("does not count context-only accomplishments as visible on the resume", () => {
    const req = [{ requirement: "Budget ownership", importance: "required", status: "supported", evidence: [{ refId: "conversation" }] }];
    expect(resumeReadiness(req, new Set(["resume"])).status).toBe("needs_tailoring");
    expect(resumeReadiness(req, new Set()).status).toBe("unavailable");
    req[0].status = "unknown";
    expect(resumeReadiness(req, new Set(["resume"])).status).toBe("needs_evidence");
  });
});

it("leaves wholly unknown competitiveness unscored", () => { expect(competitiveScore(dimensions().map(item => ({ ...item, rating: "unknown", evidenceStrength: "none" })), requirements(), false).score).toBeNull(); });

it("recognizes a strong practitioner match despite missing preferred GEO/scale evidence and low pay", () => {
  const seo = dimensions(); seo[2].rating = "transferable"; seo[3].rating = "unknown"; seo[3].evidenceStrength = "none";
  const qualifications = [...requirements(), { importance: "required", status: "unknown", qualificationKind: "skill_or_duty", requirement: "Specific analytics tool" }, { importance: "preferred", status: "unknown", requirement: "GEO and 20,000-page multisite" }];
  const score = competitiveScore(seo, qualifications, true).score;
  expect(score).toBeGreaterThanOrEqual(7);
  expect(score).toBeLessThanOrEqual(8);
  expect(competitiveScore(seo, qualifications, false).score).toBe(score);
});
it("does not score wholly unknown core work as a poor candidate", () => {
  const value = dimensions(); value[0].rating = "unknown"; value[0].evidenceStrength = "none";
  expect(competitiveScore(value, requirements(), false).score).toBeNull();
});
