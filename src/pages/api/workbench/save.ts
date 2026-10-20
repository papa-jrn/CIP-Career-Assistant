import { inputId, loadSavedGoalEvidence } from "@/lib/cip/goal-synthesis";
import type { APIRoute } from "astro";
import { randomUUID } from "node:crypto";
import { isSameOriginRequest } from "@/lib/security";
import { createServer } from "@/lib/supabase/server";
import { actionRecord, loadWorkActions, workInput } from "@/lib/cip/workbench-actions";
import { escapeHtml } from "@/lib/cip/job-search-view";
const html = (message: string, status = 200) => new Response(`<p role="status">${escapeHtml(message)}</p>`, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOriginRequest(request)) return html("Invalid request origin.", 403);
  if (!import.meta.env.PUBLIC_SUPABASE_URL || !import.meta.env.PUBLIC_SUPABASE_ANON_KEY) return html("Storage is not configured. Nothing was saved.", 503);
  const returnToWork = (path = "/workbench?view=work") => request.headers.get("HX-Request") === "true"
    ? new Response(null, { status: 200, headers: { "HX-Redirect": path } })
    : new Response(null, { status: 303, headers: { Location: path } });
  try {
    const db = createServer(cookies);
    const { data: { user } } = await db.auth.getUser();
    if (!user) return html("Sign in before saving work.", 401);
    const body = await request.text();
    if (body.length > 60000) return html("This update is too large. Shorten the note.", 413);
    const parsed = workInput.safeParse(Object.fromEntries(new URLSearchParams(body)));
    if (!parsed.success) return html(parsed.error.issues[0]?.message ?? "Check your update.", 400);
    const input = parsed.data;
    if (input.supersedesGoalId) {
      const ownedInputs = await loadSavedGoalEvidence(db, user.id, true);
      if (!ownedInputs.some(item => inputId(item) === input.supersedesGoalId)) return html("The goal or source to correct was not found in your workspace.", 404);
    }
    if (input.operation === "create") {
      const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
      const existing = (await loadWorkActions(db, user.id)).find(a => key(a.title) === key(input.title) && key(a.context) === key(input.context));
      if (existing) return returnToWork(`/workbench?view=work&action=${existing.actionId}#research-editor`);
    }
    let event;
    if (input.operation === "outcome") {
      const prior = (await loadWorkActions(db, user.id)).find(a => a.actionId === input.actionId);
      if (!prior) return html("That action was not found in your workspace.", 404);
      event = { version: 1 as const, actionId: prior.actionId, title: prior.title, context: prior.context, kind: prior.kind, status: input.status, note: input.note, sourceUrl: input.sourceUrl, conclusion: input.conclusion };
    } else {
      event = { version: 1 as const, actionId: randomUUID(), title: input.title || "Career update", context: input.context, kind: input.kind,
        status: input.operation === "capture" ? "completed" as const : "active" as const, note: input.note, sourceUrl: input.sourceUrl, conclusion: input.conclusion };
    }
    const record = actionRecord(event);
    if (input.operation === "capture") {
      const payload = JSON.parse(record.extracted_text);
      if (input.supersedesGoalId && inputId(payload.response) === input.supersedesGoalId) return html("Describe what changed in the goal before replacing it.", 400);
      delete payload.workbenchAction;
      payload.workbenchCapture = { kind: input.kind, context: input.context, ...(input.supersedesGoalId ? { supersedesGoalId: input.supersedesGoalId } : {}) };
      record.extracted_text = JSON.stringify(payload);
    }
    const { error } = await db.from("career_sources").insert({ user_id: user.id, ...record });
    if (error) return html("Could not save. Your form is still here; please retry.", 500);
    return returnToWork(input.operation === "capture" ? "/workbench?view=work&saved=update" : `/workbench?view=work&action=${event.actionId}&saved=work#research-editor`);
  } catch { return html("Could not save. Your form is still here; please retry.", 500); }
};
