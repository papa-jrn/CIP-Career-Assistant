import { describe, expect, it } from "vitest";
import { FIXTURE_NOW, fixtureArea, fixtureSecondArea, fixtureStrategicState } from "@/lib/cip/__fixtures__/search-fixtures";
import { resolveAnchorRequests } from "@/lib/cip/brief-loader";
import { assembleSearchBrief, toOutboundFacets } from "@/lib/cip/search-brief";
import { assessWorksite, buildRoleSearchScopes, rankByProximity } from "@/lib/cip/search-geography";
import { parseNominatimStateCode } from "@/lib/cip/geography-engine";
import { normalizeStateCode } from "@/lib/cip/us-states";

function brief(anchors = [fixtureArea, fixtureSecondArea], extra = {}) {
  return assembleSearchBrief({
    strategicState: fixtureStrategicState(),
    preferences: { anchors, workModes: ["hybrid"], ...extra },
    now: FIXTURE_NOW,
  });
}

describe("normalizeStateCode", () => {
  it("maps names and codes to codes and treats junk as unknown", () => {
    expect(normalizeStateCode("New Hampshire")).toBe("NH");
    expect(normalizeStateCode("nh.")).toBe("NH");
    expect(normalizeStateCode("VT")).toBe("VT");
    expect(normalizeStateCode("Narnia")).toBe("");
    expect(normalizeStateCode("")).toBe("");
  });
});

describe("brief anchors", () => {
  it("normalizes state names to codes and keeps what the geocoder resolved", () => {
    const anchors = brief().anchors;
    expect(anchors[0].state).toBe("VT");
    expect(anchors[0].resolvedAs).toContain("White River Junction");
    expect(anchors[0].localities.find((place) => place.name === "Lebanon")?.state).toBe("NH");
    // No verified state stays unknown; it must not inherit the anchor state.
    expect(anchors[1].localities.find((place) => place.name === "St. Johnsbury")?.state).toBe("");
  });

  it("reports an anchor that failed to geocode as not searched", () => {
    const result = brief([fixtureArea], { unresolvedAnchors: [{ label: "Nowhereville", reason: "Could not geocode" }] });
    expect(result.unresolvedAnchors).toHaveLength(1);
    expect(result.gaps.join(" ")).toMatch(/Could not locate "Nowhereville".*not searched/);
    expect(result.gaps.join(" ")).not.toMatch(/No geocoded location anchor/);
  });
});

describe("failed nearby-town lookup", () => {
  it("is reported as a gap so a center-only result is never presented as an expanded search", () => {
    const centerOnly = { ...fixtureArea, nearbyLookup: "fallback" as const, nearbyPlaces: [fixtureArea.nearbyPlaces[0]] };
    const result = brief([centerOnly]);
    expect(result.anchors[0].nearbyLookup).toBe("fallback");
    expect(result.gaps.join(" ")).toMatch(/nearby-town lookup failed for "White River Junction, VT"/);
    expect(brief([fixtureArea]).gaps.join(" ")).not.toMatch(/nearby-town lookup failed/);
  });
});

describe("assessWorksite", () => {
  const anchors = brief().anchors;

  it("uses straight-line distance from coordinates and respects the radius", () => {
    const near = assessWorksite(anchors, { latitude: 43.7, longitude: -72.29 });
    expect(near.status).toBe("within");
    expect(near.basis).toBe("coordinates");
    expect(near.distanceMiles).toBeLessThan(10);

    const far = assessWorksite(anchors, { latitude: 42.36, longitude: -71.06 });
    expect(far.status).toBe("outside");
    expect(far.note).toMatch(/search radius/);
  });

  it("matches a named locality with its state and reports the listed distance", () => {
    const result = assessWorksite(anchors, { locationText: "Hanover, NH" });
    expect(result).toMatchObject({ status: "within", distanceMiles: 6.4, basis: "locality-list" });
    expect(result.note).toMatch(/not the exact worksite/);
  });

  it("does not confuse same-named places in different states", () => {
    expect(assessWorksite(anchors, { locationText: "Lebanon, NH" }).distanceMiles).toBe(3.6);
    expect(assessWorksite(anchors, { locationText: "Lebanon, Vermont" }).distanceMiles).toBe(9.9);
    expect(assessWorksite(anchors, { locationText: "Lebanon, PA" }).status).toBe("unknown");
  });

  it("flags a stateless name that exists in two states as ambiguous, not guessed", () => {
    const result = assessWorksite(anchors, { locationText: "Lebanon" });
    expect(result.status).toBe("ambiguous");
    expect(result.distanceMiles).toBeNull();
  });

  it("does not treat a locality with an unverified state as in range", () => {
    const result = assessWorksite(anchors, { locationText: "St. Johnsbury, VT" });
    expect(result.status).toBe("ambiguous");
    expect(result.note).toMatch(/could not be verified/);
  });

  it("never calls an unlisted or blank location outside the radius", () => {
    expect(assessWorksite(anchors, { locationText: "Springfield, VT" }).status).toBe("unknown");
    expect(assessWorksite(anchors, { locationText: "" }).status).toBe("unknown");
    expect(assessWorksite(anchors, {}).status).toBe("unknown");
  });

  it("is unknown when no anchor exists", () => {
    expect(assessWorksite([], { locationText: "Hanover, NH" }).status).toBe("unknown");
  });
});

