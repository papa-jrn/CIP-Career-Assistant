import type { APIRoute } from "astro";
import { createServer } from "@/lib/supabase/server";

export const GET: APIRoute = async ({ cookies }) => {
  if (
    !import.meta.env.PUBLIC_SUPABASE_URL ||
    !import.meta.env.PUBLIC_SUPABASE_ANON_KEY
  ) {
    return json({ error: "Supabase is not configured." }, 500);
  }

  try {
    const supabase = createServer(cookies);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return json({ error: "Sign in before exporting evidence." }, 401);
    }

    const { data, error } = await supabase
      .from("career_sources")
      .select("id, source_type, title, url, extracted_text, trust_state, created_at")
      .eq("user_id", user.id)
      .in("source_type", ["resume_intake", "evidence_response"])
      .order("created_at", { ascending: false });

    if (error) {
      return json({ error: error.message }, 500);
    }

    return json({
      exported_at: new Date().toISOString(),
      user_id: user.id,
      counts: {
        resume_intake: (data ?? []).filter((row) => row.source_type === "resume_intake").length,
        evidence_response: (data ?? []).filter((row) => row.source_type === "evidence_response").length,
      },
      sources: (data ?? []).map((row) => ({
        ...row,
        parsed: parseExtractedText(row.extracted_text),
      })),
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Unexpected export error." },
      500,
    );
  }
};

function parseExtractedText(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Disposition": `attachment; filename="cip-evidence-backup-${new Date().toISOString().slice(0, 10)}.json"`,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
