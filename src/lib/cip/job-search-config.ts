/**
 * Job-search configuration: model, hard caps, and pricing (Rethink §11-§12: cost is a
 * requirement, enforced in code). Everything here is data read from the environment, so a model
 * or price change is configuration, not a code change.
 *
 * Pricing is intentionally NOT hardcoded. Provider prices change and this file must never state
 * a cost it cannot back up. Until `JOB_SEARCH_PRICING_JSON` is set, runs record tokens and
 * search calls and report cost as unavailable; the run is then bounded by token and call caps
 * instead of a dollar ceiling.
 */

export interface JobSearchLimits {
  /** Role/locality scopes searched in the general tier. */
  maxScopes: number;
  scopesPerStep: number;
  /** Saved target organizations checked per run, and per provider call. */
  maxTargets: number;
  targetsPerStep: number;
  /** Hard ceiling on provider calls (steps) per run. */
  maxSteps: number;
  maxPostings: number;
  maxToolCallsPerStep: number;
  maxOutputTokensPerStep: number;
  /** Whole-run ceilings used when no pricing is configured. */
  maxRunTokens: number;
  maxRunToolCalls: number;
  /** Dollar ceiling per run, enforced only when pricing is configured. */
  maxRunCostUsd: number;
  /** Runs allowed in a rolling 7 days (a manual weekly action, with room for one re-run). */
  maxRunsPerWeek: number;
  /** A "running" run untouched this long is treated as abandoned. */
  abandonedAfterMinutes: number;
  /** A run older than this is "due" again. */
  dueAfterDays: number;
  verifyConcurrency: number;
  /** Fallback direct reading of employer job lists the search could not read (target employers only). */
  directReadsPerStep: number;
  directReadMaxPages: number;
  directReadMaxListings: number;
  directReadDelayMs: number;
  directReadMaxSelected: number;
}

export interface JobSearchPricing {
  inputPerMillionTokensUsd: number;
  outputPerMillionTokensUsd: number;
  perWebSearchCallUsd: number;
}

export interface JobSearchConfig {
  provider: "openai";
  model: string;
  limits: JobSearchLimits;
  pricing: JobSearchPricing | null;
  /** True when a provider key is present. */
  configured: boolean;
}

export const DEFAULT_JOB_SEARCH_MODEL = "gpt-5.4";

export const DEFAULT_LIMITS: JobSearchLimits = {
  maxScopes: 12,
  scopesPerStep: 3,
  maxTargets: 12,
  targetsPerStep: 4,
  maxSteps: 7,
  maxPostings: 25,
  maxToolCallsPerStep: 12,
  maxOutputTokensPerStep: 16_000,
  maxRunTokens: 400_000,
  maxRunToolCalls: 60,
  maxRunCostUsd: 1,
  maxRunsPerWeek: 3,
  abandonedAfterMinutes: 10,
  dueAfterDays: 7,
  verifyConcurrency: 3,
  directReadsPerStep: 3,
  directReadMaxPages: 10,
  directReadMaxListings: 600,
  directReadDelayMs: 600,
  directReadMaxSelected: 10,
};

export type EnvReader = (name: string) => string | undefined;

export function loadJobSearchConfig(env: EnvReader): JobSearchConfig {
  const limits: JobSearchLimits = { ...DEFAULT_LIMITS };
  const maxCost = Number(env("JOB_SEARCH_MAX_RUN_COST_USD"));
  if (Number.isFinite(maxCost) && maxCost > 0) limits.maxRunCostUsd = maxCost;

  return {
    provider: "openai",
    model: env("JOB_SEARCH_MODEL")?.trim() || DEFAULT_JOB_SEARCH_MODEL,
    limits,
    pricing: parsePricing(env("JOB_SEARCH_PRICING_JSON")),
    configured: Boolean(env("OPENAI_API_KEY")?.trim()),
  };
}

export function parsePricing(raw: string | undefined): JobSearchPricing | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<JobSearchPricing>;
    const values = [parsed.inputPerMillionTokensUsd, parsed.outputPerMillionTokensUsd, parsed.perWebSearchCallUsd];
    if (values.every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0)) {
      return parsed as JobSearchPricing;
    }
  } catch {
    // fall through: malformed pricing is treated as not configured, never guessed
  }
  return null;
}

export interface RunUsage {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  webSearchCalls: number;
}

export const EMPTY_USAGE: RunUsage = { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, webSearchCalls: 0 };

export function addUsage(a: RunUsage, b: RunUsage): RunUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    reasoningTokens: a.reasoningTokens + b.reasoningTokens,
    webSearchCalls: a.webSearchCalls + b.webSearchCalls,
  };
}

/** Estimated cost, or `basis: "unavailable"` when pricing is not configured. Never a guess. */
export function estimateCost(
  usage: RunUsage,
  pricing: JobSearchPricing | null,
): { usd: number | null; basis: "estimated" | "unavailable" } {
  if (!pricing) return { usd: null, basis: "unavailable" };
  const usd =
    (usage.inputTokens / 1_000_000) * pricing.inputPerMillionTokensUsd +
    (usage.outputTokens / 1_000_000) * pricing.outputPerMillionTokensUsd +
    usage.webSearchCalls * pricing.perWebSearchCallUsd;
  return { usd: Math.round(usd * 10_000) / 10_000, basis: "estimated" };
}

export type BudgetVerdict = { ok: true } | { ok: false; reason: string };

/** Checked before each provider call: stop rather than overspend. */
export function checkBudget(
  used: RunUsage,
  stepsCompleted: number,
  config: Pick<JobSearchConfig, "limits" | "pricing">,
): BudgetVerdict {
  const { limits, pricing } = config;
  if (stepsCompleted >= limits.maxSteps) return { ok: false, reason: `step limit reached (${limits.maxSteps})` };
  if (pricing) {
    const cost = estimateCost(used, pricing).usd ?? 0;
    if (cost >= limits.maxRunCostUsd) {
      return { ok: false, reason: `spend ceiling reached ($${limits.maxRunCostUsd.toFixed(2)})` };
    }
    return { ok: true };
  }
  const tokens = used.inputTokens + used.outputTokens;
  if (tokens >= limits.maxRunTokens) return { ok: false, reason: `token limit reached (${limits.maxRunTokens.toLocaleString("en-US")})` };
  if (used.webSearchCalls >= limits.maxRunToolCalls) {
    return { ok: false, reason: `search-call limit reached (${limits.maxRunToolCalls})` };
  }
  return { ok: true };
}
