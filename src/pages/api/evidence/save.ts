import type { APIRoute } from "astro";
import { parseEvidenceResponse } from "@/lib/cip/evidence-builder";
import { isSameOriginRequest } from "@/lib/security";
import { createServer } from "@/lib/supabase/server";

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOriginRequest(request)) {
    return html('<p class="text-sm text-red-700">Invalid request origin.</p>', 403);
  }

  const response = parseEvidenceResponse(await request.formData());
  if (response.answer.length < 12) {
    return html('<p class="text-sm font-semibold text-red-700">Add a little more detail before saving this evidence.</p>', 400);
  }

  if (
    !import.meta.env.PUBLIC_SUPABASE_URL ||
    !import.meta.env.PUBLIC_SUPABASE_ANON_KEY
  ) {
    return html('<p class="text-sm font-semibold text-[var(--muted)]">Evidence captured locally, but Supabase is not configured.</p>');
  }

  try {
    const supabase = createServer(cookies);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return html('<p class="text-sm font-semibold text-red-700">Sign in before saving evidence.</p>', 401);
    }

    const { error } = await supabase.from("career_sources").insert({
      user_id: user.id,
      source_type: "evidence_response",
      title: response.question.slice(0, 120),
      url: response.proofUrl || null,
      extracted_text: JSON.stringify({ response, saved_at: new Date().toISOString() }),
      trust_state: response.confidence === "known" ? "user_submitted" : "needs_verification",
    });

    if (error) {
      return html(`<p class="text-sm font-semibold text-red-700">Evidence save failed: ${escapeHtml(error.message)}</p>`, 500);
    }

    return html(`
      <p class="rounded-md border border-[var(--line)] bg-[var(--accent-soft)] px-3 py-2 text-sm font-semibold text-[var(--accent-strong)]">
        Evidence saved. This answer was added as a new source record.
      </p>
    `);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected save error.";
    return html(`<p class="text-sm font-semibold text-red-700">Evidence save failed: ${escapeHtml(message)}</p>`, 500);
  }
};

function html(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
