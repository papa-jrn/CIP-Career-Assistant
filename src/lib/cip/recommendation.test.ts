import { describe, expect, it } from "vitest";
import type { ObservationRow } from "@/lib/cip/job-search-run";
import { recommendPosting, type RecommendationContext, type ResolvedEmployer } from "@/lib/cip/recommendation";

const NOW = "2026-09-23T12:00:00.000Z";

const drow = (over: Partial<ObservationRow> = {}): ObservationRow => ({
  id: "x", run_id: "r", title: "Program Operations Lead", employer_text: "Acme Co", worksite_text: "Lebanon, NH",
  source_url: "https://x.org/p/1", requisition_id: "R-1", posted_text: null, salary_text: null, remote_status: "not_stated",
  matched_role_term: "program operations", source_tier: "general", verification_state: "verified_open",
  verification_note: null, verification_checked_at: null, location_status: "within", location_distance_miles: null,
  location_note: null, exclusion_hit: null, first_seen_at: NOW, carried_forward: false, ...over,
});

const ctx = (over: Partial<RecommendationContext> = {}): RecommendationContext => ({
  floorUsd: 85_000, laneLabel: "Primary lane", employer: null, networkLink: null, followUp: null, ...over,
});

const employer = (over: Partial<ResolvedEmployer> = {}): ResolvedEmployer => ({
  category: "advanced manufacturing", priority: "medium", fitScore: 70, nextMove: null, nextMoveIsRelational: false, ...over,
});

