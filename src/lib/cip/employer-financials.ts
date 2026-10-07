import type { SupabaseClient } from "@supabase/supabase-js";
import { employerMatch, normOrg, type MatchBasis } from "@/lib/cip/employer-resolution";
import {
  fetchNineNinetyOrgDetail,
  formatRevenueUsd,
  isEmployableNineNinetyOrg,
  NINE_NINETY_ORGANIZATION_URL,
  searchNineNinetyByName,
  type NineNinetyDeps,
  type NineNinetyFiling,
  type NineNinetyOrgRow,
} from "@/lib/cip/propublica-990";
import { normalizeStateCode } from "@/lib/cip/us-states";

/**
 * IRS Form 990 enrichment for employers the user already tracks (Employers & Opportunities Rethink,
 * §5 / §13: "the consumer that makes the 990 data pay off"). Deterministic and honest:
 *
 *  - A profile only ever states what a public filing says (revenue, expenses, assets by year) and a
 *    trend computed from those numbers. Nothing is inferred about a specific job's budget.
 *  - Missing data is UNKNOWN, never "poor fit": a city, a college system, a for-profit, or a tiny
 *    nonprofit may simply not have a filing the service can find.
 *  - A name is only attached to a filer automatically on an EXACT or ACRONYM match within one
 *    state. A weaker match is surfaced as a suggestion for the user to confirm by entering the EIN.
 *  - A transient lookup failure never overwrites good saved data.
 *
 * Nothing leaves the app except the employer's public name and state, sent to ProPublica.
 */

export type FundingTrend = "growing" | "stable" | "shrinking" | "unknown";
export type ProfileStatus = "ok" | "no_match" | "no_filings" | "lookup_failed";

/** One year of the revenue series stored on a profile (newest first). */
export interface SeriesPoint {
  year: number;
  revenue: number | null;
  expenses: number | null;
}

export interface FundingProfile {
  /** `normOrg(watched employer name)` — the same key the recommendation chips resolve employers to. */
  employerKey: string;
  employerName: string;
  ein: number | null;
  organizationName: string;
  nteeCode: string;
  latestRevenueUsd: number | null;
  latestExpensesUsd: number | null;
  latestAssetsUsd: number | null;
  latestFilingYear: number | null;
  filingCount: number;
  trend: FundingTrend;
  revenueSeries: SeriesPoint[];
  pdfUrl: string;
  sourceUrl: string;
  status: ProfileStatus;
  statusNote: string;
  updatedAt: string;
}

// ---------------------------------------------------------------- trend (pure)

/** Revenue moved by at least this fraction across the window to count as growing/shrinking. */
export const TREND_THRESHOLD = 0.1;
/** A single-year drop at least this steep counts as shrinking even if the window looks flat (a lost grant). */
export const SHARP_DROP_THRESHOLD = 0.25;
/** How many of the most recent filings with revenue the trend looks across. */
export const TREND_WINDOW_FILINGS = 3;

export interface TrendResult {
  trend: FundingTrend;
  /** Latest revenue vs the oldest filing in the window (fraction; -0.18 = down 18%). */
  changePct: number | null;
  fromYear: number | null;
  toYear: number | null;
  /** Latest revenue vs the filing just before it. */
  yearOverYearPct: number | null;
}

/**
 * Revenue trend across up to the last three filings that report revenue. Unknown when there are
 * fewer than two usable filings or the oldest figure is not positive. Revenue (not surplus) is used
 * on purpose: nonprofit revenue is lumpy (one-time grants, investment gains), so the thresholds are
 * deliberately wide and a "stable" result is the common, unremarkable outcome.
 */
