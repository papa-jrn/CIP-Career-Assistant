import { describe, expect, it } from "vitest";
import { createFakeSupabase } from "@/lib/cip/__fixtures__/fake-supabase";
import type { ObservationRow, RunView } from "@/lib/cip/job-search-run";
import { computeDueState } from "@/lib/cip/job-search-run";
import { indexDispositions, type PostingDisposition } from "@/lib/cip/posting-dispositions";
import type { Recommendation } from "@/lib/cip/recommendation";
import { renderJobSearchPanel } from "@/lib/cip/job-search-view";
import {
  buildPostingAnnotations,
  normOrg,
  recommendationForPosting,
  type RecommendationInputs,
} from "@/lib/cip/opportunity-recommendations";

const USER = "user-1";
const NOW = "2026-09-23T12:00:00.000Z";

const drow = (over: Partial<ObservationRow> = {}): ObservationRow => ({
  id: "x", run_id: "r", title: "Executive Director", employer_text: "Upper Valley Haven", worksite_text: "Lebanon, NH",
  source_url: "https://jobs.example.org/ed", requisition_id: "R-1", posted_text: null, salary_text: null, remote_status: "not_stated",
  matched_role_term: "operations", source_tier: "general", verification_state: "verified_open",
  verification_note: null, verification_checked_at: null, location_status: "within", location_distance_miles: null,
  location_note: null, exclusion_hit: null, first_seen_at: NOW, carried_forward: false, ...over,
});

const inputs = (over: Partial<RecommendationInputs> = {}): RecommendationInputs => ({
  floorUsd: 85_000, employers: [], contacts: [], followUps: [], lanes: [], ...over,
});

describe("normOrg", () => {
  it("lowercases and strips punctuation and common company suffixes", () => {
    expect(normOrg("Upper Valley Haven, Inc.")).toBe("upper valley haven");
    expect(normOrg("Hypertherm LLC")).toBe("hypertherm");
    expect(normOrg(null)).toBe("");
  });
});

describe("recommendationForPosting (resolution + matching)", () => {
  it("resolves the employer by fuzzy name and raises a funding caution for a mission org", () => {
    const rec = recommendationForPosting(
      drow(),
      inputs({ employers: [{ key: normOrg("Upper Valley Haven"), category: "human services nonprofit", priority: "high", fitScore: 80, nextMove: null, nextMoveIsRelational: false }] }),
    );
    expect(rec.category).toBe("check_funding");
  });

  it("turns a network contact at the employer into a named talk-first, over the funding caution", () => {
    const rec = recommendationForPosting(
      drow(),
      inputs({
        employers: [{ key: normOrg("Upper Valley Haven"), category: "human services nonprofit", priority: "high", fitScore: 80, nextMove: null, nextMoveIsRelational: false }],
        contacts: [{ key: normOrg("Upper Valley Haven"), name: "Sarah Lin", firstAsk: "Ask about the ED search." }],
      }),
    );
    expect(rec).toMatchObject({ category: "talk_first", namedContact: "Sarah Lin" });
  });

  it("labels the matched lane when a lane's text overlaps the matched role term", () => {
    const rec = recommendationForPosting(
      drow({ title: "Operations Manager", matched_role_term: "operations", salary_text: "$95,000" }),
      inputs({ lanes: [{ lane: "program operations", label: "Primary" }], employers: [{ key: normOrg("Upper Valley Haven"), category: "advanced manufacturing", priority: "medium", fitScore: 70, nextMove: null, nextMoveIsRelational: false }] }),
    );
    // Operations Manager is senior, but the employer is not a mission org, so it applies.
    expect(rec.category).toBe("apply");
    expect(rec.rationale).toMatch(/matches your Primary lane/);
  });
});

describe("buildPostingAnnotations (end to end)", () => {
  it("computes a named talk-first from a saved network contact whose company matches the posting", async () => {
    const { client } = createFakeSupabase({
      watched_employers: [{ user_id: USER, name: "Upper Valley Haven", category: "human services nonprofit", priority: "high", fit_score: 80 }],
      career_sources: [
        {
          user_id: USER,
          source_type: "network_analysis",
          created_at: NOW,
          extracted_text: JSON.stringify({
            analysis: { contactMatches: [{ contact: { name: "Sarah Lin", company: "Upper Valley Haven, Inc." }, recommendedFirstAsk: "Ask about the ED search." }] },
          }),
        },
      ],
    });
    const view: RunView = {
      run: { id: "r", status: "succeeded", brief: { compensation: { floorUsd: 85_000 } } } as never,
      observations: [drow()],
    };
    const annotations = await buildPostingAnnotations(client, USER, view);
    const rec = annotations.recommendations.get("https://jobs.example.org/ed");
    expect(rec).toMatchObject({ category: "talk_first", namedContact: "Sarah Lin" });
  });
});

describe("chip rendering in the panel", () => {
  const view: RunView = {
    run: { id: "r", status: "succeeded", model: "m", plan: [], trace: [], coverage: [], usage: {}, estimated_cost_usd: null, summary: "s", started_at: NOW, brief: { compensation: { floorUsd: 85_000 } } } as never,
    observations: [drow()],
  };
  const rec: Recommendation = { category: "talk_first", confidence: "high", rationale: "Reach out to Sarah Lin, who's connected to Upper Valley Haven.", signals: ["Verified open on its own page", "Sarah Lin in your network is connected to Upper Valley Haven"], namedContact: "Sarah Lin" };
  const ctx = { runKey: "abc12345", due: computeDueState(null, 7, NOW), configured: true };

  it("renders the chip, rationale, evidence, and the keep-an-eye-on action", () => {
    const annotations = { recommendations: new Map([["https://jobs.example.org/ed", rec]]), dispositions: indexDispositions([]) };
    const html = renderJobSearchPanel(view, ctx, annotations);
    expect(html).toContain("Talk to someone first");
    expect(html).toContain("Reach out to Sarah Lin");
    expect(html).toContain("Why / change");
    expect(html).toContain("Keep an eye on for now");
    expect(html).toContain("Suggested this week:");
  });

  it("shows the user's own status taking precedence, while still naming the app's suggestion", () => {
    const disposition: PostingDisposition = { normalized_url: "", source_url: "https://jobs.example.org/ed", employer_key: "upper valley haven", requisition_id: "R-1", status: "watching", note: "", updated_at: NOW };
    const annotations = { recommendations: new Map([["https://jobs.example.org/ed", rec]]), dispositions: indexDispositions([disposition]) };
    const html = renderJobSearchPanel(view, ctx, annotations);
    expect(html).toContain("Your call: Keeping an eye on it");
    expect(html).toContain("app suggested: Talk to someone first");
  });
});