describe("recommendPosting", () => {
  it("talks first when someone in the network is connected to the employer, naming the person", () => {
    const rec = recommendPosting(drow(), ctx({ networkLink: { contactName: "Sarah Lin", firstAsk: "Ask how her team is structured." } }));
    expect(rec.category).toBe("talk_first");
    expect(rec.namedContact).toBe("Sarah Lin");
    expect(rec.confidence).toBe("high"); // verified
    expect(rec.rationale).toMatch(/Reach out to Sarah Lin/);
    expect(rec.rationale).toMatch(/Ask how her team is structured/);
  });

  it("talks first on an open follow-up obligation tied to the employer", () => {
    const rec = recommendPosting(drow(), ctx({ followUp: { contactName: "Dana Reyes", nextAction: "Send the intro note" } }));
    expect(rec).toMatchObject({ category: "talk_first", namedContact: "Dana Reyes" });
    expect(rec.rationale).toMatch(/open follow-up with Dana Reyes/);
  });

  it("talks first for a senior role at a high-priority target whose next move is relationship-oriented", () => {
    const rec = recommendPosting(
      drow({ title: "Director of Operations" }),
      ctx({ employer: employer({ priority: "high", nextMoveIsRelational: true }) }),
    );
    expect(rec).toMatchObject({ category: "talk_first", namedContact: null, confidence: "medium" });
  });

  it("says check the funding first for a senior role at a mission employer with no stated pay", () => {
    const rec = recommendPosting(
      drow({ title: "Executive Director", salary_text: null }),
      ctx({ employer: employer({ category: "human services nonprofit" }) }),
    );
    expect(rec.category).toBe("check_funding");
    expect(rec.rationale).toMatch(/grant vs endowed/);
  });

  it("does not raise a funding caution when a mission role is junior with pay that meets the floor", () => {
    const rec = recommendPosting(
      drow({ title: "Program Coordinator", salary_text: "$90,000" }),
      ctx({ employer: employer({ category: "community foundation" }) }),
    );
    expect(rec.category).toBe("apply");
  });

  it("exempts core operational leadership (a CIO) from the funding caution", () => {
    const rec = recommendPosting(
      drow({ title: "Vice President and Chief Information Officer", salary_text: null }),
      ctx({ employer: employer({ category: "higher education" }) }),
    );
    expect(rec.category).not.toBe("check_funding");
    expect(rec.category).toBe("apply");
  });

  it("lets a clearly below-floor role skip even at a mission employer — funding does not fix the pay", () => {
    const rec = recommendPosting(
      drow({ title: "Program Director", salary_text: "$50,000" }),
      ctx({ employer: employer({ category: "human services nonprofit" }) }),
    );
    expect(rec.category).toBe("skip");
    expect(rec.rationale).toMatch(/below your floor/);
  });

  it("still talks first for a below-floor role when a named network contact is there", () => {
    const rec = recommendPosting(
      drow({ title: "Program Director", salary_text: "$50,000" }),
      ctx({ employer: employer({ category: "human services nonprofit" }), networkLink: { contactName: "Sarah Lin", firstAsk: null } }),
    );
    expect(rec).toMatchObject({ category: "talk_first", namedContact: "Sarah Lin" });
  });

  it("raises a funding caution for a nonprofit-board posting even when the employer is not on the watched list", () => {
    const rec = recommendPosting(
      drow({ title: "Executive Director", salary_text: null }),
      ctx({ employer: null, missionBySource: true }),
    );
    expect(rec.category).toBe("check_funding");
    expect(rec.rationale).toMatch(/Nonprofit employer/);
  });

  it("recommends applying, at high confidence, for a verified lane match within places that meets pay", () => {
    const rec = recommendPosting(drow({ salary_text: "$92,000" }), ctx({ employer: employer() }));
    expect(rec).toMatchObject({ category: "apply", confidence: "high" });
    expect(rec.rationale).toMatch(/matches your Primary lane/);
    expect(rec.rationale).toMatch(/pay meets your floor/);
  });

  it("still recommends applying but at medium confidence when pay or location is unknown", () => {
    const rec = recommendPosting(drow({ salary_text: null, location_status: "unknown" }), ctx({ employer: employer() }));
    expect(rec).toMatchObject({ category: "apply", confidence: "medium" });
  });

  it("never says apply for an unverified lead — it caps at monitor", () => {
    const rec = recommendPosting(drow({ verification_state: "discovered_unverified", salary_text: "$92,000" }), ctx({ employer: employer() }));
    expect(rec.category).toBe("monitor");
    expect(rec.rationale).toMatch(/not yet verified/);
  });

  it("monitors a skill match that is outside the lanes", () => {
    const rec = recommendPosting(drow({ source_tier: "direct_read", matched_role_term: "skill" }), ctx({ employer: employer() }));
    expect(rec.category).toBe("monitor");
    expect(rec.rationale).toMatch(/proven experience/);
  });

  it("skips a below-floor posting, and one with no lane match at an unresolved employer", () => {
    expect(recommendPosting(drow({ salary_text: "$40,000" }), ctx()).category).toBe("skip");
    const noLane = recommendPosting(drow({ matched_role_term: "", source_tier: "general" }), ctx({ employer: null }));
    expect(noLane.category).toBe("skip");
    expect(noLane.rationale).toMatch(/No clear lane match/);
  });

  it("returns a quiet skip for closed or excluded postings and never fabricates a chip there", () => {
    expect(recommendPosting(drow({ verification_state: "no_longer_visible" }), ctx()).category).toBe("skip");
    expect(recommendPosting(drow({ exclusion_hit: "employer: Acme Co" }), ctx()).rationale).toMatch(/exclusion/);
  });

  it("lets the network cross-reference win over a funding caution (precedence)", () => {
    const rec = recommendPosting(
      drow({ title: "Executive Director", salary_text: null }),
      ctx({ employer: employer({ category: "human services nonprofit" }), networkLink: { contactName: "Sarah Lin", firstAsk: null } }),
    );
    expect(rec).toMatchObject({ category: "talk_first", namedContact: "Sarah Lin" });
  });

  it("always includes the evidence signals for the expander", () => {
    const rec = recommendPosting(drow({ salary_text: "$92,000" }), ctx({ employer: employer({ category: "advanced manufacturing" }) }));
    expect(rec.signals).toContain("Verified open on its own page");
    expect(rec.signals).toContain("Matches your Primary lane"); // label already ends in "lane"; no double word
    expect(rec.rationale).not.toMatch(/lane lane/);
    expect(rec.signals).toContain("Within your places");
    expect(rec.signals.some((s) => /Employer type: advanced manufacturing/.test(s))).toBe(true);
  });
});

