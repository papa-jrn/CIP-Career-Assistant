import type { APIRoute } from "astro";
import { loadJobSearchConfig } from "@/lib/cip/job-search-config";
import { readJobSearchEnv } from "@/lib/cip/server-env";
import { loadDueState, loadLatestRunView } from "@/lib/cip/job-search-run";
import { buildPostingAnnotations } from "@/lib/cip/opportunity-recommendations";
import { clearEmployerAlias, setEmployerAlias } from "@/lib/cip/employer-resolution";
import { renderJobSearchPanel, renderPanelError } from "@/lib/cip/job-search-view";
import { checkRateLimit, clientRateLimitKey } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/security";
import { createServer } from "@/lib/supabase/server";

// Saves (or clears) the user's correction mapping a posting's free-text employer to one of their
// watched employers, then re-renders the panel. Deterministic; no provider call.
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOriginRequest(request)) return html("<p>Invalid request origin.</p>", 403);

  const supabase = createServer(cookies);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return html(renderPanelError("Sign in to correct an employer."), 401);

  const limit = checkRateLimit({
    key: clientRateLimitKey(request, `job-search-employer-alias:user:${user.id}`),
    limit: 120,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) return html(renderPanelError("Too many updates. Wait a little before trying again."), 429);

  const form = await request.formData();
  const observed = String(form.get("observed") ?? "").trim().slice(0, 300);
  const canonical = String(form.get("canonical") ?? "").trim().slice(0, 300);
  const clear = String(form.get("clear") ?? "").trim() === "1";

  if (!observed) return html(renderPanelError("That employer could not be identified."), 400);

  const config = loadJobSearchConfig(readJobSearchEnv);
  try {
    if (clear) await clearEmployerAlias(supabase, user.id, observed);
    else await setEmployerAlias(supabase, user.id, observed, canonical);

    const view = await loadLatestRunView(supabase, user.id);
    if (!view) return html(renderPanelError("No search to update."), 404);
    const due = await loadDueState(supabase, user.id, config, new Date().toISOString());
    const annotations = await buildPostingAnnotations(supabase, user.id, view);
    return html(renderJobSearchPanel(view, { runKey: crypto.randomUUID(), due, configured: config.configured }, annotations));
  } catch (error) {
    return html(renderPanelError(error instanceof Error ? error.message : "Could not save the employer."));
  }
};

function html(body: string, status = 200) {
  return new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
