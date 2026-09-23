import { straightLineMiles } from "@/lib/cip/geography-engine";
import type { BriefAnchor, BriefLaneWeight, OutboundSearchFacets } from "@/lib/cip/search-brief";
import { normalizeStateCode } from "@/lib/cip/us-states";

/**
 * Geographic grounding of the weekly search (Rethink build step 2). Pure functions only:
 * geocoding itself happens in `brief-loader.ts`.
 *
 * Two rules from the plan hold throughout:
 *  - Distance is straight-line miles from a geocoded anchor. It is not driving distance or
 *    commute time, and it is never derived from string similarity.
 *  - A location that cannot be resolved is `unknown` (or `ambiguous`), never assumed inside
 *    or outside the radius. The nearby-locality list is capped and holds only cities, towns,
 *    and villages, so "not on the list" does not mean "out of range."
 */

export interface WorksiteInput {
  /** Worksite text as found on the source, e.g. "Lebanon, NH". */
  locationText?: string | null;
  /** Geocoded worksite coordinates, when the caller has them. */
  latitude?: number | null;
  longitude?: number | null;
}

export type LocationStatus = "within" | "outside" | "unknown" | "ambiguous";

export interface LocationAssessment {
  status: LocationStatus;
  /** Straight-line miles from the nearest anchor, when known. */
  distanceMiles: number | null;
  anchorLabel: string | null;
  basis: "coordinates" | "locality-list" | "none";
  note: string;
}

export function assessWorksite(anchors: BriefAnchor[], site: WorksiteInput): LocationAssessment {
  if (!anchors.length) {
    return unknown("No location anchor is configured, so distance cannot be judged.");
  }

  if (isFiniteNumber(site.latitude) && isFiniteNumber(site.longitude)) {
    const nearest = anchors
      .map((anchor) => ({
        anchor,
        miles: round1(straightLineMiles(anchor.latitude, anchor.longitude, site.latitude as number, site.longitude as number)),
      }))
      .sort((a, b) => a.miles - b.miles)[0];
    const within = nearest.miles <= nearest.anchor.radiusMiles;
    return {
      status: within ? "within" : "outside",
      distanceMiles: nearest.miles,
      anchorLabel: nearest.anchor.label,
      basis: "coordinates",
      note: `${nearest.miles} mi straight-line from ${nearest.anchor.label}${within ? "" : ` (search radius is ${nearest.anchor.radiusMiles} mi)`}.`,
    };
  }

  const parsed = parseLocationText(site.locationText ?? "");
  if (!parsed.city) return unknown("The source gave no usable worksite location.");

  const matches: Array<{ anchor: BriefAnchor; name: string; state: string; miles: number; verified: boolean }> = [];
  for (const anchor of anchors) {
    const known = [
      { name: anchor.centerCity, state: normalizeStateCode(anchor.state), miles: 0 },
      ...anchor.localities.map((locality) => ({
        name: locality.name,
        state: normalizeStateCode(locality.state),
        miles: locality.distanceMiles,
      })),
    ];
    for (const place of known) {
      if (normalizeName(place.name) !== parsed.city) continue;
      if (parsed.state && place.state && parsed.state !== place.state) continue;
      matches.push({ anchor, name: place.name, state: place.state, miles: place.miles, verified: Boolean(place.state) });
    }
  }

  if (!matches.length) {
    return unknown(`"${site.locationText}" is not among the searched localities. Its distance is unknown; coordinates are needed to judge it.`);
  }

  if (matches.some((match) => !match.verified)) {
    return {
      status: "ambiguous",
      distanceMiles: null,
      anchorLabel: null,
      basis: "locality-list",
      note: `"${site.locationText}" resembles a nearby locality whose state could not be verified. Confirm the worksite before treating it as in range.`,
    };
  }

  const states = new Set(matches.map((match) => match.state));
  if (!parsed.state && states.size > 1) {
    return {
      status: "ambiguous",
      distanceMiles: null,
      anchorLabel: null,
      basis: "locality-list",
      note: `"${site.locationText}" matches localities in more than one state (${[...states].join(", ")}). Confirm the worksite.`,
    };
  }

  const best = matches.sort((a, b) => a.miles - b.miles)[0];
  return {
    status: "within",
    distanceMiles: best.miles,
    anchorLabel: best.anchor.label,
    basis: "locality-list",
    note: `Matched ${best.name}${best.state ? `, ${best.state}` : ""}, about ${best.miles} mi straight-line from ${best.anchor.label} (locality center, not the exact worksite).`,
  };
}

