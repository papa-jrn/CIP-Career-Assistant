import type { APIRoute } from "astro";
import type { AdvisorEvidenceResponse } from "@/lib/cip/advisor";
import { intakeFormSchema, type IntakeForm } from "@/lib/cip/intake";
import {
  buildSourceAnalysis,
  collectEvidenceUrls,
  fetchSourceSnapshots,
  type SourceAnalysisItem,
} from "@/lib/cip/source-analysis";
import { isSameOriginRequest } from "@/lib/security";
import { createServer } from "@/lib/supabase/server";

type IntakeSource = {
  intake?: unknown;
};

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOriginRequest(request)) {
    return html('<p class="text-sm text-red-700">Invalid request origin.</p>', 403);
  }

  if (
    !import.meta.env.PUBLIC_SUPABASE_URL ||
    !import.meta.env.PUBLIC_SUPABASE_ANON_KEY
  ) {
    return html('<p class="text-sm font-semibold text-red-700">Supabase is not configured, so linked sources cannot be analyzed.</p>', 500);
  }

  try {
    const supabase = createServer(cookies);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return html('<p class="text-sm font-semibold text-red-700">Sign in before analyzing linked sources.</p>', 401);
    }

    const [{ data: intakeRow, error: intakeError }, { data: evidenceRows, error: evidenceError }] = await Promise.all([
      supabase
        .from("career_sources")
        .select("extracted_text, created_at")
        .eq("user_id", user.id)
        .eq("source_type", "resume_intake")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("career_sources")
        .select("extracted_text")
        .eq("user_id", user.id)
        .eq("source_type", "evidence_response")
        .order("created_at", { ascending: false })
        .limit(80),
    ]);

    if (intakeError) {
      return html(`<p class="text-sm font-semibold text-red-700">Could not load intake: ${escapeHtml(intakeError.message)}</p>`, 500);
    }

    if (evidenceError) {
      return html(`<p class="text-sm font-semibold text-red-700">Could not load evidence: ${escapeHtml(evidenceError.message)}</p>`, 500);
    }

    const intake = parseSavedIntake(intakeRow?.extracted_text ?? null);
    if (!intake) {
      return html('<p class="text-sm font-semibold text-red-700">Save an intake before analyzing linked sources.</p>', 400);
    }

    const evidenceResponses = (evidenceRows ?? [])
      .map((row) => parseEvidenceResponse(row.extracted_text))
      .filter(Boolean) as AdvisorEvidenceResponse[];
    const urls = collectEvidenceUrls(intake, evidenceResponses);

    if (!urls.length) {
      return html('<p class="text-sm font-semibold text-red-700">No GitHub, article, portfolio, or project URLs were found in saved intake/evidence.</p>', 400);
    }

    const snapshots = await fetchSourceSnapshots(urls);
    const items = await buildSourceAnalysis(snapshots, { intake, evidenceResponses });

    const { error: saveError } = await supabase.from("career_sources").insert({
      user_id: user.id,
      source_type: "source_analysis",
      title: `Linked source analysis ${new Date().toLocaleString()}`,
      url: null,
      extracted_text: JSON.stringify({
        intake_created_at: intakeRow?.created_at ?? null,
        urls,
        snapshots,
        items,
        created_at: new Date().toISOString(),
      }),
      trust_state: "system_generated",
    });

    if (saveError) {
      return html(`
        <div class="rounded-md border border-[var(--line)] bg-[var(--background)] p-4">
          <p class="text-sm font-semibold text-[var(--warning)]">Source analysis completed, but saving failed: ${escapeHtml(saveError.message)}</p>
          ${renderSourceAnalysis(items, snapshots.length)}
        </div>
      `);
    }

    return html(renderSourceAnalysis(items, snapshots.length));
  } catch (error) {
    return html(
      `<p class="text-sm font-semibold text-red-700">Linked source analysis failed: ${escapeHtml(error instanceof Error ? error.message : "Unexpected error.")}</p>`,
      500,
    );
  }
};

function parseSavedIntake(value: string | null): IntakeForm | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as IntakeSource;
    const intake = intakeFormSchema.safeParse(parsed.intake);
    return intake.success ? intake.data : null;
  } catch {
    return null;
  }
}

function parseEvidenceResponse(value: string | null): AdvisorEvidenceResponse | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    const response = parsed?.response;
    if (!response?.question || !response?.answer) return null;
    return {
      question: String(response.question),
      answer: String(response.answer),
      confidence: String(response.confidence || "not_sure"),
      proofUrl: String(response.proofUrl || ""),
      sourceNote: String(response.sourceNote || ""),
    };
  } catch {
    return null;
  }
}

function renderSourceAnalysis(items: SourceAnalysisItem[], sourceCount: number) {
  return `
    <section class="rounded-lg border border-[var(--line)] bg-[var(--background)] p-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-sm font-semibold uppercase text-[var(--accent-strong)]">Linked source analysis</p>
          <h2 class="mt-1 text-xl font-semibold">Project evidence extracted from URLs</h2>
        </div>
        <span class="rounded-md border border-[var(--line)] bg-[var(--panel)] px-2 py-1 text-xs font-semibold text-[var(--muted)]">${sourceCount} source${sourceCount === 1 ? "" : "s"}</span>
      </div>
      <div class="mt-5 grid gap-4">
        ${items.map(renderSourceItem).join("")}
      </div>
    </section>
  `;
}

function renderSourceItem(item: SourceAnalysisItem) {
  return `
    <article class="rounded-md border border-[var(--line)] bg-[var(--panel)] p-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 class="text-lg font-semibold">${escapeHtml(item.projectName)}</h3>
          <a class="mt-1 inline-block text-sm font-semibold text-[var(--accent-strong)] hover:underline" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.url)}</a>
        </div>
        <span class="rounded-md border border-[var(--line)] bg-[var(--background)] px-2 py-1 text-xs font-semibold text-[var(--muted)]">${escapeHtml(item.evidenceStrength)}</span>
      </div>
      <p class="mt-3 text-sm leading-6 text-[var(--muted)]">${escapeHtml(item.summary)}</p>
      <div class="mt-4 grid gap-4 md:grid-cols-2">
        ${renderList("Career claims supported", item.careerClaimsSupported)}
        ${renderList("Needs confirmation", item.needsUserConfirmation)}
      </div>
      <div class="mt-4 grid gap-4 md:grid-cols-2">
        ${renderList("What it proves", item.proves)}
        ${renderList("Technologies / domains", item.technologiesOrDomains)}
      </div>
    </article>
  `;
}

function renderList(title: string, items: string[]) {
  return `
    <div>
      <h4 class="text-xs font-semibold uppercase text-[var(--muted)]">${escapeHtml(title)}</h4>
      <ul class="mt-2 space-y-2 text-sm leading-6 text-[var(--muted)]">
        ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </div>
  `;
}

function html(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
