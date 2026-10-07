import { geocodeCoordinates, straightLineMiles, type GeocodedSearchArea, type NearbyPlace } from "@/lib/cip/geography-engine";
import { buildCanonicalEmployers, normOrg, resolveEmployerName } from "@/lib/cip/employer-resolution";
import { tagCandidateLanes, type LaneLike, type LaneTag } from "@/lib/cip/discovery-targeting";
import { laneRoleFamilies } from "@/lib/cip/strategic-state";
import { normalizeStateCode } from "@/lib/cip/us-states";
import { extractResponseText, type BusinessSearchCandidate, type BusinessSearchSource } from "@/lib/cip/business-search-engine";

/**
 * IRS Form 990 nonprofit discovery layer (ProPublica Nonprofit Explorer API — free, public, no key).
 *
 * Small and mid-size local nonprofits rarely rank on the open web, but every one of them files a
 * 990. This layer searches public filings by state + NTEE category, filters to the user's real
 * labor shed (geography engine), sizes orgs by BUDGET (never headcount — founder decision
 * 2026-10-07: revenue floor $250k; the web search's employee minimum does not apply here), and
 * maps each org onto the existing employer-candidate pipeline, so lane tagging, dedupe, and the
 * review queue apply unchanged.
 *
 * Everything here is deterministic: no model calls, no invented fields (§19). Provenance is the
 * EIN + filing year + ProPublica URL; `careers_url` stays empty because a filing says nothing
 * about a careers page. All external I/O is injectable for tests (fetchImpl / sleep / geocoder).
 */

const PROPUBLICA_API_BASE = "https://projects.propublica.org/nonprofits/api/v2";
const PROPUBLICA_ORG_URL = "https://projects.propublica.org/nonprofits/organizations";

/** Founder decision 2026-10-07 (a): keep orgs with at least this much annual revenue. */
export const NINE_NINETY_MIN_REVENUE_USD = 250_000;
/** Founder decision 2026-10-07 (d): candidates kept per run after ranking (matches the web-search cap). */
export const NINE_NINETY_MAX_CANDIDATES = 12;

const MAX_PAGES_PER_CATEGORY = 2; // 25 orgs/page — the first pages carry the most prominent filers
const MAX_DETAIL_FETCHES = 24; // one organization.json per in-area org, bounded
const MAX_CITY_GEOCODES = 12; // city-match first (free); geocode only the unmatched leftovers
const REQUEST_DELAY_MS = 600; // pause between page/detail requests (same politeness as the board reader)
const RETRY_DELAY_MS = 1_500;
const REQUEST_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------- NTEE ↔ lanes

export interface NteeCategory {
  /** ProPublica `ntee[id]` value (major group, 1-10). */
  id: string;
  /** Human label (what the coverage line shows). */
  label: string;
  /** NTEE major letters the id covers (observed live against the API). */
  letters: string;
  /** Candidate `category` text — phrased to share distinctive tokens with the lane org-type
   * vocabulary in discovery-targeting, so `tagCandidateLanes` can attribute the org to a lane. */
  category: string;
}

/** Founder decision 2026-10-07 (b): the broad five, verified live (1=A, 2=B, 4=E/F, 5=I-P, 7=S/T/W). */
export const NTEE_CATEGORIES: NteeCategory[] = [
  { id: "1", label: "Arts, culture, and humanities", letters: "A", category: "Arts and culture nonprofits" },
  { id: "2", label: "Education", letters: "B", category: "Education nonprofits" },
  { id: "4", label: "Health", letters: "E-F", category: "Community healthcare nonprofits" },
  { id: "5", label: "Human services", letters: "I-P", category: "Human services nonprofits" },
  { id: "7", label: "Public and societal benefit", letters: "S/T/W", category: "Public benefit and advocacy nonprofits" },
];

/**
 * Which NTEE categories the user's lanes imply. Nonprofit-executive lanes get the broad five,
 * education lanes get Education, tech lanes contribute nothing (filings do not represent tech
 * employers). With no usable lane signal the layer searches the broad five — disclosed in the
 * coverage line, never silently narrowed or widened.
 */
export function nteeCategoriesForLanes(lanes: LaneLike[]): NteeCategory[] {
  const usable = lanes.filter((lane) => lane.label !== "Conversation research lane" && lane.lane.trim());
  if (!usable.length) return [...NTEE_CATEGORIES];
  const ids = new Set<string>();
  for (const lane of usable) {
    for (const family of laneRoleFamilies(lane.lane)) {
      if (family === "nonprofit_exec") NTEE_CATEGORIES.forEach((category) => ids.add(category.id));
      else if (family === "education") ids.add("2");
    }
  }
  if (!ids.size) return [...NTEE_CATEGORIES];
  return NTEE_CATEGORIES.filter((category) => ids.has(category.id));
}

