import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdvisorEvidenceResponse } from "@/lib/cip/advisor";

export type ConversationSignalDirection = "strengthens" | "weakens" | "neutral" | "unclear" | "contradicts";
export type ConversationSignalType =
  | "lane_fit"
  | "employer_fit"
  | "compensation"
  | "hiring_process"
  | "culture"
  | "network_path"
  | "role_language"
  | "dealbreaker"
  | "new_target"
  | "follow_up_obligation"
  | "market_signal";
export type ConversationConfidence = "high" | "medium" | "low";

export interface ConversationOutcome {
  contactName: string;
  contactOrganization: string;
  contactTitle: string;
  conversationDate: string;
  sourceNoteId?: string;
  sourceRef: string;
  relatedLane: string;
  relatedEmployer: string;
  signalType: ConversationSignalType;
  signalDirection: ConversationSignalDirection;
  confidence: ConversationConfidence;
  compensationSignal: string;
  workModelSignal: string;
  cultureSignal: string;
  hiringSignal: string;
  marketSignal: string;
  newLeads: string;
  warnings: string;
  promisedFollowUp: string;
  followUpDueDate: string;
  nextAction: string;
  rawNoteExcerpt: string;
  createdAt?: string;
}

export const signalTypes: Array<{ value: ConversationSignalType; label: string }> = [
  { value: "lane_fit", label: "Lane fit" },
  { value: "employer_fit", label: "Employer fit" },
  { value: "compensation", label: "Compensation" },
  { value: "hiring_process", label: "Hiring process" },
  { value: "culture", label: "Culture" },
  { value: "network_path", label: "Network path" },
  { value: "role_language", label: "Role language" },
  { value: "dealbreaker", label: "Dealbreaker" },
  { value: "new_target", label: "New target" },
  { value: "follow_up_obligation", label: "Follow-up obligation" },
  { value: "market_signal", label: "Market signal" },
];

export const signalDirections: Array<{ value: ConversationSignalDirection; label: string }> = [
  { value: "strengthens", label: "Strengthens" },
  { value: "weakens", label: "Weakens" },
  { value: "neutral", label: "Neutral" },
  { value: "unclear", label: "Unclear" },
  { value: "contradicts", label: "Contradicts" },
];

export const signalConfidences: Array<{ value: ConversationConfidence; label: string }> = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const SIGNAL_TYPE_VALUES = new Set(signalTypes.map((item) => item.value));
const SIGNAL_DIRECTION_VALUES = new Set(signalDirections.map((item) => item.value));
const CONFIDENCE_VALUES = new Set(signalConfidences.map((item) => item.value));

export function buildConversationOutcome(input: Partial<ConversationOutcome>): ConversationOutcome {
  const raw = [
    input.marketSignal,
    input.compensationSignal,
    input.workModelSignal,
    input.cultureSignal,
    input.hiringSignal,
    input.newLeads,
    input.warnings,
    input.promisedFollowUp,
    input.nextAction,
    input.rawNoteExcerpt,
  ]
    .map(textValue)
    .filter(Boolean)
    .join("\n");

  return {
    contactName: textValue(input.contactName) || "Unknown contact",
    contactOrganization: textValue(input.contactOrganization),
    contactTitle: textValue(input.contactTitle),
    conversationDate: textValue(input.conversationDate) || new Date().toISOString().slice(0, 10),
    sourceNoteId: textValue(input.sourceNoteId) || undefined,
    sourceRef: textValue(input.sourceRef),
    relatedLane: textValue(input.relatedLane),
    relatedEmployer: textValue(input.relatedEmployer),
    signalType: normalizeSignalType(input.signalType),
    signalDirection: normalizeSignalDirection(input.signalDirection),
    confidence: normalizeConfidence(input.confidence),
    compensationSignal: textValue(input.compensationSignal),
    workModelSignal: textValue(input.workModelSignal),
    cultureSignal: textValue(input.cultureSignal),
    hiringSignal: textValue(input.hiringSignal),
    marketSignal: textValue(input.marketSignal),
    newLeads: textValue(input.newLeads),
    warnings: textValue(input.warnings),
    promisedFollowUp: textValue(input.promisedFollowUp),
    followUpDueDate: textValue(input.followUpDueDate),
    nextAction: textValue(input.nextAction),
    rawNoteExcerpt: excerpt(raw || textValue(input.rawNoteExcerpt), 1600),
    createdAt: textValue(input.createdAt) || undefined,
  };
}

