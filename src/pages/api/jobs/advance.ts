import type { APIRoute } from "astro";
import { loadJobSearchConfig } from "@/lib/cip/job-search-config";
import { readJobSearchEnv } from "@/lib/cip/server-env";
import { createOpenAiProvider } from "@/lib/cip/job-search-engine";
import { advanceJobSearchRun, loadDueState } from "@/lib/cip/job-search-run";
import { renderJobSearchPanel, renderPanelError } from "@/lib/cip/job-search-view";
import { checkRateLimit, clientRateLimitKey } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/security";
import { createServer } from "@/lib/supabase/server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Runs ONE step of a run (one bounded provider call plus verification) and returns the updated
// panel. The panel calls this again on load until the run finishes, so no single request has to
// outlive a serverless time limit.
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOriginRequest(request)) return html("<p>Invalid request origin.</p>", 403);

  const supabase = createServer(cookies);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return html(renderPanelError("Sign in to continue the search."), 401);

  const limit = checkRateLimit({
    key: clientRateLimitKey(request, `job-search-advance:user:${user.id}`),
    limit: 60,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.allowed) return html(renderPanelError("Too many requests. Wait a little before continuing."), 429);

  const runId = String((await request.formData()).get("run_id") ?? "");
  if (!UUID_PATTERN.test(runId)) return html(renderPanelError("That search could not be found."), 400);

  const config = loadJobSearchConfig(readJobSearchEnv);
  const apiKey = readJobSearchEnv("OPENAI_API_KEY");
  if (!apiKey) return html(renderPanelError("The search provider is not configured."), 503);

  try {
    const view = await advanceJobSearchRun(supabase, user.id, runId, {
      config,
      provider: createOpenAiProvider(apiKey),
    });
    if (!view) return html(renderPanelError("That search could not be found."), 404);
    const due = await loadDueState(supabase, user.id, config, new Date().toISOString());
    return html(renderJobSearchPanel(view, { runKey: crypto.randomUUID(), due, configured: config.configured }));
  } catch (error) {
    return html(renderPanelError(error instanceof Error ? error.message : "The search step failed."));
  }
};

function html(body: string, status = 200) {
  return new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
