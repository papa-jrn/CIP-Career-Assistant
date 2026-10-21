import { describe, expect, it } from "vitest";
import { buildConversationOutcome, conversationOutcomeCareerSourcePayload } from "./conversation-outcomes";
import {
  applyContactCorrections,
  applyCorrectionsBySourceRef,
  applyCorrectionToPayload,
  correctionsBySourceRef,
  conversationRecency,
  sortByConversationRecency,
  contactCorrectionPayload,
  hasUnknownContact,
  parseContactCorrection,
  type ContactCorrection,
} from "./conversation-corrections";

function conversation(id: string, contactName: string, extra = {}) {
  return { id, outcome: buildConversationOutcome({ contactName, ...extra }) };
}

function correction(extra: Partial<ContactCorrection> = {}): ContactCorrection {
  return { targetId: "row-1", contactName: "Vince Berk", correctedAt: "2026-10-21T10:00:00.000Z", ...extra };
}

describe("hasUnknownContact", () => {
  it("flags the placeholder extraction writes when it finds no name", () => {
    expect(hasUnknownContact(buildConversationOutcome({ contactName: "Unknown contact" }))).toBe(true);
    expect(hasUnknownContact(buildConversationOutcome({}))).toBe(true);
  });

  it("flags a filename that fell through as if it were a person", () => {
    expect(hasUnknownContact(buildConversationOutcome({ contactName: "Notes with Vince Berk.docx" }))).toBe(true);
    expect(hasUnknownContact(buildConversationOutcome({ contactName: "call-summary.TXT" }))).toBe(true);
  });

  it("accepts a real name", () => {
    expect(hasUnknownContact(buildConversationOutcome({ contactName: "Vince Berk" }))).toBe(false);
  });
});

describe("parseContactCorrection", () => {
  it("reads a stored correction", () => {
    const stored = JSON.stringify(contactCorrectionPayload(correction({ contactOrganization: "Quine" })));
    const parsed = parseContactCorrection(stored, "2026-10-21T11:00:00.000Z");
    expect(parsed).toMatchObject({ targetId: "row-1", contactName: "Vince Berk", contactOrganization: "Quine" });
  });

  it("falls back to the row's created_at when the payload has no timestamp", () => {
    const stored = JSON.stringify({ correction: { targetId: "row-1", contactName: "Vince Berk" } });
    expect(parseContactCorrection(stored, "2026-10-21T11:00:00.000Z")?.correctedAt).toBe("2026-10-21T11:00:00.000Z");
  });

  it("rejects records that cannot identify a conversation or a person", () => {
    expect(parseContactCorrection(null, "now")).toBeNull();
    expect(parseContactCorrection("not json", "now")).toBeNull();
    expect(parseContactCorrection(JSON.stringify({ correction: { targetId: "row-1" } }), "now")).toBeNull();
    expect(parseContactCorrection(JSON.stringify({ correction: { contactName: "Vince Berk" } }), "now")).toBeNull();
    expect(parseContactCorrection(JSON.stringify({ correction: { targetId: " ", contactName: " " } }), "now")).toBeNull();
  });
});

