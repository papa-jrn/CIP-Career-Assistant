import type { APIRoute } from "astro";
import { z } from "zod";
import { IMPORTED_JOB_SOURCE_TYPE, buildImportedJob, importedJobInput, importedJobPayload, parseImportedJob } from "@/lib/cip/imported-jobs";
import { escapeHtml } from "@/lib/cip/job-search-view";
import { isSameOriginRequest } from "@/lib/security";
import { createServer } from "@/lib/supabase/server";

const html = (message: string, status = 200) => new Response(`<p role="status">${escapeHtml(message)}</p>`, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
const updateInput = importedJobInput.extend({ importId: z.string().trim().min(1).max(80), returnTo: z.string().trim().optional() });

/** Save an edited revision additively; old text and previous assessments remain in history. */
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOriginRequest(request)) return html("Invalid request origin.", 403);
  if (!import.meta.env.PUBLIC_SUPABASE_URL || !import.meta.env.PUBLIC_SUPABASE_ANON_KEY) return html("Storage is not configured. Nothing was updated.", 503);
  try {
    const db = createServer(cookies);
    const { data: { user } } = await db.auth.getUser();
    if (!user) return html("Sign in before editing a saved job.", 401);
    const body = await request.text();
    if (body.length > 100_000) return html("That job record is too large.", 413);
    const parsed = updateInput.safeParse(Object.fromEntries(new URLSearchParams(body)));
    if (!parsed.success) return html(parsed.error.issues[0]?.message ?? "Check the job details.", 400);
    const { importId, returnTo, ...fields } = parsed.data;
    const { data: rows, error: readError } = await db.from("career_sources").select("extracted_text")
      .eq("user_id", user.id).eq("source_type", IMPORTED_JOB_SOURCE_TYPE).order("created_at", { ascending: false }).limit(200);
    if (readError) return html("Could not load your saved job. Nothing was changed.", 500);
    const current = (rows ?? []).map((row: { extracted_text: string | null }) => parseImportedJob(row.extracted_text)).find((job) => job?.importId === importId);
    if (!current) return html("That job was not found in your records.", 404);
    const revised = buildImportedJob(fields, { importId, capturedAt: new Date().toISOString() });
    const { error } = await db.from("career_sources").insert({
      user_id: user.id,
      source_type: IMPORTED_JOB_SOURCE_TYPE,
      title: `Updated imported job: ${revised.title} at ${revised.employer}`,
      url: revised.sourceUrl || null,
      extracted_text: JSON.stringify(importedJobPayload(revised)),
      trust_state: "user_supplied",
    });
    if (error) return html("Could not save these edits. Your previous version is still intact.", 500);
    const destination = returnTo && /^\/[A-Za-z0-9/_\-?=&#.]*$/.test(returnTo) ? returnTo : "/opportunities#imported-jobs";
    return request.headers.get("HX-Request") === "true"
      ? new Response(null, { status: 200, headers: { "HX-Redirect": `${destination}${destination.includes("?") ? "&" : "?"}updated=1` } })
      : new Response(null, { status: 303, headers: { Location: `${destination}${destination.includes("?") ? "&" : "?"}updated=1` } });
  } catch {
    return html("Could not update the saved job. The earlier version remains available; please retry.", 500);
  }
};
