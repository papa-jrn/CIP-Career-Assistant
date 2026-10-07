import type { ConversationOutcome } from "@/lib/cip/conversation-outcomes";
import { tagCandidateLanes } from "@/lib/cip/discovery-targeting";
import { planFinancialsLookup, profileToSignal, type FundingProfile } from "@/lib/cip/employer-financials";
import { employerMatch, normOrg, resolveEmployerName } from "@/lib/cip/employer-resolution";
import { isOutsideArea, type CoverageEntry, type ObservationRow } from "@/lib/cip/job-search-run";
import { recommendationForPosting, type RecommendationInputs } from "@/lib/cip/opportunity-recommendations";
import { indexDispositions, matchDisposition, type DispositionStatus, type PostingDisposition } from "@/lib/cip/posting-dispositions";
import type { Recommendation, RecommendationCategory } from "@/lib/cip/recommendation";
import type { StrategicEmployerScore, StrategicFollowUpObligation } from "@/lib/cip/strategic-state";

/**
 * The target dossier (Employers & Opportunities Rethink, §14 "target workspace", slice 1).
 *
 * One pure assembler: for each watched employer it gathers everything the app already knows (lane fit,
 * saved people, conversations, follow-ups, this run's verified postings, funding, how its careers page
 * was read) and turns it into a suggested next action and a suggested status. Reads only; no I/O.
 *
 * House rules, all enforced here and tested:
 *  - A warm path is a REAL saved person with a stated basis, never a guessed affiliation.
 *  - A careers URL or a high fit score is never evidence of an opening. "No verified openings" is a stated state.
 *  - Unknown stays unknown (no filing, pay not stated, nobody saved); it is listed, never turned into a verdict.
 *  - The action and the status are the app's SUGGESTION, labeled as such; the user's own choice (slice 2) wins.
 */

export type TargetStatus = "new" | "researching" | "talk_first" | "monitoring" | "applying" | "paused" | "not_interested";

export const STATUS_LABEL: Record<TargetStatus, string> = {
  new: "New",
  researching: "Researching",
  talk_first: "Talk first",
  monitoring: "Monitoring",
  applying: "Applying",
  paused: "Paused",
  not_interested: "Not interested",
};

/** Display order of the groups. `paused` and `not_interested` are user-only (slice 2) and are never suggested. */
export const STATUS_ORDER: TargetStatus[] = ["talk_first", "applying", "researching", "monitoring", "new", "paused", "not_interested"];

export type ActionKind = "follow_up" | "reach_out" | "review_posting" | "check_funding" | "find_someone" | "check_careers" | "keep_watching";

export type CareersRead = "read" | "blocked" | "unreadable" | "not_checked" | "none_on_file";

export interface DossierEmployer {
  id: string;
  name: string;
  region: string;
  category: string | null;
  location: string | null;
  priority: string | null;
  fitScore: number | null;
  careersUrl: string | null;
  createdAt: string | null;
  /** The user's IRS 990 setting (auto/on/off), which decides whether funding applies. */
  financialsMode?: unknown;
}

export interface DossierBundle {
  employers: DossierEmployer[];
  /** The same grounding the posting chips use: canonical employers, aliases, contacts, follow-ups, lanes, funding. */
  inputs: RecommendationInputs;
  scores: StrategicEmployerScore[];
  outcomes: ConversationOutcome[];
  /** Open follow-up obligations (they carry urgency and due date). */
  obligations: StrategicFollowUpObligation[];
  /** The latest run that searched, or null when no search has run. */
  run: { startedAt: string; status: string } | null;
  observations: ObservationRow[];
  coverage: CoverageEntry[];
  dispositions: PostingDisposition[];
  profiles: Map<string, FundingProfile>;
  now: string;
}

export interface WarmPath {
  name: string;
  /** Why we believe this is a path: always a stated, saved basis. */
  basis: string;
  firstAsk: string | null;
}

export interface ConversationNote {
  person: string;
  date: string;
  direction: string;
  signal: string;
}

export interface FollowUpNote {
  person: string;
  nextAction: string;
  urgency: "overdue" | "due_soon" | "scheduled" | "unscheduled";
  due: string;
}

export interface TargetPosting {
  title: string;
  url: string;
  chip: Recommendation;
  isNew: boolean;
  userStatus: DispositionStatus | null;
  worksite: string;
}

export type FundingState = "ok" | "not_looked_up" | "no_filing" | "failed" | "not_applicable";

