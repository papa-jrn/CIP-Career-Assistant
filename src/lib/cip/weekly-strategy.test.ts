import { describe, expect, it } from "vitest";
import { buildBriefingDiff } from "@/lib/cip/weekly-strategy";
import type { StrategicState } from "@/lib/cip/strategic-state";

const baseState: StrategicState = {
  generatedAt: "2026-09-14T12:00:00.000Z",
  conversationOutcomeCount: 1,
  lanes: [
    {
      lane: "Executive Director and media operations leader",
      label: "Primary lane",
      score: 78,
      direction: "steady",
      reasons: ["Current evidence supports this lane."],
      explanation: "promising score based on current leadership evidence",
    },
  ],
  employers: [
    {
      name: "CCTV",
      region: "upper_valley",
      source: "watched",
      score: 72,
      direction: "steady",
      reasons: ["Baseline watched-employer fit score: 72."],
      explanation: "promising score based on baseline",
      nextMove: "Review current roles.",
    },
  ],
  employerCandidates: [],
  followUpObligations: [],
  resumeLaneRecommendation: {
    lane: "Executive Director and media operations leader",
    label: "Primary lane",
    score: 78,
    direction: "steady",
    reasons: ["Current evidence supports this lane."],
    nextMove: "Use this as the next resume variant to generate or refresh.",
  },
  deltas: [],
};

const context = {
  watchedEmployerCount: 1,
  opportunityMatchCount: 0,
  regionFocus: ["upper_valley"],
  adapterBacklogNames: ["CCTV"],
};

describe("weekly strategy briefing diff", () => {
  it("names real lane movement against the previous snapshot", () => {
    const diff = buildBriefingDiff(
      {
        ...baseState,
        lanes: [{ ...baseState.lanes[0], score: 84, direction: "up" }],
      },
      {
        week_start: "2026-09-07",
        summary: "Previous briefing.",
        next_actions: [],
        evidence: [
          {
            type: "strategic_state",
            conversation_outcome_count: 1,
            lane_scores: [{ ...baseState.lanes[0], score: 74 }],
            employer_scores: baseState.employers,
          },
        ],
      },
      context,
    );

    expect(diff.baseline).toBe(false);
    expect(diff.changed.join(" ")).toMatch(/rose \+10/);
    expect(diff.displayChanged.join(" ")).toMatch(/gained support/);
    expect(diff.laneStrengthened[0]).toMatch(/Executive Director/);
    expect(diff.recommendedActions.length).toBeGreaterThanOrEqual(3);
    expect(diff.recommendedActions.length).toBeLessThanOrEqual(5);
  });

  it("says nothing changed when scores and counts are stable", () => {
    const diff = buildBriefingDiff(
      baseState,
      {
        week_start: "2026-09-07",
        summary: "Previous briefing.",
        next_actions: [],
        evidence: [
          {
            type: "strategic_state",
            conversation_outcome_count: 1,
            lane_scores: baseState.lanes,
            employer_scores: baseState.employers,
          },
        ],
      },
      context,
    );

    expect(diff.changed).toHaveLength(0);
    expect(diff.displayChanged).toHaveLength(0);
    expect(diff.changeSummary).toMatch(/Nothing material changed/);
    expect(diff.recommendedActions.length).toBeGreaterThanOrEqual(3);
  });

  it("turns due follow-ups into action items even without job matches", () => {
    const diff = buildBriefingDiff(
      {
        ...baseState,
        followUpObligations: [
          {
            contactName: "Alex Herzog",
            relatedLane: "Research lane",
            relatedEmployer: "",
            promisedFollowUp: "Send a short follow-up.",
            followUpDueDate: "2000-01-01",
            nextAction: "Ask whether there is still a real role to inspect.",
            urgency: "overdue",
            reasons: ["Due 2000-01-01."],
          },
        ],
      },
      null,
      context,
    );

    expect(diff.baseline).toBe(true);
    expect(diff.contactsNeedingFollowUp[0]).toMatch(/Alex Herzog/);
    expect(diff.overduePromises[0]).toMatch(/Alex Herzog/);
    expect(diff.recommendedActions[0]).toMatch(/Follow up/);
  });

  it("keeps raw score language out of display assumptions", () => {
    const diff = buildBriefingDiff(
      {
        ...baseState,
        lanes: [
          ...baseState.lanes,
          {
            lane: "Director of Media Innovation / CTO for Nonprofit or Education",
            label: "Research lane",
            score: 58,
            direction: "steady",
            reasons: ["Baseline from current advisor lane order: 58."],
            explanation: "watch score based on Baseline from current advisor lane order: 58.",
          },
        ],
      },
      null,
      context,
    );

    expect(diff.displayAssumptions[0]).toMatch(/worth testing only/);
    expect(diff.displayAssumptions[0]).not.toMatch(/score based on/);
    expect(diff.recommendedActions[0]).not.toMatch(/score based on/);
  });
});