// ---------------------------------------------------------------- API rows (defensive parsing)

/** One organization from the ProPublica search endpoint (no financials — those are per-EIN). */
export interface NineNinetyOrgRow {
  ein: number;
  strein: string;
  name: string;
  subName: string;
  city: string;
  state: string;
  nteeCode: string;
  subseccd: number | null;
}

/** One year's data filing (what the enrichment trend is computed from). */
export interface NineNinetyFiling {
  year: number;
  revenue?: number;
  expenses?: number;
  assets?: number;
  pdfUrl: string;
}

export interface NineNinetyFinancials {
  ein: number;
  name: string;
  revenue?: number;
  expenses?: number;
  assets?: number;
  filingYear?: number;
  pdfUrl: string;
  /** All data filings, newest year first (used by the enrichment trend; latest = series[0]). */
  series: NineNinetyFiling[];
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function formatEin(ein: number): string {
  const digits = String(Math.trunc(ein)).padStart(9, "0");
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

function parseOrgRow(raw: unknown): NineNinetyOrgRow | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const ein = typeof row.ein === "number" ? row.ein : Number(row.ein);
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const city = typeof row.city === "string" ? row.city.trim() : "";
  const state = typeof row.state === "string" ? row.state.trim().toUpperCase() : "";
  if (!Number.isFinite(ein) || ein <= 0 || !name || !city || state.length !== 2) return null;
  return {
    ein,
    strein: typeof row.strein === "string" && row.strein.trim() ? row.strein.trim() : formatEin(ein),
    name,
    subName: typeof row.sub_name === "string" ? row.sub_name : "",
    city,
    state,
    nteeCode: typeof row.ntee_code === "string" ? row.ntee_code.trim() : "",
    subseccd: finiteNumber(row.subseccd) ?? null,
  };
}

function parseSearchPage(payload: unknown): NineNinetyOrgRow[] {
  if (!payload || typeof payload !== "object") return [];
  const organizations = (payload as { organizations?: unknown }).organizations;
  if (!Array.isArray(organizations)) return [];
  return organizations.map(parseOrgRow).filter((org): org is NineNinetyOrgRow => org !== null);
}

/** Data filings kept for the enrichment trend (newest first). Five is plenty for a trend and keeps rows small. */
const MAX_SERIES_FILINGS = 5;

/**
 * Latest filing financials (falling back to the BMF summary on the organization object) plus the
 * per-year series the enrichment trend is computed from. One entry per tax year, newest first; a
 * year that appears twice (an amended return) keeps the first entry that carries revenue.
 */
function parseOrgDetail(payload: unknown): NineNinetyFinancials | null {
  if (!payload || typeof payload !== "object") return null;
  const organization = (payload as { organization?: unknown }).organization;
  if (!organization || typeof organization !== "object") return null;
  const org = organization as Record<string, unknown>;
  const ein = finiteNumber(org.ein) ?? finiteNumber(org.id);
  const name = typeof org.name === "string" ? org.name.trim() : "";
  if (ein === undefined || !name) return null;

  const filings = (payload as { filings_with_data?: unknown }).filings_with_data;
  const byYear = new Map<number, NineNinetyFiling>();
  for (const filing of Array.isArray(filings) ? (filings as Record<string, unknown>[]) : []) {
    if (!filing || typeof filing !== "object") continue;
    const year =
      finiteNumber(filing.tax_prd_yr) ??
      (typeof filing.tax_prd === "number" ? Math.trunc(filing.tax_prd / 10000) : undefined);
    if (year === undefined) continue;
    const entry: NineNinetyFiling = {
      year,
      revenue: finiteNumber(filing.totrevenue),
      expenses: finiteNumber(filing.totfuncexpns),
      assets: finiteNumber(filing.totassetsend),
      pdfUrl: typeof filing.pdf_url === "string" ? filing.pdf_url : "",
    };
    const existing = byYear.get(year);
    if (!existing || (existing.revenue === undefined && entry.revenue !== undefined)) byYear.set(year, entry);
  }
  const series = [...byYear.values()].sort((a, b) => b.year - a.year).slice(0, MAX_SERIES_FILINGS);
  const latest = series[0] ?? null;

  return {
    ein,
    name,
    revenue: latest?.revenue ?? finiteNumber(org.revenue_amount),
    expenses: latest?.expenses,
    assets: latest?.assets ?? finiteNumber(org.asset_amount),
    filingYear: latest?.year,
    pdfUrl: latest?.pdfUrl ?? "",
    series,
  };
}

/**
 * v1 keeps 501(c)(3) public charities and skips umbrella "Group Return" rows — a group return
 * covers subordinate units, it is not one employer. The search already filters c_code[id]=3; the
 * subsection check here is defense in depth. An absent subsection code is treated as unknown but
 * kept (the server filter is authoritative; a parse gap must not silently drop real orgs).
 */
export function isEmployableNineNinetyOrg(org: NineNinetyOrgRow): boolean {
  if (org.subseccd !== null && org.subseccd !== 3) return false;
  if (org.subName.toLowerCase().includes("group return")) return false;
  return true;
}

// ---------------------------------------------------------------- Polite client + cache

export interface NineNinetyDeps {
  /** Injected in tests; production uses global fetch. A custom fetchImpl also bypasses the cache. */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

// Small bounded TTL cache (public filing data, shared across users; prune-oldest like rate-limit.ts).
const responseCache = new Map<string, { at: number; value: unknown }>();
const MAX_CACHE_ENTRIES = 500;
const SEARCH_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const DETAIL_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function cacheGet(key: string, ttlMs: number): unknown | undefined {
  const entry = responseCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.at > ttlMs) {
    responseCache.delete(key);
    return undefined;
  }
  return entry.value;
}

function cacheSet(key: string, value: unknown) {
  if (responseCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = responseCache.keys().next().value;
    if (oldest !== undefined) responseCache.delete(oldest);
  }
  responseCache.set(key, { at: Date.now(), value });
}

/** Test hook: clear the module cache between suites (production never needs this). */
export function clearNineNinetyCache() {
  responseCache.clear();
}

type JsonFetcher = (url: string) => Promise<unknown | null>;

function createJsonFetcher(deps: NineNinetyDeps): JsonFetcher {
  const doFetch = deps.fetchImpl ?? ((url: string, init?: RequestInit) => fetch(url, init));
  const sleep = deps.sleep ?? (() => Promise.resolve());
  return async (url) => {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await doFetch(url, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (response.ok) return (await response.json()) as unknown;
        // Found live (2026-10-07): ProPublica answers a search with ZERO results as HTTP 404 plus a
        // normal JSON body ({"organizations": [], "total_results": 0, ...}). That is an empty result,
        // not a failure. Only a search-shaped body is accepted, so a 404 on any other endpoint (an
        // unknown EIN, say) is still a miss.
        if (response.status === 404) {
          try {
            const body = (await response.json()) as unknown;
            if (body && typeof body === "object" && Array.isArray((body as { organizations?: unknown }).organizations)) return body;
          } catch {
            // not JSON: fall through to a plain miss
          }
          return null;
        }
        // 429/5xx get one polite retry; other client errors do not.
        if (response.status !== 429 && response.status < 500) return null;
      } catch {
        // Network error or timeout: retry once.
      }
      if (attempt === 1) await sleep(RETRY_DELAY_MS);
    }
    return null;
  };
}

