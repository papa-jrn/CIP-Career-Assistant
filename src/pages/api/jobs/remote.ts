import type { APIRoute } from "astro";
import { intakeFormSchema, type IntakeForm } from "@/lib/cip/intake";
import { scoreOpportunity } from "@/lib/cip/labor-market";
import { checkRateLimit, clientRateLimitKey, rateLimitedHtml } from "@/lib/rate-limit";
import { searchRemoteJobs, type RemoteJob, type RemoteSourceStatus } from "@/lib/cip/remote-jobs";
import { isSameOriginRequest } from "@/lib/security";
import { createServer } from "@/lib/supabase/server";

// Live remote-job search. Returns real listings from open remote-job APIs and,
// when a saved intake exists, ranks them against the user's profile. No data is
// persisted here — this is a live read, so results are never stale or invented.
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOriginRequest(request)) {
    return html('<p class="text-sm text-red-700">Invalid request origin.</p>', 403);
  }

  const form = await request.formData();
  const query = getText(form, "q");
  const region = getText(form, "region");

  if (!query) {
    return html('<p class="text-sm font-semibold text-[var(--muted)]">Enter a role or keyword to search remote jobs.</p>', 400);
  }

  let intake: Partial<IntakeForm> | null = null;
  let signedIn = false;
  if (import.meta.env.PUBLIC_SUPABASE_URL && import.meta.env.PUBLIC_SUPABASE_ANON_KEY) {
    try {
      const supabase = createServer(cookies);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        signedIn = true;
        const { data } = await supabase
          .from("career_sources")
          .select("extracted_text")
          .eq("user_id", user.id)
          .eq("source_type", "resume_intake")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        intake = parseIntake(data?.extracted_text ?? null);
      }
    } catch {
      // Personalization is optional; fall back to relevance-only ranking.
    }
  }

  if (!signedIn) {
    const limit = checkRateLimit({
      key: clientRateLimitKey(request, "anonymous:remote-jobs"),
      limit: 10,
      windowMs: 10 * 60 * 1000,
    });
    if (!limit.allowed) {
      return rateLimitedHtml("Too many public job searches. Sign in or try again in a few minutes.", limit);
    }
  }

  try {
    const result = await searchRemoteJobs(query, region);
    const ranked = rank(result.jobs, intake);
    return html(render(ranked, result.sources, Boolean(intake)));
  } catch (error) {
    return html(`<p class="text-sm font-semibold text-red-700">Remote search failed: ${escapeHtml(error instanceof Error ? error.message : "Unexpected error.")}</p>`, 502);
  }
};

function rank(jobs: RemoteJob[], intake: Partial<IntakeForm> | null) {
  if (!intake) return jobs.slice(0, 40).map((job) => ({ job, score: null as number | null }));
  return jobs
    .map((job) => ({
      job,
      score: scoreOpportunity(
        { title: job.title, company: job.company, location: job.location, work_mode: "remote", description: job.description, tags: job.tags },
        intake,
      ).match_score,
    }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 40);
}

function render(items: Array<{ job: RemoteJob; score: number | null }>, sources: RemoteSourceStatus[], personalized: boolean) {
  const sourceSummary = sources
    .map((s) => (s.error ? `${escapeHtml(s.name)}: unavailable (${escapeHtml(s.error)})` : `${escapeHtml(s.name)}: ${s.found}`))
    .join(" · ");

  if (!items.length) {
    return `
      <div class="rounded-md border border-[var(--line)] bg-[var(--background)] p-4">
        <p class="text-sm font-semibold">No remote listings matched that search.</p>
        <p class="mt-2 text-xs text-[var(--muted)]">Sources checked — ${sourceSummary}. Try a broader keyword.</p>
      </div>
    `;
  }

  const cards = items
    .map(({ job, score }) => `
      <article class="rounded-md border border-[var(--line)] bg-[var(--background)] p-4">
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 class="text-base font-semibold">${escapeHtml(job.title)}</h3>
            <p class="mt-0.5 text-sm text-[var(--muted)]">${escapeHtml(job.company)}${job.location ? ` · ${escapeHtml(job.location)}` : ""}</p>
          </div>
          <div class="flex flex-col items-end gap-1">
            <span class="rounded-md border border-[var(--line)] bg-[var(--panel)] px-2 py-0.5 text-xs font-semibold text-[var(--muted)]">${escapeHtml(job.source)}</span>
            ${score !== null ? `<span class="text-xs font-semibold text-[var(--accent-strong)]">${score}% fit</span>` : ""}
          </div>
        </div>
        ${job.salary ? `<p class="mt-2 text-xs font-semibold text-[var(--accent-strong)]">${escapeHtml(job.salary)}</p>` : ""}
        ${job.tags.length ? `<p class="mt-2 flex flex-wrap gap-1">${job.tags.slice(0, 6).map((tag) => `<span class="rounded-md border border-[var(--line)] px-1.5 py-0.5 text-xs text-[var(--muted)]">${escapeHtml(tag)}</span>`).join("")}</p>` : ""}
        <a class="mt-3 inline-block text-sm font-semibold text-[var(--accent-strong)] hover:underline" href="${escapeHtml(job.url)}" target="_blank" rel="noreferrer">View listing</a>
      </article>
    `)
    .join("");

  return `
    <div class="grid gap-3">
      <p class="text-xs text-[var(--muted)]">${items.length} live listing${items.length === 1 ? "" : "s"} · ${sourceSummary}${personalized ? " · ranked against your saved intake" : " · sign in and save intake for fit scoring"}</p>
      ${cards}
      <p class="text-xs leading-5 text-[var(--muted)]">Live results from open remote-job APIs (Remotive, RemoteOK, We Work Remotely). Listings link to the original source; CIP does not repost or apply on your behalf.</p>
    </div>
  `;
}

function parseIntake(value: string | null): Partial<IntakeForm> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    const intake = intakeFormSchema.safeParse(parsed.intake);
    return intake.success ? intake.data : null;
  } catch {
    return null;
  }
}

function getText(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function html(body: string, status = 200) {
  return new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
