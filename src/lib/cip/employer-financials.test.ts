import { describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "@/lib/cip/__fixtures__/fake-supabase";
import { upsertCandidateRow } from "@/lib/cip/business-search-engine";
import {
  BULK_REFRESH_CAP,
  computeRevenueTrend,
  diffFundingEntries,
  fundingEntriesFor,
  loadFundingProfiles,
  lookupEmployerFinancials,
  matchEmployerToFiler,
  parseEinInput,
  parseFundingEntries,
  profileToSignal,
  refreshFundingProfile,
  saveFundingProfile,
  selectEmployersForRefresh,
  stateHintFor,
  type FundingProfile,
} from "@/lib/cip/employer-financials";
import { fetchNineNinetyOrgDetail, type NineNinetyOrgRow } from "@/lib/cip/propublica-990";

// Invented organizations only; every network call is an injected stub (the repo's no-network idiom).

const NOW = "2026-10-07T12:00:00.000Z";
const USER = "user-1";
const noSleep = () => Promise.resolve();

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

function fetcherFor(handler: (url: string) => Response | null) {
  const urls: string[] = [];
  const fn = async (input: string | URL | Request): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    urls.push(url);
    return handler(url) ?? jsonResponse({ organizations: [] });
  };
  return Object.assign(fn, { urls }) as unknown as typeof fetch & { urls: string[] };
}

const orgRow = (overrides: Record<string, unknown> = {}) => ({
  ein: 111111111,
  strein: "11-1111111",
  name: "Granite Community Trust",
  sub_name: null,
  city: "Lebanon",
  state: "NH",
  ntee_code: "P30",
  subseccd: 3,
  ...overrides,
});

const searchPage = (orgs: Array<Record<string, unknown>>) => ({ organizations: orgs, total_results: orgs.length, num_pages: 1, cur_page: 0 });

const filing = (year: number, revenue: number, expenses = Math.round(revenue * 0.9)) => ({
  tax_prd_yr: year,
  tax_prd: year * 10000 + 6,
  pdf_url: `https://projects.propublica.org/example/filing-${year}.pdf`,
  totrevenue: revenue,
  totfuncexpns: expenses,
  totassetsend: revenue * 2,
});

const detailPayload = (ein: number, name: string, filings: Array<ReturnType<typeof filing>>) => ({
  organization: { ein, id: ein, name, city: "Lebanon", state: "NH", ntee_code: "P30", subsection_code: 3 },
  filings_with_data: filings,
  filings_without_data: [],
});

/** A fake ProPublica: one search result set and a detail payload per EIN. */
function propublica(opts: { search?: Array<Record<string, unknown>>; details?: Record<number, ReturnType<typeof detailPayload>>; searchStatus?: number }) {
  return fetcherFor((url) => {
    if (url.includes("/search.json")) return opts.searchStatus ? new Response("nope", { status: opts.searchStatus }) : jsonResponse(searchPage(opts.search ?? []));
    const ein = Number(/organizations\/(\d+)\.json/.exec(url)?.[1]);
    const detail = opts.details?.[ein];
    return detail ? jsonResponse(detail) : new Response("not found", { status: 404 });
  });
}

const THREE_YEAR_GROWTH = [filing(2024, 1_400_000), filing(2023, 1_250_000), filing(2022, 1_100_000)];
const THREE_YEAR_DECLINE = [filing(2024, 820_000), filing(2023, 1_000_000), filing(2022, 1_150_000)];