describe("applyContactCorrections", () => {
  it("replaces the name on the conversation that was corrected", () => {
    const [corrected] = applyContactCorrections([conversation("row-1", "Unknown contact")], [correction()]);
    expect(corrected.outcome.contactName).toBe("Vince Berk");
    expect(corrected.correctedAt).toBe("2026-10-21T10:00:00.000Z");
  });

  it("keeps what extraction originally recorded, so the correction is auditable", () => {
    const [corrected] = applyContactCorrections([conversation("row-1", "Unknown contact")], [correction()]);
    expect(corrected.extractedContactName).toBe("Unknown contact");
  });

  it("leaves other conversations untouched", () => {
    const corrected = applyContactCorrections(
      [conversation("row-1", "Unknown contact"), conversation("row-2", "Alex Herzog")],
      [correction()],
    );
    expect(corrected[1].outcome.contactName).toBe("Alex Herzog");
    expect(corrected[1].correctedAt).toBeUndefined();
  });

  it("does not erase an organization or title the correction did not mention", () => {
    const stored = conversation("row-1", "Unknown contact", { contactOrganization: "Quine", contactTitle: "CTO" });
    const [corrected] = applyContactCorrections([stored], [correction()]);
    expect(corrected.outcome.contactOrganization).toBe("Quine");
    expect(corrected.outcome.contactTitle).toBe("CTO");
  });

  it("applies an organization when the correction supplies one", () => {
    const stored = conversation("row-1", "Unknown contact", { contactOrganization: "Quine" });
    const [corrected] = applyContactCorrections([stored], [correction({ contactOrganization: "Hypertherm" })]);
    expect(corrected.outcome.contactOrganization).toBe("Hypertherm");
  });

  it("lets a later correction supersede an earlier one without deleting it", () => {
    // Corrections arrive newest-first, as the career_sources query returns them.
    const corrections = [
      correction({ contactName: "Vince Berk", correctedAt: "2026-10-21T12:00:00.000Z" }),
      correction({ contactName: "Vincent Burke", correctedAt: "2026-10-20T09:00:00.000Z" }),
    ];
    const [corrected] = applyContactCorrections([conversation("row-1", "Unknown contact")], corrections);
    expect(corrected.outcome.contactName).toBe("Vince Berk");
  });

  it("returns conversations unchanged when there are no corrections", () => {
    const corrected = applyContactCorrections([conversation("row-1", "Alex Herzog")], []);
    expect(corrected[0].outcome.contactName).toBe("Alex Herzog");
    expect(corrected[0].correctedAt).toBeUndefined();
  });

  it("ignores a correction that points at a conversation that is not loaded", () => {
    const corrected = applyContactCorrections([conversation("row-1", "Alex Herzog")], [correction({ targetId: "row-9" })]);
    expect(corrected[0].outcome.contactName).toBe("Alex Herzog");
  });
});

describe("reaching every consumer of a conversation", () => {
  const REF = "loopback:notes:2026-09-14T10:00:00.000Z:0";

  function correctedPair() {
    const stored = { id: "row-1", outcome: buildConversationOutcome({ contactName: "Unknown contact", sourceRef: REF }) };
    return applyContactCorrections([stored], [correction({ contactOrganization: "Quine" })]);
  }

  it("keys a correction by the sourceRef the two stores share", () => {
    const byRef = correctionsBySourceRef(correctedPair());
    // Keys are lowercased so a sourceRef differing only in case still matches.
    expect(byRef.get(REF.toLowerCase())?.contactName).toBe("Vince Berk");
  });

  it("matches a sourceRef that differs only in case", () => {
    const shouty = buildConversationOutcome({ contactName: "Unknown contact", sourceRef: REF.toUpperCase() });
    const [corrected] = applyCorrectionsBySourceRef([shouty], correctionsBySourceRef(correctedPair()));
    expect(corrected.contactName).toBe("Vince Berk");
  });

  it("ignores conversations nobody corrected", () => {
    const untouched = [{ id: "row-9", outcome: buildConversationOutcome({ contactName: "Alex Herzog", sourceRef: "ref-9" }) }];
    expect(correctionsBySourceRef(untouched).size).toBe(0);
  });

  it("corrects the structured-table copy, which is the one dedupe keeps", () => {
    // Propagation reads both stores and keeps the structured copy. Without
    // this the user's correction would be discarded by dedupe.
    const fromTable = buildConversationOutcome({ contactName: "Unknown contact", sourceRef: REF });
    const [corrected] = applyCorrectionsBySourceRef([fromTable], correctionsBySourceRef(correctedPair()));
    expect(corrected.contactName).toBe("Vince Berk");
    expect(corrected.contactOrganization).toBe("Quine");
  });

  it("leaves outcomes with no matching sourceRef alone", () => {
    const other = buildConversationOutcome({ contactName: "Alex Herzog", sourceRef: "a-different-ref" });
    const [unchanged] = applyCorrectionsBySourceRef([other], correctionsBySourceRef(correctedPair()));
    expect(unchanged.contactName).toBe("Alex Herzog");
  });

  it("rewrites the payload a text reader sees, so re-analysis is told the right person", () => {
    const payload = conversationOutcomeCareerSourcePayload(
      buildConversationOutcome({ contactName: "Unknown contact", sourceRef: REF, marketSignal: "Large tech is contracting." }),
    );
    expect(payload.fileName).toContain("Unknown contact");

    const rewritten = applyCorrectionToPayload(JSON.stringify(payload), correction());
    const parsed = JSON.parse(rewritten as string);
    expect(parsed.fileName).toBe("Structured conversation with Vince Berk");
    expect(parsed.structured_outcome.contactName).toBe("Vince Berk");
    // The conversation itself is untouched; only who it is attributed to changes.
    expect(parsed.structured_outcome.marketSignal).toBe("Large tech is contracting.");
  });

  it("returns the payload untouched without a correction, and survives bad input", () => {
    expect(applyCorrectionToPayload('{"fileName":"x"}', undefined)).toBe('{"fileName":"x"}');
    expect(applyCorrectionToPayload("not json", correction())).toBe("not json");
    expect(applyCorrectionToPayload(null, correction())).toBeNull();
  });
});

