import type { APIRoute } from "astro";
import {
  buildConversationOutcome,
  conversationOutcomeCareerSourcePayload,
  outcomeHasStrategicContent,
  saveConversationOutcome,
  type ConversationConfidence,
  type ConversationSignalDirection,
  type ConversationSignalType,
} from "@/lib/cip/conversation-outcomes";
import { isSameOriginRequest } from "@/lib/security";
import { createServer } from "@/lib/supabase/server";

type StructuredFeedback = {
  contactName: string;
  contactOrganization: string;
  contactTitle: string;
  feedbackType: string;
  note: string;
  conversationStatus: string;
  followUpDate: string;
  followUpIntent: string;
  decisionReason: string;
  relatedLane: string;
  relatedEmployer: string;
  signalType: ConversationSignalType;
  signalDirection: ConversationSignalDirection;
  signalConfidence: ConversationConfidence;
  compensationSignal: string;
  workModelSignal: string;
  cultureSignal: string;
  hiringSignal: string;
  marketSignals: string;
  newLeads: string;
  warnings: string;
  promisedFollowUp: string;
  nextAction: string;
  laneImpact: string;
};

// Conversation statuses that mean a real conversation happened, so the
// captured signals should flow into analysis as a conversation outcome.
const CONVERSATION_HELD = new Set(["Met", "Follow-up", "Intro offered"]);

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOriginRequest(request)) {
    return html('<p class="text-sm text-red-700">Invalid request origin.</p>', 403);
  }

  if (
    !import.meta.env.PUBLIC_SUPABASE_URL ||
    !import.meta.env.PUBLIC_SUPABASE_ANON_KEY
  ) {
    return html('<p class="text-sm font-semibold text-red-700">Supabase is not configured, so feedback cannot be saved.</p>', 500);
  }

  const form = await request.formData();
  const contactName = getText(form, "contact_name");
  if (!contactName) {
    return html('<p class="text-sm font-semibold text-red-700">Missing contact name.</p>', 400);
  }

  const incoming = {
    contactOrganization: getText(form, "contact_organization"),
    contactTitle: getText(form, "contact_title"),
    feedbackType: getText(form, "feedback_type"),
    note: getText(form, "feedback_note"),
    conversationStatus: getText(form, "conversation_status"),
    followUpDate: getText(form, "follow_up_date"),
    followUpIntent: getText(form, "follow_up_intent"),
    decisionReason: getText(form, "decision_reason"),
    relatedLane: getText(form, "related_lane"),
    relatedEmployer: getText(form, "related_employer"),
    signalType: getText(form, "signal_type") as ConversationSignalType,
    signalDirection: getText(form, "signal_direction") as ConversationSignalDirection,
    signalConfidence: getText(form, "signal_confidence") as ConversationConfidence,
    compensationSignal: getText(form, "compensation_signal"),
    workModelSignal: getText(form, "work_model_signal"),
    cultureSignal: getText(form, "culture_signal"),
    hiringSignal: getText(form, "hiring_signal"),
    marketSignals: getText(form, "market_signals"),
    newLeads: getText(form, "new_leads"),
    warnings: getText(form, "warnings"),
    promisedFollowUp: getText(form, "promised_follow_up"),
    nextAction: getText(form, "next_action"),
    laneImpact: getText(form, "lane_impact"),
  };

  try {
    const supabase = createServer(cookies);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return html('<p class="text-sm font-semibold text-red-700">Sign in before saving network feedback.</p>', 401);
    }

    // Merge over the latest saved review for this contact so a quick status
    // change (or any partial save) does not wipe previously captured fields.
    const previous = await loadLatestFeedback(supabase, user.id, contactName);
    const feedback: StructuredFeedback = {
      contactName,
      contactOrganization: pick(incoming.contactOrganization, previous?.contactOrganization),
      contactTitle: pick(incoming.contactTitle, previous?.contactTitle),
      feedbackType: incoming.feedbackType || previous?.feedbackType || "context",
      note: pick(incoming.note, previous?.note),
      conversationStatus: pick(incoming.conversationStatus, previous?.conversationStatus),
      followUpDate: pick(incoming.followUpDate, previous?.followUpDate),
      followUpIntent: pick(incoming.followUpIntent, previous?.followUpIntent),
      decisionReason: pick(incoming.decisionReason, previous?.decisionReason),
      relatedLane: pick(incoming.relatedLane, previous?.relatedLane),
      relatedEmployer: pick(incoming.relatedEmployer, previous?.relatedEmployer),
      signalType: incoming.signalType || previous?.signalType || "market_signal",
      signalDirection: incoming.signalDirection || previous?.signalDirection || "unclear",
      signalConfidence: incoming.signalConfidence || previous?.signalConfidence || "medium",
      compensationSignal: pick(incoming.compensationSignal, previous?.compensationSignal),
      workModelSignal: pick(incoming.workModelSignal, previous?.workModelSignal),
      cultureSignal: pick(incoming.cultureSignal, previous?.cultureSignal),
      hiringSignal: pick(incoming.hiringSignal, previous?.hiringSignal),
      marketSignals: pick(incoming.marketSignals, previous?.marketSignals),
      newLeads: pick(incoming.newLeads, previous?.newLeads),
      warnings: pick(incoming.warnings, previous?.warnings),
      promisedFollowUp: pick(incoming.promisedFollowUp, previous?.promisedFollowUp),
      nextAction: pick(incoming.nextAction, previous?.nextAction),
      laneImpact: pick(incoming.laneImpact, previous?.laneImpact),
    };

    // When a contact moves to "Awaiting reply" and no follow-up date is set,
    // default one ~5 business days out so a nudge will fire without the user
    // having to track it by hand.
    if (feedback.conversationStatus === "Awaiting reply" && !feedback.followUpDate) {
      feedback.followUpDate = addBusinessDays(5);
    }

    const now = new Date().toISOString();
    const { error } = await supabase.from("career_sources").insert({
      user_id: user.id,
      source_type: "network_feedback",
      title: `Network feedback: ${contactName}`,
      url: null,
      extracted_text: JSON.stringify({ feedback, created_at: now }),
      trust_state: "user_supplied",
    });

    if (error) {
      return html(`<p class="text-sm font-semibold text-red-700">Could not save feedback: ${escapeHtml(error.message)}</p>`, 500);
    }

    // When a real conversation happened and produced content, mirror it into a
    // conversation_outcome record. That is the source type the network analysis
    // and evidence re-analysis already read, so what the user learns here
    // actually sharpens later employer and role research. One log per contact
    // is maintained (replace, not append) so repeated saves do not crowd the
    // capped loop-back notes with duplicates.
    let conversationLogged = false;
    if (shouldLogConversation(feedback)) {
      conversationLogged = await replaceConversationOutcome(supabase, user.id, feedback, now);
    }

    return html(`
      <div class="rounded-md border border-[var(--line)] bg-[var(--accent-soft)] p-3">
        <p class="text-sm font-semibold text-[var(--accent-strong)]">Saved review for ${escapeHtml(contactName)}.</p>
        <p class="mt-1 text-sm leading-6 text-[var(--muted)]">
          ${conversationLogged
            ? "Conversation captured. The next network and evidence re-analysis will read it as first-hand market evidence."
            : "Future network analyses will use this decision and relationship context."}
        </p>
      </div>
    `);
  } catch (error) {
    return html(
      `<p class="text-sm font-semibold text-red-700">Network feedback failed: ${escapeHtml(error instanceof Error ? error.message : "Unexpected error.")}</p>`,
      500,
    );
  }
};