async function fetchJsonCached(url: string, ttlMs: number, fetcher: JsonFetcher, useCache: boolean): Promise<unknown | null> {
  if (useCache) {
    const cached = cacheGet(url, ttlMs);
    if (cached !== undefined) return cached;
  }
  const value = await fetcher(url);
  if (value !== null && useCache) cacheSet(url, value);
  return value;
}

export interface NineNinetySearchOutcome {
  orgs: NineNinetyOrgRow[];
  /** True when a page request failed after its retry — the category is incomplete, not empty. */
  failed: boolean;
}

/** Search one NTEE category in one state (501(c)(3) only, enforced server-side via c_code[id]=3). */
export async function searchNineNinetyOrgs(
  stateCode: string,
  nteeId: string,
  deps: NineNinetyDeps & { pages?: number } = {},
): Promise<NineNinetySearchOutcome> {
  const fetcher = createJsonFetcher(deps);
  const useCache = !deps.fetchImpl;
  const sleep = deps.sleep ?? (() => Promise.resolve());
  const pages = Math.min(Math.max(deps.pages ?? MAX_PAGES_PER_CATEGORY, 1), MAX_PAGES_PER_CATEGORY);
  const byEin = new Map<number, NineNinetyOrgRow>();
  let failed = false;
  for (let page = 0; page < pages; page++) {
    if (page > 0) await sleep(REQUEST_DELAY_MS);
    const url =
      `${PROPUBLICA_API_BASE}/search.json?q=&state[id]=${encodeURIComponent(stateCode)}` +
      `&ntee[id]=${encodeURIComponent(nteeId)}&c_code[id]=3&page=${page}`;
    const payload = await fetchJsonCached(url, SEARCH_CACHE_TTL_MS, fetcher, useCache);
    if (payload === null) {
      failed = true;
      break;
    }
    const rows = parseSearchPage(payload);
    if (!rows.length) break; // category exhausted
    const fresh = rows.filter((row) => !byEin.has(row.ein));
    if (!fresh.length && page > 0) break; // repeated page (defensive against off-by-one indexing)
    fresh.forEach((row) => byEin.set(row.ein, row));
  }
  return { orgs: [...byEin.values()], failed };
}

