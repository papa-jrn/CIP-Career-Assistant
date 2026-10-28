import { geocodeCoordinates, straightLineMiles, type GeocodedSearchArea } from "./geography-engine";
import type { BusinessSearchCandidate } from "./business-search-engine";

export interface BusinessLocationCheck { name: string; location: string; status: "within" | "outside" | "unknown"; distanceMiles: number | null }
/** City/address geocoding establishes approximate radius, never workplace or employer authenticity. */
export async function checkBusinessLocations(candidates: BusinessSearchCandidate[], area: GeocodedSearchArea, geocoder = geocodeCoordinates) {
  const cache = new Map<string, Awaited<ReturnType<typeof geocoder>>>();
  const kept: BusinessSearchCandidate[] = [];
  const checks: BusinessLocationCheck[] = [];
  let calls = 0;
  for (const candidate of candidates) {
    const location = (candidate.location ?? "").trim();
    let coords = cache.get(location) ?? null;
    if (location && !cache.has(location) && calls < 12) {
      if (calls && !(import.meta.env.GEOCODIO_API_KEY || process.env.GEOCODIO_API_KEY) && geocoder === geocodeCoordinates) await new Promise(done => setTimeout(done, 1100));
      calls++;
      try { coords = await geocoder(location); } catch { coords = null; }
      cache.set(location, coords);
    }
    const distance = coords ? straightLineMiles(area.latitude, area.longitude, coords.latitude, coords.longitude) : null;
    const status = distance === null ? "unknown" : distance <= area.radiusMiles ? "within" : "outside";
    const rounded = distance === null ? null : Math.round(distance * 10) / 10;
    checks.push({ name: candidate.name, location, status, distanceMiles: rounded });
    if (status === "outside") continue;
    const note = status === "unknown" ? "Location could not be geocoded; inclusion within your radius is not confirmed." : `Reported location geocoded about ${rounded} miles from the search center (straight-line, approximate locality/address point).`;
    kept.push({ ...candidate, confidence: status === "unknown" ? "low" : candidate.confidence, source_notes: [...(candidate.source_notes ?? []), { label: "Search radius check", value: note, url: "" }] });
  }
  return { candidates: kept, checks };
}