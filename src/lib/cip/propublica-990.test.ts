import { describe, expect, it, vi } from "vitest";
import type { GeocodedSearchArea } from "@/lib/cip/geography-engine";
import { partitionAgainstExisting, tagCandidateLanes, type LaneLike } from "@/lib/cip/discovery-targeting";
import {
  NTEE_CATEGORIES,
  NINE_NINETY_MAX_CANDIDATES,
  NINE_NINETY_MIN_REVENUE_USD,
  adoptKnownParents,
  budgetSizeLabel,
  dropNineNinetyDuplicates,
  enrichNineNinetyParents,
  fetchNineNinetyOrgDetail,
  filterOrgsToSearchArea,
  formatRevenueUsd,
  isEmployableNineNinetyOrg,
  nteeCategoriesForLanes,
  orgToCandidate,
  runNineNinetyDiscovery,
  searchNineNinetyOrgs,
  sizeFromRevenue,
  type NineNinetyOrgRow,
} from "@/lib/cip/propublica-990";
import type { BusinessSearchCandidate } from "@/lib/cip/business-search-engine";

// All external I/O is injected: no test here touches the network.

const ED_LANE: LaneLike = { lane: "Executive Director / Nonprofit Media Leader", label: "Primary lane" };
const EDUCATOR_LANE: LaneLike = { lane: "Workforce Development Educator", label: "Strong alternate" };

const area: GeocodedSearchArea = {
  query: "White River Junction, VT",
  displayName: "White River Junction, Vermont, USA",
  latitude: 43.648,
  longitude: -72.319,
  radiusMiles: 25,
  city: "White River Junction",
  county: "Windsor County",
  state: "VT",
  country: "US",
  attribution: "test",
  nearbyLookup: "ok",
  searchQueries: [],
  nearbyPlaces: [
    { name: "Norwich", placeType: "town", state: "VT", latitude: 43.72, longitude: -72.31, distanceMiles: 5.1 },
    { name: "Lebanon", placeType: "city", state: "NH", latitude: 43.64, longitude: -72.25, distanceMiles: 3.6 },
    { name: "Chelsea", placeType: "town", state: "", latitude: 43.99, longitude: -72.48, distanceMiles: 24.1 }, // state unverified
  ],
};

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

function orgRow(overrides: Partial<NineNinetyOrgRow> = {}): Record<string, unknown> {
  return {
    ein: 111111111,
    strein: "11-1111111",
    name: "Upper Valley Haven",
    sub_name: null,
    city: "White River Junction",
    state: "VT",
    ntee_code: "P30",
    subseccd: 3,
    ...overrides,
  };
}

function searchPage(orgs: Array<Record<string, unknown>>) {
  return { organizations: orgs, total_results: orgs.length, num_pages: 1, cur_page: 0, per_page: 25, api_version: 2 };
}

function filingPayload(year: number, revenue: number, ein: number) {
  return {
    ein,
    tax_prd_yr: year,
    tax_prd: year * 10000 + 6,
    formtype: 0,
    pdf_url: `https://projects.propublica.org/example/filing-${year}.pdf`,
    totrevenue: revenue,
    totfuncexpns: Math.round(revenue * 0.9),
    totassetsend: revenue * 2,
    totliabend: 0,
    totnetassetend: revenue * 2,
  };
}

function detailPayload(ein: number, name: string, filings: Array<ReturnType<typeof filingPayload>>, revenueAmount = 1_500_000) {
  return {
    organization: {
      ein,
      id: ein,
      name,
      city: "White River Junction",
      state: "VT",
      zipcode: "05001",
      ntee_code: "P30",
      subsection_code: 3,
      revenue_amount: revenueAmount,
      asset_amount: 900_000,
    },
    filings_with_data: filings,
    filings_without_data: [],
    data_source: "test",
    api_version: "2",
  };
}

const noSleep = () => Promise.resolve();

