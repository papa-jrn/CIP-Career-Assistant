import type { FetchedPage, PageFetcher } from "@/lib/cip/job-verifier";
import { htmlToText } from "@/lib/cip/job-verifier";

/**
 * Direct reader for employer job lists that the web-search step could not read (Rethink §8 step 9,
 * amended 2026-09-23 by the founder). It is a FALLBACK, not a discovery engine:
 *  - it runs only for a saved target whose career page the search reported it could not read,
 *  - it reads the employer's own public job list (iCIMS first), politely and within robots.txt,
 *  - what it finds is never trusted on its own: a model picks by index from this fetched list, and
 *    every pick is then verified on its own page like any other posting,
 *  - the result always tells the user the app read the list itself.
 *
 * Why iCIMS: many employers (Dartmouth Health among them) put a JavaScript-rendered marketing
 * site in front of an iCIMS job list. The shell shows a program nothing; the iCIMS list is plain HTML.
 */

export interface DirectListing {
  title: string;
  url: string;
  requisitionId: string | null;
  city: string | null;
  state: string | null;
  category: string | null;
  snippet: string;
}

// A recognized job-list format behind an employer's career page. iCIMS lives on a shared
// `*.icims.com` host; PeopleAdmin/SilkRoad is self-hosted under the employer's own domain, so it
// is detected by its page markup and addressed by that site's origin (`base`).
export type ListSource =
  | { kind: "icims"; host: string }
  | { kind: "peopleadmin"; base: string };

const ICIMS_HOST = /^[a-z0-9][a-z0-9-]*\.icims\.com$/;
const USER_AGENT_NOTE = "Career Intelligence Platform job-list reader";

/**
 * Detects a supported job-list format behind an employer's career page, from the URL or its HTML.
 * iCIMS is matched by host; PeopleAdmin/SilkRoad by a strong markup signature (its own
 * `data-posting-title` cards or `job-item-posting` rows, or a `/postings/search` list on an
 * "Applicant Portal"). Returns null for anything not recognized — a plain page is never assumed.
 */
export function detectListSource(pageUrl: string, html: string | null): ListSource | null {
  try {
    const host = new URL(pageUrl).hostname.toLowerCase();
    if (ICIMS_HOST.test(host)) return { kind: "icims", host };
  } catch {
    // fall through to the HTML scan
  }
  if (!html) return null;

  const icims = /https?:\/\/([a-z0-9][a-z0-9-]*\.icims\.com)\b/i.exec(html);
  if (icims && ICIMS_HOST.test(icims[1].toLowerCase())) return { kind: "icims", host: icims[1].toLowerCase() };

  if (isPeopleAdminMarkup(html)) {
    try {
      return { kind: "peopleadmin", base: new URL(pageUrl).origin };
    } catch {
      return null;
    }
  }
  return null;
}

function isPeopleAdminMarkup(html: string): boolean {
  if (/data-posting-title=/i.test(html) || /job-item[- ]posting/i.test(html)) return true;
  return /\/postings\/search/i.test(html) && /applicant portal/i.test(html);
}

export function icimsListUrl(host: string, page: number): string {
  if (!ICIMS_HOST.test(host)) throw new Error("Not an iCIMS host.");
  return `https://${host}/jobs/search?ss=1&in_iframe=1&pr=${page}`;
}

/** Parses one iCIMS results page into listings plus the total page count it reports. */
export function parseIcimsListing(html: string, host: string): { listings: DirectListing[]; totalPages: number } {
  const totalPages = Number(/of\s+(\d+)\s*,\s*Current Page/i.exec(html)?.[1] ?? /Page\s+\d+\s+of\s+(\d+)/i.exec(html)?.[1] ?? 1) || 1;
  const listings: DirectListing[] = [];
  const cards = html.split(/<li\b[^>]*class="[^"]*iCIMS_JobCardItem[^"]*"[^>]*>/i).slice(1);
  const escapedHost = host.replace(/\./g, "\\.");
  const linkPattern = new RegExp(`href="(https://${escapedHost}/jobs/\\d+/[^"?#]*/job)(?:\\?[^"]*)?"`, "i");

  for (const card of cards) {
    const link = linkPattern.exec(card);
    if (!link) continue;
    const title = clean(/<h3[^>]*>([\s\S]*?)<\/h3>/i.exec(card)?.[1] ?? "");
    if (!title) continue;
    const locationCode = /Job Locations<\/span>\s*<span[^>]*>\s*([^<]+)</i.exec(card)?.[1]?.trim() ?? "";
    const [, state, ...cityParts] = /^US-([A-Z]{2})-(.+)$/.exec(locationCode) ?? [];
    const requisition = /field-label">ID<\/span>\s*<span[^>]*>\s*([^<]+)</i.exec(card)?.[1]?.trim() ?? null;
    const category = clean(/Category<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/i.exec(card)?.[1] ?? "") || null;
    const snippet = clean(/class="col-xs-12 description"[^>]*>([\s\S]*?)<\/div>/i.exec(card)?.[1] ?? "").slice(0, 240);
    listings.push({
      title,
      url: link[1],
      requisitionId: requisition,
      city: cityParts.length ? cityParts.join("-").trim() : null,
      state: state ?? null,
      category,
      snippet,
    });
  }
  return { listings, totalPages };
}

