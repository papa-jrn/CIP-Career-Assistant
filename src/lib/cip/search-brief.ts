import type { ConversationOutcome } from "@/lib/cip/conversation-outcomes";
import type { GeocodedSearchArea } from "@/lib/cip/geography-engine";
import type { StrategicState } from "@/lib/cip/strategic-state";
import { normalizeStateCode } from "@/lib/cip/us-states";

/**
 * Search brief (Employers & Opportunities Rethink, build step 1).
 *
 * A versioned, deterministic snapshot of the user's current strategic state,
 * shaped as the input to the weekly search. Two views exist on purpose:
 *
 *  - `SearchBrief` is PRIVATE. It stays in the app, is saved on the run record,
 *    and is used locally (exclusion filtering, recommendation reasons).
 *  - `toOutboundFacets(brief)` is the only thing a search provider may see:
 *    role language, geocoded localities, work model, a broad comp floor, and the
 *    names of saved target organizations. Exclusions, conversation signals,
 *    contact names, and unresolved free text never leave the app (§6).
 *
 * Pure functions only: no I/O, no clock, no provider calls. Geocoding is done by
 * the caller (build step 2) and passed in as `anchors`.
 */

export const SEARCH_BRIEF_SCHEMA_VERSION = 1;

export type BriefWorkMode = "onsite" | "hybrid" | "remote";
export type BriefLaneWeight = "primary" | "alternate" | "research";

/** Structured preferences. Every field is optional; absence becomes a `gap`, never a default. */
export interface SearchPreferences {
  /** Annual USD. An explicit floor only; the brief never invents an upper bound. */
  salaryFloorUsd?: number;
  workModes?: BriefWorkMode[];
  /** Stated residency / work-authorization limits on remote roles (§14). */
  remoteLimits?: string;
  /** Hard exclusions. Applied locally to results; never sent to the provider. */
  exclusions?: {
    industries?: string[];
    roles?: string[];
    employers?: string[];
  };
  /** Already-geocoded anchors (one or more user-selected regions). */
  anchors?: GeocodedSearchArea[];
  /** Job sources the user trusts (domains such as a sector job board). Searched after target career pages. */
  preferredSources?: string[];
  /** Anchors the user saved that could not be geocoded this time. Reported, never dropped silently. */
  unresolvedAnchors?: Array<{ label: string; reason: string }>;
  /** Constraints the user wrote as free text and no one has confirmed as structured. */
  unparsedConstraints?: Array<{ field: string; text: string }>;
}

export interface SearchBriefInputs {
  strategicState: StrategicState;
  conversationOutcomes?: ConversationOutcome[];
  preferences?: SearchPreferences;
  /** ISO timestamp, injected so assembly stays deterministic. */
  now: string;
}

export interface BriefLane {
  id: string;
  roleTitle: string;
  label: string;
  weight: BriefLaneWeight;
  direction: "up" | "down" | "steady";
  origin: "advisor" | "conversation";
  /** Search vocabulary: the role title plus role language conversations strengthened. */
  roleVocabulary: string[];
  /** Short private reasons carried forward so recommendations can cite them. */
  reasons: string[];
}

export interface BriefLocality {
  name: string;
  state: string;
  /** Straight-line miles from the anchor, not driving distance or commute time. */
  distanceMiles: number;
}

export interface BriefAnchor {
  /** The place as the user entered it. */
  label: string;
  /** What the geocoder resolved it to, so a wrong match (wrong state, wrong town) is visible. */
  resolvedAs: string;
  centerCity: string;
  /** "fallback" means the nearby-towns lookup failed and only the center place is covered. */
  nearbyLookup: "ok" | "fallback";
  latitude: number;
  longitude: number;
  radiusMiles: number;
  state: string;
  localities: BriefLocality[];
}

export interface BriefTarget {
  name: string;
  region: string;
  origin: "watched" | "candidate";
  nextMove: string;
}

export interface BriefSignal {
  /** Stable reference back to the source conversation record. */
  ref: string;
  kind: ConversationOutcome["signalType"];
  direction: ConversationOutcome["signalDirection"];
  confidence: ConversationOutcome["confidence"];
  contactName: string;
  conversationDate: string;
  relatedLane: string;
  relatedEmployer: string;
  summary: string;
}