describe("rankByProximity", () => {
  it("orders by status then distance, keeps unknown and ambiguous visible, and is stable", () => {
    const anchors = brief().anchors;
    const items = [
      { id: "unknown", location: assessWorksite(anchors, { locationText: "Springfield, VT" }) },
      { id: "far", location: assessWorksite(anchors, { latitude: 42.36, longitude: -71.06 }) },
      { id: "hanover", location: assessWorksite(anchors, { locationText: "Hanover, NH" }) },
      { id: "lebanon", location: assessWorksite(anchors, { locationText: "Lebanon, NH" }) },
      { id: "ambiguous", location: assessWorksite(anchors, { locationText: "Lebanon" }) },
    ];
    expect(rankByProximity(items).map((item) => item.id)).toEqual(["lebanon", "hanover", "ambiguous", "unknown", "far"]);
  });
});

describe("buildRoleSearchScopes", () => {
  const facets = toOutboundFacets(brief([fixtureArea], { workModes: ["hybrid", "remote"] }));

  it("expands each lane term across the real labor shed, nearest localities first", () => {
    const scopes = buildRoleSearchScopes(facets);
    expect(scopes[0].roleTerm).toBe("Program Operations Lead");
    expect(scopes[0].anchorLabel).toBe("White River Junction, VT");
    expect(scopes[0].localities).toEqual(["Lebanon, NH", "Norwich, VT", "Hanover, NH"]);
    expect(scopes[0].queryText).toMatch(/within 25 miles.*Lebanon, NH/);
  });

  it("adds a remote scope only when remote is accepted, and not for research lanes", () => {
    const remote = buildRoleSearchScopes(facets).filter((scope) => scope.anchorLabel === null);
    expect(remote.length).toBeGreaterThan(0);
    expect(remote.every((scope) => scope.weight !== "research")).toBe(true);
    const noRemote = buildRoleSearchScopes(toOutboundFacets(brief([fixtureArea])));
    expect(noRemote.some((scope) => scope.anchorLabel === null)).toBe(false);
  });

  it("is capped, deterministic, and searches nowhere when there is no anchor and no remote", () => {
    expect(buildRoleSearchScopes(facets, { maxScopes: 1 })).toHaveLength(1);
    expect(buildRoleSearchScopes(facets)).toEqual(buildRoleSearchScopes(facets));
    expect(buildRoleSearchScopes(toOutboundFacets(brief([])))).toEqual([]);
  });

  it("is built from outbound facets only, so private brief content cannot appear", () => {
    const text = JSON.stringify(
      buildRoleSearchScopes(
        toOutboundFacets(brief([fixtureArea], { exclusions: { industries: ["Tobacco"] }, remoteLimits: "secret limit" })),
      ),
    );
    expect(text).not.toContain("Tobacco");
    expect(text).not.toContain("secret limit");
  });
});

describe("resolveAnchorRequests", () => {
  it("keeps going after a failure and reports it, resolving one anchor at a time", async () => {
    const calls: string[] = [];
    const result = await resolveAnchorRequests(
      [
        { label: "White River Junction, VT", radiusMiles: 25 },
        { label: "Nowhereville", radiusMiles: 10 },
        { label: "Lyndon, VT", radiusMiles: 20 },
      ],
      async (query) => {
        calls.push(query);
        if (query === "Nowhereville") throw new Error(`Could not geocode "${query}".`);
        return query.startsWith("Lyndon") ? fixtureSecondArea : fixtureArea;
      },
    );
    expect(calls).toEqual(["White River Junction, VT", "Nowhereville", "Lyndon, VT"]);
    expect(result.areas).toHaveLength(2);
    expect(result.failures).toEqual([{ label: "Nowhereville", reason: 'Could not geocode "Nowhereville".' }]);
  });
});

describe("parseNominatimStateCode", () => {
  it("reads the ISO state code, falls back to the state name, and returns empty when unknown", () => {
    expect(parseNominatimStateCode({ address: { state: "Vermont", "ISO3166-2-lvl4": "US-VT" } })).toBe("VT");
    expect(parseNominatimStateCode({ address: { state: "New Hampshire" } })).toBe("NH");
    expect(parseNominatimStateCode({ address: { country: "Canada" } })).toBe("");
    expect(parseNominatimStateCode(null)).toBe("");
  });
});
