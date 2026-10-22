import { describe, expect, it } from "vitest";
import type { AdvisorEvidenceResponse } from "./advisor";
import {
  calculateEvidenceSufficiency,
  isEvidenceComplete,
  isEvidenceSaturated,
} from "./evidence-sufficiency";

/**
 * The maths that decides whether the engine keeps asking for proof.
 *
 * This is the function at the centre of the Autumn 2026 loop failure: when
 * readiness was driven by how many analysis rounds had run, the engine shut
 * itself down after about four passes and new conversations produced no new
 * output. The rules below are volume-based on purpose, and the regression test
 * for that failure is the most important thing in this file.
 */

function answer(over: Partial<AdvisorEvidenceResponse> = {}): AdvisorEvidenceResponse {
  return {
    question: "What outcome did that programme produce?",
    answer: "We cut intake backlog from six weeks to nine days across two sites over one year.",
    confidence: "confident",
    ...over,
  };
}

/** n distinct useful answers, each long enough and each saying something different. */
function answers(n: number, over: Partial<AdvisorEvidenceResponse> = {}) {
  return Array.from({ length: n }, (_, i) =>
    answer({ answer: `Distinct result number ${i}: we changed a measurable thing and recorded how far it moved.`, ...over }),
  );
}

const TEN_YEARS = { resume_text: "Charge nurse with 10 years of professional experience across two hospitals." };

describe("career length", () => {
  it("reads an explicit number of years from the user's own words", () => {
    expect(calculateEvidenceSufficiency(TEN_YEARS).rawCareerYears).toBe(10);
    expect(calculateEvidenceSufficiency({ resume_text: "Career of 7 years in logistics." }).rawCareerYears).toBe(7);
  });

  it("falls back to the earliest year mentioned", () => {
    const thisYear = new Date().getFullYear();
    const score = calculateEvidenceSufficiency({ resume_text: `Started at the mill in 2008. Moved to dispatch in 2015.` });
    expect(score.rawCareerYears).toBe(thisYear - 2008);
  });

  it("assumes ten years when nothing says otherwise, rather than zero", () => {
    // Zero would divide the score into nonsense; ten is a stated assumption.
    expect(calculateEvidenceSufficiency({ resume_text: "Operations and scheduling." }).rawCareerYears).toBe(10);
  });

  it("clamps the divisor so neither a brand-new nor a forty-year career breaks the score", () => {
    expect(calculateEvidenceSufficiency({ resume_text: "2 years of professional experience." }).scoreYears).toBe(5);
    expect(calculateEvidenceSufficiency({ resume_text: "40 years of professional experience." }).scoreYears).toBe(20);
  });
});

describe("what counts as useful evidence", () => {
  it("ignores an answer too short to contain anything", () => {
    expect(calculateEvidenceSufficiency(TEN_YEARS, [answer({ question: "Why?", answer: "Yes." })]).usefulEvidenceCount).toBe(0);
  });

  it("ignores a short unsure answer with no proof, and keeps one that has proof", () => {
    const unsureShort = answer({ confidence: "not_sure", answer: "I think we improved it a bit, maybe." });
    expect(calculateEvidenceSufficiency(TEN_YEARS, [unsureShort]).usefulEvidenceCount).toBe(0);

    const unsureWithProof = answer({ confidence: "not_sure", proofUrl: "https://example.org/report" });
    expect(calculateEvidenceSufficiency(TEN_YEARS, [unsureWithProof]).usefulEvidenceCount).toBeGreaterThan(0);
  });

  it("does not count the same answer twice", () => {
    const once = calculateEvidenceSufficiency(TEN_YEARS, [answer()]).usefulEvidenceCount;
    const twice = calculateEvidenceSufficiency(TEN_YEARS, [answer(), answer()]).usefulEvidenceCount;
    expect(twice).toBe(once);
  });

  it("counts a genuinely different answer separately", () => {
    const two = calculateEvidenceSufficiency(TEN_YEARS, answers(2)).usefulEvidenceCount;
    expect(two).toBeGreaterThan(calculateEvidenceSufficiency(TEN_YEARS, answers(1)).usefulEvidenceCount);
  });

  it("does not let the same link be submitted repeatedly to inflate the score", () => {
    const linked = answer({ proofUrl: "https://example.org/report", answer: "The published report covers the whole programme and its results." });
    const repeated = calculateEvidenceSufficiency(TEN_YEARS, [linked, linked, linked]).usefulEvidenceCount;
    expect(repeated).toBe(calculateEvidenceSufficiency(TEN_YEARS, [linked]).usefulEvidenceCount);
  });

  it("weights unverified and weak evidence below confirmed evidence", () => {
    const strong = calculateEvidenceSufficiency(TEN_YEARS, [answer()]).usefulEvidenceCount;
    const weak = calculateEvidenceSufficiency(TEN_YEARS, [answer({ sourceNote: "Evidence strength: weak" })]).usefulEvidenceCount;
    const unverified = calculateEvidenceSufficiency(TEN_YEARS, [answer({ sourceNote: "Evidence strength: unverified" })]).usefulEvidenceCount;
    expect(weak).toBeLessThan(strong);
    expect(unverified).toBeLessThan(weak);
  });
});

