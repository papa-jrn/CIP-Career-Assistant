import { distinctiveTokens, laneRoleFamilies, type RoleFamilyKey } from "@/lib/cip/strategic-state";
import { buildCanonicalEmployers, resolveEmployerName, type CanonicalEmployer } from "@/lib/cip/employer-resolution";

/**
 * Lane-aware employer discovery (Part 6, first slice). Deterministic helpers that:
 *  - derive what org types to look for from the user's lanes (so discovery targets where they are
 *    actually heading, not hand-typed sectors);
 *  - tag each discovered employer with the lane(s) it serves (labeled, correctable in the queue);
 *  - flag a candidate that is already a watched/known employer (dedupe via the employer resolver).
 * Nothing here calls a model; the web-search engine still returns the real, source-backed orgs.
 */

export interface LaneLike {
  lane: string;
  label: string;
}

// Org-type keywords per role family — used both as search "sectors" (what to tell the engine to find)
// and for tagging (token overlap with a candidate's category). Kept as plain words so overlap is easy.
const FAMILY_ORG_TYPES: Record<RoleFamilyKey, string[]> = {
  tech: [
    "technology organizations", "digital media", "software companies", "ed-tech", "research institutes",
    "innovation labs", "engineering firms", "data and analytics", "university technology groups",
    "hospital information technology",
  ],
  nonprofit_exec: [
    "nonprofits", "foundations", "community organizations", "public media", "social services",
    "human services", "arts and culture organizations", "advocacy organizations", "mission-driven organizations",
  ],
  education: [
    "school districts", "colleges", "universities", "higher education", "workforce development boards",
    "training organizations", "adult education", "academies",
  ],
};

export interface DiscoveryTargeting {
  /** The lanes that drove targeting (conversation-only lanes excluded). */
  lanes: LaneLike[];
  /** Org types to search for, derived from the lanes' families. Used as the engine's `sectors`. */
  sectors: string[];
  /** Per-lane org types, for the prompt and the UI ("targeting your <lane>: …"). */
  laneHints: Array<{ lane: string; label: string; orgTypes: string[] }>;
  /** False when no lanes were available, so the caller falls back to manual sectors. */
  derivedFromLanes: boolean;
}

function orgTypesForLane(laneRole: string): string[] {
  const families = laneRoleFamilies(laneRole);
  return [...new Set(families.flatMap((family) => FAMILY_ORG_TYPES[family]))];
}

/** Turn the user's lanes into employer-discovery targeting. */
export function deriveDiscoveryTargeting(lanes: LaneLike[]): DiscoveryTargeting {
  const target = lanes.filter((lane) => lane.label !== "Conversation research lane" && lane.lane.trim());
  const sectors = new Set<string>();
  const laneHints: DiscoveryTargeting["laneHints"] = [];
  for (const lane of target) {
    const orgTypes = orgTypesForLane(lane.lane);
    orgTypes.forEach((orgType) => sectors.add(orgType));
    laneHints.push({ lane: lane.lane, label: lane.label, orgTypes });
  }
  return {
    lanes: target.map((lane) => ({ lane: lane.lane, label: lane.label })),
    sectors: [...sectors].slice(0, 14),
    laneHints,
    derivedFromLanes: target.length > 0,
  };
}

function sharesDistinctiveToken(a: string, b: string): boolean {
  const left = distinctiveTokens(a);
  for (const token of distinctiveTokens(b)) if (left.has(token)) return true;
  return false;
}

export interface LaneTag {
  lane: string;
  label: string;
  reason: string;
}

/**
 * Which of the user's lanes a discovered employer serves. A match is: the employer's category/name
 * shares a distinctive word with the lane's role, or with one of the lane's org types. Empty means no
 * current lane fit (the employer is still kept and shown; the user can correct it in the queue).
 */
export function tagCandidateLanes(candidate: { name: string; category: string }, lanes: LaneLike[]): LaneTag[] {
  const text = `${candidate.category} ${candidate.name}`;
  const tags: LaneTag[] = [];
  for (const lane of lanes) {
    if (lane.label === "Conversation research lane" || !lane.lane.trim()) continue;
    const byRole = sharesDistinctiveToken(text, lane.lane);
    const orgTypes = orgTypesForLane(lane.lane);
    const byOrgType = orgTypes.some((orgType) => sharesDistinctiveToken(text, orgType));
    if (byRole || byOrgType) {
      tags.push({
        lane: lane.lane,
        label: lane.label,
        reason: byOrgType ? `Employer type fits your ${lane.label}` : `Matches your ${lane.label} focus`,
      });
    }
  }
  return tags;
}

/**
 * Split discovered employers into genuinely new ones and ones already tracked, by resolving each
 * name against the user's existing watched/candidate employers (same resolver the chips use), so the
 * review queue never shows a duplicate under a different name (e.g. "DHMC" vs "Dartmouth Health").
 */
export function partitionAgainstExisting<T extends { name: string }>(
  candidates: T[],
  existingNames: string[],
): { fresh: T[]; alreadyTracked: Array<{ candidate: T; trackedAs: string }> } {
  const canon: CanonicalEmployer[] = buildCanonicalEmployers(existingNames);
  const fresh: T[] = [];
  const alreadyTracked: Array<{ candidate: T; trackedAs: string }> = [];
  for (const candidate of candidates) {
    const match = resolveEmployerName(candidate.name, canon, new Map()).canonical;
    if (match) alreadyTracked.push({ candidate, trackedAs: match });
    else fresh.push(candidate);
  }
  return { fresh, alreadyTracked };
}
