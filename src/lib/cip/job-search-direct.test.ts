import { describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "@/lib/cip/__fixtures__/fake-supabase";
import {
  detectListSource,
  icimsListUrl,
  parseIcimsListing,
  readIcimsListings,
  robotsAllows,
} from "@/lib/cip/ats-reader";
import { DEFAULT_LIMITS, loadJobSearchConfig, type JobSearchConfig } from "@/lib/cip/job-search-config";
import { buildSelectionRequest, parseSelectionPayload, type JobSearchProvider } from "@/lib/cip/job-search-engine";
import { advanceJobSearchRun, startJobSearchRun } from "@/lib/cip/job-search-run";
import type { PageFetcher } from "@/lib/cip/job-verifier";
import { assembleSearchBrief, toOutboundFacets } from "@/lib/cip/search-brief";
import { fixtureStrategicState, FIXTURE_NOW } from "@/lib/cip/__fixtures__/search-fixtures";

const HOST = "example-hosp.icims.com";
const USER = "user-1";
const NOW = "2026-09-23T12:00:00.000Z";
const now = () => NOW;

const JOBS = [
  { id: 100, title: "Program Operations Manager", code: "US-NH-Lebanon", req: "2026-100", category: "Administration" },
  { id: 101, title: "Registered Nurse (RN) - Emergency", code: "US-NH-Lebanon", req: "2026-101", category: "Nursing" },
  { id: 102, title: "Director of Communications", code: "US-VT-White River Junction", req: "2026-102", category: "Marketing" },
];

function card(job: (typeof JOBS)[number]) {
  const slug = job.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `<li class="iCIMS_JobCardItem"><div class="row"><div class="col-xs-6 header left"><span class="sr-only field-label">Job Locations</span><span > ${job.code}</span></div><div class="col-xs-6 header right"><span class="sr-only field-label">ID</span><span > ${job.req}</span></div><div class="col-xs-12 title"><a href="https://${HOST}/jobs/${job.id}/${slug}/job?in_iframe=1" class="iCIMS_Anchor" title="${job.id} - ${job.title}"><span class="sr-only field-label">Title</span><h3 > ${job.title}</h3></a></div><div class="col-xs-12 description"> Snippet for ${job.title}.</div><div class="col-xs-12 additionalFields"><dl class="iCIMS_JobHeaderGroup"><div class="iCIMS_JobHeaderTag"><dt class="iCIMS_JobHeaderField">Category</dt><dd class="iCIMS_JobHeaderData"><span > ${job.category}</span> </dd></div></dl></div></div></li>`;
}

function listPage(jobs: typeof JOBS, totalPages = 1) {
  return `<html><body><ul>${jobs.map(card).join("")}</ul><div class="iCIMS_Paging"><span class="sr-only"> of ${totalPages} , Current Page </span></div></body></html>`;
}

const ROBOTS = "User-agent: *\nDisallow: /jobs/*login\nDisallow: /jobs/login\nDisallow: /connect\n";

describe("iCIMS list parsing", () => {
  it("reads title, link, requisition ID, city/state, category, and snippet, plus the page count", () => {
    const { listings, totalPages } = parseIcimsListing(listPage(JOBS, 3), HOST);
    expect(totalPages).toBe(3);
    expect(listings).toHaveLength(3);
    expect(listings[0]).toEqual({
      title: "Program Operations Manager",
      url: `https://${HOST}/jobs/100/program-operations-manager/job`,
      requisitionId: "2026-100",
      city: "Lebanon",
      state: "NH",
      category: "Administration",
      snippet: "Snippet for Program Operations Manager.",
    });
    expect(listings[2]).toMatchObject({ city: "White River Junction", state: "VT" });
  });

  it("ignores cards without a job link and pages with no cards", () => {
    expect(parseIcimsListing("<html><body>Nothing here</body></html>", HOST).listings).toEqual([]);
  });
});

describe("list-source detection", () => {
  it("finds an iCIMS host from the URL or from a link inside a JavaScript shell page", () => {
    expect(detectListSource(`https://${HOST}/jobs/intro`, null)).toEqual({ kind: "icims", host: HOST });
    const shell = `<html><a href="https://${HOST}/jobs/login?loginOnly=1">Sign in</a></html>`;
    expect(detectListSource("https://careers.example.org/results", shell)).toEqual({ kind: "icims", host: HOST });
  });

  it("does not accept lookalike hosts or pages with no supported source", () => {
    expect(detectListSource("https://careers.example.org/results", "<a href='https://evil-icims.com/x'>")).toBeNull();
    expect(detectListSource("https://careers.example.org/results", "<a href='https://icims.com.evil.org/x'>")).toBeNull();
    expect(detectListSource("https://careers.example.org/results", "<html>plain</html>")).toBeNull();
    expect(() => icimsListUrl("evil.example.org", 0)).toThrow();
  });
});

describe("robots.txt", () => {
  it("allows the public job list and blocks the paths a site disallows", () => {
    expect(robotsAllows(ROBOTS, "/jobs/search")).toBe(true);
    expect(robotsAllows(ROBOTS, "/jobs/login")).toBe(false);
    expect(robotsAllows(ROBOTS, "/jobs/12345/candidate-login")).toBe(false);
    expect(robotsAllows("User-agent: *\nDisallow: /jobs", "/jobs/search")).toBe(false);
  });

  it("lets the longest matching rule win, and ignores groups for other agents", () => {
    expect(robotsAllows("User-agent: *\nDisallow: /jobs\nAllow: /jobs/search", "/jobs/search")).toBe(true);
    expect(robotsAllows("User-agent: SomeBot\nDisallow: /\n\nUser-agent: *\nDisallow: /private", "/jobs/search")).toBe(true);
    expect(robotsAllows("", "/jobs/search")).toBe(true);
  });
});

describe("readIcimsListings", () => {
  const fetcherFor = (pages: string[], robots = ROBOTS): PageFetcher & { urls: string[] } => {
    const urls: string[] = [];
    const fn = async (url: string) => {
      urls.push(url);
      if (url.endsWith("/robots.txt")) return { status: 200, text: robots };
      const page = Number(/pr=(\d+)/.exec(url)?.[1] ?? 0);
      return pages[page] ? { status: 200, text: pages[page] } : { status: 500, text: "" };
    };
    return Object.assign(fn, { urls });
  };
  const opts = { maxPages: 10, delayMs: 5, sleep: async () => {} };

  it("checks robots.txt first, then reads pages in order until the reported page count", async () => {
    const fetcher = fetcherFor([listPage(JOBS.slice(0, 2), 2), listPage(JOBS.slice(2), 2)]);
    const sleep = vi.fn(async () => {});
    const result = await readIcimsListings(fetcher, HOST, { ...opts, sleep });
    expect(result).toMatchObject({ ok: true, pagesRead: 2, totalPages: 2 });
    expect(result.listings.map((listing) => listing.title)).toHaveLength(3);
    expect(fetcher.urls[0]).toBe(`https://${HOST}/robots.txt`);
    expect(fetcher.urls.slice(1)).toEqual([icimsListUrl(HOST, 0), icimsListUrl(HOST, 1)]);
    expect(sleep).toHaveBeenCalledTimes(1); // a pause between page requests, none before the first
  });

  it("stops at the page cap and says it read only part of the list", async () => {
    const fetcher = fetcherFor([listPage(JOBS.slice(0, 1), 8), listPage(JOBS.slice(1, 2), 8), listPage(JOBS.slice(2), 8)]);
    const result = await readIcimsListings(fetcher, HOST, { ...opts, maxPages: 2 });
    expect(result).toMatchObject({ ok: true, pagesRead: 2, totalPages: 8 });
    expect(result.problem).toMatch(/first 2 of 8 pages/);
  });

  it("leaves a site alone when robots.txt disallows its job list", async () => {
    const fetcher = fetcherFor([listPage(JOBS)], "User-agent: *\nDisallow: /jobs/search");
    const result = await readIcimsListings(fetcher, HOST, opts);
    expect(result.ok).toBe(false);
    expect(result.problem).toMatch(/robots\.txt/);
    expect(fetcher.urls.some((url) => url.includes("/jobs/search"))).toBe(false);
  });

  it("keeps what it read when a later page fails, and reports the problem; rejects non-iCIMS hosts", async () => {
    const partial = await readIcimsListings(fetcherFor([listPage(JOBS.slice(0, 2), 3)]), HOST, opts);
    expect(partial).toMatchObject({ ok: true, pagesRead: 1 });
    expect(partial.problem).toMatch(/could not be read \(page 2/);
    expect((await readIcimsListings(fetcherFor([listPage(JOBS)]), "evil.example.org", opts)).ok).toBe(false);
  });
});

describe("choose-by-index selection", () => {
  const facets = toOutboundFacets(
    assembleSearchBrief({ strategicState: fixtureStrategicState(), preferences: { workModes: ["hybrid"], exclusions: { industries: ["Secret"] } }, now: FIXTURE_NOW }),
  );
  const listings = [{ title: "A", category: null, city: "Lebanon", state: "NH", snippet: "" }, { title: "B", category: "X", city: null, state: null, snippet: "s" }];
  const wrap = (selected: unknown[]) => ({
    usage: { input_tokens: 5_000, output_tokens: 200 },
    output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ selected }) }] }],
  });

  it("sends a no-tools request that asks for indexes only and never leaks private brief content", () => {
    const request = buildSelectionRequest("Example Hospital", listings, facets, { model: "gpt-5.4", limits: DEFAULT_LIMITS });
    const text = JSON.stringify(request);
    expect("tools" in request).toBe(false);
    expect(text).toMatch(/ONLY by their index/);
    expect(text).toMatch(/untrusted text/);
    expect(text).not.toContain("Secret");
    expect(text).toContain("0 | A |  | Lebanon, NH |");
  });

  it("drops indexes that were not in the fetched list, dedupes, and caps the count", () => {
    const parsed = parseSelectionPayload(wrap([{ index: 1, reason: "" }, { index: 1, reason: "" }, { index: 99, reason: "" }, { index: -1, reason: "" }, { index: 0, reason: "" }]), 2, 10);
    expect(parsed).toMatchObject({ ok: true, selected: [1, 0] });
    expect(parseSelectionPayload(wrap([{ index: 0, reason: "" }, { index: 1, reason: "" }]), 2, 1)).toMatchObject({ selected: [0] });
    expect(parseSelectionPayload({ output: [] }, 2)).toMatchObject({ ok: false });
  });
});