describe("computeRevenueTrend", () => {
  it("calls steady growth growing and steady decline shrinking, with the window and change", () => {
    const growing = computeRevenueTrend(THREE_YEAR_GROWTH.map((f) => ({ year: f.tax_prd_yr, revenue: f.totrevenue })));
    expect(growing).toMatchObject({ trend: "growing", fromYear: 2022, toYear: 2024 });
    expect(growing.changePct).toBeCloseTo(0.2727, 3);
    const shrinking = computeRevenueTrend(THREE_YEAR_DECLINE.map((f) => ({ year: f.tax_prd_yr, revenue: f.totrevenue })));
    expect(shrinking.trend).toBe("shrinking");
    expect(shrinking.changePct).toBeCloseTo(-0.287, 3);
  });

  it("calls small movement stable (revenue is lumpy, so the bar is wide)", () => {
    expect(computeRevenueTrend([{ year: 2024, revenue: 1_050_000 }, { year: 2023, revenue: 1_000_000 }, { year: 2022, revenue: 980_000 }]).trend).toBe("stable");
    expect(computeRevenueTrend([{ year: 2024, revenue: 930_000 }, { year: 2023, revenue: 1_000_000 }]).trend).toBe("stable");
  });

  it("flags a sharp one-year drop as shrinking even when the window looks flat (a lost grant)", () => {
    const result = computeRevenueTrend([{ year: 2024, revenue: 700_000 }, { year: 2023, revenue: 1_000_000 }, { year: 2022, revenue: 760_000 }]);
    expect(result.trend).toBe("shrinking");
    expect(result.yearOverYearPct).toBeCloseTo(-0.3, 3);
  });

  it("is unknown with fewer than two usable filings or a non-positive baseline, and ignores missing revenue", () => {
    expect(computeRevenueTrend([]).trend).toBe("unknown");
    expect(computeRevenueTrend([{ year: 2024, revenue: 1_000_000 }]).trend).toBe("unknown");
    expect(computeRevenueTrend([{ year: 2024, revenue: 1_000_000 }, { year: 2023, revenue: null }]).trend).toBe("unknown");
    expect(computeRevenueTrend([{ year: 2024, revenue: 500_000 }, { year: 2023, revenue: 0 }]).trend).toBe("unknown");
  });

  it("uses at most the three most recent filings, in any input order", () => {
    const result = computeRevenueTrend([
      { year: 2020, revenue: 100_000 },
      { year: 2024, revenue: 1_000_000 },
      { year: 2022, revenue: 990_000 },
      { year: 2023, revenue: 1_000_000 },
    ]);
    expect(result).toMatchObject({ trend: "stable", fromYear: 2022 });
  });
});

describe("stateHintFor / parseEinInput", () => {
  it("reads the state from City, ST / City, State ZIP / City ST and gives up honestly otherwise", () => {
    expect(stateHintFor("Lebanon, NH")).toBe("NH");
    expect(stateHintFor("White River Junction, Vermont 05001")).toBe("VT");
    expect(stateHintFor(null, "Lebanon NH")).toBe("NH");
    expect(stateHintFor("boston", "new_york")).toBe("");
    expect(stateHintFor("", null)).toBe("");
  });

  it("accepts nine-digit EINs with or without the dash and rejects everything else", () => {
    expect(parseEinInput("12-3456789")).toBe(123456789);
    expect(parseEinInput(" 123456789 ")).toBe(123456789);
    expect(parseEinInput("12-345678")).toBeNull();
    expect(parseEinInput("abc")).toBeNull();
    expect(parseEinInput("")).toBeNull();
    expect(parseEinInput("000000000")).toBeNull();
  });
});

describe("filing series parsing", () => {
  it("builds a newest-first, one-per-year series from the detail payload and takes the latest from it", async () => {
    const fetchImpl = propublica({
      details: {
        111111111: detailPayload(111111111, "Granite Community Trust", [filing(2022, 1_100_000), filing(2024, 1_400_000), filing(2023, 1_250_000), filing(2024, 1_400_000)]),
      },
    });
    const detail = await fetchNineNinetyOrgDetail(111111111, { fetchImpl, sleep: noSleep });
    expect(detail?.series.map((point) => point.year)).toEqual([2024, 2023, 2022]);
    expect(detail).toMatchObject({ filingYear: 2024, revenue: 1_400_000 });
  });

  it("caps the series at five filings", async () => {
    const many = [2024, 2023, 2022, 2021, 2020, 2019, 2018].map((year) => filing(year, 1_000_000));
    const fetchImpl = propublica({ details: { 111111111: detailPayload(111111111, "Granite Community Trust", many) } });
    expect((await fetchNineNinetyOrgDetail(111111111, { fetchImpl, sleep: noSleep }))?.series).toHaveLength(5);
  });
});

