import { feedbackHasConversationContent, needsNudge, type BucketFeedback, type BucketPerson } from "./follow-up-buckets";
import { outcomeHasLoggedConversation } from "./follow-up-buckets";

/**
 * What a person's row says before you open it.
 *
 * Section 12 of the Workbench Redesign Plan asks for name, organization, a
 * truthful status, the next action, and a due date when there is one. The row
 * previously showed "Last saved: use_now" - the internal name of a triage
 * decision, which tells the reader nothing about where the relationship
 * actually stands.
 *
 * The statuses deliberately distinguish met-but-unlogged from met-and-logged,
 * because that difference is the whole point of the capture prompt, and a
 * status must never imply notes exist when they do not.
 */
export interface PersonRowSummary {
  status: string;
  /** Null when nothing is owed; never invented. */
  nextAction: string | null;
  dueDate: string | null;
  /** Set when the person needs attention now, for emphasis in the row. */
  urgent: boolean;
}

export interface RowObligation {
  contactName: string;
  nextAction: string;
  followUpDueDate: string;
}

function hasLoggedConversation(person: BucketPerson): boolean {
  if (feedbackHasConversationContent(person.latestFeedback)) return true;
  return (person.conversationOutcomes ?? []).some(outcomeHasLoggedConversation);
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function summarizePersonRow(
  person: BucketPerson & { contact?: { name?: string } },
  obligations: RowObligation[],
  today: string,
): PersonRowSummary {
  const saved: BucketFeedback | undefined = person.latestFeedback;
  const name = normalize(person.contact?.name ?? "");
  const owed = obligations.find((item) => normalize(item.contactName) === name && name.length > 0);

  const dueDate = saved?.followUpDate || owed?.followUpDueDate || null;
  const nextAction = owed?.nextAction || saved?.nextAction || null;

  if (needsNudge(saved, today)) {
    return { status: `Follow-up overdue since ${saved?.followUpDate}`, nextAction, dueDate, urgent: true };
  }

  const conversationStatus = saved?.conversationStatus ?? "";
  if (conversationStatus === "Met") {
    return hasLoggedConversation(person)
      ? { status: "Met, notes captured", nextAction, dueDate, urgent: false }
      : { status: "Met, notes not captured yet", nextAction, dueDate, urgent: true };
  }

  if (conversationStatus) {
    return { status: conversationStatus, nextAction, dueDate, urgent: false };
  }

  // No status has ever been set. Say that plainly rather than inferring one.
  return { status: "Not contacted yet", nextAction, dueDate, urgent: false };
}

/** The text a person row is searched against. */
export function personSearchText(person: { contact?: { name?: string; company?: string; title?: string; notes?: string } }): string {
  const contact = person.contact ?? {};
  return [contact.name, contact.company, contact.title, contact.notes].filter(Boolean).join(" ").toLowerCase();
}
