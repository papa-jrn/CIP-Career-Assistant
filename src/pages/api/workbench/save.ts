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
    if (input.operation === "create") {
      const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
      const existing = (await loadWorkActions(db, user.id)).find(a => key(a.title) === key(input.title) && key(a.context) === key(input.context));
      if (existing) return returnToWork(`/workbench?view=work#action-${existing.actionId}`);
    }
    let event;
    if (input.operation === "outcome") {
      const prior = (await loadWorkActions(db, user.id)).find(a => a.actionId === input.actionId);
      if (!prior) return html("That action was not found in your workspace.", 404);
      event = { version: 1 as const, actionId: prior.actionId, title: prior.title, context: prior.context, kind: prior.kind, status: input.status, note: input.note };
    } else {
      event = { version: 1 as const, actionId: randomUUID(), title: input.title || "Career update", context: input.context, kind: input.kind,
        status: input.operation === "capture" ? "completed" as const : "active" as const, note: input.note };
    }
    const record = actionRecord(event);
    if (input.operation === "capture") {
      const payload = JSON.parse(record.extracted_text);
      delete payload.workbenchAction;
      payload.workbenchCapture = { kind: input.kind, context: input.context };
      record.extracted_text = JSON.stringify(payload);
    }
    const { error } = await db.from("career_sources").insert({ user_id: user.id, ...record });
    if (error) return html("Could not save. Your form is still here; please retry.", 500);
    return returnToWork();
  } catch { return html("Could not save. Your form is still here; please retry.", 500); }
};
