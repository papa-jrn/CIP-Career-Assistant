import type { APIRoute } from "astro";
import { buildAnalysisReview, parseStrategicQuestions, type AnalysisReview, type ReviewVerdict } from "@/lib/cip/analysis-review";
import type { AdvisorAnalysis, AdvisorEvidenceResponse } from "@/lib/cip/advisor";
import { intakeFormSchema, type IntakeForm } from "@/lib/cip/intake";
import { sourceAnalysesToEvidence, type SourceAnalysisItem } from "@/lib/cip/source-analysis";
import { isSameOriginRequest } from "@/lib/security";
import { createServer } from "@/lib/supabase/server";

type IntakeSource = {
  intake?: unknown;
};

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOriginRequest(request)) {
    return html('<p class="text-sm text-red-700">Invalid request origin.</p>', 403);
  }

  const questions = parseStrategicQuestions(await request.formData());
  if (!questions.length) {
    return html('<p class="text-sm font-semibold text-red-700">Add at least one strategic question.</p>', 400);
  }

  if (
    !import.meta.env.PUBLIC_SUPABASE_URL ||
    !import.meta.env.PUBLIC_SUPABASE_ANON_KEY
  ) {
    return html('<p class="text-sm font-semibold text-red-700">Supabase is not configured, so saved evidence cannot be reviewed.</p>', 500);
  }

  try {
    const supabase = createServer(cookies);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return html('<p class="text-sm font-semibold text-red-700">Sign in before reviewing strategic questions.</p>', 401);
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
      return html('<p class="text-sm font-semibold text-red-700">Save an intake before reviewing strategic questions.</p>', 400);
    }

    const [
      { data: evidenceRows, error: evidenceError },
      { data: analysisRow, error: analysisError },
      { data: sourceRows, error: sourceError },
    ] = await Promise.all([
      supabase
        .from("career_sources")
        .select("extracted_text, created_at")
        .eq("user_id", user.id)
        .eq("source_type", "evidence_response")
        .order("created_at", { ascending: false })
        .limit(60),
      supabase
        .from("career_sources")
        .select("extracted_text, created_at")
        .eq("user_id", user.id)
        .eq("source_type", "evidence_analysis")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("career_sources")
        .select("extracted_text, created_at")
        .eq("user_id", user.id)
        .eq("source_type", "source_analysis")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    if (evidenceError) {
      return html(`<p class="text-sm font-semibold text-red-700">Could not load evidence: ${escapeHtml(evidenceError.message)}</p>`, 500);
    }

    if (analysisError) {
      return html(`<p class="text-sm font-semibold text-red-700">Could not load latest analysis: ${escapeHtml(analysisError.message)}</p>`, 500);
    }

    if (sourceError) {
      return html(`<p class="text-sm font-semibold text-red-700">Could not load source analysis: ${escapeHtml(sourceError.message)}</p>`, 500);
    }

    const evidenceResponses = (evidenceRows ?? [])
      .map((row) => parseEvidenceResponse(row.extracted_text))
      .filter(Boolean) as AdvisorEvidenceResponse[];
    const sourceEvidence = sourceAnalysesToEvidence(
      (sourceRows ?? []).flatMap((row) => parseSourceAnalysisItems(row.extracted_text)),
    );
    const combinedEvidence = [...sourceEvidence, ...evidenceResponses];
    const latestAnalysis = parseLatestAnalysis(analysisRow?.extracted_text ?? null);

    const review = await buildAnalysisReview({
      intake,
      evidenceResponses: combinedEvidence,
      latestAnalysis,
      questions,
    });

    const { error: saveError } = await supabase.from("career_sources").insert({
      user_id: user.id,
      source_type: "analysis_review",
      title: `Strategic question review ${new Date().toLocaleString()}`,
      url: null,
      extracted_text: JSON.stringify({
        intake_created_at: intakeRow?.created_at ?? null,
        latest_analysis_created_at: analysisRow?.created_at ?? null,
        evidence_count: evidenceResponses.length,
        source_evidence_count: sourceEvidence.length,
        questions,
        review,
        created_at: new Date().toISOString(),
      }),
      trust_state: "system_generated",
    });

    if (saveError) {
      return html(`
        <div class="rounded-md border border-[var(--line)] bg-[var(--background)] p-4">
          <p class="text-sm font-semibold text-[var(--warning)]">Review completed, but saving failed: ${escapeHtml(saveError.message)}</p>
          ${renderReview(review, combinedEvidence.length)}
        </div>
      `);
    }

    return html(renderReview(review, combinedEvidence.length));
  } catch (error) {
    return html(
      `<p class="text-sm font-semibold text-red-700">Strategic review failed: ${escapeHtml(error instanceof Error ? error.message : "Unexpected error.")}</p>`,
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

function parseSourceAnalysisItems(value: string | null): SourceAnalysisItem[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed?.items) ? parsed.items : [];
  } catch {
    return [];
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

function parseLatestAnalysis(value: string | null): Partial<AdvisorAnalysis> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed?.advisor ?? null;
  } catch {
    return null;
  }
}

function renderReview(review: AnalysisReview, evidenceCount: number) {
  return `
    <section class="rounded-lg border border-[var(--line)] bg-[var(--background)] p-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-sm font-semibold uppercase text-[var(--accent-strong)]">Strategic review</p>
          <h2 class="mt-1 text-xl font-semibold">Answers to your specific questions</h2>
        </div>
        <span class="rounded-md border border-[var(--line)] bg-[var(--panel)] px-2 py-1 text-xs font-semibold text-[var(--muted)]">${review.mode} · ${evidenceCount} evidence answer${evidenceCount === 1 ? "" : "s"}</span>
      </div>
      <p class="mt-4 text-sm leading-6 text-[var(--muted)]">${escapeHtml(review.summary)}</p>
      <div class="mt-5 grid gap-4">
        ${review.answers.map(renderAnswer).join("")}
      </div>
    </section>
  `;
}

function renderAnswer(answer: AnalysisReview["answers"][number]) {
  return `
    <article class="rounded-md border border-[var(--line)] bg-[var(--panel)] p-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <h3 class="text-lg font-semibold">${escapeHtml(answer.question)}</h3>
        <span class="rounded-md px-2 py-1 text-xs font-semibold ${verdictClass(answer.verdict)}">${escapeHtml(formatVerdict(answer.verdict))}</span>
      </div>
      <p class="mt-3 text-sm leading-6 text-[var(--foreground)]">${escapeHtml(answer.directAnswer)}</p>
      <div class="mt-4 grid gap-4 md:grid-cols-2">
        ${renderList("Supporting evidence", answer.supportingEvidence)}
        ${renderList("Missing evidence", answer.missingEvidence)}
      </div>
      <p class="mt-4 rounded-md border border-[var(--line)] bg-[var(--background)] p-3 text-sm leading-6 text-[var(--accent-strong)]">
        <span class="font-semibold">Next action:</span> ${escapeHtml(answer.recommendedNextAction)}
      </p>
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

function verdictClass(verdict: ReviewVerdict) {
  if (verdict === "answered") return "bg-[var(--accent-soft)] text-[var(--accent-strong)]";
  if (verdict === "partially_answered") return "bg-yellow-50 text-yellow-800";
  if (verdict === "needs_follow_up") return "bg-[var(--accent-tint)] text-[var(--accent-strong)] border border-[var(--line)]";
  return "bg-red-50 text-red-800";
}

function formatVerdict(verdict: ReviewVerdict) {
  return verdict.replaceAll("_", " ");
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
