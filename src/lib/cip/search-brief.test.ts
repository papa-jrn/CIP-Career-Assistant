import { describe, expect, it } from "vitest";
import { buildConversationOutcome } from "@/lib/cip/conversation-outcomes";
import {
  assembleSearchBrief,
  parseAnnualFigures,
  preferencesFromIntake,
  toOutboundFacets,
  violatesExclusions,
  type SearchPreferences,
} from "@/lib/cip/search-brief";
import { FIXTURE_NOW, fixtureArea as area, fixtureStrategicState as stateFixture } from "@/lib/cip/__fixtures__/search-fixtures";

function assemble(preferences: SearchPreferences = {}, outcomes: ReturnType<typeof buildConversationOutcome>[] = []) {
  return assembleSearchBrief({
    strategicState: stateFixture(outcomes),
    conversationOutcomes: outcomes,
    preferences,
    now: FIXTURE_NOW,
  });
}

describe("assembleSearchBrief", () => {
  it("builds ranked lanes with weights and vocabulary from strategic state", () => {
    const brief = assemble();
    expect(brief.schemaVersion).toBe(1);
    expect(brief.lanes.map((lane) => lane.roleTitle)).toEqual(["Program Operations Lead", "Communications Manager"]);
    expect(brief.lanes[0].weight).toBe("primary");
    expect(brief.lanes[0].roleVocabulary).toContain("Program Operations Lead");
  });

  it("adds role language a conversation strengthened to that lane's vocabulary", () => {
    const brief = assemble({}, [
      buildConversationOutcome({
        contactName: "Sam Rivera",
        sourceRef: "note-1",
        relatedLane: "Program Operations",
        signalType: "role_language",
        signalDirection: "strengthens",
        confidence: "high",
      }),
    ]);
    expect(brief.lanes[0].roleVocabulary).toEqual(["Program Operations Lead", "Program Operations"]);
  });

  it("never invents constraints: missing inputs become gaps, not defaults", () => {
    const brief = assemble();
    expect(brief.compensation).toEqual({ floorUsd: null, unit: "year", upperBound: null });
    expect(brief.workModel.accepted).toEqual([]);
    expect(brief.anchors).toEqual([]);
    expect(brief.gaps.join(" ")).toMatch(/No salary floor/);
    expect(brief.gaps.join(" ")).toMatch(/No geocoded location anchor/);
    expect(brief.gaps.join(" ")).toMatch(/No hard exclusions/);
  });

  it("orders localities by straight-line distance and caps them", () => {
    const brief = assemble({ anchors: [area] });
    expect(brief.anchors[0].localities.map((place) => place.name)).toEqual(["Lebanon", "Norwich", "Hanover"]);
    expect(brief.anchors[0].radiusMiles).toBe(25);
  });

  it("drops excluded employers from targets and dedupes watched vs candidate", () => {
    const brief = assemble({ exclusions: { employers: ["Granite Community Trust"] } });
    expect(brief.targets.map((target) => target.name)).toEqual(["Riverbend Health", "Valley Arts Council"]);
    expect(brief.targets[1].origin).toBe("candidate");
  });

  it("notes a conversation pay figure below the floor as a conflict without changing the floor", () => {
    const brief = assemble({ salaryFloorUsd: 85_000 }, [
      buildConversationOutcome({
        contactName: "Sam Rivera",
        sourceRef: "note-2",
        signalType: "compensation",
        signalDirection: "weakens",
        compensationSignal: "Director roles there top out around $70k",
      }),
    ]);
    expect(brief.compensation.floorUsd).toBe(85_000);
    expect(brief.conflicts).toHaveLength(1);
    expect(brief.conflicts[0].message).toMatch(/floor was not changed/);
  });

  it("treats hourly or absent figures as non-comparable, not as conflicts", () => {
    expect(parseAnnualFigures("about $32/hour")).toEqual([]);
    expect(parseAnnualFigures("pays fairly")).toEqual([]);
    expect(parseAnnualFigures("$70k to $95,000")).toEqual([70_000, 95_000]);
    const brief = assemble({ salaryFloorUsd: 85_000 }, [
      buildConversationOutcome({ contactName: "Sam", signalType: "compensation", compensationSignal: "$32 an hour" }),
    ]);
    expect(brief.conflicts).toEqual([]);
  });

  it("keeps free-text intake constraints unresolved and says they are not applied", () => {
    const prefs = preferencesFromIntake({
      salary_target: "90000",
      work_modes: ["Remote", "Hybrid"],
      career_constraints: "No travel; stay near home.",
      industry_preferences: "",
    });
    expect(prefs.salaryFloorUsd).toBe(90_000);
    expect(prefs.workModes).toEqual(["remote", "hybrid"]);
    expect(prefs.unparsedConstraints).toEqual([{ field: "career_constraints", text: "No travel; stay near home." }]);
    const brief = assemble(prefs);
    expect(brief.unresolvedConstraints).toHaveLength(1);
    expect(brief.gaps.join(" ")).toMatch(/career_constraints.*not applied/);
    expect(brief.gaps.join(" ")).toMatch(/no residency or work-authorization limit/);
  });

  it("is deterministic: identical inputs give an identical fingerprint, changes give a new one", () => {
    const a = assemble({ salaryFloorUsd: 85_000, anchors: [area] });
    const b = assemble({ salaryFloorUsd: 85_000, anchors: [area] });
    const c = assemble({ salaryFloorUsd: 90_000, anchors: [area] });
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.fingerprint).not.toBe(c.fingerprint);
  });

  it("fingerprint ignores the clock", () => {
    const first = assembleSearchBrief({ strategicState: stateFixture(), now: "2026-09-23T12:00:00.000Z" });
    const later = assembleSearchBrief({ strategicState: stateFixture(), now: "2026-10-01T09:00:00.000Z" });
    expect(first.fingerprint).toBe(later.fingerprint);
  });
});

