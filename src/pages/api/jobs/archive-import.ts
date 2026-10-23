import type { APIRoute } from "astro";
import { z } from "zod";
import { createServer } from "@/lib/supabase/server";
import { isSameOriginRequest } from "@/lib/security";
import { parseImportedJob, IMPORTED_JOB_SOURCE_TYPE } from "@/lib/cip/imported-jobs";
import { setImportedArchive } from "@/lib/cip/job-archive";
const inputSchema = z.object({ importId: z.string().min(1).max(80), action: z.enum(["archive", "restore"]) });
const html = (message: string, status: number) => new Response(`<p role="status">${message}</p>`, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOriginRequest(request)) return html("Invalid request origin.", 403);
  try {
    const db = createServer(cookies);
    const { data: { user } } = await db.auth.getUser();
    if (!user) return html("Sign in to archive or restore a job.", 401);
    const body = await request.text();
    if (body.length > 1000) return html("That request is too large.", 413);
    const parsed = inputSchema.safeParse(Object.fromEntries(new URLSearchParams(body)));
    if (!parsed.success) return html("Choose a saved job and archive or restore.", 400);
    const { data, error } = await db.from("career_sources").select("extracted_text").eq("user_id", user.id).eq("source_type", IMPORTED_JOB_SOURCE_TYPE).order("created_at", { ascending: false }).limit(200);
    if (error) return html("Your saved jobs could not be loaded.", 503);
    const job = (data ?? []).map(row => parseImportedJob(row.extracted_text)).find(job => job?.importId === parsed.data.importId);
    if (!job) return html("That job was not found in your records.", 404);
    await setImportedArchive(db, user.id, job, parsed.data.action === "archive");
    return new Response(null, { status: 303, headers: { Location: `/opportunities?jobs=${parsed.data.action === "archive" ? "active" : "archived"}#imported-jobs` } });
  } catch { return html("Your decision could not be saved. Please retry.", 500); }
};
