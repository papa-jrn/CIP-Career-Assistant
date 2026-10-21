import { describe, expect, it } from "vitest";
import { buildDeterministicSourceAnalysis } from "./source-analysis";
import { scoreContact } from "./network-intelligence";

/**
 * The app used to be tuned to one person. These pin the behaviour that replaced
 * the founder-specific heuristics, so a stranger gets the same treatment he did.
 *
 * Each case contrasts the founder's own answers with someone else's: a nurse, a
 * different university, a different service club. Before the de-founder pass the
 * first would be handled and the second ignored.
 */

describe("inferring a role from a source needs corroboration, not a hometown", () => {
  const snapshot = (title: string, text: string) => ({
    url: "https://example.org/about",
    sourceType: "website" as const,
    title,
    fetched: true,
    text,
  });

  it("claims a role only when the user's context and the source agree on it", () => {
    const result = buildDeterministicSourceAnalysis(
      snapshot("About", "Sam Rivera is the clinical operations manager at the hospital.") as never,
      { intake: { resume_text: "Clinical operations manager since 2021." } },
    );
    expect(result.likelyUserRole.toLowerCase()).toContain("manager");
  });

  it("does not claim a role the source never mentions", () => {
    const result = buildDeterministicSourceAnalysis(
      snapshot("About", "A page about unrelated community events.") as never,
      { intake: { resume_text: "Worked as a clinical operations manager." } },
    );
    expect(result.likelyUserRole).toBe("Needs user confirmation");
  });

  it("works for a town that is not the founder's", () => {
    // "claremont" used to be required for any role inference at all.
    const result = buildDeterministicSourceAnalysis(
      snapshot("About", "executive director of the brattleboro food shelf.") as never,
      { intake: { resume_text: "Executive Director, food security nonprofit." } },
    );
    expect(result.likelyUserRole.toLowerCase()).toContain("executive director");
  });
});

describe("relationship scoring recognises anyone's groups and notes", () => {
  const contact = (notes: string) => ({
    name: "Jordan Lee",
    company: "Regional Hospital",
    title: "Director of Nursing",
    profileUrl: "",
    email: "",
    connectedOn: "",
    source: "Structured warm connections",
    notes,
  });

  it("names a service club that is not Rotary", () => {
    const scored = scoreContact(contact("We served on the Kiwanis board together for three years."), { intake: null, latestAnalysis: null, employers: [], careerLanes: [] });
    expect(scored.matchReasons.join(" ")).toMatch(/service club|board affiliation/i);
  });

  it("still names a business networking group", () => {
    const scored = scoreContact(contact("Met through BNI chapter meetings over several years."), { intake: null, latestAnalysis: null, employers: [], careerLanes: [] });
    expect(scored.matchReasons.join(" ")).toMatch(/business networking group/i);
  });

  it("credits the user's own substantive notes, not a list of one person's employers", () => {
    const scored = scoreContact(
      contact("We ran the winter shelter intake together and she trained the volunteer coordinators."),
      { intake: null, latestAnalysis: null, employers: [], careerLanes: [] },
    );
    expect(scored.matchReasons.join(" ")).toMatch(/your own notes/i);
  });

  it("does not credit an empty or throwaway note", () => {
    const scored = scoreContact(contact("ok"), { intake: null, latestAnalysis: null, employers: [], careerLanes: [] });
    expect(scored.matchReasons.join(" ")).not.toMatch(/your own notes/i);
  });
});
