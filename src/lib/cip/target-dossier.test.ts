import { describe, expect, it } from "vitest";
import { buildOutcome } from "@/lib/cip/__fixtures__/outcome-fixture";
import type { FundingProfile } from "@/lib/cip/employer-financials";
import { buildCanonicalEmployers, normOrg } from "@/lib/cip/employer-resolution";
import type { CoverageEntry, ObservationRow } from "@/lib/cip/job-search-run";
import type { RecommendationInputs } from "@/lib/cip/opportunity-recommendations";
import type { PostingDisposition } from "@/lib/cip/posting-dispositions";
import type { StrategicEmployerScore, StrategicFollowUpObligation } from "@/lib/cip/strategic-state";
import {
  buildTargetDossiers,
  careersReadFor,
  chooseAction,
  groupDossiers,
  refersToEmployer,
  suggestStatus,
  type DossierBundle,
  type DossierEmployer,
} from "@/lib/cip/target-dossier";

// Invented organizations only. No test here touches the network or a database.

const NOW = "2026-10-07T12:00:00.000Z";
const RUN_START = "2026-10-07T09:00:00.000Z";
const ED_LANE = { lane: "Executive Director / Nonprofit Media Leader", label: "Primary lane" };

const employer = (over: Partial<DossierEmployer> & Pick<DossierEmployer, "name">): DossierEmployer => ({
  id: `id-${over.name}`, region: "Upper Valley", category: "community organizations", location: "Lebanon, NH", priority: "medium",
  fitScore: 70, careersUrl: "https://careers.example.org", createdAt: "2026-06-01T00:00:00.000Z", ...over,
});

const posting = (over: Partial<ObservationRow> = {}): ObservationRow => ({
  id: "x", run_id: "r", title: "Program Operations Lead", employer_text: "Granite Community Trust", worksite_text: "Lebanon, NH",
  source_url: "https://jobs.example.org/p/1", requisition_id: "R-1", posted_text: null, salary_text: "$95,000", remote_status: "not_stated",
  matched_role_term: "program operations", source_tier: "target_page", verification_state: "verified_open", verification_note: null,
  verification_checked_at: NOW, location_status: "within", location_distance_miles: 3, location_note: null, exclusion_hit: null,
  first_seen_at: "2026-09-20T00:00:00.000Z", carried_forward: false, salary_text_extra: undefined, ...over,
} as ObservationRow);

function bundle(over: Partial<DossierBundle> & { employers: DossierEmployer[] }): DossierBundle {
  const names = over.employers.map((e) => e.name);
  const inputs: RecommendationInputs = {
    floorUsd: 85_000,
    canon: buildCanonicalEmployers(names),
    aliases: new Map(),
    employers: over.employers.map((e) => ({ canonical: e.name, category: e.category, priority: e.priority, fitScore: e.fitScore, nextMove: null, nextMoveIsRelational: false })),
    contacts: [],
    followUps: [],
    lanes: [ED_LANE],
    ...(over.inputs ?? {}),
  };
  return {
    scores: [], outcomes: [], obligations: [], run: { startedAt: RUN_START, status: "succeeded" }, observations: [], coverage: [], dispositions: [],
    profiles: new Map(), now: NOW, ...over, inputs,
  };
}

const one = (b: DossierBundle, name: string) => buildTargetDossiers(b).find((d) => d.name === name)!;
const GRANITE = employer({ name: "Granite Community Trust" });

