import type { SupabaseClient } from "@supabase/supabase-js";
import type { IntakeForm } from "@/lib/cip/intake";

export interface NormalizedOpportunity {
  title: string;
  company: string;
  location: string | null;
  work_mode: string | null;
  salary_min: number | null;
  salary_max: number | null;
  source_url: string;
  source_provider: "greenhouse" | "lever";
  source_id: string;
  description: string;
  tags: string[];
  source_snapshot: Record<string, unknown>;
}

export interface OpportunityMatch {
  match_score: number;
  confidence: "high" | "medium" | "low";
  fit_summary: string;
  missing_skills: string[];
  evidence: Array<{ label: string; value: string }>;
}

export interface MarketSourceSummary {
  provider: string;
  slug: string;
  found: number;
  saved: number;
  error?: string;
}

export function configuredMarketSources() {
  return {
    greenhouse: splitEnv(import.meta.env.LABOR_MARKET_GREENHOUSE_BOARDS || process.env.LABOR_MARKET_GREENHOUSE_BOARDS),
    lever: splitEnv(import.meta.env.LABOR_MARKET_LEVER_COMPANIES || process.env.LABOR_MARKET_LEVER_COMPANIES),
  };
}

export async function ingestConfiguredSources(
  supabase: SupabaseClient,
  intake: Partial<IntakeForm>,
) {
  const sources = configuredMarketSources();
  const summaries: MarketSourceSummary[] = [];

  for (const slug of sources.greenhouse) {
    const summary = await ingestSource(supabase, "greenhouse", slug, intake);
    summaries.push(summary);
  }

  for (const slug of sources.lever) {
    const summary = await ingestSource(supabase, "lever", slug, intake);
    summaries.push(summary);
  }

  return summaries;
}

export async function refreshOpportunityMatches(
  supabase: SupabaseClient,
  userId: string,
  intake: Partial<IntakeForm>,
) {
  const { data: opportunities, error } = await supabase
    .from("opportunities")
    .select("id,title,company,location,work_mode,description,tags")
    .order("last_seen_at", { ascending: false })
    .limit(100);

  if (error || !opportunities) {
    return { scored: 0, saved: 0 };
  }

  let saved = 0;
  for (const opportunity of opportunities) {
    const match = scoreOpportunity(opportunity, intake);
    if (match.match_score < 40) continue;

    const { error: matchError } = await supabase.from("opportunity_matches").upsert(
      {
        user_id: userId,
        opportunity_id: opportunity.id,
        ...match,
        evidence: match.evidence,
      },
      { onConflict: "user_id,opportunity_id" },
    );

    if (!matchError) saved += 1;
  }

  return { scored: opportunities.length, saved };
}

async function ingestSource(
  supabase: SupabaseClient,
  provider: "greenhouse" | "lever",
  slug: string,
  intake: Partial<IntakeForm>,
): Promise<MarketSourceSummary> {
  try {
    const opportunities =
      provider === "greenhouse"
        ? await fetchGreenhouseBoard(slug)
        : await fetchLeverCompany(slug);
    const relevant = rankRelevantOpportunities(opportunities, intake).slice(0, 40);
    let saved = 0;

    for (const opportunity of relevant) {
      const { data, error } = await supabase
        .from("opportunities")
        .upsert(
          {
            ...opportunity,
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: "source_url" },
        )
        .select("id")
        .single();

      if (!error && data?.id) saved += 1;
    }

    return { provider, slug, found: opportunities.length, saved };
  } catch (error) {
    return {
      provider,
      slug,
      found: 0,
      saved: 0,
      error: error instanceof Error ? error.message : "Unknown ingestion error",
    };
  }
}

