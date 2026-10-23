import { describe, expect, it } from "vitest";
import { buildConversationOutcome } from "./conversation-outcomes";
import { personSearchText, summarizePersonRow, type RowObligation } from "./follow-up-row";

const TODAY = "2026-10-23";

function person(over: Record<string, unknown> = {}) {
  return {
    contact: { name: "Jordan Lee", company: "Regional Hospital", title: "Director of Nursing", notes: "" },
    latestFeedback: undefined,
    conversationOutcomes: [],
    ...over,
  } as never;
}

const obligation = (over: Partial<RowObligation> = {}): RowObligation => ({
  contactName: "Jordan Lee",
  nextAction: "Send the summary",
  followUpDueDate: "2026-11-01",
  ...over,
});

describe("the status a row shows", () => {
  it("says plainly when nobody has been contacted yet, rather than guessing", () => {
    expect(summarizePersonRow(person(), [], TODAY).status).toBe("Not contacted yet");
  });

  it("uses the status the user actually set", () => {
    for (const conversationStatus of ["Awaiting reply", "Scheduled", "Intro offered", "Parked"]) {
      expect(summarizePersonRow(person({ latestFeedback: { conversationStatus } }), [], TODAY).status).toBe(conversationStatus);
    }
  });

  it("distinguishes met-with-notes from met-without, which is the whole point of the prompt", () => {
    const met = { conversationStatus: "Met" };
    expect(summarizePersonRow(person({ latestFeedback: met }), [], TODAY).status).toBe("Met, notes not captured yet");

    const withNotes = person({
      latestFeedback: met,
      conversationOutcomes: [buildConversationOutcome({ contactName: "Jordan Lee", marketSignal: "Two directors left this year." })],
    });
    expect(summarizePersonRow(withNotes, [], TODAY).status).toBe("Met, notes captured");
  });

  it("counts notes written into the feedback record as captured too", () => {
    const withNote = person({ latestFeedback: { conversationStatus: "Met", marketSignals: "Pay bands are flat." } });
    expect(summarizePersonRow(withNote, [], TODAY).status).toBe("Met, notes captured");
  });

  it("never says notes are captured when only a triage reason was written", () => {
    // Taken from a live record: a contact marked Met whose only text was a
    // reason for the triage decision.
    const triageOnly = person({ latestFeedback: { conversationStatus: "Met", decisionReason: "Need to reach out for a follow up date." } });
    expect(summarizePersonRow(triageOnly, [], TODAY).status).toBe("Met, notes not captured yet");
  });

  it("leads with an overdue follow-up over any other status", () => {
    const overdue = person({ latestFeedback: { conversationStatus: "Awaiting reply", followUpDate: "2026-09-01" } });
    const summary = summarizePersonRow(overdue, [], TODAY);
    expect(summary.status).toContain("Follow-up overdue since 2026-09-01");
    expect(summary.urgent).toBe(true);
  });

  it("marks met-without-notes as needing attention, and a settled status as not", () => {
    expect(summarizePersonRow(person({ latestFeedback: { conversationStatus: "Met" } }), [], TODAY).urgent).toBe(true);
    expect(summarizePersonRow(person({ latestFeedback: { conversationStatus: "Scheduled" } }), [], TODAY).urgent).toBe(false);
  });
});

describe("the next action and due date", () => {
  it("takes the next action from an open obligation for that person", () => {
    const summary = summarizePersonRow(person(), [obligation()], TODAY);
    expect(summary.nextAction).toBe("Send the summary");
    expect(summary.dueDate).toBe("2026-11-01");
  });

  it("does not borrow another person's obligation", () => {
    const summary = summarizePersonRow(person(), [obligation({ contactName: "Someone Else" })], TODAY);
    expect(summary.nextAction).toBeNull();
  });

  it("matches a name whose spacing or case differs", () => {
    const summary = summarizePersonRow(person(), [obligation({ contactName: "jordan  lee" })], TODAY);
    expect(summary.nextAction).toBe("Send the summary");
  });

  it("falls back to a next action saved on the feedback record", () => {
    const withAction = person({ latestFeedback: { conversationStatus: "Scheduled", nextAction: "Confirm the time" } });
    expect(summarizePersonRow(withAction, [], TODAY).nextAction).toBe("Confirm the time");
  });

  it("reports no next action rather than inventing one", () => {
    expect(summarizePersonRow(person(), [], TODAY).nextAction).toBeNull();
    expect(summarizePersonRow(person(), [], TODAY).dueDate).toBeNull();
  });

  it("does not match an obligation when the person has no name", () => {
    const nameless = person({ contact: { name: "" } });
    expect(summarizePersonRow(nameless, [obligation({ contactName: "" })], TODAY).nextAction).toBeNull();
  });
});

describe("searching the list", () => {
  it("matches on name, employer, title and notes", () => {
    const text = personSearchText(person({ contact: { name: "Jordan Lee", company: "Regional Hospital", title: "Director of Nursing", notes: "Met at the conference" } }));
    for (const term of ["jordan", "regional", "nursing", "conference"]) {
      expect(text).toContain(term);
    }
  });

  it("survives a contact with missing fields", () => {
    expect(() => personSearchText({ contact: { name: "Jordan Lee" } })).not.toThrow();
    expect(() => personSearchText({})).not.toThrow();
  });
});