export interface BriefConflict {
  kind: "compensation";
  message: string;
  ref: string;
}

export interface SearchBrief {
  schemaVersion: number;
  generatedAt: string;
  /** Stable hash of the brief's content (excluding `generatedAt`); usable as an idempotency component. */
  fingerprint: string;
  inputs: {
    strategicStateGeneratedAt: string;
    conversationRefs: string[];
    laneCount: number;
    targetCount: number;
  };
  lanes: BriefLane[];
  exclusions: { industries: string[]; roles: string[]; employers: string[] };
  compensation: { floorUsd: number | null; unit: "year"; upperBound: null };
  workModel: { accepted: BriefWorkMode[]; remoteLimits: string | null };
  /** Trusted job-source domains; job boards the search may use after employer-owned pages. */
  preferredSources: string[];
  anchors: BriefAnchor[];
  /** Saved anchors that failed to geocode; these were NOT searched. */
  unresolvedAnchors: Array<{ label: string; reason: string }>;
  targets: BriefTarget[];
  signals: BriefSignal[];
  /** Contradictions noted, never silently reconciled. */
  conflicts: BriefConflict[];
  /** Free-text constraints that are NOT applied until confirmed as structured. */
  unresolvedConstraints: Array<{ field: string; text: string }>;
  /** Plain-language list of what this brief is missing. Missing means unknown, not "no constraint". */
  gaps: string[];
}

/** What a search provider is allowed to see. */
export interface OutboundSearchFacets {
  schemaVersion: number;
  roleVocabulary: Array<{ laneId: string; weight: BriefLaneWeight; terms: string[] }>;
  areas: Array<{
    label: string;
    radiusMiles: number;
    state: string;
    localities: Array<{ name: string; state: string; distanceMiles: number }>;
  }>;
  workModes: BriefWorkMode[];
  /** Floor rounded down to the nearest $5,000. No upper bound is ever sent. */
  minimumAnnualUsd: number | null;
  targetOrganizations: string[];
  preferredSources: string[];
}

const MAX_LANES = 5;
const MAX_TARGETS = 15;
const MAX_LOCALITIES = 12; // matches how many nearby towns get a verified state
const MAX_SIGNALS = 20;
const MAX_VOCABULARY_PER_LANE = 6;
const OUTBOUND_FLOOR_STEP = 5_000;

const SEARCH_RELEVANT_SIGNALS = new Set<ConversationOutcome["signalType"]>([
  "lane_fit",
  "employer_fit",
  "compensation",
  "hiring_process",
  "role_language",
  "dealbreaker",
  "new_target",
  "market_signal",
]);

export function assembleSearchBrief(inputs: SearchBriefInputs): SearchBrief {
  const preferences = inputs.preferences ?? {};
  const outcomes = inputs.conversationOutcomes ?? [];
  const exclusions = normalizeExclusions(preferences.exclusions);
  const floorUsd = validFloor(preferences.salaryFloorUsd);

  const lanes = buildLanes(inputs.strategicState, outcomes);
  const targets = buildTargets(inputs.strategicState, exclusions.employers);
  const anchors = (preferences.anchors ?? []).map(toBriefAnchor);
  const unresolvedAnchors = (preferences.unresolvedAnchors ?? []).map((item) => ({ label: item.label, reason: item.reason }));
  const signals = buildSignals(outcomes);
  const conflicts = detectCompensationConflicts(outcomes, floorUsd);
  const unresolvedConstraints = (preferences.unparsedConstraints ?? [])
    .map((item) => ({ field: item.field.trim(), text: item.text.trim() }))
    .filter((item) => item.field && item.text);
  const workModes = uniqueSorted(preferences.workModes ?? []) as BriefWorkMode[];
  const remoteLimits = preferences.remoteLimits?.trim() || null;

  const gaps = buildGaps({
    lanes,
    floorUsd,
    workModes,
    remoteLimits,
    anchors,
    unresolvedAnchors,
    exclusions,
    unresolvedConstraints,
  });

  const content = {
    lanes,
    exclusions,
    compensation: { floorUsd, unit: "year" as const, upperBound: null },
    workModel: { accepted: workModes, remoteLimits },
    preferredSources: uniqueSorted((preferences.preferredSources ?? []).map((item) => item.trim().toLowerCase())),
    anchors,
    unresolvedAnchors,
    targets,
    signals,
    conflicts,
    unresolvedConstraints,
    gaps,
  };

  return {
    schemaVersion: SEARCH_BRIEF_SCHEMA_VERSION,
    generatedAt: inputs.now,
    fingerprint: fingerprint(content),
    inputs: {
      strategicStateGeneratedAt: inputs.strategicState.generatedAt,
      conversationRefs: signals.map((signal) => signal.ref),
      laneCount: lanes.length,
      targetCount: targets.length,
    },
    ...content,
  };
}

