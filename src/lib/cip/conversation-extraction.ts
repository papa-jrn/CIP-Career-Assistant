import {
  signalConfidences,
  signalDirections,
  signalTypes,
  type ConversationConfidence,
  type ConversationOutcome,
  type ConversationSignalDirection,
  type ConversationSignalType,
} from "@/lib/cip/conversation-outcomes";

// Fields the extractor can infer from a raw conversation note. Deliberately a
// subset of ConversationOutcome: the strategy-relevant, typed signals that the
// propagation engine (strategic-state.ts) needs but that a user should not have
// to hand-encode. The raw note itself is preserved separately by the caller.
export type ExtractedConversationFields = Partial<
  Pick<
    ConversationOutcome,
    | "contactName"
    | "contactOrganization"
    | "contactTitle"
    | "relatedLane"
    | "relatedEmployer"
    | "signalType"
    | "signalDirection"
    | "confidence"
    | "compensationSignal"
    | "workModelSignal"
    | "cultureSignal"
    | "hiringSignal"
    | "marketSignal"
    | "newLeads"
    | "warnings"
    | "promisedFollowUp"
    | "followUpDueDate"
    | "nextAction"
  >
>;

export interface ConversationExtractionContext {
  /** Canonical watched-employer / candidate names, so the model links to the
   *  name the propagation engine already scores (e.g. "Dartmouth Hitchcock" in
   *  the note → the watched "Dartmouth Health"). */
  watchedEmployers?: string[];
  /** Canonical lane roles, so relatedLane matches an existing lane. */
  targetLanes?: string[];
  contactNameHint?: string;
  conversationDateHint?: string;
}

export interface ConversationExtractionResult {
  mode: "ai" | "heuristic" | "none";
  fields: ExtractedConversationFields;
}

const SIGNAL_TYPE_VALUES = new Set(signalTypes.map((item) => item.value));
const SIGNAL_DIRECTION_VALUES = new Set(signalDirections.map((item) => item.value));
const CONFIDENCE_VALUES = new Set(signalConfidences.map((item) => item.value));

/**
 * Turn a raw conversation note into typed strategic signals so the user never
 * has to fill dropdowns for the propagation engine to fire. The AI pass is the
 * real engine; a small deterministic heuristic is the graceful fallback when
 * there is no key or the call fails, so the loop still links a known employer
 * and an obvious layoff/hiring direction. Never throws; returns empty fields
 * rather than failing the note save.
 */
export async function extractConversationFields(
  noteText: string,
  context: ConversationExtractionContext = {},
  openAiKey?: string,
): Promise<ConversationExtractionResult> {
  const text = (noteText ?? "").trim();
  if (text.length < 12) return { mode: "none", fields: {} };

  if (openAiKey) {
    try {
      const ai = await extractWithAi(text, context, openAiKey);
      if (ai) return { mode: "ai", fields: ai };
    } catch {
      // Fall through to the heuristic below.
    }
  }

  return { mode: "heuristic", fields: heuristicExtract(text, context) };
}

async function extractWithAi(
  text: string,
  context: ConversationExtractionContext,
  openAiKey: string,
): Promise<ExtractedConversationFields | null> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: import.meta.env.OPENAI_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini",
      max_output_tokens: 1500,
      input: [
        {
          role: "system",
          content:
            "You extract typed career-strategy signals from a user's raw note about a conversation or a market event. Do not invent facts, employers, numbers, dates, or promises the note does not contain. Leave a field empty when the note does not support it. signalDirection is the impact on the user's job search for the related employer or lane: 'weakens' (e.g. layoffs, hiring freeze, bad fit), 'strengthens' (e.g. hiring, growth, strong fit, a warm intro), 'contradicts' (directly refutes a prior assumption), 'neutral', or 'unclear'. When the note names an employer that matches one on the provided watched list, use that list's exact canonical name. Choose relatedLane only from the provided lanes, and only when one clearly applies. Return concise JSON only.",
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Extract the structured signal fields from this note.",
            note: text,
            watched_employers: context.watchedEmployers?.slice(0, 60) ?? [],
            target_lanes: context.targetLanes?.slice(0, 12) ?? [],
            contact_name_hint: context.contactNameHint ?? "",
            conversation_date_hint: context.conversationDateHint ?? "",
            rules: [
              "relatedEmployer must be a canonical name from watched_employers when the note clearly refers to one; otherwise the employer's plain name, or empty.",
              "relatedLane must be one of target_lanes when one clearly applies; otherwise empty.",
              "Only set promisedFollowUp / followUpDueDate / nextAction when the note actually states them.",
              "confidence reflects how clearly the note supports the signal, not how important it is.",
            ],
          }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "conversation_signal_extraction",
          strict: true,
          schema: extractionSchema,
        },
      },
    }),
  });

  if (!response.ok) return null;
  const payload = await response.json();
  const raw = extractResponseText(payload);
  if (!raw) return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  return normalizeExtractedFields(parsed);
}

