import type { APIRoute } from "astro";
import { isSameOriginRequest } from "@/lib/security";
import { createServer } from "@/lib/supabase/server";

// Drafts a respectful outreach note for one contact. The output is always a
// starting draft for the user to edit and send themselves — CIP never sends
// anything. Market-read framing is the default: ask for perspective, not a job.
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOriginRequest(request)) {
    return html('<p class="text-sm text-red-700">Invalid request origin.</p>', 403);
  }

  if (!import.meta.env.PUBLIC_SUPABASE_URL || !import.meta.env.PUBLIC_SUPABASE_ANON_KEY) {
    return html('<p class="text-sm font-semibold text-red-700">Supabase is not configured.</p>', 500);
  }

  const form = await request.formData();
  const contact = {
    name: getText(form, "contact_name"),
    title: getText(form, "contact_title"),
    company: getText(form, "contact_company"),
    notes: getText(form, "contact_notes"),
    firstAsk: getText(form, "first_ask"),
    intent: getText(form, "intent") || "Market read",
  };

  if (!contact.name) {
    return html('<p class="text-sm font-semibold text-red-700">Missing contact name.</p>', 400);
  }

  try {
    const supabase = createServer(cookies);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return html('<p class="text-sm font-semibold text-red-700">Sign in before drafting outreach.</p>', 401);
    }

    const sender = await loadSenderContext(supabase, user.id);
    const openAiKey = import.meta.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    let draft = "";
    let mode: "ai" | "template" = "template";

    if (openAiKey) {
      const ai = await tryDraftWithAi(contact, sender, openAiKey);
      if (ai) {
        draft = ai;
        mode = "ai";
      }
    }
    if (!draft) draft = buildTemplateDraft(contact, sender);

    return html(renderDraft(contact.name, draft, mode));
  } catch (error) {
    return html(`<p class="text-sm font-semibold text-red-700">Draft failed: ${escapeHtml(error instanceof Error ? error.message : "Unexpected error.")}</p>`, 500);
  }
};

type Contact = { name: string; title: string; company: string; notes: string; firstAsk: string; intent: string };
type Sender = { name: string; positioning: string };

async function loadSenderContext(supabase: ReturnType<typeof createServer>, userId: string): Promise<Sender> {
  const [{ data: intakeRow }, { data: analysisRow }] = await Promise.all([
    supabase
      .from("career_sources")
      .select("extracted_text")
      .eq("user_id", userId)
      .eq("source_type", "resume_intake")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("career_sources")
      .select("extracted_text")
      .eq("user_id", userId)
      .eq("source_type", "evidence_analysis")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  let name = "";
  let positioning = "";
  try {
    const intake = JSON.parse(intakeRow?.extracted_text ?? "{}")?.intake;
    if (intake?.full_name) name = String(intake.full_name);
  } catch {
    // ignore
  }
  try {
    const advisor = JSON.parse(analysisRow?.extracted_text ?? "{}")?.advisor;
    if (Array.isArray(advisor?.positioning) && advisor.positioning[0]) positioning = String(advisor.positioning[0]);
  } catch {
    // ignore
  }
  return { name, positioning };
}

async function tryDraftWithAi(contact: Contact, sender: Sender, openAiKey: string): Promise<string | null> {
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: import.meta.env.OPENAI_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini",
        max_output_tokens: 2000,
        input: [
          {
            role: "system",
            content:
              "You write short, warm, professional outreach notes for a job seeker. The default is a market-read message: the sender wants the recipient's perspective on a role lane, employer, pay reality, or market, and is NOT asking for a job or a referral. Keep it under 140 words, plain and human, no flattery, no buzzwords, no fake familiarity. If the relationship notes show the sender and recipient know each other, reflect that honestly; if not, be appropriately modest. Never invent shared history, mutual contacts, or facts. End with a low-pressure ask for a short conversation. Output only the message text, no subject line, no commentary.",
          },
          {
            role: "user",
            content: JSON.stringify({
              intent: contact.intent,
              sender_name: sender.name || "(the sender)",
              sender_positioning: sender.positioning || "(not specified)",
              recipient_name: contact.name,
              recipient_title: contact.title,
              recipient_company: contact.company,
              relationship_notes: contact.notes,
              suggested_first_question: contact.firstAsk,
            }),
          },
        ],
      }),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const text = extractResponseText(payload);
    return text ? text.trim() : null;
  } catch {
    return null;
  }
}

function buildTemplateDraft(contact: Contact, sender: Sender): string {
  const firstName = contact.name.split(/\s+/)[0] || "there";
  const place = contact.company ? ` at ${contact.company}` : "";
  const ask = contact.firstAsk || "what the work actually looks like day to day and where you see it heading";
  const opener = contact.notes
    ? "It's been a while, and I've been meaning to reconnect."
    : "We haven't spoken directly, so apologies for reaching out a bit cold.";
  const lane = sender.positioning ? ` I'm focused on ${lowerFirst(sender.positioning)}` : " I'm working through my next career step";

  return [
    `Hi ${firstName},`,
    "",
    `${opener}${lane}, and I'm trying to understand the real picture before I chase anything — I'm not asking for a job or a referral.`,
    "",
    `Given your perspective${place}, would you be open to a short conversation? I'd genuinely value your read on ${ask}.`,
    "",
    "No rush at all, and happy to work around your schedule.",
    "",
    "Thanks,",
    sender.name || "",
  ].join("\n");
}

function renderDraft(name: string, draft: string, mode: "ai" | "template") {
  const id = `draft-text-${Math.random().toString(36).slice(2, 8)}`;
  const label =
    mode === "ai"
      ? "AI-drafted starting point — review and edit before sending."
      : "Template draft (no AI key configured) — edit before sending.";
  return `
    <div class="rounded-md border border-[var(--line)] bg-[var(--background)] p-3">
      <p class="text-xs font-semibold text-[var(--muted)]">${escapeHtml(label)}</p>
      <textarea id="${id}" class="mt-2 min-h-40 w-full rounded-md border border-[var(--line)] bg-[var(--panel)] p-2 text-sm">${escapeHtml(draft)}</textarea>
      <button type="button" class="mt-2 rounded-md border border-[var(--line)] px-3 py-1.5 text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/10"
        onclick="navigator.clipboard.writeText(document.getElementById('${id}').value); this.textContent='Copied';">
        Copy to clipboard
      </button>
      <p class="mt-2 text-xs leading-5 text-[var(--muted)]">CIP does not send messages. Paste this into your own email or LinkedIn after editing it to sound like you.</p>
    </div>
  `;
}

function extractResponseText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const direct = (payload as { output_text?: unknown }).output_text;
  if (typeof direct === "string") return direct;
  const output = (payload as { output?: unknown }).output;
  if (!Array.isArray(output)) return null;
  for (const item of output) {
    const content = (item as { content?: unknown })?.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      const text = (part as { text?: unknown })?.text;
      if (typeof text === "string") return text;
    }
  }
  return null;
}

function lowerFirst(value: string) {
  return value ? value.charAt(0).toLowerCase() + value.slice(1) : value;
}

function getText(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function html(body: string, status = 200) {
  return new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
