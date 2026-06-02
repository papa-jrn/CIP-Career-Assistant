import type { APIRoute } from "astro";
import type { AdvisorAnalysis } from "@/lib/cip/advisor";
import { intakeFormSchema, type IntakeForm } from "@/lib/cip/intake";
import {
  buildNetworkAnalysis,
  parseNetworkImport,
  type EmployerContext,
  type NetworkAnalysis,
  type NetworkContactMatch,
  type NetworkFeedback,
  type NetworkImportSummary,
} from "@/lib/cip/network-intelligence";
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
    return html('<p class="text-sm font-semibold text-red-700">Supabase is not configured, so network imports cannot be saved.</p>', 500);
  }

  try {
    const form = await request.formData();
    const parsedImport = await parseNetworkImport(form);

    if (!parsedImport.contacts.length) {
      return html(`
        <div class="rounded-md border border-[var(--line)] bg-[var(--background)] p-4">
          <p class="text-sm font-semibold text-red-700">No reviewable contacts were found.</p>
          <p class="mt-2 text-sm leading-6 text-[var(--muted)]">Try uploading the LinkedIn archive ZIP that contains Connections.csv, upload Connections.csv directly, or paste rows with name, company, title, URL, and relationship notes.</p>
          ${renderImportSummary(parsedImport.files)}
        </div>
      `, 400);
    }

    const supabase = createServer(cookies);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return html('<p class="text-sm font-semibold text-red-700">Sign in before importing network data.</p>', 401);
    }

    const [
      { data: intakeRow, error: intakeError },
      { data: analysisRow, error: analysisError },
      { data: employerRows, error: employerError },
      { data: feedbackRows, error: feedbackError },
    ] = await Promise.all([
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
        .select("extracted_text, created_at")
        .eq("user_id", user.id)
        .eq("source_type", "evidence_analysis")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("watched_employers")
        .select("name, category, location, priority, fit_score, target_roles, fit_summary")
        .eq("user_id", user.id)
        .order("fit_score", { ascending: false })
        .limit(100),
      supabase
        .from("career_sources")
        .select("extracted_text, created_at")
        .eq("user_id", user.id)
        .eq("source_type", "network_feedback")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    if (intakeError) {
      return html(`<p class="text-sm font-semibold text-red-700">Could not load intake: ${escapeHtml(intakeError.message)}</p>`, 500);
    }

    if (analysisError) {
      return html(`<p class="text-sm font-semibold text-red-700">Could not load latest analysis: ${escapeHtml(analysisError.message)}</p>`, 500);
    }

    if (employerError) {
      return html(`<p class="text-sm font-semibold text-red-700">Could not load watched employers: ${escapeHtml(employerError.message)}</p>`, 500);
    }

    if (feedbackError) {
      return html(`<p class="text-sm font-semibold text-red-700">Could not load network feedback: ${escapeHtml(feedbackError.message)}</p>`, 500);
    }

    const intake = parseSavedIntake(intakeRow?.extracted_text ?? null);
    const latestAnalysis = parseLatestAnalysis(analysisRow?.extracted_text ?? null);
    const employers = (employerRows ?? []) as EmployerContext[];
    const inlineFeedback = parseInlineFeedback(parsedImport.feedbackNotes);
    const feedback = [
      ...(feedbackRows ?? []).map((row) => parseNetworkFeedback(row.extracted_text)).filter(Boolean) as NetworkFeedback[],
      ...inlineFeedback,
    ];
    const analysis = await buildNetworkAnalysis({
      contacts: parsedImport.contacts,
      files: parsedImport.files,
      intake,
      latestAnalysis,
      employers,
      feedback,
    });
    const now = new Date().toISOString();

    const { error: importSaveError } = await supabase.from("career_sources").insert({
      user_id: user.id,
      source_type: "network_import",
      title: `Network import ${new Date().toLocaleString()}`,
      url: null,
      extracted_text: JSON.stringify({
        files: parsedImport.files,
        contact_count: parsedImport.contacts.length,
        contacts: parsedImport.contacts,
        notes: parsedImport.notes,
        feedback_notes: parsedImport.feedbackNotes,
        created_at: now,
      }),
      trust_state: "user_supplied",
    });

    const { error: analysisSaveError } = await supabase.from("career_sources").insert({
      user_id: user.id,
      source_type: "network_analysis",
      title: `Network intelligence analysis ${new Date().toLocaleString()}`,
      url: null,
      extracted_text: JSON.stringify({
        intake_created_at: intakeRow?.created_at ?? null,
        latest_analysis_created_at: analysisRow?.created_at ?? null,
        employer_count: employers.length,
        feedback_count: feedback.length,
        contact_count: parsedImport.contacts.length,
        files: parsedImport.files,
        analysis,
        created_at: now,
      }),
      trust_state: "system_generated",
    });

    if (inlineFeedback.length) {
      await supabase.from("career_sources").insert(
        inlineFeedback.map((item) => ({
          user_id: user.id,
          source_type: "network_feedback",
          title: `Network feedback: ${item.contactName}`,
          url: null,
          extracted_text: JSON.stringify({
            feedback: item,
            created_at: now,
          }),
          trust_state: "user_supplied",
        })),
      );
    }

    const saveWarnings = [importSaveError?.message, analysisSaveError?.message].filter(Boolean);
    return html(`
      <div class="grid gap-4">
        ${saveWarnings.length ? `<p class="rounded-md border border-[var(--line)] bg-[var(--background)] p-3 text-sm font-semibold text-[var(--warning)]">Analysis completed, but one save failed: ${escapeHtml(saveWarnings.join(" "))}</p>` : ""}
        ${renderAnalysis(analysis, parsedImport.files, parsedImport.contacts.length, employers.length)}
      </div>
    `);
  } catch (error) {
    return html(
      `<p class="text-sm font-semibold text-red-700">Network import failed: ${escapeHtml(error instanceof Error ? error.message : "Unexpected error.")}</p>`,
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

function parseLatestAnalysis(value: string | null): Partial<AdvisorAnalysis> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed?.advisor ?? null;
  } catch {
    return null;
  }
}

function parseNetworkFeedback(value: string | null): NetworkFeedback | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    const feedback = parsed?.feedback;
    if (!feedback?.contactName || !feedback?.feedbackType) return null;
    return {
      contactName: String(feedback.contactName),
      feedbackType: String(feedback.feedbackType) as NetworkFeedback["feedbackType"],
      note: String(feedback.note || ""),
    };
  } catch {
    return null;
  }
}

