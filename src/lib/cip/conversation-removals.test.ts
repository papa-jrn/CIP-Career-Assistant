import { describe, expect, it } from "vitest";
import { buildConversationOutcome } from "./conversation-outcomes";
import {
  conversationRemovalPayload,
  currentRemovals,
  parseConversationRemoval,
  partitionRemovedConversations,
  removedSourceRefs,
  withoutRemovedOutcomes,
  type ConversationRemoval,
} from "./conversation-removals";

function removal(extra: Partial<ConversationRemoval> = {}): ConversationRemoval {
  return { targetId: "row-1", removed: true, recordedAt: "2026-10-21T12:00:00.000Z", ...extra };
}

function conversation(id: string, extra = {}) {
  return { id, outcome: buildConversationOutcome({ contactName: "Eric Kidd", ...extra }) };
}

describe("parseConversationRemoval", () => {
  it("reads a stored removal", () => {
    const stored = JSON.stringify(conversationRemovalPayload(removal({ reason: "Duplicate of the June note" })));
    expect(parseConversationRemoval(stored, "now")).toMatchObject({
      targetId: "row-1",
      removed: true,
      reason: "Duplicate of the June note",
    });
  });

  it("reads a restore", () => {
    const stored = JSON.stringify(conversationRemovalPayload(removal({ removed: false })));
    expect(parseConversationRemoval(stored, "now")?.removed).toBe(false);
  });

  it("treats anything that is not an explicit restore as a removal", () => {
    // A malformed record should hide the conversation, not resurrect one the
    // user removed.
    const stored = JSON.stringify({ removal: { targetId: "row-1" } });
    expect(parseConversationRemoval(stored, "now")?.removed).toBe(true);
  });

  it("rejects records that name no conversation", () => {
    expect(parseConversationRemoval(null, "now")).toBeNull();
    expect(parseConversationRemoval("not json", "now")).toBeNull();
    expect(parseConversationRemoval(JSON.stringify({ removal: { targetId: "  " } }), "now")).toBeNull();
  });

  it("falls back to the row's created_at when the payload has no timestamp", () => {
    const stored = JSON.stringify({ removal: { targetId: "row-1", removed: true } });
    expect(parseConversationRemoval(stored, "2026-10-21T09:00:00.000Z")?.recordedAt).toBe("2026-10-21T09:00:00.000Z");
  });
});

describe("currentRemovals", () => {
  it("lets a restore supersede an earlier removal", () => {
    // Newest first, as the query returns them.
    const state = currentRemovals([
      removal({ removed: false, recordedAt: "2026-10-21T13:00:00.000Z" }),
      removal({ removed: true, recordedAt: "2026-10-21T12:00:00.000Z" }),
    ]);
    expect(state.get("row-1")?.removed).toBe(false);
  });

  it("lets a later removal supersede an earlier restore", () => {
    const state = currentRemovals([
      removal({ removed: true, recordedAt: "2026-10-21T14:00:00.000Z" }),
      removal({ removed: false, recordedAt: "2026-10-21T13:00:00.000Z" }),
    ]);
    expect(state.get("row-1")?.removed).toBe(true);
  });
});

describe("partitionRemovedConversations", () => {
  it("keeps a removed conversation out of the active list but does not lose it", () => {
    const kept = conversation("row-2");
    const dropped = conversation("row-1");
    const { active, removed } = partitionRemovedConversations([kept, dropped], [removal()]);
    expect(active.map((c) => c.id)).toEqual(["row-2"]);
    expect(removed.map((c) => c.id)).toEqual(["row-1"]);
  });

  it("returns everything active when nothing was removed", () => {
    const { active, removed } = partitionRemovedConversations([conversation("row-1")], []);
    expect(active).toHaveLength(1);
    expect(removed).toHaveLength(0);
  });

  it("puts a restored conversation back", () => {
    const { active } = partitionRemovedConversations(
      [conversation("row-1")],
      [removal({ removed: false, recordedAt: "2026-10-21T13:00:00.000Z" }), removal()],
    );
    expect(active).toHaveLength(1);
  });
});

describe("removing the structured copy too", () => {
  const REF = "loopback:notes:2026-06-15T10:00:00.000Z:0";

  it("stops a removed conversation scoring lanes and employers", () => {
    // Propagation keeps the structured-table copy, which carries no
    // career_sources id, so without this the removal would have no effect there.
    const removedConversations = [conversation("row-1", { sourceRef: REF })];
    const refs = removedSourceRefs(removedConversations);
    const fromStructuredTable = [
      buildConversationOutcome({ contactName: "Eric Kidd", sourceRef: REF }),
      buildConversationOutcome({ contactName: "Alex Herzog", sourceRef: "another-ref" }),
    ];
    expect(withoutRemovedOutcomes(fromStructuredTable, refs).map((o) => o.contactName)).toEqual(["Alex Herzog"]);
  });

  it("matches a sourceRef differing only in case", () => {
    const refs = removedSourceRefs([conversation("row-1", { sourceRef: REF.toUpperCase() })]);
    const outcomes = [buildConversationOutcome({ contactName: "Eric Kidd", sourceRef: REF })];
    expect(withoutRemovedOutcomes(outcomes, refs)).toHaveLength(0);
  });

  it("ignores conversations with no sourceRef rather than dropping everything", () => {
    // Older records have no sourceRef; an empty ref must not match them all.
    const refs = removedSourceRefs([conversation("row-1")]);
    expect(refs.size).toBe(0);
    const outcomes = [buildConversationOutcome({ contactName: "Eric Kidd" })];
    expect(withoutRemovedOutcomes(outcomes, refs)).toHaveLength(1);
  });
});
