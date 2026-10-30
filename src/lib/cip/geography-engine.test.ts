import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveSearchArea } from "./geography-engine";
import { renderSearchArea } from "@/pages/api/employers/discover";

const center = { formatted_address: "Norwich, VT", location: { lat: 43.7179, lng: -72.3612 }, address_components: { city: "Norwich", state: "VT", country: "US" } };
const hanover = { formatted_address: "Hanover, NH", location: { lat: 43.703, lng: -72.289 }, address_components: { city: "Hanover", state: "NH", country: "US" } };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
beforeEach(() => { vi.stubEnv("OPENAI_API_KEY", ""); vi.stubEnv("GEOCODIO_API_KEY", "fixture-only"); vi.stubEnv("OVERPASS_URL", "https://overpass.example.test/interpreter"); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Cross-border nearby locality recovery", () => {
  it("uses Geocodio to recover Hanover NH after both nearby-service attempts fail", async () => {
    const calls: Array<{ path: string; body: unknown }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | string, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.hostname.includes("overpass")) return json({}, 503);
      if (url.pathname.endsWith("/geocode") && init?.method !== "POST") return json({ results: [center] });
      const body = JSON.parse(String(init?.body)); calls.push({ path: url.pathname, body });
      if (url.pathname.endsWith("/reverse")) return json({ results: body.map(() => ({ response: { results: [hanover] } })) });
      return json({ results: body.map(() => ({ response: { results: [hanover] } })) });
    }));
    const area = await resolveSearchArea("Norwich, VT", 25);
    expect(area.attribution).toContain("Geocodio");
    expect(area.nearbySource).toBe("geocodio_samples");
    expect(area.nearbyPlaces).toContainEqual(expect.objectContaining({ name: "Hanover", state: "NH" }));
    expect(area.searchQueries.some(query => query.includes("Hanover NH"))).toBe(true);
    expect(area.searchQueries.some(query => query.includes("Hanover VT"))).toBe(false);
    expect((calls[0].body as string[])).toHaveLength(32);
    const html = renderSearchArea({ mode: "live_web_search", geography: area.query, radiusMiles: 25, searchArea: area, summary: "Fixture", sourcePages: [], candidates: [] });
    expect(html).toContain("Hanover, NH");
    expect(html).toContain("Coverage is limited");
  });

  it("discloses center-only coverage when both geography services fail", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: URL | string, init?: RequestInit) => {
      const url = new URL(String(input));
      return url.pathname.endsWith("/geocode") && init?.method !== "POST" ? json({ results: [center] }) : json({}, 503);
    }));
    const area = await resolveSearchArea("Norwich, VT", 25);
    expect(area.nearbyLookup).toBe("fallback");
    expect(area.nearbySource).toBe("center_only");
    // The center is not a nearby place: asserting it at zero miles claimed a confirmed distance
    // to a locality nobody had established the coordinates were in.
    expect(area.nearbyPlaces).toEqual([]);
    expect(area.centerCheck.status).toBe("unverified");
    const html = renderSearchArea({ mode: "live_web_search", geography: area.query, radiusMiles: 25, searchArea: area, summary: "Fixture", sourcePages: [], candidates: [] });
    expect(html).toContain("cross-border coverage is incomplete");
    expect(html).not.toContain("(0 mi)");
    expect(html).toContain("Search center not confirmed");
  });

  it("does not assign the center state to a town whose state lookup failed", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: URL | string, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.hostname.includes("overpass")) return json({ elements: [{ type: "node", id: 1, lat: 43.703, lon: -72.289, tags: { name: "Hanover", place: "town" } }] });
      if (url.pathname.endsWith("/geocode") && init?.method !== "POST") return json({ results: [center] });
      return json({}, 503);
    }));
    const area = await resolveSearchArea("Norwich, VT", 25);
    expect(area.nearbyPlaces[0].state).toBe("");
    expect(area.searchQueries.some(query => query.includes("Hanover VT"))).toBe(false);
    expect(area.searchQueries.some(query => query.includes("Hanover major employers"))).toBe(true);
  });
});

it("retains hospital and college discovery queries when the nearby-town list fills the query cap", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input: URL | string) => {
    const url = new URL(String(input));
    if (url.hostname.includes("overpass")) return json({ elements: Array.from({ length: 20 }, (_, i) => ({ type: "node", id: i, lat: 43.72, lon: -72.36, tags: { name: `Fixture Town ${i}`, place: "town", "addr:state": "VT" } })) });
    return json({ results: [center] });
  }));
  const area = await resolveSearchArea("Norwich, VT", 25);
  expect(area.searchQueries).toContain("Norwich VT higher education employers");
  expect(area.searchQueries).toContain("Norwich VT healthcare employers");
  expect(area.searchQueries.length).toBeLessThanOrEqual(24);
});

