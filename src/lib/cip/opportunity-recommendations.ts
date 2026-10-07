import type { SupabaseClient } from "@supabase/supabase-js";
import type { ObservationRow, RunView } from "@/lib/cip/job-search-run";
import { loadStrategicState } from "@/lib/cip/strategic-state";
import {
  buildCanonicalEmployers,
  employerMatch,
  loadEmployerAliases,
  normOrg,
  resolveEmployerName,
  type CanonicalEmployer,
} from "@/lib/cip/employer-resolution";
import {
  recommendPosting,
  type Recommendation,
  type RecommendationContext,
} from "@/lib/cip/recommendation";
import { loadFundingProfiles, profileToSignal, type FundingSignal } from "@/lib/cip/employer-financials";
import { indexDispositions, loadDispositions, type DispositionIndex } from "@/lib/cip/posting-dispositions";

export { normOrg } from "@/lib/cip/employer-resolution";

/**
 * Integration layer for the recommendation chips (Opportunities step 6) with employer resolution
 * (item 4). Loads the honest grounding — resolved employers (category/priority/next move), network
 * contacts by employer, open follow-up obligations, and the lanes — then computes a deterministic
 * recommendation per posting. A posting's free-text employer is resolved to a canonical watched
 * employer via `employer-resolution` (conservative auto-match, overridden by the user's saved
 * aliases). Contacts and follow-ups match a posting when both resolve to the same canonical employer,
 * or — for employers not on the watched list — by a direct conservative name match.
 */

const RELATIONAL_NEXT_MOVE = /reach out|intro|introduc|conversation|connect|coffee|\bmeet\b|\btalk\b|\bcall\b|email|message|warm/i;
// Nonprofit-only job boards: a posting from one is a mission role even when the employer is not on the
// watched list, so the funding caution still applies. Matched against the posting's source host.
const MISSION_BOARDS = /idealist\.org|workforgood|foundationlist|councilofnonprofits|philanthropy|nonprofitjobs|opportunityknocks/i;

