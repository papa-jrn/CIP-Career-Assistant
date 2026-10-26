import { describe, expect, it } from "vitest";
import { legacyPeopleDestination, peopleView } from "./people-routing";

describe("People route compatibility", () => {
  it("defaults unknown or absent views to Connections", () => {
    expect(peopleView(null)).toBe("connections");
    expect(peopleView("arbitrary")).toBe("connections");
    expect(peopleView("follow-ups")).toBe("follow-ups");
  });

  it("keeps correction confirmations and Workbench context on old Connections links", () => {
    const result = new URL(legacyPeopleDestination(new URL("http://localhost:4321/network?corrected=contact&workAction=abc#saved"), "connections"), "http://localhost:4321");
    expect(result.pathname).toBe("/people");
    expect(result.searchParams.get("view")).toBe("connections");
    expect(result.searchParams.get("corrected")).toBe("contact");
    expect(result.searchParams.get("workAction")).toBe("abc");
    expect(result.hash).toBe("#saved");
  });

  it("routes old Follow-ups links back to their view even with an old view parameter", () => {
    const result = new URL(legacyPeopleDestination(new URL("http://localhost:4321/follow-up?view=all&followup=met"), "follow-ups"), "http://localhost:4321");
    expect(result.searchParams.getAll("view")).toEqual(["follow-ups"]);
    expect(result.searchParams.get("followup")).toBe("met");
  });
});