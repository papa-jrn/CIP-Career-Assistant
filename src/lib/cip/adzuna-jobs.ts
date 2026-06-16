// Geographic job search via the Adzuna API. Real listings only: results are a
// live read from Adzuna, each links back to the original posting, and missing
// credentials or a failed call are reported honestly rather than faked.
// Adzuna terms require "Jobs by Adzuna" attribution wherever results are shown.

export interface AdzunaJob {
  title: string;
  company: string;
  location: string;
  url: string;
  salary: string;
  workMode: string;
  category: string;
  publishedAt: string;
  description: string;
}

export interface AdzunaSearchInput {
  what: string;
  where: string;
  radiusMiles: number;
  country: string;
  salaryMin: number | null;
}

export interface AdzunaSearchResult {
  mode: "live" | "not_configured" | "error";
  jobs: AdzunaJob[];
  count: number;
  error?: string;
}

const SUPPORTED_COUNTRIES = new Set(["us", "ca", "gb", "au"]);
const FETCH_TIMEOUT_MS = 9000;

export function isAdzunaConfigured() {
  return Boolean(
    (import.meta.env.ADZUNA_APP_ID || process.env.ADZUNA_APP_ID) &&
      (import.meta.env.ADZUNA_APP_KEY || process.env.ADZUNA_APP_KEY),
  );
}

export async function searchAdzunaJobs(input: AdzunaSearchInput): Promise<AdzunaSearchResult> {
  const appId = import.meta.env.ADZUNA_APP_ID || process.env.ADZUNA_APP_ID;
  const appKey = import.meta.env.ADZUNA_APP_KEY || process.env.ADZUNA_APP_KEY;

  if (!appId || !appKey) {
    return {
      mode: "not_configured",
      jobs: [],
      count: 0,
      error: "ADZUNA_APP_ID and ADZUNA_APP_KEY are not configured.",
    };
  }

  const country = SUPPORTED_COUNTRIES.has(input.country) ? input.country : "us";
  const url = new URL(`https://api.adzuna.com/v1/api/jobs/${country}/search/1`);
  url.searchParams.set("app_id", appId);
  url.searchParams.set("app_key", appKey);
  url.searchParams.set("results_per_page", "50");
  url.searchParams.set("content-type", "application/json");
  if (input.what) url.searchParams.set("what", input.what);
  if (input.where) url.searchParams.set("where", input.where);
  // Adzuna distance is in kilometres; the UI collects miles.
  if (input.radiusMiles > 0) url.searchParams.set("distance", String(Math.round(input.radiusMiles * 1.60934)));
  if (input.salaryMin && input.salaryMin > 0) url.searchParams.set("salary_min", String(Math.round(input.salaryMin)));

  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Adzuna returned ${response.status}: ${body.slice(0, 200)}`);
    }
    const payload = await response.json();
    const results = Array.isArray(payload?.results) ? payload.results : [];
    const jobs = results.map(normalizeJob).filter((job: AdzunaJob) => job.url);
    return { mode: "live", jobs, count: Number(payload?.count ?? jobs.length) };
  } catch (error) {
    return {
      mode: "error",
      jobs: [],
      count: 0,
      error: error instanceof Error ? error.message : "Adzuna search failed.",
    };
  }
}

function normalizeJob(raw: unknown): AdzunaJob {
  const item = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const company = readDisplayName(item.company) || "Unknown company";
  const location = readDisplayName(item.location);
  const category = readDisplayName(item.category);
  const min = Number(item.salary_min ?? 0);
  const max = Number(item.salary_max ?? 0);
  const salary = min && max && min !== max
    ? `$${Math.round(min).toLocaleString()}-$${Math.round(max).toLocaleString()}`
    : min
      ? `$${Math.round(min).toLocaleString()}`
      : "";
  const contractTime = String(item.contract_time ?? "");

  return {
    title: String(item.title ?? "Untitled role"),
    company,
    location,
    url: String(item.redirect_url ?? ""),
    salary,
    workMode: inferWorkMode(`${item.title ?? ""} ${location} ${item.description ?? ""} ${contractTime}`),
    category,
    publishedAt: String(item.created ?? ""),
    description: stripHtml(String(item.description ?? "")).slice(0, 400),
  };
}

function readDisplayName(value: unknown): string {
  if (value && typeof value === "object") {
    const name = (value as Record<string, unknown>).display_name;
    if (typeof name === "string") return name;
  }
  return "";
}

function inferWorkMode(text: string) {
  const normalized = text.toLowerCase();
  if (normalized.includes("remote")) return "remote";
  if (normalized.includes("hybrid")) return "hybrid";
  return "";
}

function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