/**
 * The only projection of the brief a provider may receive. Deliberately
 * allow-listed: adding a field to `SearchBrief` does not leak it.
 */
export function toOutboundFacets(brief: SearchBrief): OutboundSearchFacets {
  return {
    schemaVersion: brief.schemaVersion,
    roleVocabulary: brief.lanes.map((lane) => ({
      laneId: lane.id,
      weight: lane.weight,
      terms: lane.roleVocabulary,
    })),
    areas: brief.anchors.map((anchor) => ({
      label: anchor.label,
      radiusMiles: anchor.radiusMiles,
      state: anchor.state,
      localities: anchor.localities.map((locality) => ({ ...locality })),
    })),
    workModes: [...brief.workModel.accepted],
    minimumAnnualUsd:
      brief.compensation.floorUsd === null
        ? null
        : Math.floor(brief.compensation.floorUsd / OUTBOUND_FLOOR_STEP) * OUTBOUND_FLOOR_STEP,
    targetOrganizations: brief.targets.map((target) => target.name),
    preferredSources: [...brief.preferredSources],
  };
}

/**
 * Bridges today's intake, which holds only a numeric `salary_target` and a
 * `work_modes` array as structured data. Exclusions and location live in free
 * text, so they are returned as unparsed constraints rather than interpreted.
 */
export function preferencesFromIntake(
  intake: Record<string, unknown> | null | undefined,
): Pick<SearchPreferences, "salaryFloorUsd" | "workModes" | "unparsedConstraints"> {
  const source = intake ?? {};
  const salary = Number(source.salary_target);
  const workModes = (Array.isArray(source.work_modes) ? source.work_modes : [])
    .map((mode) => normalizeWorkMode(String(mode)))
    .filter((mode): mode is BriefWorkMode => Boolean(mode));

  const unparsedConstraints: Array<{ field: string; text: string }> = [];
  for (const field of ["career_constraints", "industry_preferences"] as const) {
    const text = typeof source[field] === "string" ? (source[field] as string).trim() : "";
    if (text) unparsedConstraints.push({ field, text });
  }

  return {
    salaryFloorUsd: Number.isFinite(salary) && salary > 0 ? salary : undefined,
    workModes: workModes.length ? workModes : undefined,
    unparsedConstraints,
  };
}

/** True when a posting's employer, title, or industry text hits a hard exclusion. Local filter only. */
export function violatesExclusions(
  brief: Pick<SearchBrief, "exclusions">,
  posting: { employer?: string; title?: string; industry?: string },
): string | null {
  const employer = normalize(posting.employer ?? "");
  const title = normalize(posting.title ?? "");
  const industry = normalize(posting.industry ?? "");
  for (const excluded of brief.exclusions.employers) {
    if (employer && employer === normalize(excluded)) return `employer: ${excluded}`;
  }
  for (const excluded of brief.exclusions.roles) {
    const key = normalize(excluded);
    if (key && title.includes(key)) return `role: ${excluded}`;
  }
  for (const excluded of brief.exclusions.industries) {
    const key = normalize(excluded);
    if (key && industry.includes(key)) return `industry: ${excluded}`;
  }
  return null;
}

