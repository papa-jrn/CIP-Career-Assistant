import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

export const workStatus = z.enum(["active", "deferred", "completed", "dismissed"]);
export const workInput = z.object({
  operation: z.enum(["create", "outcome", "capture"]),
  actionId: z.string().uuid().optional(),
  supersedesGoalId: z.string().regex(/^goal-[a-f0-9]{32}$/).optional(),
  title: z.string().trim().max(180).default(""),
  context: z.string().trim().max(300).default(""),
  note: z.string().trim().max(12000).default(""),
  sourceUrl: z.string().trim().max(2000).refine(value => !value || /^https?:\/\//i.test(value) && URL.canParse(value), "Use a complete http or https source URL.").default(""),
  conclusion: z.enum(["", "continue", "hold", "unknown"]).default(""),
  kind: z.enum(["research", "funding", "experiment", "goal", "evidence"]).default("research"),
  status: workStatus.default("active"),
}).superRefine((v, ctx) => {
  if (v.supersedesGoalId && (v.operation !== "capture" || v.kind !== "goal")) ctx.addIssue({ code: "custom", message: "A goal correction must be saved as a goal update." });
  if (v.operation === "create" && v.title.length < 4) ctx.addIssue({ code: "custom", message: "Give the action a specific title." });
  if (v.operation === "outcome" && !v.actionId) ctx.addIssue({ code: "custom", message: "Choose an existing action." });
  if (v.operation === "capture" && v.note.length < 12) ctx.addIssue({ code: "custom", message: "Add a little more detail before saving." });
});
export const eventSchema = z.object({
  version: z.literal(1), actionId: z.string().uuid(), title: z.string().min(4).max(180),
  context: z.string().max(300), kind: z.enum(["research", "funding", "experiment", "goal", "evidence"]),
  status: workStatus, note: z.string().max(12000),
  sourceUrl: z.string().optional(), conclusion: z.enum(["", "continue", "hold", "unknown"]).optional(),
});
export type WorkEvent = z.infer<typeof eventSchema>;
export type WorkAction = WorkEvent & { updatedAt: string; history: Array<{ note: string; status: WorkEvent["status"]; at: string; sourceUrl?: string; conclusion?: string }> };
export interface SourceRow { id: string; source_type: string; extracted_text: string | null; created_at: string }

/** Rows arrive newest first with id as a stable tie-breaker; later arrivals never reopen work implicitly. */
export function assembleActions(rows: SourceRow[]): WorkAction[] {
  const actions = new Map<string, WorkAction>();
  for (const row of rows) {
    let payload: unknown;
    try { payload = JSON.parse(row.extracted_text ?? "null")?.workbenchAction; } catch { continue; }
    const parsed = eventSchema.safeParse(payload);
    if (!parsed.success) continue;
    const event = parsed.data;
    let current = actions.get(event.actionId);
    if (!current) {
      current = { ...event, updatedAt: row.created_at, history: [] };
      actions.set(event.actionId, current);
    }
    current.history.push({ note: event.note, status: event.status, at: row.created_at, sourceUrl: event.sourceUrl, conclusion: event.conclusion });
  }
  return [...actions.values()];
}

/** Read all action history, not a recent-row window that could resurrect completed tasks. */
export async function loadWorkActions(db: SupabaseClient, userId: string): Promise<WorkAction[]> {
  const rows: SourceRow[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from("career_sources").select("id,source_type,extracted_text,created_at")
      .eq("user_id", userId).in("source_type", ["workbench_action", "evidence_response"])
      .order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + 499);
    if (error) throw new Error("Could not load your work. Please retry; your saved history has not been changed.");
    rows.push(...(data ?? []));
    if ((data ?? []).length < 500) break;
  }
  return assembleActions(rows);
}

/** Outcome and evidence share ONE insert: no task can complete while its findings fail to save. */
export function actionRecord(event: WorkEvent) {
  return {
    source_type: event.note || event.sourceUrl || event.conclusion ? "evidence_response" : "workbench_action",
    title: event.title,
    trust_state: "user_submitted",
    extracted_text: JSON.stringify({ workbenchAction: event, ...(event.note || event.sourceUrl || event.conclusion ? { response: {
      questionId: `workbench-${event.actionId}`, question: `${event.kind}: ${event.title}${event.context ? ` (${event.context})` : ""}`,
      answer: [event.note, event.conclusion ? `Research conclusion: ${event.conclusion === "unknown" ? "Unable to establish; insufficient information" : event.conclusion}.` : ""].filter(Boolean).join("\n") || "Source reference supplied; not independently reviewed.", confidence: "needs_verification", proofUrl: event.sourceUrl ?? "",
      sourceNote: event.kind === "goal" ? "User intention; not proof of capability or market demand." : "User-reported research; not independently verified.",
    } } : {}) }),
  };
}
