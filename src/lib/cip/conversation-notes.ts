import type { AdvisorEvidenceResponse } from "@/lib/cip/advisor";
import { readZipEntries } from "@/lib/cip/network-intelligence";

// Loop-back conversation notes: after market-read conversations with
// advisors, the user uploads or pastes what they learned. Each note becomes
// an additive `conversation_outcome` career_sources record that feeds the
// next network analysis and evidence re-analysis pass.

export type ConversationNoteKind = "txt" | "md" | "docx" | "rtf" | "json" | "doc" | "pasted" | "unsupported";

export interface ParsedConversationNote {
  fileName: string;
  kind: ConversationNoteKind;
  status: "parsed" | "skipped";
  detail: string;
  text: string;
}

export interface ConversationNoteRecord {
  fileName: string;
  kind: ConversationNoteKind;
  text: string;
  captured_at: string;
}

const MAX_NOTE_CHARS = 60_000;
const MAX_NOTES_PER_IMPORT = 12;

export async function parseConversationNotesForm(form: FormData) {
  const notes: ParsedConversationNote[] = [];

  for (const value of form.getAll("note_files")) {
    if (!(value instanceof File) || !value.name) continue;
    if (notes.length >= MAX_NOTES_PER_IMPORT) break;
    notes.push(await parseConversationNoteFile(value));
  }

  const pasted = String(form.get("conversation_notes") ?? "").trim();
  if (pasted) {
    notes.push({
      fileName: "Pasted conversation notes",
      kind: "pasted",
      status: "parsed",
      detail: "Captured pasted conversation notes.",
      text: pasted.slice(0, MAX_NOTE_CHARS),
    });
  }

  return notes;
}

async function parseConversationNoteFile(file: File): Promise<ParsedConversationNote> {
  const name = file.name;
  const lower = name.toLowerCase();
  const bytes = Buffer.from(await file.arrayBuffer());

  try {
    if (lower.endsWith(".txt") || lower.endsWith(".md")) {
      return finishNote(name, lower.endsWith(".md") ? "md" : "txt", bytes.toString("utf8"), "Read plain-text note.");
    }

    if (lower.endsWith(".docx")) {
      const text = extractDocxText(bytes);
      return text
        ? finishNote(name, "docx", text, "Extracted text from the Word document.")
        : skipNote(name, "docx", "Could not read text from this Word document. Try saving it as .txt or pasting the notes.");
    }

    if (lower.endsWith(".rtf")) {
      const text = extractRtfText(bytes.toString("utf8"));
      return text
        ? finishNote(name, "rtf", text, "Extracted text from the rich-text document.")
        : skipNote(name, "rtf", "Could not read text from this RTF file. Try saving it as .txt or pasting the notes.");
    }

    if (lower.endsWith(".json")) {
      const text = extractJsonText(bytes.toString("utf8"));
      return text
        ? finishNote(name, "json", text, "Read JSON note data.")
        : skipNote(name, "json", "The JSON file could not be parsed.");
    }

    if (lower.endsWith(".doc")) {
      // Legacy .doc is a binary format, but this app's own exports are
      // HTML-based .doc files, which are readable as text.
      const text = extractDocText(bytes);
      return text
        ? finishNote(name, "doc", text, "Read text from the .doc file.")
        : skipNote(name, "doc", "This .doc file uses the old binary Word format. Save it as .docx or .txt instead.");
    }

    return skipNote(
      name,
      "unsupported",
      "Unsupported file type. Upload .txt, .md, .docx, .rtf, or .json notes, or paste the notes directly.",
    );
  } catch {
    return skipNote(name, "unsupported", "Could not read this file. Try saving it as .txt or pasting the notes.");
  }
}

function finishNote(fileName: string, kind: ConversationNoteKind, text: string, detail: string): ParsedConversationNote {
  const cleaned = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!cleaned) return skipNote(fileName, kind, "The file was readable but contained no text.");
  return {
    fileName,
    kind,
    status: "parsed",
    detail,
    text: cleaned.slice(0, MAX_NOTE_CHARS),
  };
}

function skipNote(fileName: string, kind: ConversationNoteKind, detail: string): ParsedConversationNote {
  return { fileName, kind, status: "skipped", detail, text: "" };
}

function extractDocxText(bytes: Buffer) {
  const entries = readZipEntries(bytes, /^word\/document\.xml$/i);
  const xml = entries[0]?.text;
  if (!xml) return "";

  return decodeXmlEntities(
    xml
      .replace(/<w:tab[^>]*\/>/g, "\t")
      .replace(/<w:br[^>]*\/>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<[^>]+>/g, ""),
  );
}

function extractRtfText(rtf: string) {
  if (!rtf.startsWith("{\\rtf")) return "";

  return decodeRtfEscapes(
    rtf
      // Drop destination groups (font tables, color tables, metadata, images).
      .replace(/\{\\\*[^{}]*\}/g, "")
      .replace(/\{\\(fonttbl|colortbl|stylesheet|info|pict)[^{}]*(\{[^{}]*\})*[^{}]*\}/g, "")
      .replace(/\\par[d]?\b/g, "\n")
      .replace(/\\tab\b/g, "\t")
      .replace(/\\line\b/g, "\n")
      // Remove remaining control words, keep their following text.
      .replace(/\\[a-zA-Z]+-?\d* ?/g, "")
      .replace(/[{}]/g, ""),
  );
}

function decodeRtfEscapes(text: string) {
  return text
    .replace(/\\'([0-9a-fA-F]{2})/g, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\([\\{}])/g, "$1");
}

function extractJsonText(raw: string) {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return "";
  }
}

function extractDocText(bytes: Buffer) {
  // Binary Word files start with the OLE compound-file signature.
  if (bytes.length >= 4 && bytes.readUInt32LE(0) === 0xe011cfd0) return "";

  const raw = bytes.toString("utf8");
  if (/<html|<body/i.test(raw)) {
    return decodeXmlEntities(
      raw
        .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
        .replace(/<(br|\/p|\/div|\/h[1-6]|\/li|\/tr)[^>]*>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/[ \t]+/g, " "),
    );
  }

  // Reject mostly-binary content read as text.
  const controlChars = raw.slice(0, 2000).match(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g)?.length ?? 0;
  return controlChars > 10 ? "" : raw;
}

function decodeXmlEntities(text: string) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&apos;|&#x27;/g, "'");
}

// Convert saved conversation_outcome records into advisor evidence items so
// market-read learnings update the evidence ledger and sufficiency score.
export function conversationNotesToEvidence(
  records: Array<{ fileName?: string; text?: string; captured_at?: string }>,
): AdvisorEvidenceResponse[] {
  return records
    .filter((record) => record.text?.trim())
    .map((record) => ({
      question: `What did the conversation captured in "${record.fileName ?? "conversation notes"}" teach you about your market, lanes, or targets?`,
      answer: String(record.text).slice(0, 6_000),
      confidence: "first-hand conversation notes",
      sourceNote: `Loop-back conversation notes${record.captured_at ? ` saved ${record.captured_at}` : ""}. Treat as the user's own report of an advisor/market-read conversation.`,
    }));
}
