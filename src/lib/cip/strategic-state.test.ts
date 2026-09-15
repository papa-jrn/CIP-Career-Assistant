import { describe, expect, it } from "vitest";
import { buildConversationOutcome } from "@/lib/cip/conversation-outcomes";
import { buildTargetLanes } from "@/lib/cip/resume-asset-context";
import {
  buildFollowUpObligations,
  buildResumeLaneRecommendation,
  buildStrategicState,
  scoreEmployerCandidates,
  scoreEmployers,
  scoreLanes,
} from "@/lib/cip/strategic-state";

const advisor = {
  roleBriefs: [
    {
      role: "Nonprofit operations and workflow modernization",
      whyItFits: "Matches operations leadership and AI workflow proof.",
      evidenceNeeded: "Confirm compensation and scope.",
      searchTargets: [],
    },
    {
      role: "Big tech software engineering",
      whyItFits: "Adjacent to public GitHub projects.",
      evidenceNeeded: "Would need stronger programming labor-market proof.",
      searchTargets: [],
    },
  ],
};

describe("strategic state propagation", () => {
  it("labels entrepreneurship and workforce-development advisor lanes as research by default", () => {
    const lanes = buildTargetLanes(null, {
      roleBriefs: [
        {
          role: "Executive Director and media operations leader",
          whyItFits: "Supported by current leadership evidence.",
          evidenceNeeded: "Refresh metrics.",
          searchTargets: [],
        },
        {
          role: "Entrepreneurship teacher and workforce development leader",
          whyItFits: "Could be possible through a prior conversation.",
          evidenceNeeded: "Needs a real posting and current evidence.",
          searchTargets: [],
        },
      ],
    });

    expect(lanes[1].label).toBe("Research lane");
  });

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

  it("keeps a single medium-confidence new target as a modest research lane", () => {
    const lanes = scoreLanes({
      latestAdvisor: advisor,
      conversationOutcomes: [
        buildConversationOutcome({
          contactName: "Helpful Friend",
          relatedLane: "Entrepreneurship teacher and workforce development leader",
          signalDirection: "strengthens",
          signalType: "new_target",
          confidence: "medium",
          marketSignal: "This might be worth exploring if a real posting appears.",
        }),
      ],
    });

    const researchLane = lanes.find((lane) => lane.lane.includes("Entrepreneurship"));

    expect(researchLane?.label).toBe("Conversation research lane");
    expect(researchLane?.score).toBeLessThan(55);
    expect(researchLane?.explanation).toMatch(/watch|low-priority/);
  });

  it("does not let one medium new-target conversation outrank current-work evidence", () => {
    const lanes = scoreLanes({
      latestAdvisor: {
        roleBriefs: [
          {
            role: "Executive Director and media operations leader",
            whyItFits: "Supported by six years of current executive director and media leadership work.",
            evidenceNeeded: "Refresh current metrics.",
            searchTargets: [],
          },
          {
            role: "Entrepreneurship teacher and workforce development leader",
            whyItFits: "A prior entrepreneurship-teaching thread may be worth exploring.",
            evidenceNeeded: "Needs a current posting and fresh evidence.",
            searchTargets: [],
          },
        ],
      },
      conversationOutcomes: [
        buildConversationOutcome({
          contactName: "Alex Herzog",
          relatedLane: "Entrepreneurship teacher and workforce development leader",
          signalDirection: "strengthens",
          signalType: "new_target",
          confidence: "medium",
          marketSignal: "Possible opportunity, but no job posting or follow-up yet.",
        }),
      ],
    });

    const currentWorkLane = lanes.find((lane) => lane.lane.includes("Executive Director"));
    const exploratoryLane = lanes.find((lane) => lane.lane.includes("Entrepreneurship"));

    expect(currentWorkLane?.score).toBeGreaterThan(exploratoryLane?.score ?? 0);
    expect(lanes[0].lane).toMatch(/Executive Director/);
    expect(exploratoryLane?.score).toBeLessThanOrEqual(54);
    expect(exploratoryLane?.label).toBe("Research lane");
    expect(exploratoryLane?.explanation).toMatch(/research|watch/);
  });

  it("scores the full advisor lane pool before choosing visible priority", () => {
    const lanes = scoreLanes({
      latestAdvisor: {
        roleBriefs: [
          {
            role: "Executive Director and media operations leader",
            whyItFits: "Supported by current leadership evidence.",
            evidenceNeeded: "Refresh metrics.",
            searchTargets: [],
          },
          {
            role: "Entrepreneurship teacher and workforce development leader",
            whyItFits: "Possible older teaching thread.",
            evidenceNeeded: "Needs a real posting and current evidence.",
            searchTargets: [],
          },
          {
            role: "Regional nonprofit operations director",
            whyItFits: "Uses operations and community leadership.",
            evidenceNeeded: "Compare compensation.",
            searchTargets: [],
          },
          {
            role: "AI operations strategist",
            whyItFits: "Uses current AI workflow and operations proof.",
            evidenceNeeded: "Package project evidence.",
            searchTargets: [],
          },
        ],
      },
      conversationOutcomes: [
        buildConversationOutcome({
          contactName: "Evidence review",
          relatedLane: "AI operations strategist",
          signalDirection: "strengthens",
          signalType: "lane_fit",
          confidence: "high",
          marketSignal: "Current AI workflow and operations evidence supports this lane.",
        }),
      ],
    });

    expect(lanes.slice(0, 3).map((lane) => lane.lane)).toContain("AI operations strategist");
    expect(lanes.findIndex((lane) => lane.lane.includes("Entrepreneurship"))).toBeGreaterThan(2);
  });

  it("moves an employer candidate up before promotion when conversation signals match it", () => {
    const candidates = scoreEmployerCandidates({
      conversationOutcomes: [
        buildConversationOutcome({
          contactName: "Hiring Insider",
          relatedEmployer: "Vermont State University",
          relatedLane: "workforce development",
          signalDirection: "strengthens",
          signalType: "employer_fit",
          confidence: "high",
          marketSignal: "This candidate should move higher because the role lane is active.",
        }),
      ],
      employerCandidates: [
        {
          name: "Vermont State University",
          region: "vermont",
          fit_score: 62,
          target_roles: ["workforce development"],
          review_state: "pending",
        },
      ],
    });

    expect(candidates[0].source).toBe("candidate");
    expect(candidates[0].direction).toBe("up");
    expect(candidates[0].score).toBeGreaterThan(62);
    expect(candidates[0].explanation).toMatch(/Hiring Insider/);
  });

  it("turns promised conversation follow-ups into strategic obligations", () => {
    const obligations = buildFollowUpObligations([
      buildConversationOutcome({
        contactName: "Alex Herzog",
        relatedLane: "entrepreneurship teaching",
        promisedFollowUp: "Send a concise teaching-lane portfolio note.",
        followUpDueDate: "2000-01-01",
        nextAction: "Send the portfolio note.",
        signalType: "follow_up_obligation",
      }),
    ]);

    expect(obligations).toHaveLength(1);
    expect(obligations[0].contactName).toBe("Alex Herzog");
    expect(obligations[0].urgency).toBe("overdue");
    expect(obligations[0].nextAction).toMatch(/portfolio/);
  });

  it("recommends the top non-conversation-only lane for resume work", () => {
    const lanes = scoreLanes({
      latestAdvisor: advisor,
      conversationOutcomes: [
        buildConversationOutcome({
          contactName: "Security Friend",
          relatedLane: "nonprofit operations",
          signalDirection: "strengthens",
          signalType: "lane_fit",
          confidence: "high",
        }),
      ],
    });

    const recommendation = buildResumeLaneRecommendation(lanes);

    expect(recommendation?.lane).toMatch(/Nonprofit/);
    expect(recommendation?.nextMove).toMatch(/resume variant/);
  });
});
