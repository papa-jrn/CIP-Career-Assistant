import type { APIRoute } from "astro";
import { BULK_REFRESH_CAP, loadFundingProfiles, partitionByFinancialsPlan, planFinancialsLookup, refreshFundingProfile, selectEmployersForRefresh } from "@/lib/cip/employer-financials";
import { friendlyFinancialsError, renderFinancialsBlock } from "@/lib/cip/employer-financials-view";
import { normOrg } from "@/lib/cip/employer-resolution";
import { escapeHtml } from "@/lib/cip/job-search-view";
import { checkRateLimit, clientRateLimitKey } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/security";
import { createServer } from "@/lib/supabase/server";

const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));
const PAUSE_BETWEEN_EMPLOYERS_MS = 700;

// Look up IRS Form 990 profiles for the tracked employers that need one (none yet, a failed lookup,
// or older than 30 days), up to 8 per click so a request stays quick. Each card updates in place
// through an out-of-band swap; a summary says what was found, what was not, and what is left.
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOriginRequest(request)) return html('<p class="text-sm text-red-700">Invalid request origin.</p>', 403);

  const supabase = createServer(cookies);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return html('<p class="text-sm text-red-700">Sign in to look up financials.</p>', 401);

  const limit = checkRateLimit({ key: clientRateLimitKey(request, `employer-financials-bulk:user:${user.id}`), limit: 12, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) return html('<p class="text-sm text-red-700">Too many lookups. Wait a little before trying again.</p>', 429);

  const { data: employerRows, error: employerError } = await supabase
    .from("watched_employers")
    .select("*") // all columns, so a database without the financials_mode column still loads (the setting then reads as Auto)
    .eq("user_id", user.id)
    .order("fit_score", { ascending: false })
    .limit(200);
  if (employerError) return html(`<p class="text-sm text-red-700">${escapeHtml(employerError.message)}</p>`, 500);
  const employers = (employerRows ?? []) as Array<{ id: string; name: string; location: string | null; region: string | null; category: string | null; financials_mode?: string | null }>;

  const { profiles, error: loadError } = await loadFundingProfiles(supabase, user.id);
  if (loadError) return html(`<p class="text-sm text-yellow-900">${escapeHtml(friendlyFinancialsError(loadError))}</p>`);

  // Government bodies and for-profit companies (and anything the user turned off) are not looked up.
  const { eligible, skipped: skippedByType } = partitionByFinancialsPlan(employers, profiles);
  const { selected, remaining, skippedFresh } = selectEmployersForRefresh(eligible, profiles, new Date().toISOString(), BULK_REFRESH_CAP);
  if (!selected.length) {
    const skipNote = skippedByType.length ? ` ${skippedByType.length} look like government bodies or for-profit companies and are skipped.` : "";
    return html(`<p class="text-sm text-[var(--muted)]">Nothing to look up: every employer that could have a filing already has a recent lookup (${skippedFresh} checked in the last 30 days).${escapeHtml(skipNote)}</p>`);
  }

  const swaps: string[] = [];
  let found = 0;
  let notFound = 0;
  let failed = 0;
  let saveProblem = "";
  for (const [index, employer] of selected.entries()) {
    if (index > 0) await sleep(PAUSE_BETWEEN_EMPLOYERS_MS);
    const existing = profiles.get(normOrg(employer.name)) ?? null;
    const outcome = await refreshFundingProfile(supabase, user.id, { name: employer.name, location: employer.location, region: employer.region }, existing, { sleep });
    if (outcome.profile.status === "ok") found += 1;
    else if (outcome.profile.status === "lookup_failed") failed += 1;
    else notFound += 1;
    if (!outcome.saved && !saveProblem && outcome.profile.status !== "lookup_failed") saveProblem = outcome.error ?? "";
    swaps.push(
      renderFinancialsBlock({
        employerId: employer.id,
        employerName: employer.name,
        profile: outcome.profile,
        plan: planFinancialsLookup({ mode: employer.financials_mode, name: employer.name, category: employer.category, profile: outcome.profile }),
        message: outcome.saved ? null : outcome.error ? friendlyFinancialsError(outcome.error) : null,
        oob: true,
      }),
    );
  }

  const parts = [
    `Looked up ${selected.length} employer${selected.length === 1 ? "" : "s"}: ${found} with filings, ${notFound} not found or unconfirmed (that means unknown, not poor funding)${failed ? `, ${failed} could not be reached (they will be retried)` : ""}.`,
    remaining ? `${remaining} more are waiting. Click again to continue.` : "",
    skippedByType.length ? `Skipped ${skippedByType.length} that look like government bodies or for-profit companies (change any on its card).` : "",
    saveProblem ? `Some results could not be saved: ${friendlyFinancialsError(saveProblem)}` : "",
  ].filter(Boolean);
  return html(`<p class="text-sm leading-6">${escapeHtml(parts.join(" "))}</p>${swaps.join("")}`);
};

function html(body: string, status = 200) {
  return new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
