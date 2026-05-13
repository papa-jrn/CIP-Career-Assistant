import type { APIRoute } from "astro";
import { buildAdvisorAnalysis, type AdvisorAnalysis } from "@/lib/cip/advisor";
import { buildIdentityDraft, parseIntakeForm } from "@/lib/cip/intake";
import { isSameOriginRequest } from "@/lib/security";
import { createServer } from "@/lib/supabase/server";

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOriginRequest(request)) {
    return html('<p class="text-sm text-red-700">Invalid request origin.</p>', 403);
  }

  const parsed = parseIntakeForm(await request.formData());
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => issue.message);
    return html(renderErrorList(errors));
  }

  const intake = parsed.data;
  const draft = buildIdentityDraft(intake);
  const advisor = await buildAdvisorAnalysis(intake, draft);
  const persistence = await tryPersistIntake(intake, draft, cookies);

  return html(renderIntakeResult(draft, advisor, persistence));
};

async function tryPersistIntake(
  intake: ReturnType<typeof parseIntakeForm> extends { data: infer T } ? T : never,
  draft: ReturnType<typeof buildIdentityDraft>,
  cookies: Parameters<typeof createServer>[0],
) {
  if (
    !import.meta.env.PUBLIC_SUPABASE_URL ||
    !import.meta.env.PUBLIC_SUPABASE_ANON_KEY
  ) {
    return "local";
  }

  try {
    const supabase = createServer(cookies);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return "signin";

    const { error: sourceError } = await supabase.from("career_sources").insert({
      user_id: user.id,
      source_type: "resume_intake",
      title: intake.full_name ? `${intake.full_name} intake` : "Career intake",
      url: intake.linkedin_url || null,
      extracted_text: JSON.stringify({ intake, draft }),
      trust_state: "user_submitted",
    });

    const { error: profileError } = await supabase.from("career_profiles").insert({
      user_id: user.id,
      salary_target: intake.salary_target ?? null,
      preferred_work_modes: intake.work_modes,
      preferred_industries: splitList(intake.industry_preferences),
      geographic_preferences: splitList(intake.career_constraints),
      career_archetype: draft.possibleRoles[0],
      confidence: "low",
    });

    return sourceError || profileError ? "error" : "saved";
  } catch {
    return "error";
  }
}

