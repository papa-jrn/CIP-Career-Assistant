import { fetchSafe } from "@/lib/safe-fetch";

/**
 * Posting verification (Rethink §12). A model-supplied URL is only a lead. It becomes
 * "verified open" only when we fetch the page ourselves and find the posting's own title (and
 * requisition ID, when one was given) on it.
 *
 * Why content and not HTTP status: in a live test, a removed Dartmouth posting returned
 * HTTP 200 with a generic shell page. Status alone would have passed it.
 *
 * States (matching the plan): discovered_unverified, verified_open, source_reports_closed,
 * no_longer_visible, verification_unavailable. Only a successful source check can conclude
 * "no longer visible" or "closed"; blocked pages, login walls, rate limits and server errors
 * are "verification unavailable", never a closure.
 */

export type VerificationState =
  | "discovered_unverified"
  | "verified_open"
  | "source_reports_closed"
  | "no_longer_visible"
  | "verification_unavailable";

export interface VerificationResult {
  state: VerificationState;
  note: string;
  checkedAt: string;
}

export interface PostingToVerify {
  title: string;
  requisitionId?: string | null;
  sourceUrl: string;
  /** Date text the search reported (e.g. "Application Deadline: September 18, 2026"), scanned with the page. */
  statedDates?: string | null;
}

export interface FetchedPage {
  status: number;
  text: string;
}

/** `null` means the fetch was blocked by the safety rules or failed at the network level. */
export type PageFetcher = (url: string) => Promise<FetchedPage | null>;

const CLOSED_PATTERN =
  /(no longer (accepting applications|available|open)|position (has been|is) (filled|closed)|job (has been|is) (closed|filled|removed)|posting (has been|is) (closed|removed|expired)|this (job|position|posting) (has )?(expired|closed)|not currently accepting applications|applications? (are|is) (now )?closed)/i;

const MONTHS = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const DATE_PATTERN = `(?:(?:${MONTHS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}|\\d{1,2}/\\d{1,2}/\\d{4})`;
const DEADLINE_PATTERN = new RegExp(
  `(?:application\\s+deadline|deadline|closing\\s+date|closes?(?:\\s+on)?|apply\\s+by|applications?\\s+(?:are\\s+)?(?:due|accepted\\s+(?:through|until)))\\W{0,12}(${DATE_PATTERN})`,
  "gi",
);
const ROLLING_PATTERN = /until filled|open until|rolling (basis|review)|review of applications? (will )?(begin|continue)/i;

/**
 * Application deadlines named in the text that have all passed. Returns the latest such date as
 * written, or null when there is no stated deadline, any deadline is still ahead, or the posting
 * is "open until filled". A passed deadline is not an explicit closure, but a posting must not
 * be presented as verified open while its own page says applications ended.
 */
export function findPassedDeadline(text: string, todayIso: string): string | null {
  if (ROLLING_PATTERN.test(text)) return null;
  const today = todayIso.slice(0, 10);
  const found: Array<{ raw: string; iso: string }> = [];
  for (const match of text.matchAll(DEADLINE_PATTERN)) {
    const raw = match[1].replace(/(\d)(st|nd|rd|th)/i, "$1").replace(/\bsept\b/i, "Sep");
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) continue;
    const iso = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
    found.push({ raw: match[1], iso });
  }
  if (!found.length || found.some((entry) => entry.iso >= today)) return null;
  return found.sort((a, b) => b.iso.localeCompare(a.iso))[0].raw;
}

const STOPWORDS = new Set(["the", "and", "for", "with", "from", "of", "at", "in", "to", "a", "an", "on"]);

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ", quot: '"', apos: "'", lt: "<", gt: ">", ndash: "–", mdash: "—", hellip: "…",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", copy: "©", reg: "®", trade: "™", middot: "·", bull: "•",
};

/** Decodes numeric and the common named HTML entities. `&amp;` is decoded last so it cannot double-decode. */
export function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => safeCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (whole, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? whole)
    .replace(/&amp;/gi, "&");
}

