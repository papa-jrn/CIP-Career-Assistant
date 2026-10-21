import { describe, expect, it } from "vitest";
import { buildConversationOutcome } from "./conversation-outcomes";
import { buildFollowUpObligations } from "./strategic-state";
import {
  currentFollowUpResolutions,
  followUpResolutionPayload,
  isObligationResolved,
  obligationKey,
  parseFollowUpResolution,
  type FollowUpResolution,
} from "./follow-up-resolutions";

function promise(extra = {}) {
  return buildConversationOutcome({
    contactName: "Christopher Diak",
    conversationDate: "2026-08-01",
    promisedFollowUp: "Send him the summary",
    followUpDueDate: "2026-09-01",
    nextAction: "Send him the summary",
    ...extra,
  });
}

function resolution(extra: Partial<FollowUpResolution> = {}): FollowUpResolution {
  return { key: obligationKey(promise()), state: "met", recordedAt: "2026-10-21T12:00:00.000Z", ...extra };
}

describe("obligationKey", () => {
  it("uses the sourceRef a save assigned", () => {
    expect(obligationKey(promise({ sourceRef: "loopback:notes:1" }))).toBe("ref:loopback:notes:1");
  });

  it("keeps two different promises to one person on one day apart", () => {
    const first = promise({ promisedFollowUp: "Send the summary" });
    const second = promise({ promisedFollowUp: "Introduce him to Dana" });
    expect(obligationKey(first)).not.toBe(obligationKey(second));
  });

  it("is stable for the same promise read twice", () => {
    expect(obligationKey(promise())).toBe(obligationKey(promise()));
  });

  it("stays short enough to submit, even for a very long promise", () => {
    // The key travels through a form field and the endpoint caps its length at
    // 400; an unbounded key would make closing the follow-up fail silently.
    const wordy = promise({ promisedFollowUp: "Send him ".repeat(80), nextAction: "Follow up about ".repeat(60) });
    expect(obligationKey(wordy).length).toBeLessThanOrEqual(400);
  });
});

describe("parseFollowUpResolution", () => {
  it("reads a completed follow-up", () => {
    const stored = JSON.stringify(followUpResolutionPayload(resolution({ note: "Emailed it" })));
    expect(parseFollowUpResolution(stored, "now")).toMatchObject({ state: "met", note: "Emailed it" });
  });

  it("reads a dropped follow-up and a reopened one", () => {
    const dropped = JSON.stringify(followUpResolutionPayload(resolution({ state: "dropped" })));
    expect(parseFollowUpResolution(dropped, "now")?.state).toBe("dropped");
    const reopened = JSON.stringify(followUpResolutionPayload(resolution({ state: "open" })));
    expect(parseFollowUpResolution(reopened, "now")?.state).toBe("open");
  });

  it("leaves an unrecognised state open rather than claiming a promise was kept", () => {
    const stored = JSON.stringify({ followUpResolution: { key: "ref:1", state: "banana" } });
    expect(parseFollowUpResolution(stored, "now")?.state).toBe("open");
  });

  it("rejects records that identify no obligation", () => {
    expect(parseFollowUpResolution(null, "now")).toBeNull();
    expect(parseFollowUpResolution("not json", "now")).toBeNull();
    expect(parseFollowUpResolution(JSON.stringify({ followUpResolution: { state: "met" } }), "now")).toBeNull();
  });
});

describe("currentFollowUpResolutions", () => {
  it("lets reopening supersede a completion", () => {
    // Newest first, as the query returns them.
    const state = currentFollowUpResolutions([
      resolution({ state: "open", recordedAt: "2026-10-21T13:00:00.000Z" }),
      resolution({ state: "met", recordedAt: "2026-10-21T12:00:00.000Z" }),
    ]);
    expect(isObligationResolved(promise(), state)).toBe(false);
  });

  it("treats both met and dropped as closed", () => {
    for (const state of ["met", "dropped"] as const) {
      expect(isObligationResolved(promise(), currentFollowUpResolutions([resolution({ state })]))).toBe(true);
    }
  });
});

describe("buildFollowUpObligations respects resolutions", () => {
  it("still owes a promise nobody has closed", () => {
    expect(buildFollowUpObligations([promise()], [])).toHaveLength(1);
  });

  it("stops owing a promise the user marked met", () => {
    // The section 8 symptom: old obligations resurfacing with no way to clear
    // them. A completed promise is no longer owed.
    expect(buildFollowUpObligations([promise()], [resolution()])).toHaveLength(0);
  });

  it("stops owing a promise the user dropped", () => {
    expect(buildFollowUpObligations([promise()], [resolution({ state: "dropped" })])).toHaveLength(0);
  });

  it("owes it again once reopened", () => {
    const reopened = [resolution({ state: "open", recordedAt: "2026-10-21T13:00:00.000Z" }), resolution()];
    expect(buildFollowUpObligations([promise()], reopened)).toHaveLength(1);
  });

  it("does not close a different promise to the same person", () => {
    const other = promise({ promisedFollowUp: "Introduce him to Dana", nextAction: "Introduce him to Dana" });
    const remaining = buildFollowUpObligations([promise(), other], [resolution()]);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].promisedFollowUp).toBe("Introduce him to Dana");
  });

  it("owes a new promise made after an earlier one was closed", () => {
    // A later conversation creates its own obligation; closing the old promise
    // must not pre-close a new one.
    const later = promise({ conversationDate: "2026-10-20", promisedFollowUp: "Send the new deck", nextAction: "Send the new deck" });
    expect(buildFollowUpObligations([promise(), later], [resolution()])).toHaveLength(1);
  });

  it("carries a key the user interface can act on", () => {
    const [obligation] = buildFollowUpObligations([promise()], []);
    expect(obligation.key).toBe(obligationKey(promise()));
  });
});