describe("people: only real, saved, stated-basis paths", () => {
  it("names a saved network contact as a warm path with its stored first ask, and suggests talk first", () => {
    const d = one(bundle({ employers: [GRANITE], inputs: { contacts: [{ norm: normOrg("Granite Community Trust"), canonical: "Granite Community Trust", name: "Sarah Lin", firstAsk: "Ask how the team is structured." }] } as never }), "Granite Community Trust");
    expect(d.warmPaths).toEqual([{ name: "Sarah Lin", basis: "A saved contact in your network works at this employer", firstAsk: "Ask how the team is structured." }]);
    expect(d.action).toMatchObject({ kind: "reach_out", person: "Sarah Lin", tone: "talk_first", label: "Reach out to Sarah Lin about Granite Community Trust" });
    expect(d.action.rationale).toContain("Ask how the team is structured.");
    expect(d.status).toBe("talk_first");
    expect(d.unknowns).not.toContain("No saved contact at this employer");
  });

  it("treats someone you actually spoke with as a path, with the date as the basis, and never an 'Unknown contact'", () => {
    const outcomes = [
      buildOutcome({ contactName: "Dana Reyes", relatedEmployer: "Granite Community Trust", conversationDate: "2026-09-12", hiringSignal: "They expect to hire a program lead in the winter." }),
      buildOutcome({ contactName: "Unknown contact", relatedEmployer: "Granite Community Trust", conversationDate: "2026-09-13" }),
    ];
    const d = one(bundle({ employers: [GRANITE], outcomes }), "Granite Community Trust");
    expect(d.warmPaths.map((p) => p.name)).toEqual(["Dana Reyes"]);
    expect(d.warmPaths[0].basis).toBe("You spoke with them on 2026-09-12");
    // Both conversations stay in the history (newest first); the unnamed one has a blank person, not a placeholder.
    expect(d.conversations.map((c) => [c.person, c.date])).toEqual([["", "2026-09-13"], ["Dana Reyes", "2026-09-12"]]);
    expect(d.conversations[1].signal).toMatch(/hire a program lead/);
  });

  it("does not attach another employer's contact, and never guesses an affiliation from a shared word", () => {
    const b = bundle({
      employers: [GRANITE, employer({ name: "Valley Arts Council" })],
      inputs: { contacts: [{ norm: normOrg("Valley Arts Council"), canonical: "Valley Arts Council", name: "Pat Gray", firstAsk: null }, { norm: normOrg("Community Bank"), canonical: null, name: "Lee Ford", firstAsk: null }] } as never,
    });
    expect(one(b, "Granite Community Trust").warmPaths).toEqual([]);
    expect(one(b, "Valley Arts Council").warmPaths.map((p) => p.name)).toEqual(["Pat Gray"]);
  });

  it("keeps Dartmouth College and Dartmouth Health separate, and honors a saved 'keep separate' correction", () => {
    const health = employer({ name: "Dartmouth Health" });
    const college = employer({ name: "Dartmouth College" });
    const b = bundle({ employers: [health, college], observations: [posting({ employer_text: "Dartmouth College", title: "Senior Media Officer" })] });
    expect(one(b, "Dartmouth Health").openings.verified).toHaveLength(0);
    expect(one(b, "Dartmouth College").openings.verified).toHaveLength(1);

    const forced = bundle({ employers: [GRANITE] });
    forced.inputs.aliases = new Map([[normOrg("Granite Community Trust Foundation"), ""]]);
    expect(refersToEmployer("Granite Community Trust Foundation", "Granite Community Trust", forced.inputs)).toBe(false);
  });

  it("a due follow-up beats a warm path; a scheduled one only counts as a path", () => {
    const obligations: StrategicFollowUpObligation[] = [
      { contactName: "Sam Rivera", relatedLane: "", relatedEmployer: "Granite Community Trust", promisedFollowUp: "Send the intro note", followUpDueDate: "2026-10-01", nextAction: "Send the intro note", urgency: "overdue", reasons: [] },
    ];
    const contacts = [{ norm: normOrg("Granite Community Trust"), canonical: "Granite Community Trust", name: "Sarah Lin", firstAsk: null }];
    const due = one(bundle({ employers: [GRANITE], obligations, inputs: { contacts } as never }), "Granite Community Trust");
    expect(due.action).toMatchObject({ kind: "follow_up", person: "Sam Rivera", label: "Follow up with Sam Rivera" });
    expect(due.action.rationale).toContain("due 2026-10-01");

    const later = one(bundle({ employers: [GRANITE], obligations: [{ ...obligations[0], urgency: "scheduled", followUpDueDate: "2026-11-01" }] }), "Granite Community Trust");
    expect(later.action).toMatchObject({ kind: "reach_out", person: "Sam Rivera" });
    expect(later.status).toBe("talk_first");
  });
});