describe("matchEmployerToFiler", () => {
  const rows = (...overrides: Array<Record<string, unknown>>) =>
    overrides.map((o) => ({ ein: 1, strein: "", name: "X", subName: "", city: "Lebanon", state: "NH", nteeCode: "", subseccd: 3, ...o })) as NineNinetyOrgRow[];

  it("accepts one exact (suffix-insensitive) match in the right state", () => {
    const result = matchEmployerToFiler("Granite Community Trust", "NH", rows({ ein: 11, name: "GRANITE COMMUNITY TRUST INC" }, { ein: 12, name: "Unrelated Arts Council" }));
    expect(result).toMatchObject({ kind: "match", basis: "exact", org: { ein: 11 } });
  });

  it("accepts an acronym match", () => {
    const result = matchEmployerToFiler("DHMC", "NH", rows({ ein: 21, name: "Dartmouth Hitchcock Medical Center" }));
    expect(result).toMatchObject({ kind: "match", basis: "acronym" });
  });

  it("never attaches a looser token match: it is only a suggestion to confirm", () => {
    const result = matchEmployerToFiler("Valley Arts", "NH", rows({ ein: 31, name: "Valley Arts Council of the Upper Valley" }));
    expect(result).toMatchObject({ kind: "suggestion", org: { ein: 31 } });
  });

  it("ignores a same-named filer in another state, group returns, and non-501(c)(3) rows", () => {
    expect(matchEmployerToFiler("Granite Community Trust", "NH", rows({ ein: 41, name: "Granite Community Trust", state: "VT" }))).toEqual({ kind: "none" });
    expect(matchEmployerToFiler("Granite Community Trust", "NH", rows({ ein: 42, name: "Granite Community Trust", subName: "Group Return" }))).toEqual({ kind: "none" });
    expect(matchEmployerToFiler("Granite Community Trust", "NH", rows({ ein: 43, name: "Granite Community Trust", subseccd: 6 }))).toEqual({ kind: "none" });
  });

  it("is ambiguous when two different filers tie in the best tier, and counts one EIN once", () => {
    const tie = matchEmployerToFiler("Granite Community Trust", "NH", rows({ ein: 51, name: "Granite Community Trust" }, { ein: 52, name: "Granite Community Trust Inc" }));
    expect(tie.kind).toBe("ambiguous");
    const repeat = matchEmployerToFiler("Granite Community Trust", "NH", rows({ ein: 51, name: "Granite Community Trust" }, { ein: 51, name: "Granite Community Trust" }));
    expect(repeat.kind).toBe("match");
  });
});

