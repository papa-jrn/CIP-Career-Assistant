import type { APIRoute } from "astro";
import { ingestConfiguredSources, refreshOpportunityMatches } from "@/lib/cip/labor-market";
import type { IntakeForm } from "@/lib/cip/intake";
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
    return html('<p class="text-sm text-red-700">Sign in before running labor-market research.</p>', 401);
  }

  const intake = await loadLatestIntake(supabase, user.id);
  if (!intake) {
    return html('<p class="text-sm text-red-700">Save an intake before running labor-market research.</p>', 400);
  }

  const summaries = await ingestConfiguredSources(supabase, intake);
  const matches = await refreshOpportunityMatches(supabase, user.id, intake);

  return html(renderSummary(summaries, matches.saved));
};

async function loadLatestIntake(
  supabase: ReturnType<typeof createServer>,
  userId: string,
): Promise<Partial<IntakeForm> | null> {
  const { data } = await supabase
    .from("career_sources")
    .select("extracted_text")
    .eq("user_id", userId)
    .eq("source_type", "resume_intake")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.extracted_text) return null;
  try {
    const parsed = JSON.parse(data.extracted_text);
    return parsed?.intake ?? null;
  } catch {
    return null;
  }
}

function renderSummary(
  summaries: Awaited<ReturnType<typeof ingestConfiguredSources>>,
  matchCount: number,
) {
  if (summaries.length === 0) {
    return `
      <div class="rounded-md border border-[var(--line)] bg-[var(--background)] p-4 text-sm text-[var(--muted)]">
        Add LABOR_MARKET_GREENHOUSE_BOARDS or LABOR_MARKET_LEVER_COMPANIES to .env, restart the dev server, then run research again.
      </div>
    `;
  }

  return `
    <div class="rounded-md border border-[var(--line)] bg-[var(--background)] p-4">
      <p class="text-sm font-semibold text-[var(--accent-strong)]">Labor-market research complete. ${matchCount} profile matches refreshed.</p>
      <ul class="mt-3 space-y-2 text-sm text-[var(--muted)]">
        ${summaries.map((summary) => `<li>${summary.provider}/${summary.slug}: ${summary.found} found, ${summary.saved} saved${summary.error ? ` - ${summary.error}` : ""}</li>`).join("")}
      </ul>
      <p class="mt-3 text-sm text-[var(--muted)]">Refresh this page to see the newest ranked opportunities.</p>
    </div>
  `;
}

function html(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
