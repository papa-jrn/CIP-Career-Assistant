import { describe, expect, it } from "vitest";
import { compareToFloor, describePay, estimateAnnualPay, FULL_TIME_HOURS_PER_YEAR } from "@/lib/cip/pay";

describe("estimateAnnualPay", () => {
  it("converts a stated hourly rate to an annual estimate assuming full time (40 x 52)", () => {
    expect(FULL_TIME_HOURS_PER_YEAR).toBe(2080);
    const pay = estimateAnnualPay("USD $35 / hour");
    expect(pay).toMatchObject({ basis: "hourly_estimated", minAnnualUsd: 72_800, maxAnnualUsd: 72_800 });
    expect(pay.note).toMatch(/full time/);
  });

  it("converts an hourly range and accepts other hourly spellings", () => {
    expect(estimateAnnualPay("$28 - $35/hr")).toMatchObject({ minAnnualUsd: 58_240, maxAnnualUsd: 72_800 });
    expect(estimateAnnualPay("$42.50 per hour")).toMatchObject({ minAnnualUsd: 88_400 });
  });

  it("honors stated weekly hours, and leaves part-time with no hours unknown", () => {
    expect(estimateAnnualPay("$30/hour, 20 hours per week")).toMatchObject({ basis: "hourly_estimated", minAnnualUsd: 31_200 });
    expect(estimateAnnualPay("$30/hour part-time").basis).toBe("unknown");
  });

  it("reads real annual pay text seen in postings", () => {
    expect(estimateAnnualPay("$149,900 - $187,400")).toMatchObject({ basis: "annual", minAnnualUsd: 149_900, maxAnnualUsd: 187_400 });
    expect(estimateAnnualPay("USD $110,000 - $125,000 / year")).toMatchObject({ minAnnualUsd: 110_000, maxAnnualUsd: 125_000 });
    expect(estimateAnnualPay("$128,000 - $177,000")).toMatchObject({ minAnnualUsd: 128_000, maxAnnualUsd: 177_000 });
    expect(estimateAnnualPay("$60k-$70k")).toMatchObject({ minAnnualUsd: 60_000, maxAnnualUsd: 70_000 });
  });

  it("keeps a lone minimum as a low end only, without inventing a maximum", () => {
    const pay = estimateAnnualPay("Hiring Range Minimum $129,500; Hiring Range Maximum Commensurate with Experience and Industry Standard");
    expect(pay).toMatchObject({ basis: "annual", minAnnualUsd: 129_500, maxAnnualUsd: null });
    expect(estimateAnnualPay("up to $90,000")).toMatchObject({ minAnnualUsd: null, maxAnnualUsd: 90_000 });
  });

  it("leaves vague, missing, monthly, and unreadable pay unknown", () => {
    for (const text of ["Please Inquire.", "Commensurate with experience", "", null, undefined, "$5,000 per month", "$45"]) {
      expect(estimateAnnualPay(text as string).basis).toBe("unknown");
    }
  });
});

describe("compareToFloor", () => {
  const floor = 85_000;

  it("classifies below, meets, straddles, and unknown without guessing a missing bound", () => {
    expect(compareToFloor(estimateAnnualPay("$35/hour"), floor).status).toBe("below"); // $72,800
    expect(compareToFloor(estimateAnnualPay("$110,000 - $125,000 / year"), floor).status).toBe("meets");
    expect(compareToFloor(estimateAnnualPay("$70,000 - $95,000"), floor).status).toBe("straddles");
    expect(compareToFloor(estimateAnnualPay("Minimum $129,500"), floor).status).toBe("meets");
    expect(compareToFloor(estimateAnnualPay("Minimum $60,000"), floor).status).toBe("unknown"); // top of range not stated
    expect(compareToFloor(estimateAnnualPay("Please Inquire"), floor).status).toBe("unknown");
  });

  it("is unknown when the user has set no minimum", () => {
    expect(compareToFloor(estimateAnnualPay("$110,000"), null).status).toBe("unknown");
  });
});

describe("describePay", () => {
  it("labels hourly conversions as estimates and states the comparison", () => {
    const text = describePay("USD $35 / hour", 85_000);
    expect(text).toContain("$72,800");
    expect(text).toContain("(estimate)");
    expect(text).toContain("Below your $85,000 minimum");
  });

  it("is empty when there is nothing to say", () => {
    expect(describePay("Please Inquire", 85_000)).toBe("");
    expect(describePay(null, 85_000)).toBe("");
  });
});