describe("lookupEmployerFinancials", () => {
  const deps = (fetchImpl: typeof fetch) => ({ fetchImpl, sleep: noSleep, now: () => NOW });

  it("finds an exact-name filer, reads its filings, and builds a profile with series, trend, and provenance", async () => {
    const fetchImpl = propublica({
      search: [orgRow()],
      details: { 111111111: detailPayload(111111111, "Granite Community Trust", THREE_YEAR_DECLINE) },
    });
    const profile = await lookupEmployerFinancials({ employerName: "Granite Community Trust", stateCode: "NH" }, deps(fetchImpl));
    expect(profile).toMatchObject({
      status: "ok",
      ein: 111111111,
      employerKey: "granite community trust",
      organizationName: "Granite Community Trust",
      latestRevenueUsd: 820_000,
      latestFilingYear: 2024,
      filingCount: 3,
      trend: "shrinking",
      sourceUrl: "https://projects.propublica.org/nonprofits/organizations/111111111",
      updatedAt: NOW,
    });
    expect(profile.revenueSeries.map((point) => point.year)).toEqual([2024, 2023, 2022]);
    expect(profile.statusNote).toMatch(/Matched by name/);
    expect(fetchImpl.urls[0]).toContain("state[id]=NH");
  });

  it("goes straight to a known EIN without any name search", async () => {
    const fetchImpl = propublica({ details: { 222222222: detailPayload(222222222, "Valley Arts Council", THREE_YEAR_GROWTH) } });
    const profile = await lookupEmployerFinancials({ employerName: "Valley Arts", stateCode: "", ein: 222222222, einSource: "user" }, deps(fetchImpl));
    expect(profile).toMatchObject({ status: "ok", ein: 222222222, trend: "growing", statusNote: "EIN entered by you." });
    expect(fetchImpl.urls.every((url) => !url.includes("/search.json"))).toBe(true);
  });

  it("says no_match, never guesses, and never searches when the state is unknown", async () => {
    const fetchImpl = propublica({ search: [orgRow()] });
    const profile = await lookupEmployerFinancials({ employerName: "Granite Community Trust", stateCode: "" }, deps(fetchImpl));
    expect(profile.status).toBe("no_match");
    expect(profile.statusNote).toMatch(/which state/);
    expect(fetchImpl.urls).toHaveLength(0);
  });

  it("reports a zero-result search (ProPublica sends HTTP 404 + JSON) as no_match, not lookup_failed", async () => {
    const fetchImpl = fetcherFor(() => jsonResponse({ total_results: 0, organizations: [], num_pages: 0 }, 404));
    const profile = await lookupEmployerFinancials({ employerName: "City of Lebanon", stateCode: "NH" }, deps(fetchImpl));
    expect(profile.status).toBe("no_match");
    expect(profile.statusNote).not.toMatch(/didn't respond/);
  });

  it("reports no_match for a nonprofit-less employer as unknown, not poor funding", async () => {
    const profile = await lookupEmployerFinancials({ employerName: "City of Lebanon", stateCode: "NH" }, deps(propublica({ search: [] })));
    expect(profile.status).toBe("no_match");
    expect(profile.statusNote).toMatch(/unknown/i);
    expect(profile.latestRevenueUsd).toBeNull();
  });

  it("offers a looser match as a suggestion with the EIN to confirm, without attaching it", async () => {
    const profile = await lookupEmployerFinancials(
      { employerName: "Valley Arts", stateCode: "NH" },
      deps(propublica({ search: [orgRow({ ein: 333333333, name: "Valley Arts Council of the Upper Valley" })] })),
    );
    expect(profile).toMatchObject({ status: "no_match", ein: null });
    expect(profile.statusNote).toMatch(/Possible match, not confirmed.*33-3333333/);
  });

  it("reports lookup_failed (not no_match) when ProPublica is unreachable", async () => {
    const profile = await lookupEmployerFinancials({ employerName: "Granite Community Trust", stateCode: "NH" }, deps(propublica({ searchStatus: 500 })));
    expect(profile.status).toBe("lookup_failed");
    const unknownEin = await lookupEmployerFinancials({ employerName: "x", stateCode: "NH", ein: 999999999 }, deps(propublica({ details: {} })));
    expect(unknownEin).toMatchObject({ status: "lookup_failed", ein: 999999999 });
  });

  it("reports no_filings for a registered organization with no data filings", async () => {
    const fetchImpl = propublica({ details: { 444444444: detailPayload(444444444, "Tiny Garden Club", []) } });
    const profile = await lookupEmployerFinancials({ employerName: "Tiny Garden Club", stateCode: "NH", ein: 444444444 }, deps(fetchImpl));
    expect(profile).toMatchObject({ status: "no_filings", organizationName: "Tiny Garden Club" });
    expect(profile.statusNote).toMatch(/e-postcard/);
  });

  it("never throws, even when the fetch itself blows up", async () => {
    const boom = (async () => {
      throw new Error("socket hang up");
    }) as unknown as typeof fetch;
    const profile = await lookupEmployerFinancials({ employerName: "Granite Community Trust", stateCode: "NH" }, { fetchImpl: boom, sleep: noSleep, now: () => NOW });
    expect(profile.status).toBe("lookup_failed");
  });
});

describe("profileToSignal", () => {
  const base = (over: Partial<FundingProfile> = {}): FundingProfile => ({
    employerKey: "granite community trust", employerName: "Granite Community Trust", ein: 1, organizationName: "Granite Community Trust", nteeCode: "P30",
    latestRevenueUsd: 820_000, latestExpensesUsd: 790_000, latestAssetsUsd: 1_600_000, latestFilingYear: 2024, filingCount: 3, trend: "shrinking",
    revenueSeries: THREE_YEAR_DECLINE.map((f) => ({ year: f.tax_prd_yr, revenue: f.totrevenue, expenses: f.totfuncexpns })),
    pdfUrl: "", sourceUrl: "", status: "ok", statusNote: "", updatedAt: NOW, ...over,
  });

  it("writes a citable line with the year, revenue, and movement since the oldest filing in the window", () => {
    const signal = profileToSignal(base());
    expect(signal?.trend).toBe("shrinking");
    expect(signal?.line).toBe("IRS 990 (FY 2024): revenue $820k, down 29% since FY 2022"); // an 18% latest-year drop is below the sharp-drop bar
  });

  it("calls out a sharp latest-year drop (a lost grant) in the line", () => {
    const sharp = base({ latestRevenueUsd: 700_000, latestExpensesUsd: 600_000, revenueSeries: [{ year: 2024, revenue: 700_000, expenses: null }, { year: 2023, revenue: 1_000_000, expenses: null }, { year: 2022, revenue: 760_000, expenses: null }] });
    expect(profileToSignal(sharp)?.line).toBe("IRS 990 (FY 2024): revenue $700k, down 8% since FY 2022 (down 30% in the latest year)");
  });

  it("notes a deficit and a flat trend plainly", () => {
    const flat = base({ revenueSeries: [{ year: 2024, revenue: 1_010_000, expenses: 1_200_000 }, { year: 2023, revenue: 1_000_000, expenses: null }], latestRevenueUsd: 1_010_000, latestExpensesUsd: 1_200_000 });
    expect(profileToSignal(flat)?.line).toBe("IRS 990 (FY 2024): revenue $1M, roughly flat since FY 2023; expenses exceeded revenue");
  });

  it("is null (unknown) unless the profile has real filing numbers", () => {
    expect(profileToSignal(null)).toBeNull();
    expect(profileToSignal(base({ status: "no_match" }))).toBeNull();
    expect(profileToSignal(base({ latestRevenueUsd: null }))).toBeNull();
  });
});

describe("persistence and refresh", () => {
  const okProfile = (over: Partial<FundingProfile> = {}): FundingProfile => ({
    employerKey: "granite community trust", employerName: "Granite Community Trust", ein: 111111111, organizationName: "Granite Community Trust", nteeCode: "P30",
    latestRevenueUsd: 1_400_000, latestExpensesUsd: 1_200_000, latestAssetsUsd: 2_800_000, latestFilingYear: 2024, filingCount: 3, trend: "growing",
    revenueSeries: THREE_YEAR_GROWTH.map((f) => ({ year: f.tax_prd_yr, revenue: f.totrevenue, expenses: f.totfuncexpns })),
    pdfUrl: "https://p/x.pdf", sourceUrl: "https://projects.propublica.org/nonprofits/organizations/111111111", status: "ok", statusNote: "", updatedAt: NOW, ...over,
  });

  it("saves a new profile, updates it in place on the next save, and round-trips every field", async () => {
    const { client, db } = createFakeSupabase();
    expect(await saveFundingProfile(client, USER, okProfile())).toBeNull();
    expect(await saveFundingProfile(client, USER, okProfile({ latestRevenueUsd: 1_500_000, updatedAt: "2026-10-08T00:00:00.000Z" }))).toBeNull();
    expect(db.employer_990_profiles).toHaveLength(1);
    const { profiles, error } = await loadFundingProfiles(client, USER);
    expect(error).toBeNull();
    expect(profiles.get("granite community trust")).toMatchObject({ ein: 111111111, latestRevenueUsd: 1_500_000, latestFilingYear: 2024, status: "ok", trend: "growing" });
    expect(profiles.get("granite community trust")?.revenueSeries.map((p) => p.year)).toEqual([2024, 2023, 2022]);
  });

  it("scopes profiles to the user", async () => {
    const { client } = createFakeSupabase();
    await saveFundingProfile(client, USER, okProfile());
    expect((await loadFundingProfiles(client, "someone-else")).profiles.size).toBe(0);
  });

  it("degrades to an empty map plus an error message when the table is missing, never throwing", async () => {
    const broken = {
      from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: null, error: { message: "Could not find the table 'public.employer_990_profiles' in the schema cache" } }) }) }) }),
    } as never;
    const result = await loadFundingProfiles(broken, USER);
    expect(result.profiles.size).toBe(0);
    expect(result.error).toMatch(/employer_990_profiles/);
  });

  it("refresh reuses a stored EIN (no name search) and keeps an 'entered by you' note", async () => {
    const { client } = createFakeSupabase();
    const existing = okProfile({ statusNote: "EIN entered by you." });
    const fetchImpl = propublica({ details: { 111111111: detailPayload(111111111, "Granite Community Trust", THREE_YEAR_GROWTH) } });
    const outcome = await refreshFundingProfile(client, USER, { name: "Granite Community Trust", location: "Lebanon, NH" }, existing, { fetchImpl, sleep: noSleep, now: () => NOW });
    expect(outcome).toMatchObject({ saved: true, error: null });
    expect(outcome.profile.statusNote).toBe("EIN entered by you.");
    expect(fetchImpl.urls.every((url) => !url.includes("/search.json"))).toBe(true);
  });

  it("a candidate or user-entered EIN wins over a stored one", async () => {
    const { client } = createFakeSupabase();
    const fetchImpl = propublica({ details: { 555555555: detailPayload(555555555, "Other Org", THREE_YEAR_GROWTH) } });
    const outcome = await refreshFundingProfile(client, USER, { name: "Granite Community Trust", location: "Lebanon, NH", ein: 555555555, einSource: "user" }, okProfile(), { fetchImpl, sleep: noSleep, now: () => NOW });
    expect(outcome.profile).toMatchObject({ ein: 555555555, organizationName: "Other Org", statusNote: "EIN entered by you." });
  });

  it("a transient failure never overwrites good saved data", async () => {
    const { client, db } = createFakeSupabase();
    await saveFundingProfile(client, USER, okProfile());
    const outcome = await refreshFundingProfile(client, USER, { name: "Granite Community Trust", location: "Lebanon, NH" }, okProfile(), { fetchImpl: propublica({ details: {} }), sleep: noSleep, now: () => NOW });
    expect(outcome.saved).toBe(false);
    expect(outcome.profile.status).toBe("ok");
    expect(outcome.error).toMatch(/last saved/);
    expect(db.employer_990_profiles[0]).toMatchObject({ status: "ok", latest_revenue_usd: 1_400_000 });
  });

  it("a name lookup that finds nothing is saved as no_match (so it is not re-asked daily)", async () => {
    const { client, db } = createFakeSupabase();
    const outcome = await refreshFundingProfile(client, USER, { name: "City of Lebanon", location: "Lebanon, NH" }, null, { fetchImpl: propublica({ search: [] }), sleep: noSleep, now: () => NOW });
    expect(outcome).toMatchObject({ saved: true });
    expect(db.employer_990_profiles[0]).toMatchObject({ status: "no_match", employer_key: "city of lebanon" });
  });
});

