import type { APIRoute } from "astro";
import { z } from "zod";
import {
  CAREERS_URL_SOURCE_TYPE,
  careersUrlPayload,
  isHttpUrl,
} from "@/lib/cip/employer-careers-url";
import { normOrg } from "@/lib/cip/employer-resolution";
import { escapeHtml } from "@/lib/cip/job-search-view";
import { isSafeRedirectPath, isSameOriginRequest } from "@/lib/security";
import { createServer } from "@/lib/supabase/server";

const html = (message: string, status = 200) =>
  new Response(`<p role="status">${escapeHtml(message)}</p>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });

const careersUrlInput = z
  .object({
    employerName: z.string().trim().min(1, "The employer was not identified.").max(200),
    careersUrl: z.string().trim().max(2000).optional().or(z.literal("")),
    /** Set when the user is saying this employer has no careers page. */
    none: z.enum(["yes"]).optional(),
    note: z.string().trim().max(300).optional(),
    returnTo: z.string().trim().optional(),
  })
  .refine((value) => value.none === "yes" || Boolean(value.careersUrl), {
    message: "Add the careers page address, or tick that there is not one.",
    path: ["careersUrl"],
  })
  .refine((value) => value.none === "yes" || !value.careersUrl || isHttpUrl(value.careersUrl), {
    message: "The address must start with http:// or https://.",
    path: ["careersUrl"],
  });

/**
 * Record where an employer actually posts its jobs.
 *
 * The weekly search targets this address before sector boards and the open
 * web, so a wrong one makes an employer look like it has nothing open. The
 * value previously came only from business discovery, which is a model's
 * guess; this lets the user correct it, or say there is no careers page at
 * all, which is a real answer the search must respect.
 *
 * Stored additively so the discovered value survives and the app can say the
 * user replaced it rather than presenting their answer as its own finding.
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
    if (!user) return html("Sign in before setting a careers page.", 401);

    const body = await request.text();
    if (body.length > 4000) return html("That request is too large.", 413);
    const parsed = careersUrlInput.safeParse(Object.fromEntries(new URLSearchParams(body)));
    if (!parsed.success) return html(parsed.error.issues[0]?.message ?? "Check the address you entered.", 400);
    const input = parsed.data;

    // The employer must be one this user is tracking. Without this, a record
    // could be stored against a name that means nothing in their workspace.
    const employerKey = normOrg(input.employerName);
    const [{ data: watched }, { data: candidates }] = await Promise.all([
      db.from("watched_employers").select("name").eq("user_id", user.id).limit(500),
      db.from("employer_candidates").select("name").eq("user_id", user.id).limit(500),
    ]);
    const known = [...((watched ?? []) as Array<{ name: string }>), ...((candidates ?? []) as Array<{ name: string }>)]
      .some((row) => normOrg(row.name) === employerKey);
    if (!known) return html("That employer was not found in your workspace.", 404);

    const { error } = await db.from("career_sources").insert({
      user_id: user.id,
      source_type: CAREERS_URL_SOURCE_TYPE,
      title: `Careers page: ${input.employerName}`,
      url: input.none === "yes" ? null : input.careersUrl || null,
      extracted_text: JSON.stringify(
        careersUrlPayload({
          employerKey,
          employerName: input.employerName,
          careersUrl: input.none === "yes" ? "" : input.careersUrl ?? "",
          note: input.note || undefined,
          recordedAt: new Date().toISOString(),
        }),
      ),
      trust_state: "user_supplied",
    });
    if (error) return html("Could not save that address. Your entry is still here; please retry.", 500);

    const destinationUrl = new URL(isSafeRedirectPath(input.returnTo, "/employers"), request.url);
    destinationUrl.searchParams.set("careers", "saved");
    const destination = `${destinationUrl.pathname}${destinationUrl.search}${destinationUrl.hash}`;
    return request.headers.get("HX-Request") === "true"
      ? new Response(null, { status: 200, headers: { "HX-Redirect": destination, "HX-Refresh": "true" } })
      : new Response(null, { status: 303, headers: { Location: destination } });
  } catch {
    return html("Could not save that address. Your entry is still here; please retry.", 500);
  }
};
