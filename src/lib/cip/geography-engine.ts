import { normalizeStateCode } from "@/lib/cip/us-states";

export interface GeocodedSearchArea {
  query: string;
  displayName: string;
  latitude: number;
  longitude: number;
  radiusMiles: number;
  /** The city component the geocoder actually returned; empty when it returned none. */
  city: string;
  /** `city` when the geocoder gave one, else the place the user asked for. Labels and generated
   * queries use this; it is never evidence of where the coordinates actually are. */
  cityLabel: string;
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
  /** Whether the localities found around the center corroborate that it is in the requested
   * place. "unverified" means the center was not confirmed, not that it is definitely wrong. */
  centerCheck: CenterCheck;
  /** Set when the center is not the geocoder's first answer, saying what was changed and why. */
  centerAdjustment?: string;
  attribution: string;
}

export interface CenterCheck {
  status: "verified" | "unverified";
  note: string;
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
  /** Geocodio's own confidence, 0-1. */
  accuracy?: number;
  /** How precisely Geocodio matched: "rooftop", "place", "county", "state", and so on. */
  accuracy_type?: string;
  address_components?: {
    city?: string;
    county?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
}

interface GeocodedCenter {
  displayName: string;
  latitude: number;
  longitude: number;
  /** What the geocoder returned, never backfilled from the user's query: substituting the query
   * disguises a coarse match as a precise one and leaves nothing downstream able to tell. */
  city: string;
  cityLabel: string;
  county: string;
  state: string;
  country: string;
  /** How this center was arrived at when it was not simply the geocoder's first answer. */
  adjustment: string;
  attribution: string;
}

type GeocodeAttempt = { ok: true; center: GeocodedCenter } | { ok: false; reason: string };

/**
 * Accuracy types that locate a point no better than a county, state or country centroid. A
 * bounded radius search cannot be built on one: in the 2026-10-29 Mountain View run a centroid
 * 25 miles from the requested city produced the wrong nearby towns, sent 20 of 24 source
 * queries to the wrong municipalities, and made the radius check compare the bad point with
 * itself, because candidate locations are geocoded through this same call.
 */
const COARSE_ACCURACY_TYPES = new Set(["county", "state", "country"]);
const MIN_GEOCODIO_ACCURACY = 0.5;
/** Enough results to see every postal code of a city, so a placeholder coordinate is detectable. */
const GEOCODIO_RESULT_LIMIT = 10;
/** Fewer surrounding localities than this proves nothing either way about the center. */
const CENTER_CHECK_MIN_PLACES = 3;

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
  let geocoded = await geocode(query);
  let nearby = await findNearbyPlaces(geocoded, radiusMiles);
  let centerCheck = checkCenterContainment(geocoded, nearby.places, nearby.lookup);

  // Detecting a bad center without correcting it leaves an honest but useless search. The primary
  // geocoder can report full confidence in a placeholder coordinate, so when the center is not
  // among its own neighbours, ask the other geocoder and keep its answer only if that one passes.
  if (centerCheck.status === "unverified" && hasGeocodioKey()) {
    const corrected = await retryWithBackupGeocoder(query, radiusMiles, geocoded);
    if (corrected) {
      geocoded = corrected.center;
      nearby = corrected.nearby;
      centerCheck = corrected.centerCheck;
    }
  }

  const { places: nearbyPlaces, lookup: nearbyLookup, source: nearbySource } = nearby;
  const searchQueries = buildSearchQueries(geocoded, nearbyPlaces, radiusMiles);

