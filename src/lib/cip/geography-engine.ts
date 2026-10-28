import { normalizeStateCode } from "@/lib/cip/us-states";

export interface GeocodedSearchArea {
  query: string;
  displayName: string;
  latitude: number;
  longitude: number;
  radiusMiles: number;
  city: string;
  county: string;
  state: string;
  country: string;
  nearbyPlaces: NearbyPlace[];
  /**
   * "ok" when the nearby-towns lookup succeeded. "fallback" means it failed (after one retry)
   * and `nearbyPlaces` holds only the center, so the labor shed was NOT expanded.
   */
  nearbyLookup: "ok" | "fallback";
  nearbySource?: "overpass" | "geocodio_samples" | "center_only";
  searchQueries: string[];
  attribution: string;
}

export interface NearbyPlace {
  name: string;
  placeType: string;
  /** Two-letter code once verified. Empty means unknown; it is never assumed from the search center. */
  state: string;
  latitude: number;
  longitude: number;
  distanceMiles: number;
  population?: number;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  licence?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    hamlet?: string;
    county?: string;
    state?: string;
    country?: string;
  };
}

interface GeocodioResult {
  formatted_address: string;
  location: {
    lat: number;
    lng: number;
  };
  address_components?: {
    city?: string;
    county?: string;
    state?: string;
    country?: string;
  };
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: {
    name?: string;
    place?: string;
    population?: string;
    "addr:state"?: string;
  };
}

export async function resolveSearchArea(query: string, radiusMiles: number): Promise<GeocodedSearchArea> {
  const geocoded = await geocode(query);
  const { places: nearbyPlaces, lookup: nearbyLookup, source: nearbySource } = await findNearbyPlaces(geocoded, radiusMiles);
  const searchQueries = buildSearchQueries(geocoded, nearbyPlaces, radiusMiles);

  return {
    query,
    displayName: geocoded.displayName,
    latitude: geocoded.latitude,
    longitude: geocoded.longitude,
    radiusMiles,
    city: geocoded.city,
    county: geocoded.county,
    state: geocoded.state,
    country: geocoded.country,
    nearbyPlaces,
    nearbyLookup,
    nearbySource,
    searchQueries,
    attribution: geocoded.attribution,
  };
}

/**
 * Lightweight coordinates-only geocoding for cases that just need lat/long
 * (e.g. building a static-map URL). Uses Geocodio when configured, falls back
 * to Nominatim. Deliberately does NOT run the heavy Overpass nearby-places
 * lookup that `resolveSearchArea` does, so it's fast and cheap. Returns null
 * on any failure so callers can fall back to a stylized graphic.
 */
export async function geocodeCoordinates(
  query: string,
): Promise<{ latitude: number; longitude: number; displayName: string } | null> {
  try {
    const result = await geocode(query);
    if (!Number.isFinite(result.latitude) || !Number.isFinite(result.longitude)) return null;
    return {
      latitude: result.latitude,
      longitude: result.longitude,
      displayName: result.displayName,
    };
  } catch {
    return null;
  }
}

async function geocode(query: string) {
  const geocodioKey = import.meta.env.GEOCODIO_API_KEY || process.env.GEOCODIO_API_KEY;
  if (geocodioKey) {
    const geocodioResult = await geocodeWithGeocodio(query, geocodioKey);
    if (geocodioResult) return geocodioResult;
  }

  return geocodeWithNominatim(query);
}

async function geocodeWithGeocodio(query: string, apiKey: string) {
  const url = new URL("https://api.geocod.io/v1.12/geocode");
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("limit", "1");

  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) return null;

  const payload = (await response.json()) as { results?: GeocodioResult[] };
  const first = payload.results?.[0];
  if (!first) return null;

  const latitude = Number(first.location.lat);
  const longitude = Number(first.location.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const address = first.address_components ?? {};
  return {
    displayName: first.formatted_address,
    latitude,
    longitude,
    city: address.city || query,
    county: address.county || "",
    state: address.state || "",
    country: address.country || "US",
    attribution: "Geocoding data from Geocodio.",
  };
}

