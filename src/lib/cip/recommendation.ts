import { compareToFloor, estimateAnnualPay } from "@/lib/cip/pay";
import { isClosedOrGone, type ObservationRow } from "@/lib/cip/job-search-run";

/**
 * The per-posting recommendation chip (Opportunities step 6, item 2). A deterministic, fully
 * explainable suggestion — never a per-posting AI call (§19: prefer a recommendation over a bare
 * score; label it, attach a confidence, let the user correct it). Every chip traces to named
 * signals we already store; nothing here is invented. The user's own status (posting-dispositions)
 * overrides the display, but this is always computed so the app's read is honest and current.
 *
 * The strongest, most CIP-specific move is the network cross-reference: if someone in the user's
 * network is connected to the posting's employer, the chip becomes "talk to someone first" naming
 * that person. That, the funding caution, and the resolved-employer signals only fire when the
 * posting's employer actually resolves to a saved employer / known contact — never on a guess
 * (employer resolution is item 4; until then this degrades gracefully to posting-level signals).
 */

export type RecommendationCategory = "talk_first" | "check_funding" | "apply" | "monitor" | "skip";
export type Confidence = "high" | "medium" | "low";

export interface ResolvedEmployer {
  category: string | null;
  priority: string | null; // 'high' | 'medium' | 'low'
  fitScore: number | null;
  nextMove: string | null;
  nextMoveIsRelational: boolean;
}

/** A contact whose company matches this posting's employer. */
export interface NetworkLink {
  contactName: string;
  firstAsk: string | null;
}

/** An open follow-up obligation tied to this employer or its lane. */
export interface FollowUpLink {
  contactName: string;
  nextAction: string | null;
}

export interface RecommendationContext {
  floorUsd: number | null;
  /** The lane label the role matched (e.g. "Primary", "Strong alternate"), when resolvable. */
  laneLabel: string | null;
  employer: ResolvedEmployer | null;
  networkLink: NetworkLink | null;
  followUp: FollowUpLink | null;
  /** True when the posting came from a nonprofit-only job board (funding still matters off the watched list). */
  missionBySource?: boolean;
}

export interface Recommendation {
  category: RecommendationCategory;
  confidence: Confidence;
  rationale: string;
  signals: string[];
  /** The person to reach out to, when the suggestion is talk_first via the network or an obligation. */
  namedContact: string | null;
}

// "Senior" for the talk-first and funding cues. Deliberately excludes bare "manager" — a program or
// project manager is mid-level, and treating every manager as senior over-fired the funding caution.
const SENIOR_TITLE = /\b(director|chief|c[eofot]o|vice president|vp|head of|executive|principal|dean|superintendent|president)\b/i;
// Core institutional leadership funded from the operating budget, not grants/endowment. The funding
// caution does not apply to these even at a mission employer (a CIO is not "grant vs endowed").
const OPERATIONAL_LEADER = /\bc[ifeot]o\b|chief (information|financial|technology|operating|administrative|human)|information officer|financial officer|technology officer|human resources/i;
const MISSION_EMPLOYER =
  /nonprofit|non-profit|not-for-profit|human services|charit|foundation|municipal|public school|school district|\beducation\b|universit|college|community|county|town of|city of/i;

function isMissionEmployer(employer: ResolvedEmployer | null): boolean {
  return Boolean(employer?.category && MISSION_EMPLOYER.test(employer.category));
}

/**
 * The core deterministic ladder. First matching category wins; precedence is talk_first →
 * check_funding → apply → monitor → skip. Closed/gone or excluded postings are not the chip's
 * concern (they have their own groups) and return a quiet skip if ever passed in.
 */