function parseInlineFeedback(value: string | undefined): NetworkFeedback[] {
  if (!value) return [];
  return value
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const removeMatch = line.match(/^(?:remove|exclude|do not recommend|don't recommend)\s+(.+?)(?:\s*[-:]\s*(.*))?$/i);
      if (removeMatch) {
        return {
          contactName: removeMatch[1].trim(),
          feedbackType: "remove" as const,
          note: removeMatch[2]?.trim() || line,
        };
      }

      const deceasedMatch = line.match(/^(.+?)\s+(?:passed away|is deceased|died)\b(.*)$/i);
      if (deceasedMatch) {
        return {
          contactName: deceasedMatch[1].trim(),
          feedbackType: "deceased" as const,
          note: line,
        };
      }

      const currentMatch = line.match(/^(.+?)\s+(?:is (?:my |our )?current|already active|already involved|current involvement|i already)\b(.*)$/i);
      if (currentMatch) {
        return {
          contactName: currentMatch[1].trim(),
          feedbackType: "current_involvement" as const,
          note: line,
        };
      }

      return null;
    })
    .filter(Boolean) as NetworkFeedback[];
}

function renderAnalysis(analysis: NetworkAnalysis, files: NetworkImportSummary[], contactCount: number, employerCount: number) {
  return `
    <section class="rounded-lg border border-[var(--line)] bg-[var(--background)] p-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-sm font-semibold uppercase text-[var(--accent-strong)]">Network intelligence analysis</p>
          <h2 class="mt-1 text-xl font-semibold">Warm paths from supplied relationship data</h2>
        </div>
        <div class="flex flex-wrap gap-2">
          <span class="rounded-md border border-[var(--line)] bg-[var(--panel)] px-2 py-1 text-xs font-semibold text-[var(--muted)]">${contactCount} contact${contactCount === 1 ? "" : "s"}</span>
          <span class="rounded-md border border-[var(--line)] bg-[var(--panel)] px-2 py-1 text-xs font-semibold text-[var(--muted)]">${employerCount} employer target${employerCount === 1 ? "" : "s"}</span>
          <span class="rounded-md border border-[var(--line)] bg-[var(--panel)] px-2 py-1 text-xs font-semibold text-[var(--accent-strong)]">${analysis.mode}</span>
        </div>
      </div>
      <p class="mt-4 text-sm leading-6 text-[var(--muted)]">${escapeHtml(analysis.summary)}</p>
      ${renderImportSummary(files)}
      <div class="mt-5">
        ${renderList("Five reconnection candidates", analysis.reconnectCandidates)}
      </div>
      <div class="mt-4">
        ${renderList("Questions to deepen these five picks", analysis.reconnectQuestions)}
      </div>
      <div class="mt-5 grid gap-4 lg:grid-cols-2">
        ${renderList("Warm-introduction paths", analysis.topPaths)}
        ${renderList("Weekly relationship moves", analysis.weeklyMoves)}
      </div>
      <div class="mt-4 grid gap-4 lg:grid-cols-2">
        ${renderList("Employer overlap", analysis.employerOverlaps)}
        ${renderList("Adjacent network signals", analysis.adjacentNetworkSignals)}
      </div>
      <div class="mt-4 grid gap-4 lg:grid-cols-2">
        ${renderList("Questions before outreach", analysis.followUpQuestions)}
        ${renderList("Confidence notes", analysis.confidenceNotes)}
      </div>
      <div class="mt-5">
        <h3 class="text-sm font-semibold">Top contact matches for review</h3>
        <div class="mt-3 grid gap-3">
          ${analysis.contactMatches.slice(0, 10).map(renderContactMatch).join("")}
        </div>
      </div>
    </section>
  `;
}

