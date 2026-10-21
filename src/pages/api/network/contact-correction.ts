import type { APIRoute } from "astro";
import { z } from "zod";
import {
  CONTACT_CORRECTION_SOURCE_TYPE,
  contactCorrectionPayload,
} from "@/lib/cip/conversation-corrections";
import { escapeHtml } from "@/lib/cip/job-search-view";
import { isSameOriginRequest } from "@/lib/security";
import { createServer } from "@/lib/supabase/server";

const html = (message: string, status = 200) =>
  new Response(`<p role="status">${escapeHtml(message)}</p>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });

const correctionInput = z.object({
  targetId: z.string().trim().min(1, "The conversation to correct was not identified."),
  contactName: z
    .string()
    .trim()
    .min(1, "Enter who this conversation was with.")
    .max(80, "That name is too long."),
  contactOrganization: z.string().trim().max(120).optional(),
  contactTitle: z.string().trim().max(120).optional(),
  returnTo: z.string().trim().optional(),
});

/**
 * Record who a saved conversation was actually with.
 *
 * Extraction is not reliable at naming the person, and a wrong or missing name
 * orphans the conversation from that contact's follow-up card. The correction is
 * stored as its own record rather than overwriting the conversation, so the
 * original extraction stays visible and corrections remain an audit trail.
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOriginRequest(request)) return html("Invalid request origin.", 403);
  if (!import.meta.env.PUBLIC_SUPABASE_URL || !import.meta.env.PUBLIC_SUPABASE_ANON_KEY) {
    return html("Storage is not configured. Nothing was saved.", 503);
  }

  try {
    const db = createServer(cookies);
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user) return html("Sign in before correcting a conversation.", 401);

    const body = await request.text();
    if (body.length > 4000) return html("That correction is too large.", 413);
    const parsed = correctionInput.safeParse(Object.fromEntries(new URLSearchParams(body)));
    if (!parsed.success) return html(parsed.error.issues[0]?.message ?? "Check the name you entered.", 400);
    const input = parsed.data;

    // The conversation must be one of this user's own saved records. RLS also
    // enforces this; the explicit check turns someone else's row into a plain
    // "not found" rather than a silently stored correction pointing nowhere.
    const { data: target } = await db
      .from("career_sources")
      .select("id")
      .eq("user_id", user.id)
      .eq("source_type", "conversation_outcome")
      .eq("id", input.targetId)
      .maybeSingle();
    if (!target) return html("That conversation was not found in your records.", 404);

    const { error } = await db.from("career_sources").insert({
      user_id: user.id,
      source_type: CONTACT_CORRECTION_SOURCE_TYPE,
      title: `Contact correction: ${input.contactName}`,
      url: null,
      extracted_text: JSON.stringify(
        contactCorrectionPayload({
          targetId: input.targetId,
          contactName: input.contactName,
          contactOrganization: input.contactOrganization || undefined,
          contactTitle: input.contactTitle || undefined,
          correctedAt: new Date().toISOString(),
        }),
      ),
      trust_state: "user_supplied",
    });
    if (error) return html("Could not save that correction. Your entry is still here; please retry.", 500);

    // Only ever redirect within this app; a submitted path is untrusted input.
    const path = input.returnTo && /^\/[A-Za-z0-9/_\-?=&#.]*$/.test(input.returnTo) ? input.returnTo : "/network";
    const target_path = `${path}${path.includes("?") ? "&" : "?"}corrected=contact`;
    return request.headers.get("HX-Request") === "true"
      ? new Response(null, { status: 200, headers: { "HX-Redirect": target_path } })
      : new Response(null, { status: 303, headers: { Location: target_path } });
  } catch {
    return html("Could not save that correction. Your entry is still here; please retry.", 500);
  }
};