/**
 * Search ProPublica by organization NAME within one state (501(c)(3) only), first page. Used to
 * attach filings to an employer the user already tracks when no EIN is known. The caller decides
 * whether any row is a trustworthy match; this only returns what the service found.
 */
export async function searchNineNinetyByName(
  name: string,
  stateCode: string,
  deps: NineNinetyDeps = {},
): Promise<NineNinetySearchOutcome> {
  const trimmed = name.trim();
  if (!trimmed) return { orgs: [], failed: false };
  const fetcher = createJsonFetcher(deps);
  const useCache = !deps.fetchImpl;
  const url =
    `${PROPUBLICA_API_BASE}/search.json?q=${encodeURIComponent(trimmed)}` +
    `&state[id]=${encodeURIComponent(stateCode)}&c_code[id]=3&page=0`;
  const payload = await fetchJsonCached(url, SEARCH_CACHE_TTL_MS, fetcher, useCache);
  if (payload === null) return { orgs: [], failed: true };
  return { orgs: parseSearchPage(payload), failed: false };
}

export const NINE_NINETY_ORGANIZATION_URL = PROPUBLICA_ORG_URL;

export async function fetchNineNinetyOrgDetail(ein: number, deps: NineNinetyDeps = {}): Promise<NineNinetyFinancials | null> {
  const fetcher = createJsonFetcher(deps);
  const useCache = !deps.fetchImpl;
  const url = `${PROPUBLICA_API_BASE}/organizations/${ein}.json`;
  const payload = await fetchJsonCached(url, DETAIL_CACHE_TTL_MS, fetcher, useCache);
  return parseOrgDetail(payload);
}

// ---------------------------------------------------------------- Labor-shed filter (decision c)

export type CityGeocoder = (query: string) => Promise<{ latitude: number; longitude: number } | null>;

export interface GeoKeptOrg {
  org: NineNinetyOrgRow;
  distanceMiles: number;
  basis: "city" | "geocode";
}

export interface GeoFilterOutcome {
  kept: GeoKeptOrg[];
  skippedOutsideArea: number;
  skippedUnknownCity: number;
  geocodesAttempted: number;
}

function normalizeCityName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * City-match first (free): the org's city equals the search center or a verified-state nearby
 * place → in, using that place's own straight-line distance. Cities that do not match are
 * geocoded (bounded) and checked with Haversine against the anchor. Cities we cannot locate are
 * dropped and counted — unknown stays unknown, never guessed into the area.
 */
export async function filterOrgsToSearchArea(
  orgs: NineNinetyOrgRow[],
  area: GeocodedSearchArea,
  geocoder: CityGeocoder,
  maxGeocodes = MAX_CITY_GEOCODES,
): Promise<GeoFilterOutcome> {
  const centerCity = normalizeCityName(area.city);
  const placesByCity = new Map<string, NearbyPlace[]>();
  for (const place of area.nearbyPlaces) {
    if (!place.state) continue; // unverified state stays ambiguous — house rule, never matched
    const key = normalizeCityName(place.name);
    if (!key) continue;
    const list = placesByCity.get(key) ?? [];
    list.push(place);
    placesByCity.set(key, list);
  }

  const kept: GeoKeptOrg[] = [];
  let skippedOutsideArea = 0;
  let skippedUnknownCity = 0;
  let geocodesAttempted = 0;

  for (const org of orgs) {
    const cityKey = normalizeCityName(org.city);
    if (centerCity && cityKey === centerCity) {
      kept.push({ org, distanceMiles: 0, basis: "city" });
      continue;
    }
    const places = (placesByCity.get(cityKey) ?? []).filter((place) => place.state === org.state);
    if (places.length) {
      kept.push({ org, distanceMiles: Math.min(...places.map((place) => place.distanceMiles)), basis: "city" });
      continue;
    }
    if (geocodesAttempted < maxGeocodes) {
      geocodesAttempted += 1;
      const coords = await geocoder(`${org.city}, ${org.state}`);
      if (coords) {
        const distance = straightLineMiles(area.latitude, area.longitude, coords.latitude, coords.longitude);
        if (distance <= area.radiusMiles) kept.push({ org, distanceMiles: distance, basis: "geocode" });
        else skippedOutsideArea += 1;
      } else {
        skippedUnknownCity += 1;
      }
    } else {
      skippedUnknownCity += 1;
    }
  }

  return { kept, skippedOutsideArea, skippedUnknownCity, geocodesAttempted };
}