describe("openings: a careers URL is never evidence of a job", () => {
  it("shows an employer with a careers page and high fit but no verified postings as having no verified openings", () => {
    const d = one(bundle({ employers: [employer({ name: "Granite Community Trust", fitScore: 95, priority: "high", careersUrl: "https://careers.example.org" })] }), "Granite Community Trust");
    expect(d.openings.verified).toEqual([]);
    expect(d.unknowns).toContain("Hiring unknown: its job list has not been read");
  });

  it("lists this employer's verified postings with their own chip and flags the ones new in the latest run", () => {
    const b = bundle({
      employers: [GRANITE],
      observations: [
        posting({ source_url: "https://jobs.example.org/old", first_seen_at: "2026-09-20T00:00:00.000Z", title: "Old Posting" }),
        posting({ source_url: "https://jobs.example.org/new", first_seen_at: "2026-10-07T09:30:00.000Z", title: "Brand New Posting" }),
        posting({ source_url: "https://jobs.example.org/unverified", verification_state: "discovered_unverified", title: "Unverified" }),
        posting({ source_url: "https://jobs.example.org/gone", verification_state: "no_longer_visible", title: "Gone" }),
        posting({ source_url: "https://jobs.example.org/other", employer_text: "Totally Different Org", title: "Elsewhere" }),
      ],
    });
    const d = one(b, "Granite Community Trust");
    expect(d.openings.verified.map((p) => p.title)).toEqual(["Old Posting", "Brand New Posting"]);
    expect(d.openings.verified.map((p) => p.isNew)).toEqual([false, true]);
    expect(d.changes).toContain("1 new verified opening in the latest search");
    expect(d.openings.verified[0].chip.category).toBeDefined();
  });

  it("keeps a far-away verified posting visible as 'outside your places' without counting it as an opening", () => {
    const d = one(bundle({ employers: [GRANITE], observations: [posting({ location_status: "outside", worksite_text: "Boston, MA" })] }), "Granite Community Trust");
    expect(d.openings.verified).toHaveLength(0);
    expect(d.openings.outsideArea).toBe(1);
  });

  it("picks the most actionable chip for the review action, with talk-first ahead of apply", () => {
    const d = one(bundle({
      employers: [GRANITE],
      observations: [posting({ title: "Program Coordinator", source_url: "https://jobs.example.org/a" }), posting({ title: "Executive Director", salary_text: null, source_url: "https://jobs.example.org/b" })],
    }), "Granite Community Trust");
    expect(d.action.kind).toBe("review_posting");
    expect(d.action.label).toMatch(/Check funding, then consider "Executive Director"/); // mission employer + senior role + no pay: funding first
    expect(d.status).toBe("researching");
  });

  it("does not suggest researching for a posting whose chip says skip (e.g. below the floor)", () => {
    const d = one(bundle({ employers: [GRANITE], observations: [posting({ salary_text: "$40,000" })] }), "Granite Community Trust");
    expect(d.openings.verified[0].chip.category).toBe("skip");
    expect(d.action.kind).not.toBe("review_posting");
    expect(d.status).not.toBe("researching");
  });
});

describe("careers page read state", () => {
  const emp = employer({ name: "Granite Community Trust" });
  const inputs = bundle({ employers: [emp] }).inputs;
  const cov = (status: string, name = "Granite Community Trust"): CoverageEntry => ({ name, status, note: "", careersPageUrl: null, tier: "target_page", step: 0 });

  it("maps coverage to read / blocked / unreadable / not checked / none on file", () => {
    expect(careersReadFor(emp, [cov("read_openings")], inputs).read).toBe("read");
    expect(careersReadFor(emp, [cov("no_matching_openings")], inputs).read).toBe("read");
    expect(careersReadFor(emp, [cov("direct_read_blocked")], inputs).read).toBe("blocked");
    expect(careersReadFor(emp, [cov("page_found_but_could_not_read_listings")], inputs).read).toBe("unreadable");
    expect(careersReadFor(emp, [], inputs).read).toBe("not_checked");
    expect(careersReadFor({ ...emp, careersUrl: null }, [], inputs).read).toBe("none_on_file");
  });

  it("lets a successful read win over an earlier failure, and ignores other employers' coverage", () => {
    expect(careersReadFor(emp, [cov("page_found_but_could_not_read_listings"), cov("read_directly_by_app")], inputs).read).toBe("read");
    expect(careersReadFor(emp, [cov("direct_read_blocked", "Some Other Org")], inputs).read).toBe("not_checked");
  });
});

