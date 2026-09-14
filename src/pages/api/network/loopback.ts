import type { APIRoute } from "astro";
import {
  parseConversationNotesForm,
  type ParsedConversationNote,
} from "@/lib/cip/conversation-notes";
import {
  buildConversationOutcome,
  conversationOutcomeCareerSourcePayload,
  saveConversationOutcome,
  type ConversationConfidence,
  type ConversationSignalDirection,
  type ConversationSignalType,
} from "@/lib/cip/conversation-outcomes";
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
    const metadata = readStructuredMetadata(form);
    if (!notes.length && hasStructuredMetadata(metadata)) {
      notes.push({
        fileName: metadata.contactName ? `Structured summary: ${metadata.contactName}` : "Structured conversation summary",
        kind: "pasted",
        status: "parsed",
        detail: "Captured structured summary fields without an attached notes file.",
        text: renderStructuredSummary(metadata),
      });
    }

    if (!notes.length) {
      return html('<p class="text-sm font-semibold text-red-700">Add a summary, paste notes, or upload at least one notes file (.txt, .md, .docx, .rtf, .json).</p>', 400);
    }

    const parsedNotes = notes.filter((note) => note.status === "parsed");
    const capturedAt = new Date().toISOString();
    let saved = 0;
    let saveError = "";
    let structuredTableError = "";

    for (const [index, note] of parsedNotes.entries()) {
      const outcome = buildConversationOutcome({
        contactName: metadata.contactName || contactNameFromNote(note.text) || note.fileName,
        conversationDate: metadata.conversationDate || capturedAt.slice(0, 10),
        sourceRef: `loopback:${normalize(note.fileName)}:${capturedAt}:${index}`,
        relatedLane: metadata.relatedLane,
        relatedEmployer: metadata.relatedEmployer,
        signalType: metadata.signalType,
        signalDirection: metadata.signalDirection,
        confidence: metadata.confidence,
        marketSignal: note.text,
        nextAction: metadata.nextAction,
        rawNoteExcerpt: note.text,
        createdAt: capturedAt,
      });
      const structured = await saveConversationOutcome(supabase, user.id, outcome);
      if (structured.error) {
        structuredTableError = structured.error.message;
      }
      const payload = {
        ...conversationOutcomeCareerSourcePayload(structured.payload),
        fileName: note.fileName,
        kind: note.kind,
      };

      const { error } = await supabase.from("career_sources").insert({
        user_id: user.id,
        source_type: "conversation_outcome",
        title: `Conversation outcome: ${note.fileName}`,
        url: null,
        extracted_text: JSON.stringify(payload),
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
          These notes are additive structured evidence. The next network analysis and the next evidence re-analysis will both read them, so what your advisors told you updates lanes, employer targets, and the evidence ledger.
        </p>
        ${saveError ? `<p class="mt-2 text-sm font-semibold text-red-700">Some notes failed to save: ${escapeHtml(saveError)}</p>` : ""}
        ${structuredTableError ? `<p class="mt-2 text-sm leading-6 text-[var(--muted)]">Saved to the evidence stream. The dedicated structured table also reported: ${escapeHtml(structuredTableError)}</p>` : ""}
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
              <span class="ml-2 rounded-md bg-[var(--accent-tint)] px-2 py-0.5 text-xs font-semibold ${note.status === "parsed" ? "text-[var(--accent-strong)]" : "text-red-700"}">${note.status === "parsed" ? "saved" : "skipped"}</span>
              <p class="mt-1 leading-6">${escapeHtml(note.detail)}${note.status === "parsed" ? ` ${note.text.length.toLocaleString()} characters captured.` : ""}</p>
            </li>
          `,
        )
        .join("")}
    </ul>
  `;
}

function readStructuredMetadata(form: FormData) {
  return {
    contactName: getText(form, "conversation_contact_name"),
    conversationDate: getText(form, "conversation_date"),
    relatedLane: getText(form, "related_lane"),
    relatedEmployer: getText(form, "related_employer"),
    signalType: getText(form, "signal_type") as ConversationSignalType,
    signalDirection: getText(form, "signal_direction") as ConversationSignalDirection,
    confidence: getText(form, "signal_confidence") as ConversationConfidence,
    nextAction: getText(form, "next_action"),
    summary: getText(form, "structured_summary"),
  };
}

function hasStructuredMetadata(metadata: ReturnType<typeof readStructuredMetadata>) {
  return Boolean(
    metadata.contactName ||
      metadata.relatedLane ||
      metadata.relatedEmployer ||
      metadata.nextAction ||
      metadata.summary,
  );
}

function renderStructuredSummary(metadata: ReturnType<typeof readStructuredMetadata>) {
  return [
    metadata.contactName ? `Source: ${metadata.contactName}` : "",
    metadata.conversationDate ? `Date: ${metadata.conversationDate}` : "",
    metadata.relatedLane ? `Related lane: ${metadata.relatedLane}` : "",
    metadata.relatedEmployer ? `Related employer: ${metadata.relatedEmployer}` : "",
    metadata.signalDirection ? `Signal direction: ${metadata.signalDirection}` : "",
    metadata.signalType ? `Signal type: ${metadata.signalType}` : "",
    metadata.confidence ? `Confidence: ${metadata.confidence}` : "",
    metadata.summary ? `Summary: ${metadata.summary}` : "",
    metadata.nextAction ? `Next action: ${metadata.nextAction}` : "",
  ].filter(Boolean).join("\n");
}

function contactNameFromNote(text: string) {
  const match = text.match(/(?:conversation|call|chat|met)\s+(?:with\s+)?([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){0,3})/);
  return match?.[1]?.trim() ?? "";
}

function getText(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, "-") || "note";
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