// Minimal, dependency-free fallback: link a known employer by name overlap and
// read an obvious layoff/hiring direction. Intentionally conservative — it fills
// only what it is confident about and leaves the rest for the user or a later
// AI pass.
function heuristicExtract(
  text: string,
  context: ConversationExtractionContext,
): ExtractedConversationFields {
  const fields: ExtractedConversationFields = {};
  const normalizedText = normalize(text);

  const employer = (context.watchedEmployers ?? []).find((name) => {
    const overlap = sharedSignificantTokens(normalize(name), normalizedText);
    return overlap >= 1 && normalizedText.includes(normalize(name).split(" ")[0]);
  });
  if (employer) fields.relatedEmployer = employer;

  const lane = (context.targetLanes ?? []).find(
    (role) => sharedSignificantTokens(normalize(role), normalizedText) >= 2,
  );
  if (lane) fields.relatedLane = lane;

  const weakens =
    /\b(laid off|layoffs?|job cuts|hiring freeze|freeze|downsiz|restructur|eliminat|closing|shut down|let go)\b/i.test(text) ||
    // "cut over 400 positions", "cut 400 jobs", "cutting staff", "400 roles cut"
    /\bcut(?:ting|s)?\b[^.]{0,30}\b(\d{2,}|positions?|jobs?|roles?|staff|workforce|headcount|employees)\b/i.test(text) ||
    /\b\d{2,}\s+(positions?|jobs?|roles?)\b[^.]{0,20}\bcut\b/i.test(text);
  const strengthens = /\b(hiring|expanding|growing|new (positions?|roles?)|open (positions?|roles?)|posting|warm intro|introduction|referral|great fit|strong fit)\b/i.test(text);
  if (weakens && !strengthens) {
    fields.signalDirection = "weakens";
    fields.signalType = fields.relatedEmployer ? "hiring_process" : "market_signal";
    fields.marketSignal = firstSentence(text);
  } else if (strengthens && !weakens) {
    fields.signalDirection = "strengthens";
    fields.signalType = fields.relatedEmployer ? "employer_fit" : "market_signal";
  }

  if (context.contactNameHint) fields.contactName = context.contactNameHint;
  return fields;
}

function normalizeExtractedFields(parsed: Record<string, unknown>): ExtractedConversationFields {
  const fields: ExtractedConversationFields = {};
  const str = (key: string) => (typeof parsed[key] === "string" ? (parsed[key] as string).trim() : "");

  const strings: Array<keyof ExtractedConversationFields> = [
    "contactName",
    "contactOrganization",
    "contactTitle",
    "relatedLane",
    "relatedEmployer",
    "compensationSignal",
    "workModelSignal",
    "cultureSignal",
    "hiringSignal",
    "marketSignal",
    "newLeads",
    "warnings",
    "promisedFollowUp",
    "followUpDueDate",
    "nextAction",
  ];
  for (const key of strings) {
    const value = str(key);
    if (value) (fields as Record<string, string>)[key] = value;
  }

  const signalType = str("signalType");
  if (SIGNAL_TYPE_VALUES.has(signalType as ConversationSignalType)) {
    fields.signalType = signalType as ConversationSignalType;
  }
  const signalDirection = str("signalDirection");
  if (SIGNAL_DIRECTION_VALUES.has(signalDirection as ConversationSignalDirection)) {
    fields.signalDirection = signalDirection as ConversationSignalDirection;
  }
  const confidence = str("confidence");
  if (CONFIDENCE_VALUES.has(confidence as ConversationConfidence)) {
    fields.confidence = confidence as ConversationConfidence;
  }

  return fields;
}

/**
 * User-entered structured fields always win over AI extraction; AI fills only
 * what the user left blank. This keeps the "the user CAN hand-code, but it is
 * never required" contract.
 */
export function mergeExtractedFields(
  userProvided: ExtractedConversationFields,
  extracted: ExtractedConversationFields,
): ExtractedConversationFields {
  const merged: ExtractedConversationFields = { ...extracted };
  for (const [key, value] of Object.entries(userProvided)) {
    if (typeof value === "string" && value.trim()) {
      (merged as Record<string, string>)[key] = value.trim();
    }
  }
  return merged;
}

const extractionSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "contactName",
    "contactOrganization",
    "contactTitle",
    "relatedLane",
    "relatedEmployer",
    "signalType",
    "signalDirection",
    "confidence",
    "compensationSignal",
    "workModelSignal",
    "cultureSignal",
    "hiringSignal",
    "marketSignal",
    "newLeads",
    "warnings",
    "promisedFollowUp",
    "followUpDueDate",
    "nextAction",
  ],
  properties: {
    contactName: { type: "string" },
    contactOrganization: { type: "string" },
    contactTitle: { type: "string" },
    relatedLane: { type: "string" },
    relatedEmployer: { type: "string" },
    signalType: { type: "string", enum: [...signalTypes.map((item) => item.value), ""] },
    signalDirection: { type: "string", enum: [...signalDirections.map((item) => item.value), ""] },
    confidence: { type: "string", enum: [...signalConfidences.map((item) => item.value), ""] },
    compensationSignal: { type: "string" },
    workModelSignal: { type: "string" },
    cultureSignal: { type: "string" },
    hiringSignal: { type: "string" },
    marketSignal: { type: "string" },
    newLeads: { type: "string" },
    warnings: { type: "string" },
    promisedFollowUp: { type: "string" },
    followUpDueDate: { type: "string" },
    nextAction: { type: "string" },
  },
};

function extractResponseText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const direct = (payload as { output_text?: unknown }).output_text;
  if (typeof direct === "string") return direct;

  const output = (payload as { output?: unknown }).output;
  if (!Array.isArray(output)) return null;

  const chunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const value = (part as { text?: unknown }).text;
      if (typeof value === "string") chunks.push(value);
    }
  }
  return chunks.length ? chunks.join("") : null;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function sharedSignificantTokens(a: string, b: string) {
  const left = new Set(a.split(" ").filter((token) => token.length > 3));
  return b.split(" ").filter((token) => left.has(token)).length;
}

function firstSentence(text: string) {
  const match = text.trim().match(/^.{0,240}?[.!?](?=\s|$)/);
  return (match?.[0] ?? text.slice(0, 240)).trim();
}