describe("nteeCategoriesForLanes", () => {
  it("gives nonprofit-exec lanes the broad five categories", () => {
    const categories = nteeCategoriesForLanes([ED_LANE]);
    expect(categories.map((category) => category.id).sort()).toEqual(["1", "2", "4", "5", "7"]);
  });

  it("narrows to Education for an education-family lane", () => {
    const categories = nteeCategoriesForLanes([EDUCATOR_LANE]);
    expect(categories.map((category) => category.id)).toEqual(["2"]);
  });

  it("falls back to the broad five for tech-only or missing lanes (disclosed, never silent)", () => {
    expect(nteeCategoriesForLanes([{ lane: "Director of Media Innovation / CTO", label: "Research" }]).map((c) => c.id)).toHaveLength(5);
    expect(nteeCategoriesForLanes([]).map((c) => c.id)).toHaveLength(5);
    expect(nteeCategoriesForLanes([{ lane: "x", label: "Conversation research lane" }]).map((c) => c.id)).toHaveLength(5);
  });
});

describe("NTEE category vocabulary ↔ lane tagging", () => {
  it("every NTEE category phrase tags a nonprofit-exec lane (distinctive-token overlap)", () => {
    for (const category of NTEE_CATEGORIES) {
      const tags = tagCandidateLanes({ name: "Some Local Charity", category: category.category }, [ED_LANE]);
      expect(tags.map((tag) => tag.label), category.category).toContain("Primary lane");
    }
  });

  it("the Education category tags an education lane", () => {
    const tags = tagCandidateLanes({ name: "Helping Hands Learning Center", category: "Education nonprofits" }, [EDUCATOR_LANE]);
    expect(tags.map((tag) => tag.label)).toContain("Strong alternate");
  });
});