export function parseConversationOutcome(value: unknown): ConversationOutcome | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const nested = record.structured_outcome && typeof record.structured_outcome === "object"
    ? (record.structured_outcome as Record<string, unknown>)
    : record;

  const contactName = readAny(nested, ["contactName", "contact_name"]);
  const text = readAny(record, ["text"]);
  if (!contactName && !text) return null;

  return buildConversationOutcome({
    contactName: contactName || readContactFromText(text),
    contactOrganization: readAny(nested, ["contactOrganization", "contact_organization"]),
    contactTitle: readAny(nested, ["contactTitle", "contact_title"]),
    conversationDate: readAny(nested, ["conversationDate", "conversation_date"]),
    sourceNoteId: readAny(nested, ["sourceNoteId", "source_note_id"]),
    sourceRef: readAny(nested, ["sourceRef", "source_ref"]),
    relatedLane: readAny(nested, ["relatedLane", "related_lane"]),
    relatedEmployer: readAny(nested, ["relatedEmployer", "related_employer"]),
    signalType: readAny(nested, ["signalType", "signal_type"]) as ConversationSignalType,
    signalDirection: readAny(nested, ["signalDirection", "signal_direction"]) as ConversationSignalDirection,
    confidence: readAny(nested, ["confidence"]) as ConversationConfidence,
    compensationSignal: readAny(nested, ["compensationSignal", "compensation_signal"]),
    workModelSignal: readAny(nested, ["workModelSignal", "work_model_signal"]),
    cultureSignal: readAny(nested, ["cultureSignal", "culture_signal"]),
    hiringSignal: readAny(nested, ["hiringSignal", "hiring_signal"]),
    marketSignal: readAny(nested, ["marketSignal", "market_signal"]) || text,
    newLeads: readAny(nested, ["newLeads", "new_leads"]),
    warnings: readAny(nested, ["warnings"]),
    promisedFollowUp: readAny(nested, ["promisedFollowUp", "promised_follow_up"]),
    followUpDueDate: readAny(nested, ["followUpDueDate", "follow_up_due_date"]),
    nextAction: readAny(nested, ["nextAction", "next_action"]),
    rawNoteExcerpt: readAny(nested, ["rawNoteExcerpt", "raw_note_excerpt"]) || text,
    createdAt: readAny(nested, ["createdAt", "created_at"]) || readAny(record, ["captured_at"]),
  });
}

export function conversationOutcomesToEvidence(outcomes: ConversationOutcome[]): AdvisorEvidenceResponse[] {
  return outcomes.map((outcome) => ({
    question: `What changed after the conversation with ${outcome.contactName}?`,
    answer: renderOutcomeText(outcome),
    confidence: `first-hand conversation outcome (${outcome.confidence} confidence)`,
    sourceNote: [
      "Structured conversation outcome.",
      outcome.createdAt ? `Saved ${outcome.createdAt}.` : "",
      outcome.relatedLane ? `Related lane: ${outcome.relatedLane}.` : "",
      outcome.relatedEmployer ? `Related employer: ${outcome.relatedEmployer}.` : "",
      `Direction: ${outcome.signalDirection}.`,
      `Signal type: ${outcome.signalType}.`,
    ].filter(Boolean).join(" "),
  }));
}

