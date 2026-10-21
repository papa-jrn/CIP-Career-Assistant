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

/**
 * Load this user's contact corrections, newest first.
 *
 * Shared so every consumer of a saved conversation sees the same corrections.
 * A correction that only reaches the page it was made on leaves the rest of the
 * app working from a name the user has already told us is wrong.
 */
export async function loadContactCorrections(
  supabase: { from: (table: string) => any },
  userId: string,
): Promise<ContactCorrection[]> {
  const { data } = await supabase
    .from("career_sources")
    .select("extracted_text, created_at")
    .eq("user_id", userId)
    .eq("source_type", CONTACT_CORRECTION_SOURCE_TYPE)
    .order("created_at", { ascending: false })
    .limit(200);
  return ((data ?? []) as Array<{ extracted_text: string | null; created_at: string }>)
    .map((row) => parseContactCorrection(row.extracted_text, row.created_at))
    .filter(Boolean) as ContactCorrection[];
}

/**
 * The corrected contact for each conversation, keyed by the `sourceRef` a save
 * assigned it.
 *
 * Corrections name a `career_sources` row, but the same conversation also lives
 * in the `conversation_outcomes` table, which has no such id. `sourceRef` is
 * what the two copies share, so this is how a correction reaches both.
 */
export function correctionsBySourceRef(conversations: CorrectedConversation[]) {
  const byRef = new Map<string, ContactCorrection>();
  for (const item of conversations) {
    const ref = (item.outcome.sourceRef ?? "").trim().toLowerCase();
    if (!ref || !item.correctedAt) continue;
    byRef.set(ref, {
      targetId: item.id,
      contactName: item.outcome.contactName,
      contactOrganization: item.outcome.contactOrganization || undefined,
      contactTitle: item.outcome.contactTitle || undefined,
      correctedAt: item.correctedAt,
    });
  }
  return byRef;
}

/** Apply corrections to outcomes that are identified only by `sourceRef`. */
export function applyCorrectionsBySourceRef(
  outcomes: ConversationOutcome[],
  byRef: Map<string, ContactCorrection>,
): ConversationOutcome[] {
  if (!byRef.size) return outcomes;
  return outcomes.map((outcome) => {
    const correction = byRef.get((outcome.sourceRef ?? "").trim().toLowerCase());
    if (!correction) return outcome;
    return {
      ...outcome,
      contactName: correction.contactName,
      contactOrganization: correction.contactOrganization ?? outcome.contactOrganization,
      contactTitle: correction.contactTitle ?? outcome.contactTitle,
    };
  });
}

/**
 * Rewrite a stored conversation payload so a text-based reader sees the
 * corrected name.
 *
 * Evidence re-analysis reads the note as text, and the payload's `fileName`
 * carries the contact ("Structured conversation with Unknown contact"), so the
 * advisor is told the wrong person unless this is applied.
 */
export function applyCorrectionToPayload(extractedText: string | null, correction?: ContactCorrection): string | null {
  if (!extractedText || !correction) return extractedText;
  try {
    const parsed = JSON.parse(extractedText);
    if (!parsed || typeof parsed !== "object") return extractedText;
    const nested = parsed.structured_outcome;
    const previousName = typeof nested?.contactName === "string" ? nested.contactName : "";
    if (nested && typeof nested === "object") {
      nested.contactName = correction.contactName;
      if (correction.contactOrganization) nested.contactOrganization = correction.contactOrganization;
      if (correction.contactTitle) nested.contactTitle = correction.contactTitle;
    }
    if (typeof parsed.fileName === "string" && previousName && parsed.fileName.includes(previousName)) {
      parsed.fileName = parsed.fileName.split(previousName).join(correction.contactName);
    }
    return JSON.stringify(parsed);
  } catch {
    return extractedText;
  }
}

/**
 * When a conversation happened, for ordering.
 *
 * The conversation's own date, not when the record was saved - a conversation
 * from June entered today belongs in June. Falls back to the save time only
 * when no conversation date was captured, so a record still sorts somewhere
 * sensible rather than to the bottom.
 */
export function conversationRecency(outcome: ConversationOutcome): number {
  const date = (outcome.conversationDate ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const value = new Date(`${date}T00:00:00`).getTime();
    if (!Number.isNaN(value)) return value;
  }
  const created = (outcome.createdAt ?? "").trim();
  const value = created ? new Date(created).getTime() : Number.NaN;
  return Number.isNaN(value) ? 0 : value;
}

/** Newest conversation first, by when the conversation happened. */
export function sortByConversationRecency<T extends { outcome: ConversationOutcome }>(items: T[]): T[] {
  return [...items].sort((a, b) => conversationRecency(b.outcome) - conversationRecency(a.outcome));
}
