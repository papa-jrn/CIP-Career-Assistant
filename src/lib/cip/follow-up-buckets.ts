import type { ConversationOutcome } from "./conversation-outcomes";

/**
 * Which worklist bucket a person in the follow-up queue belongs to, if any.
 *
 * This lived inside follow-up.astro, where it could not be tested. It had
 * drifted away from the second place conversations are stored: the "Met —
 * capture notes" bucket only ever consulted the `network_feedback` record, so a
 * conversation logged as a `conversation_outcome` never cleared it and the page
 * kept asking the user to write down notes they had already written.
 */
export type FollowUpBucket = "nudge" | "notes" | "week" | "awaiting";

/** The fields of a saved feedback record that bucketing actually depends on. */
export type BucketFeedback = {
  conversationStatus?: string;
  followUpDate?: string;
  marketSignals?: string;
  newLeads?: string;
  laneImpact?: string;
  note?: string;
};

export type BucketPerson = {
  latestFeedback?: BucketFeedback;
  /** Conversations logged against this person through the outcome store. */
  conversationOutcomes?: ConversationOutcome[];
};

// A nudge is moot once the person has been met, parked, or removed.
const NUDGE_DONE = new Set(["Met", "Parked", "Removed"]);

/**
 * A follow-up date that has passed and the person is not yet met or shelved
 * means the user owes them a nudge.
 */
export function needsNudge(feedback: BucketFeedback | undefined, today: string) {
  if (!feedback?.followUpDate) return false;
  if (NUDGE_DONE.has(feedback.conversationStatus ?? "")) return false;
  return feedback.followUpDate < today;
}

/** Conversation substance written into the feedback record itself. */
export function feedbackHasConversationContent(feedback: BucketFeedback | undefined) {
  return Boolean(feedback && (feedback.marketSignals || feedback.newLeads || feedback.laneImpact || feedback.note));
}

/**
 * Whether a conversation outcome records something the user actually learned.
 *
 * Deliberately narrower than `outcomeHasStrategicContent`: a bare related lane
 * or employer is a tag on an otherwise empty record, not a captured
 * conversation, and must not silence the prompt to write one.
 */
export function outcomeHasLoggedConversation(outcome: ConversationOutcome) {
  return Boolean(
    outcome.marketSignal ||
      outcome.compensationSignal ||
      outcome.workModelSignal ||
      outcome.cultureSignal ||
      outcome.hiringSignal ||
      outcome.newLeads ||
      outcome.warnings ||
      outcome.promisedFollowUp ||
      outcome.nextAction ||
      outcome.rawNoteExcerpt,
  );
}

/**
 * Whether this person's conversation has been captured anywhere — in the
 * feedback record or in the conversation-outcome store.
 *
 * Known limitation: any logged conversation with content clears the prompt, so
 * a *subsequent* meeting with someone already logged will not re-raise it.
 * Fixing that needs per-conversation identity rather than a timestamp compare —
 * the two stores are written in either order (a user may log the note before or
 * after setting the status to Met), so ordering cannot distinguish "notes for
 * the new meeting are missing" from "notes were written first". Prompting for
 * notes that demonstrably exist is the worse failure, so this errs toward
 * silence.
 */
export function hasLoggedConversation(person: BucketPerson) {
  if (feedbackHasConversationContent(person.latestFeedback)) return true;
  return (person.conversationOutcomes ?? []).some(outcomeHasLoggedConversation);
}

/**
 * Sort a person into at most one action bucket so the worklist shows who needs
 * attention now, without repeating people across buckets.
 */
export function actionBucket(person: BucketPerson, today: string): FollowUpBucket | null {
  const saved = person.latestFeedback;
  if (needsNudge(saved, today)) return "nudge";
  if (saved?.conversationStatus === "Met" && !hasLoggedConversation(person)) return "notes";
  if (saved?.conversationStatus === "Scheduled" || saved?.conversationStatus === "Intro offered") return "week";
  if (saved?.conversationStatus === "Awaiting reply") return "awaiting";
  return null;
}
