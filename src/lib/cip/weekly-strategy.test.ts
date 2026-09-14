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

  it("translates employer movement from the week-over-week comparison", () => {
    const diff = buildBriefingDiff(
      {
        ...baseState,
        employers: [{ ...baseState.employers[0], score: 80, direction: "up" }],
      },
      {
        week_start: "2026-09-07",
        summary: "Previous briefing.",
        next_actions: [],
        evidence: [
          {
            type: "strategic_state",
            conversation_outcome_count: 1,
            lane_scores: baseState.lanes,
            employer_scores: [{ ...baseState.employers[0], score: 72 }],
          },
        ],
      },
      context,
    );

    expect(diff.employerMovedUp[0]).toMatch(/moved up \+8 to 80/);
    expect(diff.displayChanged.join(" ")).toMatch(/gained enough signal/);
    expect(diff.displayChanged.join(" ")).not.toMatch(/\+8 to 80/);
  });

  it("translates candidate movement instead of reading it as an employer", () => {
    const diff = buildBriefingDiff(
      {
        ...baseState,
        deltas: ["Candidate Vermont Foodbank moved up to 64. watch score based on a new target signal"],
      },
      null,
      context,
    );

    expect(diff.displayChanged.join(" ")).toMatch(/stronger employer candidate/);
    expect(diff.displayChanged.join(" ")).not.toMatch(/^Candidate .* gained enough signal/);
  });

  it("reports employers that appeared since the last briefing", () => {
    const diff = buildBriefingDiff(
      {
        ...baseState,
        employers: [
          baseState.employers[0],
          { ...baseState.employers[0], name: "Vermont Foodbank", score: 70 },
        ],
      },
      {
        week_start: "2026-09-07",
        summary: "Previous briefing.",
        next_actions: [],
        evidence: [
          {
            type: "strategic_state",
            conversation_outcome_count: 1,
            lane_scores: baseState.lanes,
            employer_scores: [baseState.employers[0]],
          },
        ],
      },
      context,
    );

    expect(diff.changed.join(" ")).toMatch(/Vermont Foodbank is new since the last briefing/);
    expect(diff.displayChanged.join(" ")).toMatch(/decide this week whether it earns a real check/);
  });

  it("rewrites internal signal codes into plain language", () => {
    const diff = buildBriefingDiff(
      {
        ...baseState,
        lanes: [
          {
            lane: "Entrepreneurship teaching",
            label: "Research lane",
            score: 58,
            direction: "steady",
            reasons: ["Alex Herzog: strengthens lane_fit (+6)."],
            explanation: "watch score based on Alex Herzog: strengthens lane_fit (+6).",
          },
        ],
      },
      null,
      context,
    );

    const assumption = diff.displayAssumptions.join(" ");
    expect(assumption).toMatch(/a conversation with Alex Herzog supported this lane/);
    expect(assumption).not.toMatch(/lane_fit/);
    expect(assumption).not.toMatch(/\(\+6\)/);
    expect(diff.recommendedActions.join(" ")).not.toMatch(/lane_fit/);
  });
});