// ---------------------------------------------------------------- Budget size (decision a)

export function sizeFromRevenue(revenue: number): "small" | "medium" | "large" {
  if (revenue < 1_000_000) return "small";
  if (revenue <= 10_000_000) return "medium";
  return "large";
}

export function formatRevenueUsd(revenue: number): string {
  // Large health systems and universities report billions; "$1980.4M" reads badly, "$2B" does not.
  if (revenue >= 1_000_000_000) return `$${Math.round((revenue / 1_000_000_000) * 10) / 10}B`;
  if (revenue >= 1_000_000) {
    // One decimal only when it matters — never round UP past the actual figure.
    return `$${Math.round((revenue / 1_000_000) * 10) / 10}M`;
  }
  return `$${Math.max(1, Math.round(revenue / 1_000))}k`;
}

export function budgetSizeLabel(revenue: number | undefined, filingYear: number | undefined): string {
  if (revenue === undefined || !Number.isFinite(revenue)) return "Nonprofit (revenue unknown)";
  const year = filingYear ? ` (FY ${filingYear})` : "";
  return `${sizeFromRevenue(revenue)} nonprofit - ${formatRevenueUsd(revenue)} annual revenue${year}`;
}

// ---------------------------------------------------------------- Candidate mapping + ranking

export function orgToCandidate(
  org: NineNinetyOrgRow,
  financials: NineNinetyFinancials,
  category: NteeCategory,
  area: GeocodedSearchArea,
  lanes: LaneLike[],
): BusinessSearchCandidate {
  const tags = tagCandidateLanes({ name: org.name, category: category.category }, lanes);
  return {
    name: org.name,
    ein: org.ein,
    region: area.query,
    category: category.category,
    location: `${org.city}, ${org.state}`,
    estimated_size: budgetSizeLabel(financials.revenue, financials.filingYear),
    priority: tags.length ? "medium" : "low",
    target_roles: [],
    source_url: `${PROPUBLICA_ORG_URL}/${org.ein}`,
    careers_url: "", // a filing says nothing about a careers page — never invented (§19)
    adapter_status: "manual_review",
    confidence: "high", // the org's existence and budget are filing-verified
    source_notes: [
      { label: "EIN", value: org.strein || formatEin(org.ein), url: "" },
      {
        label: "Annual revenue",
        value:
          financials.revenue !== undefined
            ? `${formatRevenueUsd(financials.revenue)}${financials.filingYear ? ` (FY ${financials.filingYear})` : ""}`
            : "Unknown",
        url: financials.pdfUrl || "",
      },
      { label: "NTEE", value: org.nteeCode ? `${org.nteeCode} - ${category.label}` : category.label, url: "" },
      { label: "Source", value: "ProPublica Nonprofit Explorer (IRS Form 990)", url: `${PROPUBLICA_ORG_URL}/${org.ein}` },
    ],
    discovery_channel: "irs_990",
    discovery_source_names: ["ProPublica Nonprofit Explorer"],
    parent_organization: "",
    relevantLanes: tags,
  };
}

interface RankedOrg {
  kept: GeoKeptOrg;
  financials: NineNinetyFinancials;
  category: NteeCategory;
  tags: LaneTag[];
}

/** Lane fit first, then distance from the anchor, then budget. Capped at NINE_NINETY_MAX_CANDIDATES. */
export function rankNineNinetyOrganizations(entries: RankedOrg[]): RankedOrg[] {
  return [...entries]
    .sort((a, b) => {
      const aLane = a.tags.length ? 0 : 1;
      const bLane = b.tags.length ? 0 : 1;
      if (aLane !== bLane) return aLane - bLane;
      if (a.kept.distanceMiles !== b.kept.distanceMiles) return a.kept.distanceMiles - b.kept.distanceMiles;
      return (b.financials.revenue ?? 0) - (a.financials.revenue ?? 0);
    })
    .slice(0, NINE_NINETY_MAX_CANDIDATES);
}

