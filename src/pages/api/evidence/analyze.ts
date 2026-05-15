import type { APIRoute } from "astro";
import { buildAdvisorAnalysis, type AdvisorAnalysis, type AdvisorEvidenceResponse } from "@/lib/cip/advisor";
import { buildIdentityDraft, intakeFormSchema, type IntakeForm } from "@/lib/cip/intake";
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
    return html('<p class="text-sm font-semibold text-red-700">Supabase is not configured, so saved evidence cannot be loaded.</p>', 500);
  }

  try {
    const supabase = createServer(cookies);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return html('<p class="text-sm font-semibold text-red-700">Sign in before re-analyzing evidence.</p>', 401);
    }

    const { data: intakeRow, error: intakeError } = await supabase
      .from("career_sources")
      .select("extracted_text, created_at")
      .eq("user_id", user.id)
      .eq("source_type", "resume_intake")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (intakeError) {
      return html(`<p class="text-sm font-semibold text-red-700">Could not load intake: ${escapeHtml(intakeError.message)}</p>`, 500);
    }

    const intake = parseSavedIntake(intakeRow?.extracted_text ?? null);
    if (!intake) {
      return html('<p class="text-sm font-semibold text-red-700">Save an intake before re-analyzing evidence.</p>', 400);
    }

    const { data: evidenceRows, error: evidenceError } = await supabase
      .from("career_sources")
      .select("extracted_text, created_at")
      .eq("user_id", user.id)
      .eq("source_type", "evidence_response")
      .order("created_at", { ascending: false })
      .limit(40);

    if (evidenceError) {
      return html(`<p class="text-sm font-semibold text-red-700">Could not load evidence: ${escapeHtml(evidenceError.message)}</p>`, 500);
    }

    const evidenceResponses = (evidenceRows ?? [])
      .map((row) => parseEvidenceResponse(row.extracted_text))
      .filter(Boolean) as AdvisorEvidenceResponse[];

    if (!evidenceResponses.length) {
      return html('<p class="text-sm font-semibold text-red-700">Save at least one evidence answer before running re-analysis.</p>', 400);
    }

    const draft = buildIdentityDraft(intake);
    const advisor = await buildAdvisorAnalysis(intake, draft, evidenceResponses);

    const { error: saveError } = await supabase.from("career_sources").insert({
      user_id: user.id,
      source_type: "evidence_analysis",
      title: `Evidence re-analysis ${new Date().toLocaleString()}`,
      url: null,
      extracted_text: JSON.stringify({
        intake_created_at: intakeRow?.created_at ?? null,
        evidence_count: evidenceResponses.length,
        advisor,
        created_at: new Date().toISOString(),
      }),
      trust_state: "system_generated",
    });

    if (saveError) {
      return html(`
        <div class="rounded-md border border-[var(--line)] bg-[var(--background)] p-4">
          <p class="text-sm font-semibold text-[var(--warning)]">Re-analysis completed, but saving the analysis failed: ${escapeHtml(saveError.message)}</p>
          ${renderAnalysis(advisor, evidenceResponses.length)}
        </div>
      `);
    }

    return html(renderAnalysis(advisor, evidenceResponses.length));
  } catch (error) {
    return html(
      `<p class="text-sm font-semibold text-red-700">Evidence re-analysis failed: ${escapeHtml(error instanceof Error ? error.message : "Unexpected error.")}</p>`,
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

function renderAnalysis(advisor: AdvisorAnalysis, evidenceCount: number) {
  return `
    <section class="rounded-lg border border-[var(--line)] bg-[var(--background)] p-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-sm font-semibold uppercase text-[var(--accent-strong)]">Evidence re-analysis</p>
          <h2 class="mt-1 text-xl font-semibold">Updated advisor readout</h2>
        </div>
        <span class="rounded-md border border-[var(--line)] bg-[var(--panel)] px-2 py-1 text-xs font-semibold text-[var(--muted)]">${evidenceCount} evidence answer${evidenceCount === 1 ? "" : "s"}</span>
      </div>
      <p class="mt-4 text-sm leading-6 text-[var(--muted)]">${escapeHtml(advisor.summary)}</p>
      <div class="mt-5 grid gap-4 lg:grid-cols-3">
        ${renderList("Stronger positioning", advisor.positioning)}
        ${renderList("Remaining proof gaps", advisor.skillGaps)}
        ${renderList("Next follow-up questions", advisor.followUpQuestions)}
      </div>
      <div class="mt-5 grid gap-4 lg:grid-cols-2">
        <div class="rounded-md border border-[var(--line)] bg-[var(--panel)] p-4">
          <h3 class="text-sm font-semibold">Evidence ledger updates</h3>
          <div class="mt-3 grid gap-3">
            ${advisor.evidenceLedger.slice(0, 6).map(renderLedgerItem).join("")}
          </div>
        </div>
        <div class="rounded-md border border-[var(--line)] bg-[var(--panel)] p-4">
          <h3 class="text-sm font-semibold">Exploration lanes</h3>
          <div class="mt-3 grid gap-3">
            ${advisor.explorationAreas.slice(0, 4).map(renderExplorationArea).join("")}
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderList(title: string, items: string[]) {
  return `
    <div class="rounded-md border border-[var(--line)] bg-[var(--panel)] p-4">
      <h3 class="text-sm font-semibold">${escapeHtml(title)}</h3>
      <ul class="mt-3 space-y-2 text-sm leading-6 text-[var(--muted)]">
        ${items.slice(0, 6).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </div>
  `;
}

function renderLedgerItem(item: AdvisorAnalysis["evidenceLedger"][number]) {
  return `
    <article class="rounded-md border border-[var(--line)] bg-[var(--background)] p-3">
      <p class="text-sm font-semibold">${escapeHtml(item.claim)}</p>
      <p class="mt-2 text-sm leading-6 text-[var(--muted)]">${escapeHtml(item.evidence)}</p>
      <p class="mt-2 text-xs font-semibold uppercase text-[var(--accent-strong)]">${escapeHtml(item.status.replaceAll("_", " "))}</p>
    </article>
  `;
}

function renderExplorationArea(area: AdvisorAnalysis["explorationAreas"][number]) {
  return `
    <article class="rounded-md border border-[var(--line)] bg-[var(--background)] p-3">
      <p class="text-sm font-semibold">${escapeHtml(area.area)}</p>
      <p class="mt-2 text-sm leading-6 text-[var(--muted)]">${escapeHtml(area.whyExplore)}</p>
      <p class="mt-2 text-sm leading-6 text-[var(--accent-strong)]">${escapeHtml(area.firstExperiment)}</p>
    </article>
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
