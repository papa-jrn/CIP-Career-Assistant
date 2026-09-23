import type { APIRoute } from "astro";
import { loadJobSearchConfig } from "@/lib/cip/job-search-config";
import { readJobSearchEnv } from "@/lib/cip/server-env";
import { loadDueState, loadRunView, startJobSearchRun } from "@/lib/cip/job-search-run";
import { renderJobSearchPanel, renderPanelError } from "@/lib/cip/job-search-view";
import { checkRateLimit, clientRateLimitKey } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/security";
import { createServer } from "@/lib/supabase/server";

const RUN_KEY_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;

// Starts (or re-shows) a weekly search run: builds the brief and plan, saves the run, and returns
// the panel. The panel then advances the run one bounded step at a time via /api/jobs/advance.
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOriginRequest(request)) return html("<p>Invalid request origin.</p>", 403);

  const supabase = createServer(cookies);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return html(renderPanelError("Sign in before running a search."), 401);

  const limit = checkRateLimit({
    key: clientRateLimitKey(request, `job-search-start:user:${user.id}`),
    limit: 10,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) return html(renderPanelError("Too many search requests. Wait a little before trying again."), 429);

  const form = await request.formData();
  const runKey = String(form.get("run_key") ?? "");
  if (!RUN_KEY_PATTERN.test(runKey)) return html(renderPanelError("This page is out of date. Reload it and try again."), 400);

  const config = loadJobSearchConfig(readJobSearchEnv);
  try {
    const outcome = await startJobSearchRun(supabase, user.id, runKey, { config });
    const view = await loadRunView(supabase, user.id, outcome.runId);
    const due = await loadDueState(supabase, user.id, config, new Date().toISOString());
    return html(renderJobSearchPanel(view, { runKey: crypto.randomUUID(), due, configured: config.configured }));
  } catch (error) {
    return html(renderPanelError(error instanceof Error ? error.message : "Could not start the search."));
  }
};

function html(body: string, status = 200) {
  return new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