describe("recommendPosting with IRS 990 funding data", () => {
  const funding = (trend: "growing" | "stable" | "shrinking" | "unknown", line = "IRS 990 (FY 2024): revenue $820k, down 29% since FY 2022") => ({
    trend, latestRevenueUsd: 820_000, filingYear: 2024, changePct: trend === "shrinking" ? -0.29 : 0.2, fromYear: 2022, deficit: false, line,
  });
  const withFunding = (f: ReturnType<typeof funding> | null, over: Partial<ResolvedEmployer> = {}) => employer({ category: "human services nonprofit", funding: f, ...over });

  it("a SHRINKING revenue trend raises the funding caution even for a junior role with pay that meets the floor", () => {
    const rec = recommendPosting(drow({ title: "Program Coordinator", salary_text: "$90,000" }), ctx({ employer: withFunding(funding("shrinking")) }));
    expect(rec.category).toBe("check_funding");
    expect(rec.confidence).toBe("high");
    expect(rec.rationale).toMatch(/IRS 990 \(FY 2024\).*down 29%.*revenue is falling.*Confirm this role is funded/);
    expect(rec.signals).toContain("IRS 990 (FY 2024): revenue $820k, down 29% since FY 2022");
  });

  it("applies even to a core operational leader (CIO) at a shrinking organization, because its finances are the concern", () => {
    const rec = recommendPosting(drow({ title: "Chief Information Officer", salary_text: "$150,000" }), ctx({ employer: withFunding(funding("shrinking")) }));
    expect(rec.category).toBe("check_funding");
    expect(rec.rationale).not.toMatch(/grant vs endowed/);
  });

  it("a GROWING filing is shown as evidence but never relaxes the caution: a filing cannot show this role is funded", () => {
    const rec = recommendPosting(
      drow({ title: "Executive Director", salary_text: null }),
      ctx({ employer: withFunding(funding("growing", "IRS 990 (FY 2024): revenue $1.4M, up 27% since FY 2022")) }),
    );
    expect(rec.category).toBe("check_funding");
    expect(rec.confidence).toBe("medium");
    expect(rec.rationale).toMatch(/up 27%.*can't show whether this particular role is funded/);
  });

  it("a growing or steady filing does not turn a junior, pay-meets-floor role into a caution", () => {
    const rec = recommendPosting(drow({ title: "Program Coordinator", salary_text: "$90,000" }), ctx({ employer: withFunding(funding("stable")) }));
    expect(rec.category).toBe("apply");
    expect(rec.signals.join(" ")).toMatch(/IRS 990/);
  });

  it("filing data marks a 990 filer as a mission employer even when its category text does not say so", () => {
    const quiet = employer({ category: "advanced manufacturing", funding: funding("growing") });
    const rec = recommendPosting(drow({ title: "Executive Director", salary_text: null }), ctx({ employer: quiet }));
    expect(rec.category).toBe("check_funding");
  });

  it("below-floor pay still dominates a shrinking funding trend, and a named contact still wins talk-first", () => {
    expect(recommendPosting(drow({ title: "Program Director", salary_text: "$50,000" }), ctx({ employer: withFunding(funding("shrinking")) })).category).toBe("skip");
    const warm = recommendPosting(drow(), ctx({ employer: withFunding(funding("shrinking")), networkLink: { contactName: "Sarah Lin", firstAsk: null } }));
    expect(warm.category).toBe("talk_first");
  });

  it("missing filing data is unknown, never a caution of its own and never a poor-funding signal", () => {
    const rec = recommendPosting(drow({ title: "Program Coordinator", salary_text: "$90,000" }), ctx({ employer: withFunding(null) }));
    expect(rec.category).toBe("apply");
    expect(rec.signals.join(" ")).not.toMatch(/IRS 990/);
  });
});
