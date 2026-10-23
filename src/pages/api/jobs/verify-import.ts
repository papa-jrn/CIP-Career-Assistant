import type { APIRoute } from "astro";
import { z } from "zod";
import {
  IMPORTED_JOB_CHECK_SOURCE_TYPE,
  importedJobCheckPayload,
  observeImportedListing,
} from "@/lib/cip/imported-job-checks";
import { IMPORTED_JOB_SOURCE_TYPE, parseImportedJob } from "@/lib/cip/imported-jobs";
import { researchImportedEmployer } from "@/lib/cip/imported-employer-research";
import { escapeHtml } from "@/lib/cip/job-search-view";
import { verificationFetchUrl, verifyPosting } from "@/lib/cip/job-verifier";
import { isSameOriginRequest } from "@/lib/security";
import { createServer } from "@/lib/supabase/server";

const html = (message: string, status = 200) =>
  new Response(`<p role="status">${escapeHtml(message)}</p>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });

const verifyInput = z.object({
  importId: z.string().trim().min(1, "The job to check was not identified.").max(80),
  returnTo: z.string().trim().optional(),
});

/**
 * Check an imported job against the page it came from (§7).
 *
 * Reuses the same guarded fetch and the same judgement the weekly search uses,
 * so an imported posting is held to the standard as a discovered one rather
 * than a softer bespoke one. The result is stored as its own additive record:
 * earlier observations are kept, which is what lets the app say a posting has
 * changed rather than silently showing a different answer than last week.
 *
 * The direct check reads the supplied page; bounded AI-assisted research also
 * discovers employer business/careers sources and grounds quotes in guarded reads.
 * Neither establishes that the employer is hiring, that
 * anyone will reply, or that a posting is legitimate, and a page it cannot read
 * is reported as unread rather than as fake.
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOriginRequest(request)) return html("Invalid request origin.", 403);
  if (!import.meta.env.PUBLIC_SUPABASE_URL || !import.meta.env.PUBLIC_SUPABASE_ANON_KEY) {
    return html("Storage is not configured. Nothing was checked.", 503);
  }

  try {
    const db = createServer(cookies);
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user) return html("Sign in before checking a job.", 401);

    const body = await request.text();
    if (body.length > 4000) return html("That request is too large.", 413);
    const parsed = verifyInput.safeParse(Object.fromEntries(new URLSearchParams(body)));
    if (!parsed.success) return html(parsed.error.issues[0]?.message ?? "Check the request.", 400);
    const input = parsed.data;

    // The job must be one of this user's own imports.
    const { data: rows, error: loadError } = await db
      .from("career_sources")
      .select("extracted_text")
      .eq("user_id", user.id)
      .eq("source_type", IMPORTED_JOB_SOURCE_TYPE)
      .order("created_at", { ascending: false })
      .limit(200);
    if (loadError) return html("Your saved job could not be loaded. Please retry.", 503);
    const job = ((rows ?? []) as Array<{ extracted_text: string | null }>)
      .map((row) => parseImportedJob(row.extracted_text))
      .find((item) => item?.importId === input.importId);
    if (!job) return html("That job was not found in your records.", 404);

    if (!job.sourceUrl) {
      return html(
        "This job was saved from text you pasted, with no link to check. Add the posting's web address if you want it checked against the employer's own page.",
        400,
      );
    }

    const [result, employerResearch] = await Promise.all([verifyPosting({
      title: job.title,
      requisitionId: job.requisitionId ?? null,
      sourceUrl: job.sourceUrl,
    }), researchImportedEmployer(job)]);

    const { error } = await db.from("career_sources").insert({
      user_id: user.id,
      source_type: IMPORTED_JOB_CHECK_SOURCE_TYPE,
      title: `Listing check: ${job.title} at ${job.employer}`,
      url: job.sourceUrl,
      extracted_text: JSON.stringify(
        importedJobCheckPayload({
          importId: job.importId,
          state: result.state,
          note: result.note,
          checkedAt: result.checkedAt,
          fetchedUrl: verificationFetchUrl(job.sourceUrl),
          employerResearch,
          observations: observeImportedListing(job.employer, job.sourceUrl, job.originalMaterial),
        }),
      ),
      trust_state: result.state === "verified_open" ? "verified" : "unverified",
    });
    if (error) return html("The check ran but its result could not be saved. Please retry.", 500);

    const path = input.returnTo && /^\/[A-Za-z0-9/_\-?=&#.]*$/.test(input.returnTo)
      ? input.returnTo
      : "/opportunities#imported-jobs";
    const destinationUrl = new URL(path, "http://localhost");
    destinationUrl.searchParams.set("checked", "1");
    const destination = destinationUrl.pathname + destinationUrl.search + destinationUrl.hash;
    return request.headers.get("HX-Request") === "true"
      ? new Response(null, { status: 200, headers: { "HX-Redirect": destination, "HX-Refresh": "true" } })
      : new Response(null, { status: 303, headers: { Location: destination } });
  } catch {
    return html("The check could not be completed. Nothing was changed; please retry.", 500);
  }
};
