import type { ConversationOutcome } from "./conversation-outcomes";

/**
 * Closing out a follow-up the user promised someone.
 *
 * An obligation is derived from a conversation: if an outcome records a
 * promised follow-up, a due date or a next action, the user owes that person
 * something. Nothing ever said it was done, so every promise stayed an
 * obligation indefinitely and old ones kept resurfacing in briefings with no
 * way to clear them - section 8 of the Workbench Redesign Plan.
 *
 * Resolution is recorded as its own additive record, like contact corrections
 * and conversation removals: the conversation is never altered, a mistake can
 * be reopened, and the history of what was promised survives.
 *
 * Resolving is not the same as removing the conversation. The conversation
 * stays as evidence and keeps scoring lanes and employers; only the debt is
 * closed.
 */
export const FOLLOW_UP_RESOLUTION_SOURCE_TYPE = "follow_up_resolution";

export type FollowUpResolutionState = "met" | "dropped" | "open";

export type FollowUpResolution = {
  /** Identifies the obligation, via the conversation that created it. */
  key: string;
  state: FollowUpResolutionState;
  note?: string;
  recordedAt: string;
};

export function followUpResolutionPayload(resolution: FollowUpResolution) {
  return { followUpResolution: resolution };
}

/**
 * A stable identity for the obligation a conversation created.
 *
 * `sourceRef` is the id a save assigns. Records older than it fall back to what
 * was actually promised, so two different promises to one person on one day
 * stay two obligations rather than collapsing into one.
 */
export function obligationKey(outcome: ConversationOutcome): string {
  const ref = (outcome.sourceRef ?? "").trim().toLowerCase();
  if (ref) return `ref:${ref}`;
  // Each part is bounded: the key travels through a form field and the endpoint
  // caps its length, and a long promise would otherwise produce a key too long
  // to submit - closing the follow-up would fail with nothing explaining why.
  const part = (value: string) => (value ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
  return [
    "promise",
    part(outcome.contactName),
    part(outcome.conversationDate),
    part(outcome.promisedFollowUp),
    part(outcome.followUpDueDate),
    part(outcome.nextAction),
  ]
    .join("|")
    .toLowerCase();
}

export function parseFollowUpResolution(value: string | null, createdAt: string): FollowUpResolution | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    const record = parsed?.followUpResolution;
    const key = typeof record?.key === "string" ? record.key.trim() : "";
    if (!key) return null;
    const state = record?.state;
    return {
      key,
      // An unrecognised state leaves the obligation open. Failing toward "still
      // owed" is safer than silently telling someone a promise was kept.
      state: state === "met" || state === "dropped" ? state : "open",
      note: typeof record?.note === "string" && record.note.trim() ? record.note.trim() : undefined,
      recordedAt: typeof record?.recordedAt === "string" && record.recordedAt.trim() ? record.recordedAt.trim() : createdAt,
    };
  } catch {
    return null;
  }
}

/**
 * The current state of each obligation.
 *
 * Records arrive newest-first, so the first seen for a key is the one in force:
 * reopening after closing wins, and nothing is deleted.
 */
export function currentFollowUpResolutions(resolutions: FollowUpResolution[]): Map<string, FollowUpResolution> {
  const byKey = new Map<string, FollowUpResolution>();
  for (const resolution of resolutions) {
    if (!byKey.has(resolution.key)) byKey.set(resolution.key, resolution);
  }
  return byKey;
}

/** Whether this conversation's obligation has been closed out. */
export function isObligationResolved(outcome: ConversationOutcome, state: Map<string, FollowUpResolution>): boolean {
  const resolution = state.get(obligationKey(outcome));
  return resolution?.state === "met" || resolution?.state === "dropped";
}

/** Load this user's follow-up resolutions, newest first. */
export async function loadFollowUpResolutions(
  supabase: { from: (table: string) => any },
  userId: string,
): Promise<FollowUpResolution[]> {
  const { data } = await supabase
    .from("career_sources")
    .select("extracted_text, created_at")
    .eq("user_id", userId)
    .eq("source_type", FOLLOW_UP_RESOLUTION_SOURCE_TYPE)
    .order("created_at", { ascending: false })
    .limit(400);
  return ((data ?? []) as Array<{ extracted_text: string | null; created_at: string }>)
    .map((row) => parseFollowUpResolution(row.extracted_text, row.created_at))
    .filter(Boolean) as FollowUpResolution[];
}