async function loadLatestFeedback(
  supabase: ReturnType<typeof createServer>,
  userId: string,
  contactName: string,
): Promise<StructuredFeedback | null> {
  const { data } = await supabase
    .from("career_sources")
    .select("extracted_text")
    .eq("user_id", userId)
    .eq("source_type", "network_feedback")
    .order("created_at", { ascending: false })
    .limit(200);

  const target = normalize(contactName);
  for (const row of data ?? []) {
    try {
      const parsed = JSON.parse(row.extracted_text)?.feedback;
      if (parsed?.contactName && normalize(String(parsed.contactName)) === target) {
        return {
          contactName: String(parsed.contactName),
          contactOrganization: String(parsed.contactOrganization || ""),
          contactTitle: String(parsed.contactTitle || ""),
          feedbackType: String(parsed.feedbackType || "context"),
          note: String(parsed.note || ""),
          conversationStatus: String(parsed.conversationStatus || ""),
          followUpDate: String(parsed.followUpDate || ""),
          followUpIntent: String(parsed.followUpIntent || ""),
          decisionReason: String(parsed.decisionReason || ""),
          relatedLane: String(parsed.relatedLane || ""),
          relatedEmployer: String(parsed.relatedEmployer || ""),
          signalType: String(parsed.signalType || "market_signal") as ConversationSignalType,
          signalDirection: String(parsed.signalDirection || "unclear") as ConversationSignalDirection,
          signalConfidence: String(parsed.signalConfidence || "medium") as ConversationConfidence,
          compensationSignal: String(parsed.compensationSignal || ""),
          workModelSignal: String(parsed.workModelSignal || ""),
          cultureSignal: String(parsed.cultureSignal || ""),
          hiringSignal: String(parsed.hiringSignal || ""),
          marketSignals: String(parsed.marketSignals || ""),
          newLeads: String(parsed.newLeads || ""),
          warnings: String(parsed.warnings || ""),
          promisedFollowUp: String(parsed.promisedFollowUp || ""),
          nextAction: String(parsed.nextAction || ""),
          laneImpact: String(parsed.laneImpact || ""),
        };
      }
    } catch {
      // Skip unreadable records.
    }
  }
  return null;
}

