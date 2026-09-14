import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdvisorAnalysis } from "@/lib/cip/advisor";
import { parseConversationOutcome, type ConversationOutcome } from "@/lib/cip/conversation-outcomes";
import {
  buildTargetLanes,
  parseAnalysisAdvisor,
  parseIntakeSource,
  type IntakeSource,
} from "@/lib/cip/resume-asset-context";

export interface StrategicLaneScore {
  lane: string;
  label: string;
  score: number;
  direction: "up" | "down" | "steady";
  reasons: string[];
}

export interface StrategicEmployerScore {
  name: string;
  region: string;
  score: number;
  direction: "up" | "down" | "steady";
  reasons: string[];
  nextMove: string;
}

export interface StrategicState {
  generatedAt: string;
  lanes: StrategicLaneScore[];
  employers: StrategicEmployerScore[];
  deltas: string[];
  conversationOutcomeCount: number;
}

export interface WatchedEmployerLike {
  name: string;
  region?: string | null;
  priority?: string | null;
  fit_score?: number | null;
  fit_summary?: string | null;
  target_roles?: string[] | null;
  careers_url?: string | null;
}

export interface NetworkAnalysisLike {
  laneValidations?: Array<{
    lane?: string;
    score?: number;
    status?: string;
    signals?: string[];
  }>;
}

export interface StrategicStateInputs {
  latestSource?: IntakeSource | null;
  latestAdvisor?: Partial<AdvisorAnalysis> | null;
  conversationOutcomes?: ConversationOutcome[];
  watchedEmployers?: WatchedEmployerLike[];
  latestNetworkAnalysis?: NetworkAnalysisLike | null;
}