async function geocodeWithNominatim(query: string) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "us");

  const response = await fetch(url, {
    headers: {
      "User-Agent": geocoderUserAgent(),
      Referer: "https://career-intelligence-platform.local",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) throw new Error(`Geocoding failed (${response.status}).`);

  const results = (await response.json()) as NominatimResult[];
  const first = results[0];
  if (!first) throw new Error(`Could not geocode "${query}".`);

  const address = first.address ?? {};
  const latitude = Number(first.lat);
  const longitude = Number(first.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error(`Geocoder returned invalid coordinates for "${query}".`);
  }

  return {
    displayName: first.display_name,
    latitude,
    longitude,
    city: address.city || address.town || address.village || address.hamlet || query,
    county: address.county || "",
    state: address.state || "",
    country: address.country || "",
    attribution: first.licence || "Geocoding data from OpenStreetMap/Nominatim.",
  };
}

async function findNearbyPlaces(
  center: Awaited<ReturnType<typeof geocode>>,
  radiusMiles: number,
): Promise<{ places: NearbyPlace[]; lookup: "ok" | "fallback"; source: "overpass" | "geocodio_samples" | "center_only" }> {
  const radiusMeters = Math.round(radiusMiles * 1609.344);
  const overpassUrl = import.meta.env.OVERPASS_URL || process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter";
  const query = `
    [out:json][timeout:25];
    (
      node["place"~"^(city|town|village)$"](around:${radiusMeters},${center.latitude},${center.longitude});
      way["place"~"^(city|town|village)$"](around:${radiusMeters},${center.latitude},${center.longitude});
      relation["place"~"^(city|town|village)$"](around:${radiusMeters},${center.latitude},${center.longitude});
    );
    out center tags;
  `;

  // The public Overpass servers are shared and intermittently time out or rate-limit, so try
  // twice. If both attempts fail, say so: the caller must not present a center-only result
  // as though the labor shed had been expanded.
  let elements: OverpassElement[] | null = null;
  for (let attempt = 1; attempt <= 2 && !elements; attempt += 1) {
    if (attempt > 1) await new Promise((done) => setTimeout(done, 1_500));
    elements = await fetchOverpassElements(overpassUrl, query);
  }
  if (!elements?.length) return recoverNearbyPlaces(center, radiusMiles);

  try {
    const places = elements
      .map((element) => toNearbyPlace(element, center))
      .filter((place): place is NearbyPlace => Boolean(place))
      .filter((place) => place.distanceMiles <= radiusMiles);

    const ranked = dedupePlaces(places)
      .sort((a, b) => {
        const populationDelta = (b.population ?? 0) - (a.population ?? 0);
        if (populationDelta !== 0) return populationDelta;
        return a.distanceMiles - b.distanceMiles;
      })
      .slice(0, 24);
    if (!ranked.length) return recoverNearbyPlaces(center, radiusMiles);
    return { places: await resolvePlaceStates(ranked), lookup: "ok", source: "overpass" };
  } catch (error) {
    console.warn("[geography] nearby-place processing failed:", error instanceof Error ? error.message : error);
    return recoverNearbyPlaces(center, radiusMiles);
  }
}

async function fetchOverpassElements(overpassUrl: string, query: string): Promise<OverpassElement[] | null> {
  try {
    const response = await fetch(overpassUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "User-Agent": geocoderUserAgent(),
      },
      body: new URLSearchParams({ data: query }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      console.warn(`[geography] Overpass responded ${response.status}`);
      return null;
    }
    const payload = (await response.json()) as { elements?: OverpassElement[] };
    return payload.elements ?? [];
  } catch (error) {
    console.warn("[geography] Overpass request failed:", error instanceof Error ? error.message : error);
    return null;
  }
}

function toNearbyPlace(
  element: OverpassElement,
  center: Awaited<ReturnType<typeof geocode>>,
): NearbyPlace | null {
  const tags = element.tags ?? {};
  const name = tags.name?.trim();
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  if (!name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return {
    name,
    placeType: tags.place || "place",
    // Overpass place nodes almost never carry a state, and towns across a state line (the
    // Connecticut River, for one) must not inherit the center's. Unknown stays "" until verified.
    state: normalizeStateCode(tags["addr:state"]),
    latitude: latitude as number,
    longitude: longitude as number,
    distanceMiles: round1(straightLineMiles(center.latitude, center.longitude, latitude as number, longitude as number)),
    population: parsePopulation(tags.population),
  };
}

function buildSearchQueries(
  center: Awaited<ReturnType<typeof geocode>>,
  nearbyPlaces: NearbyPlace[],
  radiusMiles: number,
) {
  const state = center.state ? ` ${center.state}` : "";
  const county = center.county ? `${center.county}${state}` : "";
  const placeNames = dedupeStrings([
    center.city,
    ...[...nearbyPlaces]
      .sort((a, b) => a.distanceMiles - b.distanceMiles)
      .slice(0, 14)
      .map((place) => place.name),
  ]);
  // A nearby town never inherits the center state: a river may be a state border.
  const stateByPlace = new Map(nearbyPlaces.filter((place) => place.state).map((place) => [place.name, place.state]));
  const stateFor = (place: string) => {
    const known = stateByPlace.get(place);
    return known ? ` ${known}` : place === center.city ? state : "";
  };

  const queries = [
    `${center.city}${state} major employers within ${radiusMiles} miles`,
    `${center.city}${state} chamber of commerce business directory`,
    `${center.city}${state} economic development employers`,
  ];

  if (county) {
    queries.push(`${county} major employers`);
    queries.push(`${county} economic development business directory`);
  }

  // Reserve anchor-sector coverage before the capped nearby-town query list.
  queries.push(`${center.city}${state} healthcare employers`, `${center.city}${state} higher education employers`, `${center.city}${state} manufacturing technology employers`);
  for (const place of placeNames.slice(0, 12)) {
    queries.push(`${place}${stateFor(place)} major employers`);
    queries.push(`${place}${stateFor(place)} chamber of commerce business directory`);
  }

  queries.push(`${center.city}${state} healthcare employers`);
  queries.push(`${center.city}${state} higher education employers`);
  queries.push(`${center.city}${state} manufacturing technology employers`);

  return dedupeStrings(queries).slice(0, 24);
}

function fallbackNearbyPlaces(center: Awaited<ReturnType<typeof geocode>>): NearbyPlace[] {
  return [
    {
      name: center.city,
      placeType: "center",
      state: center.state,
      latitude: center.latitude,
      longitude: center.longitude,
      distanceMiles: 0,
    },
  ].map((place) => ({ ...place, state: normalizeStateCode(place.state) }));
}

const STATE_LOOKUP_LIMIT = 12;
const NOMINATIM_MIN_INTERVAL_MS = 1_100;
const stateCache = new Map<string, string>();

/** Pulls the two-letter state out of a Nominatim reverse-geocode payload; empty when absent. */
export function parseNominatimStateCode(payload: unknown): string {
  const address = (payload as { address?: Record<string, string> } | null)?.address;
  if (!address) return "";
  const iso = address["ISO3166-2-lvl4"];
  if (typeof iso === "string" && iso.startsWith("US-")) return normalizeStateCode(iso.slice(3));
  return normalizeStateCode(address.state);
}

/**
 * Verifies the state of the nearest towns by reverse geocoding each one, one request at a time
 * (Nominatim asks for at most one per second). Results are cached in memory by rounded
 * coordinates. A failed lookup leaves the town's state unknown rather than guessing.
 */
async function resolvePlaceStates(places: NearbyPlace[]): Promise<NearbyPlace[]> {
  const nearest = [...places]
    .filter((place) => !place.state)
    .sort((a, b) => a.distanceMiles - b.distanceMiles)
    .slice(0, STATE_LOOKUP_LIMIT);
  const resolved = new Map<NearbyPlace, string>();
  const geocodioKey = import.meta.env.GEOCODIO_API_KEY || process.env.GEOCODIO_API_KEY;
  if (geocodioKey && nearest.length) {
    const rows = await geocodioBatch("reverse", nearest.map(place => `${place.latitude},${place.longitude}`), geocodioKey);
    nearest.forEach((place, index) => {
      const code = normalizeStateCode(rows?.[index]?.address_components?.state);
      if (code) resolved.set(place, code);
    });
  }
  let lastRequestAt = 0;

  for (const place of nearest) {
    if (resolved.has(place)) continue;
    const key = `${place.latitude.toFixed(3)},${place.longitude.toFixed(3)}`;
    const cached = stateCache.get(key);
    if (cached) {
      resolved.set(place, cached);
      continue;
    }
    const wait = lastRequestAt + NOMINATIM_MIN_INTERVAL_MS - Date.now();
    if (lastRequestAt && wait > 0) await new Promise((done) => setTimeout(done, wait));
    lastRequestAt = Date.now();
    const code = await reverseGeocodeState(place.latitude, place.longitude);
    if (code) {
      stateCache.set(key, code);
      resolved.set(place, code);
    }
  }

  return places.map((place) => (resolved.has(place) ? { ...place, state: resolved.get(place) as string } : place));
}

async function reverseGeocodeState(latitude: number, longitude: number): Promise<string> {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("lat", String(latitude));
    url.searchParams.set("lon", String(longitude));
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("zoom", "5");
    url.searchParams.set("addressdetails", "1");
    const response = await fetch(url, {
      headers: { "User-Agent": geocoderUserAgent() },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return "";
    return parseNominatimStateCode(await response.json());
  } catch {
    return "";
  }
}

function dedupePlaces(places: NearbyPlace[]) {
  const byKey = new Map<string, NearbyPlace>();
  for (const place of places) {
    const key = `${place.name.toLowerCase()}|${place.state.toLowerCase()}`;
    const current = byKey.get(key);
    if (!current || place.distanceMiles < current.distanceMiles) byKey.set(key, place);
  }
  return [...byKey.values()];
}

function dedupeStrings(items: string[]) {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function parsePopulation(population?: string) {
  if (!population) return undefined;
  const parsed = Number(population.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Great-circle (straight-line) miles. Not driving distance or commute time. */
export function straightLineMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
  const earthRadiusMiles = 3958.8;
  const dLat = degreesToRadians(lat2 - lat1);
  const dLon = degreesToRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(degreesToRadians(lat1)) * Math.cos(degreesToRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(a));
}

function degreesToRadians(value: number) {
  return (value * Math.PI) / 180;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function geocoderUserAgent() {
  return (
    import.meta.env.GEOCODER_USER_AGENT ||
    process.env.GEOCODER_USER_AGENT ||
    "CIP-Career-Assistant/0.1 (local development; contact: configure GEOCODER_USER_AGENT)"
  );
}

/** Bounded Geocodio recovery when the public nearby-place service is unavailable.
 * Sampling finds real locality names, then forward geocoding locates their centers.
 * It is disclosed as limited coverage, never a complete town or employer inventory.
 */
async function recoverNearbyPlaces(center: Awaited<ReturnType<typeof geocode>>, radiusMiles: number) {
  const fallback = { places: fallbackNearbyPlaces(center), lookup: "fallback" as const, source: "center_only" as const };
  const key = import.meta.env.GEOCODIO_API_KEY || process.env.GEOCODIO_API_KEY;
  if (!key) return fallback;
  const samples: string[] = [];
  for (const miles of [Math.min(5, radiusMiles / 4), radiusMiles * 0.3, radiusMiles * 0.6, radiusMiles * 0.85]) {
    for (let bearing = 0; bearing < 360; bearing += 45) {
      const radians = bearing * Math.PI / 180;
      const latitude = center.latitude + Math.cos(radians) * miles / 69;
      const longitude = center.longitude + Math.sin(radians) * miles / (69 * Math.cos(center.latitude * Math.PI / 180));
      samples.push(`${latitude},${longitude}`);
    }
  }
  const reverse = await geocodioBatch("reverse", samples, key);
  const names = [...new Set((reverse ?? []).flatMap(row => {
    const city = row?.address_components?.city?.trim();
    const state = normalizeStateCode(row?.address_components?.state);
    return city && state ? [`${city}, ${state}`] : [];
  }))].slice(0, 16);
  if (!names.length) return fallback;
  const centers = await geocodioBatch("geocode", names, key);
  const places: NearbyPlace[] = (centers ?? []).flatMap(row => {
    const name = row?.address_components?.city?.trim();
    const state = normalizeStateCode(row?.address_components?.state);
    const latitude = row?.location?.lat;
    const longitude = row?.location?.lng;
    if (!name || !state || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    const distance = straightLineMiles(center.latitude, center.longitude, latitude!, longitude!);
    if (distance > radiusMiles) return [];
    return [{ name, state, latitude: latitude!, longitude: longitude!, placeType: "locality", distanceMiles: round1(distance) }];
  });
  const recovered = dedupePlaces([...fallback.places, ...places]).sort((a, b) => a.distanceMiles - b.distanceMiles);
  return recovered.length > 1 ? { places: recovered, lookup: "ok" as const, source: "geocodio_samples" as const } : fallback;
}

async function geocodioBatch(endpoint: "reverse" | "geocode", inputs: string[], key: string): Promise<Array<GeocodioResult | undefined> | null> {
  try {
    const url = new URL(`https://api.geocod.io/v1.12/${endpoint}`);
    url.searchParams.set("api_key", key);
    url.searchParams.set("limit", "1");
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(inputs), signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return null;
    const payload = await response.json() as { results?: Array<{ response?: { results?: GeocodioResult[] } }> };
    return Array.isArray(payload.results) ? payload.results.map(row => row.response?.results?.[0]) : null;
  } catch { return null; }
}
