import { describe, expect, it } from "vitest";
import {
  deriveDiscoveryTargeting,
  partitionAgainstExisting,
  tagCandidateLanes,
  type LaneLike,
} from "@/lib/cip/discovery-targeting";

const lanes: LaneLike[] = [
  { lane: "Executive Director / Nonprofit Media Leader", label: "Primary lane" },
  { lane: "Director of Media Innovation / CTO for Nonprofit or Educational Organizations", label: "Strong alternate" },
  { lane: "Conversation research lane topic", label: "Conversation research lane" },
];

describe("deriveDiscoveryTargeting", () => {
  it("derives org-type sectors from the lanes' families and skips conversation-only lanes", () => {
    const targeting = deriveDiscoveryTargeting(lanes);
    expect(targeting.derivedFromLanes).toBe(true);
    expect(targeting.lanes.map((lane) => lane.label)).toEqual(["Primary lane", "Strong alternate"]);
    // Nonprofit-exec family (from the ED lane) and tech family (from the CTO lane) both contribute.
    expect(targeting.sectors).toContain("nonprofits");
    expect(targeting.sectors).toContain("technology organizations");
    // The conversation-only lane contributes nothing.
    expect(targeting.laneHints.some((hint) => hint.label === "Conversation research lane")).toBe(false);
  });

  it("reports not-derived when there are no usable lanes (caller falls back to manual sectors)", () => {
    expect(deriveDiscoveryTargeting([]).derivedFromLanes).toBe(false);
    expect(deriveDiscoveryTargeting([{ lane: "x", label: "Conversation research lane" }]).derivedFromLanes).toBe(false);
  });
});

describe("tagCandidateLanes", () => {
  it("tags a nonprofit employer to the ED lane and a tech org to the CTO lane", () => {
    const np = tagCandidateLanes({ name: "Upper Valley Haven", category: "human services nonprofit" }, lanes);
    expect(np.map((tag) => tag.label)).toContain("Primary lane");

    const tech = tagCandidateLanes({ name: "Norwich Technologies", category: "renewable energy technology company" }, lanes);
    expect(tech.map((tag) => tag.label)).toContain("Strong alternate");
  });

  it("returns no tags for an employer that matches none of the lanes", () => {
    const tags = tagCandidateLanes({ name: "Maple Grove Farms", category: "food manufacturing" }, lanes);
    expect(tags).toHaveLength(0);
  });
});

describe("partitionAgainstExisting", () => {
  it("separates genuinely new employers from ones already tracked under a different name", () => {
    const candidates = [
      { name: "DHMC" }, // acronym of an existing target
      { name: "Vital Communities Inc" }, // same as an existing target, just a suffix away
      { name: "Brand New Nonprofit" }, // genuinely new
    ];
    const { fresh, alreadyTracked } = partitionAgainstExisting(candidates, ["Dartmouth-Hitchcock Medical Center", "Vital Communities"]);
    expect(fresh.map((candidate) => candidate.name)).toEqual(["Brand New Nonprofit"]);
    expect(alreadyTracked.map((entry) => entry.candidate.name).sort()).toEqual(["DHMC", "Vital Communities Inc"]);
    expect(alreadyTracked.find((entry) => entry.candidate.name === "DHMC")?.trackedAs).toBe("Dartmouth-Hitchcock Medical Center");
  });

  it("recognizes a member employer whose parent organization is already tracked (name shares no words)", () => {
    const candidates = [
      { name: "Mary Hitchcock Memorial Hospital", parent_organization: "Dartmouth Health" },
      { name: "Dartmouth-Hitchcock Clinic", parent_organization: "Dartmouth Health" },
      { name: "Unrelated Local Startup", parent_organization: "" },
    ];
    const { fresh, alreadyTracked } = partitionAgainstExisting(candidates, ["Dartmouth Health"]);
    expect(fresh.map((candidate) => candidate.name)).toEqual(["Unrelated Local Startup"]);
    expect(alreadyTracked.every((entry) => entry.trackedAs === "Dartmouth Health")).toBe(true);
    expect(alreadyTracked).toHaveLength(2);
  });
});