function renderImportSummary(files: NetworkImportSummary[]) {
  if (!files.length) return "";
  return `
    <details class="mt-4 rounded-md border border-[var(--line)] bg-[var(--panel)] p-4">
      <summary class="cursor-pointer text-sm font-semibold text-[var(--muted)]">Import summary</summary>
      <div class="mt-3 grid gap-2">
        ${files.map((file) => `
          <p class="text-sm leading-6 text-[var(--muted)]">
            <span class="font-semibold text-[var(--foreground)]">${escapeHtml(file.fileName)}</span>
            - ${escapeHtml(file.status)} ${escapeHtml(file.kind)} - ${file.contactCount} contact${file.contactCount === 1 ? "" : "s"}.
            ${escapeHtml(file.detail)}
          </p>
        `).join("")}
      </div>
    </details>
  `;
}

function renderContactMatch(match: NetworkContactMatch) {
  return `
    <article class="rounded-md border border-[var(--line)] bg-[var(--panel)] p-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 class="font-semibold">${escapeHtml(match.contact.name)}</h4>
          <p class="mt-1 text-sm text-[var(--muted)]">${escapeHtml([match.contact.title, match.contact.company].filter(Boolean).join(" at ") || "Company/title needs review")}</p>
        </div>
        <span class="rounded-md border border-[var(--line)] bg-[var(--background)] px-2 py-1 text-xs font-semibold text-[var(--accent-strong)]">${match.score}% ${escapeHtml(match.confidence)}</span>
      </div>
      <ul class="mt-3 space-y-2 text-sm leading-6 text-[var(--muted)]">
        ${match.matchReasons.slice(0, 4).map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}
      </ul>
      <p class="mt-3 rounded-md border border-[var(--line)] bg-[var(--background)] p-3 text-sm leading-6 text-[var(--accent-strong)]">
        <span class="font-semibold">First ask:</span> ${escapeHtml(match.recommendedFirstAsk)}
      </p>
      ${match.relationshipContext.length ? `
        <div class="mt-3 rounded-md border border-[var(--line)] bg-[var(--background)] p-3">
          <p class="text-xs font-semibold uppercase text-[var(--muted)]">Relationship context from notes</p>
          <ul class="mt-2 space-y-1 text-sm leading-6 text-[var(--muted)]">
            ${match.relationshipContext.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </div>
      ` : ""}
      ${match.clarifyingQuestions.length ? `
        <div class="mt-3 rounded-md border border-[var(--line)] bg-[var(--background)] p-3">
          <p class="text-xs font-semibold uppercase text-[var(--muted)]">Questions before outreach</p>
          <ul class="mt-2 space-y-1 text-sm leading-6 text-[var(--muted)]">
            ${match.clarifyingQuestions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </div>
      ` : ""}
      <p class="mt-2 text-sm leading-6 text-[var(--muted)]">${escapeHtml(match.outreachStory)}</p>
      ${match.contact.profileUrl ? `<a class="mt-3 inline-block text-sm font-semibold text-[var(--accent-strong)] hover:underline" href="${escapeHtml(match.contact.profileUrl)}" target="_blank" rel="noreferrer">Review profile</a>` : ""}
      <form class="mt-4 grid gap-2 rounded-md border border-[var(--line)] bg-[var(--background)] p-3" hx-post="/api/network/feedback" hx-target="#network-feedback-${slug(match.contact.name)}" hx-swap="innerHTML">
        <input type="hidden" name="contact_name" value="${escapeHtml(match.contact.name)}" />
        <label class="grid gap-1">
          <span class="text-xs font-semibold uppercase text-[var(--muted)]">Recommendation feedback</span>
          <select name="feedback_type" class="rounded-md border border-[var(--line)] bg-[var(--background)] p-2 text-sm">
            <option value="remove">Remove from future recommendations</option>
            <option value="current_involvement">Already active / not a reconnection</option>
            <option value="deceased">Deceased or sensitive</option>
            <option value="context">Add context only</option>
          </select>
        </label>
        <input name="feedback_note" class="rounded-md border border-[var(--line)] bg-[var(--background)] p-2 text-sm" placeholder="Optional note for future analysis" />
        <button class="rounded-md border border-[var(--line)] px-3 py-2 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10" type="submit">Save feedback</button>
        <div id="network-feedback-${slug(match.contact.name)}" aria-live="polite"></div>
      </form>
    </article>
  `;
}

function renderList(title: string, items: string[]) {
  return `
    <div class="rounded-md border border-[var(--line)] bg-[var(--panel)] p-4">
      <h3 class="text-sm font-semibold">${escapeHtml(title)}</h3>
      ${items.length ? `
        <ul class="mt-3 space-y-2 text-sm leading-6 text-[var(--muted)]">
          ${items.slice(0, 10).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      ` : '<p class="mt-3 text-sm leading-6 text-[var(--muted)]">Nothing strong enough yet. Add more relationship context or target employers.</p>'}
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

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "contact";
}