describe("toOutboundFacets (privacy boundary)", () => {
  const outcomes = [
    buildConversationOutcome({
      contactName: "Confidential Contact",
      sourceRef: "note-9",
      relatedLane: "Program Operations",
      signalType: "dealbreaker",
      signalDirection: "weakens",
      warnings: "Told me in confidence that the ED is leaving.",
    }),
  ];
  const brief = assemble(
    {
      salaryFloorUsd: 87_400,
      workModes: ["hybrid"],
      anchors: [area],
      exclusions: { industries: ["Tobacco"], roles: ["Sales"], employers: ["Blocked Corp"] },
      unparsedConstraints: [{ field: "career_constraints", text: "private health reason" }],
    },
    outcomes,
  );
  const outbound = JSON.stringify(toOutboundFacets(brief));

  it("never includes exclusions, signals, contact names, warnings, or free text", () => {
    for (const secret of ["Tobacco", "Sales", "Blocked Corp", "Confidential Contact", "in confidence", "private health reason", "note-9"]) {
      expect(outbound).not.toContain(secret);
    }
  });

  it("sends role vocabulary, localities, work model, and a floor rounded down with no upper bound", () => {
    const facets = toOutboundFacets(brief);
    expect(facets.roleVocabulary[0].terms).toContain("Program Operations Lead");
    expect(facets.areas[0].localities.map((place) => place.name)).toContain("Lebanon");
    expect(facets.workModes).toEqual(["hybrid"]);
    expect(facets.minimumAnnualUsd).toBe(85_000);
    expect(Object.keys(facets)).not.toContain("maximumAnnualUsd");
  });

  it("sends a null floor when none is set, never a default", () => {
    expect(toOutboundFacets(assemble()).minimumAnnualUsd).toBeNull();
  });
});

describe("violatesExclusions (local filtering)", () => {
  const brief = assemble({ exclusions: { industries: ["Tobacco"], roles: ["Sales"], employers: ["Blocked Corp"] } });

  it("flags matches by employer, role, and industry", () => {
    expect(violatesExclusions(brief, { employer: "blocked corp" })).toMatch(/employer/);
    expect(violatesExclusions(brief, { title: "Regional Sales Director" })).toMatch(/role/);
    expect(violatesExclusions(brief, { industry: "Tobacco manufacturing" })).toMatch(/industry/);
  });

  it("passes unrelated postings", () => {
    expect(violatesExclusions(brief, { employer: "Riverbend Health", title: "Program Manager" })).toBeNull();
  });
});
