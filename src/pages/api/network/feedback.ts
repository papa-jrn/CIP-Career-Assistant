import type { APIRoute } from "astro";
import { isSameOriginRequest } from "@/lib/security";
import { createServer } from "@/lib/supabase/server";

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOriginRequest(request)) {
    return html('<p class="text-sm text-red-700">Invalid request origin.</p>', 403);
  }

  if (
    !import.meta.env.PUBLIC_SUPABASE_URL ||
    !import.meta.env.PUBLIC_SUPABASE_ANON_KEY
  ) {
    return html('<p class="text-sm font-semibold text-red-700">Supabase is not configured, so feedback cannot be saved.</p>', 500);
  }

  const form = await request.formData();
  const contactName = getText(form, "contact_name");
  const feedbackType = getText(form, "feedback_type") || "remove";
  const note = getText(form, "feedback_note");
  const conversationStatus = getText(form, "conversation_status");
  const followUpDate = getText(form, "follow_up_date");
  const followUpIntent = getText(form, "follow_up_intent");
  const decisionReason = getText(form, "decision_reason");
  const marketSignals = getText(form, "market_signals");
  const newLeads = getText(form, "new_leads");
  const laneImpact = getText(form, "lane_impact");

  if (!contactName) {
    return html('<p class="text-sm font-semibold text-red-700">Missing contact name.</p>', 400);
  }

  try {
    const supabase = createServer(cookies);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return html('<p class="text-sm font-semibold text-red-700">Sign in before saving network feedback.</p>', 401);
    }

    const { error } = await supabase.from("career_sources").insert({
      user_id: user.id,
      source_type: "network_feedback",
      title: `Network feedback: ${contactName}`,
      url: null,
      extracted_text: JSON.stringify({
        feedback: {
          contactName,
          feedbackType,
          note,
          conversationStatus,
          followUpDate,
          followUpIntent,
          decisionReason,
          marketSignals,
          newLeads,
          laneImpact,
        },
        created_at: new Date().toISOString(),
      }),
      trust_state: "user_supplied",
    });

    if (error) {
      return html(`<p class="text-sm font-semibold text-red-700">Could not save feedback: ${escapeHtml(error.message)}</p>`, 500);
    }

    return html(`
      <div class="rounded-md border border-[var(--line)] bg-[var(--accent-soft)] p-3">
        <p class="text-sm font-semibold text-[var(--accent-strong)]">Saved follow-up context for ${escapeHtml(contactName)}.</p>
        <p class="mt-1 text-sm leading-6 text-[var(--muted)]">Future network analyses will use this relationship context.</p>
      </div>
    `);
  } catch (error) {
    return html(
      `<p class="text-sm font-semibold text-red-700">Network feedback failed: ${escapeHtml(error instanceof Error ? error.message : "Unexpected error.")}</p>`,
      500,
    );
  }
};

function getText(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
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