/**
 * The 2026-10-29 Mountain View run: "Mountain View, CA" resolved to a Santa Clara County
 * centroid 25 miles south of the city. Nothing noticed, because the coarse match was never
 * inspected, the query string was pasted over the missing city, and the center was then
 * asserted as a nearby place at zero miles.
 */
const countyCentroid = {
  formatted_address: "Mountain View, CA 94039",
  location: { lat: 37.1894, lng: -121.7053 },
  accuracy: 1,
  accuracy_type: "county",
  address_components: { city: "Mountain View", county: "Santa Clara County", state: "CA", country: "US" },
};
const nominatimMountainView = [{
  lat: "37.3861",
  lon: "-122.0839",
  display_name: "Mountain View, Santa Clara County, California, United States",
  licence: "Data from OpenStreetMap contributors",
  address: { city: "Mountain View", county: "Santa Clara County", state: "California", country: "United States" },
}];
const overpassAroundMountainView = {
  elements: [
    { type: "node", id: 1, lat: 37.3861, lon: -122.0839, tags: { name: "Mountain View", place: "city", "addr:state": "CA", population: "82000" } },
    { type: "node", id: 2, lat: 37.4419, lon: -122.143, tags: { name: "Palo Alto", place: "city", "addr:state": "CA", population: "68000" } },
    { type: "node", id: 3, lat: 37.3688, lon: -122.0363, tags: { name: "Sunnyvale", place: "city", "addr:state": "CA", population: "155000" } },
  ],
};

describe("Coarse geocoder matches are not search centers", () => {
  it("rejects a county-level Geocodio match and uses the backup geocoder instead", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: URL | string, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.hostname.includes("overpass")) return json(overpassAroundMountainView);
      if (url.hostname.includes("nominatim")) return json(nominatimMountainView);
      if (url.pathname.endsWith("/geocode") && init?.method !== "POST") return json({ results: [countyCentroid] });
      return json({}, 503);
    }));
    const area = await resolveSearchArea("Mountain View, CA", 25);
    expect(area.latitude).toBeCloseTo(37.3861, 3);
    expect(area.longitude).toBeCloseTo(-122.0839, 3);
    expect(area.attribution).toContain("OpenStreetMap");
    expect(area.centerCheck.status).toBe("verified");
    // The backup geocoder spells the state out; queries must not switch shape because of it.
    expect(area.state).toBe("CA");
    expect(area.searchQueries).toContain("Mountain View CA major employers within 25 miles");
  });

  it("fails loudly rather than drawing a radius around a county when no geocoder is precise", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: URL | string, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/geocode") && init?.method !== "POST") return json({ results: [countyCentroid] });
      return json({}, 503);
    }));
    await expect(resolveSearchArea("Mountain View, CA", 25)).rejects.toThrow(/only to county level/);
  });

  it("does not paste the query over a city the geocoder never returned", async () => {
    const placeMatchWithoutCity = { ...countyCentroid, accuracy_type: "place", address_components: { county: "Santa Clara County", state: "CA", country: "US" } };
    vi.stubGlobal("fetch", vi.fn(async (input: URL | string, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.hostname.includes("overpass")) return json(overpassAroundMountainView);
      if (url.pathname.endsWith("/geocode") && init?.method !== "POST") return json({ results: [placeMatchWithoutCity] });
      return json({}, 503);
    }));
    const area = await resolveSearchArea("Mountain View, CA", 25);
    expect(area.city).toBe("");
    expect(area.cityLabel).toBe("Mountain View");
    expect(area.searchQueries).toContain("Mountain View CA chamber of commerce business directory");
  });
});

