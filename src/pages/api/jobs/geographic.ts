import type { APIRoute } from "astro";
import { searchAdzunaJobs, type AdzunaJob } from "@/lib/cip/adzuna-jobs";
import { intakeFormSchema, type IntakeForm } from "@/lib/cip/intake";
import { scoreOpportunity } from "@/lib/cip/labor-market";
import { isSameOriginRequest } from "@/lib/security";
import { createServer } from "@/lib/supabase/server";

// Live geographic job search via Adzuna. Returns real listings near a location,
// ranked against the saved intake when one exists. No persistence; live read.
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOriginRequest(request)) {
    return html('<p class="text-sm text-red-700">Invalid request origin.</p>', 403);
  }

  const form = await request.formData();
  const what = getText(form, "q");
  const where = getText(form, "where");
  const country = getText(form, "country") || "us";
  const radiusMiles = clampNumber(getText(form, "radius"), 25, 0, 200);
  const salaryMin = getText(form, "salary_min") ? clampNumber(getText(form, "salary_min"), 0, 0, 10_000_000) : null;
  const employerName = getText(form, "employer_name");

  if (!what && !where) {
    return html('<p class="text-sm font-semibold text-[var(--muted)]">Enter a role keyword and/or a location to search.</p>', 400);
  }

  let intake: Partial<IntakeForm> | null = null;
  if (import.meta.env.PUBLIC_SUPABASE_URL && import.meta.env.PUBLIC_SUPABASE_ANON_KEY) {
    try {
      const supabase = createServer(cookies);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
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
      // Personalization optional.
    }
  }

  const result = await searchAdzunaJobs({ what, where, radiusMiles, country, salaryMin });

  if (result.mode === "not_configured") {
    return html('<p class="text-sm font-semibold text-red-700">Adzuna is not configured. Add ADZUNA_APP_ID and ADZUNA_APP_KEY to the server environment.</p>', 503);
  }
  if (result.mode === "error") {
    return html(`<p class="text-sm font-semibold text-red-700">Adzuna search failed: ${escapeHtml(result.error ?? "unknown error")}</p>`, 502);
  }

  const jobs = employerName ? filterByEmployer(result.jobs, employerName) : result.jobs;
  const ranked = rank(jobs, intake);
  return html(render(ranked, result.count, where, Boolean(intake), employerName));
};

function rank(jobs: AdzunaJob[], intake: Partial<IntakeForm> | null) {
  if (!intake) return jobs.slice(0, 40).map((job) => ({ job, score: null as number | null }));
  return jobs
    .map((job) => ({
      job,
      score: scoreOpportunity(
        { title: job.title, company: job.company, location: job.location, work_mode: job.workMode || null, description: job.description, tags: [job.category] },
        intake,
      ).match_score,
    }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 40);
}

function filterByEmployer(jobs: AdzunaJob[], employerName: string) {
  const expected = normalizeEmployer(employerName);
  const expectedTokens = expected.split(" ").filter((token) => token.length > 2);

  return jobs.filter((job) => {
    const company = normalizeEmployer(job.company);
    const text = normalizeEmployer(`${job.company} ${job.title} ${job.description}`);
    if (company === expected || company.includes(expected) || expected.includes(company)) return true;

    const hits = expectedTokens.filter((token) => text.includes(token));
    return hits.length >= Math.min(2, expectedTokens.length);
  });
}

function render(
  items: Array<{ job: AdzunaJob; score: number | null }>,
  total: number,
  where: string,
  personalized: boolean,
  employerName = "",
) {
  if (!items.length) {
    return `
      <div class="rounded-md border border-[var(--line)] bg-[var(--background)] p-4">
        <p class="text-sm font-semibold">No ${employerName ? `${escapeHtml(employerName)} ` : ""}listings matched that public-board search${where ? ` near ${escapeHtml(where)}` : ""}.</p>
        <p class="mt-2 text-xs text-[var(--muted)]">${employerName ? "This does not mean the employer has no jobs; it means Adzuna did not return employer-matched rows for this query. Use the employer career-page link for the source of truth." : "Try a broader keyword or a larger radius."} Jobs by Adzuna.</p>
      </div>
    `;
  }

  const cards = items
    .map(({ job, score }) => `
      <article class="rounded-md border border-[var(--line)] bg-[var(--background)] p-4">
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 class="text-base font-semibold">${escapeHtml(job.title)}</h3>
            <p class="mt-0.5 text-sm text-[var(--muted)]">${escapeHtml(job.company)}${job.location ? ` - ${escapeHtml(job.location)}` : ""}</p>
          </div>
          <div class="flex flex-col items-end gap-1">
            ${job.workMode ? `<span class="rounded-md border border-[var(--line)] bg-[var(--panel)] px-2 py-0.5 text-xs font-semibold text-[var(--muted)]">${escapeHtml(job.workMode)}</span>` : ""}
            ${score !== null ? `<span class="text-xs font-semibold text-[var(--accent-strong)]">${score}% fit</span>` : ""}
          </div>
        </div>
        ${job.salary ? `<p class="mt-2 text-xs font-semibold text-[var(--accent-strong)]">${escapeHtml(job.salary)}</p>` : ""}
        ${job.category ? `<p class="mt-2"><span class="rounded-md border border-[var(--line)] px-1.5 py-0.5 text-xs text-[var(--muted)]">${escapeHtml(job.category)}</span></p>` : ""}
        <a class="mt-3 inline-block text-sm font-semibold text-[var(--accent-strong)] hover:underline" href="${escapeHtml(job.url)}" target="_blank" rel="noreferrer">View listing</a>
      </article>
    `)
    .join("");

  return `
    <div class="grid gap-3">
      <p class="text-xs text-[var(--muted)]">Showing ${items.length} ${employerName ? `${escapeHtml(employerName)}-matched ` : ""}public listing${items.length === 1 ? "" : "s"} from ${total.toLocaleString()} Adzuna result${total === 1 ? "" : "s"}${personalized ? " - ranked against your saved intake" : " - sign in and save intake for fit scoring"}.</p>
      ${cards}
      <p class="text-xs leading-5 text-[var(--muted)]">Jobs by Adzuna. Listings link to the original posting; CIP does not repost or apply on your behalf.</p>
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

function clampNumber(value: string, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function getText(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmployer(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(inc|llc|ltd|corporation|corp|company|co|college|health|system|systems|the)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
