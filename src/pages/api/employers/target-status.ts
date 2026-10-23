import type { APIRoute } from "astro";
import { z } from "zod";
import { normOrg } from "@/lib/cip/employer-resolution";
import { TARGET_STATUSES } from "@/lib/cip/employer-target-events";
import { escapeHtml } from "@/lib/cip/job-search-view";
import { isSameOriginRequest } from "@/lib/security";
import { createServer } from "@/lib/supabase/server";

const html = (message: string, status = 200) =>
  new Response(`<p role="status">${escapeHtml(message)}</p>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });

const statusInput = z.object({
  employerName: z.string().trim().min(1, "The employer was not identified.").max(200),
  status: z.enum(TARGET_STATUSES as [string, ...string[]]),
  parentOrganization: z.string().trim().max(200).optional(),
  note: z.string().trim().max(300).optional(),
  returnTo: z.string().trim().optional(),
});

/**
 * Record what the user has decided about an employer (Rethink §14, slice 2).
 *
 * Append-only: a decision never overwrites the last one, so the page can show
 * what changed and "not interested" can be reversed without erasing the fact
 * that it was once decided. The parent organisation is stored when discovery
 * knew one, which is what lets excluding a parent suppress its members.
 *
 * This does not touch the job search's employer exclusions. §14 leaves that as
 * a separate, explicit preference change, and quietly widening a search
 * exclusion from a workspace click would be exactly the kind of side effect the
 * user did not ask for.
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
    if (!user) return html("Sign in before setting a status.", 401);

    const body = await request.text();
    if (body.length > 4000) return html("That request is too large.", 413);
    const parsed = statusInput.safeParse(Object.fromEntries(new URLSearchParams(body)));
    if (!parsed.success) return html(parsed.error.issues[0]?.message ?? "Check the request.", 400);
    const input = parsed.data;

    // The employer must be one this user is tracking or has been offered.
    const employerKey = normOrg(input.employerName);
    const [{ data: watched }, { data: candidates }] = await Promise.all([
      db.from("watched_employers").select("name").eq("user_id", user.id).limit(500),
      db.from("employer_candidates").select("name").eq("user_id", user.id).limit(500),
    ]);
    const known = [...((watched ?? []) as Array<{ name: string }>), ...((candidates ?? []) as Array<{ name: string }>)]
      .some((row) => normOrg(row.name) === employerKey);
    if (!known) return html("That employer was not found in your workspace.", 404);

    const { error } = await db.from("employer_target_events").insert({
      user_id: user.id,
      employer_key: employerKey,
      name: input.employerName,
      parent_key: input.parentOrganization ? normOrg(input.parentOrganization) : null,
      status: input.status,
      note: input.note ?? "",
      source: "user",
    });
    if (error) {
      // The table arrives with a migration; say so rather than failing blankly.
      return html(
        "Could not save that status. If this mentions a missing table, apply the latest Supabase migrations.",
        500,
      );
    }

    const path = input.returnTo && /^\/[A-Za-z0-9/_\-?=&#.]*$/.test(input.returnTo) ? input.returnTo : "/employers";
    const destination = `${path}${path.includes("?") ? "&" : "?"}target=${input.status}`;
    return request.headers.get("HX-Request") === "true"
      ? new Response(null, { status: 200, headers: { "HX-Redirect": destination } })
      : new Response(null, { status: 303, headers: { Location: destination } });
  } catch {
    return html("Could not save that status. Nothing was changed; please retry.", 500);
  }
};