export function computeRevenueTrend(series: Array<{ year: number; revenue?: number | null }>): TrendResult {
  const usable = series
    .filter((point) => typeof point.revenue === "number" && Number.isFinite(point.revenue))
    .sort((a, b) => b.year - a.year)
    .slice(0, TREND_WINDOW_FILINGS) as Array<{ year: number; revenue: number }>;
  const unknown: TrendResult = { trend: "unknown", changePct: null, fromYear: null, toYear: null, yearOverYearPct: null };
  if (usable.length < 2) return unknown;

  const latest = usable[0];
  const oldest = usable[usable.length - 1];
  const previous = usable[1];
  if (oldest.revenue <= 0) return unknown;

  const changePct = (latest.revenue - oldest.revenue) / oldest.revenue;
  const yearOverYearPct = previous.revenue > 0 ? (latest.revenue - previous.revenue) / previous.revenue : null;
  const sharpDrop = yearOverYearPct !== null && yearOverYearPct <= -SHARP_DROP_THRESHOLD;

  let trend: FundingTrend = "stable";
  if (changePct <= -TREND_THRESHOLD || sharpDrop) trend = "shrinking";
  else if (changePct >= TREND_THRESHOLD) trend = "growing";
  return { trend, changePct, fromYear: oldest.year, toYear: latest.year, yearOverYearPct };
}

// ---------------------------------------------------------------- signal for recommendations (pure)

export interface FundingSignal {
  trend: FundingTrend;
  latestRevenueUsd: number;
  filingYear: number | null;
  changePct: number | null;
  fromYear: number | null;
  /** Expenses exceeded revenue in the latest filing. */
  deficit: boolean;
  /** A one-line, citable summary, e.g. "IRS 990 (FY 2024): revenue $1.4M, down 18% since FY 2022". */
  line: string;
}

function pctText(change: number): string {
  const rounded = Math.round(Math.abs(change) * 100);
  return `${change < 0 ? "down" : "up"} ${rounded}%`;
}

/** The compact signal a recommendation can cite. Null unless the profile has real filing numbers. */
export function profileToSignal(profile: FundingProfile | null | undefined): FundingSignal | null {
  if (!profile || profile.status !== "ok" || profile.latestRevenueUsd === null) return null;
  const trend = computeRevenueTrend(profile.revenueSeries);
  const deficit = profile.latestExpensesUsd !== null && profile.latestExpensesUsd > profile.latestRevenueUsd;
  const base = `IRS 990${profile.latestFilingYear ? ` (FY ${profile.latestFilingYear})` : ""}: revenue ${formatRevenueUsd(profile.latestRevenueUsd)}`;
  let movement = "";
  if (trend.trend !== "unknown" && trend.changePct !== null && trend.fromYear !== null) {
    movement =
      trend.trend === "stable"
        ? `, roughly flat since FY ${trend.fromYear}`
        : `, ${pctText(trend.changePct)} since FY ${trend.fromYear}`;
    if (trend.trend === "shrinking" && trend.yearOverYearPct !== null && trend.yearOverYearPct <= -SHARP_DROP_THRESHOLD) {
      movement += ` (down ${Math.round(Math.abs(trend.yearOverYearPct) * 100)}% in the latest year)`;
    }
  }
  const deficitText = deficit ? "; expenses exceeded revenue" : "";
  return {
    trend: trend.trend,
    latestRevenueUsd: profile.latestRevenueUsd,
    filingYear: profile.latestFilingYear,
    changePct: trend.changePct,
    fromYear: trend.fromYear,
    deficit,
    line: `${base}${movement}${deficitText}`,
  };
}

// ---------------------------------------------------------------- state hint (pure)

/** The two-letter state from a "City, ST" / "City, State ZIP" / "City ST" location, or "" when unclear. */
export function stateHintFor(...texts: Array<string | null | undefined>): string {
  for (const text of texts) {
    const value = (text ?? "").trim();
    if (!value) continue;
    const lastPart = value.split(",").pop() ?? "";
    for (const token of lastPart.trim().split(/\s+/)) {
      const code = normalizeStateCode(token);
      if (code) return code;
    }
    // "Lebanon NH" with no comma: try the whole string's last token(s).
    const words = value.split(/\s+/);
    for (let take = Math.min(2, words.length); take >= 1; take--) {
      const code = normalizeStateCode(words.slice(-take).join(" "));
      if (code) return code;
    }
  }
  return "";
}

