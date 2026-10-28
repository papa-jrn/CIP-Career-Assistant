import { expect, it, vi } from "vitest";
import { checkBusinessLocations } from "./business-search-geography";
import type { BusinessSearchCandidate } from "./business-search-engine";
import type { GeocodedSearchArea } from "./geography-engine";

it("keeps a cross-state nearby employer and rejects an out-of-radius same-state employer", async () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  const area = { latitude: 43.7179, longitude: -72.3612, radiusMiles: 25 } as GeocodedSearchArea;
  const candidate = (name: string, location: string) => ({ name, location, confidence: "high", source_notes: [] } as unknown as BusinessSearchCandidate);
  const geocoder = vi.fn(async (location: string) => location.includes("Hanover") ? { latitude: 43.703, longitude: -72.289, displayName: location } : location.includes("Montpelier") ? { latitude: 44.260, longitude: -72.575, displayName: location } : null);
  const result = await checkBusinessLocations([candidate("Example College", "Hanover, NH"), candidate("Example State Group", "Montpelier, VT"), candidate("Unlocated Group", "Unknown")], area, geocoder);
  expect(result.candidates.map(row => row.name)).toEqual(["Example College", "Unlocated Group"]);
  expect(result.checks.map(row => row.status)).toEqual(["within", "outside", "unknown"]);
  expect(result.candidates[1].confidence).toBe("low");
  expect(result.candidates[1].source_notes[0].value).toContain("not confirmed");
  vi.unstubAllEnvs();
});