describe("searchNineNinetyOrgs", () => {
  it("requests the state + NTEE + c_code filters politely across pages and dedupes by EIN", async () => {
    const fetchImpl = fetcherFor((url) => {
      if (url.includes("page=0")) return jsonResponse(searchPage([orgRow({ ein: 1 }), orgRow({ ein: 2, name: "Second Charity" })]));
      if (url.includes("page=1")) return jsonResponse(searchPage([orgRow({ ein: 1 })])); // duplicate row
      return null;
    });
    const sleep = vi.fn(noSleep);
    const { orgs, failed } = await searchNineNinetyOrgs("VT", "2", { fetchImpl, sleep });
    expect(failed).toBe(false);
    expect(orgs.map((org) => org.name)).toEqual(["Upper Valley Haven", "Second Charity"]);
    expect(fetchImpl.urls[0]).toContain("state[id]=VT");
    expect(fetchImpl.urls[0]).toContain("ntee[id]=2");
    expect(fetchImpl.urls[0]).toContain("c_code[id]=3");
    expect(fetchImpl.urls[0]).toContain("page=0");
    expect(fetchImpl.urls[1]).toContain("page=1");
    expect(sleep).toHaveBeenCalledWith(600); // pause between pages, never before the first
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("reports a failed category after one retry and returns nothing (no invented orgs)", async () => {
    const fetchImpl = fetcherFor(() => jsonResponse({ error: "boom" }, 500));
    const sleep = vi.fn(noSleep);
    const { orgs, failed } = await searchNineNinetyOrgs("VT", "2", { fetchImpl, sleep });
    expect(failed).toBe(true);
    expect(orgs).toHaveLength(0);
    expect(fetchImpl.urls).toHaveLength(2); // one polite retry
    expect(sleep).toHaveBeenCalledWith(1500);
  });
});

describe("isEmployableNineNinetyOrg", () => {
  const row = (overrides: Partial<NineNinetyOrgRow>): NineNinetyOrgRow => ({
    ein: 1,
    strein: "00-0000001",
    name: "Org",
    subName: "",
    city: "White River Junction",
    state: "VT",
    nteeCode: "P30",
    subseccd: 3,
    ...overrides,
  });

  it("keeps 501(c)(3) rows and drops other subsections and group returns", () => {
    expect(isEmployableNineNinetyOrg(row({}))).toBe(true);
    expect(isEmployableNineNinetyOrg(row({ subseccd: 4 }))).toBe(false);
    expect(isEmployableNineNinetyOrg(row({ subName: "Vermont Group Return" }))).toBe(false);
    // Absent subsection stays kept: the server-side c_code filter is authoritative.
    expect(isEmployableNineNinetyOrg(row({ subseccd: null }))).toBe(true);
  });
});

describe("budget sizing", () => {
  it("buckets by revenue at the $1M / $10M lines", () => {
    expect(NINE_NINETY_MIN_REVENUE_USD).toBe(250_000);
    expect(sizeFromRevenue(300_000)).toBe("small");
    expect(sizeFromRevenue(1_000_000)).toBe("medium");
    expect(sizeFromRevenue(10_000_000)).toBe("medium");
    expect(sizeFromRevenue(10_000_001)).toBe("large");
  });

  it("formats revenue compactly", () => {
    expect(formatRevenueUsd(250_000)).toBe("$250k");
    expect(formatRevenueUsd(980_000)).toBe("$980k");
    expect(formatRevenueUsd(1_400_000)).toBe("$1.4M");
    expect(formatRevenueUsd(10_500_000)).toBe("$10.5M");
    expect(formatRevenueUsd(1_980_420_213)).toBe("$2B"); // a hospital system, not "$1980.4M"
    expect(formatRevenueUsd(1_300_000_000)).toBe("$1.3B");
    expect(formatRevenueUsd(25_000_000)).toBe("$25M");
  });

  it("labels the candidate size line with budget and filing year, never headcount", () => {
    expect(budgetSizeLabel(1_400_000, 2024)).toBe("medium nonprofit - $1.4M annual revenue (FY 2024)");
    expect(budgetSizeLabel(undefined, undefined)).toBe("Nonprofit (revenue unknown)");
  });
});

describe("filterOrgsToSearchArea", () => {
  const rows = (overrides: Partial<NineNinetyOrgRow>[]) =>
    overrides.map((o) => orgRow(o) as unknown as NineNinetyOrgRow);

  it("city-matches the center and verified nearby places without geocoding", async () => {
    const geocoder = vi.fn();
    const outcome = await filterOrgsToSearchArea(
      rows([{ city: "White River Junction" }, { city: "Norwich", name: "Norwich Charity" }]),
      area,
      geocoder,
    );
    expect(outcome.kept.map((entry) => entry.org.name)).toEqual(["Upper Valley Haven", "Norwich Charity"]);
    expect(outcome.kept.map((entry) => entry.basis)).toEqual(["city", "city"]);
    expect(outcome.kept[0].distanceMiles).toBe(0);
    expect(outcome.kept[1].distanceMiles).toBe(5.1);
    expect(geocoder).not.toHaveBeenCalled();
  });

  it("never matches a place whose state is unverified or different", async () => {
    const geocoder = vi.fn(async () => ({ latitude: 43.7, longitude: -72.3 })); // in radius
    const outcome = await filterOrgsToSearchArea(
      rows([
        { city: "Chelsea", name: "Chelsea Charity" }, // place exists but state unverified -> geocode
        { city: "Lebanon", name: "Lebanon VT Charity" }, // place exists but is in NH -> geocode
      ]),
      area,
      geocoder,
    );
    // Both resolved by geocoding (the string match alone would have been a wrong-state guess).
    expect(outcome.kept.map((entry) => entry.org.name).sort()).toEqual(["Chelsea Charity", "Lebanon VT Charity"]);
    expect(outcome.kept.every((entry) => entry.basis === "geocode")).toBe(true);
    expect(geocoder).toHaveBeenCalledTimes(2);
  });

  it("drops orgs the geocoder places outside the radius or cannot locate, honestly counted", async () => {
    const geocoder = vi.fn(async (query: string) =>
      query.startsWith("Burlington") ? { latitude: 44.475, longitude: -73.21 } : null,
    );
    const outcome = await filterOrgsToSearchArea(
      rows([
        { city: "Burlington", name: "Burlington Charity" }, // ~60 mi away -> outside
        { city: "Nowhere", name: "Nowhere Charity" }, // unlocatable
      ]),
      area,
      geocoder,
    );
    expect(outcome.kept).toHaveLength(0);
    expect(outcome.skippedOutsideArea).toBe(1);
    expect(outcome.skippedUnknownCity).toBe(1);
  });

  it("bounds how many cities it will geocode per run", async () => {
    const geocoder = vi.fn(async () => ({ latitude: 43.7, longitude: -72.3 }));
    const outcome = await filterOrgsToSearchArea(
      rows([
        { city: "Alpha Town", name: "Alpha" },
        { city: "Beta Town", name: "Beta" },
      ]),
      area,
      geocoder,
      1,
    );
    expect(geocoder).toHaveBeenCalledTimes(1);
    expect(outcome.kept).toHaveLength(1);
    expect(outcome.skippedUnknownCity).toBe(1);
  });
});

describe("fetchNineNinetyOrgDetail", () => {
  it("reads the LATEST filing's financials regardless of order, with pdf provenance", async () => {
    const fetchImpl = fetcherFor(() =>
      jsonResponse(detailPayload(1, "Upper Valley Haven", [filingPayload(2022, 900_000, 1), filingPayload(2024, 1_400_000, 1)])),
    );
    const financials = await fetchNineNinetyOrgDetail(1, { fetchImpl, sleep: noSleep });
    expect(financials?.revenue).toBe(1_400_000);
    expect(financials?.filingYear).toBe(2024);
    expect(financials?.pdfUrl).toContain("filing-2024.pdf");
  });

  it("falls back to the BMF summary on the organization object when no data filings exist", async () => {
    const fetchImpl = fetcherFor(() => jsonResponse(detailPayload(1, "Tiny Filer", [], 640_000)));
    const financials = await fetchNineNinetyOrgDetail(1, { fetchImpl, sleep: noSleep });
    expect(financials?.revenue).toBe(640_000);
    expect(financials?.filingYear).toBeUndefined();
  });

  it("returns null on a failed fetch", async () => {
    const fetchImpl = fetcherFor(() => jsonResponse({}, 500));
    expect(await fetchNineNinetyOrgDetail(1, { fetchImpl, sleep: noSleep })).toBeNull();
  });
});

describe("orgToCandidate", () => {
  const row: NineNinetyOrgRow = {
    ein: 30259051,
    strein: "30-259051",
    name: "Upper Valley Haven",
    subName: "",
    city: "White River Junction",
    state: "VT",
    nteeCode: "P30",
    subseccd: 3,
  };
  const humanServices = NTEE_CATEGORIES.find((category) => category.id === "5")!;
  const financials = { ein: 30259051, name: "Upper Valley Haven", revenue: 1_400_000, expenses: 1_200_000, assets: 2_800_000, filingYear: 2024, pdfUrl: "https://example/f.pdf", series: [] };

  it("maps a filing to a candidate with full provenance and no invented fields", () => {
    const candidate = orgToCandidate(row, financials, humanServices, area, [ED_LANE]);
    expect(candidate.discovery_channel).toBe("irs_990");
    expect(candidate.region).toBe("White River Junction, VT");
    expect(candidate.category).toBe("Human services nonprofits");
    expect(candidate.location).toBe("White River Junction, VT");
    expect(candidate.estimated_size).toBe("medium nonprofit - $1.4M annual revenue (FY 2024)");
    expect(candidate.source_url).toBe("https://projects.propublica.org/nonprofits/organizations/30259051");
    expect(candidate.careers_url).toBe(""); // a filing says nothing about a careers page
    expect(candidate.confidence).toBe("high");
    expect(candidate.parent_organization).toBe("");
    expect(candidate.discovery_source_names).toEqual(["ProPublica Nonprofit Explorer"]);
    const notes = Object.fromEntries(candidate.source_notes.map((note) => [note.label, note.value]));
    expect(notes["EIN"]).toBe("30-259051");
    expect(notes["Annual revenue"]).toBe("$1.4M (FY 2024)");
    expect(notes["NTEE"]).toBe("P30 - Human services");
    expect(candidate.relevantLanes?.map((tag) => tag.label)).toContain("Primary lane");
    expect(candidate.priority).toBe("medium");
  });

  it("de-prioritizes an org with no lane fit", () => {
    const candidate = orgToCandidate(row, financials, humanServices, area, [EDUCATOR_LANE]);
    expect(candidate.relevantLanes).toHaveLength(0);
    expect(candidate.priority).toBe("low");
  });
});

describe("runNineNinetyDiscovery", () => {
  it("produces a filing-backed candidate end to end with honest coverage counts", async () => {
    const fetchImpl = fetcherFor((url) => {
      if (url.includes("/search.json")) {
        return jsonResponse(
          searchPage([
            orgRow({ ein: 1, name: "Center City Charity", city: "White River Junction" }),
            orgRow({ ein: 2, name: "Far City Charity", city: "Burlington" }),
          ]),
        );
      }
      if (url.includes("/organizations/1.json")) return jsonResponse(detailPayload(1, "Center City Charity", [filingPayload(2024, 1_400_000, 1)]));
      return jsonResponse({}, 404);
    });
    const geocoder = vi.fn(async () => ({ latitude: 44.475, longitude: -73.21 })); // Burlington -> outside

    const result = await runNineNinetyDiscovery({ searchArea: area, lanes: [EDUCATOR_LANE], fetchImpl, sleep: noSleep, geocoder });
    expect(result).not.toBeNull();
    // Educator lane narrows to Education only: exactly one category searched.
    expect(result!.coverage.categoriesSearched).toEqual(["Education"]);
    expect(result!.coverage.orgsScanned).toBe(2);
    expect(result!.coverage.inArea).toBe(1);
    expect(result!.coverage.detailsFetched).toBe(1);
    expect(result!.coverage.passedFloor).toBe(1);
    expect(result!.coverage.kept).toBe(1);
    expect(result!.coverage.skippedOutsideArea).toBe(1);
    expect(result!.candidates).toHaveLength(1);
    expect(result!.candidates[0].name).toBe("Center City Charity");
    expect(result!.summary).toContain("VT");
    expect(result!.summary).toContain("$250k floor");
    expect(result!.sourcePage.source_type).toBe("government_data");
  });

  it("reports a failed category instead of inventing organizations", async () => {
    const fetchImpl = fetcherFor((url) => (url.includes("/search.json") ? jsonResponse({}, 500) : null));
    const result = await runNineNinetyDiscovery({ searchArea: area, lanes: [EDUCATOR_LANE], fetchImpl, sleep: noSleep });
    expect(result!.coverage.categoryErrors).toHaveLength(1);
    expect(result!.coverage.categoryErrors[0]).toContain("Education");
    expect(result!.candidates).toHaveLength(0);
    expect(result!.summary).toContain("unavailable");
  });

  it("applies the budget floor and drops orgs without usable financials", async () => {
    const fetchImpl = fetcherFor((url) => {
      if (url.includes("/search.json")) {
        return jsonResponse(
          searchPage([
            orgRow({ ein: 1, name: "Tiny Charity", city: "White River Junction" }),
            orgRow({ ein: 2, name: "No Filing Charity", city: "White River Junction" }),
            orgRow({ ein: 3, name: "Solid Charity", city: "White River Junction" }),
          ]),
        );
      }
      if (url.includes("/organizations/1.json")) return jsonResponse(detailPayload(1, "Tiny Charity", [filingPayload(2024, 100_000, 1)]));
      if (url.includes("/organizations/2.json")) return jsonResponse({}, 404);
      if (url.includes("/organizations/3.json")) return jsonResponse(detailPayload(3, "Solid Charity", [filingPayload(2024, 1_400_000, 3)]));
      return null;
    });
    const result = await runNineNinetyDiscovery({ searchArea: area, lanes: [EDUCATOR_LANE], fetchImpl, sleep: noSleep });
    expect(result!.coverage.skippedBelowFloor).toBe(1);
    expect(result!.coverage.skippedNoFinancials).toBe(1);
    expect(result!.candidates.map((candidate) => candidate.name)).toEqual(["Solid Charity"]);
  });

  it("caps the kept list at twelve ranked candidates", async () => {
    const orgs = Array.from({ length: 15 }, (_, index) => orgRow({ ein: index + 1, name: `Charity Number ${index + 1}` }));
    const fetchImpl = fetcherFor((url) => {
      if (url.includes("/search.json")) return jsonResponse(searchPage(orgs));
      const ein = Number(/\/organizations\/(\d+)\.json/.exec(url)?.[1] ?? 0);
      return jsonResponse(detailPayload(ein, `Charity Number ${ein}`, [filingPayload(2024, 1_000_000, ein)]));
    });
    const result = await runNineNinetyDiscovery({ searchArea: area, lanes: [EDUCATOR_LANE], fetchImpl, sleep: noSleep });
    expect(result!.coverage.inArea).toBe(15);
    expect(result!.coverage.kept).toBe(NINE_NINETY_MAX_CANDIDATES);
    expect(result!.candidates).toHaveLength(NINE_NINETY_MAX_CANDIDATES);
  });

  it("returns null for a non-US / unknown-state area instead of guessing", async () => {
    const result = await runNineNinetyDiscovery({
      searchArea: { ...area, state: "Ontario", country: "CA" },
      lanes: [EDUCATOR_LANE],
      fetchImpl: fetcherFor(() => jsonResponse({})),
      sleep: noSleep,
    });
    expect(result).toBeNull();
  });
});

describe("parent organizations (the dedupe mechanism)", () => {
  function nineNinetyCandidateFor(ein: number, name: string, parent = ""): BusinessSearchCandidate {
    return {
      name,
      ein,
      region: "White River Junction, VT",
      category: "Community healthcare nonprofits",
      location: "Lebanon, NH",
      estimated_size: "large nonprofit - $800M annual revenue (FY 2024)",
      priority: "medium",
      target_roles: [],
      source_url: `https://projects.propublica.org/nonprofits/organizations/${ein}`,
      careers_url: "",
      adapter_status: "manual_review",
      confidence: "high",
      source_notes: [],
      discovery_channel: "irs_990",
      discovery_source_names: ["ProPublica Nonprofit Explorer"],
      parent_organization: parent,
    } as BusinessSearchCandidate;
  }

  describe("adoptKnownParents (stored knowledge, deterministic)", () => {
    it("fills only EMPTY parents, from member rows earlier runs saved", () => {
      const candidates = [
        { name: "Mary Hitchcock Memorial Hospital", parent_organization: "" },
        { name: "MHMH", parent_organization: "" }, // acronym of the saved member
        { name: "Unrelated Fresh Org", parent_organization: "" },
        { name: "Already Linked Org", parent_organization: "Existing Parent" },
      ];
      const adopted = adoptKnownParents(candidates, [{ name: "Mary Hitchcock Memorial Hospital", parent: "Dartmouth Health" }]);
      expect(adopted).toBe(2);
      expect(candidates[0].parent_organization).toBe("Dartmouth Health");
      expect(candidates[1].parent_organization).toBe("Dartmouth Health");
      expect(candidates[2].parent_organization).toBe(""); // no matching saved member
      expect(candidates[3].parent_organization).toBe("Existing Parent"); // never overwritten
    });

    it("is a no-op with no stored members", () => {
      const candidates = [{ name: "Any Org", parent_organization: "" }];
      expect(adoptKnownParents(candidates, [])).toBe(0);
      expect(candidates[0].parent_organization).toBe("");
    });
  });

  describe("enrichNineNinetyParents (model pass, with deterministic fallback)", () => {
    const parentsResponse = (organizations: Array<{ ein: number; parent_organization: string }>) =>
      jsonResponse({ output_text: JSON.stringify({ organizations }) });

    it("applies EIN-keyed parents and never overwrites an existing parent", async () => {
      const fetchImpl = fetcherFor(() =>
        parentsResponse([
          { ein: 101, parent_organization: "Dartmouth Health" },
          { ein: 999, parent_organization: "Rogue Row" }, // not one of ours — ignored
        ]),
      );
      const candidates = [
        nineNinetyCandidateFor(101, "Mary Hitchcock Memorial Hospital"),
        nineNinetyCandidateFor(202, "Independence Valley Arts"),
        nineNinetyCandidateFor(303, "Already Linked", "Existing Parent"),
      ];
      const enrichment = await enrichNineNinetyParents(candidates, ["Dartmouth Health"], { apiKey: "test-key", fetchImpl });
      expect(enrichment).toEqual({ applied: 1, status: "applied" });
      expect(candidates[0].parent_organization).toBe("Dartmouth Health");
      expect(candidates[1].parent_organization).toBe(""); // model had nothing for it — stays empty, never invented
      expect(candidates[2].parent_organization).toBe("Existing Parent");
    });

    it("returns not_configured without fetching when no key is available", async () => {
      const fetchImpl = fetcherFor(() => parentsResponse([{ ein: 101, parent_organization: "X" }]));
      const candidates = [nineNinetyCandidateFor(101, "Mary Hitchcock Memorial Hospital")];
      const enrichment = await enrichNineNinetyParents(candidates, [], { apiKey: "", fetchImpl });
      expect(enrichment).toEqual({ applied: 0, status: "not_configured" });
      expect(fetchImpl.urls).toHaveLength(0);
      expect(candidates[0].parent_organization).toBe("");
    });

    it("returns unavailable with nothing changed when the provider call fails", async () => {
      const fetchImpl = fetcherFor(() => jsonResponse({}, 500));
      const candidates = [nineNinetyCandidateFor(101, "Mary Hitchcock Memorial Hospital")];
      const enrichment = await enrichNineNinetyParents(candidates, [], { apiKey: "test-key", fetchImpl });
      expect(enrichment).toEqual({ applied: 0, status: "unavailable" });
      expect(candidates[0].parent_organization).toBe("");
    });
  });

  it("the founder's live case: enriched parents make 990 members dedupe against a tracked parent (integration)", async () => {
    const candidates = [
      nineNinetyCandidateFor(101, "Mary Hitchcock Memorial Hospital"),
      nineNinetyCandidateFor(102, "Dartmouth-Hitchcock Medical Center"),
      nineNinetyCandidateFor(103, "Independence Valley Arts"),
    ];
    const fetchImpl = fetcherFor(() =>
      jsonResponse({
        output_text: JSON.stringify({
          organizations: [
            { ein: 101, parent_organization: "Dartmouth Health" },
            { ein: 102, parent_organization: "Dartmouth Health" },
            { ein: 103, parent_organization: "" },
          ],
        }),
      }),
    );
    await enrichNineNinetyParents(candidates, ["Dartmouth Health"], { apiKey: "test-key", fetchImpl });

    const { fresh, alreadyTracked } = partitionAgainstExisting(candidates, ["Dartmouth Health"]);
    expect(alreadyTracked.map((entry) => entry.candidate.name).sort()).toEqual([
      "Dartmouth-Hitchcock Medical Center",
      "Mary Hitchcock Memorial Hospital",
    ]);
    expect(alreadyTracked.every((entry) => entry.trackedAs === "Dartmouth Health")).toBe(true);
    expect(fresh.map((candidate) => candidate.name)).toEqual(["Independence Valley Arts"]);
  });
});

describe("dropNineNinetyDuplicates", () => {
  const nineNinetyCandidate = (name: string): BusinessSearchCandidate =>
    ({ name, region: "r", category: "c", location: "l", estimated_size: "s", priority: "low", target_roles: [], source_url: "u", careers_url: "", adapter_status: "manual_review", confidence: "high", source_notes: [], discovery_channel: "irs_990", discovery_source_names: [] }) as BusinessSearchCandidate;
  const webCandidate = (name: string): BusinessSearchCandidate =>
    ({ ...nineNinetyCandidate(name), discovery_channel: "live_web_search", source_url: "https://employer.example" }) as BusinessSearchCandidate;

  it("keeps the web candidate when both sources find the same employer, even under a different name", () => {
    const { kept, duplicates } = dropNineNinetyDuplicates(
      [nineNinetyCandidate("Dartmouth Health"), nineNinetyCandidate("Dartmouth-Hitchcock Medical Center"), nineNinetyCandidate("Brand New Charity")],
      [webCandidate("Dartmouth Health"), webCandidate("DHMC")],
    );
    expect(kept.map((candidate) => candidate.name)).toEqual(["Brand New Charity"]);
    expect(duplicates).toHaveLength(2);
    expect(duplicates.map((entry) => entry.duplicateOf).sort((a, b) => a.localeCompare(b))).toEqual(["Dartmouth Health", "DHMC"]);
  });
});

describe("ProPublica's zero-result search is HTTP 404 with a JSON body (found live)", () => {
  const emptyBody = { total_results: 0, organizations: [], num_pages: 0, cur_page: 0, per_page: 25 };

  it("treats it as an empty result, not a failed search", async () => {
    const fetchImpl = fetcherFor(() => jsonResponse(emptyBody, 404));
    const outcome = await searchNineNinetyOrgs("NH", "5", { fetchImpl, sleep: noSleep });
    expect(outcome).toEqual({ orgs: [], failed: false });
  });

  it("still treats a 404 without a search-shaped body, and a 404 on the detail endpoint, as a miss", async () => {
    expect((await searchNineNinetyOrgs("NH", "5", { fetchImpl: fetcherFor(() => jsonResponse({}, 404)), sleep: noSleep })).failed).toBe(true);
    expect((await searchNineNinetyOrgs("NH", "5", { fetchImpl: fetcherFor(() => new Response("<html>not found</html>", { status: 404 })), sleep: noSleep })).failed).toBe(true);
    expect(await fetchNineNinetyOrgDetail(999999999, { fetchImpl: fetcherFor(() => jsonResponse({ error: "not found" }, 404)), sleep: noSleep })).toBeNull();
  });
});