describe("the next-action ladder", () => {
  const base = { employerName: "Granite Community Trust", followUps: [], warmPaths: [], postings: [], fundingTrend: null, fundingLine: null, laneRelevant: false, careers: { read: "read" as const, note: "" } };

  it("a lane-relevant target with no opening and nobody saved gets an honest research action, never a named person", () => {
    const a = chooseAction({ ...base, laneRelevant: true });
    expect(a).toMatchObject({ kind: "find_someone", person: null, tone: "research", label: "Find someone to ask about Granite Community Trust" });
    expect(a.signals).toContain("No saved contact at this employer");
  });

  it("falls back from a funding concern to careers-by-hand to keep watching, in that order", () => {
    expect(chooseAction({ ...base, fundingTrend: "shrinking", fundingLine: "IRS 990 (FY 2024): revenue $820k, down 29% since FY 2022" }).kind).toBe("check_funding");
    expect(chooseAction({ ...base, careers: { read: "blocked", note: "Its site asks automated readers not to read its job list." } }).kind).toBe("check_careers");
    expect(chooseAction(base)).toMatchObject({ kind: "keep_watching", tone: "monitor" });
  });

  it("a funding concern outranks the lane-relevant research action, and a person outranks both", () => {
    expect(chooseAction({ ...base, laneRelevant: true, fundingTrend: "shrinking", fundingLine: "line" }).kind).toBe("check_funding");
    expect(chooseAction({ ...base, laneRelevant: true, fundingTrend: "shrinking", fundingLine: "line", warmPaths: [{ name: "Sarah Lin", basis: "Saved contact", firstAsk: null }] }).kind).toBe("reach_out");
  });
});

describe("suggested status", () => {
  const status = (over: Partial<Parameters<typeof suggestStatus>[0]> = {}) =>
    suggestStatus({ appliedOrTalking: false, hasPerson: false, hasLivePosting: false, hasAnySignal: false, createdAt: "2026-10-01T00:00:00.000Z", now: NOW, ...over });

  it("follows the precedence applying > talk first > researching > new/monitoring, and never suggests paused or not interested", () => {
    expect(status({ appliedOrTalking: true, hasPerson: true, hasLivePosting: true })).toBe("applying");
    expect(status({ hasPerson: true, hasLivePosting: true })).toBe("talk_first");
    expect(status({ hasLivePosting: true })).toBe("researching");
    expect(status()).toBe("new");
    expect(status({ createdAt: "2026-06-01T00:00:00.000Z" })).toBe("monitoring");
    expect(status({ hasAnySignal: true })).toBe("monitoring");
    expect(status({ createdAt: null })).toBe("monitoring");
  });

  it("suggests applying when the user marked one of this employer's postings applied or talking", () => {
    const disposition: PostingDisposition = { normalized_url: "jobs.example.org/p/1", source_url: "https://jobs.example.org/p/1", employer_key: "granite community trust", requisition_id: null, status: "applied", note: "", updated_at: NOW };
    const d = one(bundle({ employers: [GRANITE], observations: [posting()], dispositions: [disposition] }), "Granite Community Trust");
    expect(d.status).toBe("applying");
    expect(d.openings.verified[0].userStatus).toBe("applied");
    expect(d.statusSource).toBe("suggested");
  });
});

