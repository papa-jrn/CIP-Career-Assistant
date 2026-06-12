import type { APIRoute } from "astro";
import { loadResumeAssetContext } from "@/lib/cip/resume-asset-context";
import { buildAiMasterResumeDraft, isAiResumeDraftAvailable } from "@/lib/cip/resume-assets";
import { isSameOriginRequest } from "@/lib/security";
import { createServer } from "@/lib/supabase/server";

// Generates the AI master resume draft on demand so the Assets page never
// blocks its render on an OpenAI call. The result is saved as an additive
// `resume_draft` record; the page reuses the newest saved draft on reload.
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOriginRequest(request)) {
    return json({ ok: false, error: "Invalid request origin." }, 403);
  }

  if (!import.meta.env.PUBLIC_SUPABASE_URL || !import.meta.env.PUBLIC_SUPABASE_ANON_KEY) {
    return json({ ok: false, error: "Supabase is not configured, so drafts cannot be generated or saved." }, 503);
  }

  try {
    const supabase = createServer(cookies);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return json({ ok: false, error: "Sign in before generating a resume draft." }, 401);
    }

    const { context } = await loadResumeAssetContext(supabase, user.id);

    if (!isAiResumeDraftAvailable(context)) {
      return json(
        {
          ok: false,
          error: context.intake.resume_text
            ? "OPENAI_API_KEY is not configured, so AI resume synthesis is unavailable."
            : "No saved resume text found. Save intake with resume text before generating a draft.",
        },
        400,
      );
    }

    const draft = await buildAiMasterResumeDraft(context);
    if (!draft) {
      return json({ ok: false, error: "AI resume synthesis failed. Try again, or check the OpenAI configuration." }, 502);
    }

    const savedAt = new Date().toISOString();
    const { error } = await supabase.from("career_sources").insert({
      user_id: user.id,
      source_type: "resume_draft",
      title: `Master resume draft: ${draft.targetTitle || "target role"}`.slice(0, 120),
      extracted_text: JSON.stringify({ draft, saved_at: savedAt }),
      trust_state: "system_generated",
    });

    if (error) {
      // The draft is still usable in the editor even if persistence failed.
      return json({ ok: true, draft, savedAt: null, saveError: error.message });
    }

    return json({ ok: true, draft, savedAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error while generating the draft.";
    return json({ ok: false, error: message }, 500);
  }
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