export function recommendPosting(posting: ObservationRow, context: RecommendationContext): Recommendation {
  const employerName = posting.employer_text || "this employer";

  if (posting.exclusion_hit) {
    return { category: "skip", confidence: "high", rationale: "Matches one of your exclusions.", signals: ["On your exclusion list"], namedContact: null };
  }
  if (isClosedOrGone(posting)) {
    return { category: "skip", confidence: "high", rationale: "This posting is closed or gone.", signals: ["Closed or gone at the source"], namedContact: null };
  }

  const verified = posting.verification_state === "verified_open";
  const isSkillMatch = posting.source_tier === "direct_read" && posting.matched_role_term === "skill";
  const targetedSource = posting.source_tier === "target_page" || posting.source_tier === "preferred_source" || posting.source_tier === "direct_read";
  const laneMatch = !isSkillMatch && (Boolean(posting.matched_role_term && posting.matched_role_term !== "skill") || targetedSource);
  const senior = SENIOR_TITLE.test(posting.title);
  const operationalLeader = OPERATIONAL_LEADER.test(posting.title);

  const outsideArea = posting.location_status === "outside" && posting.remote_status !== "remote";
  const within = posting.location_status === "within" || posting.remote_status === "remote";
  const locUnknown = !within && !outsideArea; // "unknown", or an unjudged non-remote worksite

  const pay = estimateAnnualPay(posting.salary_text);
  const floor = compareToFloor(pay, context.floorUsd);
  const payBelow = floor.status === "below";
  const payMeets = floor.status === "meets";
  const payUnknown = floor.status === "unknown";

  const mission = isMissionEmployer(context.employer) || Boolean(context.missionBySource);

  // The transparent evidence list shown in the expander — everything that applies, in reading order.
  const signals: string[] = [];
  signals.push(verified ? "Verified open on its own page" : "Found by the search but not yet verified");
  if (context.networkLink) signals.push(`${context.networkLink.contactName} in your network is connected to ${employerName}`);
  if (context.followUp) signals.push(`Open follow-up with ${context.followUp.contactName} tied to this employer`);
  if (isSkillMatch) signals.push("Outside your lanes, but matches your proven experience");
  else if (laneMatch) signals.push(context.laneLabel ? `Matches your ${context.laneLabel}` : "Matches one of your target roles");
  else signals.push("No clear lane match");
  if (context.employer?.category) signals.push(`Employer type: ${context.employer.category}`);
  signals.push(floor.note);
  if (outsideArea) signals.push("Worksite is outside your places");
  else if (within) signals.push("Within your places");
  else signals.push("Worksite not confirmed");

  // 1. Talk to someone first — a warm path beats a cold application.
  if (context.networkLink) {
    const ask = context.networkLink.firstAsk ? ` ${context.networkLink.firstAsk}` : "";
    return {
      category: "talk_first",
      confidence: verified ? "high" : "medium",
      rationale: `Reach out to ${context.networkLink.contactName}, who's connected to ${employerName}, about this role.${ask}`.trim(),
      signals,
      namedContact: context.networkLink.contactName,
    };
  }
  if (context.followUp) {
    const next = context.followUp.nextAction ? `: ${context.followUp.nextAction}` : "";
    return {
      category: "talk_first",
      confidence: verified ? "high" : "medium",
      rationale: `You have an open follow-up with ${context.followUp.contactName} tied to this employer — a conversation likely beats a cold application${next}.`,
      signals,
      namedContact: context.followUp.contactName,
    };
  }
  if (context.employer?.priority === "high" && senior && context.employer.nextMoveIsRelational) {
    return {
      category: "talk_first",
      confidence: "medium",
      rationale: `${employerName} is a high-priority target and this is a senior role — a conversation likely beats a cold application.`,
      signals,
      namedContact: null,
    };
  }

  // 2. Clearly below your floor dominates — no amount of funding confirmation fixes the pay. (A named
  // network contact still won a talk-first above, since the relationship outlasts any one role.)
  if (payBelow) {
    return { category: "skip", confidence: "medium", rationale: "Pay is below your floor.", signals, namedContact: null };
  }

  // 3. Check the funding first — a mission role whose viability may hinge on grants/endowment. Core
  // operating-budget leadership (CIO, CFO, HR) is exempt: "grant vs endowed" does not apply to them.
  if (mission && !operationalLeader && (senior || payUnknown)) {
    const bits = [senior ? "senior role" : "", payUnknown ? "no stated pay" : ""].filter(Boolean).join(", ");
    return {
      category: "check_funding",
      confidence: "medium",
      rationale: `${context.employer?.category ?? "Nonprofit"} employer${bits ? `, ${bits}` : ""} — confirm it's funded (grant vs endowed) before investing time.`,
      signals,
      namedContact: null,
    };
  }

  // 4. Apply now — clean, high-confidence fit. An unverified lead can never reach here.
  if (verified && laneMatch && !outsideArea) {
    const laneBit = context.laneLabel ? `, matches your ${context.laneLabel}` : ", matches a target role";
    const payBit = payMeets ? ", pay meets your floor" : "";
    const confidence: Confidence = !payUnknown && !locUnknown && Boolean(context.employer) ? "high" : "medium";
    return {
      category: "apply",
      confidence,
      rationale: `Verified open${laneBit}${payBit}.`,
      signals,
      namedContact: null,
    };
  }

  // 5. Skip — live but weak: no lane relevance at an unresolved/low employer.
  const lowEmployer = !context.employer || context.employer.priority === "low";
  if (!laneMatch && !isSkillMatch && lowEmployer) {
    return { category: "skip", confidence: "medium", rationale: "No clear lane match, and not one of your priority employers.", signals, namedContact: null };
  }

  // 4. Monitor — worth watching, no forward/backward call yet.
  let rationale: string;
  if (!verified) rationale = "Found by the search but not yet verified — check the link before acting.";
  else if (isSkillMatch) rationale = "Outside your lanes but matches your proven experience — worth keeping an eye on.";
  else if (outsideArea) rationale = "A real posting, but the worksite is outside your places.";
  else if (locUnknown) rationale = "Looks relevant, but the worksite isn't confirmed yet.";
  else rationale = "Worth keeping an eye on.";
  return { category: "monitor", confidence: verified ? "medium" : "low", rationale, signals, namedContact: null };
}
