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
    const html = renderSearchArea({ mode: "live_web_search", geography: area.query, radiusMiles: 25, searchArea: area, summary: "Fixture", sourcePages: [], candidates: [] });
    expect(html).toContain("cross-border coverage is incomplete");
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