export function peopleAdminListUrl(base: string, page: number): string {
  const origin = new URL(base).origin;
  return page <= 0 ? `${origin}/postings/search` : `${origin}/postings/search?page=${page + 1}`;
}

/**
 * Parses one PeopleAdmin/SilkRoad results page. Column meaning is read from the board's OWN sortable
 * column headers, so it works across institutions that show different columns rather than assuming a
 * fixed order. Titles come from the `data-posting-title` attribute and each posting's `/postings/{id}`
 * link; nothing is invented.
 */
export function parsePeopleAdminListing(html: string, base: string): { listings: DirectListing[]; totalPages: number } {
  const origin = new URL(base).origin;
  const pageNumbers = [...html.matchAll(/\/postings\/search\?[^"']*\bpage=(\d+)/gi)].map((m) => Number(m[1]));
  const totalPages = pageNumbers.length ? Math.max(1, ...pageNumbers) : 1;

  // Value-column labels, in the order the value cells appear (the Title column has no sort link).
  const headers = [...html.matchAll(/\/postings\/search\?sort=[^"']*['"]>\s*([^<]+?)\s*<\/a>/gi)].map((m) => clean(m[1]));
  const findValue = (values: string[], re: RegExp): string | null => {
    const index = headers.findIndex((label) => re.test(label));
    return index >= 0 && index < values.length ? values[index] || null : null;
  };

  const listings: DirectListing[] = [];
  const starts = [...html.matchAll(/data-posting-title="([^"]*)"/gi)];
  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i].index ?? 0;
    const end = i + 1 < starts.length ? (starts[i + 1].index ?? html.length) : html.length;
    const card = html.slice(start, end);
    const idMatch = /\/postings\/(\d+)\b/.exec(card);
    if (!idMatch) continue;
    const title = clean(starts[i][1]);
    if (!title) continue;

    const values = [...card.matchAll(/col-md-push-0['"]>\s*([\s\S]*?)<\/div>/gi)].map((m) => clean(m[1]));
    const requisitionId = findValue(values, /position number|requisition|posting number|job number/i);
    const category = findValue(values, /functional category|category/i);
    const department = findValue(values, /department|division|school|unit/i);
    const employment = findValue(values, /employment|type|schedule/i);
    const location = findValue(values, /location|city|campus|worksite/i);
    const [city, state] = splitLocation(location);
    const snippet = [category, employment, department].filter(Boolean).join(" · ").slice(0, 240);

    listings.push({
      title,
      url: `${origin}/postings/${idMatch[1]}`,
      requisitionId,
      city,
      state,
      category: category ?? department,
      snippet,
    });
  }
  return { listings, totalPages };
}

/** Splits "City, ST" or "City, State" into parts; anything else is unknown (never guessed). */
function splitLocation(value: string | null): [string | null, string | null] {
  if (!value) return [null, null];
  const match = /^(.+?),\s*([A-Za-z]{2})$/.exec(value.trim());
  if (match) return [match[1].trim(), match[2].toUpperCase()];
  return [null, null];
}

/** Minimal robots.txt check for the default user agent: longest matching rule wins; Allow beats Disallow on ties. */
export function robotsAllows(robotsText: string, path: string): boolean {
  const rules: Array<{ allow: boolean; pattern: string }> = [];
  let applies = false;
  let inGroupHeader = false;
  for (const rawLine of robotsText.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const [field, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    const name = field.trim().toLowerCase();
    if (name === "user-agent") {
      if (!inGroupHeader) applies = false;
      inGroupHeader = true;
      if (value === "*") applies = true;
      continue;
    }
    inGroupHeader = false;
    if (!applies) continue;
    if (name === "disallow" && value) rules.push({ allow: false, pattern: value });
    if (name === "allow" && value) rules.push({ allow: true, pattern: value });
  }
  let best: { allow: boolean; length: number } | null = null;
  for (const rule of rules) {
    const regex = new RegExp(`^${rule.pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$")}`);
    if (!regex.test(path)) continue;
    const length = rule.pattern.length;
    if (!best || length > best.length || (length === best.length && rule.allow)) best = { allow: rule.allow, length };
  }
  return best ? best.allow : true;
}

export interface DirectReadResult {
  ok: boolean;
  host: string;
  listings: DirectListing[];
  pagesRead: number;
  totalPages: number;
  /** Set when the list could not be read, in plain language. */
  problem?: string;
}

export interface ReadBoardOptions {
  maxPages: number;
  delayMs: number;
  sleep?: (ms: number) => Promise<void>;
  maxListings?: number;
}

interface BoardReader {
  /** Host label used in results and the run trace. */
  hostLabel: string;
  /** robots.txt URL and the list path checked against it. */
  robotsUrl: string;
  robotsPath: string;
  /** Page URL for a 0-based page index. */
  listUrl: (page: number) => string;
  /** Parses one results page into listings and the total page count it reports. */
  parse: (html: string) => { listings: DirectListing[]; totalPages: number };
}

/**
 * Shared page-by-page reader for a server-rendered job board: robots.txt first, then pages in
 * order with a pause between requests, capped by `maxPages`. Board-format specifics (URL shape,
 * markup parsing) come from the `BoardReader`; every fetch goes through the caller's SSRF-safe
 * fetcher. iCIMS and PeopleAdmin both use this, so a new format is a detector + parser, not a new
 * reader.
 */
async function readPagedBoard(
  fetcher: PageFetcher,
  reader: BoardReader,
  options: ReadBoardOptions,
): Promise<DirectReadResult> {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
  const host = reader.hostLabel;
  const base: DirectReadResult = { ok: false, host, listings: [], pagesRead: 0, totalPages: 0 };

  const robots = await fetcher(reader.robotsUrl);
  if (robots && robots.status === 200 && !robotsAllows(robots.text, reader.robotsPath)) {
    return { ...base, problem: "The site's robots.txt does not allow automated reading of its job list, so it was left alone." };
  }

  const seen = new Set<string>();
  const listings: DirectListing[] = [];
  let totalPages = 1;
  let pagesRead = 0;
  for (let page = 0; page < Math.min(options.maxPages, totalPages); page += 1) {
    if (page > 0) await sleep(options.delayMs);
    const response: FetchedPage | null = await fetcher(reader.listUrl(page));
    if (!response || response.status !== 200) {
      return { ok: listings.length > 0, host, listings, pagesRead, totalPages, problem: `The job list could not be read (page ${page + 1}${response ? `, status ${response.status}` : ""}).` };
    }
    const parsed = reader.parse(response.text);
    totalPages = page === 0 ? parsed.totalPages : totalPages;
    pagesRead += 1;
    for (const listing of parsed.listings) {
      if (seen.has(listing.url)) continue;
      seen.add(listing.url);
      listings.push(listing);
    }
    if (listings.length >= (options.maxListings ?? 600)) break;
  }
  if (!listings.length) return { ...base, pagesRead, totalPages, problem: "The job list page loaded but no listings could be read from it." };
  const capped = pagesRead < totalPages;
  return { ok: true, host, listings, pagesRead, totalPages, problem: capped ? `Only the first ${pagesRead} of ${totalPages} pages were read.` : undefined };
}

/** Reads an iCIMS job list. Every fetch goes through the caller's SSRF-safe fetcher. */
export async function readIcimsListings(fetcher: PageFetcher, host: string, options: ReadBoardOptions): Promise<DirectReadResult> {
  if (!ICIMS_HOST.test(host)) return { ok: false, host, listings: [], pagesRead: 0, totalPages: 0, problem: "Not a recognized job-list host." };
  return readPagedBoard(fetcher, {
    hostLabel: host,
    robotsUrl: `https://${host}/robots.txt`,
    robotsPath: "/jobs/search",
    listUrl: (page) => icimsListUrl(host, page),
    parse: (html) => parseIcimsListing(html, host),
  }, options);
}

/** Reads a PeopleAdmin/SilkRoad job list (self-hosted under the employer's own domain). */
export async function readPeopleAdminListings(fetcher: PageFetcher, base: string, options: ReadBoardOptions): Promise<DirectReadResult> {
  let origin: string;
  try {
    origin = new URL(base).origin;
  } catch {
    return { ok: false, host: base, listings: [], pagesRead: 0, totalPages: 0, problem: "Not a recognized job-list host." };
  }
  return readPagedBoard(fetcher, {
    hostLabel: new URL(origin).hostname,
    robotsUrl: `${origin}/robots.txt`,
    robotsPath: "/postings/search",
    listUrl: (page) => peopleAdminListUrl(origin, page),
    parse: (html) => parsePeopleAdminListing(html, origin),
  }, options);
}

function clean(value: string) {
  return htmlToText(value).replace(/\s+/g, " ").trim();
}

export { USER_AGENT_NOTE };
