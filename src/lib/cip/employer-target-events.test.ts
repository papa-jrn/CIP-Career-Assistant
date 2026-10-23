import { describe, expect, it } from "vitest";
import {
  currentTargetEvents,
  excludedKeys,
  excludedTargets,
  isTargetStatus,
  parseTargetEvent,
  partitionExcluded,
  resolveTargetStatus,
  type TargetEvent,
  type TargetEventRow,
} from "./employer-target-events";

const row = (over: Partial<TargetEventRow> = {}): TargetEventRow => ({
  employer_key: "riverside health",
  name: "Riverside Health",
  parent_key: null,
  status: "researching",
  note: "",
  source: "user",
  created_at: "2026-10-23T12:00:00.000Z",
  ...over,
});

const event = (over: Partial<TargetEvent> = {}): TargetEvent => ({
  employerKey: "riverside health",
  name: "Riverside Health",
  parentKey: null,
  status: "researching",
  note: "",
  source: "user",
  createdAt: "2026-10-23T12:00:00.000Z",
  ...over,
});

describe("reading an event", () => {
  it("accepts every status the workspace defines", () => {
    for (const status of ["new", "researching", "talk_first", "monitoring", "applying", "paused", "not_interested"]) {
      expect(isTargetStatus(status)).toBe(true);
      expect(parseTargetEvent(row({ status }))?.status).toBe(status);
    }
  });

  it("refuses a status it does not recognise, rather than guessing one", () => {
    expect(isTargetStatus("keen")).toBe(false);
    expect(parseTargetEvent(row({ status: "keen" }))).toBeNull();
  });

  it("refuses an event with no employer", () => {
    expect(parseTargetEvent(row({ name: "   " }))).toBeNull();
  });

  it("derives the key from the name when the stored key is missing", () => {
    expect(parseTargetEvent(row({ employer_key: "", name: "Riverside  Health" }))?.employerKey).toBe("riverside health");
  });

  it("treats an unknown source as a user decision rather than an app one", () => {
    // Mislabelling a user's choice as the app's would let it be overwritten.
    expect(parseTargetEvent(row({ source: "something" }))?.source).toBe("user");
    expect(parseTargetEvent(row({ source: "app" }))?.source).toBe("app");
  });
});

describe("which event is in force", () => {
  it("takes the most recent decision", () => {
    const state = currentTargetEvents([
      event({ status: "applying", createdAt: "2026-10-23T14:00:00.000Z" }),
      event({ status: "researching", createdAt: "2026-10-23T12:00:00.000Z" }),
    ]);
    expect(state.get("riverside health")?.status).toBe("applying");
  });

  it("does not let an app-written status overwrite a user's choice made at the same moment", () => {
    const same = "2026-10-23T12:00:00.000Z";
    const state = currentTargetEvents([
      event({ status: "monitoring", source: "app", createdAt: same }),
      event({ status: "not_interested", source: "user", createdAt: same }),
    ]);
    expect(state.get("riverside health")?.status).toBe("not_interested");
  });

  it("keeps employers apart", () => {
    const state = currentTargetEvents([
      event(),
      event({ employerKey: "granite trust", name: "Granite Trust", status: "paused" }),
    ]);
    expect(state.get("granite trust")?.status).toBe("paused");
    expect(state.get("riverside health")?.status).toBe("researching");
  });
});

describe("what the card shows", () => {
  it("shows the app's suggestion when the user has decided nothing", () => {
    const shown = resolveTargetStatus("Riverside Health", "monitoring", currentTargetEvents([]));
    expect(shown).toMatchObject({ status: "monitoring", source: "suggested" });
  });

  it("shows the user's decision as theirs, with their note", () => {
    const shown = resolveTargetStatus("Riverside Health", "monitoring", currentTargetEvents([event({ status: "paused", note: "Hiring freeze." })]));
    expect(shown).toMatchObject({ status: "paused", source: "set", note: "Hiring freeze." });
  });

  it("matches the employer despite naming drift", () => {
    const shown = resolveTargetStatus("riverside  health", "new", currentTargetEvents([event()]));
    expect(shown.source).toBe("set");
  });

  it("does not treat an app-recorded status as the user's own", () => {
    const shown = resolveTargetStatus("Riverside Health", "new", currentTargetEvents([event({ status: "applying", source: "app" })]));
    expect(shown).toMatchObject({ status: "new", source: "suggested" });
  });
});

describe("not interested", () => {
  const candidate = (name: string, parent?: string) => ({ name, parent_organization: parent ?? null });

  it("suppresses an organisation the user excluded", () => {
    const excluded = excludedKeys(currentTargetEvents([event({ status: "not_interested" })]));
    const split = partitionExcluded([candidate("Riverside Health"), candidate("Granite Trust")], excluded);
    expect(split.kept.map((c) => c.name)).toEqual(["Granite Trust"]);
    expect(split.excluded.map((c) => c.name)).toEqual(["Riverside Health"]);
  });

  it("suppresses a member organisation when its parent was excluded", () => {
    // The case §14 names: excluding a parent should not leave its hospitals
    // coming back one by one.
    const excluded = excludedKeys(currentTargetEvents([
      event({ employerKey: "riverside health system", name: "Riverside Health System", status: "not_interested" }),
    ]));
    const split = partitionExcluded([candidate("Valley Hospital", "Riverside Health System")], excluded);
    expect(split.kept).toEqual([]);
    expect(split.excluded.map((c) => c.name)).toEqual(["Valley Hospital"]);
  });

  it("also excludes by the parent recorded on the decision itself", () => {
    const excluded = excludedKeys(currentTargetEvents([
      event({ status: "not_interested", parentKey: "riverside health system" }),
    ]));
    expect(excluded.has("riverside health system")).toBe(true);
  });

  it("stops suppressing once the decision is reversed", () => {
    const state = currentTargetEvents([
      event({ status: "monitoring", createdAt: "2026-10-23T14:00:00.000Z" }),
      event({ status: "not_interested", createdAt: "2026-10-23T12:00:00.000Z" }),
    ]);
    expect(excludedKeys(state).size).toBe(0);
    expect(partitionExcluded([candidate("Riverside Health")], excludedKeys(state)).kept).toHaveLength(1);
  });

  it("hands back what it suppressed rather than dropping it silently", () => {
    const excluded = excludedKeys(currentTargetEvents([event({ status: "not_interested" })]));
    expect(partitionExcluded([candidate("Riverside Health")], excluded).excluded).toHaveLength(1);
  });

  it("changes nothing when the user has excluded nobody", () => {
    const candidates = [candidate("Riverside Health"), candidate("Granite Trust")];
    const split = partitionExcluded(candidates, new Set<string>());
    expect(split.kept).toHaveLength(2);
    expect(split.excluded).toHaveLength(0);
  });

  it("lists exclusions newest decision first, so they can be restored", () => {
    const state = currentTargetEvents([
      event({ status: "not_interested", createdAt: "2026-10-20T12:00:00.000Z" }),
      event({ employerKey: "granite trust", name: "Granite Trust", status: "not_interested", createdAt: "2026-10-23T12:00:00.000Z" }),
    ]);
    expect(excludedTargets(state).map((e) => e.name)).toEqual(["Granite Trust", "Riverside Health"]);
  });
});