async function fetchGreenhouseBoard(slug: string): Promise<NormalizedOpportunity[]> {
  const response = await fetch(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`);
  if (!response.ok) throw new Error(`Greenhouse ${slug} returned ${response.status}`);
  const payload = await response.json();
  const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];

  return jobs
    .filter((job) => job && typeof job === "object")
    .map((job) => {
      const item = job as Record<string, unknown>;
      const location = readNestedName(item.offices) || readNestedName(item.location);
      const title = String(item.title ?? "Untitled role");
      const absoluteUrl = String(item.absolute_url ?? "");
      const content = stripHtml(String(item.content ?? ""));
      const departments = namesFromArray(item.departments);

      return {
        title,
        company: slug,
        location,
        work_mode: inferWorkMode(`${title} ${location ?? ""} ${content}`),
        salary_min: null,
        salary_max: null,
        source_url: absoluteUrl,
        source_provider: "greenhouse" as const,
        source_id: String(item.id ?? absoluteUrl),
        description: content,
        tags: departments,
        source_snapshot: item,
      };
    })
    .filter((job) => job.source_url);
}

async function fetchLeverCompany(slug: string): Promise<NormalizedOpportunity[]> {
  const response = await fetch(`https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`);
  if (!response.ok) throw new Error(`Lever ${slug} returned ${response.status}`);
  const jobs = await response.json();
  if (!Array.isArray(jobs)) return [];

  return jobs
    .filter((job) => job && typeof job === "object")
    .map((job) => {
      const item = job as Record<string, unknown>;
      const title = String(item.text ?? "Untitled role");
      const categories = item.categories && typeof item.categories === "object"
        ? (item.categories as Record<string, unknown>)
        : {};
      const lists = Array.isArray(item.lists) ? item.lists : [];
      const description = stripHtml(
        lists
          .map((list) =>
            list && typeof list === "object"
              ? `${(list as Record<string, unknown>).text ?? ""}\n${(list as Record<string, unknown>).content ?? ""}`
              : "",
          )
          .join("\n"),
      );

      return {
        title,
        company: slug,
        location: String(categories.location ?? ""),
        work_mode: inferWorkMode(`${title} ${categories.commitment ?? ""} ${categories.location ?? ""} ${description}`),
        salary_min: null,
        salary_max: null,
        source_url: String(item.hostedUrl ?? item.applyUrl ?? ""),
        source_provider: "lever" as const,
        source_id: String(item.id ?? item.hostedUrl ?? ""),
        description,
        tags: [categories.team, categories.department, categories.commitment].filter((tag): tag is string => typeof tag === "string" && tag.length > 0),
        source_snapshot: item,
      };
    })
    .filter((job) => job.source_url);
}

export function scoreOpportunity(
  opportunity: {
    title: string;
    company: string;
    location: string | null;
    work_mode: string | null;
    description: string | null;
    tags?: string[] | null;
  },
  intake: Partial<IntakeForm>,
) {
  const haystack = normalize([
    opportunity.title,
    opportunity.company,
    opportunity.location,
    opportunity.work_mode,
    opportunity.description,
    ...(opportunity.tags ?? []),
  ].join(" "));
  const preferredModes = intake.work_modes ?? [];
  const roleTerms = tokenize([intake.target_title, intake.industry_preferences].join(" "));
  const resumeTerms = tokenize([intake.resume_text, intake.hidden_achievements, intake.energizing_problems].join(" "));
  const preferredIndustries = tokenize(intake.industry_preferences ?? "");
  const evidence: OpportunityMatch["evidence"] = [];
  const missingSkills: string[] = [];
  let score = 38;

  const roleHits = roleTerms.filter((term) => haystack.includes(term));
  score += Math.min(24, roleHits.length * 6);
  if (roleHits.length) evidence.push({ label: "Role language", value: roleHits.slice(0, 6).join(", ") });

  const resumeHits = resumeTerms.filter((term) => haystack.includes(term));
  score += Math.min(20, resumeHits.length * 4);
  if (resumeHits.length) evidence.push({ label: "Experience overlap", value: resumeHits.slice(0, 6).join(", ") });

  const industryHits = preferredIndustries.filter((term) => haystack.includes(term));
  score += Math.min(12, industryHits.length * 4);
  if (industryHits.length) evidence.push({ label: "Industry signal", value: industryHits.slice(0, 4).join(", ") });

  if (preferredModes.length && opportunity.work_mode && preferredModes.includes(opportunity.work_mode)) {
    score += 8;
    evidence.push({ label: "Work model", value: opportunity.work_mode });
  }

  for (const skill of ["sql", "python", "analytics", "stakeholder", "automation", "ai", "product", "program"]) {
    if (haystack.includes(skill) && !normalize(intake.resume_text ?? "").includes(skill)) {
      missingSkills.push(skill);
    }
  }

  score = Math.max(1, Math.min(98, score));
  return {
    match_score: score,
    confidence: score >= 78 ? "high" : score >= 60 ? "medium" : "low",
    fit_summary: buildFitSummary(opportunity.title, roleHits, resumeHits),
    missing_skills: [...new Set(missingSkills)].slice(0, 6),
    evidence,
  } satisfies OpportunityMatch;
}

export function rankRelevantOpportunities(
  opportunities: NormalizedOpportunity[],
  intake: Partial<IntakeForm>,
) {
  return opportunities
    .map((opportunity) => ({
      opportunity,
      score: scoreOpportunity(opportunity, intake).match_score,
    }))
    .filter(({ score }) => score >= 42)
    .sort((a, b) => b.score - a.score)
    .map(({ opportunity }) => opportunity);
}

function buildFitSummary(title: string, roleHits: string[], resumeHits: string[]) {
  if (roleHits.length || resumeHits.length) {
    return `${title} overlaps with ${[...roleHits, ...resumeHits].slice(0, 5).join(", ")} from the saved profile.`;
  }
  return `${title} is present in the researched market but needs more evidence before it should be treated as a strong fit.`;
}

function inferWorkMode(text: string) {
  const normalized = normalize(text);
  if (normalized.includes("remote")) return "remote";
  if (normalized.includes("hybrid")) return "hybrid";
  if (normalized.includes("on site") || normalized.includes("onsite")) return "on-site";
  return null;
}

function splitEnv(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalize(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9+.#\s-]/g, " ");
}

function tokenize(text: string) {
  const stopWords = new Set(["and", "the", "with", "for", "from", "that", "this", "into", "role", "work", "jobs"]);
  return [...new Set(normalize(text).split(/\s+/).filter((word) => word.length > 2 && !stopWords.has(word)))].slice(0, 40);
}

function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function namesFromArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => item && typeof item === "object" ? (item as Record<string, unknown>).name : null)
    .filter((name): name is string => typeof name === "string" && name.length > 0);
}

function readNestedName(value: unknown): string | null {
  if (Array.isArray(value)) {
    const names = namesFromArray(value);
    return names[0] ?? null;
  }
  if (value && typeof value === "object") {
    const name = (value as Record<string, unknown>).name;
    return typeof name === "string" ? name : null;
  }
  return null;
}