export function renderOutcomeText(outcome: ConversationOutcome) {
  return [
    `Contact: ${outcome.contactName}`,
    outcome.contactTitle || outcome.contactOrganization
      ? `Context: ${[outcome.contactTitle, outcome.contactOrganization].filter(Boolean).join(" at ")}`
      : "",
    outcome.conversationDate ? `Conversation date: ${outcome.conversationDate}` : "",
    outcome.relatedLane ? `Related lane: ${outcome.relatedLane}` : "",
    outcome.relatedEmployer ? `Related employer: ${outcome.relatedEmployer}` : "",
    `Signal: ${outcome.signalDirection} / ${outcome.signalType} / ${outcome.confidence} confidence`,
    outcome.marketSignal ? `Market signal: ${outcome.marketSignal}` : "",
    outcome.compensationSignal ? `Compensation signal: ${outcome.compensationSignal}` : "",
    outcome.workModelSignal ? `Work model signal: ${outcome.workModelSignal}` : "",
    outcome.cultureSignal ? `Culture signal: ${outcome.cultureSignal}` : "",
    outcome.hiringSignal ? `Hiring signal: ${outcome.hiringSignal}` : "",
    outcome.newLeads ? `New leads: ${outcome.newLeads}` : "",
    outcome.warnings ? `Warnings: ${outcome.warnings}` : "",
    outcome.promisedFollowUp ? `Promised follow-up: ${outcome.promisedFollowUp}` : "",
    outcome.followUpDueDate ? `Follow-up due: ${outcome.followUpDueDate}` : "",
    outcome.nextAction ? `Next action: ${outcome.nextAction}` : "",
    outcome.rawNoteExcerpt ? `Raw note: ${outcome.rawNoteExcerpt}` : "",
  ].filter(Boolean).join("\n");
}

export async function saveConversationOutcome(
  supabase: SupabaseClient,
  userId: string,
  outcome: ConversationOutcome,
) {
  const now = new Date().toISOString();
  const payload = buildConversationOutcome({ ...outcome, createdAt: outcome.createdAt ?? now });
  const row = {
    user_id: userId,
    contact_name: payload.contactName,
    contact_organization: payload.contactOrganization || null,
    contact_title: payload.contactTitle || null,
    conversation_date: payload.conversationDate || null,
    source_note_id: payload.sourceNoteId ?? null,
    source_ref: payload.sourceRef || null,
    related_lane: payload.relatedLane || null,
    related_employer: payload.relatedEmployer || null,
    signal_type: payload.signalType,
    signal_direction: payload.signalDirection,
    confidence: payload.confidence,
    compensation_signal: payload.compensationSignal,
    work_model_signal: payload.workModelSignal,
    culture_signal: payload.cultureSignal,
    hiring_signal: payload.hiringSignal,
    market_signal: payload.marketSignal,
    new_leads: payload.newLeads,
    warnings: payload.warnings,
    promised_follow_up: payload.promisedFollowUp,
    follow_up_due_date: payload.followUpDueDate || null,
    next_action: payload.nextAction,
    raw_note_excerpt: payload.rawNoteExcerpt,
    created_at: payload.createdAt ?? now,
    updated_at: now,
  };

  const { error } = await supabase.from("conversation_outcomes").insert(row);
  return { error, payload };
}

export function conversationOutcomeCareerSourcePayload(outcome: ConversationOutcome) {
  return {
    fileName: `Structured conversation with ${outcome.contactName}`,
    kind: "structured_outcome",
    text: renderOutcomeText(outcome),
    captured_at: outcome.createdAt ?? new Date().toISOString(),
    structured_outcome: outcome,
  };
}

export function outcomeHasStrategicContent(outcome: ConversationOutcome) {
  return Boolean(
    outcome.relatedLane ||
      outcome.relatedEmployer ||
      outcome.marketSignal ||
      outcome.compensationSignal ||
      outcome.workModelSignal ||
      outcome.cultureSignal ||
      outcome.hiringSignal ||
      outcome.newLeads ||
      outcome.warnings ||
      outcome.promisedFollowUp ||
      outcome.nextAction ||
      outcome.rawNoteExcerpt,
  );
}

function normalizeSignalType(value: unknown): ConversationSignalType {
  return typeof value === "string" && SIGNAL_TYPE_VALUES.has(value as ConversationSignalType)
    ? value as ConversationSignalType
    : "market_signal";
}

function normalizeSignalDirection(value: unknown): ConversationSignalDirection {
  return typeof value === "string" && SIGNAL_DIRECTION_VALUES.has(value as ConversationSignalDirection)
    ? value as ConversationSignalDirection
    : "unclear";
}

function normalizeConfidence(value: unknown): ConversationConfidence {
  return typeof value === "string" && CONFIDENCE_VALUES.has(value as ConversationConfidence)
    ? value as ConversationConfidence
    : "medium";
}

function readAny(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function readContactFromText(text: string) {
  const match = text.match(/conversation with ([^\n.]+)/i);
  return match?.[1]?.trim() ?? "";
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function excerpt(value: string, max: number) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}...` : cleaned;
}
