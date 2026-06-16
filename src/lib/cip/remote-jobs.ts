// Live remote-job search across sources that expose real, open endpoints.
// No scraping, no API key, no fabrication: each listing carries the real
// source name and URL it came from, and a source that fails is reported as an
// error rather than silently replaced with invented results.

export interface RemoteJob {
  title: string;
  company: string;
  location: string;
  url: string;
  source: "Remotive" | "RemoteOK" | "We Work Remotely";
  tags: string[];
  salary: string;
  publishedAt: string;
  description: string;
}

export interface RemoteSourceStatus {
  name: RemoteJob["source"];
  found: number;
  error?: string;
}

export interface RemoteSearchResult {
  jobs: RemoteJob[];
  sources: RemoteSourceStatus[];
}

const USER_AGENT = "CIP-Career/1.0 (personal career intelligence app)";
const FETCH_TIMEOUT_MS = 9000;

export async function searchRemoteJobs(query: string, regionFilter = ""): Promise<RemoteSearchResult> {
  const q = query.trim();
  const region = regionFilter.trim().toLowerCase();

  const [remotive, remoteOk, wwr] = await Promise.all([
    safeSource("Remotive", () => fetchRemotive(q)),
    safeSource("RemoteOK", () => fetchRemoteOk(q)),
    safeSource("We Work Remotely", () => fetchWeWorkRemotely(q)),
  ]);

  const sources = [remotive.status, remoteOk.status, wwr.status];
  let jobs = [...remotive.jobs, ...remoteOk.jobs, ...wwr.jobs];

  // Keyword filter (the per-source search params are inconsistent, so we apply
  // a uniform keyword gate here too) and optional region gate.
  const terms = tokenize(q);
  if (terms.length) {
    jobs = jobs.filter((job) => {
      const haystack = `${job.title} ${job.company} ${job.tags.join(" ")} ${job.description}`.toLowerCase();
      return terms.some((term) => haystack.includes(term));
    });
  }
  if (region) {
    jobs = jobs.filter((job) => {
      const loc = job.location.toLowerCase();
      // Worldwide/anywhere listings pass any region filter.
      return !loc || loc.includes(region) || loc.includes("worldwide") || loc.includes("anywhere");
    });
  }

  jobs = dedupe(jobs).sort((a, b) => dateValue(b.publishedAt) - dateValue(a.publishedAt));
  return { jobs, sources };
}

async function safeSource(
  name: RemoteJob["source"],
  fn: () => Promise<RemoteJob[]>,
): Promise<{ jobs: RemoteJob[]; status: RemoteSourceStatus }> {
  try {
    const jobs = await fn();
    return { jobs, status: { name, found: jobs.length } };
  } catch (error) {
    return { jobs: [], status: { name, found: 0, error: error instanceof Error ? error.message : "fetch failed" } };
  }
}

async function fetchRemotive(query: string): Promise<RemoteJob[]> {
  const url = new URL("https://remotive.com/api/remote-jobs");
  if (query) url.searchParams.set("search", query);
  url.searchParams.set("limit", "50");
  const payload = await getJson(url.toString());
  const jobs = Array.isArray(payload?.jobs) ? payload.jobs : [];
  return jobs.slice(0, 50).map((item: Record<string, unknown>) => ({
    title: String(item.title ?? "Untitled role"),
    company: String(item.company_name ?? "Unknown company"),
    location: String(item.candidate_required_location ?? ""),
    url: String(item.url ?? ""),
    source: "Remotive" as const,
    tags: Array.isArray(item.tags) ? item.tags.map(String).slice(0, 8) : [],
    salary: String(item.salary ?? ""),
    publishedAt: String(item.publication_date ?? ""),
    description: stripHtml(String(item.description ?? "")).slice(0, 400),
  })).filter((job) => job.url);
}

async function fetchRemoteOk(query: string): Promise<RemoteJob[]> {
  const payload = await getJson("https://remoteok.com/api");
  if (!Array.isArray(payload)) return [];
  // The first element is a legal/metadata notice, not a job.
  const rows = payload.filter((item) => item && typeof item === "object" && (item as Record<string, unknown>).position);
  return rows.slice(0, 60).map((raw) => {
    const item = raw as Record<string, unknown>;
    const min = Number(item.salary_min ?? 0);
    const max = Number(item.salary_max ?? 0);
    const salary = min && max ? `$${min.toLocaleString()}-$${max.toLocaleString()}` : "";
    return {
      title: String(item.position ?? "Untitled role"),
      company: String(item.company ?? "Unknown company"),
      location: String(item.location ?? ""),
      url: String(item.url ?? item.apply_url ?? ""),
      source: "RemoteOK" as const,
      tags: Array.isArray(item.tags) ? item.tags.map(String).slice(0, 8) : [],
      salary,
      publishedAt: String(item.date ?? ""),
      description: stripHtml(String(item.description ?? "")).slice(0, 400),
    };
  }).filter((job) => job.url);
}

async function fetchWeWorkRemotely(query: string): Promise<RemoteJob[]> {
  const xml = await getText("https://weworkremotely.com/remote-jobs.rss");
  const items = xml.split(/<item>/i).slice(1).map((chunk) => chunk.split(/<\/item>/i)[0]);
  return items.slice(0, 60).map((item) => {
    const rawTitle = decodeXml(tagText(item, "title"));
    // WWR titles are usually "Company: Position".
    const split = rawTitle.split(/:\s*/);
    const company = split.length > 1 ? split[0].trim() : "Unknown company";
    const title = split.length > 1 ? split.slice(1).join(": ").trim() : rawTitle;
    return {
      title: title || "Untitled role",
      company,
      location: decodeXml(tagText(item, "region")) || "Remote",
      url: decodeXml(tagText(item, "link")),
      source: "We Work Remotely" as const,
      tags: [decodeXml(tagText(item, "category"))].filter(Boolean),
      salary: "",
      publishedAt: decodeXml(tagText(item, "pubDate")),
      description: stripHtml(decodeXml(tagText(item, "description"))).slice(0, 400),
    };
  }).filter((job) => job.url);
}

async function getJson(url: string) {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

async function getText(url: string) {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/xml, text/xml" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.text();
}

function tagText(block: string, tag: string) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  if (!match) return "";
  return match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
}

function decodeXml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function dedupe(jobs: RemoteJob[]) {
  const seen = new Set<string>();
  return jobs.filter((job) => {
    const key = `${job.title}|${job.company}`.toLowerCase().replace(/\s+/g, " ").trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dateValue(value: string) {
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}

function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function tokenize(text: string) {
  const stop = new Set(["and", "the", "for", "with", "job", "jobs", "remote", "role"]);
  return [...new Set(text.toLowerCase().split(/[^a-z0-9+#.]+/).filter((w) => w.length > 2 && !stop.has(w)))].slice(0, 12);
}
