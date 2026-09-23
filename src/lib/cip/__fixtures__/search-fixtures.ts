import type { GeocodedSearchArea } from "@/lib/cip/geography-engine";
import { buildStrategicState } from "@/lib/cip/strategic-state";
import type { buildConversationOutcome } from "@/lib/cip/conversation-outcomes";

/**
 * Invented organizations, places, and roles for tests. Nothing here describes a real user or
 * employer: the app itself reads all of this from each user's own rows at run time.
 * Import from tests only.
 */

export const FIXTURE_NOW = "2026-09-23T12:00:00.000Z";

export const fixtureArea: GeocodedSearchArea = {
  query: "White River Junction, VT",
  displayName: "White River Junction, Vermont, USA",
  latitude: 43.648,
  longitude: -72.319,
  radiusMiles: 25,
  city: "White River Junction",
  county: "Windsor County",
  state: "Vermont",
  country: "US",
  attribution: "test",
  searchQueries: [],
  nearbyPlaces: [
    { name: "Hanover", placeType: "town", state: "New Hampshire", latitude: 43.7, longitude: -72.29, distanceMiles: 6.4 },
    { name: "Lebanon", placeType: "city", state: "New Hampshire", latitude: 43.64, longitude: -72.25, distanceMiles: 3.6 },
    { name: "Norwich", placeType: "town", state: "Vermont", latitude: 43.72, longitude: -72.31, distanceMiles: 5.1 },
  ],
};

export function fixtureStrategicState(outcomes: ReturnType<typeof buildConversationOutcome>[] = []) {
  return buildStrategicState({
    latestAdvisor: {
      roleBriefs: [
        { role: "Program Operations Lead", whyItFits: "Ran programs.", evidenceNeeded: "Metrics." },
        { role: "Communications Manager", whyItFits: "Wrote for audiences.", evidenceNeeded: "Samples." },
      ],
    } as never,
    conversationOutcomes: outcomes,
    watchedEmployers: [
      { name: "Riverbend Health", region: "Upper Valley", fit_score: 80 },
      { name: "Granite Community Trust", region: "Upper Valley", fit_score: 66 },
    ],
    employerCandidates: [{ name: "Valley Arts Council", region: "Upper Valley", fit_score: 58 }],
  });
}