function isMissionBoard(url: string): boolean {
  try {
    return MISSION_BOARDS.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

export interface ResolvedEmployerRow {
  canonical: string;
  category: string | null;
  priority: string | null;
  fitScore: number | null;
  nextMove: string | null;
  nextMoveIsRelational: boolean;
  /** Latest IRS 990 revenue + trend for this employer, when a profile is on file (unknown otherwise). */
  funding?: FundingSignal | null;
}

export interface RecommendationInputs {
  floorUsd: number | null;
  canon: CanonicalEmployer[];
  aliases: Map<string, string>;
  employers: ResolvedEmployerRow[];
  contacts: Array<{ norm: string; canonical: string | null; name: string; firstAsk: string | null }>;
  followUps: Array<{ norm: string; canonical: string | null; contactName: string; nextAction: string | null }>;
  lanes: Array<{ lane: string; label: string }>;
}

// Two employer references are the same when both resolved to one canonical employer, or — when at
// least one did not resolve — by a direct conservative name match on the raw names.
function sameEmployer(postingCanonical: string | null, postingNorm: string, otherCanonical: string | null, otherNorm: string): boolean {
  if (postingCanonical && otherCanonical) return postingCanonical === otherCanonical;
  return employerMatch(postingNorm, otherNorm) !== null;
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

export interface EmployerResolution {
  observed: string;
  canonical: string | null;
  hasAlias: boolean;
}

/** Resolve a posting's employer (used by both the recommendation and the on-card fix control). */
export function resolvePostingEmployer(posting: ObservationRow, inputs: RecommendationInputs): EmployerResolution {
  const observed = posting.employer_text || "";
  const resolution = resolveEmployerName(observed, inputs.canon, inputs.aliases);
  return { observed, canonical: resolution.canonical, hasAlias: inputs.aliases.has(normOrg(observed)) };
}

/** Assemble a posting's recommendation context from the loaded inputs, then recommend. Pure. */
export function recommendationForPosting(posting: ObservationRow, inputs: RecommendationInputs): Recommendation {
  const postingNorm = normOrg(posting.employer_text);
  const { canonical } = resolvePostingEmployer(posting, inputs);
  const employer = canonical ? inputs.employers.find((e) => e.canonical === canonical) ?? null : null;
  const contact = inputs.contacts.find((c) => sameEmployer(canonical, postingNorm, c.canonical, c.norm)) ?? null;
  const followUp = inputs.followUps.find((f) => sameEmployer(canonical, postingNorm, f.canonical, f.norm)) ?? null;

  const context: RecommendationContext = {
    floorUsd: inputs.floorUsd,
    laneLabel: laneLabelForTerm(posting.matched_role_term, inputs.lanes),
    employer: employer ? { category: employer.category, priority: employer.priority, fitScore: employer.fitScore, nextMove: employer.nextMove, nextMoveIsRelational: employer.nextMoveIsRelational, funding: employer.funding ?? null } : null,
    networkLink: contact ? { contactName: contact.name, firstAsk: contact.firstAsk } : null,
    followUp: followUp ? { contactName: followUp.contactName, nextAction: followUp.nextAction } : null,
    missionBySource: isMissionBoard(posting.source_url),
  };
  return recommendPosting(posting, context);
}

// Pull network contacts (name + company) out of the stored network_analysis JSON, defensively.
function parseNetworkContacts(extractedText: string | null): Array<{ name: string; company: string; firstAsk: string | null }> {
  if (!extractedText) return [];
  try {
    const parsed = JSON.parse(extractedText) as { analysis?: { contactMatches?: unknown[] } };
    const matches = parsed.analysis?.contactMatches ?? [];
    const contacts: Array<{ name: string; company: string; firstAsk: string | null }> = [];
    for (const raw of matches) {
      const match = raw as { contact?: { name?: unknown; company?: unknown }; recommendedFirstAsk?: unknown };
      const company = String(match.contact?.company ?? "").trim();
      const name = String(match.contact?.name ?? "").trim();
      if (!company || !name) continue;
      contacts.push({ name, company, firstAsk: typeof match.recommendedFirstAsk === "string" ? match.recommendedFirstAsk : null });
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
  const [state, { data: employerRows }, { data: networkRow }, aliases, financials] = await Promise.all([
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
    loadEmployerAliases(supabase, userId),
    // Never throws: with the migration unapplied this is just an empty map (no 990 data).
    loadFundingProfiles(supabase, userId),
  ]);

  const watchedNames = ((employerRows ?? []) as Array<{ name: string }>).map((row) => row.name);
  const canon = buildCanonicalEmployers(watchedNames);
  const nextMoveByNorm = new Map(state.employers.map((e) => [normOrg(e.name), e.nextMove ?? null]));

  const employers: ResolvedEmployerRow[] = ((employerRows ?? []) as Array<{ name: string; category: string | null; priority: string | null; fit_score: number | null }>).map((row) => {
    const nextMove = nextMoveByNorm.get(normOrg(row.name)) ?? null;
    return {
      canonical: row.name,
      category: row.category ?? null,
      priority: row.priority ?? null,
      fitScore: typeof row.fit_score === "number" ? row.fit_score : null,
      nextMove,
      nextMoveIsRelational: Boolean(nextMove && RELATIONAL_NEXT_MOVE.test(nextMove)),
      funding: profileToSignal(financials.profiles.get(normOrg(row.name))),
    };
  });

  const contacts = parseNetworkContacts(networkRow?.extracted_text ?? null).map((contact) => ({
    norm: normOrg(contact.company),
    canonical: resolveEmployerName(contact.company, canon, aliases).canonical,
    name: contact.name,
    firstAsk: contact.firstAsk,
  }));

  const followUps = state.followUpObligations
    .filter((o) => o.relatedEmployer)
    .map((o) => ({
      norm: normOrg(o.relatedEmployer),
      canonical: resolveEmployerName(o.relatedEmployer, canon, aliases).canonical,
      contactName: o.contactName,
      nextAction: o.nextAction || null,
    }));

  return { floorUsd, canon, aliases, employers, contacts, followUps, lanes: state.lanes.map((lane) => ({ lane: lane.lane, label: lane.label })) };
}

export interface PostingAnnotations {
  recommendations: Map<string, Recommendation>;
  dispositions: DispositionIndex;
  resolution: {
    /** The user's watched employer names, offered as fix-control targets. */
    watchedNames: string[];
    /** Per posting (by source_url): what its employer resolved to and whether a saved alias applied. */
    byUrl: Map<string, EmployerResolution>;
  };
}

/**
 * The single call the page and endpoints make: a recommendation per posting (keyed by source_url),
 * the user's saved statuses, and the employer resolution behind each chip (for the on-card fix).
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
  const byUrl = new Map<string, EmployerResolution>();
  for (const row of view.observations) {
    recommendations.set(row.source_url, recommendationForPosting(row, inputs));
    byUrl.set(row.source_url, resolvePostingEmployer(row, inputs));
  }
  return {
    recommendations,
    dispositions: indexDispositions(dispositionRows),
    resolution: { watchedNames: inputs.canon.map((c) => c.name), byUrl },
  };
}
