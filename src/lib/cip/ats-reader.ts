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

export type ListSource = { kind: "icims"; host: string };

const ICIMS_HOST = /^[a-z0-9][a-z0-9-]*\.icims\.com$/;
const USER_AGENT_NOTE = "Career Intelligence Platform job-list reader";

/** Finds the iCIMS host behind an employer's career page, from the URL itself or links in its HTML. */
export function detectListSource(pageUrl: string, html: string | null): ListSource | null {
  try {
    const host = new URL(pageUrl).hostname.toLowerCase();
    if (ICIMS_HOST.test(host)) return { kind: "icims", host };
  } catch {
    // fall through to the HTML scan
  }
  if (!html) return null;
  const match = /https?:\/\/([a-z0-9][a-z0-9-]*\.icims\.com)\b/i.exec(html);
  return match && ICIMS_HOST.test(match[1].toLowerCase()) ? { kind: "icims", host: match[1].toLowerCase() } : null;
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

/**
 * Reads an iCIMS job list page by page: robots.txt first, then pages in order with a pause between
 * requests, capped by `maxPages`. Every fetch goes through the caller's SSRF-safe fetcher.
 */
export async function readIcimsListings(
  fetcher: PageFetcher,
  host: string,
  options: { maxPages: number; delayMs: number; sleep?: (ms: number) => Promise<void>; maxListings?: number },
): Promise<DirectReadResult> {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
  const base: DirectReadResult = { ok: false, host, listings: [], pagesRead: 0, totalPages: 0 };
  if (!ICIMS_HOST.test(host)) return { ...base, problem: "Not a recognized job-list host." };

  const robots = await fetcher(`https://${host}/robots.txt`);
  if (robots && robots.status === 200 && !robotsAllows(robots.text, "/jobs/search")) {
    return { ...base, problem: "The site's robots.txt does not allow automated reading of its job list, so it was left alone." };
  }

  const seen = new Set<string>();
  const listings: DirectListing[] = [];
  let totalPages = 1;
  let pagesRead = 0;
  for (let page = 0; page < Math.min(options.maxPages, totalPages); page += 1) {
    if (page > 0) await sleep(options.delayMs);
    const response: FetchedPage | null = await fetcher(icimsListUrl(host, page));
    if (!response || response.status !== 200) {
      return { ok: listings.length > 0, host, listings, pagesRead, totalPages, problem: `The job list could not be read (page ${page + 1}${response ? `, status ${response.status}` : ""}).` };
    }
    const parsed = parseIcimsListing(response.text, host);
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

function clean(value: string) {
  return htmlToText(value).replace(/\s+/g, " ").trim();
}

export { USER_AGENT_NOTE };
