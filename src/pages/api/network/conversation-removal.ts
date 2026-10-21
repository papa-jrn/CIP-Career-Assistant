import type { APIRoute } from "astro";
import { z } from "zod";
import {
  CONVERSATION_REMOVAL_SOURCE_TYPE,
  conversationRemovalPayload,
} from "@/lib/cip/conversation-removals";
import { escapeHtml } from "@/lib/cip/job-search-view";
import { isSameOriginRequest } from "@/lib/security";
import { createServer } from "@/lib/supabase/server";

const html = (message: string, status = 200) =>
  new Response(`<p role="status">${escapeHtml(message)}</p>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });

const removalInput = z.object({
  targetId: z.string().trim().min(1, "The conversation to remove was not identified."),
  removed: z.enum(["true", "false"]).default("true"),
  reason: z.string().trim().max(300).optional(),
  returnTo: z.string().trim().optional(),
});

/**
 * Stop a saved conversation counting, or put it back.
 *
 * The conversation is not deleted. Removal is recorded as its own additive
 * record, so the original stays auditable and removing the wrong half of a
 * duplicate pair is undoable. The UI says so rather than implying erasure.
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOriginRequest(request)) return html("Invalid request origin.", 403);
  if (!import.meta.env.PUBLIC_SUPABASE_URL || !import.meta.env.PUBLIC_SUPABASE_ANON_KEY) {
    return html("Storage is not configured. Nothing was changed.", 503);
  }

  try {
    const db = createServer(cookies);
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user) return html("Sign in before removing a conversation.", 401);

    const body = await request.text();
    if (body.length > 4000) return html("That request is too large.", 413);
    const parsed = removalInput.safeParse(Object.fromEntries(new URLSearchParams(body)));
    if (!parsed.success) return html(parsed.error.issues[0]?.message ?? "Check the request.", 400);
    const input = parsed.data;

    // The conversation must be one of this user's own saved records. RLS also
    // enforces this; the explicit check turns someone else's row into a plain
    // "not found" rather than a stored record pointing nowhere.
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
      source_type: CONVERSATION_REMOVAL_SOURCE_TYPE,
      title: input.removed === "true" ? "Conversation removed" : "Conversation restored",
      url: null,
      extracted_text: JSON.stringify(
        conversationRemovalPayload({
          targetId: input.targetId,
          removed: input.removed === "true",
          reason: input.reason || undefined,
          recordedAt: new Date().toISOString(),
        }),
      ),
      trust_state: "user_supplied",
    });
    if (error) return html("Could not save that change. Nothing was altered; please retry.", 500);

    // Only ever redirect within this app; a submitted path is untrusted input.
    const path = input.returnTo && /^\/[A-Za-z0-9/_\-?=&#.]*$/.test(input.returnTo) ? input.returnTo : "/network";
    const flag = input.removed === "true" ? "removed" : "restored";
    const destination = `${path}${path.includes("?") ? "&" : "?"}conversation=${flag}`;
    return request.headers.get("HX-Request") === "true"
      ? new Response(null, { status: 200, headers: { "HX-Redirect": destination } })
      : new Response(null, { status: 303, headers: { Location: destination } });
  } catch {
    return html("Could not save that change. Nothing was altered; please retry.", 500);
  }
};