function shouldLogConversation(feedback: StructuredFeedback) {
  const outcome = outcomeFromFeedback(feedback);
  const hasContent = outcomeHasStrategicContent(outcome);
  return hasContent && CONVERSATION_HELD.has(feedback.conversationStatus);
}

async function replaceConversationOutcome(
  supabase: ReturnType<typeof createServer>,
  userId: string,
  feedback: StructuredFeedback,
  now: string,
): Promise<boolean> {
  const title = `Follow-up conversation: ${feedback.contactName}`;
  const outcome = outcomeFromFeedback(feedback, now);

  // Replace the prior auto-maintained log for this contact only; user-uploaded
  // loop-back notes use different titles and are never touched.
  await supabase
    .from("career_sources")
    .delete()
    .eq("user_id", userId)
    .eq("source_type", "conversation_outcome")
    .eq("title", title);

  // The structured table is additive by design, but for the auto-maintained
  // follow-up card we keep one current row per contact/source_ref so repeated
  // saves do not create a pile of duplicates during smoke testing.
  await supabase
    .from("conversation_outcomes")
    .delete()
    .eq("user_id", userId)
    .eq("source_ref", outcome.sourceRef);

  const structured = await saveConversationOutcome(supabase, userId, outcome);

  const { error } = await supabase.from("career_sources").insert({
    user_id: userId,
    source_type: "conversation_outcome",
    title,
    url: null,
    extracted_text: JSON.stringify(conversationOutcomeCareerSourcePayload(structured.payload)),
    trust_state: "user_supplied",
  });

  return !error || !structured.error;
}

function outcomeFromFeedback(feedback: StructuredFeedback, createdAt?: string) {
  return buildConversationOutcome({
    contactName: feedback.contactName,
    contactOrganization: feedback.contactOrganization,
    contactTitle: feedback.contactTitle,
    conversationDate: new Date().toISOString().slice(0, 10),
    sourceRef: `follow-up:${normalize(feedback.contactName)}`,
    relatedLane: feedback.relatedLane || feedback.laneImpact,
    relatedEmployer: feedback.relatedEmployer,
    signalType: feedback.signalType,
    signalDirection: feedback.signalDirection,
    confidence: feedback.signalConfidence,
    compensationSignal: feedback.compensationSignal,
    workModelSignal: feedback.workModelSignal,
    cultureSignal: feedback.cultureSignal,
    hiringSignal: feedback.hiringSignal,
    marketSignal: feedback.marketSignals,
    newLeads: feedback.newLeads,
    warnings: feedback.warnings,
    promisedFollowUp: feedback.promisedFollowUp,
    followUpDueDate: feedback.followUpDate,
    nextAction: feedback.nextAction || feedback.note,
    rawNoteExcerpt: feedback.note,
    createdAt,
  });
}

function addBusinessDays(days: number) {
  const date = new Date();
  let added = 0;
  while (added < days) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) added += 1;
  }
  return date.toISOString().slice(0, 10);
}

function pick(incoming: string | undefined, previous: string | undefined) {
  if (typeof incoming === "string" && incoming.trim()) return incoming.trim();
  return previous?.trim() || "";
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function getText(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function html(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