// ---------------------------------------------------------------- Orchestration

export interface NineNinetyCoverage {
  stateCode: string;
  categoriesSearched: string[];
  orgsScanned: number;
  inArea: number;
  detailsFetched: number;
  passedFloor: number;
  kept: number;
  minRevenueUsd: number;
  cap: number;
  skippedNonCharity: number;
  skippedOutsideArea: number;
  skippedUnknownCity: number;
  skippedNoFinancials: number;
  skippedDetailBudget: number;
  skippedBelowFloor: number;
  geocodesAttempted: number;
  categoryErrors: string[];
  duplicateOfWebSearch: number;
  /** How many candidates were linked to a parent organization (the dedupe/grouping mechanism). */
  parentsLinked: number;
  /** What produced the parent links (set by the endpoint; the orchestrator itself links none). */
  parentBasis: NineNinetyParentBasis;
}

export type NineNinetyParentBasis = "model_and_saved" | "model" | "saved_only" | "model_unavailable" | "not_run";

export interface NineNinetyDiscoveryResult {
  candidates: BusinessSearchCandidate[];
  sourcePage: BusinessSearchSource;
  coverage: NineNinetyCoverage;
  summary: string;
}

/**
 * Run the 990 layer for a resolved search area. Returns null when the area is not a US state
 * (ProPublica covers US states only) — the caller reports that honestly instead of guessing.
 */
export async function runNineNinetyDiscovery(options: {
  searchArea: GeocodedSearchArea;
  lanes: LaneLike[];
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  geocoder?: CityGeocoder;
}): Promise<NineNinetyDiscoveryResult | null> {
  const stateCode = normalizeStateCode(options.searchArea.state);
  if (!stateCode) return null;

  const deps: NineNinetyDeps = { fetchImpl: options.fetchImpl, sleep: options.sleep };
  const sleep = options.sleep ?? (() => Promise.resolve());
  const categories = nteeCategoriesForLanes(options.lanes);
  const coverage: NineNinetyCoverage = {
    stateCode,
    categoriesSearched: categories.map((category) => category.label),
    orgsScanned: 0,
    inArea: 0,
    detailsFetched: 0,
    passedFloor: 0,
    kept: 0,
    minRevenueUsd: NINE_NINETY_MIN_REVENUE_USD,
    cap: NINE_NINETY_MAX_CANDIDATES,
    skippedNonCharity: 0,
    skippedOutsideArea: 0,
    skippedUnknownCity: 0,
    skippedNoFinancials: 0,
    skippedDetailBudget: 0,
    skippedBelowFloor: 0,
    geocodesAttempted: 0,
    categoryErrors: [],
    duplicateOfWebSearch: 0,
    parentsLinked: 0,
    parentBasis: "not_run",
  };

  // 1. Search each lane-implied category; dedupe orgs across categories by EIN.
  const categoryByEin = new Map<number, NineNinetyOrgRow & { category: NteeCategory }>();
  const seen = new Set<number>();
  for (const category of categories) {
    const { orgs, failed } = await searchNineNinetyOrgs(stateCode, category.id, deps);
    if (failed) {
      coverage.categoryErrors.push(`${category.label} (NTEE ${category.letters}) was unavailable — nothing was invented to fill it.`);
      continue;
    }
    for (const org of orgs) {
      if (seen.has(org.ein)) continue;
      seen.add(org.ein);
      coverage.orgsScanned += 1;
      if (!isEmployableNineNinetyOrg(org)) {
        coverage.skippedNonCharity += 1;
        continue;
      }
      categoryByEin.set(org.ein, { ...org, category });
    }
  }

  // 2. Filter to the labor shed: city-match first, geocode only the unmatched leftovers.
  const geo = await filterOrgsToSearchArea(
    [...categoryByEin.values()],
    options.searchArea,
    options.geocoder ?? ((query) => geocodeCoordinates(query)),
  );
  coverage.inArea = geo.kept.length;
  coverage.skippedOutsideArea = geo.skippedOutsideArea;
  coverage.skippedUnknownCity = geo.skippedUnknownCity;
  coverage.geocodesAttempted = geo.geocodesAttempted;

  // 3. Fetch financials for the closest in-area orgs (bounded), apply the budget floor.
  const ordered = [...geo.kept].sort((a, b) => a.distanceMiles - b.distanceMiles);
  const detailed: RankedOrg[] = [];
  for (const entry of ordered) {
    if (coverage.detailsFetched >= MAX_DETAIL_FETCHES) {
      coverage.skippedDetailBudget += 1;
      continue;
    }
    if (coverage.detailsFetched > 0) await sleep(REQUEST_DELAY_MS);
    coverage.detailsFetched += 1;
    const financials = await fetchNineNinetyOrgDetail(entry.org.ein, deps);
    if (!financials || financials.revenue === undefined) {
      coverage.skippedNoFinancials += 1;
      continue;
    }
    if (financials.revenue < NINE_NINETY_MIN_REVENUE_USD) {
      coverage.skippedBelowFloor += 1;
      continue;
    }
    const record = categoryByEin.get(entry.org.ein)!;
    detailed.push({
      kept: entry,
      financials,
      category: record.category,
      tags: tagCandidateLanes({ name: entry.org.name, category: record.category.category }, options.lanes),
    });
  }
  coverage.passedFloor = detailed.length;

  // 4. Rank (lane fit, then proximity, then budget) and cap.
  const ranked = rankNineNinetyOrganizations(detailed);
  coverage.kept = ranked.length;
  const candidates = ranked.map((entry) =>
    orgToCandidate(entry.kept.org, entry.financials, entry.category, options.searchArea, options.lanes),
  );

  const skips = [
    coverage.skippedOutsideArea ? `${coverage.skippedOutsideArea} outside the area` : "",
    coverage.skippedUnknownCity ? `${coverage.skippedUnknownCity} in cities we could not locate` : "",
    coverage.skippedNoFinancials ? `${coverage.skippedNoFinancials} without usable financials` : "",
    coverage.skippedBelowFloor ? `${coverage.skippedBelowFloor} under the ${formatRevenueUsd(NINE_NINETY_MIN_REVENUE_USD)} budget floor` : "",
  ].filter(Boolean);
  const summary =
    `IRS Form 990 layer: searched ${categories.length} nonprofit categor${categories.length === 1 ? "y" : "ies"} in ${stateCode} ` +
    `(${coverage.categoriesSearched.join(", ")}) — ${coverage.orgsScanned} organizations scanned, ${coverage.inArea} within ` +
    `${options.searchArea.radiusMiles} miles, ${coverage.passedFloor} at or above the ${formatRevenueUsd(NINE_NINETY_MIN_REVENUE_USD)} floor, ` +
    `${coverage.kept} kept (cap ${NINE_NINETY_MAX_CANDIDATES}).` +
    (skips.length ? ` Skipped: ${skips.join(", ")}.` : "") +
    (coverage.categoryErrors.length ? " Some categories were unavailable; no organizations were invented to fill them." : "");

  const sourcePage: BusinessSearchSource = {
    name: "ProPublica Nonprofit Explorer (IRS Form 990)",
    source_type: "government_data",
    url: "https://projects.propublica.org/nonprofits/",
    usefulness_score: 80,
    notes: `IRS Form 990 filings for ${stateCode}: ${coverage.orgsScanned} organizations scanned across ${coverage.categoriesSearched.join(", ")}.`,
  };

  return { candidates, sourcePage, coverage, summary };
}