describe("selectEmployersForRefresh", () => {
  const emp = (id: string, name: string) => ({ id, name, location: "Lebanon, NH", region: null });
  const profile = (name: string, status: FundingProfile["status"], updatedAt: string): FundingProfile => ({
    employerKey: name.toLowerCase(), employerName: name, ein: null, organizationName: "", nteeCode: "", latestRevenueUsd: null, latestExpensesUsd: null, latestAssetsUsd: null,
    latestFilingYear: null, filingCount: 0, trend: "unknown", revenueSeries: [], pdfUrl: "", sourceUrl: "", status, statusNote: "", updatedAt,
  });

  it("orders never-looked-up, then failed, then stale (oldest first), and skips fresh and recent no-match", () => {
    const employers = [emp("1", "Fresh Org"), emp("2", "Never Org"), emp("3", "Failed Org"), emp("4", "Stale Old Org"), emp("5", "Stale Newer Org"), emp("6", "Recent NoMatch Org")];
    const profiles = new Map([
      ["fresh org", profile("fresh org", "ok", "2026-10-01T00:00:00.000Z")],
      ["failed org", profile("failed org", "lookup_failed", "2026-10-06T00:00:00.000Z")],
      ["stale old org", profile("stale old org", "ok", "2026-08-01T00:00:00.000Z")],
      ["stale newer org", profile("stale newer org", "ok", "2026-09-01T00:00:00.000Z")],
      ["recent nomatch org", profile("recent nomatch org", "no_match", "2026-10-05T00:00:00.000Z")],
    ]);
    const { selected, remaining, skippedFresh } = selectEmployersForRefresh(employers, profiles, NOW, 10);
    expect(selected.map((e) => e.id)).toEqual(["2", "3", "4", "5"]);
    expect(skippedFresh).toBe(2);
    expect(remaining).toBe(0);
  });

  it("caps one click and reports how many are waiting", () => {
    const employers = Array.from({ length: BULK_REFRESH_CAP + 3 }, (_, i) => emp(String(i), `Org ${i}`));
    const { selected, remaining } = selectEmployersForRefresh(employers, new Map(), NOW);
    expect(selected).toHaveLength(BULK_REFRESH_CAP);
    expect(remaining).toBe(3);
  });
});