export interface TargetAction {
  kind: ActionKind;
  /** The imperative line shown on the card. */
  label: string;
  rationale: string;
  signals: string[];
  /** The real person the action names, when there is one. */
  person: string | null;
  /** Which recommendation category it reads as (talk-first is as prominent as apply). */
  tone: RecommendationCategory | "research";
}

export interface TargetDossier {
  employerId: string;
  name: string;
  region: string;
  category: string | null;
  location: string | null;
  careersUrl: string | null;
  priority: string | null;
  fitScore: number | null;
  movement: { direction: "up" | "down" | "steady"; explanation: string; nextMove: string } | null;
  lanes: Array<{ lane: string; label: string; reason: string }>;
  warmPaths: WarmPath[];
  conversations: ConversationNote[];
  followUps: FollowUpNote[];
  openings: {
    verified: TargetPosting[];
    /** Verified but outside the user's places (kept visible, not counted as an opening). */
    outsideArea: number;
    careers: CareersRead;
    careersNote: string;
  };
  funding: { state: FundingState; line: string | null; trend: "growing" | "stable" | "shrinking" | "unknown" | null; note: string };
  unknowns: string[];
  changes: string[];
  action: TargetAction;
  status: TargetStatus;
  /** Slice 1: always the app's suggestion. Slice 2 adds the user's own choice, which wins. */
  statusSource: "suggested" | "set";
}

// ---------------------------------------------------------------- matching

/**
 * Does this free-text name refer to this tracked employer? Uses the saved aliases and the conservative
 * resolver first (so a user correction, including "keep these separate", is honored), and falls back to a
 * direct conservative name match only when the resolver found no canonical employer at all.
 */
export function refersToEmployer(observed: string | null | undefined, employerName: string, inputs: Pick<RecommendationInputs, "canon" | "aliases">): boolean {
  const norm = normOrg(observed);
  if (!norm) return false;
  const resolution = resolveEmployerName(observed ?? "", inputs.canon, inputs.aliases);
  if (resolution.canonical) return resolution.canonical === employerName;
  if (resolution.basis === "alias") return false; // the user said "keep this separate": never re-merge it
  return employerMatch(norm, normOrg(employerName)) !== null;
}

function contactMatches(contact: RecommendationInputs["contacts"][number], employerName: string): boolean {
  if (contact.canonical) return contact.canonical === employerName;
  return employerMatch(contact.norm, normOrg(employerName)) !== null;
}

// ---------------------------------------------------------------- careers page

const READ_STATUSES = new Set(["read_openings", "no_matching_openings", "read_directly_by_app"]);
const UNREADABLE_STATUSES = new Set(["page_found_but_could_not_read_listings", "direct_read_failed", "direct_read_unsupported", "not_found"]);

/** How the latest search read this employer's careers page. A successful read wins over earlier failures. */
export function careersReadFor(employer: Pick<DossierEmployer, "name" | "careersUrl">, coverage: CoverageEntry[], inputs: Pick<RecommendationInputs, "canon" | "aliases">): { read: CareersRead; note: string } {
  const mine = coverage.filter((entry) => refersToEmployer(entry.name, employer.name, inputs));
  if (mine.some((entry) => READ_STATUSES.has(entry.status))) return { read: "read", note: "Its job list was read in the latest search." };
  if (mine.some((entry) => entry.status === "direct_read_blocked")) {
    return { read: "blocked", note: "Its site asks automated readers not to read its job list, so the app left it alone. Check it by hand." };
  }
  if (mine.some((entry) => UNREADABLE_STATUSES.has(entry.status))) {
    return { read: "unreadable", note: "The latest search could not read its job list. Check it by hand." };
  }
  if (!employer.careersUrl) return { read: "none_on_file", note: "No careers page is on file." };
  return { read: "not_checked", note: "Not covered by the latest search." };
}

// ---------------------------------------------------------------- the ladder and status

const CHIP_RANK: Record<RecommendationCategory, number> = { talk_first: 0, check_funding: 1, apply: 2, monitor: 3, skip: 9 };

function actionVerb(chip: Recommendation, title: string): string {
  switch (chip.category) {
    case "talk_first":
      return `Talk first, then consider "${title}"`;
    case "check_funding":
      return `Check funding, then consider "${title}"`;
    case "apply":
      return `Review "${title}" and consider applying`;
    default:
      return `Keep an eye on "${title}"`;
  }
}

const TONE_FOR_CHIP: Record<RecommendationCategory, TargetAction["tone"]> = {
  talk_first: "talk_first",
  check_funding: "check_funding",
  apply: "apply",
  monitor: "monitor",
  skip: "monitor",
};

