import type { ConversationOutcome } from "./conversation-outcomes";
import type { CorrectedConversation, StoredConversation } from "./conversation-corrections";

/**
 * Removing a saved conversation that is no longer valid.
 *
 * Conversations are additive, which is right: a record of what someone was told
 * should not quietly disappear. But a user can end up with two records of one
 * conversation - a June note recovered after being orphaned, and a re-entry of
 * the same conversation - and needs a way to stop one of them counting.
 *
 * Removal is recorded as its own additive record rather than deleting the
 * conversation, for the same reason corrections are: the original stays
 * auditable, and removing the wrong half of a duplicate pair is undoable. A
 * removed conversation stops counting everywhere a conversation is read, and
 * the UI says it is still in the records rather than implying it was erased.
 */
export const CONVERSATION_REMOVAL_SOURCE_TYPE = "conversation_removed";

export type ConversationRemoval = {
  /** The career_sources row id of the conversation being removed. */
  targetId: string;
  /** false restores a conversation removed earlier. */
  removed: boolean;
  reason?: string;
  recordedAt: string;
};

export function conversationRemovalPayload(removal: ConversationRemoval) {
  return { removal };
}

export function parseConversationRemoval(value: string | null, createdAt: string): ConversationRemoval | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    const record = parsed?.removal;
    const targetId = typeof record?.targetId === "string" ? record.targetId.trim() : "";
    if (!targetId) return null;
    return {
      targetId,
      // Anything that is not an explicit restore is a removal, so a malformed
      // record fails toward hiding rather than toward silently resurrecting.
      removed: record?.removed !== false,
      reason: typeof record?.reason === "string" && record.reason.trim() ? record.reason.trim() : undefined,
      recordedAt: typeof record?.recordedAt === "string" && record.recordedAt.trim() ? record.recordedAt.trim() : createdAt,
    };
  } catch {
    return null;
  }
}

/**
 * The current removal state per conversation.
 *
 * Records arrive newest-first, as the career_sources queries return them, so
 * the first one seen for a conversation is the one in force: a restore after a
 * removal wins, and neither record is deleted.
 */
export function currentRemovals(removals: ConversationRemoval[]): Map<string, ConversationRemoval> {
  const byTarget = new Map<string, ConversationRemoval>();
  for (const removal of removals) {
    if (!byTarget.has(removal.targetId)) byTarget.set(removal.targetId, removal);
  }
  return byTarget;
}

export type PartitionedConversations<T> = { active: T[]; removed: T[] };

/** Split conversations into those still counting and those the user removed. */
export function partitionRemovedConversations<T extends StoredConversation | CorrectedConversation>(
  conversations: T[],
  removals: ConversationRemoval[],
): PartitionedConversations<T> {
  const state = currentRemovals(removals);
  const active: T[] = [];
  const removed: T[] = [];
  for (const conversation of conversations) {
    if (state.get(conversation.id)?.removed) removed.push(conversation);
    else active.push(conversation);
  }
  return { active, removed };
}

/**
 * The `sourceRef`s of removed conversations.
 *
 * A removal names a career_sources row, but the same conversation also lives in
 * the `conversation_outcomes` table, which has no such id. Propagation reads
 * both and keeps the structured copy, so without this a removed conversation
 * would keep scoring lanes and employers.
 */
export function removedSourceRefs<T extends StoredConversation | CorrectedConversation>(removed: T[]): Set<string> {
  const refs = new Set<string>();
  for (const conversation of removed) {
    const ref = (conversation.outcome.sourceRef ?? "").trim().toLowerCase();
    if (ref) refs.add(ref);
  }
  return refs;
}

/** Drop outcomes identified only by `sourceRef` that the user has removed. */
export function withoutRemovedOutcomes(outcomes: ConversationOutcome[], refs: Set<string>): ConversationOutcome[] {
  if (!refs.size) return outcomes;
  return outcomes.filter((outcome) => !refs.has((outcome.sourceRef ?? "").trim().toLowerCase()));
}

/** Load this user's removal records, newest first. */
export async function loadConversationRemovals(
  supabase: { from: (table: string) => any },
  userId: string,
): Promise<ConversationRemoval[]> {
  const { data } = await supabase
    .from("career_sources")
    .select("extracted_text, created_at")
    .eq("user_id", userId)
    .eq("source_type", CONVERSATION_REMOVAL_SOURCE_TYPE)
    .order("created_at", { ascending: false })
    .limit(300);
  return ((data ?? []) as Array<{ extracted_text: string | null; created_at: string }>)
    .map((row) => parseConversationRemoval(row.extracted_text, row.created_at))
    .filter(Boolean) as ConversationRemoval[];
}