  return {
    query,
    displayName: geocoded.displayName,
    latitude: geocoded.latitude,
    longitude: geocoded.longitude,
    radiusMiles,
    city: geocoded.city,
    cityLabel: geocoded.cityLabel,
    county: geocoded.county,
    state: geocoded.state,
    country: geocoded.country,
    nearbyPlaces,
    nearbyLookup,
    nearbySource,
    searchQueries,
    centerCheck,
    centerAdjustment: geocoded.adjustment || undefined,
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

function hasGeocodioKey() {
  return Boolean(import.meta.env.GEOCODIO_API_KEY || process.env.GEOCODIO_API_KEY);
}

/**
 * Second opinion on a center its own neighbours did not corroborate. The backup center is adopted
 * only when it is somewhere else AND passes the same check, so a failure here leaves the original
 * result and its warning rather than swapping one unverified center for another. Costs one extra
 * geocode and one extra nearby lookup, and only on a center that already failed.
 */
async function retryWithBackupGeocoder(query: string, radiusMiles: number, rejected: GeocodedCenter) {
  let center: GeocodedCenter;
  try {
    center = await geocodeWithNominatim(query);
  } catch {
    return null;
  }
  const movedMiles = round1(straightLineMiles(rejected.latitude, rejected.longitude, center.latitude, center.longitude));
  if (movedMiles < 1) return null;
  const nearby = await findNearbyPlaces(center, radiusMiles);
  const centerCheck = checkCenterContainment(center, nearby.places, nearby.lookup);
  if (centerCheck.status !== "verified") return null;
  const adjustment = `The first geocoder's center could not be corroborated and was discarded; this center is the backup geocoder's, ${movedMiles} miles away.`;
  return {
    center: { ...center, adjustment },
    nearby,
    centerCheck: { status: "verified" as const, note: `${centerCheck.note} ${adjustment}` },
  };
}

async function geocode(query: string): Promise<GeocodedCenter> {
  const geocodioKey = import.meta.env.GEOCODIO_API_KEY || process.env.GEOCODIO_API_KEY;
  let coarseReason = "";
  if (geocodioKey) {
    const attempt = await geocodeWithGeocodio(query, geocodioKey);
    if (attempt?.ok) return attempt.center;
    // A county- or state-level centroid is not a search center. Try the other geocoder rather
    // than silently drawing a radius around the middle of a county.
    if (attempt) coarseReason = attempt.reason;
  }

  try {
    return await geocodeWithNominatim(query);
  } catch (error) {
    if (coarseReason) {
      throw new Error(
        `Could not locate "${query}" precisely enough for a bounded radius search: ${coarseReason}, and the backup geocoder was unavailable. Try adding the state, or searching a nearby larger city.`,
      );
    }
    throw error;
  }
}

/**
 * Picks which of Geocodio's results is the city.
 *
 * A city-only query returns one result per postal code in that city, ascending, and every one is
 * reported as `accuracy: 1, accuracy_type: "place"`. "Mountain View, CA" returns six: 94040, 94041
 * and 94043 are real centroids in the city, while 94039, 94035 and 94042 are non-deliverable codes
 * that all share one identical coordinate 25 miles south, in the interior of Santa Clara County.
 * `limit=1` took that placeholder and no confidence field could have revealed it, because Geocodio
 * reports full confidence in all six. Distinct postal codes cannot genuinely share a centroid, so a
 * repeated coordinate is the tell: discard those, then keep Geocodio's own ordering, which now
 * starts at a real centroid. Verified against Gilroy CA, Norwich VT and White River Junction VT,
 * whose postal codes all have distinct coordinates and are therefore untouched by this.
 */
function chooseGeocodioResult(results: GeocodioResult[]) {
  if (!results.length) return null;
  const postalCodesByPoint = new Map<string, Set<string>>();
  for (const result of results) {
    const key = coordinateKey(result);
    const codes = postalCodesByPoint.get(key) ?? new Set<string>();
    codes.add(result.address_components?.zip ?? "");
    postalCodesByPoint.set(key, codes);
  }
  const distinct = results.filter((result) => (postalCodesByPoint.get(coordinateKey(result))?.size ?? 0) < 2);
  // Every coordinate repeated leaves nothing better to choose; the center check judges the result.
  if (!distinct.length) return { result: results[0], discardedPlaceholder: false };
  return { result: distinct[0], discardedPlaceholder: distinct.length < results.length };
}

/** About 11 metres, which is finer than any two real postal-code centroids coincide. */
function coordinateKey(result: GeocodioResult) {
  return `${Number(result.location.lat).toFixed(4)},${Number(result.location.lng).toFixed(4)}`;
}

/** First segment of the query ("Mountain View" from "Mountain View, CA") for labels only. */
function queryPlaceLabel(query: string) {
  const [first] = query.split(",");
  return (first ?? "").trim() || query.trim();
}

async function geocodeWithGeocodio(query: string, apiKey: string): Promise<GeocodeAttempt | null> {
  const url = new URL("https://api.geocod.io/v1.12/geocode");
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", apiKey);
  // Not 1: a city-only query returns one result per postal code, and the first can be a
  // placeholder. See chooseGeocodioResult.
  url.searchParams.set("limit", String(GEOCODIO_RESULT_LIMIT));

  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) return null;

  const payload = (await response.json()) as { results?: GeocodioResult[] };
  const chosen = chooseGeocodioResult(payload.results ?? []);
  if (!chosen) return null;
  const first = chosen.result;

  const latitude = Number(first.location.lat);
  const longitude = Number(first.location.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const accuracyType = (first.accuracy_type ?? "").trim().toLowerCase();
  if (COARSE_ACCURACY_TYPES.has(accuracyType)) {
    return { ok: false, reason: `the geocoder matched "${query}" only to ${accuracyType} level` };
  }
  if (typeof first.accuracy === "number" && first.accuracy < MIN_GEOCODIO_ACCURACY) {
    return { ok: false, reason: `the geocoder reported low confidence (${first.accuracy}) for "${query}"` };
  }

  const address = first.address_components ?? {};
  const city = address.city || "";
  return {
    ok: true,
    center: {
      displayName: first.formatted_address,
      latitude,
      longitude,
      city,
      cityLabel: city || queryPlaceLabel(query),
      county: address.county || "",
      state: address.state || "",
      country: address.country || "US",
      adjustment: chosen.discardedPlaceholder
        ? "Postal-code placeholder coordinates were discarded before choosing this center."
        : "",
      attribution: "Geocoding data from Geocodio.",
    },
  };
}

async function geocodeWithNominatim(query: string): Promise<GeocodedCenter> {
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

  const city = address.city || address.town || address.village || address.hamlet || "";
  return {
    displayName: first.display_name,
    latitude,
    longitude,
    city,
    cityLabel: city || queryPlaceLabel(query),
    county: address.county || "",
    // Nominatim spells the state out ("California"); Geocodio returns a code. Normalize so the
    // backup geocoder, now a routine path rather than a last resort, builds the same queries.
    state: normalizeStateCode(address.state) || address.state || "",
    country: address.country || "",
    adjustment: "",
    attribution: first.licence || "Geocoding data from OpenStreetMap/Nominatim.",
  };
}

async function findNearbyPlaces(
  center: GeocodedCenter,
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
  center: GeocodedCenter,
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
  center: GeocodedCenter,
  nearbyPlaces: NearbyPlace[],
  radiusMiles: number,
) {
  const state = center.state ? ` ${center.state}` : "";
  const county = center.county ? `${center.county}${state}` : "";
  const label = center.cityLabel;
  const placeNames = dedupeStrings([
    label,
    ...[...nearbyPlaces]
      .sort((a, b) => a.distanceMiles - b.distanceMiles)
      .slice(0, 14)
      .map((place) => place.name),
  ]);
  // A nearby town never inherits the center state: a river may be a state border.
  const stateByPlace = new Map(nearbyPlaces.filter((place) => place.state).map((place) => [place.name, place.state]));
  const stateFor = (place: string) => {
    const known = stateByPlace.get(place);
    return known ? ` ${known}` : place === label ? state : "";
  };

  const queries = [
    `${label}${state} major employers within ${radiusMiles} miles`,
    `${label}${state} chamber of commerce business directory`,
    `${label}${state} economic development employers`,
  ];

  if (county) {
    queries.push(`${county} major employers`);
    queries.push(`${county} economic development business directory`);
  }

  // Reserve anchor-sector coverage before the capped nearby-town query list.
  queries.push(`${label}${state} healthcare employers`, `${label}${state} higher education employers`, `${label}${state} manufacturing technology employers`);
  for (const place of placeNames.slice(0, 12)) {
    queries.push(`${place}${stateFor(place)} major employers`);
    queries.push(`${place}${stateFor(place)} chamber of commerce business directory`);
  }

  queries.push(`${label}${state} healthcare employers`);
  queries.push(`${label}${state} higher education employers`);
  queries.push(`${label}${state} manufacturing technology employers`);

  return dedupeStrings(queries).slice(0, 24);
}

/**
 * Corroborates the resolved center against the localities found around it. The geocoder is never
 * asked to prove it landed where the user asked, so this is the check that catches a center in
 * the wrong place: if the requested locality is not among its own neighbours, every distance and
 * generated query built from that point is unreliable. Thin coverage proves nothing either way
 * and is reported as unverified rather than as a wrong center.
 */
function checkCenterContainment(
  center: GeocodedCenter,
  nearbyPlaces: NearbyPlace[],
  nearbyLookup: "ok" | "fallback",
): CenterCheck {
  const requested = normalizePlaceName(center.cityLabel);
  if (!requested) {
    return { status: "unverified", note: "No place name was available to corroborate the search center against." };
  }
  if (nearbyLookup === "fallback" || nearbyPlaces.length < CENTER_CHECK_MIN_PLACES) {
    return {
      status: "unverified",
      note: `Too few surrounding localities were found to confirm this center is in ${center.cityLabel}.`,
    };
  }
  if (nearbyPlaces.some((place) => normalizePlaceName(place.name) === requested)) {
    return { status: "verified", note: `${center.cityLabel} is among the localities found around this center.` };
  }
  const nearest = [...nearbyPlaces]
    .sort((a, b) => a.distanceMiles - b.distanceMiles)
    .slice(0, 3)
    .map((place) => place.name)
    .join(", ");
  return {
    status: "unverified",
    note: `${center.cityLabel} is not among the localities found around this center (nearest: ${nearest}). The center may be in the wrong place, so the distances and generated queries below cannot be relied on.`,
  };
}

/** Letters only, so "Morgan Hill" and Geocodio's "Morganhill" compare equal. */
function normalizePlaceName(name: string) {
  return name.toLowerCase().replace(/[^a-z]/g, "");
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
async function recoverNearbyPlaces(center: GeocodedCenter, radiusMiles: number) {
  // The center is not a nearby place. Emitting it as one at zero miles asserted a distance to a
  // locality nobody had confirmed the center was in, which is what made a county centroid read
  // as "Mountain View, CA (0 mi)".
  const fallback = { places: [] as NearbyPlace[], lookup: "fallback" as const, source: "center_only" as const };
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
  const recovered = dedupePlaces(places).sort((a, b) => a.distanceMiles - b.distanceMiles);
  return recovered.length ? { places: recovered, lookup: "ok" as const, source: "geocodio_samples" as const } : fallback;
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
