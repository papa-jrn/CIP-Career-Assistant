import type { APIRoute } from "astro";
import { loadLatestIntake } from "@/lib/cip/profile";
import { seedWatchedEmployers } from "@/lib/cip/watched-employers";
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
    return html('<p class="text-sm text-red-700">Sign in before building watched employers.</p>', 401);
  }

  const form = await request.formData();
  const regions = form.getAll("regions").map(String);
  if (regions.length === 0) {
    return html('<p class="text-sm text-red-700">Choose at least one geography.</p>', 400);
  }

  const intake = await loadLatestIntake(supabase, user.id);
  if (!intake) {
    return html('<p class="text-sm text-red-700">Save an intake before scoring employers.</p>', 400);
  }

  const result = await seedWatchedEmployers(supabase, user.id, intake, regions);

  return html(`
    <div class="rounded-md border border-[var(--line)] bg-[var(--background)] p-4">
      <p class="text-sm font-semibold text-[var(--accent-strong)]">Watched employer map updated.</p>
      <p class="mt-2 text-sm text-[var(--muted)]">${result.saved} employers saved from ${result.considered} candidates. Refresh this page to review scores and next actions.</p>
    </div>
  `);
};

function html(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