function splitList(value: string) {
  return value
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function renderIntakeResult(
  draft: ReturnType<typeof buildIdentityDraft>,
  advisor: AdvisorAnalysis,
  persistence: "local" | "signin" | "saved" | "error",
) {
  const status = {
    local: "Draft analyzed locally. Add Supabase keys and sign in to persist it.",
    signin: "Draft analyzed. Sign in to save it to your career profile.",
    saved: "Intake saved to your career profile.",
    error: "Draft analyzed, but saving failed. Check Supabase configuration and migrations.",
  }[persistence];

  return `
    <section class="rounded-lg border border-[var(--line)] bg-[var(--background)] p-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-xl font-semibold">Identity graph draft</h2>
        <span class="rounded-md bg-[rgba(14,124,134,0.12)] px-2 py-1 text-xs font-semibold text-[var(--accent-strong)]">${escapeHtml(status)}</span>
      </div>
      ${renderIdentityGraph(draft)}
      ${renderAdvisorAnalysis(advisor)}
      <div class="mt-5 grid gap-4 md:grid-cols-2">
        ${renderList("Detected strengths", draft.strengths)}
        ${renderList("Role hypotheses", draft.possibleRoles)}
        ${renderList("Evidence checklist", draft.evidenceChecklist)}
        ${renderList("Advisor follow-up", advisor.followUpQuestions)}
      </div>
    </section>
  `;
}

function renderAdvisorAnalysis(advisor: AdvisorAnalysis) {
  const badge =
    advisor.mode === "ai"
      ? "AI analysis"
      : "Deterministic analysis - add OPENAI_API_KEY for deeper advisor output";

  return `
    <section class="mt-5 rounded-md border border-[var(--line)] bg-[var(--panel)] p-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-sm font-semibold uppercase text-[var(--accent-strong)]">Career advisor</p>
          <h3 class="mt-1 text-lg font-semibold">Strategic analysis and market next steps</h3>
        </div>
        <span class="rounded-md border border-[var(--line)] bg-[var(--background)] px-2 py-1 text-xs font-semibold text-[var(--muted)]">${escapeHtml(badge)}</span>
      </div>
      <p class="mt-4 text-sm leading-6 text-[var(--muted)]">${escapeHtml(advisor.summary)}</p>

      <div class="mt-5 grid gap-4 lg:grid-cols-3">
        <div class="rounded-md border border-[var(--line)] bg-[var(--background)] p-4">
          <h4 class="text-sm font-semibold">Positioning signals</h4>
          ${renderInlineList(advisor.positioning)}
        </div>
        <div class="rounded-md border border-[var(--line)] bg-[var(--background)] p-4">
          <h4 class="text-sm font-semibold">Proof gaps</h4>
          ${renderInlineList(advisor.skillGaps)}
        </div>
        <div class="rounded-md border border-[var(--line)] bg-[var(--background)] p-4">
          <h4 class="text-sm font-semibold">Interview prompts</h4>
          ${renderInlineList(advisor.followUpQuestions.slice(0, 4))}
        </div>
      </div>

      <div class="mt-5">
        <h4 class="text-sm font-semibold">Role market starting points</h4>
        <div class="mt-3 grid gap-3 md:grid-cols-2">
          ${advisor.roleBriefs.map(renderRoleBrief).join("")}
        </div>
      </div>
    </section>
  `;
}

function renderRoleBrief(brief: AdvisorAnalysis["roleBriefs"][number]) {
  return `
    <article class="rounded-md border border-[var(--line)] bg-[var(--background)] p-4">
      <h5 class="font-semibold">${escapeHtml(brief.role)}</h5>
      <p class="mt-2 text-sm leading-6 text-[var(--muted)]">${escapeHtml(brief.whyItFits)}</p>
      <p class="mt-3 text-sm font-semibold text-[var(--warning)]">${escapeHtml(brief.evidenceNeeded)}</p>
      <div class="mt-4 flex flex-wrap gap-2">
        ${brief.searchTargets.map((target) => `<a class="rounded-md border border-[var(--line)] bg-[var(--panel)] px-2 py-1 text-xs font-semibold text-[var(--accent-strong)] hover:bg-black/5 dark:hover:bg-white/10" href="${escapeHtml(target.href)}" target="_blank" rel="noreferrer">${escapeHtml(target.label)}</a>`).join("")}
      </div>
    </article>
  `;
}

function renderInlineList(items: string[]) {
  return `
    <ul class="mt-3 space-y-2 text-sm leading-6 text-[var(--muted)]">
      ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
    </ul>
  `;
}

function renderIdentityGraph(draft: ReturnType<typeof buildIdentityDraft>) {
  const strengths = draft.strengths.slice(0, 5);
  const roles = draft.possibleRoles.slice(0, 4);
  const evidenceReady = draft.evidenceChecklist.filter((item) =>
    !item.toLowerCase().startsWith("add ") &&
    !item.toLowerCase().startsWith("separate ")
  );
  const evidenceCount = evidenceReady.length;
  const questionCount = draft.nextQuestions.length;
  const roleLabel = roles[0] ?? "Candidate profile";

  return `
    <div class="mt-5 overflow-hidden rounded-md border border-[var(--line)] bg-[var(--panel)]">
      <div class="grid gap-0 lg:grid-cols-[1fr_0.72fr]">
        <div class="relative min-h-[360px] bg-[radial-gradient(circle_at_center,rgba(14,124,134,0.10),transparent_58%)] p-4">
          <svg class="h-[360px] w-full" viewBox="0 0 720 360" role="img" aria-labelledby="identity-graph-title identity-graph-desc">
            <title id="identity-graph-title">Identity graph draft</title>
            <desc id="identity-graph-desc">A draft graph connecting the candidate profile to strengths, role hypotheses, evidence, and next questions.</desc>
            <g stroke="var(--line)" stroke-width="2">
              <line x1="360" y1="178" x2="160" y2="82" />
              <line x1="360" y1="178" x2="160" y2="184" />
              <line x1="360" y1="178" x2="166" y2="282" />
              <line x1="360" y1="178" x2="552" y2="92" />
              <line x1="360" y1="178" x2="560" y2="190" />
              <line x1="360" y1="178" x2="540" y2="286" />
            </g>

            ${renderGraphNode(360, 178, 118, "Profile", roleLabel, "core")}
            ${renderGraphNode(160, 82, 84, "Strength", strengths[0] ?? "career narrative")}
            ${renderGraphNode(160, 184, 84, "Strength", strengths[1] ?? strengths[0] ?? "transferable experience")}
            ${renderGraphNode(166, 282, 84, "Strength", strengths[2] ?? strengths[0] ?? "market positioning")}
            ${renderGraphNode(552, 92, 88, "Role", roles[1] ?? roles[0] ?? "role hypothesis")}
            ${renderGraphNode(560, 190, 86, "Evidence", `${evidenceCount}/4 ready`, "evidence")}
            ${renderGraphNode(540, 286, 88, "Questions", `${questionCount} open`, "question")}
          </svg>
        </div>

        <div class="border-t border-[var(--line)] p-5 lg:border-l lg:border-t-0">
          <h3 class="text-sm font-semibold">Graph readout</h3>
          <p class="mt-3 text-sm leading-6 text-[var(--muted)]">
            This first pass links repeated signals from the intake to plausible role directions and the evidence still needed before generating public-facing career copy.
          </p>
          <div class="mt-5 space-y-4">
            ${renderCompactPills("Core strengths", strengths)}
            ${renderCompactPills("Role directions", roles)}
            ${renderCompactPills("Evidence ready", evidenceReady.length ? evidenceReady : ["Needs more verified source material"])}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderGraphNode(
  x: number,
  y: number,
  radius: number,
  eyebrow: string,
  label: string,
  variant: "core" | "evidence" | "question" | "default" = "default",
) {
  const fill = {
    core: "var(--accent)",
    evidence: "var(--positive)",
    question: "var(--warning)",
    default: "var(--panel)",
  }[variant];
  const textColor = variant === "default" ? "var(--foreground)" : "var(--background)";
  const eyebrowColor = variant === "default" ? "var(--muted)" : "var(--background)";

  return `
    <g>
      <circle cx="${x}" cy="${y}" r="${radius}" fill="${fill}" stroke="var(--line)" stroke-width="2" />
      <text x="${x}" y="${y - 12}" text-anchor="middle" fill="${eyebrowColor}" font-size="13" font-weight="700">${escapeHtml(eyebrow)}</text>
      ${renderSvgWrappedText(label, x, y + 12, radius * 1.45, textColor)}
    </g>
  `;
}

function renderSvgWrappedText(label: string, x: number, y: number, maxWidth: number, fill: string) {
  const lines = wrapWords(label, Math.max(12, Math.floor(maxWidth / 8))).slice(0, 3);
  const startY = y - ((lines.length - 1) * 9);
  return lines
    .map(
      (line, index) =>
        `<text x="${x}" y="${startY + index * 18}" text-anchor="middle" fill="${fill}" font-size="15" font-weight="700">${escapeHtml(line)}</text>`,
    )
    .join("");
}

function wrapWords(label: string, maxChars: number) {
  const words = label.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) lines.push(current);
  return lines.length ? lines : [label];
}

function renderCompactPills(title: string, items: string[]) {
  return `
    <div>
      <h4 class="text-xs font-semibold uppercase text-[var(--muted)]">${escapeHtml(title)}</h4>
      <div class="mt-2 flex flex-wrap gap-2">
        ${items.map((item) => `<span class="rounded-md border border-[var(--line)] bg-[var(--background)] px-2 py-1 text-xs font-semibold text-[var(--foreground)]">${escapeHtml(item)}</span>`).join("")}
      </div>
    </div>
  `;
}

function renderList(title: string, items: string[]) {
  return `
    <div class="rounded-md border border-[var(--line)] bg-[var(--panel)] p-4">
      <h3 class="text-sm font-semibold">${escapeHtml(title)}</h3>
      <ul class="mt-3 space-y-2 text-sm text-[var(--muted)]">
        ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </div>
  `;
}

function renderErrorList(errors: string[]) {
  return `
    <div class="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <p class="font-semibold">Intake needs a little more detail.</p>
      <ul class="mt-2 list-disc pl-5">
        ${errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}
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