describe("phases", () => {
  it("starts in building with nothing saved", () => {
    const score = calculateEvidenceSufficiency(TEN_YEARS, []);
    expect(score.phase).toBe("building");
    expect(score.score).toBe(0);
  });

  it("moves through strengthening and enhancement as real evidence accumulates", () => {
    expect(calculateEvidenceSufficiency(TEN_YEARS, answers(8)).phase).toBe("strengthening");
    expect(calculateEvidenceSufficiency(TEN_YEARS, answers(10)).phase).toBe("enhancement");
  });

  it("reaches complete on volume of evidence", () => {
    const score = calculateEvidenceSufficiency(TEN_YEARS, answers(25));
    expect(score.phase).toBe("complete");
    expect(isEvidenceComplete(score)).toBe(true);
  });

  it("treats enhancement and complete as saturated, building and strengthening as not", () => {
    expect(isEvidenceSaturated(calculateEvidenceSufficiency(TEN_YEARS, answers(25)))).toBe(true);
    expect(isEvidenceSaturated(calculateEvidenceSufficiency(TEN_YEARS, answers(10)))).toBe(true);
    expect(isEvidenceSaturated(calculateEvidenceSufficiency(TEN_YEARS, answers(8)))).toBe(false);
    expect(isEvidenceSaturated(calculateEvidenceSufficiency(TEN_YEARS, []))).toBe(false);
  });

  it("says plainly that saturation is readiness, not a stop sign", () => {
    // The wording is load-bearing: the old engine treated saturation as a
    // reason to stop engaging with new input.
    expect(calculateEvidenceSufficiency(TEN_YEARS, answers(25)).reason).toMatch(/not a stop sign|re-?open/i);
  });
});

describe("the Autumn 2026 loop failure must not come back", () => {
  it("does not let analysis rounds move the phase", () => {
    // The original failure: readiness driven by how many passes had run, so
    // the engine shut down after about four rounds and new conversations
    // produced no new output. Rounds must not change readiness at all.
    const evidence = answers(3);
    const firstPass = calculateEvidenceSufficiency(TEN_YEARS, evidence, { evidenceRound: 0 });
    const manyPasses = calculateEvidenceSufficiency(TEN_YEARS, evidence, { evidenceRound: 12 });
    expect(manyPasses.phase).toBe(firstPass.phase);
    expect(manyPasses.score).toBe(firstPass.score);
  });

  it("does not let a high round count declare a thin profile complete", () => {
    const thin = calculateEvidenceSufficiency({ resume_text: "Dispatcher." }, answers(1), { evidenceRound: 50 });
    expect(thin.phase).toBe("building");
    expect(isEvidenceComplete(thin)).toBe(false);
  });

  it("still reports building for an empty profile however many passes have run", () => {
    expect(calculateEvidenceSufficiency({}, [], { evidenceRound: 99, sourceEvidenceCount: 99 }).phase).toBe("building");
  });
});

describe("robustness against the shapes real data arrives in", () => {
  it("handles an empty intake without throwing", () => {
    expect(() => calculateEvidenceSufficiency({})).not.toThrow();
    expect(calculateEvidenceSufficiency({}).phase).toBe("building");
  });

  it("handles answers with missing optional fields", () => {
    const sparse = { question: "What happened?", answer: "A long enough answer about a real measurable change we made.", confidence: "" } as AdvisorEvidenceResponse;
    expect(() => calculateEvidenceSufficiency(TEN_YEARS, [sparse])).not.toThrow();
  });

  it("never produces a negative or non-finite score", () => {
    for (const intake of [{}, { resume_text: "" }, { resume_text: "1999 2000 2001" }]) {
      const score = calculateEvidenceSufficiency(intake, answers(3));
      expect(Number.isFinite(score.score)).toBe(true);
      expect(score.score).toBeGreaterThanOrEqual(0);
    }
  });
});
