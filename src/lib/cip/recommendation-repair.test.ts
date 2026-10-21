import { describe, expect, it } from "vitest";
import { buildConversationOutcome } from "@/lib/cip/conversation-outcomes";
import {
  buildFollowUpObligations,
  buildStrategicState,
  dedupeConversationOutcomes,
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
  ],
  positioning: [],
  changeLog: { strengthened: [], weakened: [] },
};

/**
 * Regressions for the recommendation repair gate (Workbench Redesign Plan §8).
 *
 * Each case below is one of the problems the founder saw in the 2026-10-19
 * briefing, pinned so it cannot come back quietly.
 */

const DUE = "2026-09-01";

function followUp(contactName: string, extra = {}) {
  return buildConversationOutcome({
    contactName,
    promisedFollowUp: "Send the summary",
    followUpDueDate: DUE,
    nextAction: "Send the summary",
    ...extra,
  });
}

describe("§8 item 2 — duplicate follow-ups for one person", () => {
  it("records one obligation per person, not one per saved conversation", () => {
    // A raw upload and its structured extraction are two records of one
    // conversation; two conversations with the same person are two records of
    // one relationship. Neither means two things are owed right now.
    const obligations = buildFollowUpObligations([
      followUp("Christopher Diak"),
      followUp("Christopher Diak", { nextAction: "Send the summary", conversationDate: "2026-08-02" }),
      followUp("Christopher Diak", { nextAction: "Ask about the opening", conversationDate: "2026-07-15" }),
    ]);
    expect(obligations).toHaveLength(1);
    expect(obligations[0].contactName).toBe("Christopher Diak");
  });

  it("says how many other conversations also recorded a follow-up", () => {
    const obligations = buildFollowUpObligations([followUp("Christopher Diak"), followUp("Christopher Diak")]);
    expect(obligations[0].reasons.join(" ")).toContain("1 further saved conversation");
  });

  it("treats name spelling and spacing variants as the same person", () => {
    const obligations = buildFollowUpObligations([followUp("Christopher Diak"), followUp("christopher  diak")]);
    expect(obligations).toHaveLength(1);
  });

  it("keeps separate people separate", () => {
    const obligations = buildFollowUpObligations([followUp("Christopher Diak"), followUp("Alex Herzog")]);
    expect(obligations).toHaveLength(2);
  });

  it("does not lose an employer or lane recorded only on the collapsed record", () => {
    const obligations = buildFollowUpObligations([
      followUp("Christopher Diak"),
      followUp("Christopher Diak", { relatedEmployer: "Dartmouth Health", relatedLane: "Nonprofit operations" }),
    ]);
    expect(obligations[0].relatedEmployer).toBe("Dartmouth Health");
    expect(obligations[0].relatedLane).toBe("Nonprofit operations");
  });
});

describe("§8 item 1 — the same employer reported twice", () => {
  it("reports an organization once when it is both watched and a discovered candidate", () => {
    const state = buildStrategicState({
      latestSource: null,
      latestAdvisor: null,
      // A conversation that moves the employer, so there is a delta to count.
      conversationOutcomes: [
        buildConversationOutcome({
          contactName: "Alex Herzog",
          relatedEmployer: "Valley Regional Hospital",
          signalType: "employer_fit",
          signalDirection: "strengthens",
          confidence: "high",
          marketSignal: "They are expanding operations hiring.",
        }),
      ],
      watchedEmployers: [
        { name: "Valley Regional Hospital", fit_score: 80, status: "watching", notes: "Known employer" },
      ],
      employerCandidates: [
        { name: "Valley Regional Hospital", fit_score: 80, status: "new", source_note: "Discovered" },
      ],
      latestNetworkAnalysis: null,
      verifiedPostings: [],
    } as never);

    const mentions = state.deltas.filter((delta) => delta.includes("Valley Regional Hospital"));
    // Guard against passing vacuously: the organization must be reported, once.
    expect(mentions).toHaveLength(1);
    expect(mentions[0]).not.toContain("Candidate");
  });
});

