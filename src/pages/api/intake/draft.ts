import type { APIRoute } from "astro";
import { isSameOriginRequest } from "@/lib/security";
import { createServer } from "@/lib/supabase/server";

// Lightweight partial-save endpoint for the progressive-disclosure intake.
// Accepts whatever fields the user has filled in so far (resume may be absent),
// persists them as a DRAFT without running analysis, and returns a small JSON
// ack. The final "Save and analyze" step still goes through /api/intake/save,
// which runs full validation + advisor analysis + marks trust_state=user_submitted.
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOriginRequest(request)) {
    return json({ ok: false, error: "Invalid request origin." }, 403);
  }

  if (!import.meta.env.PUBLIC_SUPABASE_URL || !import.meta.env.PUBLIC_SUPABASE_ANON_KEY) {
    return json({ ok: false, error: "Draft saving requires sign-in and a configured workspace." }, 503);
  }

  try {
    const form = await request.formData();
    const intake = extractPartialIntake(form);
    const supabase = createServer(cookies);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return json({ ok: false, error: "Sign in to save your progress." }, 401);
    }

    const title = intake.full_name ? `${intake.full_name} intake (draft)` : "Career intake (draft)";
    const { data, error } = await supabase
      .from("career_sources")
      .insert({
        user_id: user.id,
        source_type: "resume_intake",
        title,
        url: intake.linkedin_url || null,
        extracted_text: JSON.stringify({ intake }),
        trust_state: "draft",
      })
      .select("created_at")
      .single();

    if (error) {
      return json({ ok: false, error: error.message }, 500);
    }

    return json({ ok: true, savedAt: data?.created_at ?? new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error saving draft.";
    return json({ ok: false, error: message }, 500);
  }
};

// Pulls whatever fields are present from the FormData into a partial intake
// object. No validation gate here — this is a draft, the final save validates.
function extractPartialIntake(form: FormData) {
  const getText = (key: string) => {
    const value = form.get(key);
    return typeof value === "string" ? value.trim() : "";
  };

  const salaryRaw = getText("salary_target");
  const salaryTarget = salaryRaw ? Number(salaryRaw) : undefined;

  return {
    full_name: getText("full_name"),
    target_title: getText("target_title"),
    email: getText("email"),
    salary_target: Number.isFinite(salaryTarget) && salaryTarget > 0 ? salaryTarget : undefined,
    work_modes: form.getAll("work_modes").map(String).filter(Boolean),
    resume_text: getText("resume_text"),
    linkedin_url: getText("linkedin_url"),
    portfolio_urls: getText("portfolio_urls"),
    hidden_achievements: getText("hidden_achievements"),
    energizing_problems: getText("energizing_problems"),
    career_constraints: getText("career_constraints"),
    industry_preferences: getText("industry_preferences"),
    public_evidence: getText("public_evidence"),
    claim_boundaries: getText("claim_boundaries"),
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
