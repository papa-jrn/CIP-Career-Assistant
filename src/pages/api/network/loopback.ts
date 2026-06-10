import type { APIRoute } from "astro";
import {
  parseConversationNotesForm,
  type ParsedConversationNote,
} from "@/lib/cip/conversation-notes";
import { isSameOriginRequest } from "@/lib/security";
import { createServer } from "@/lib/supabase/server";

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOriginRequest(request)) {
    return html('<p class="text-sm text-red-700">Invalid request origin.</p>', 403);
  }

  if (
    !import.meta.env.PUBLIC_SUPABASE_URL ||
    !import.meta.env.PUBLIC_SUPABASE_ANON_KEY
  ) {
    return html('<p class="text-sm font-semibold text-red-700">Supabase is not configured, so conversation notes cannot be saved.</p>', 500);
  }

  try {
    const supabase = createServer(cookies);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return html('<p class="text-sm font-semibold text-red-700">Sign in before saving conversation notes.</p>', 401);
    }

    const form = await request.formData();
    const notes = await parseConversationNotesForm(form);

    if (!notes.length) {
      return html('<p class="text-sm font-semibold text-red-700">Add at least one notes file (.txt, .md, .docx, .rtf, .json) or paste conversation notes.</p>', 400);
    }

    const parsedNotes = notes.filter((note) => note.status === "parsed");
    const capturedAt = new Date().toISOString();
    let saved = 0;
    let saveError = "";

    for (const note of parsedNotes) {
      const { error } = await supabase.from("career_sources").insert({
        user_id: user.id,
        source_type: "conversation_outcome",
        title: `Conversation notes: ${note.fileName}`,
        url: null,
        extracted_text: JSON.stringify({
          fileName: note.fileName,
          kind: note.kind,
          text: note.text,
          captured_at: capturedAt,
        }),
        trust_state: "user_supplied",
      });

      if (error) {
        saveError = error.message;
      } else {
        saved += 1;
      }
    }

    if (!saved) {
      const reason = saveError || notes[0]?.detail || "No readable notes were found.";
      return html(`
        <div class="rounded-md border border-[var(--line)] bg-[var(--background)] p-4">
          <p class="text-sm font-semibold text-red-700">No conversation notes were saved.</p>
          <p class="mt-2 text-sm leading-6 text-[var(--muted)]">${escapeHtml(reason)}</p>
          ${renderNoteSummary(notes)}
        </div>
      `, saveError ? 500 : 400);
    }

    return html(`
      <div class="rounded-md border border-[var(--line)] bg-[var(--background)] p-4">
        <p class="text-sm font-semibold text-[var(--accent-strong)]">Saved ${saved} conversation note record${saved === 1 ? "" : "s"}.</p>
        <p class="mt-2 text-sm leading-6 text-[var(--muted)]">
          These notes are additive evidence. The next network analysis and the next evidence re-analysis will both read them, so what your advisors told you updates lanes, employer targets, and the evidence ledger.
        </p>
        ${saveError ? `<p class="mt-2 text-sm font-semibold text-red-700">Some notes failed to save: ${escapeHtml(saveError)}</p>` : ""}
        ${renderNoteSummary(notes)}
        <div class="mt-4 flex flex-wrap gap-2">
          <a class="cip-fancy-button cip-fancy-button-secondary" href="/evidence"><span>Run evidence re-analysis</span></a>
          <a class="cip-fancy-button cip-fancy-button-secondary" href="/employers"><span>Update employer targets</span></a>
        </div>
      </div>
    `);
  } catch (error) {
    return html(`<p class="text-sm font-semibold text-red-700">Conversation note import failed: ${escapeHtml(error instanceof Error ? error.message : "Unknown error")}</p>`, 500);
  }
};

function renderNoteSummary(notes: ParsedConversationNote[]) {
  return `
    <ul class="mt-3 space-y-2 text-sm text-[var(--muted)]">
      ${notes
        .map(
          (note) => `
            <li class="rounded-md border border-[var(--line)] bg-[var(--panel)] p-3">
              <span class="font-semibold text-[var(--foreground)]">${escapeHtml(note.fileName)}</span>
              <span class="ml-2 rounded-md bg-[rgba(126,217,87,0.18)] px-2 py-0.5 text-xs font-semibold ${note.status === "parsed" ? "text-[var(--accent-strong)]" : "text-red-700"}">${note.status === "parsed" ? "saved" : "skipped"}</span>
              <p class="mt-1 leading-6">${escapeHtml(note.detail)}${note.status === "parsed" ? ` ${note.text.length.toLocaleString()} characters captured.` : ""}</p>
            </li>
          `,
        )
        .join("")}
    </ul>
  `;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function html(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
