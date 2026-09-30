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
