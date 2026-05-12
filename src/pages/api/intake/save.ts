import type { APIRoute } from "astro";
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
  const persistence = await tryPersistIntake(intake, draft, cookies);

  return html(renderIntakeResult(draft, persistence));
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
      <div class="mt-5 grid gap-4 md:grid-cols-2">
        ${renderList("Detected strengths", draft.strengths)}
        ${renderList("Role hypotheses", draft.possibleRoles)}
        ${renderList("Evidence checklist", draft.evidenceChecklist)}
        ${renderList("Next questions", draft.nextQuestions)}
      </div>
    </section>
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
