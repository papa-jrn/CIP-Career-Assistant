import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdvisorAnalysis, RoleBrief } from "./advisor";

const key = (role: string) => role.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Omission is not a decision to abandon an existing career path. New priority comes first. */
export function retainCareerLanes(current: RoleBrief[], previous: RoleBrief[] = []): RoleBrief[] {
  const seen = new Set<string>();
  return [...current, ...previous].filter(brief => {
    if (!brief?.role || seen.has(key(brief.role))) return false;
    seen.add(key(brief.role));
    return true;
  });
}

/** Recover the newest complete lane set, rather than resurrecting every historical suggestion. */
export function advisorWithLaneHistory(rows: Array<{ extracted_text: string | null }>, fallback: Partial<AdvisorAnalysis> | null = null): Partial<AdvisorAnalysis> | null {
  const advisors = rows.flatMap(row => {
    try { const value = JSON.parse(row.extracted_text ?? "null")?.advisor; return value && typeof value === "object" ? [value as Partial<AdvisorAnalysis>] : []; }
    catch { return []; }
  });
  const latest = advisors[0] ?? fallback;
  if (!latest) return null;
  const baseline = advisors.find(item => (item.roleBriefs?.length ?? 0) >= 3) ?? fallback;
  return { ...latest, roleBriefs: retainCareerLanes(latest.roleBriefs ?? [], baseline?.roleBriefs ?? []) };
}

export async function loadAdvisorLaneHistory(db: SupabaseClient, userId: string) {
  const rows: Array<{ extracted_text: string | null }> = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await db.from("career_sources").select("extracted_text").eq("user_id", userId).eq("source_type", "evidence_analysis").order("created_at", { ascending: false }).range(offset, offset + 99);
    if (error) throw new Error("Could not load saved career lanes. Please retry.");
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 100 || rows.some(row => { try { return JSON.parse(row.extracted_text ?? "null")?.advisor?.roleBriefs?.length >= 3; } catch { return false; } })) break;
  }
  return rows;
}
