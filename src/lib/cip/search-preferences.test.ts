import { describe, expect, it } from "vitest";
import { FIXTURE_NOW, fixtureArea, fixtureStrategicState } from "@/lib/cip/__fixtures__/search-fixtures";
import { assembleSearchBrief } from "@/lib/cip/search-brief";
import {
  formValuesToDesired,
  parseAnchorLine,
  parsePreferenceForm,
  planPreferenceChanges,
  resolveSearchPreferences,
  rowsToStoredPreferences,
  splitLines,
  type PreferenceRow,
} from "@/lib/cip/search-preferences";

function row(partial: Partial<PreferenceRow> & Pick<PreferenceRow, "id" | "kind" | "value">): PreferenceRow {
  return {
    amount: null,
    radius_miles: null,
    scope: "global",
    scope_ref: null,
    created_at: "2026-09-23T10:00:00.000Z",
    ...partial,
  };
}

function formOf(entries: Record<string, string | string[]>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    for (const item of Array.isArray(value) ? value : [value]) form.append(key, item);
  }
  return form;
}

describe("form parsing", () => {
  it("splits on newlines and semicolons, keeps commas inside names, and dedupes", () => {
    expect(splitLines("Acme Health, Inc.\nacme health, inc.; Tobacco\n\n")).toEqual(["Acme Health, Inc.", "Tobacco"]);
  });

  it("parses anchors with optional radius and defaults to 25 miles", () => {
    expect(parseAnchorLine("White River Junction, VT | 30")).toEqual({ label: "White River Junction, VT", radiusMiles: 30 });
    expect(parseAnchorLine("Lyndon, VT")).toEqual({ label: "Lyndon, VT", radiusMiles: 25 });
  });

  it("parses a full submission and maps it to desired preferences", () => {
    const parsed = parsePreferenceForm(
      formOf({
        salary_floor: "$85,000",
        work_modes: ["hybrid", "remote"],
        remote_limits: "US residents only",
        exclusion_industries: "Tobacco",
        exclusion_roles: "Sales",
        exclusion_employers: "Blocked Corp",
        anchors: "White River Junction, VT | 25",
      }),
    );
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const desired = formValuesToDesired(parsed.data);
    expect(desired).toContainEqual({ kind: "salary_floor", value: "85000", amount: 85_000 });
    expect(desired).toContainEqual({ kind: "anchor", value: "White River Junction, VT", radiusMiles: 25 });
    expect(desired.filter((item) => item.kind === "work_mode").map((item) => item.value)).toEqual(["hybrid", "remote"]);
  });

  it("rejects bad input instead of coercing it", () => {
    expect(parsePreferenceForm(formOf({ salary_floor: "-5" })).success).toBe(false);
    expect(parsePreferenceForm(formOf({ work_modes: ["teleport"] })).success).toBe(false);
    expect(parsePreferenceForm(formOf({ anchors: "Somewhere | 500" })).success).toBe(false);
  });

  it("accepts an empty submission, which clears everything", () => {
    const parsed = parsePreferenceForm(formOf({}));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(formValuesToDesired(parsed.data)).toEqual([]);
  });
});

