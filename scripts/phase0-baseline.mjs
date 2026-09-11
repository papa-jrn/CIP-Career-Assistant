// Phase 0 baseline (Autumn 2026 restart): READ-ONLY queries against Supabase
// to confirm the loop-failure diagnosis on the founder's saved data.
// Never writes. Never prints secrets. Run: node scripts/phase0-baseline.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv(path = ".env") {
  const env = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

const env = loadEnv();
const url = env.PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const out = { generatedAt: new Date().toISOString() };

// 1. Recent evidence analyses: did the engine mark itself "complete"?
const { data: analyses, error: analysesError } = await supabase
  .from("career_sources")
  .select("created_at, extracted_text")
  .eq("source_type", "evidence_analysis")
  .order("created_at", { ascending: false })
  .limit(6);

out.evidenceAnalyses = (analyses ?? []).map((row) => {
  let parsed = {};
  try {
    parsed = JSON.parse(row.extracted_text) ?? {};
  } catch {}
  const suff = parsed.evidence_sufficiency ?? {};
  return {
    created_at: row.created_at,
    phase: suff.phase ?? null,
    score: suff.score ?? null,
    reason: suff.reason ?? null,
    evidence_count: parsed.evidence_count ?? null,
    source_evidence_count: parsed.source_evidence_count ?? null,
    conversation_note_count: parsed.conversation_note_count ?? null,
    new_conversation_signal_count: parsed.new_conversation_signal_count ?? null,
    new_evidence_count: parsed.new_evidence_count ?? null,
    has_change_log: Boolean(parsed.advisor?.changeLog),
    change_log_summary: String(parsed.advisor?.changeLog?.summary ?? "").slice(0, 200),
    summary_head: String(parsed.advisor?.summary ?? "").slice(0, 180),
    follow_up_questions: (parsed.advisor?.follow_up_questions ?? parsed.advisor?.followUpQuestions ?? []).slice(0, 3),
  };
});
if (analysesError) out.evidenceAnalysesError = analysesError.message;

// 1b. Latest intake row (what the analysis context actually builds from).
const { data: intakeRow } = await supabase
  .from("career_sources")
  .select("created_at, title")
  .eq("source_type", "resume_intake")
  .order("created_at", { ascending: false })
  .limit(3);
out.latestIntakes = intakeRow ?? [];

// 1c. Conversation outcome stored shape (keys only, to verify parser match).
const { data: convSample } = await supabase
  .from("career_sources")
  .select("created_at, extracted_text")
  .eq("source_type", "conversation_outcome")
  .order("created_at", { ascending: false })
  .limit(2);
out.conversationOutcomeShapes = (convSample ?? []).map((row) => {
  try {
    const parsed = JSON.parse(row.extracted_text);
    return { created_at: row.created_at, keys: Object.keys(parsed ?? {}) };
  } catch {
    return { created_at: row.created_at, keys: ["<unparseable>"] };
  }
});

// 2. Weekly snapshots: prove the 7/6 vs 8/3 duplication.
const { data: snapshots, error: snapshotsError } = await supabase
  .from("career_strategy_snapshots")
  .select("week_start, summary, next_actions, watched_employer_count, opportunity_match_count, created_at")
  .order("week_start", { ascending: false })
  .limit(12);

const snapList = snapshots ?? [];
out.snapshots = snapList.map((s) => ({
  week_start: s.week_start,
  watched_employer_count: s.watched_employer_count,
  opportunity_match_count: s.opportunity_match_count,
  summary: s.summary,
  next_actions: s.next_actions,
  created_at: s.created_at,
}));
out.snapshotDuplicatePairs = [];
for (let i = 0; i < snapList.length; i++) {
  for (let j = i + 1; j < snapList.length; j++) {
    const a = snapList[i];
    const b = snapList[j];
    if (a.summary === b.summary && JSON.stringify(a.next_actions) === JSON.stringify(b.next_actions)) {
      out.snapshotDuplicatePairs.push({ a: a.week_start, b: b.week_start });
    }
  }
}
if (snapshotsError) out.snapshotsError = snapshotsError.message;

// 3. Inputs: conversation outcomes and evidence responses (counts + recency).
for (const [key, type] of [
  ["conversationOutcomes", "conversation_outcome"],
  ["evidenceResponses", "evidence_response"],
  ["networkAnalyses", "network_analysis"],
  ["resumeDrafts", "resume_draft"],
]) {
  const { count, error } = await supabase
    .from("career_sources")
    .select("id", { count: "exact", head: true })
    .eq("source_type", type);
  out[key] = { count: count ?? null, error: error?.message ?? null };
}

const { data: lastConversation } = await supabase
  .from("career_sources")
  .select("created_at, title")
  .eq("source_type", "conversation_outcome")
  .order("created_at", { ascending: false })
  .limit(3);
out.lastConversationOutcomes = lastConversation ?? [];

// 4. Watched employers (snapshot inputs).
const { count: watchedCount, error: watchedError } = await supabase
  .from("watched_employers")
  .select("id", { count: "exact", head: true });
out.watchedEmployerCount = watchedCount ?? null;
if (watchedError) out.watchedEmployerError = watchedError.message;

// 5. Latest career report status.
const { data: reportRow } = await supabase
  .from("career_sources")
  .select("created_at, extracted_text")
  .eq("source_type", "career_report")
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();
if (reportRow?.extracted_text) {
  try {
    const parsed = JSON.parse(reportRow.extracted_text);
    out.latestCareerReport = {
      created_at: reportRow.created_at,
      status: parsed?.report?.status ?? null,
      analysisMode: parsed?.report?.analysisMode ?? null,
      summary_head: String(parsed?.report?.summary ?? "").slice(0, 180),
    };
  } catch {}
} else {
  out.latestCareerReport = null;
}

console.log(JSON.stringify(out, null, 2));