/**
 * First matching rung wins; every rung cites the signals behind it. Talk-first rungs come before apply:
 * a named person beats a cold application, and we only name a person we actually have saved.
 */
export function chooseAction(input: {
  employerName: string;
  followUps: FollowUpNote[];
  warmPaths: WarmPath[];
  postings: TargetPosting[];
  fundingTrend: string | null;
  fundingLine: string | null;
  laneRelevant: boolean;
  careers: { read: CareersRead; note: string };
}): TargetAction {
  const { employerName } = input;

  // 1. A follow-up that is due or overdue.
  const due = input.followUps.find((item) => item.urgency === "overdue" || item.urgency === "due_soon");
  if (due) {
    return {
      kind: "follow_up",
      label: `Follow up with ${due.person}`,
      rationale: `${due.nextAction || "You owe them a next step"}${due.due ? ` (due ${due.due})` : ""}.`,
      signals: [`${due.urgency === "overdue" ? "Overdue" : "Due soon"} follow-up with ${due.person}`, `Tied to ${employerName}`],
      person: due.person,
      tone: "talk_first",
    };
  }

  // 2. A warm path: a saved person with a stated basis (or a scheduled follow-up with one).
  const path = input.warmPaths[0];
  const scheduled = input.followUps[0];
  if (path || scheduled) {
    const person = (path?.name ?? scheduled?.person) as string;
    const ask = path?.firstAsk ? ` ${path.firstAsk}` : "";
    return {
      kind: "reach_out",
      label: `Reach out to ${person} about ${employerName}`,
      rationale: `${path ? path.basis : `You have a follow-up with ${person} on the list`}.${ask}`.trim(),
      signals: [path ? `${path.name}: ${path.basis}` : `Follow-up with ${person} (${scheduled?.nextAction || "next step not recorded"})`],
      person,
      tone: "talk_first",
    };
  }

  // 3. A verified posting worth acting on, with its own chip.
  const live = input.postings.filter((posting) => posting.chip.category !== "skip").sort((a, b) => CHIP_RANK[a.chip.category] - CHIP_RANK[b.chip.category]);
  if (live.length) {
    const best = live[0];
    return {
      kind: "review_posting",
      label: actionVerb(best.chip, best.title),
      rationale: best.chip.rationale,
      signals: best.chip.signals.slice(0, 4),
      person: best.chip.namedContact,
      tone: TONE_FOR_CHIP[best.chip.category],
    };
  }

  // 4. Revenue is falling.
  if (input.fundingTrend === "shrinking" && input.fundingLine) {
    return {
      kind: "check_funding",
      label: "Check funding before investing time",
      rationale: `${input.fundingLine}. Its revenue is falling, so confirm it is hiring and funded before spending effort here.`,
      signals: [input.fundingLine],
      person: null,
      tone: "check_funding",
    };
  }

  // 5. Relevant to a lane, but no opening and nobody saved: an honest research action, never a named talk-first.
  if (input.laneRelevant) {
    return {
      kind: "find_someone",
      label: `Find someone to ask about ${employerName}`,
      rationale: "It fits a lane you are pursuing, but there is no verified opening and no saved contact there. A market-read conversation is the next move.",
      signals: ["Fits one of your lanes", "No verified opening", "No saved contact at this employer"],
      person: null,
      tone: "research",
    };
  }

  // 6. Its job list could not be read.
  if (input.careers.read === "blocked" || input.careers.read === "unreadable") {
    return {
      kind: "check_careers",
      label: "Check their careers page by hand",
      rationale: input.careers.note,
      signals: [input.careers.note],
      person: null,
      tone: "monitor",
    };
  }

  // 7. Nothing to act on.
  return {
    kind: "keep_watching",
    label: "Keep watching",
    rationale: "No verified opening, saved contact, or funding concern right now.",
    signals: ["Nothing actionable yet"],
    person: null,
    tone: "monitor",
  };
}

const NEW_TARGET_DAYS = 30;

/** The app's suggested status. `paused` / `not_interested` are only ever set by the user (slice 2). */
export function suggestStatus(input: {
  appliedOrTalking: boolean;
  hasPerson: boolean;
  hasLivePosting: boolean;
  hasAnySignal: boolean;
  createdAt: string | null;
  now: string;
}): TargetStatus {
  if (input.appliedOrTalking) return "applying";
  if (input.hasPerson) return "talk_first";
  if (input.hasLivePosting) return "researching";
  const created = input.createdAt ? Date.parse(input.createdAt) : Number.NaN;
  const recent = Number.isFinite(created) && Date.parse(input.now) - created <= NEW_TARGET_DAYS * 86_400_000;
  return !input.hasAnySignal && recent ? "new" : "monitoring";
}