describe("The center is corroborated against its own neighbours", () => {
  it("reports an unverified center when the requested city is not among the localities found", async () => {
    const towns: Record<string, unknown> = {
      "Morganhill, CA": { formatted_address: "Morgan Hill, CA", location: { lat: 37.1305, lng: -121.6544 }, accuracy_type: "place", address_components: { city: "Morganhill", state: "CA", country: "US" } },
      "San Martin, CA": { formatted_address: "San Martin, CA", location: { lat: 37.0852, lng: -121.6103 }, accuracy_type: "place", address_components: { city: "San Martin", state: "CA", country: "US" } },
      "Gilroy, CA": { formatted_address: "Gilroy, CA", location: { lat: 37.0058, lng: -121.5683 }, accuracy_type: "place", address_components: { city: "Gilroy", state: "CA", country: "US" } },
    };
    const names = Object.keys(towns);
    // Passes the accuracy gate, but the coordinates are still the county centroid.
    const placeMatchAtCountyCentroid = { ...countyCentroid, accuracy_type: "place" };
    vi.stubGlobal("fetch", vi.fn(async (input: URL | string, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.hostname.includes("overpass")) return json({}, 503);
      if (url.hostname.includes("nominatim")) return json({}, 503);
      if (url.pathname.endsWith("/geocode") && init?.method !== "POST") return json({ results: [placeMatchAtCountyCentroid] });
      const body = JSON.parse(String(init?.body)) as string[];
      if (url.pathname.endsWith("/reverse")) {
        return json({ results: body.map((_, index) => ({ response: { results: [towns[names[index % names.length]]] } })) });
      }
      return json({ results: body.map((name) => ({ response: { results: [towns[name]] } })) });
    }));
    const area = await resolveSearchArea("Mountain View, CA", 25);
    expect(area.nearbySource).toBe("geocodio_samples");
    expect(area.nearbyPlaces.map((place) => place.name)).toContain("Morganhill");
    expect(area.centerCheck.status).toBe("unverified");
    expect(area.centerCheck.note).toContain("Mountain View is not among the localities");
    const html = renderSearchArea({ mode: "live_web_search", geography: area.query, radiusMiles: 25, searchArea: area, summary: "Fixture", sourcePages: [], candidates: [] });
    expect(html).toContain("Search center not confirmed");
  });

  it("accepts a locality whose geocoder spelling differs only in spacing", async () => {
    const morganHillCenter = { formatted_address: "Morgan Hill, CA", location: { lat: 37.1305, lng: -121.6544 }, accuracy_type: "place", address_components: { city: "Morganhill", county: "Santa Clara County", state: "CA", country: "US" } };
    vi.stubGlobal("fetch", vi.fn(async (input: URL | string, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.hostname.includes("overpass")) {
        return json({ elements: [
          { type: "node", id: 1, lat: 37.1305, lon: -121.6544, tags: { name: "Morgan Hill", place: "city", "addr:state": "CA" } },
          { type: "node", id: 2, lat: 37.0852, lon: -121.6103, tags: { name: "San Martin", place: "town", "addr:state": "CA" } },
          { type: "node", id: 3, lat: 37.0058, lon: -121.5683, tags: { name: "Gilroy", place: "city", "addr:state": "CA" } },
        ] });
      }
      if (url.pathname.endsWith("/geocode") && init?.method !== "POST") return json({ results: [morganHillCenter] });
      return json({}, 503);
    }));
    const area = await resolveSearchArea("Morgan Hill, CA", 25);
    expect(area.centerCheck.status).toBe("verified");
  });
});

/**
 * The real Geocodio response for "Mountain View, CA" (observed 2026-10-29, limit=10): one result
 * per postal code, ascending, every one `accuracy: 1, accuracy_type: "place"`. 94039, 94035 and
 * 94042 are non-deliverable codes sharing one placeholder coordinate 25 miles south of the city.
 */
const placeholderPoint = { lat: 37.18940, lng: -121.70533 };
const mountainViewPostalResults = [
  { formatted_address: "Mountain View, CA 94039", location: placeholderPoint, accuracy: 1, accuracy_type: "place", address_components: { city: "Mountain View", county: "Santa Clara County", state: "CA", zip: "94039", country: "US" } },
  { formatted_address: "Mountain View, CA 94040", location: { lat: 37.380566, lng: -122.085286 }, accuracy: 1, accuracy_type: "place", address_components: { city: "Mountain View", county: "Santa Clara County", state: "CA", zip: "94040", country: "US" } },
  { formatted_address: "Mountain View, CA 94041", location: { lat: 37.388528, lng: -122.075734 }, accuracy: 1, accuracy_type: "place", address_components: { city: "Mountain View", county: "Santa Clara County", state: "CA", zip: "94041", country: "US" } },
  { formatted_address: "Mountain View, CA 94043", location: { lat: 37.421861, lng: -122.070890 }, accuracy: 1, accuracy_type: "place", address_components: { city: "Mountain View", county: "Santa Clara County", state: "CA", zip: "94043", country: "US" } },
  { formatted_address: "Mountain View, CA 94035", location: placeholderPoint, accuracy: 1, accuracy_type: "place", address_components: { city: "Mountain View", county: "Santa Clara County", state: "CA", zip: "94035", country: "US" } },
  { formatted_address: "Mountain View, CA 94042", location: placeholderPoint, accuracy: 1, accuracy_type: "place", address_components: { city: "Mountain View", county: "Santa Clara County", state: "CA", zip: "94042", country: "US" } },
];