describe("weekly funding entries and diff", () => {
  const profileFor = (name: string, series: Array<[number, number]>, over: Partial<FundingProfile> = {}): FundingProfile => {
    const points = series.map(([year, revenue]) => ({ year, revenue, expenses: null }));
    return {
      employerKey: name.toLowerCase(), employerName: name, ein: 1, organizationName: name, nteeCode: "", latestRevenueUsd: points[0].revenue, latestExpensesUsd: null, latestAssetsUsd: null,
      latestFilingYear: points[0].year, filingCount: points.length, trend: computeRevenueTrend(points).trend, revenueSeries: points, pdfUrl: "", sourceUrl: "", status: "ok", statusNote: "", updatedAt: NOW, ...over,
    };
  };

  it("builds entries only for watched employers with real filing numbers", () => {
    const profiles = new Map([
      ["granite community trust", profileFor("Granite Community Trust", [[2024, 820_000], [2023, 1_000_000], [2022, 1_150_000]])],
      ["valley arts council", profileFor("Valley Arts Council", [[2024, 1_000_000]], { status: "no_match", latestRevenueUsd: null })],
      ["not watched org", profileFor("Not Watched Org", [[2024, 1_000_000], [2023, 900_000]])],
    ]);
    const entries = fundingEntriesFor(["Granite Community Trust", "Valley Arts Council", "Granite Community Trust"], profiles);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ key: "granite community trust", trend: "shrinking", filingYear: 2024 });
  });

  it("names a shrinking employer as a standing concern every week, even with no previous snapshot", () => {
    const current = fundingEntriesFor(["Granite Community Trust"], new Map([["granite community trust", profileFor("Granite Community Trust", [[2024, 820_000], [2023, 1_000_000], [2022, 1_150_000]])]]));
    const { changes, concerns } = diffFundingEntries(current, null);
    expect(changes).toEqual([]);
    expect(concerns).toHaveLength(1);
    expect(concerns[0]).toMatch(/Granite Community Trust: IRS 990 \(FY 2024\).*down 29%.*Confirm funding before investing time/);
  });

  it("reports a trend move and a new filing only against a snapshot that already had funding data", () => {
    const now = fundingEntriesFor(["Granite Community Trust", "Valley Arts Council"], new Map([
      ["granite community trust", profileFor("Granite Community Trust", [[2024, 820_000], [2023, 1_000_000], [2022, 1_150_000]])],
      ["valley arts council", profileFor("Valley Arts Council", [[2024, 1_020_000], [2023, 1_000_000], [2022, 990_000]])],
    ]));
    const before = [
      { key: "granite community trust", name: "Granite Community Trust", trend: "stable" as const, filingYear: 2023, revenueUsd: 1_000_000, line: "x" },
      { key: "valley arts council", name: "Valley Arts Council", trend: "stable" as const, filingYear: 2023, revenueUsd: 1_000_000, line: "x" },
    ];
    const { changes } = diffFundingEntries(now, before);
    expect(changes).toHaveLength(2);
    expect(changes[0]).toMatch(/Granite Community Trust's revenue trend moved from steady to shrinking/);
    expect(changes[1]).toMatch(/A new IRS 990 is on file for Valley Arts Council/);
    expect(diffFundingEntries(now, null).changes).toEqual([]); // first enriched week is a baseline, not news
  });

  it("round-trips through snapshot evidence and tolerates old snapshots", () => {
    const entries = [{ key: "a", name: "A", trend: "growing" as const, filingYear: 2024, revenueUsd: 5, line: "l" }];
    expect(parseFundingEntries([{ type: "funding_profiles", entries }])).toEqual(entries);
    expect(parseFundingEntries([{ type: "strategic_state" }])).toBeNull();
    expect(parseFundingEntries(undefined)).toBeNull();
    expect(parseFundingEntries([{ type: "funding_profiles", entries: [{ nope: 1 }, { key: "b", name: "B", trend: "weird" }] }])?.[0]).toMatchObject({ key: "b", trend: "unknown" });
  });
});

