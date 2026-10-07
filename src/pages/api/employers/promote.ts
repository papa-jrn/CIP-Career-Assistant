import type { APIRoute } from "astro";
import { BULK_REFRESH_CAP, loadFundingProfiles, refreshFundingProfile, type RefreshTarget } from "@/lib/cip/employer-financials";
import { normOrg } from "@/lib/cip/employer-resolution";
import { loadLatestIntake } from "@/lib/cip/profile";
import { scoreEmployer } from "@/lib/cip/watched-employers";
import { propagateStrategicStateAfterChange } from "@/lib/cip/weekly-strategy";
import { isSameOriginRequest } from "@/lib/security";
import { createServer } from "@/lib/supabase/server";

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOriginRequest(request)) {
    return html('<p class="text-sm text-red-700">Invalid request origin.</p>', 403);
  }

  const supabase = createServer(cookies);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return html('<p class="text-sm text-red-700">Sign in before promoting employers.</p>', 401);
  }

  const form = await request.formData();
  const candidateIds = form.getAll("candidate_ids").map(String);
  if (candidateIds.length === 0) {
    return html('<p class="text-sm text-red-700">Select at least one candidate.</p>', 400);
  }

  const intake = await loadLatestIntake(supabase, user.id);
  if (!intake) {
    return html('<p class="text-sm text-red-700">Save an intake before promoting employers.</p>', 400);
  }

  const { data: candidates, error } = await supabase
    .from("employer_candidates")
    .select("*")
    .eq("user_id", user.id)
    .in("id", candidateIds);

  if (error || !candidates) {
    return html(`<p class="text-sm text-red-700">${escapeHtml(error?.message ?? "Unable to load candidates.")}</p>`, 500);
  }

  let promoted = 0;
  const promotedTargets: RefreshTarget[] = [];
  for (const candidate of candidates) {
    const scored = scoreEmployer(candidate, intake);
    const { error: watchError } = await supabase.from("watched_employers").upsert(
      {
        user_id: user.id,
        name: candidate.name,
        region: candidate.region,
        category: candidate.category,
        location: candidate.location,
        estimated_size: candidate.estimated_size,
        priority: candidate.priority,
        fit_score: scored.fit_score,
        fit_summary: scored.fit_summary,
        target_roles: candidate.target_roles,
        source_url: candidate.source_url,
        careers_url: candidate.careers_url,
        adapter_status: candidate.adapter_status,
        confidence: candidate.confidence,
        source_notes: candidate.source_notes,
        last_reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,name,region" },
    );

    if (!watchError) {
      promoted += 1;
      promotedTargets.push({
        name: candidate.name,
        location: candidate.location,
        region: candidate.region,
        ein: typeof candidate.ein === "number" ? candidate.ein : candidate.ein ? Number(candidate.ein) || null : null,
        einSource: "candidate",
      });
      await supabase
        .from("employer_candidates")
        .update({ review_state: "promoted", updated_at: new Date().toISOString() })
        .eq("id", candidate.id)
        .eq("user_id", user.id);
    }
  }

  // IRS 990 filings for what was just promoted: a deterministic lookup (free public API, name + state
  // only), bounded per click. Anything over the cap, or not found, is picked up by the "look up
  // financials" buttons on the Employers page. A failure here never blocks the promotion itself.
  let financials = { looked: 0, found: 0, notFound: 0, deferred: 0, problem: "" };
  if (promotedTargets.length) {
    const { profiles } = await loadFundingProfiles(supabase, user.id);
    const batch = promotedTargets.slice(0, BULK_REFRESH_CAP);
    financials.deferred = promotedTargets.length - batch.length;
    for (const [index, target] of batch.entries()) {
      if (index > 0) await sleep(700);
      const outcome = await refreshFundingProfile(supabase, user.id, target, profiles.get(normOrg(target.name)) ?? null, { sleep });
      financials.looked += 1;
      if (outcome.profile.status === "ok") financials.found += 1;
      else financials.notFound += 1;
      if (outcome.error && !financials.problem) financials.problem = outcome.error;
    }
  }

  const propagation = promoted
    ? await propagateStrategicStateAfterChange(supabase, user.id)
    : null;

  return html(`
    <div class="rounded-md border border-[var(--line)] bg-[var(--background)] p-4">
      <p class="text-sm font-semibold text-[var(--accent-strong)]">${promoted} employer candidates promoted to watched employers.</p>
      <p class="mt-2 text-sm text-[var(--muted)]">
        Refresh this page to see the updated watched list.
        ${propagation?.ok ? "The strategic snapshot was refreshed too." : propagation ? `Automatic propagation needs a manual briefing refresh: ${escapeHtml(propagation.errorMessage)}` : ""}
      </p>
      ${financials.looked ? `<p class="mt-2 text-sm text-[var(--muted)]">IRS 990 filings: ${financials.found} found, ${financials.notFound} not found or unconfirmed (that means unknown, not poor funding).${financials.deferred ? ` ${financials.deferred} more can be looked up with the financials buttons below.` : ""}${financials.problem ? ` ${escapeHtml(financials.problem)}` : ""}</p>` : ""}
    </div>
  `);
};

const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

function html(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