describe("funding and unknowns", () => {
  const profile = (over: Partial<FundingProfile> = {}): FundingProfile => ({
    employerKey: "granite community trust", employerName: "Granite Community Trust", ein: 1, organizationName: "Granite Community Trust", nteeCode: "", latestRevenueUsd: 820_000,
    latestExpensesUsd: 790_000, latestAssetsUsd: 1_600_000, latestFilingYear: 2024, filingCount: 3, trend: "shrinking",
    revenueSeries: [{ year: 2024, revenue: 820_000, expenses: null }, { year: 2023, revenue: 1_000_000, expenses: null }, { year: 2022, revenue: 1_150_000, expenses: null }],
    pdfUrl: "", sourceUrl: "", status: "ok", statusNote: "", updatedAt: NOW, ...over,
  });
  const fund = (e: DossierEmployer, p: FundingProfile | null) => one(bundle({ employers: [e], profiles: p ? new Map([[normOrg(e.name), p]]) : new Map() }), e.name);

  it("shows the filing line when there is one, and a shrinking trend becomes the funding action", () => {
    const d = fund(GRANITE, profile());
    expect(d.funding).toMatchObject({ state: "ok" });
    expect(d.funding.line).toBe("IRS 990 (FY 2024): revenue $820k, down 29% since FY 2022");
    expect(d.action.kind === "check_funding" || d.action.kind === "find_someone").toBe(true);
  });

  it("states not looked up, no filing, and not applicable as distinct things, never as poor funding", () => {
    expect(fund(GRANITE, null).funding.state).toBe("not_looked_up");
    expect(fund(GRANITE, profile({ status: "no_match", latestRevenueUsd: null })).funding).toMatchObject({ state: "no_filing", note: expect.stringMatching(/unknown, not poor funding/) });
    expect(fund(GRANITE, profile({ status: "lookup_failed", latestRevenueUsd: null })).funding.state).toBe("failed");
    expect(fund(employer({ name: "City of Lebanon", category: "municipal government" }), null).funding.state).toBe("not_applicable");
  });

  it("lists unknowns explicitly: no contact, funding not looked up, pay not stated", () => {
    const d = one(bundle({ employers: [GRANITE], observations: [posting({ salary_text: null })] }), "Granite Community Trust");
    expect(d.unknowns).toContain("No saved contact at this employer");
    expect(d.unknowns).toContain("Funding not looked up");
    expect(d.unknowns.some((u) => /Pay not stated on 1 of 1 opening/.test(u))).toBe(true);
  });
});

describe("lanes, movement, ordering", () => {
  it("tags lane fit from the employer's category, labels the reason, and leaves a non-fit untagged", () => {
    const b = bundle({ employers: [GRANITE, employer({ name: "Summit Machining", category: "advanced manufacturing" })] });
    expect(one(b, "Granite Community Trust").lanes[0]).toMatchObject({ lane: ED_LANE.lane, label: "Primary lane" });
    expect(one(b, "Summit Machining").lanes).toEqual([]);
  });

  it("reports ranking movement from the strategic score and uses the score as the fit", () => {
    const scores: StrategicEmployerScore[] = [{ name: "Granite Community Trust", region: "x", source: "watched", score: 82, direction: "up", reasons: [], explanation: "A conversation strengthened this employer.", nextMove: "Review current roles." }];
    const d = one(bundle({ employers: [GRANITE], scores }), "Granite Community Trust");
    expect(d.fitScore).toBe(82);
    expect(d.movement).toMatchObject({ direction: "up", nextMove: "Review current roles." });
    expect(d.changes[0]).toMatch(/^Moved up in your target ranking\. A conversation strengthened/);
  });

  it("orders by group (talk first before researching before monitoring), then urgency, then fit; talk-first is as prominent as apply", () => {
    const b = bundle({
      employers: [employer({ name: "Quiet Org", fitScore: 99, createdAt: "2026-01-01T00:00:00.000Z" }), employer({ name: "Posting Org", fitScore: 60 }), employer({ name: "Warm Org", fitScore: 40 })],
      observations: [posting({ employer_text: "Posting Org", title: "Program Coordinator" })],
      inputs: { contacts: [{ norm: normOrg("Warm Org"), canonical: "Warm Org", name: "Sarah Lin", firstAsk: null }] } as never,
    });
    const order = buildTargetDossiers(b).map((d) => `${d.name}:${d.status}`);
    expect(order).toEqual(["Warm Org:talk_first", "Posting Org:researching", "Quiet Org:monitoring"]);
    expect(groupDossiers(buildTargetDossiers(b)).map((g) => g.status)).toEqual(["talk_first", "researching", "monitoring"]);
  });

  it("handles no employers, no run, and no data without throwing", () => {
    expect(buildTargetDossiers(bundle({ employers: [] }))).toEqual([]);
    const d = one(bundle({ employers: [GRANITE], run: null }), "Granite Community Trust");
    expect(d.openings.verified).toEqual([]);
    expect(d.action.kind).toBe("find_someone");
  });
});
