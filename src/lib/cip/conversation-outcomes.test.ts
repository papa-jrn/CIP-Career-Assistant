import { describe, expect, it } from "vitest";
import {
  buildConversationOutcome,
  conversationOutcomeCareerSourcePayload,
  conversationOutcomesToEvidence,
  outcomeHasStrategicContent,
  parseConversationOutcome,
  renderOutcomeText,
} from "@/lib/cip/conversation-outcomes";

describe("conversation outcomes", () => {
  it("normalizes a structured market-read conversation", () => {
    const outcome = buildConversationOutcome({
      contactName: "Dr. Advisor",
      relatedLane: "Upper Valley nonprofits",
      relatedEmployer: "regional human services orgs",
      signalType: "compensation",
      signalDirection: "weakens",
      confidence: "high",
      compensationSignal: "Several roles cap below the current compensation floor.",
      nextAction: "Research larger nonprofit systems north of Lebanon.",
    });

    expect(outcome.contactName).toBe("Dr. Advisor");
    expect(outcome.signalType).toBe("compensation");
    expect(outcome.signalDirection).toBe("weakens");
    expect(outcome.confidence).toBe("high");
    expect(outcomeHasStrategicContent(outcome)).toBe(true);
  });

  it("falls back to safe default taxonomy values", () => {
    const outcome = buildConversationOutcome({
      contactName: "Security Friend",
      signalType: "not_a_real_type" as never,
      signalDirection: "maybe" as never,
      confidence: "certain" as never,
      marketSignal: "Avoid undifferentiated big-tech programmer resume piles.",
    });

    expect(outcome.signalType).toBe("market_signal");
    expect(outcome.signalDirection).toBe("unclear");
    expect(outcome.confidence).toBe("medium");
  });

  it("round-trips through career source payloads as first-hand advisor evidence", () => {
    const outcome = buildConversationOutcome({
      contactName: "Security Friend",
      relatedLane: "nonprofit technology operations",
      signalType: "lane_fit",
      signalDirection: "strengthens",
      confidence: "high",
      marketSignal: "Nonprofits are less cut-throat and may value broad operations plus AI workflow judgment.",
      warnings: "Do not compete in generic big-tech programmer funnels.",
      createdAt: "2026-09-12T12:00:00.000Z",
    });

    const payload = conversationOutcomeCareerSourcePayload(outcome);
    const parsed = parseConversationOutcome(payload);
    const evidence = conversationOutcomesToEvidence(parsed ? [parsed] : []);

    expect(parsed?.contactName).toBe("Security Friend");
    expect(renderOutcomeText(outcome)).toMatch(/Nonprofits are less cut-throat/);
    expect(evidence[0]?.question).toMatch(/Security Friend/);
    expect(evidence[0]?.answer).toMatch(/Warnings:/);
    expect(evidence[0]?.confidence).toMatch(/high confidence/);
    expect(evidence[0]?.sourceNote).toMatch(/Structured conversation outcome/);
  });
});