/**
 * When the same employer came from both the web search and the 990 layer, keep the web candidate
 * (it carries the source/careers URLs the queue uses) and record the 990 row as confirmation
 * rather than saving a duplicate. Same conservative resolver as the tracked-employer dedupe.
 */
export function dropNineNinetyDuplicates(
  candidates: BusinessSearchCandidate[],
  webCandidates: BusinessSearchCandidate[],
): { kept: BusinessSearchCandidate[]; duplicates: Array<{ candidate: BusinessSearchCandidate; duplicateOf: string }> } {
  const canon = buildCanonicalEmployers(webCandidates.map((candidate) => candidate.name));
  const kept: BusinessSearchCandidate[] = [];
  const duplicates: Array<{ candidate: BusinessSearchCandidate; duplicateOf: string }> = [];
  for (const candidate of candidates) {
    const match = resolveEmployerName(candidate.name, canon, new Map()).canonical;
    if (match) duplicates.push({ candidate, duplicateOf: match });
    else kept.push(candidate);
  }
  return { kept, duplicates };
}

// ---------------------------------------------------------------- Parent organizations (dedupe mechanism)

export interface KnownParentMember {
  name: string;
  parent: string;
}

/**
 * Fill EMPTY `parent_organization` fields from what earlier runs already learned: a candidate
 * (web or 990) whose name resolves — conservative resolver — to a saved member organization
 * adopts that member's parent. Deterministic, works in standalone 990 mode, and never overwrites
 * a parent the web search (or a prior adoption) already attached. Mutates the candidate objects
 * in place (they are shared with the run's candidate list) and returns how many were linked.
 */