// ---------------------------------------------------------------- assembly

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function worksiteText(row: ObservationRow): string {
  if (row.remote_status === "remote") return "Remote";
  return row.worksite_text || row.location_note || "Worksite not stated";
}

export function buildTargetDossiers(bundle: DossierBundle): TargetDossier[] {
  const { inputs } = bundle;
  const dispositionIndex = indexDispositions(bundle.dispositions);
  const scoreByKey = new Map(bundle.scores.map((score) => [normOrg(score.name), score]));
  const runStart = bundle.run ? Date.parse(bundle.run.startedAt) : Number.NaN;

  const dossiers = bundle.employers.map((employer): TargetDossier => {
    const key = normOrg(employer.name);
    const score = scoreByKey.get(key) ?? null;
    const lanes = tagCandidateLanes({ name: employer.name, category: employer.category ?? "" }, inputs.lanes);

    // --- people (real, saved, with a basis) ---
    const warmPaths: WarmPath[] = [];
    const seenPeople = new Set<string>();
    for (const contact of inputs.contacts.filter((item) => contactMatches(item, employer.name))) {
      if (seenPeople.has(contact.name.toLowerCase())) continue;
      seenPeople.add(contact.name.toLowerCase());
      warmPaths.push({ name: contact.name, basis: "A saved contact in your network works at this employer", firstAsk: contact.firstAsk });
    }
    const mineOutcomes = bundle.outcomes
      .filter((outcome) => refersToEmployer(outcome.relatedEmployer, employer.name, inputs) || refersToEmployer(outcome.contactOrganization, employer.name, inputs))
      .sort((a, b) => b.conversationDate.localeCompare(a.conversationDate));
    for (const outcome of mineOutcomes) {
      const person = outcome.contactName;
      if (!person || person === "Unknown contact" || seenPeople.has(person.toLowerCase())) continue;
      seenPeople.add(person.toLowerCase());
      warmPaths.push({ name: person, basis: `You spoke with them${outcome.conversationDate ? ` on ${outcome.conversationDate}` : ""}`, firstAsk: null });
    }
    const conversations: ConversationNote[] = mineOutcomes.slice(0, 3).map((outcome) => ({
      // A note with no named contact is still a real conversation; leave the name blank (never a placeholder shown as a person).
      person: outcome.contactName && outcome.contactName !== "Unknown contact" ? outcome.contactName : "",
      date: outcome.conversationDate,
      direction: outcome.signalDirection,
      signal: clip(outcome.hiringSignal || outcome.marketSignal || outcome.compensationSignal || outcome.warnings || outcome.newLeads || outcome.rawNoteExcerpt || "", 160),
    }));
    const followUps: FollowUpNote[] = bundle.obligations
      .filter((item) => item.contactName && refersToEmployer(item.relatedEmployer, employer.name, inputs))
      .map((item) => ({ person: item.contactName, nextAction: item.nextAction || item.promisedFollowUp || "", urgency: item.urgency, due: item.followUpDueDate }));

    // --- openings (this run's verified postings, each with its chip) ---
    const mine = bundle.observations.filter((row) => !row.exclusion_hit && refersToEmployer(row.employer_text, employer.name, inputs));
    const verifiedAll = mine.filter((row) => row.verification_state === "verified_open");
    const outsideArea = verifiedAll.filter((row) => isOutsideArea(row)).length;
    const postings: TargetPosting[] = verifiedAll
      .filter((row) => !isOutsideArea(row))
      .map((row) => ({
        title: row.title,
        url: row.source_url,
        chip: recommendationForPosting(row, inputs),
        isNew: Number.isFinite(runStart) && Date.parse(row.first_seen_at) >= runStart,
        userStatus: matchDisposition(row, dispositionIndex)?.status ?? null,
        worksite: worksiteText(row),
      }));
    const careers = careersReadFor(employer, bundle.coverage, inputs);

    // --- funding ---
    const profile = bundle.profiles.get(key) ?? null;
    const signal = profileToSignal(profile);
    const plan = planFinancialsLookup({ mode: employer.financialsMode, name: employer.name, category: employer.category, profile });
    const funding: TargetDossier["funding"] = signal
      ? { state: "ok", line: signal.line, trend: signal.trend, note: "From its latest IRS Form 990. A filing cannot show that a particular role is funded." }
      : !plan.lookup
        ? { state: "not_applicable", line: null, trend: null, note: "Filings do not apply to this employer." }
        : !profile
          ? { state: "not_looked_up", line: null, trend: null, note: "Not looked up yet." }
          : profile.status === "lookup_failed"
            ? { state: "failed", line: null, trend: null, note: "The last lookup could not be completed." }
            : { state: "no_filing", line: null, trend: null, note: "No Form 990 filing found. That means unknown, not poor funding." };

    // --- what changed ---
    const changes: string[] = [];
    if (score && score.direction !== "steady") changes.push(`Moved ${score.direction} in your target ranking. ${score.explanation}`.trim());
    const fresh = postings.filter((posting) => posting.isNew);
    if (fresh.length) changes.push(`${fresh.length} new verified opening${fresh.length === 1 ? "" : "s"} in the latest search`);

    // --- unknowns (stated, never turned into a verdict) ---
    const unknowns: string[] = [];
    if (!postings.length && (careers.read === "not_checked" || careers.read === "unreadable" || careers.read === "blocked" || careers.read === "none_on_file")) {
      unknowns.push(careers.read === "none_on_file" ? "Hiring unknown: no careers page is on file" : "Hiring unknown: its job list has not been read");
    }
    if (!warmPaths.length && !followUps.length) unknowns.push("No saved contact at this employer");
    const payUnknown = postings.filter((posting) => posting.chip.signals.some((signal) => /^Pay is not stated|^No salary minimum/i.test(signal))).length;
    if (payUnknown) unknowns.push(`Pay not stated on ${payUnknown} of ${postings.length} opening${postings.length === 1 ? "" : "s"}`);
    if (funding.state === "not_looked_up") unknowns.push("Funding not looked up");
    if (funding.state === "no_filing") unknowns.push("No Form 990 filing found (unknown, not poor funding)");

    // --- action + status ---
    const action = chooseAction({
      employerName: employer.name,
      followUps,
      warmPaths,
      postings,
      fundingTrend: signal?.trend ?? null,
      fundingLine: signal?.line ?? null,
      laneRelevant: lanes.length > 0,
      careers: { read: careers.read, note: careers.note },
    });
    const appliedOrTalking = postings.some((posting) => posting.userStatus === "applied" || posting.userStatus === "talking")
      || bundle.dispositions.some((d) => (d.status === "applied" || d.status === "talking") && d.employer_key === key);
    const status = suggestStatus({
      appliedOrTalking,
      hasPerson: warmPaths.length > 0 || followUps.length > 0,
      hasLivePosting: postings.some((posting) => posting.chip.category !== "skip"),
      hasAnySignal: warmPaths.length > 0 || followUps.length > 0 || conversations.length > 0 || postings.length > 0 || Boolean(signal),
      createdAt: employer.createdAt,
      now: bundle.now,
    });

    return {
      employerId: employer.id,
      name: employer.name,
      region: employer.region,
      category: employer.category,
      location: employer.location,
      careersUrl: employer.careersUrl,
      priority: employer.priority,
      fitScore: score?.score ?? employer.fitScore,
      movement: score ? { direction: score.direction, explanation: score.explanation, nextMove: score.nextMove } : null,
      lanes,
      warmPaths,
      conversations,
      followUps,
      openings: { verified: postings, outsideArea, careers: careers.read, careersNote: careers.note },
      funding,
      unknowns,
      changes,
      action,
      status,
      statusSource: "suggested",
    };
  });

  return sortDossiers(dossiers);
}

const URGENCY_RANK: Record<FollowUpNote["urgency"], number> = { overdue: 0, due_soon: 1, scheduled: 2, unscheduled: 3 };

/** Group order first (talk first, applying, researching, ...), then the most urgent action, then fit. */
export function sortDossiers(dossiers: TargetDossier[]): TargetDossier[] {
  const rank = (dossier: TargetDossier) => STATUS_ORDER.indexOf(dossier.status);
  const urgency = (dossier: TargetDossier) => Math.min(...dossier.followUps.map((item) => URGENCY_RANK[item.urgency]), 9);
  return [...dossiers].sort((a, b) => rank(a) - rank(b) || urgency(a) - urgency(b) || (b.fitScore ?? 0) - (a.fitScore ?? 0) || a.name.localeCompare(b.name));
}

export function groupDossiers(dossiers: TargetDossier[]): Array<{ status: TargetStatus; items: TargetDossier[] }> {
  return STATUS_ORDER.map((status) => ({ status, items: dossiers.filter((dossier) => dossier.status === status) })).filter((group) => group.items.length > 0);
}