// ---------------------------------------------------------------- name → filer (pure)

export type NameMatchResult =
  | { kind: "match"; org: NineNinetyOrgRow; basis: MatchBasis }
  | { kind: "ambiguous"; orgs: NineNinetyOrgRow[] }
  | { kind: "suggestion"; org: NineNinetyOrgRow }
  | { kind: "none" };

/**
 * Decide which (if any) of the search results is this employer. Only an exact or acronym name match
 * within the right state is accepted automatically, and only when exactly one filer sits in the best
 * tier. A looser token-overlap match is never attached: it comes back as a suggestion to confirm.
 */
export function matchEmployerToFiler(employerName: string, stateCode: string, rows: NineNinetyOrgRow[]): NameMatchResult {
  const target = normOrg(employerName);
  if (!target) return { kind: "none" };
  const eligible = rows.filter((row) => row.state === stateCode && isEmployableNineNinetyOrg(row));

  const byBasis: Record<MatchBasis, NineNinetyOrgRow[]> = { exact: [], acronym: [], tokens: [] };
  for (const row of eligible) {
    const basis = employerMatch(normOrg(row.name), target);
    if (basis) byBasis[basis].push(row);
  }
  const distinct = (orgs: NineNinetyOrgRow[]) => [...new Map(orgs.map((org) => [org.ein, org])).values()];

  for (const basis of ["exact", "acronym"] as const) {
    const orgs = distinct(byBasis[basis]);
    if (orgs.length === 1) return { kind: "match", org: orgs[0], basis };
    if (orgs.length > 1) return { kind: "ambiguous", orgs };
  }
  const loose = distinct(byBasis.tokens);
  if (loose.length) return { kind: "suggestion", org: loose[0] };
  return { kind: "none" };
}

// ---------------------------------------------------------------- lookup

export interface LookupRequest {
  employerName: string;
  /** Two-letter state, or "" when unknown (then a name search is not attempted). */
  stateCode: string;
  /** A known EIN (from a 990-discovered candidate, an earlier match, or entered by the user). */
  ein?: number | null;
  /** How the EIN was learned — only used in the status note. */
  einSource?: "candidate" | "stored" | "user";
}

export type LookupDeps = NineNinetyDeps & { now?: () => string };

/** Pause between a name search and the detail request (same politeness as the discovery client). */
const REQUEST_PAUSE_MS = 600;

function emptyProfile(request: LookupRequest, now: string): FundingProfile {
  return {
    employerKey: normOrg(request.employerName),
    employerName: request.employerName,
    ein: null,
    organizationName: "",
    nteeCode: "",
    latestRevenueUsd: null,
    latestExpensesUsd: null,
    latestAssetsUsd: null,
    latestFilingYear: null,
    filingCount: 0,
    trend: "unknown",
    revenueSeries: [],
    pdfUrl: "",
    sourceUrl: "",
    status: "no_match",
    statusNote: "",
    updatedAt: now,
  };
}