function safeCodePoint(code: number) {
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return "";
  const text = String.fromCodePoint(code);
  return code === 0xa0 ? " " : text;
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|template)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForMatch(value: string) {
  return value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

/** True when the page carries this title: the whole phrase, or nearly every meaningful word. */
export function pageContainsTitle(pageText: string, title: string): boolean {
  const page = normalizeForMatch(pageText);
  const wanted = normalizeForMatch(title);
  if (!wanted) return false;
  if (page.includes(wanted)) return true;
  const words = wanted.split(" ").filter((word) => word.length > 2 && !STOPWORDS.has(word));
  if (words.length < 2) return false;
  const found = words.filter((word) => page.includes(word)).length;
  return found / words.length >= 0.9;
}

export function pageContainsRequisition(pageText: string, requisitionId: string): boolean {
  const compact = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const id = compact(requisitionId);
  return id.length > 0 && compact(pageText).includes(id);
}

/** Pure judgment over an already-fetched page. `page: null` = blocked or unreachable. */
export function judgeVerification(
  page: FetchedPage | null,
  posting: PostingToVerify,
  checkedAt: string,
): VerificationResult {
  const result = (state: VerificationState, note: string): VerificationResult => ({ state, note, checkedAt });

  if (!page) {
    return result("verification_unavailable", "The page could not be fetched (blocked, unreachable, or refused).");
  }
  if (page.status === 404 || page.status === 410) {
    return result("no_longer_visible", `The source returned ${page.status}: the posting page is gone.`);
  }
  if (page.status === 401 || page.status === 403 || page.status === 429 || page.status >= 500) {
    return result("verification_unavailable", `The source responded ${page.status} (login wall, bot block, rate limit, or server error), so the posting could not be checked.`);
  }
  if (page.status < 200 || page.status >= 300) {
    return result("verification_unavailable", `Unexpected response ${page.status}.`);
  }

  const text = htmlToText(page.text);
  const hasTitle = pageContainsTitle(text, posting.title);
  // A requisition ID too short to be distinctive (e.g. "R-1") cannot confirm or deny anything, so the
  // title alone decides; longer IDs must appear on the page.
  const usableRequisition = posting.requisitionId && posting.requisitionId.replace(/[^a-z0-9]/gi, "").length >= 3;
  const hasRequisition = usableRequisition ? pageContainsRequisition(text, posting.requisitionId as string) : null;

  if (CLOSED_PATTERN.test(text)) {
    return result("source_reports_closed", "The page says this position is closed, filled, or no longer accepting applications.");
  }
  const passed = findPassedDeadline(`${text} ${posting.statedDates ?? ""}`, checkedAt);
  if (passed) {
    return result("source_reports_closed", `The posting lists an application deadline (${passed}) that has already passed.`);
  }
  if (hasTitle && hasRequisition !== false) {
    return result(
      "verified_open",
      hasRequisition ? "The page shows this title and requisition ID." : "The page shows this title (no requisition ID was available to match).",
    );
  }
  if (hasTitle && hasRequisition === false) {
    return result("discovered_unverified", "The page shows the title but not the requisition ID the search reported.");
  }
  return result(
    "discovered_unverified",
    text.length < 400
      ? "The page returned very little text and may be built by script, so the posting could not be confirmed."
      : "The page loaded but does not contain this posting's title. It may have been removed or replaced.",
  );
}

/** Fetches through the shared SSRF guard (private ranges blocked, size capped, redirects re-validated). */
export const safePageFetcher: PageFetcher = async (url) => {
  try {
    const response = await fetchSafe(url, 15_000, {
      userAgent: "Career Intelligence Platform posting verifier",
      accept: "text/html,application/xhtml+xml",
    });
    if (!response) return null;
    return { status: response.status, text: await response.text() };
  } catch {
    return null;
  }
};

/**
 * The address to fetch when checking a posting. iCIMS job pages wrap their content in an iframe:
 * the plain address returns an empty wrapper, and the content only appears at `?in_iframe=1`
 * (found in a live check against Dartmouth Health). Users still get the normal link; only the
 * verifier's fetch is adjusted.
 */
export function verificationFetchUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.toLowerCase().endsWith(".icims.com") && /\/jobs\/\d+\//.test(parsed.pathname) && !parsed.searchParams.has("in_iframe")) {
      parsed.searchParams.set("in_iframe", "1");
      return parsed.href;
    }
  } catch {
    // not a URL we can adjust; fetch it as given
  }
  return url;
}

export async function verifyPosting(
  posting: PostingToVerify,
  fetcher: PageFetcher = safePageFetcher,
  now: () => string = () => new Date().toISOString(),
): Promise<VerificationResult> {
  return judgeVerification(await fetcher(verificationFetchUrl(posting.sourceUrl)), posting, now());
}

/** Verify many postings with bounded concurrency; order of results matches input. */
export async function verifyPostings(
  postings: PostingToVerify[],
  concurrency: number,
  fetcher: PageFetcher = safePageFetcher,
): Promise<VerificationResult[]> {
  const results: VerificationResult[] = new Array(postings.length);
  let cursor = 0;
  async function worker() {
    while (cursor < postings.length) {
      const index = cursor++;
      results[index] = await verifyPosting(postings[index], fetcher);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, postings.length || 1)) }, worker));
  return results;
}