describe("ordering by when the conversation happened", () => {
  const item = (contactName: string, extra = {}) => ({
    id: contactName,
    outcome: buildConversationOutcome({ contactName, ...extra }),
  });

  it("puts an older conversation below a newer one, whenever each was entered", () => {
    // Eric Kidd's June conversation was entered months later; it still belongs
    // under a conversation that actually happened in July.
    const eric = item("Eric Kidd", { conversationDate: "2026-06-12", createdAt: "2026-10-21T12:00:00.000Z" });
    const vince = item("Vince Berk", { conversationDate: "2026-07-30", createdAt: "2026-08-06T12:00:00.000Z" });
    expect(sortByConversationRecency([eric, vince]).map((i) => i.id)).toEqual(["Vince Berk", "Eric Kidd"]);
  });

  it("does not depend on the order it was given", () => {
    const eric = item("Eric Kidd", { conversationDate: "2026-06-12" });
    const vince = item("Vince Berk", { conversationDate: "2026-07-30" });
    expect(sortByConversationRecency([vince, eric]).map((i) => i.id)).toEqual(["Vince Berk", "Eric Kidd"]);
  });

  it("falls back to when it was saved if no conversation date was captured", () => {
    // buildConversationOutcome defaults an empty date to today, so a record
    // with no conversation date can only arrive from storage. Blank it here to
    // exercise that path.
    const outcome = {
      ...buildConversationOutcome({ contactName: "No date", createdAt: "2026-05-01T12:00:00.000Z" }),
      conversationDate: "",
    };
    expect(conversationRecency(outcome)).toBe(new Date("2026-05-01T12:00:00.000Z").getTime());
  });

  it("prefers the conversation date over the save date", () => {
    const outcome = buildConversationOutcome({ contactName: "Eric Kidd", conversationDate: "2026-06-12", createdAt: "2026-10-21T12:00:00.000Z" });
    expect(conversationRecency(outcome)).toBe(new Date("2026-06-12T00:00:00").getTime());
  });

  it("does not throw on an unusable date", () => {
    const outcome = {
      ...buildConversationOutcome({ contactName: "Odd" }),
      conversationDate: "not a date",
      createdAt: "also not a date",
    };
    expect(Number.isNaN(conversationRecency(outcome))).toBe(false);
    expect(conversationRecency(outcome)).toBe(0);
  });

  it("leaves the caller's array alone", () => {
    const given = [item("Eric Kidd", { conversationDate: "2026-06-12" }), item("Vince Berk", { conversationDate: "2026-07-30" })];
    sortByConversationRecency(given);
    expect(given.map((i) => i.id)).toEqual(["Eric Kidd", "Vince Berk"]);
  });
});