describe("fallback inside a run", () => {
  const SHELL_URL = "https://careers.example-hosp.org/results";
  const config = (): JobSearchConfig => {
    const base = loadJobSearchConfig((name) => (name === "OPENAI_API_KEY" ? "sk-test" : undefined));
    return { ...base, limits: { ...DEFAULT_LIMITS, directReadDelayMs: 0 } };
  };

  function employers() {
    return [{ user_id: USER, name: "Employer 1", region: "R", priority: "medium", fit_score: 70, fit_summary: "", target_roles: [], careers_url: null }];
  }

  function modelPayload(status: string, url: string | null = SHELL_URL) {
    return {
      usage: { input_tokens: 10_000, output_tokens: 500 },
      output: [
        { type: "web_search_call", action: { type: "open_page", url: SHELL_URL } },
        { type: "message", content: [{ type: "output_text", text: JSON.stringify({ summary: "s", employers_checked: [{ name: "Employer 1", careers_page_url: url, status, note: "" }], postings: [] }) }] },
      ],
    };
  }

  function providerFor(status: string, selection: Array<{ index: number; reason: string }> = [{ index: 0, reason: "fit" }, { index: 2, reason: "fit" }]) {
    const calls: Array<"search" | "select"> = [];
    const provider: JobSearchProvider = {
      name: "fake",
      async runStep(body) {
        if ("tools" in body) {
          calls.push("search");
          return { ok: true, payload: modelPayload(status) };
        }
        calls.push("select");
        return { ok: true, payload: { usage: { input_tokens: 7_000, output_tokens: 300 }, output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ selected: selection }) }] }] } };
      },
    };
    return { provider, calls };
  }

  function fetcherFor(overrides: Partial<Record<"shell" | "list", { status: number; text: string } | null>> = {}) {
    const urls: string[] = [];
    const fetcher: PageFetcher = async (url) => {
      urls.push(url);
      if (url === SHELL_URL) return overrides.shell !== undefined ? overrides.shell : { status: 200, text: `<html><a href="https://${HOST}/jobs/login?loginOnly=1">Sign in</a></html>` };
      if (url.endsWith("/robots.txt")) return { status: 200, text: ROBOTS };
      if (url.includes("/jobs/search")) return overrides.list !== undefined ? overrides.list : { status: 200, text: listPage(JOBS, 1) };
      const job = JOBS.find((item) => url.includes(`/jobs/${item.id}/`));
      return job ? { status: 200, text: `<h1>${job.title}</h1> ID ${job.req} ${"details ".repeat(80)}` } : { status: 404, text: "" };
    };
    return { fetcher, urls };
  }

  async function run(provider: JobSearchProvider, fetcher: PageFetcher) {
    const fake = createFakeSupabase({ watched_employers: employers() });
    const outcome = await startJobSearchRun(fake.client, USER, "key-direct", { config: config(), now });
    return advanceJobSearchRun(fake.client, USER, (outcome as { runId: string }).runId, { config: config(), provider, fetcher, now });
  }

  it("reads the employer's own list when the search could not, picks by index, verifies each page, and says so", async () => {
    const { provider, calls } = providerFor("page_found_but_could_not_read_listings");
    const { fetcher } = fetcherFor();
    const view = await run(provider, fetcher);

    expect(calls).toEqual(["search", "select"]);
    const rows = view?.observations ?? [];
    expect(rows.map((row) => row.title).sort()).toEqual(["Director of Communications", "Program Operations Manager"]);
    expect(rows.every((row) => row.source_tier === "direct_read" && row.verification_state === "verified_open")).toBe(true);
    expect(rows.find((row) => row.title === "Program Operations Manager")).toMatchObject({ requisition_id: "2026-100", worksite_text: "Lebanon, NH" });

    const entry = view?.run.coverage.find((item) => item.status === "read_directly_by_app");
    expect(entry?.note).toMatch(/could not read this employer's job list, so the app read it directly/);
    expect(view?.run.trace[0].directReads).toEqual([{ employer: "Employer 1", host: HOST, pages: 1, listings: 3, selected: 2 }]);
    expect(view?.run.usage).toMatchObject({ inputTokens: 17_000, outputTokens: 800 }); // the selection call is counted too
    expect(view?.run.summary).toMatch(/For Employer 1, the search could not read the job list, so the app read the employer's own public job list directly/);
  });

  it("does not run at all when the search read the employer's page fine", async () => {
    const { provider, calls } = providerFor("read_openings");
    const { fetcher, urls } = fetcherFor();
    const view = await run(provider, fetcher);
    expect(calls).toEqual(["search"]);
    expect(urls).toEqual([]);
    expect(view?.run.coverage.some((item) => item.status === "read_directly_by_app")).toBe(false);
    expect(view?.run.summary).not.toMatch(/read the employer's own public job list directly/);
  });

  it("tells the user to check by hand when the page has no supported job-list format", async () => {
    const { provider, calls } = providerFor("page_found_but_could_not_read_listings");
    const { fetcher } = fetcherFor({ shell: { status: 200, text: "<html>Plain page, no ATS</html>" } });
    const view = await run(provider, fetcher);
    expect(calls).toEqual(["search"]);
    expect(view?.observations).toHaveLength(0);
    expect(view?.run.coverage.find((item) => item.status === "direct_read_unsupported")?.note).toMatch(/check it by hand/);
    expect(view?.run.summary).toMatch(/Could not read the job list for Employer 1; please check it by hand/);
  });

  it("reports a failed direct read instead of guessing, and makes no selection call", async () => {
    const { provider, calls } = providerFor("page_found_but_could_not_read_listings");
    const { fetcher } = fetcherFor({ list: { status: 500, text: "" } });
    const view = await run(provider, fetcher);
    expect(calls).toEqual(["search"]);
    expect(view?.run.coverage.find((item) => item.status === "direct_read_failed")).toBeTruthy();
    expect(view?.run.summary).toMatch(/please check it by hand/);
  });

  it("cannot be steered to a listing outside the fetched list", async () => {
    const { provider } = providerFor("page_found_but_could_not_read_listings", [{ index: 999, reason: "made up" }, { index: 1, reason: "fit" }]);
    const { fetcher } = fetcherFor();
    const view = await run(provider, fetcher);
    expect((view?.observations ?? []).map((row) => row.title)).toEqual(["Registered Nurse (RN) - Emergency"]);
  });
});
