import type { APIRoute } from "astro";
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
    return html('<p class="text-sm text-red-700">Sign in before clearing candidates.</p>', 401);
  }

  const form = await request.formData();
  const mode = String(form.get("mode") ?? "selected");
  const candidateIds = form.getAll("candidate_ids").map(String).filter(Boolean);

  if (mode === "selected" && candidateIds.length === 0) {
    return html('<p class="text-sm text-red-700">Select at least one candidate to clear.</p>', 400);
  }

  const { error, count } =
    mode === "all_unpromoted"
      ? await supabase
          .from("employer_candidates")
          .delete()
          .eq("user_id", user.id)
          .neq("review_state", "promoted")
          .select("id", { count: "exact" })
      : await supabase
          .from("employer_candidates")
          .delete()
          .eq("user_id", user.id)
          .in("id", candidateIds)
          .select("id", { count: "exact" });

  if (error) {
    return html(`<p class="text-sm text-red-700">${escapeHtml(error.message)}</p>`, 500);
  }

  return html(`
    <div class="rounded-md border border-[var(--line)] bg-[var(--background)] p-4">
      <p class="text-sm font-semibold text-[var(--accent-strong)]">${count ?? 0} candidate${count === 1 ? "" : "s"} cleared from the queue.</p>
      <p class="mt-2 text-sm text-[var(--muted)]">Refresh this page to see the updated candidate queue.</p>
    </div>
  `, 200, { "HX-Refresh": "true" });
};

function html(body: string, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", ...extraHeaders },
  });
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
