import type { SupabaseClient } from "@supabase/supabase-js";
import type { IntakeForm } from "@/lib/cip/intake";

export async function loadLatestIntake(
  supabase: SupabaseClient,
  userId: string,
): Promise<Partial<IntakeForm> | null> {
  const { data } = await supabase
    .from("career_sources")
    .select("extracted_text")
    .eq("user_id", userId)
    .eq("source_type", "resume_intake")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.extracted_text) return null;

  try {
    const parsed = JSON.parse(data.extracted_text);
    return parsed?.intake ?? null;
  } catch {
    return null;
  }
}

export function profileText(intake: Partial<IntakeForm>) {
  return [
    intake.target_title,
    intake.resume_text,
    intake.hidden_achievements,
    intake.energizing_problems,
    intake.industry_preferences,
    intake.career_constraints,
    intake.public_evidence,
    intake.claim_boundaries,
  ].join("\n");
}