function buildLanes(state: StrategicState, outcomes: ConversationOutcome[]): BriefLane[] {
  const seen = new Set<string>();
  return state.lanes
    .filter((lane) => {
      const id = slug(lane.lane);
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .slice(0, MAX_LANES)
    .map((lane): BriefLane => {
      const conversationOnly = lane.label === "Conversation research lane";
      const vocabulary = [
        lane.lane,
        ...outcomes
          .filter(
            (outcome) =>
              outcome.signalType === "role_language" &&
              outcome.signalDirection === "strengthens" &&
              outcome.relatedLane &&
              sameLane(outcome.relatedLane, lane.lane),
          )
          .map((outcome) => outcome.relatedLane),
      ];
      return {
        id: slug(lane.lane),
        roleTitle: lane.lane,
        label: lane.label,
        weight: conversationOnly ? "research" : weightFromLabel(lane.label),
        direction: lane.direction,
        origin: conversationOnly ? "conversation" : "advisor",
        roleVocabulary: uniqueOrdered(vocabulary).slice(0, MAX_VOCABULARY_PER_LANE),
        reasons: lane.reasons.slice(0, 3),
      };
    });
}

function buildTargets(state: StrategicState, excludedEmployers: string[]): BriefTarget[] {
  const excluded = new Set(excludedEmployers.map(normalize));
  const seen = new Set<string>();
  return [...state.employers, ...state.employerCandidates]
    .filter((employer) => {
      const key = normalize(employer.name);
      if (!key || excluded.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, MAX_TARGETS)
    .map((employer) => ({
      name: employer.name,
      region: employer.region,
      origin: employer.source,
      nextMove: employer.nextMove,
    }));
}

function toBriefAnchor(area: GeocodedSearchArea): BriefAnchor {
  return {
    label: area.query || area.displayName,
    resolvedAs: area.displayName,
    centerCity: area.city,
    nearbyLookup: area.nearbyLookup,
    latitude: area.latitude,
    longitude: area.longitude,
    radiusMiles: area.radiusMiles,
    state: normalizeStateCode(area.state) || area.state,
    localities: [...area.nearbyPlaces]
      .sort((a, b) => a.distanceMiles - b.distanceMiles || a.name.localeCompare(b.name))
      .slice(0, MAX_LOCALITIES)
      .map((place) => ({
        name: place.name,
        // Unknown stays empty so a town across a state line is never labeled with the anchor state.
        state: normalizeStateCode(place.state),
        distanceMiles: place.distanceMiles,
      })),
  };
}

function buildSignals(outcomes: ConversationOutcome[]): BriefSignal[] {
  return outcomes
    .filter((outcome) => SEARCH_RELEVANT_SIGNALS.has(outcome.signalType))
    .map((outcome) => ({
      ref: outcome.sourceRef || outcome.sourceNoteId || `${outcome.contactName}|${outcome.conversationDate}`,
      kind: outcome.signalType,
      direction: outcome.signalDirection,
      confidence: outcome.confidence,
      contactName: outcome.contactName,
      conversationDate: outcome.conversationDate,
      relatedLane: outcome.relatedLane,
      relatedEmployer: outcome.relatedEmployer,
      summary: signalSummary(outcome),
    }))
    .sort((a, b) => b.conversationDate.localeCompare(a.conversationDate) || a.ref.localeCompare(b.ref))
    .slice(0, MAX_SIGNALS);
}

/**
 * A conversation that quotes annual pay entirely below the stated floor is noted
 * as a conflict. It is never merged into or used to lower the floor. Hourly or
 * unparseable figures are non-comparable and produce no conflict (§14).
 */
function detectCompensationConflicts(outcomes: ConversationOutcome[], floorUsd: number | null): BriefConflict[] {
  if (floorUsd === null) return [];
  const conflicts: BriefConflict[] = [];
  for (const outcome of outcomes) {
    if (!outcome.compensationSignal) continue;
    const figures = parseAnnualFigures(outcome.compensationSignal);
    if (!figures.length) continue;
    if (Math.max(...figures) >= floorUsd) continue;
    conflicts.push({
      kind: "compensation",
      ref: outcome.sourceRef || outcome.sourceNoteId || `${outcome.contactName}|${outcome.conversationDate}`,
      message: `${outcome.contactName} described pay up to about $${Math.max(...figures).toLocaleString("en-US")}, below the stated floor of $${floorUsd.toLocaleString("en-US")}. The stated floor was not changed.`,
    });
  }
  return conflicts;
}

export function parseAnnualFigures(text: string): number[] {
  if (/\b(hour|hourly|hr|per hour)\b|\/\s*h\b/i.test(text)) return [];
  const figures: number[] = [];
  const pattern = /\$\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*([kK])?/g;
  for (const match of text.matchAll(pattern)) {
    const raw = Number(match[1].replace(/,/g, ""));
    if (!Number.isFinite(raw)) continue;
    const value = match[2] ? raw * 1000 : raw;
    if (value >= 10_000 && value <= 1_000_000) figures.push(Math.round(value));
  }
  return figures;
}

function buildGaps(input: {
  lanes: BriefLane[];
  floorUsd: number | null;
  workModes: BriefWorkMode[];
  remoteLimits: string | null;
  anchors: BriefAnchor[];
  unresolvedAnchors: Array<{ label: string; reason: string }>;
  exclusions: SearchBrief["exclusions"];
  unresolvedConstraints: Array<{ field: string; text: string }>;
}): string[] {
  const gaps: string[] = [];
  if (!input.lanes.length) gaps.push("No lanes yet: run an evidence analysis before searching.");
  if (input.floorUsd === null) gaps.push("No salary floor is set; pay will be reported as unknown, not as meeting a floor.");
  if (!input.workModes.length) gaps.push("No accepted work models are set (onsite, hybrid, remote).");
  if (input.workModes.includes("remote") && !input.remoteLimits) {
    gaps.push("Remote is accepted but no residency or work-authorization limit is recorded.");
  }
  if (!input.anchors.length && !input.unresolvedAnchors.length) {
    gaps.push("No geocoded location anchor: local search cannot run and results cannot be ranked by distance.");
  }
  for (const anchor of input.anchors) {
    if (anchor.nearbyLookup === "fallback") {
      gaps.push(`The nearby-town lookup failed for "${anchor.label}", so only that place itself is covered, not the towns around it. Try again shortly.`);
    }
  }
  for (const item of input.unresolvedAnchors) {
    gaps.push(`Could not locate "${item.label}" (${item.reason}); it was not searched.`);
  }
  const noExclusions =
    !input.exclusions.industries.length && !input.exclusions.roles.length && !input.exclusions.employers.length;
  if (noExclusions) gaps.push("No hard exclusions are recorded as structured data; none will be applied.");
  for (const item of input.unresolvedConstraints) {
    gaps.push(`"${item.field}" is free text and is not applied until confirmed as structured constraints.`);
  }
  return gaps;
}

function normalizeExclusions(value: SearchPreferences["exclusions"]): SearchBrief["exclusions"] {
  return {
    industries: uniqueSorted(value?.industries ?? []),
    roles: uniqueSorted(value?.roles ?? []),
    employers: uniqueSorted(value?.employers ?? []),
  };
}

function validFloor(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

function normalizeWorkMode(value: string): BriefWorkMode | null {
  const key = value.trim().toLowerCase();
  if (key.startsWith("remote")) return "remote";
  if (key.startsWith("hybrid")) return "hybrid";
  if (key.startsWith("on") || key.includes("office") || key.includes("in-person") || key.includes("in person")) return "onsite";
  return null;
}

function weightFromLabel(label: string): BriefLaneWeight {
  if (label === "Primary lane") return "primary";
  if (label === "Strong alternate") return "alternate";
  return "research";
}

function signalSummary(outcome: ConversationOutcome) {
  const text =
    outcome.marketSignal ||
    outcome.hiringSignal ||
    outcome.compensationSignal ||
    outcome.warnings ||
    outcome.rawNoteExcerpt ||
    "";
  return text.replace(/\s+/g, " ").trim().slice(0, 240);
}

function sameLane(left: string, right: string) {
  const a = normalize(left);
  const b = normalize(right);
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}

function slug(value: string) {
  return normalize(value).replace(/ /g, "-");
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function uniqueOrdered(items: string[]) {
  const seen = new Set<string>();
  return items
    .map((item) => item.trim())
    .filter((item) => {
      const key = item.toLowerCase();
      if (!item || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function uniqueSorted<T extends string>(items: T[]): T[] {
  return uniqueOrdered(items).sort((a, b) => a.localeCompare(b)) as T[];
}

/** FNV-1a over canonical JSON. Content is built in fixed key order with sorted arrays where order is not meaningful. */
function fingerprint(content: unknown) {
  const text = JSON.stringify(content);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `b${SEARCH_BRIEF_SCHEMA_VERSION}-${hash.toString(16).padStart(8, "0")}`;
}
