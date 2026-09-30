import type { SupabaseClient } from "@supabase/supabase-js";
import type { ObservationRow, RunView } from "@/lib/cip/job-search-run";
import { loadStrategicState } from "@/lib/cip/strategic-state";
import {
  recommendPosting,
  type Recommendation,
  type RecommendationContext,
  type ResolvedEmployer,
} from "@/lib/cip/recommendation";
import { indexDispositions, loadDispositions, type DispositionIndex } from "@/lib/cip/posting-dispositions";

/**
 * Integration layer for the recommendation chips (Opportunities step 6). Loads the honest grounding
 * — resolved employers (category/priority/next move), network contacts by employer, open follow-up
 * obligations, and the lanes — then computes a deterministic recommendation per posting. Employer
 * matching is best-effort by normalized name (employer resolution is item 4); when a posting's
 * employer does not resolve, the chip degrades to posting-level signals and the employer-dependent
 * chips (talk-first via network/obligation, funding) simply do not fire.
 */

export interface RecommendationInputs {
  floorUsd: number | null;
  employers: Array<{ key: string } & ResolvedEmployer>;
  /** Network contacts keyed by their normalized company. */
  contacts: Array<{ key: string; name: string; firstAsk: string | null }>;
  /** Open follow-up obligations keyed by normalized related employer. */
  followUps: Array<{ key: string; contactName: string; nextAction: string | null }>;
  lanes: Array<{ lane: string; label: string }>;
}

const ORG_SUFFIX = /\b(inc|llc|l\.l\.c|ltd|corp|corporation|company|co|the|group|holdings|plc)\b/g;
const RELATIONAL_NEXT_MOVE = /reach out|intro|introduc|conversation|connect|coffee|\bmeet\b|\btalk\b|\bcall\b|email|message|warm/i;

/** Normalize an organization name for fuzzy matching (lowercase, strip punctuation and common suffixes). */
export function normOrg(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[.,/&'"()-]/g, " ")
    .replace(ORG_SUFFIX, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Two org names match when one normalized name equals or contains the other (guarded so a short
// token like "co" cannot swallow everything).
function orgMatches(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 4 && long.includes(short);
}

function laneLabelForTerm(term: string | null, lanes: RecommendationInputs["lanes"]): string | null {
  const t = normOrg(term);
  if (!t || t === "skill") return null;
  const hit = lanes.find((lane) => {
    const l = normOrg(lane.lane);
    return l.includes(t) || t.includes(l);
  });
  return hit?.label ?? null;
}

/** Assemble a posting's recommendation context from the loaded inputs, then recommend. Pure. */
export function recommendationForPosting(posting: ObservationRow, inputs: RecommendationInputs): Recommendation {
  const empKey = normOrg(posting.employer_text);
  const employer = inputs.employers.find((e) => orgMatches(e.key, empKey)) ?? null;
  const contact = inputs.contacts.find((c) => orgMatches(c.key, empKey)) ?? null;
  const followUp = inputs.followUps.find((f) => orgMatches(f.key, empKey)) ?? null;

  const context: RecommendationContext = {
    floorUsd: inputs.floorUsd,
    laneLabel: laneLabelForTerm(posting.matched_role_term, inputs.lanes),
    employer: employer ? { category: employer.category, priority: employer.priority, fitScore: employer.fitScore, nextMove: employer.nextMove, nextMoveIsRelational: employer.nextMoveIsRelational } : null,
    networkLink: contact ? { contactName: contact.name, firstAsk: contact.firstAsk } : null,
    followUp: followUp ? { contactName: followUp.contactName, nextAction: followUp.nextAction } : null,
  };
  return recommendPosting(posting, context);
}

// Pull network contacts (name + company) out of the stored network_analysis JSON, defensively.
function parseNetworkContacts(extractedText: string | null): RecommendationInputs["contacts"] {
  if (!extractedText) return [];
  try {
    const parsed = JSON.parse(extractedText) as { analysis?: { contactMatches?: unknown[] } };
    const matches = parsed.analysis?.contactMatches ?? [];
    const contacts: RecommendationInputs["contacts"] = [];
    for (const raw of matches) {
      const match = raw as { contact?: { name?: unknown; company?: unknown }; recommendedFirstAsk?: unknown };
      const company = String(match.contact?.company ?? "").trim();
      const name = String(match.contact?.name ?? "").trim();
      if (!company || !name) continue;
      contacts.push({ key: normOrg(company), name, firstAsk: typeof match.recommendedFirstAsk === "string" ? match.recommendedFirstAsk : null });
    }
    return contacts;
  } catch {
    return [];
  }
}

/** Load everything the chips are grounded in, once per Opportunities render. */
export async function loadRecommendationInputs(
  supabase: SupabaseClient,
  userId: string,
  floorUsd: number | null,
): Promise<RecommendationInputs> {
  const [state, { data: employerRows }, { data: networkRow }] = await Promise.all([
    loadStrategicState(supabase, userId),
    supabase.from("watched_employers").select("name,category,priority,fit_score").eq("user_id", userId).limit(500),
    supabase
      .from("career_sources")
      .select("extracted_text")
      .eq("user_id", userId)
      .eq("source_type", "network_analysis")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const nextMoveByName = new Map(state.employers.map((e) => [normOrg(e.name), e.nextMove ?? null]));
  const employers = ((employerRows ?? []) as Array<{ name: string; category: string | null; priority: string | null; fit_score: number | null }>).map((row) => {
    const key = normOrg(row.name);
    const nextMove = nextMoveByName.get(key) ?? null;
    return {
      key,
      category: row.category ?? null,
      priority: row.priority ?? null,
      fitScore: typeof row.fit_score === "number" ? row.fit_score : null,
      nextMove,
      nextMoveIsRelational: Boolean(nextMove && RELATIONAL_NEXT_MOVE.test(nextMove)),
    };
  });

  const followUps = state.followUpObligations
    .filter((o) => o.relatedEmployer)
    .map((o) => ({ key: normOrg(o.relatedEmployer), contactName: o.contactName, nextAction: o.nextAction || null }));

  return {
    floorUsd,
    employers,
    contacts: parseNetworkContacts(networkRow?.extracted_text ?? null),
    followUps,
    lanes: state.lanes.map((lane) => ({ lane: lane.lane, label: lane.label })),
  };
}

export interface PostingAnnotations {
  recommendations: Map<string, Recommendation>;
  dispositions: DispositionIndex;
}

/**
 * The single call the page and endpoints make: a recommendation per posting (keyed by source_url)
 * plus the user's saved statuses. Recommendations are computed for actionable postings only;
 * closed/excluded rows have their own groups and get none.
 */
export async function buildPostingAnnotations(
  supabase: SupabaseClient,
  userId: string,
  view: RunView,
): Promise<PostingAnnotations> {
  const brief = view.run.brief as { compensation?: { floorUsd?: number | null } } | null;
  const floorUsd = typeof brief?.compensation?.floorUsd === "number" ? brief.compensation.floorUsd : null;

  const [inputs, dispositionRows] = await Promise.all([
    loadRecommendationInputs(supabase, userId, floorUsd),
    loadDispositions(supabase, userId),
  ]);

  const recommendations = new Map<string, Recommendation>();
  for (const row of view.observations) {
    recommendations.set(row.source_url, recommendationForPosting(row, inputs));
  }
  return { recommendations, dispositions: indexDispositions(dispositionRows) };
}