describe("planPreferenceChanges", () => {
  const active = [
    row({ id: "a", kind: "salary_floor", value: "85000", amount: 85_000 }),
    row({ id: "b", kind: "work_mode", value: "hybrid" }),
    row({ id: "c", kind: "exclusion_industry", value: "Tobacco" }),
    row({ id: "d", kind: "anchor", value: "White River Junction, VT", radius_miles: 25 }),
  ];

  it("changes nothing when the submission matches what is stored", () => {
    const plan = planPreferenceChanges(active, [
      { kind: "salary_floor", value: "85000", amount: 85_000 },
      { kind: "work_mode", value: "HYBRID" },
      { kind: "exclusion_industry", value: "tobacco" },
      { kind: "anchor", value: "White River Junction, VT", radiusMiles: 25 },
    ]);
    expect(plan).toEqual({ toInsert: [], toRetireIds: [] });
  });

  it("replaces a changed single-valued floor and a changed anchor radius, keeping history", () => {
    const plan = planPreferenceChanges(active, [
      { kind: "salary_floor", value: "90000", amount: 90_000 },
      { kind: "work_mode", value: "hybrid" },
      { kind: "exclusion_industry", value: "Tobacco" },
      { kind: "anchor", value: "White River Junction, VT", radiusMiles: 40 },
    ]);
    expect(plan.toInsert.map((item) => item.kind).sort()).toEqual(["anchor", "salary_floor"]);
    expect(plan.toRetireIds.sort()).toEqual(["a", "d"]);
  });

  it("retires anything the user removed", () => {
    const plan = planPreferenceChanges(active, []);
    expect(plan.toInsert).toEqual([]);
    expect(plan.toRetireIds.sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("does not touch non-global scoped rows", () => {
    const scoped = [row({ id: "z", kind: "exclusion_role", value: "Sales", scope: "lane", scope_ref: "program-operations-lead" })];
    expect(planPreferenceChanges(scoped, [])).toEqual({ toInsert: [], toRetireIds: [] });
  });
});

describe("rowsToStoredPreferences", () => {
  it("newest active single-valued row wins and lists are sorted", () => {
    const stored = rowsToStoredPreferences([
      row({ id: "1", kind: "salary_floor", value: "80000", amount: 80_000, created_at: "2026-09-01T00:00:00Z" }),
      row({ id: "2", kind: "salary_floor", value: "90000", amount: 90_000, created_at: "2026-09-10T00:00:00Z" }),
      row({ id: "3", kind: "work_mode", value: "remote" }),
      row({ id: "4", kind: "work_mode", value: "hybrid" }),
      row({ id: "5", kind: "exclusion_employer", value: "Zed Corp" }),
      row({ id: "6", kind: "exclusion_employer", value: "Acme" }),
      row({ id: "7", kind: "anchor", value: "Lyndon, VT", radius_miles: 30 }),
    ]);
    expect(stored.hasAny).toBe(true);
    expect(stored.salaryFloorUsd).toBe(90_000);
    expect(stored.workModes).toEqual(["hybrid", "remote"]);
    expect(stored.exclusions.employers).toEqual(["Acme", "Zed Corp"]);
    expect(stored.anchorRequests).toEqual([{ label: "Lyndon, VT", radiusMiles: 30 }]);
  });

  it("reports hasAny false for an empty user", () => {
    expect(rowsToStoredPreferences([]).hasAny).toBe(false);
  });
});

describe("resolveSearchPreferences", () => {
  const intake = { salary_target: 95_000, work_modes: ["remote"], career_constraints: "No travel." };

  it("applies nothing from intake before the user confirms, and reports the free text as unresolved", () => {
    const prefs = resolveSearchPreferences(rowsToStoredPreferences([]), intake);
    expect(prefs.salaryFloorUsd).toBeUndefined();
    expect(prefs.workModes).toBeUndefined();
    const brief = assembleSearchBrief({ strategicState: fixtureStrategicState(), preferences: prefs, now: FIXTURE_NOW });
    expect(brief.compensation.floorUsd).toBeNull();
    expect(brief.unresolvedConstraints).toHaveLength(1);
  });

  it("uses stored rows only once confirmed, and drops the superseded free-text warnings", () => {
    const stored = rowsToStoredPreferences([
      row({ id: "1", kind: "salary_floor", value: "85000", amount: 85_000 }),
      row({ id: "2", kind: "exclusion_industry", value: "Tobacco" }),
    ]);
    const prefs = resolveSearchPreferences(stored, intake, [fixtureArea]);
    const brief = assembleSearchBrief({ strategicState: fixtureStrategicState(), preferences: prefs, now: FIXTURE_NOW });
    expect(brief.compensation.floorUsd).toBe(85_000);
    expect(brief.exclusions.industries).toEqual(["Tobacco"]);
    expect(brief.unresolvedConstraints).toEqual([]);
    expect(brief.anchors).toHaveLength(1);
  });
});
