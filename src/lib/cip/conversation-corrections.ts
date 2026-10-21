import type { ConversationOutcome } from "./conversation-outcomes";

/**
 * User corrections to the contact on a saved conversation.
 *
 * Extraction gets the person wrong or misses them entirely - a note opening
 * "Notes with Vince Berk" was stored as "Unknown contact", which orphaned the
 * conversation from that person's follow-up card. The user is the authority on
 * who they spoke to, so they can say so.
 *
 * Corrections are stored as their own additive records and applied when the
 * conversation is read, rather than overwriting the saved outcome. The original
 * extraction stays on the record, so what the system derived and what the user
 * corrected remain distinguishable.
 */
export const CONTACT_CORRECTION_SOURCE_TYPE = "conversation_contact_correction";

export type ContactCorrection = {
  /** The career_sources row id of the conversation being corrected. */
  targetId: string;
  contactName: string;
  contactOrganization?: string;
  contactTitle?: string;
  correctedAt: string;
};

export type StoredConversation = {
  id: string;
  outcome: ConversationOutcome;
};

export type CorrectedConversation = StoredConversation & {
  /** Set when the user corrected this contact; drives the visible label. */
  correctedAt?: string;
  /** What extraction originally recorded, kept so the correction is auditable. */
  extractedContactName?: string;
};

export function contactCorrectionPayload(correction: ContactCorrection) {
  return { correction };
}

export function parseContactCorrection(value: string | null, createdAt: string): ContactCorrection | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    const record = parsed?.correction;
    const targetId = textValue(record?.targetId);
    const contactName = textValue(record?.contactName);
    if (!targetId || !contactName) return null;
    return {
      targetId,
      contactName,
      contactOrganization: textValue(record?.contactOrganization) || undefined,
      contactTitle: textValue(record?.contactTitle) || undefined,
      correctedAt: textValue(record?.correctedAt) || createdAt,
    };
  } catch {
    return null;
  }
}

/**
 * Apply the newest correction for each conversation.
 *
 * Corrections are expected newest-first, as the career_sources queries return
 * them; the first one seen for a conversation is the one that stands, so a
 * later correction supersedes an earlier one without deleting it.
 */
export function applyContactCorrections(
  conversations: StoredConversation[],
  corrections: ContactCorrection[],
): CorrectedConversation[] {
  const newestByTarget = new Map<string, ContactCorrection>();
  for (const correction of corrections) {
    if (!newestByTarget.has(correction.targetId)) newestByTarget.set(correction.targetId, correction);
  }

  return conversations.map((conversation) => {
    const correction = newestByTarget.get(conversation.id);
    if (!correction) return conversation;

    return {
      id: conversation.id,
      correctedAt: correction.correctedAt,
      extractedContactName: conversation.outcome.contactName,
      outcome: {
        ...conversation.outcome,
        contactName: correction.contactName,
        // An omitted field leaves what was already recorded alone, so a name-only
        // correction does not silently erase an organization or title.
        contactOrganization: correction.contactOrganization ?? conversation.outcome.contactOrganization,
        contactTitle: correction.contactTitle ?? conversation.outcome.contactTitle,
      },
    };
  });
}

/**
 * Whether extraction failed to identify who this conversation was with, so the
 * card can ask for the name instead of presenting a placeholder as a person.
 */
export function hasUnknownContact(outcome: ConversationOutcome) {
  const name = outcome.contactName.trim();
  if (!name || name === "Unknown contact") return true;
  // Falling back to the note's filename yields things like
  // "Notes with Vince Berk.docx", which is a file, not a person.
  return /\.(docx|txt|md|rtf|json|pdf)$/i.test(name);
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
