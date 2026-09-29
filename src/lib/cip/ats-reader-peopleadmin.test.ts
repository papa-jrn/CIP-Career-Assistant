import { describe, expect, it, vi } from "vitest";
import {
  detectListSource,
  parsePeopleAdminListing,
  peopleAdminListUrl,
  readPeopleAdminListings,
} from "@/lib/cip/ats-reader";
import type { PageFetcher } from "@/lib/cip/job-verifier";

// Fixture modeled on the real searchjobs.dartmouth.edu (PeopleAdmin/SilkRoad) markup: self-labeled
// sortable column headers, `data-posting-title` cards, `/postings/{id}` links, `?page=N` pagination.
const BASE = "https://searchjobs.dartmouth.edu";

const HEADERS = `
  <a href="/postings/search?sort=226+asc">Functional Category</a>
  <a href="/postings/search?sort=90+asc">Position Number</a>
  <a href="/postings/search?sort=95+asc">Employment Category</a>
  <a href="/postings/search?sort=100+asc">Department</a>
  <a href="/postings/search?sort=1162+asc">Posted Date</a>`;

function card(id: number, title: string, funcCat: string, positionNumber: string, employment: string, department: string, posted: string) {
  return `<div class='job-item job-item-posting' data-posting-title="${title}"><div class='container-fluid'><div class='row'>
    <div class='col-md-4 col-xs-12 job-title job-title-text-wrap'><h3> <a href="/postings/${id}">${title}</a> </h3></div>
    <div class='col-md-8 col-xs-12 '>
      <div class='col-md-2 col-xs-12'></div>
      <div class='col-md-2 col-xs-12 job-title job-title-text-wrap col-md-push-0'> ${funcCat} </div>
      <div class='col-md-2 col-xs-12 job-title job-title-text-wrap col-md-push-0'> ${positionNumber} </div>
      <div class='col-md-2 col-xs-12 job-title job-title-text-wrap col-md-push-0'> ${employment} </div>
      <div class='col-md-2 col-xs-12 job-title job-title-text-wrap col-md-push-0'> ${department} </div>
      <div class='col-md-2 col-xs-12 job-title job-title-text-wrap col-md-push-0'> ${posted} </div>
    </div></div></div>`;
}

function page(cards: string, totalPages = 1) {
  const pager = Array.from({ length: totalPages - 1 }, (_, i) => `<a href="/postings/search?page=${i + 2}">${i + 2}</a>`).join("");
  return `<html><head><title>Dartmouth College Applicant Portal | Search Jobs</title></head><body>
    <div id="search_options">${HEADERS}</div><div id="search_results">${cards}</div><nav>${pager}</nav></body></html>`;
}

const CARDS = [
  card(87321, "Web Optimization and Support Analyst", "ITC – Information Technology", "1013245", "Regular Full Time", "ITC Web Services", "09/26/2026"),
  card(87378, "Reference and Administration Specialist", "LIBR – Library", "1011591", "Regular Full Time", "LIB - Spec Collection", "09/28/2026"),
];

describe("PeopleAdmin detection", () => {
  it("recognizes a PeopleAdmin board by its markup and uses the page origin", () => {
    expect(detectListSource(`${BASE}/postings/search`, page(CARDS.join("")))).toEqual({ kind: "peopleadmin", base: BASE });
  });

  it("recognizes it from a /postings/search list on an Applicant Portal even without card markup", () => {
    const shell = `<html><title>X Applicant Portal</title><a href="/postings/search">View all open Postings</a></html>`;
    expect(detectListSource("https://jobs.example.edu/", shell)).toEqual({ kind: "peopleadmin", base: "https://jobs.example.edu" });
  });

  it("does not fire on a plain page with no board markup", () => {
    expect(detectListSource("https://careers.example.org/results", "<html>plain</html>")).toBeNull();
  });
});

describe("PeopleAdmin list parsing (header-driven)", () => {
  it("reads title, /postings link, requisition (Position Number), category, department, and page count", () => {
    const { listings, totalPages } = parsePeopleAdminListing(page(CARDS.join(""), 3), BASE);
    expect(totalPages).toBe(3);
    expect(listings).toHaveLength(2);
    expect(listings[0]).toEqual({
      title: "Web Optimization and Support Analyst",
      url: `${BASE}/postings/87321`,
      requisitionId: "1013245",
      city: null,
      state: null,
      category: "ITC – Information Technology",
      snippet: "ITC – Information Technology · Regular Full Time · ITC Web Services",
    });
  });

  it("skips cards with no /postings link and returns nothing for a page with no cards", () => {
    expect(parsePeopleAdminListing("<html><body>no postings here</body></html>", BASE).listings).toEqual([]);
  });
});

describe("peopleAdminListUrl", () => {
  it("uses /postings/search for the first page and ?page=N (1-based) after", () => {
    expect(peopleAdminListUrl(BASE, 0)).toBe(`${BASE}/postings/search`);
    expect(peopleAdminListUrl(BASE, 1)).toBe(`${BASE}/postings/search?page=2`);
  });
});

describe("readPeopleAdminListings", () => {
  const fetcherFor = (pages: string[], robots = "User-agent: *\nDisallow: /admin\n"): PageFetcher & { urls: string[] } => {
    const urls: string[] = [];
    const fn = async (url: string) => {
      urls.push(url);
      if (url.endsWith("/robots.txt")) return { status: 200, text: robots };
      const p = Number(/[?&]page=(\d+)/.exec(url)?.[1] ?? "1") - 1;
      return pages[p] ? { status: 200, text: pages[p] } : { status: 500, text: "" };
    };
    return Object.assign(fn, { urls });
  };

  it("checks robots.txt, then paginates in order, deduping by URL", async () => {
    const fetcher = fetcherFor([page(CARDS[0], 2), page(CARDS[1], 2)]);
    const result = await readPeopleAdminListings(fetcher, BASE, { maxPages: 10, delayMs: 0, sleep: async () => {} });
    expect(result).toMatchObject({ ok: true, pagesRead: 2, totalPages: 2, host: "searchjobs.dartmouth.edu" });
    expect(result.listings.map((l) => l.title)).toEqual([
      "Web Optimization and Support Analyst",
      "Reference and Administration Specialist",
    ]);
    expect(fetcher.urls[0]).toBe(`${BASE}/robots.txt`);
    expect(fetcher.urls.slice(1)).toEqual([`${BASE}/postings/search`, `${BASE}/postings/search?page=2`]);
  });

  it("is left alone when robots.txt disallows the postings list", async () => {
    const fetcher = fetcherFor([page(CARDS.join(""))], "User-agent: *\nDisallow: /postings");
    const result = await readPeopleAdminListings(fetcher, BASE, { maxPages: 5, delayMs: 0, sleep: async () => {} });
    expect(result.ok).toBe(false);
    expect(result.problem).toMatch(/robots\.txt/);
    expect(fetcher.urls.some((u) => u.includes("/postings/search"))).toBe(false);
  });
});
