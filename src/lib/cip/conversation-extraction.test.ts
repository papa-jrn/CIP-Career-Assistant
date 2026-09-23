import { describe, it, expect } from "vitest";
import { extractConversationFields, mergeExtractedFields } from "@/lib/cip/conversation-extraction";

const dhNote =
  "Talked to my friend at Dartmouth Hitchcock. They just cut over 400 positions this past week, mostly in healthcare admin. It's a big deal for the whole Upper Valley.";

describe("conversation extraction — heuristic fallback (no API key)", () => {
  it("links a known watched employer even when the note uses a different name form", async () => {
    const result = await extractConversationFields(dhNote, {
      watchedEmployers: ["Dartmouth Health"],
      targetLanes: ["Program Operations Lead"],
    });
    // No key passed → deterministic heuristic path.
    expect(result.mode).toBe("heuristic");
    expect(result.fields.relatedEmployer).toBe("Dartmouth Health");
  });

  it("reads a layoff as a weakening signal", async () => {
    const result = await extractConversationFields(dhNote, { watchedEmployers: ["Dartmouth Health"] });
    expect(result.fields.signalDirection).toBe("weakens");
    expect(result.fields.signalType).toBe("hiring_process");
  });

  it("does not guess a direction when the note has no hiring/layoff cue", async () => {
    const result = await extractConversationFields(
      "Had a nice coffee with Sarah about the Upper Valley in general.",
      { watchedEmployers: ["Dartmouth Health"] },
    );
    expect(result.fields.signalDirection).toBeUndefined();
  });

  it("returns nothing for a too-short note", async () => {
    const result = await extractConversationFields("hi", { watchedEmployers: ["Dartmouth Health"] });
    expect(result.mode).toBe("none");
    expect(Object.keys(result.fields)).toHaveLength(0);
  });
});

describe("conversation extraction — user override", () => {
  it("user-entered fields always win over extraction", () => {
    const merged = mergeExtractedFields(
      { relatedEmployer: "My Chosen Employer", signalDirection: "strengthens" },
      { relatedEmployer: "Auto Employer", signalDirection: "weakens", relatedLane: "Auto Lane" },
    );
    expect(merged.relatedEmployer).toBe("My Chosen Employer");
    expect(merged.signalDirection).toBe("strengthens");
    // Extraction still fills what the user left blank.
    expect(merged.relatedLane).toBe("Auto Lane");
  });

  it("ignores blank user fields so they do not erase extraction", () => {
    const merged = mergeExtractedFields(
      { relatedEmployer: "", signalDirection: undefined },
      { relatedEmployer: "Auto Employer", signalDirection: "weakens" },
    );
    expect(merged.relatedEmployer).toBe("Auto Employer");
    expect(merged.signalDirection).toBe("weakens");
  });
});