describe("upsertCandidateRow (EIN persistence that cannot lose a candidate)", () => {
  const row = { user_id: USER, name: "Granite Community Trust", region: "Lebanon, NH" };

  function stubClient(failEin: boolean) {
    const calls: Array<Record<string, unknown>> = [];
    const client = {
      from: () => ({
        upsert: async (payload: Record<string, unknown>) => {
          calls.push(payload);
          return "ein" in payload && failEin ? { error: { message: "Could not find the 'ein' column of 'employer_candidates' in the schema cache" } } : { error: null };
        },
      }),
    } as never;
    return { client, calls };
  }

  it("writes the EIN when the column exists, and never touches it for web candidates", async () => {
    const { client, calls } = stubClient(false);
    expect((await upsertCandidateRow(client, row, 123456789)).error).toBeNull();
    expect(calls[0]).toMatchObject({ ein: 123456789 });
    await upsertCandidateRow(client, row);
    expect("ein" in calls[1]).toBe(false);
  });

  it("retries without the EIN when its migration is not applied, so the candidate is still saved", async () => {
    const { client, calls } = stubClient(true);
    expect((await upsertCandidateRow(client, row, 123456789)).error).toBeNull();
    expect(calls).toHaveLength(2);
    expect("ein" in calls[1]).toBe(false);
  });

  it("does not hide an unrelated error", async () => {
    const client = { from: () => ({ upsert: async () => ({ error: { message: "permission denied for table employer_candidates" } }) }) } as never;
    expect((await upsertCandidateRow(client, row, 123456789)).error?.message).toMatch(/permission denied/);
  });
});

void vi;