const STATUS_ORDER: Record<LocationStatus, number> = { within: 0, ambiguous: 1, unknown: 2, outside: 3 };

/** Nearest first among in-range results; unknown and ambiguous are kept visible, never dropped. */
export function rankByProximity<T extends { location: LocationAssessment }>(items: T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const byStatus = STATUS_ORDER[a.item.location.status] - STATUS_ORDER[b.item.location.status];
      if (byStatus !== 0) return byStatus;
      const distanceA = a.item.location.distanceMiles ?? Number.POSITIVE_INFINITY;
      const distanceB = b.item.location.distanceMiles ?? Number.POSITIVE_INFINITY;
      return distanceA - distanceB || a.index - b.index;
    })
    .map(({ item }) => item);
}

export interface RoleSearchScope {
  laneId: string;
  weight: BriefLaneWeight;
  roleTerm: string;
  /** Anchor label, or null for the remote-eligible scope. */
  anchorLabel: string | null;
  /** "Lebanon, NH" style names the provider should cover for this scope. */
  localities: string[];
  queryText: string;
}

const LANE_ORDER: Record<BriefLaneWeight, number> = { primary: 0, alternate: 1, research: 2 };

/**
 * Turns the outbound facets into bounded search scopes: one per lane term and anchor, each
 * carrying the anchor's real labor-shed localities, plus a remote scope when remote is
 * accepted. Built from `OutboundSearchFacets` on purpose, so nothing private can reach a
 * provider through this path. Output order is deterministic and capped.
 */
export function buildRoleSearchScopes(
  facets: OutboundSearchFacets,
  options: { maxScopes?: number; termsPerLane?: number; localitiesPerScope?: number } = {},
): RoleSearchScope[] {
  const maxScopes = options.maxScopes ?? 12;
  const termsPerLane = options.termsPerLane ?? 2;
  const localityCap = options.localitiesPerScope ?? 8;
  const lanes = [...facets.roleVocabulary].sort((a, b) => LANE_ORDER[a.weight] - LANE_ORDER[b.weight]);
  const remote = facets.workModes.includes("remote");
  const scopes: RoleSearchScope[] = [];

  for (let termIndex = 0; termIndex < termsPerLane; termIndex += 1) {
    for (const lane of lanes) {
      const term = lane.terms[termIndex];
      if (!term) continue;
      for (const area of facets.areas) {
        const localities = area.localities.slice(0, localityCap).map((place) => localityLabel(place.name, place.state));
        scopes.push({
          laneId: lane.laneId,
          weight: lane.weight,
          roleTerm: term,
          anchorLabel: area.label,
          localities,
          queryText: `${term} openings in or near ${area.label} (within ${area.radiusMiles} miles)${localities.length ? `, including ${localities.join(", ")}` : ""}`,
        });
      }
      if (remote && lane.weight !== "research") {
        scopes.push({
          laneId: lane.laneId,
          weight: lane.weight,
          roleTerm: term,
          anchorLabel: null,
          localities: [],
          queryText: `${term} remote-eligible openings`,
        });
      }
    }
  }
  return scopes.slice(0, maxScopes);
}

function parseLocationText(text: string): { city: string; state: string } {
  const cleaned = text.replace(/\b(united states|usa|us)\b/gi, "").replace(/\s+/g, " ").trim();
  if (!cleaned) return { city: "", state: "" };
  const commaParts = cleaned.split(",").map((part) => part.trim()).filter(Boolean);
  if (commaParts.length >= 2) {
    return { city: normalizeName(commaParts[0]), state: normalizeStateCode(commaParts[commaParts.length - 1]) };
  }
  return { city: normalizeName(cleaned), state: "" };
}

function localityLabel(name: string, state: string) {
  const code = normalizeStateCode(state);
  return code ? `${name}, ${code}` : name;
}

function unknown(note: string): LocationAssessment {
  return { status: "unknown", distanceMiles: null, anchorLabel: null, basis: "none", note };
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}