export function formatEinDisplay(ein: number): string {
  const digits = String(Math.trunc(ein)).padStart(9, "0");
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

/** Accepts "30-2590510", "302590510", or a number; returns the EIN as a number, or null if it is not nine digits. */
export function parseEinInput(raw: unknown): number | null {
  const digits = String(raw ?? "").replace(/[\s-]/g, "");
  if (!/^\d{9}$/.test(digits)) return null;
  const value = Number(digits);
  return value > 0 ? value : null;
}

function toSeries(series: NineNinetyFiling[]): SeriesPoint[] {
  return series.map((point) => ({ year: point.year, revenue: point.revenue ?? null, expenses: point.expenses ?? null }));
}

/**
 * Look up one employer's filings. Never throws; every outcome is a profile with an honest status.
 * With an EIN it goes straight to that organization; otherwise it searches by name within the state.
 */
export async function lookupEmployerFinancials(request: LookupRequest, deps: LookupDeps = {}): Promise<FundingProfile> {
  const now = (deps.now ?? (() => new Date().toISOString()))();
  const base = emptyProfile(request, now);
  try {
    let ein = request.ein ?? null;
    let nameNote = "";

    if (ein === null) {
      if (!request.stateCode) {
        return { ...base, status: "no_match", statusNote: "Couldn't tell which state this employer is in, so no filing was searched for. Enter its EIN to link it." };
      }
      const search = await searchNineNinetyByName(request.employerName, request.stateCode, deps);
      if (search.failed) {
        return { ...base, status: "lookup_failed", statusNote: "ProPublica didn't respond. Try again in a few minutes." };
      }
      const match = matchEmployerToFiler(request.employerName, request.stateCode, search.orgs);
      if (match.kind === "none") {
        return {
          ...base,
          status: "no_match",
          statusNote: `No Form 990 filer named like this was found in ${request.stateCode}. Public bodies, many for-profits, and very small organizations do not file one — that means "unknown", not poor funding. If you know its EIN, enter it.`,
        };
      }
      if (match.kind === "ambiguous") {
        const names = match.orgs.slice(0, 3).map((org) => `${org.name} (${formatEinDisplay(org.ein)})`).join("; ");
        return { ...base, status: "no_match", statusNote: `More than one filer shares this name (${names}). Enter the right EIN to link it.` };
      }
      if (match.kind === "suggestion") {
        return {
          ...base,
          status: "no_match",
          statusNote: `Possible match, not confirmed: ${match.org.name} (EIN ${formatEinDisplay(match.org.ein)}), ${match.org.city}, ${match.org.state}. Enter the EIN to confirm.`,
        };
      }
      ein = match.org.ein;
      if (deps.sleep) await deps.sleep(REQUEST_PAUSE_MS);
      nameNote = `Matched by name (${match.basis}) to ${match.org.name}.`;
    }

    const detail = await fetchNineNinetyOrgDetail(ein, deps);
    const sourceUrl = `${NINE_NINETY_ORGANIZATION_URL}/${ein}`;
    if (!detail) {
      return {
        ...base,
        ein,
        sourceUrl,
        status: "lookup_failed",
        statusNote: `ProPublica returned nothing for EIN ${formatEinDisplay(ein)}. Check the number, or try again later.`,
      };
    }
    const sourceNote =
      request.einSource === "user" ? "EIN entered by you." : request.einSource === "candidate" ? "Linked from the IRS 990 discovery result." : nameNote;
    if (!detail.series.length && detail.revenue === undefined) {
      return {
        ...base,
        ein,
        organizationName: detail.name,
        sourceUrl,
        status: "no_filings",
        statusNote: `${detail.name} is registered, but no Form 990 data filing was found (the smallest nonprofits file only a short e-postcard). ${sourceNote}`.trim(),
      };
    }

    const series = toSeries(detail.series);
    const trend = computeRevenueTrend(series).trend;
    return {
      ...base,
      ein,
      organizationName: detail.name,
      latestRevenueUsd: detail.revenue ?? null,
      latestExpensesUsd: detail.expenses ?? null,
      latestAssetsUsd: detail.assets ?? null,
      latestFilingYear: detail.filingYear ?? null,
      filingCount: detail.series.length,
      trend,
      revenueSeries: series,
      pdfUrl: detail.pdfUrl,
      sourceUrl,
      status: "ok",
      statusNote: sourceNote,
    };
  } catch (error) {
    return { ...base, status: "lookup_failed", statusNote: `The lookup failed unexpectedly (${error instanceof Error ? error.message.slice(0, 120) : "unknown error"}).` };
  }
}

// ---------------------------------------------------------------- persistence

interface ProfileRow {
  employer_key: string;
  employer_name: string;
  ein: number | null;
  organization_name: string;
  ntee_code: string;
  latest_revenue_usd: number | null;
  latest_expenses_usd: number | null;
  latest_assets_usd: number | null;
  latest_filing_year: number | null;
  filing_count: number;
  trend: string;
  revenue_series: unknown;
  pdf_url: string;
  source_url: string;
  status: string;
  status_note: string;
  updated_at: string;
}

const PROFILE_COLUMNS =
  "employer_key,employer_name,ein,organization_name,ntee_code,latest_revenue_usd,latest_expenses_usd,latest_assets_usd,latest_filing_year,filing_count,trend,revenue_series,pdf_url,source_url,status,status_note,updated_at";

const num = (value: unknown): number | null => {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
};

function parseSeries(raw: unknown): SeriesPoint[] {
  if (!Array.isArray(raw)) return [];
  const points: SeriesPoint[] = [];
  for (const item of raw) {
    const point = item as { year?: unknown; revenue?: unknown; expenses?: unknown };
    const year = num(point?.year);
    if (year === null) continue;
    points.push({ year, revenue: num(point.revenue), expenses: num(point.expenses) });
  }
  return points.sort((a, b) => b.year - a.year);
}

function fromRow(row: ProfileRow): FundingProfile {
  const status = (["ok", "no_match", "no_filings", "lookup_failed"] as const).includes(row.status as ProfileStatus) ? (row.status as ProfileStatus) : "no_match";
  const series = parseSeries(row.revenue_series);
  return {
    employerKey: row.employer_key,
    employerName: row.employer_name ?? "",
    ein: num(row.ein),
    organizationName: row.organization_name ?? "",
    nteeCode: row.ntee_code ?? "",
    latestRevenueUsd: num(row.latest_revenue_usd),
    latestExpensesUsd: num(row.latest_expenses_usd),
    latestAssetsUsd: num(row.latest_assets_usd),
    latestFilingYear: num(row.latest_filing_year),
    filingCount: num(row.filing_count) ?? 0,
    // Recomputed from the stored series so a threshold change applies to old rows too.
    trend: computeRevenueTrend(series).trend,
    revenueSeries: series,
    pdfUrl: row.pdf_url ?? "",
    sourceUrl: row.source_url ?? "",
    status,
    statusNote: row.status_note ?? "",
    updatedAt: row.updated_at,
  };
}

function toRow(profile: FundingProfile): Omit<ProfileRow, "updated_at"> & { updated_at: string } {
  return {
    employer_key: profile.employerKey,
    employer_name: profile.employerName,
    ein: profile.ein,
    organization_name: profile.organizationName,
    ntee_code: profile.nteeCode,
    latest_revenue_usd: profile.latestRevenueUsd,
    latest_expenses_usd: profile.latestExpensesUsd,
    latest_assets_usd: profile.latestAssetsUsd,
    latest_filing_year: profile.latestFilingYear,
    filing_count: profile.filingCount,
    trend: profile.trend,
    revenue_series: profile.revenueSeries,
    pdf_url: profile.pdfUrl,
    source_url: profile.sourceUrl,
    status: profile.status,
    status_note: profile.statusNote,
    updated_at: profile.updatedAt,
  };
}

/**
 * Every saved profile for the user, keyed by employer key. Never throws: if the table is missing
 * (migration not applied) the error comes back as text and the map is empty, so callers degrade to
 * "no 990 data" instead of breaking a page.
 */
export async function loadFundingProfiles(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ profiles: Map<string, FundingProfile>; error: string | null }> {
  try {
    const { data, error } = await supabase.from("employer_990_profiles").select(PROFILE_COLUMNS).eq("user_id", userId).limit(1000);
    if (error) return { profiles: new Map(), error: error.message };
    const profiles = new Map<string, FundingProfile>();
    for (const row of (data ?? []) as ProfileRow[]) profiles.set(row.employer_key, fromRow(row));
    return { profiles, error: null };
  } catch (error) {
    return { profiles: new Map(), error: error instanceof Error ? error.message : "Could not load financial profiles." };
  }
}

/** Save (update-then-insert, so it works without a unique-conflict clause). Returns an error string or null. */
export async function saveFundingProfile(supabase: SupabaseClient, userId: string, profile: FundingProfile): Promise<string | null> {
  try {
    const row = toRow(profile);
    const { data: updated, error: updateError } = await supabase
      .from("employer_990_profiles")
      .update(row)
      .eq("user_id", userId)
      .eq("employer_key", profile.employerKey)
      .select("employer_key");
    if (updateError) return updateError.message;
    if (updated && (updated as unknown[]).length) return null;
    const { error } = await supabase.from("employer_990_profiles").insert({ user_id: userId, created_at: profile.updatedAt, ...row });
    return error ? error.message : null;
  } catch (error) {
    return error instanceof Error ? error.message : "Could not save the financial profile.";
  }
}

export interface RefreshTarget {
  name: string;
  location?: string | null;
  region?: string | null;
  /** An EIN already known for this employer (a 990 candidate's, or one the user entered). */
  ein?: number | null;
  einSource?: "candidate" | "user";
}

export interface RefreshOutcome {
  profile: FundingProfile;
  saved: boolean;
  /** Set when saving failed, or when a failed lookup kept the earlier saved data. */
  error: string | null;
}

/**
 * Look up and store one employer's profile. Reuses a previously linked EIN, and never lets a
 * transient failure (or a worse result) replace a profile that already has real filing numbers.
 */
export async function refreshFundingProfile(
  supabase: SupabaseClient,
  userId: string,
  target: RefreshTarget,
  existing: FundingProfile | null,
  deps: LookupDeps = {},
): Promise<RefreshOutcome> {
  const reuseEin = target.ein ?? (existing && existing.status !== "no_match" ? existing.ein : null);
  const einSource: LookupRequest["einSource"] = target.ein ? target.einSource ?? "candidate" : reuseEin ? "stored" : undefined;
  const fresh = await lookupEmployerFinancials(
    { employerName: target.name, stateCode: stateHintFor(target.location, target.region), ein: reuseEin, einSource },
    deps,
  );

  if (fresh.status === "lookup_failed" && existing && existing.status === "ok") {
    return { profile: existing, saved: false, error: `${fresh.statusNote} Showing the last saved filing data.` };
  }
  // Keep a linked EIN's earlier "entered by you" note when a later refresh reuses it.
  if (fresh.status === "ok" && einSource === "stored" && existing?.statusNote.includes("entered by you")) {
    fresh.statusNote = existing.statusNote;
  }
  const error = await saveFundingProfile(supabase, userId, fresh);
  return { profile: fresh, saved: error === null, error };
}

// ---------------------------------------------------------------- weekly briefing (pure)

/** A tracked employer's funding state as stored on a weekly snapshot, so next week can say what changed. */
export interface FundingSnapshotEntry {
  key: string;
  name: string;
  trend: FundingTrend;
  filingYear: number | null;
  revenueUsd: number | null;
  /** The citable one-line summary (see `profileToSignal`). */
  line: string;
}

const TREND_WORD: Record<FundingTrend, string> = { growing: "growing", stable: "steady", shrinking: "shrinking", unknown: "unclear" };

/** Entries for the user's WATCHED employers that have real filing numbers (unknown stays absent). */
export function fundingEntriesFor(watchedNames: string[], profiles: Map<string, FundingProfile>): FundingSnapshotEntry[] {
  const entries: FundingSnapshotEntry[] = [];
  const seen = new Set<string>();
  for (const name of watchedNames) {
    const key = normOrg(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const profile = profiles.get(key);
    const signal = profileToSignal(profile);
    if (!profile || !signal) continue;
    entries.push({ key, name, trend: signal.trend, filingYear: signal.filingYear, revenueUsd: signal.latestRevenueUsd, line: signal.line });
  }
  return entries;
}

/** Read the funding entries a previous snapshot stored, or null when that snapshot predates enrichment. */
export function parseFundingEntries(evidence: Array<Record<string, unknown>> | null | undefined): FundingSnapshotEntry[] | null {
  const item = (evidence ?? []).find((entry) => entry?.type === "funding_profiles") as { entries?: unknown } | undefined;
  if (!item || !Array.isArray(item.entries)) return null;
  const entries: FundingSnapshotEntry[] = [];
  for (const raw of item.entries) {
    const entry = raw as Partial<FundingSnapshotEntry>;
    if (typeof entry?.key !== "string" || typeof entry.name !== "string") continue;
    const trend = (["growing", "stable", "shrinking", "unknown"] as const).includes(entry.trend as FundingTrend) ? (entry.trend as FundingTrend) : "unknown";
    entries.push({
      key: entry.key,
      name: entry.name,
      trend,
      filingYear: typeof entry.filingYear === "number" ? entry.filingYear : null,
      revenueUsd: typeof entry.revenueUsd === "number" ? entry.revenueUsd : null,
      line: typeof entry.line === "string" ? entry.line : "",
    });
  }
  return entries;
}

/**
 * What the weekly briefing says about funding. CONCERNS are standing: every tracked employer whose
 * revenue is shrinking is named each week until that changes. CHANGES are only reported against a
 * previous snapshot that already had funding data (the first enriched week is a baseline, not news):
 * a newer filing year, or a trend that moved.
 */
export function diffFundingEntries(
  current: FundingSnapshotEntry[],
  previous: FundingSnapshotEntry[] | null,
): { changes: string[]; concerns: string[] } {
  const concerns = current
    .filter((entry) => entry.trend === "shrinking")
    .map((entry) => `${entry.name}: ${entry.line}. Confirm funding before investing time in roles there.`);

  const changes: string[] = [];
  if (previous) {
    const before = new Map(previous.map((entry) => [entry.key, entry]));
    for (const entry of current) {
      const prior = before.get(entry.key);
      if (!prior) continue;
      if (prior.trend !== entry.trend && prior.trend !== "unknown") {
        changes.push(`${entry.name}'s revenue trend moved from ${TREND_WORD[prior.trend]} to ${TREND_WORD[entry.trend]}: ${entry.line}.`);
      } else if (entry.filingYear !== null && prior.filingYear !== null && entry.filingYear > prior.filingYear) {
        changes.push(`A new IRS 990 is on file for ${entry.name}: ${entry.line}.`);
      }
    }
  }
  return { changes: changes.slice(0, 3), concerns: concerns.slice(0, 3) };
}

// ---------------------------------------------------------------- bulk selection (pure)

export const FRESH_PROFILE_DAYS = 30;
export const BULK_REFRESH_CAP = 8;

export interface EmployerToRefresh {
  id: string;
  name: string;
  location?: string | null;
  region?: string | null;
}

/**
 * Which tracked employers a "look up financials" click should handle: ones with no profile first,
 * then failed lookups, then profiles older than 30 days. A fresh profile, or a recent "no match"
 * (re-asking would give the same answer), is left alone. Capped so one click stays quick.
 */
export function selectEmployersForRefresh<T extends EmployerToRefresh>(
  employers: T[],
  profiles: Map<string, FundingProfile>,
  nowIso: string,
  cap = BULK_REFRESH_CAP,
): { selected: T[]; remaining: number; skippedFresh: number } {
  const now = Date.parse(nowIso);
  const maxAgeMs = FRESH_PROFILE_DAYS * 86_400_000;
  const ranked: Array<{ employer: T; priority: number; age: number }> = [];
  let skippedFresh = 0;

  for (const employer of employers) {
    const profile = profiles.get(normOrg(employer.name));
    const age = profile ? Math.max(0, now - Date.parse(profile.updatedAt)) : Number.POSITIVE_INFINITY;
    if (!profile) ranked.push({ employer, priority: 0, age });
    else if (profile.status === "lookup_failed") ranked.push({ employer, priority: 1, age });
    else if (age > maxAgeMs) ranked.push({ employer, priority: 2, age });
    else skippedFresh += 1;
  }
  ranked.sort((a, b) => a.priority - b.priority || b.age - a.age);
  return { selected: ranked.slice(0, cap).map((item) => item.employer), remaining: Math.max(0, ranked.length - cap), skippedFresh };
}
