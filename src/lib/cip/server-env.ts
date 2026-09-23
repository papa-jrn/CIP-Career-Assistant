import type { EnvReader } from "@/lib/cip/job-search-config";

/**
 * Server-side reads of the job-search settings.
 *
 * Astro/Vite only substitutes private (non-PUBLIC_) variables when they are written out by name
 * as `import.meta.env.NAME`. Looking one up by a variable (`import.meta.env[name]`) silently
 * returns undefined, which made the search look "not configured". So every setting is listed
 * explicitly here, with `process.env` as the fallback the rest of the app also uses.
 */
export const readJobSearchEnv: EnvReader = (name) => {
  const byName: Record<string, string | undefined> = {
    OPENAI_API_KEY: import.meta.env.OPENAI_API_KEY,
    JOB_SEARCH_MODEL: import.meta.env.JOB_SEARCH_MODEL,
    JOB_SEARCH_MAX_RUN_COST_USD: import.meta.env.JOB_SEARCH_MAX_RUN_COST_USD,
    JOB_SEARCH_PRICING_JSON: import.meta.env.JOB_SEARCH_PRICING_JSON,
  };
  return byName[name] || process.env[name] || undefined;
};
