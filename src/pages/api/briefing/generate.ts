import type { APIRoute } from "astro";
import { buildWeeklyStrategySnapshot } from "@/lib/cip/weekly-strategy";
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
    return html('<p class="text-sm text-red-700">Sign in before generating a briefing.</p>', 401);
  }

  const result = await buildWeeklyStrategySnapshot(supabase, user.id);
  if (result.error) {
    return html(`<p class="text-sm text-red-700">${result.error.message}</p>`, 500);
  }

  return html(`
    <div class="rounded-md border border-[var(--line)] bg-[var(--background)] p-4">
      <p class="text-sm font-semibold text-[var(--accent-strong)]">Weekly strategy snapshot generated.</p>
      <p class="mt-2 text-sm leading-6 text-[var(--muted)]">${escapeHtml(result.summary)}</p>
      <p class="mt-3 text-sm text-[var(--muted)]">Refresh this page to view the saved briefing.</p>
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