describe("§8 item 4 — employer context is not lane validation", () => {
  const lightNewTarget = (extra = {}) =>
    buildConversationOutcome({
      contactName: "Helpful Friend",
      relatedLane: "Entrepreneurship teacher and workforce development leader",
      signalDirection: "strengthens",
      signalType: "new_target",
      confidence: "medium",
      marketSignal: "This might be worth exploring if a real posting appears.",
      ...extra,
    });

  it("keeps a light new-target lane capped even when the conversation names an employer", () => {
    // Naming an employer is employer context. It is not evidence that the
    // career direction is viable, and letting it lift the lane is how employer
    // movement got reported as a strengthened lane.
    const withEmployer = scoreLanes({
      latestAdvisor: advisor,
      conversationOutcomes: [lightNewTarget({ relatedEmployer: "Dartmouth Health" })],
    } as never);
    const lane = withEmployer.find((item) => item.lane.includes("Entrepreneurship"));
    expect(lane?.label).toBe("Conversation research lane");
    expect(lane?.score).toBeLessThan(55);
  });

  it("scores that lane the same with and without the employer named", () => {
    const base = scoreLanes({ latestAdvisor: advisor, conversationOutcomes: [lightNewTarget()] } as never);
    const withEmployer = scoreLanes({
      latestAdvisor: advisor,
      conversationOutcomes: [lightNewTarget({ relatedEmployer: "Dartmouth Health" })],
    } as never);
    const score = (lanes: typeof base) => lanes.find((item) => item.lane.includes("Entrepreneurship"))?.score;
    expect(score(withEmployer)).toBe(score(base));
  });
});

describe("conversation identity — one save, two stores, distinct conversations kept", () => {
  const legacy = (extra = {}) =>
    buildConversationOutcome({
      contactName: "Vince Berk",
      conversationDate: "2026-08-06",
      marketSignal: "Stay away from large tech right now.",
      ...extra,
    });

  it("counts one save as one conversation when both stores hold it", () => {
    // The dedicated table and the additive career_sources record are two copies
    // of one save, carrying the same sourceRef.
    const ref = "loopback:notes-with-vince-berk:2026-09-14T10:00:00.000Z:0";
    const fromTable = buildConversationOutcome({ contactName: "Vince Berk", sourceRef: ref, marketSignal: "Stay away from large tech." });
    const fromCareerSources = buildConversationOutcome({ contactName: "Vince Berk", sourceRef: ref, marketSignal: "Stay away from large tech." });
    expect(dedupeConversationOutcomes([fromTable, fromCareerSources])).toHaveLength(1);
  });

  it("treats the same sourceRef as one conversation even if a copy lost a field", () => {
    const ref = "loopback:notes:2026-09-14T10:00:00.000Z:0";
    const full = buildConversationOutcome({ contactName: "Vince Berk", sourceRef: ref, relatedEmployer: "Hypertherm", marketSignal: "Large tech is a blood bath." });
    const partial = buildConversationOutcome({ contactName: "Vince Berk", sourceRef: ref, marketSignal: "Large tech is a blood bath." });
    expect(dedupeConversationOutcomes([full, partial])).toHaveLength(1);
  });

  // The regression: before sourceRef existed, two genuinely different notes
  // about one person on one day keyed identically and one was discarded, so a
  // real conversation disappeared from scoring and from the follow-up queue.
  it("keeps two different conversations with one person on one day", () => {
    const first = legacy({ marketSignal: "Stay away from large tech right now.", rawNoteExcerpt: "First note" });
    const second = legacy({ marketSignal: "Look at Upper Valley nonprofits.", rawNoteExcerpt: "A separate, later note" });
    expect(dedupeConversationOutcomes([first, second])).toHaveLength(2);
  });

  it("still collapses an identical legacy record loaded twice", () => {
    expect(dedupeConversationOutcomes([legacy(), legacy()])).toHaveLength(1);
  });

  it("does not collapse different people who share a date and a lane", () => {
    const a = buildConversationOutcome({ contactName: "Vince Berk", conversationDate: "2026-08-06", relatedLane: "Nonprofit operations" });
    const b = buildConversationOutcome({ contactName: "Alex Herzog", conversationDate: "2026-08-06", relatedLane: "Nonprofit operations" });
    expect(dedupeConversationOutcomes([a, b])).toHaveLength(2);
  });
});
