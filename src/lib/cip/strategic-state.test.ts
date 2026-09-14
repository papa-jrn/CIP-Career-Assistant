import { describe, expect, it } from "vitest";
import { buildConversationOutcome } from "@/lib/cip/conversation-outcomes";
import { buildStrategicState, scoreEmployers, scoreLanes } from "@/lib/cip/strategic-state";

const advisor = {
  roleBriefs: [
    {
      role: "Nonprofit operations and workflow modernization",
      whyItFits: "Matches operations leadership and AI workflow proof.",
      evidenceNeeded: "Confirm compensation and scope.",
    },
    {
      role: "Big tech software engineering",
      whyItFits: "Adjacent to public GitHub projects.",
      evidenceNeeded: "Would need stronger programming labor-market proof.",
    },
  ],
};

describe("strategic state propagation", () => {
  it("moves a lane up when a structured conversation strengthens it", () => {
    const lanes = scoreLanes({
      latestAdvisor: advisor,
      conversationOutcomes: [
        buildConversationOutcome({
          contactName: "Security Friend",
          relatedLane: "nonprofit operations",
          signalDirection: "strengthens",
          signalType: "lane_fit",
          confidence: "high",
          marketSignal: "Nonprofits are the more appropriate market to explore.",
        }),
      ],
    });

    expect(lanes[0].lane).toMatch(/Nonprofit/);
    expect(lanes[0].direction).toBe("up");
    expect(lanes[0].score).toBeGreaterThan(74);
    expect(lanes[0].reasons.join(" ")).toMatch(/Security Friend/);
  });

  it("moves an employer down when a conversation weakens that employer", () => {
    const employers = scoreEmployers({
      conversationOutcomes: [
        buildConversationOutcome({
          contactName: "Market Advisor",
          relatedEmployer: "CCTV",
          signalDirection: "weakens",
          signalType: "compensation",
          confidence: "high",
          compensationSignal: "Scope is real, but pay ceiling may be too low.",
        }),
      ],
      watchedEmployers: [
        {
          name: "CCTV",
          region: "upper_valley",
          fit_score: 70,
          target_roles: ["operations"],
        },
      ],
    });

    expect(employers[0].direction).toBe("down");
    expect(employers[0].score).toBeLessThan(70);
    expect(employers[0].reasons.join(" ")).toMatch(/Market Advisor/);
  });

  it("produces briefing deltas from lane and employer movement", () => {
    const state = buildStrategicState({
      latestAdvisor: advisor,
      conversationOutcomes: [
        buildConversationOutcome({
          contactName: "Advisor",
          relatedLane: "Big tech software engineering",
          relatedEmployer: "Generic Big Tech",
          signalDirection: "weakens",
          signalType: "dealbreaker",
          confidence: "high",
          warnings: "The funnel is crowded and politically risky.",
        }),
      ],
      watchedEmployers: [
        {
          name: "Generic Big Tech",
          region: "remote",
          fit_score: 65,
          target_roles: ["software engineering"],
        },
      ],
    });

    expect(state.deltas.length).toBeGreaterThan(0);
    expect(state.deltas.join(" ")).toMatch(/moved down/);
    expect(state.conversationOutcomeCount).toBe(1);
  });

  it("keeps a conversation-only lane visible before advisor analysis promotes it", () => {
    const lanes = scoreLanes({
      latestAdvisor: advisor,
      conversationOutcomes: [
        buildConversationOutcome({
          contactName: "Alex Herzog",
          relatedLane: "Entrepreneurship teacher and workforce development leader",
          signalDirection: "strengthens",
          signalType: "new_target",
          confidence: "medium",
          marketSignal: "Vermont State University teaching or think-tank opportunity may be worth exploring.",
        }),
      ],
    });

    expect(lanes.some((lane) => lane.lane === "Entrepreneurship teacher and workforce development leader")).toBe(true);
    const alexLane = lanes.find((lane) => lane.lane.includes("Entrepreneurship"));
    expect(alexLane?.label).toBe("Conversation research lane");
    expect(alexLane?.reasons.join(" ")).toMatch(/Alex Herzog/);
  });
});
