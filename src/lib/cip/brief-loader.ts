import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdvisorAnalysis } from "@/lib/cip/advisor";
import { resolveSearchArea, type GeocodedSearchArea } from "@/lib/cip/geography-engine";
import { loadLatestIntake } from "@/lib/cip/profile";
import { assembleSearchBrief, type SearchBrief } from "@/lib/cip/search-brief";
import {
  loadStoredSearchPreferences,
  resolveSearchPreferences,
  type AnchorRequest,
} from "@/lib/cip/search-preferences";
import { buildStrategicState, loadStrategicInputs } from "@/lib/cip/strategic-state";

export type AreaResolver = (query: string, radiusMiles: number) => Promise<GeocodedSearchArea>;

export interface ResolvedAnchors {
  areas: GeocodedSearchArea[];
  failures: Array<{ label: string; reason: string }>;
}

/**
 * Geocodes saved anchors one at a time (the public geocoders ask for no more than one request
 * per second) and keeps going when one fails. A failed anchor becomes a visible failure that the
 * brief reports as "not searched"; it is never silently dropped and never retried in a loop.
 */
export async function resolveAnchorRequests(
  requests: AnchorRequest[],
  resolver: AreaResolver = resolveSearchArea,
): Promise<ResolvedAnchors> {
  const areas: GeocodedSearchArea[] = [];
  const failures: ResolvedAnchors["failures"] = [];
  for (const request of requests) {
    try {
      areas.push(await resolver(request.label, request.radiusMiles));
    } catch (error) {
      failures.push({
        label: request.label,
        reason: error instanceof Error ? error.message.slice(0, 160) : "geocoding failed",
      });
    }
  }
  return { areas, failures };
}

/**
 * Builds the current private search brief for one user from their saved state: strategic
 * inputs, confirmed preferences, and freshly geocoded anchors. Read-only; it saves nothing.
 * (Persisting the brief on a run record is build step 3.)
 */
export async function loadSearchBrief(
  supabase: SupabaseClient,
  userId: string,
  options: { now?: string; resolver?: AreaResolver } = {},
): Promise<SearchBrief> {
  const [inputs, stored, intake] = await Promise.all([
    loadStrategicInputs(supabase, userId),
    loadStoredSearchPreferences(supabase, userId),
    loadLatestIntake(supabase, userId),
  ]);

  const { areas, failures } = await resolveAnchorRequests(stored.anchorRequests, options.resolver);
  const preferences = {
    ...resolveSearchPreferences(stored, intake as Record<string, unknown> | null, areas),
    unresolvedAnchors: failures,
  };

  return assembleSearchBrief({
    strategicState: buildStrategicState(inputs),
    conversationOutcomes: inputs.conversationOutcomes,
    provenSkills: deriveProvenSkills(inputs.latestAdvisor),
    preferences,
    now: options.now ?? new Date().toISOString(),
  });
}

/**
 * Proven, résumé-backed skill/role phrases for the secondary skill-match signal. Deterministic:
 * the advisor's positioning statements plus the evidence-ledger claims it already marked
 * verified-from-résumé or stated-by-user. Inferred / needs-confirmation / insufficient claims are
 * left out — only what the analysis treats as established goes outbound.
 */
export function deriveProvenSkills(advisor: Partial<AdvisorAnalysis> | null | undefined): string[] {
  if (!advisor) return [];
  const positioning = Array.isArray(advisor.positioning) ? advisor.positioning : [];
  const ledger = Array.isArray(advisor.evidenceLedger) ? advisor.evidenceLedger : [];
  const provenClaims = ledger
    .filter((item) => item.status === "verified_from_resume" || item.status === "stated_by_user")
    .map((item) => item.claim);
  return [...positioning, ...provenClaims].filter((phrase): phrase is string => typeof phrase === "string" && phrase.trim().length > 0);
}
