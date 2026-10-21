import type { APIRoute } from "astro";
import { z } from "zod";
import {
  FOLLOW_UP_RESOLUTION_SOURCE_TYPE,
  followUpResolutionPayload,
} from "@/lib/cip/follow-up-resolutions";
import { escapeHtml } from "@/lib/cip/job-search-view";
import { isSameOriginRequest } from "@/lib/security";
import { createServer } from "@/lib/supabase/server";

const html = (message: string, status = 200) =>
  new Response(`<p role="status">${escapeHtml(message)}</p>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });

const resolutionInput = z.object({
  key: z.string().trim().min(1, "The follow-up to close was not identified.").max(400),
  state: z.enum(["met", "dropped", "open"]),
  note: z.string().trim().max(300).optional(),
  returnTo: z.string().trim().optional(),
});

/**
 * Close out a follow-up the user promised someone, or reopen it.
 *
 * The conversation is untouched: it stays as evidence and keeps scoring lanes
 * and employers. Only the debt is closed. Recorded as its own additive record
 * so reopening is possible and the history of what was promised survives.
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
    if (!user) return html("Sign in before closing a follow-up.", 401);

    const body = await request.text();
    if (body.length > 4000) return html("That request is too large.", 413);
    const parsed = resolutionInput.safeParse(Object.fromEntries(new URLSearchParams(body)));
    if (!parsed.success) return html(parsed.error.issues[0]?.message ?? "Check the request.", 400);
    const input = parsed.data;

    // An obligation is derived from the user's own conversations rather than
    // stored as a row, so there is no target row to verify ownership against.
    // The record is written under this user's id and only ever read back for
    // them, so one user's resolution cannot reach another's obligations.
    const { error } = await db.from("career_sources").insert({
      user_id: user.id,
      source_type: FOLLOW_UP_RESOLUTION_SOURCE_TYPE,
      title:
        input.state === "met"
          ? "Follow-up completed"
          : input.state === "dropped"
            ? "Follow-up no longer needed"
            : "Follow-up reopened",
      url: null,
      extracted_text: JSON.stringify(
        followUpResolutionPayload({
          key: input.key,
          state: input.state,
          note: input.note || undefined,
          recordedAt: new Date().toISOString(),
        }),
      ),
      trust_state: "user_supplied",
    });
    if (error) return html("Could not save that change. Nothing was altered; please retry.", 500);

    // Only ever redirect within this app; a submitted path is untrusted input.
    const path = input.returnTo && /^\/[A-Za-z0-9/_\-?=&#.]*$/.test(input.returnTo) ? input.returnTo : "/follow-up";
    const destination = `${path}${path.includes("?") ? "&" : "?"}followup=${input.state}`;
    return request.headers.get("HX-Request") === "true"
      ? new Response(null, { status: 200, headers: { "HX-Redirect": destination } })
      : new Response(null, { status: 303, headers: { Location: destination } });
  } catch {
    return html("Could not save that change. Nothing was altered; please retry.", 500);
  }
};
