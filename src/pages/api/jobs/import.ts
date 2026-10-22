import type { APIRoute } from "astro";
import { randomUUID } from "node:crypto";
import {
  IMPORTED_JOB_SOURCE_TYPE,
  buildImportedJob,
  findDuplicate,
  importedJobInput,
  importedJobPayload,
  parseImportedJob,
} from "@/lib/cip/imported-jobs";
import { escapeHtml } from "@/lib/cip/job-search-view";
import { isSameOriginRequest } from "@/lib/security";
import { createServer } from "@/lib/supabase/server";

const html = (message: string, status = 200) =>
  new Response(`<p role="status">${escapeHtml(message)}</p>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });

/**
 * Bring in a job the user found somewhere else (Workbench Redesign Plan §7).
 *
 * This saves what the user supplied and nothing more. It does not fetch the
 * link, judge the employer, assess fit, watch the employer, apply, or contact
 * anyone - those are separate, explicit actions. Saving the input and
 * describing the evaluation as incomplete is what §7 asks for when no check has
 * run, rather than manufacturing a verdict.
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
    if (!user) return html("Sign in before bringing in a job.", 401);

    const body = await request.text();
    if (body.length > 60_000) return html("That posting is too long to save. Paste the key sections instead.", 413);
    const parsed = importedJobInput.safeParse(Object.fromEntries(new URLSearchParams(body)));
    if (!parsed.success) return html(parsed.error.issues[0]?.message ?? "Check the details you entered.", 400);

    const job = buildImportedJob(parsed.data, { importId: randomUUID(), capturedAt: new Date().toISOString() });

    // Compare against both what the user has already imported and what a search
    // already found, so one posting does not end up as two records with
    // separate statuses.
    const [{ data: importRows }, { data: observationRows }] = await Promise.all([
      db
        .from("career_sources")
        .select("extracted_text")
        .eq("user_id", user.id)
        .eq("source_type", IMPORTED_JOB_SOURCE_TYPE)
        .order("created_at", { ascending: false })
        .limit(200),
      db
        .from("job_search_observations")
        .select("title,employer_text,source_url,requisition_id")
        .eq("user_id", user.id)
        .limit(400),
    ]);

    const existing = [
      ...((importRows ?? [])
        .map((row) => parseImportedJob(row.extracted_text))
        .filter(Boolean)
        .map((item) => ({
          title: item!.title,
          employer: item!.employer,
          sourceUrl: item!.sourceUrl,
          normalizedUrl: item!.normalizedUrl,
          employerKey: item!.employerKey,
          requisitionId: item!.requisitionId,
        }))),
      ...((observationRows ?? []) as Array<{ title: string; employer_text: string; source_url: string; requisition_id: string | null }>).map((row) => ({
        title: row.title,
        employer: row.employer_text,
        sourceUrl: row.source_url,
        requisitionId: row.requisition_id ?? undefined,
      })),
    ];

    const duplicate = findDuplicate(job, existing);
    // A matching link or requisition is definitive, so decline rather than
    // create a second copy. A matching title and employer is a likely match,
    // not a certain one: say so and let the user decide by confirming.
    if (duplicate && duplicate.reason !== "same_title_and_employer") {
      return html(
        `You already have this job: ${duplicate.existing.title} at ${duplicate.existing.employer}. It was not added again.`,
        409,
      );
    }
    const confirmed = new URLSearchParams(body).get("confirmDuplicate") === "yes";
    if (duplicate && !confirmed) {
      return html(
        `You may already have this: ${duplicate.existing.title} at ${duplicate.existing.employer}. Submit again with "Add it anyway" if it is a different posting.`,
        409,
      );
    }

    const { error } = await db.from("career_sources").insert({
      user_id: user.id,
      source_type: IMPORTED_JOB_SOURCE_TYPE,
      title: `Imported job: ${job.title} at ${job.employer}`,
      url: job.sourceUrl || null,
      extracted_text: JSON.stringify(importedJobPayload(job)),
      trust_state: "user_supplied",
    });
    if (error) return html("Could not save that job. Your entry is still here; please retry.", 500);

    const path = "/opportunities?imported=1#imported-jobs";
    return request.headers.get("HX-Request") === "true"
      ? new Response(null, { status: 200, headers: { "HX-Redirect": path } })
      : new Response(null, { status: 303, headers: { Location: path } });
  } catch {
    return html("Could not save that job. Your entry is still here; please retry.", 500);
  }
};
