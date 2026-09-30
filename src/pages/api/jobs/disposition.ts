import type { APIRoute } from "astro";
import { loadJobSearchConfig } from "@/lib/cip/job-search-config";
import { readJobSearchEnv } from "@/lib/cip/server-env";
import { loadDueState, loadLatestRunView } from "@/lib/cip/job-search-run";
import { buildPostingAnnotations } from "@/lib/cip/opportunity-recommendations";
import { clearDisposition, isDispositionStatus, setDisposition } from "@/lib/cip/posting-dispositions";
import { renderJobSearchPanel, renderPanelError } from "@/lib/cip/job-search-view";
import { checkRateLimit, clientRateLimitKey } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/security";
import { createServer } from "@/lib/supabase/server";

// Sets (or clears) the user's own status on a posting — their override of the app's recommendation
// chip and the action-tracking state — then re-renders the panel. Deterministic; no provider call.
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOriginRequest(request)) return html("<p>Invalid request origin.</p>", 403);

  const supabase = createServer(cookies);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return html(renderPanelError("Sign in to update a posting."), 401);

  const limit = checkRateLimit({
    key: clientRateLimitKey(request, `job-search-disposition:user:${user.id}`),
    limit: 120,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) return html(renderPanelError("Too many updates. Wait a little before trying again."), 429);

  const form = await request.formData();
  const sourceUrl = String(form.get("source_url") ?? "").trim();
  const employer = String(form.get("employer") ?? "").trim().slice(0, 300);
  const requisitionId = String(form.get("requisition_id") ?? "").trim().slice(0, 120) || null;
  const status = String(form.get("status") ?? "").trim();

  if (!isHttpUrl(sourceUrl)) return html(renderPanelError("That posting link is not valid."), 400);
  if (status !== "clear" && !isDispositionStatus(status)) return html(renderPanelError("That status is not recognized."), 400);

  const config = loadJobSearchConfig(readJobSearchEnv);
  try {
    const posting = { source_url: sourceUrl, employer_text: employer, requisition_id: requisitionId };
    if (status === "clear") await clearDisposition(supabase, user.id, posting);
    else await setDisposition(supabase, user.id, posting, status, "");

    const view = await loadLatestRunView(supabase, user.id);
    if (!view) return html(renderPanelError("No search to update."), 404);
    const due = await loadDueState(supabase, user.id, config, new Date().toISOString());
    const annotations = await buildPostingAnnotations(supabase, user.id, view);
    return html(renderJobSearchPanel(view, { runKey: crypto.randomUUID(), due, configured: config.configured }, annotations));
  } catch (error) {
    return html(renderPanelError(error instanceof Error ? error.message : "Could not update the posting."));
  }
};

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function html(body: string, status = 200) {
  return new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
