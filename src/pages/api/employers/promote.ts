import type { APIRoute } from "astro";
import { loadLatestIntake } from "@/lib/cip/profile";
import { scoreEmployer } from "@/lib/cip/watched-employers";
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
      await supabase
        .from("employer_candidates")
        .update({ review_state: "promoted", updated_at: new Date().toISOString() })
        .eq("id", candidate.id)
        .eq("user_id", user.id);
    }
  }

  return html(`
    <div class="rounded-md border border-[var(--line)] bg-[var(--background)] p-4">
      <p class="text-sm font-semibold text-[var(--accent-strong)]">${promoted} employer candidates promoted to watched employers.</p>
      <p class="mt-2 text-sm text-[var(--muted)]">Refresh this page to see the updated watched list.</p>
    </div>
  `);
};

function html(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
