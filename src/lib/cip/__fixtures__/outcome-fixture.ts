import { buildConversationOutcome, type ConversationOutcome } from "@/lib/cip/conversation-outcomes";

/** A conversation outcome for tests: invented people and organizations only. */
export function buildOutcome(over: Partial<ConversationOutcome> = {}): ConversationOutcome {
  return buildConversationOutcome({
    contactName: "Dana Reyes",
    conversationDate: "2026-09-12",
    signalType: "hiring_process",
    signalDirection: "strengthens",
    confidence: "medium",
    ...over,
  });
}
