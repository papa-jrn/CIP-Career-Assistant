import { describe, expect, it } from "vitest";
import { buildConversationOutcome } from "./conversation-outcomes";
import {
  actionBucket,
  feedbackHasConversationContent,
  hasLoggedConversation,
  needsNudge,
  outcomeHasLoggedConversation,
  type BucketFeedback,
} from "./follow-up-buckets";

const TODAY = "2026-10-21";

function met(extra: Partial<BucketFeedback> = {}): BucketFeedback {
  return { conversationStatus: "Met", ...extra };
}

describe("needsNudge", () => {
  it("is due when the follow-up date has passed and the person is not shelved", () => {
    expect(needsNudge({ followUpDate: "2026-10-01", conversationStatus: "Awaiting reply" }, TODAY)).toBe(true);
  });

  it("is not due without a follow-up date, or when it is still in the future", () => {
    expect(needsNudge({ conversationStatus: "Awaiting reply" }, TODAY)).toBe(false);
    expect(needsNudge({ followUpDate: "2026-11-01" }, TODAY)).toBe(false);
    expect(needsNudge(undefined, TODAY)).toBe(false);
  });

  it("is moot once the person is met, parked, or removed", () => {
    for (const conversationStatus of ["Met", "Parked", "Removed"]) {
      expect(needsNudge({ followUpDate: "2026-10-01", conversationStatus }, TODAY)).toBe(false);
    }
  });
});

describe("outcomeHasLoggedConversation", () => {
  it("counts a conversation that records something learned", () => {
    expect(outcomeHasLoggedConversation(buildConversationOutcome({ marketSignal: "Contract rates are flat" }))).toBe(true);
    expect(outcomeHasLoggedConversation(buildConversationOutcome({ rawNoteExcerpt: "Talked through the role" }))).toBe(true);
    expect(outcomeHasLoggedConversation(buildConversationOutcome({ nextAction: "Send the deck" }))).toBe(true);
  });

  it("does not count a bare lane or employer tag as a captured conversation", () => {
    const tagged = buildConversationOutcome({ relatedLane: "Clinical leadership", relatedEmployer: "Dartmouth Health" });
    expect(outcomeHasLoggedConversation(tagged)).toBe(false);
  });

  it("does not count an empty outcome", () => {
    expect(outcomeHasLoggedConversation(buildConversationOutcome({}))).toBe(false);
  });
});

describe("hasLoggedConversation", () => {
  it("accepts content written into the feedback record", () => {
    expect(hasLoggedConversation({ latestFeedback: met({ note: "Good call" }) })).toBe(true);
    expect(hasLoggedConversation({ latestFeedback: met({ marketSignals: "Pay is below band" }) })).toBe(true);
  });

  it("accepts a conversation logged only in the outcome store", () => {
    expect(
      hasLoggedConversation({
        latestFeedback: met(),
        conversationOutcomes: [buildConversationOutcome({ marketSignal: "Hiring is frozen until spring" })],
      }),
    ).toBe(true);
  });

  it("is false when neither store holds anything", () => {
    expect(hasLoggedConversation({ latestFeedback: met() })).toBe(false);
    expect(hasLoggedConversation({ latestFeedback: met(), conversationOutcomes: [] })).toBe(false);
  });
});

describe("actionBucket", () => {
  it("asks for notes when the person is met and nothing is captured", () => {
    expect(actionBucket({ latestFeedback: met() }, TODAY)).toBe("notes");
  });

  // The bug: a conversation logged through the outcome store left the person in
  // "Met — capture notes" permanently, because only the feedback record counted.
  it("stops asking for notes once the conversation is logged as an outcome", () => {
    const person = {
      latestFeedback: met(),
      conversationOutcomes: [
        buildConversationOutcome({
          contactName: "Dana Reyes",
          marketSignal: "Two directors left this year",
          nextAction: "Ask for an intro to the COO",
        }),
      ],
    };
    expect(actionBucket(person, TODAY)).toBeNull();
  });

  it("keeps asking for notes when the outcome is only a lane tag", () => {
    const person = {
      latestFeedback: met(),
      conversationOutcomes: [buildConversationOutcome({ relatedLane: "Clinical leadership" })],
    };
    expect(actionBucket(person, TODAY)).toBe("notes");
  });

  it("puts an overdue nudge ahead of every other bucket", () => {
    const person = { latestFeedback: { conversationStatus: "Awaiting reply", followUpDate: "2026-09-30" } };
    expect(actionBucket(person, TODAY)).toBe("nudge");
  });

  it("sorts scheduled and offered introductions into this week", () => {
    expect(actionBucket({ latestFeedback: { conversationStatus: "Scheduled" } }, TODAY)).toBe("week");
    expect(actionBucket({ latestFeedback: { conversationStatus: "Intro offered" } }, TODAY)).toBe("week");
  });

  it("sorts a sent-and-waiting person into awaiting reply", () => {
    expect(actionBucket({ latestFeedback: { conversationStatus: "Awaiting reply" } }, TODAY)).toBe("awaiting");
  });

  it("returns no bucket for a person with no saved feedback", () => {
    expect(actionBucket({}, TODAY)).toBeNull();
  });

  it("returns no bucket for a status that needs nothing now", () => {
    expect(actionBucket({ latestFeedback: { conversationStatus: "To contact" } }, TODAY)).toBeNull();
  });
});

describe("feedbackHasConversationContent", () => {
  it("is false for undefined and for a status-only record", () => {
    expect(feedbackHasConversationContent(undefined)).toBe(false);
    expect(feedbackHasConversationContent(met())).toBe(false);
  });

  it("counts every field that records what the conversation said", () => {
    for (const field of [
      "note",
      "marketSignals",
      "newLeads",
      "laneImpact",
      "compensationSignal",
      "workModelSignal",
      "cultureSignal",
      "hiringSignal",
      "warnings",
    ]) {
      expect(feedbackHasConversationContent(met({ [field]: "Something they told me" }))).toBe(true);
    }
  });

  // Taken from a live record on 2026-10-21: a contact marked Met whose only
  // text was a triage reason. Counting it would assert the conversation was
  // captured when nothing about it was written down.
  it("does not count a triage reason or an obligation as a captured conversation", () => {
    expect(feedbackHasConversationContent(met({ decisionReason: "Need to reach out for a follow up date." }))).toBe(false);
    expect(feedbackHasConversationContent(met({ nextAction: "Email him next week" }))).toBe(false);
    expect(feedbackHasConversationContent(met({ promisedFollowUp: "Send my resume" }))).toBe(false);
  });

  it("keeps that person in the notes bucket", () => {
    const person = { latestFeedback: met({ decisionReason: "Need to reach out for a follow up date." }) };
    expect(actionBucket(person, TODAY)).toBe("notes");
  });
});
