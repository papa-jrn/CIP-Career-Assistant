import type { APIRoute } from "astro";
import {
  parseEvidenceResponse,
  parseStoredEvidenceResponse,
  renderSavedEvidenceHtml,
} from "@/lib/cip/evidence-builder";
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

    // The confirmation goes to the form's own target; the saved-evidence list is
    // swapped out of band so the new answer is visible immediately. Before this,
    // the panel still read "No evidence answers saved yet" until a reload, which
    // made a successful save look like a failed one.
    const savedList = await renderSavedEvidence(supabase, user.id);

    return html(`
      <p class="rounded-md border border-[var(--line)] bg-[var(--accent-soft)] px-3 py-2 text-sm font-semibold text-[var(--accent-strong)]">
        Evidence saved. This answer was added as a new source record.
      </p>
      ${savedList}
    `);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected save error.";
    return html(`<p class="text-sm font-semibold text-red-700">Evidence save failed: ${escapeHtml(message)}</p>`, 500);
  }
};

/**
 * The refreshed "Recently saved evidence" list, as an out-of-band swap.
 *
 * Reads the same rows, in the same order and limit, as the page's own query, so
 * the swapped list matches a reload. A read failure returns no fragment at all:
 * the save already succeeded, and replacing the panel with an error would say
 * the wrong thing about it.
 */
async function renderSavedEvidence(
  supabase: ReturnType<typeof createServer>,
  userId: string,
): Promise<string> {
  try {
    const { data, error } = await supabase
      .from("career_sources")
      .select("extracted_text, created_at")
      .eq("user_id", userId)
      .eq("source_type", "evidence_response")
      .order("created_at", { ascending: false })
      .limit(40);
    if (error) return "";

    const responses = ((data ?? []) as Array<{ extracted_text: string | null }>)
      .map((row) => parseStoredEvidenceResponse(row.extracted_text))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    return `<div id="saved-evidence-list" aria-live="polite" hx-swap-oob="true">${renderSavedEvidenceHtml(responses)}</div>`;
  } catch {
    return "";
  }
}

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