export async function loadStrategicState(
  supabase: SupabaseClient,
  userId: string,
): Promise<StrategicState> {
  const [
    { data: intakeRow },
    { data: analysisRow },
    { data: conversationRows },
    { data: employerRows },
    { data: networkRow },
  ] = await Promise.all([
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
    supabase
      .from("career_sources")
      .select("extracted_text, created_at")
      .eq("user_id", userId)
      .eq("source_type", "conversation_outcome")
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("watched_employers")
      .select("name,region,priority,fit_score,fit_summary,target_roles,careers_url")
      .eq("user_id", userId)
      .order("fit_score", { ascending: false }),
    supabase
      .from("career_sources")
      .select("extracted_text")
      .eq("user_id", userId)
      .eq("source_type", "network_analysis")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const latestSource = parseIntakeSource(intakeRow?.extracted_text ?? null);
  const latestAdvisor = parseAnalysisAdvisor(analysisRow?.extracted_text ?? null) ?? latestSource?.advisor ?? null;
  const conversationOutcomes = (conversationRows ?? [])
    .map((row) => parseSavedConversation(row.extracted_text, row.created_at))
    .filter(Boolean) as ConversationOutcome[];

  return buildStrategicState({
    latestSource,
    latestAdvisor,
    conversationOutcomes,
    watchedEmployers: (employerRows ?? []) as WatchedEmployerLike[],
    latestNetworkAnalysis: parseNetworkAnalysis(networkRow?.extracted_text ?? null),
  });
}

export function buildStrategicState(inputs: StrategicStateInputs): StrategicState {
  const lanes = scoreLanes(inputs);
  const employers = scoreEmployers(inputs);
  const deltas = [
    ...lanes
      .filter((lane) => lane.direction !== "steady")
      .slice(0, 4)
      .map((lane) => `${lane.label}: ${lane.lane} moved ${lane.direction} to ${lane.score}. ${lane.reasons[0] ?? ""}`.trim()),
    ...employers
      .filter((employer) => employer.direction !== "steady")
      .slice(0, 4)
      .map((employer) => `${employer.name} moved ${employer.direction} to ${employer.score}. ${employer.reasons[0] ?? ""}`.trim()),
  ];

  return {
    generatedAt: new Date().toISOString(),
    lanes,
    employers,
    deltas,
    conversationOutcomeCount: inputs.conversationOutcomes?.length ?? 0,
  };
}

export function scoreLanes(inputs: StrategicStateInputs): StrategicLaneScore[] {
  const targetLanes = buildTargetLanes(inputs.latestSource ?? null, inputs.latestAdvisor ?? null);
  const networkByLane = new Map(
    (inputs.latestNetworkAnalysis?.laneValidations ?? [])
      .filter((lane) => lane.lane)
      .map((lane) => [normalize(lane.lane ?? ""), lane]),
  );

  return targetLanes.map((lane, index) => {
    const base = 74 - index * 8;
    let score = base;
    const reasons = [`Baseline from current advisor lane order: ${base}.`];
    const network = bestMatch(lane.role, [...networkByLane.keys()]);
    if (network) {
      const networkLane = networkByLane.get(network);
      const networkScore = Number(networkLane?.score ?? 0);
      if (networkScore) {
        const adjustment = Math.round((networkScore - 50) / 5);
        score += adjustment;
        reasons.push(`Latest network analysis adjusted this lane by ${adjustment >= 0 ? "+" : ""}${adjustment}.`);
      }
    }

    for (const outcome of inputs.conversationOutcomes ?? []) {
      if (!matchesText(lane.role, outcome.relatedLane)) continue;
      const adjustment = conversationAdjustment(outcome);
      if (!adjustment) continue;
      score += adjustment;
      reasons.push(`${outcome.contactName}: ${outcome.signalDirection} ${outcome.signalType} (${adjustment >= 0 ? "+" : ""}${adjustment}).`);
    }

    const finalScore = clamp(score);
    return {
      lane: lane.role,
      label: lane.label,
      score: finalScore,
      direction: finalScore > base + 3 ? "up" : finalScore < base - 3 ? "down" : "steady",
      reasons: reasons.slice(0, 5),
    };
  });
}

export function scoreEmployers(inputs: StrategicStateInputs): StrategicEmployerScore[] {
  return (inputs.watchedEmployers ?? []).map((employer) => {
    const base = clamp(Number(employer.fit_score ?? 50));
    let score = base;
    const reasons = [`Baseline watched-employer fit score: ${base}.`];

    for (const outcome of inputs.conversationOutcomes ?? []) {
      const relatedEmployer = outcome.relatedEmployer || "";
      const employerMatch = matchesText(employer.name, relatedEmployer);
      const roleMatch = (employer.target_roles ?? []).some((role) => matchesText(role, outcome.relatedLane));
      if (!employerMatch && !roleMatch) continue;
      const adjustment = conversationAdjustment(outcome);
      if (!adjustment) continue;
      score += adjustment;
      const target = employerMatch ? "employer" : "target role";
      reasons.push(`${outcome.contactName}: ${target} signal ${outcome.signalDirection} (${adjustment >= 0 ? "+" : ""}${adjustment}).`);
    }

    const finalScore = clamp(score);
    return {
      name: employer.name,
      region: employer.region ?? "",
      score: finalScore,
      direction: finalScore > base + 3 ? "up" : finalScore < base - 3 ? "down" : "steady",
      reasons: reasons.slice(0, 5),
      nextMove: nextEmployerMove(employer, finalScore),
    };
  }).sort((a, b) => b.score - a.score);
}

function parseSavedConversation(value: string | null, createdAt?: string | null) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    const outcome = parseConversationOutcome(parsed);
    return outcome ? { ...outcome, createdAt: outcome.createdAt ?? createdAt ?? undefined } : null;
  } catch {
    return null;
  }
}

function parseNetworkAnalysis(value: string | null): NetworkAnalysisLike | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed?.analysis ?? null;
  } catch {
    return null;
  }
}

function conversationAdjustment(outcome: ConversationOutcome) {
  const base = {
    strengthens: 12,
    weakens: -12,
    contradicts: -18,
    neutral: 0,
    unclear: 3,
  }[outcome.signalDirection] ?? 0;
  const confidence = {
    high: 1,
    medium: 0.75,
    low: 0.5,
  }[outcome.confidence] ?? 0.75;
  return Math.round(base * confidence);
}

function nextEmployerMove(employer: WatchedEmployerLike, score: number) {
  if (score >= 75 && employer.careers_url) return "Review current roles and prepare targeted outreach.";
  if (score >= 75) return "Find the careers page or a current hiring source.";
  if (score >= 60) return "Keep watching and look for one market-read contact.";
  return "Hold as context until stronger evidence appears.";
}

function bestMatch(value: string, candidates: string[]) {
  const normalized = normalize(value);
  return candidates.find((candidate) => normalized.includes(candidate) || candidate.includes(normalized)) ?? "";
}

function matchesText(left: string, right: string) {
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a) || sharedTokenCount(a, b) >= 2;
}

function sharedTokenCount(a: string, b: string) {
  const left = new Set(a.split(" ").filter((token) => token.length > 3));
  return b.split(" ").filter((token) => left.has(token)).length;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}