const peninsulaTowns = [
  { type: "node", id: 1, lat: 37.3861, lon: -122.0839, tags: { name: "Mountain View", place: "city", "addr:state": "CA", population: "82000" } },
  { type: "node", id: 2, lat: 37.4419, lon: -122.143, tags: { name: "Palo Alto", place: "city", "addr:state": "CA", population: "68000" } },
  { type: "node", id: 3, lat: 37.3688, lon: -122.0363, tags: { name: "Sunnyvale", place: "city", "addr:state": "CA", population: "155000" } },
];
const southCountyTowns = [
  { type: "node", id: 4, lat: 37.1305, lon: -121.6544, tags: { name: "Morgan Hill", place: "city", "addr:state": "CA", population: "45000" } },
  { type: "node", id: 5, lat: 37.0852, lon: -121.6103, tags: { name: "San Martin", place: "town", "addr:state": "CA", population: "7000" } },
  { type: "node", id: 6, lat: 37.0058, lon: -121.5683, tags: { name: "Gilroy", place: "city", "addr:state": "CA", population: "59000" } },
];

/** Overpass answers for whichever center the query was built around. */
const townsAroundRequestedCenter = (overpassQuery: string) =>
  overpassQuery.includes("37.1894") ? southCountyTowns : peninsulaTowns;

describe("A confident geocoder match can still be a placeholder", () => {
  it("discards postal codes that share one coordinate and centers on a real one", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: URL | string, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.hostname.includes("overpass")) return json({ elements: peninsulaTowns });
      if (url.pathname.endsWith("/geocode") && init?.method !== "POST") return json({ results: mountainViewPostalResults });
      return json({}, 503);
    }));
    const area = await resolveSearchArea("Mountain View, CA", 25);
    expect(area.latitude).toBeCloseTo(37.380566, 4);
    expect(area.longitude).toBeCloseTo(-122.085286, 4);
    expect(area.centerCheck.status).toBe("verified");
    expect(area.centerAdjustment).toContain("Postal-code placeholder coordinates were discarded");
    expect(area.searchQueries.some((query) => query.includes("Gilroy"))).toBe(false);
  });

  it("asks for enough results to see the placeholder at all", async () => {
    const requested: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | string, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.hostname.includes("overpass")) return json({ elements: peninsulaTowns });
      if (url.pathname.endsWith("/geocode") && init?.method !== "POST") {
        requested.push(url.searchParams.get("limit") ?? "");
        return json({ results: mountainViewPostalResults });
      }
      return json({}, 503);
    }));
    await resolveSearchArea("Mountain View, CA", 25);
    expect(requested[0]).toBe("10");
  });

  it("keeps the first result when every coordinate repeats, and lets the center check judge it", async () => {
    const allPlaceholders = mountainViewPostalResults
      .filter((result) => result.location === placeholderPoint)
      .map((result, index) => ({ ...result, address_components: { ...result.address_components, zip: `9403${index}` } }));
    vi.stubGlobal("fetch", vi.fn(async (input: URL | string, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.hostname.includes("overpass")) return json({ elements: southCountyTowns });
      if (url.pathname.endsWith("/geocode") && init?.method !== "POST") return json({ results: allPlaceholders });
      return json({}, 503);
    }));
    const area = await resolveSearchArea("Mountain View, CA", 25);
    expect(area.latitude).toBeCloseTo(37.1894, 3);
    expect(area.centerCheck.status).toBe("unverified");
    expect(area.centerAdjustment).toBeUndefined();
  });
});

describe("An uncorroborated center is corrected, not just labelled", () => {
  it("adopts the backup geocoder's center when that one passes the check", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: URL | string, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.hostname.includes("overpass")) {
        return json({ elements: townsAroundRequestedCenter(String(new URLSearchParams(String(init?.body)).get("data"))) });
      }
      if (url.hostname.includes("nominatim")) return json(nominatimMountainView);
      // Only the placeholder comes back, so the picker has nothing better to choose.
      if (url.pathname.endsWith("/geocode") && init?.method !== "POST") return json({ results: [mountainViewPostalResults[0]] });
      return json({}, 503);
    }));
    const area = await resolveSearchArea("Mountain View, CA", 25);
    expect(area.latitude).toBeCloseTo(37.3861, 3);
    expect(area.centerCheck.status).toBe("verified");
    expect(area.centerAdjustment).toContain("could not be corroborated and was discarded");
    expect(area.centerAdjustment).toContain("miles away");
    expect(area.nearbyPlaces.map((place) => place.name)).toContain("Palo Alto");
  });

  it("keeps the original center and its warning when the backup cannot be corroborated either", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: URL | string, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.hostname.includes("overpass")) return json({ elements: southCountyTowns });
      if (url.hostname.includes("nominatim")) return json(nominatimMountainView);
      if (url.pathname.endsWith("/geocode") && init?.method !== "POST") return json({ results: [mountainViewPostalResults[0]] });
      return json({}, 503);
    }));
    const area = await resolveSearchArea("Mountain View, CA", 25);
    expect(area.latitude).toBeCloseTo(37.1894, 3);
    expect(area.centerCheck.status).toBe("unverified");
    expect(area.centerCheck.note).toContain("Mountain View is not among the localities");
  });
});