export function adoptKnownParents(
  candidates: Array<{ name: string; parent_organization?: string }>,
  knownMembers: KnownParentMember[],
): number {
  const canon = buildCanonicalEmployers(knownMembers.map((member) => member.name));
  const parentByNorm = new Map(knownMembers.map((member) => [normOrg(member.name), member.parent]));
  let adopted = 0;
  for (const candidate of candidates) {
    if (candidate.parent_organization?.trim()) continue;
    const match = resolveEmployerName(candidate.name, canon, new Map()).canonical;
    if (!match) continue;
    const parent = parentByNorm.get(normOrg(match));
    if (parent?.trim()) {
      candidate.parent_organization = parent;
      adopted += 1;
    }
  }
  return adopted;
}

export interface NineNinetyParentEnrichment {
  applied: number;
  status: "applied" | "not_configured" | "unavailable";
}

const parentLinkSchema = {
  type: "object",
  additionalProperties: false,
  required: ["organizations"],
  properties: {
    organizations: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["ein", "parent_organization"],
        properties: {
          ein: { type: "integer" },
          parent_organization: { type: "string" },
        },
      },
    },
  },
};

/**
 * Link 990-discovered organizations to their parent organization with ONE small model call — the
 * same house pattern as the web search's parent capture: the model provides the parent (world
 * knowledge a filing does not carry), deterministic code does the dedupe/grouping. Keys results
 * by EIN so a response cannot retarget another row, fills ONLY empty parents (stored/adopted
 * parents always win), and on any failure — no key, provider error, bad payload — returns
 * "unavailable" with nothing changed: the 990 layer itself never depends on it.
 */
export async function enrichNineNinetyParents(
  candidates: BusinessSearchCandidate[],
  trackedEmployerNames: string[],
  options: { apiKey?: string; fetchImpl?: typeof fetch } = {},
): Promise<NineNinetyParentEnrichment> {
  // An explicit apiKey (even "") is authoritative, so tests stay hermetic against a real key in .env.
  const apiKey = options.apiKey !== undefined ? options.apiKey : import.meta.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  const targets = candidates.filter((candidate) => candidate.ein !== undefined && !candidate.parent_organization?.trim());
  if (!targets.length) return { applied: 0, status: "applied" };
  if (!apiKey) return { applied: 0, status: "not_configured" };

  try {
    const doFetch = options.fetchImpl ?? ((url: string, init?: RequestInit) => fetch(url, init));
    const response = await doFetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        model: import.meta.env.OPENAI_BUSINESS_SEARCH_MODEL || process.env.OPENAI_BUSINESS_SEARCH_MODEL || "gpt-4.1-mini",
        max_output_tokens: 2000,
        input: [
          {
            role: "system",
            content:
              "You link U.S. nonprofit organizations to their parent organization. The user already tracks the employers listed in tracked_employers; when an organization is a member, subsidiary, hospital, clinic, or chapter of one of them, return that tracked name exactly. Otherwise return the real-world parent (health system, parent company, umbrella, or national body) using the name the user would recognize. Return an empty string when the organization is itself top-level or you do not know. Never invent a parent.",
          },
          {
            role: "user",
            content: JSON.stringify({
              tracked_employers: trackedEmployerNames.slice(0, 50),
              organizations: targets.map((candidate) => ({
                ein: candidate.ein,
                name: candidate.name,
                location: candidate.location,
              })),
            }),
          },
        ],
        text: { format: { type: "json_schema", name: "nine_ninety_parents", strict: true, schema: parentLinkSchema } },
      }),
    });
    if (!response.ok) return { applied: 0, status: "unavailable" };

    const payload = await response.json();
    const text = extractResponseText(payload);
    if (!text) return { applied: 0, status: "unavailable" };
    const parsed = JSON.parse(text) as { organizations?: Array<{ ein?: unknown; parent_organization?: unknown }> };
    const parentByEin = new Map<number, string>();
    for (const row of parsed.organizations ?? []) {
      const ein = typeof row.ein === "number" ? row.ein : Number(row.ein);
      const parent = typeof row.parent_organization === "string" ? row.parent_organization.trim().slice(0, 120) : "";
      if (Number.isFinite(ein) && parent) parentByEin.set(ein, parent);
    }

    let applied = 0;
    for (const candidate of targets) {
      const parent = parentByEin.get(candidate.ein!);
      if (parent) {
        candidate.parent_organization = parent;
        applied += 1;
      }
    }
    return { applied, status: "applied" };
  } catch {
    return { applied: 0, status: "unavailable" };
  }
}
