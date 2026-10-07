import { describe, expect, it } from "vitest";
import type { Recommendation } from "@/lib/cip/recommendation";
import type { TargetDossier, TargetPosting } from "@/lib/cip/target-dossier";
import { renderTargetCard, renderWorkspace, workspaceSummary, type WorkspaceViewOptions } from "@/lib/cip/target-workspace-view";

const RUN = { startedAt: "2026-10-07T09:00:00.000Z", finishedAt: "2026-10-07T09:20:00.000Z", status: "succeeded" };
const options = (over: Partial<WorkspaceViewOptions> = {}): WorkspaceViewOptions => ({ renderFunding: () => "<div>FUNDING-BLOCK</div>", run: RUN, ...over });

const chip = (over: Partial<Recommendation> = {}): Recommendation => ({ category: "apply", confidence: "high", rationale: "Verified open, matches your Primary lane.", signals: [], namedContact: null, ...over });
const posting = (over: Partial<TargetPosting> = {}): TargetPosting => ({ title: "Program Operations Lead", url: "https://jobs.example.org/p/1", chip: chip(), isNew: false, userStatus: null, worksite: "Lebanon, NH", ...over });

function dossier(over: Partial<TargetDossier> = {}): TargetDossier {
  return {
    employerId: "e1", name: "Granite Community Trust", region: "Upper Valley", category: "community organizations", location: "Lebanon, NH", careersUrl: "https://careers.example.org",
    priority: "medium", fitScore: 82, movement: null, lanes: [{ lane: "Executive Director", label: "Primary lane", reason: "Employer type fits your Primary lane" }],
    warmPaths: [], conversations: [], followUps: [],
    openings: { verified: [], outsideArea: 0, careers: "read", careersNote: "Its job list was read in the latest search." },
    funding: { state: "not_looked_up", line: null, trend: null, note: "Not looked up yet." },
    unknowns: [], changes: [],
    action: { kind: "keep_watching", label: "Keep watching", rationale: "No verified opening, saved contact, or funding concern right now.", signals: ["Nothing actionable yet"], person: null, tone: "monitor" },
    status: "monitoring", statusSource: "suggested", ...over,
  };
}

describe("renderTargetCard", () => {
  it("shows the name, lane fit, fit score, and the status labeled as the app's suggestion", () => {
    const html = renderTargetCard(dossier(), options());
    expect(html).toContain("Granite Community Trust");
    expect(html).toContain("Fits: Primary lane");
    expect(html).toContain("82%");
    expect(html).toContain("Monitoring · suggested");
    expect(html).toContain("Suggested next action");
    expect(html).toContain("Why this suggestion");
    expect(html).toContain("FUNDING-BLOCK"); // the injected 990 block
  });

  it("says plainly when there is no lane fit, and shows ranking movement", () => {
    const html = renderTargetCard(dossier({ lanes: [], movement: { direction: "down", explanation: "x", nextMove: "y" } }), options());
    expect(html).toContain("No current lane fit");
    expect(html).toContain("↓ moved down");
    expect(renderTargetCard(dossier({ movement: { direction: "up", explanation: "x", nextMove: "y" } }), options())).toContain("↑ moved up");
    expect(renderTargetCard(dossier({ movement: { direction: "steady", explanation: "x", nextMove: "y" } }), options())).not.toContain("moved");
  });

  it("styles a talk-first action as prominently as apply, and a funding check as a caution", () => {
    const talk = renderTargetCard(dossier({ action: { kind: "reach_out", label: "Reach out to Sarah Lin about Granite", rationale: "r", signals: [], person: "Sarah Lin", tone: "talk_first" } }), options());
    const apply = renderTargetCard(dossier({ action: { kind: "review_posting", label: "Review it", rationale: "r", signals: [], person: null, tone: "apply" } }), options());
    const funding = renderTargetCard(dossier({ action: { kind: "check_funding", label: "Check funding", rationale: "r", signals: [], person: null, tone: "check_funding" } }), options());
    const research = renderTargetCard(dossier({ action: { kind: "find_someone", label: "Find someone", rationale: "r", signals: [], person: null, tone: "research" } }), options());
    expect(talk).toContain("border-[var(--accent)] bg-[var(--accent-soft)]");
    expect(apply).toContain("border-[var(--accent)] bg-[var(--accent-soft)]");
    expect(funding).toContain("bg-yellow-50");
    expect(research).not.toContain("bg-[var(--accent-soft)] p-3");
  });

  it("lists real people with their stated basis, and says nobody is guessed when there is no one", () => {
    const withPeople = renderTargetCard(dossier({
      warmPaths: [{ name: "Sarah Lin", basis: "A saved contact in your network works at this employer", firstAsk: "Ask about the team." }],
      followUps: [{ person: "Sam Rivera", nextAction: "Send the intro note", urgency: "overdue", due: "2026-10-01" }],
      conversations: [{ person: "Dana Reyes", date: "2026-09-12", direction: "strengthens", signal: "They expect to hire in winter." }, { person: "", date: "2026-09-13", direction: "unclear", signal: "" }],
    }), options());
    expect(withPeople).toContain("Sarah Lin");
    expect(withPeople).toContain("A saved contact in your network works at this employer");
    expect(withPeople).toContain("Ask about the team.");
    expect(withPeople).toContain("Follow-up with Sam Rivera");
    expect(withPeople).toContain("overdue");
    expect(withPeople).toContain("They expect to hire in winter.");
    expect(withPeople).toContain("A conversation"); // the unnamed one, not a placeholder person

    const none = renderTargetCard(dossier(), options());
    expect(none).toContain("No saved contact or conversation at this employer. Nobody is guessed.");
  });

  it("says openings are unknown before any search, and 'no verified openings' after one, without treating a careers page as evidence", () => {
    expect(renderTargetCard(dossier(), options({ run: null }))).toContain("No search has run yet, so openings here are unknown.");
    const none = renderTargetCard(dossier({ openings: { verified: [], outsideArea: 2, careers: "read", careersNote: "Its job list was read in the latest search." } }), options());
    expect(none).toContain("No verified openings right now (latest search 2026-10-07)");
    expect(none).toContain("A careers page or a high fit is not evidence of an opening.");
    expect(none).toContain("2 verified openings are outside your places.");
    expect(none).toContain('href="https://careers.example.org/"'); // normalized by URL parsing
  });

  it("lists verified openings with their chip, a 'new this search' marker, and your own status", () => {
    const html = renderTargetCard(dossier({
      openings: { verified: [posting({ isNew: true, userStatus: "applied" }), posting({ title: "Executive Director", url: "https://jobs.example.org/p/2", chip: chip({ category: "check_funding", rationale: "Confirm it is funded." }) })], outsideArea: 0, careers: "read", careersNote: "n" },
    }), options());
    expect(html).toContain('href="https://jobs.example.org/p/1"');
    expect(html).toContain("New this search");
    expect(html).toContain("You marked it applied");
    expect(html).toContain("Check funding");
    expect(html).toContain("Confirm it is funded.");
  });

  it("lists unknowns explicitly and injects the extras block", () => {
    const html = renderTargetCard(dossier({ unknowns: ["No saved contact at this employer", "Funding not looked up"] }), options({ renderExtras: () => "<div>EXTRAS-BLOCK</div>" }));
    expect(html).toContain("Still unknown");
    expect(html).toContain("Funding not looked up");
    expect(html).toContain("EXTRAS-BLOCK");
  });

  it("escapes every dynamic value and refuses non-http links", () => {
    const html = renderTargetCard(dossier({
      name: "<img src=x onerror=alert(1)>",
      careersUrl: "javascript:alert(1)",
      action: { kind: "keep_watching", label: "<script>alert(1)</script>", rationale: '"><b>x</b>', signals: ["<i>s</i>"], person: null, tone: "monitor" },
      openings: { verified: [posting({ title: "<script>t</script>", url: "javascript:alert(2)" })], outsideArea: 0, careers: "read", careersNote: "<u>n</u>" },
      warmPaths: [{ name: "<b>Eve</b>", basis: "<i>basis</i>", firstAsk: null }],
    }), options());
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<b>x</b>");
    expect(html).not.toContain("<b>Eve</b>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain('href="javascript:');
  });
});

describe("renderWorkspace", () => {
  const talk = dossier({ employerId: "t", name: "Warm Org", status: "talk_first" });
  const research = dossier({ employerId: "r", name: "Posting Org", status: "researching", openings: { verified: [posting({ isNew: true })], outsideArea: 0, careers: "read", careersNote: "n" } });
  const funding = dossier({ employerId: "f", name: "Shaky Org", status: "monitoring", funding: { state: "ok", line: "IRS 990 (FY 2024): revenue $820k, down 29% since FY 2022", trend: "shrinking", note: "n" } });

  it("groups cards by status in order with counts and a blurb, and shows the summary strip", () => {
    const html = renderWorkspace([research, funding, talk], options());
    const order = ["Talk first", "Researching", "Monitoring"].map((label) => html.indexOf(`<h2 class="text-lg font-semibold">${label}</h2>`));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain("A saved person or an open follow-up makes a conversation the best next move.");
    expect(html).toContain("Funding: IRS 990 (FY 2024)"); // at-a-glance funding line on the card
    expect(html).toContain("Funding concerns");
  });

  it("summarizes: targets, talk first, due follow-ups, openings, funding concerns, new openings", () => {
    const due = dossier({ employerId: "d", status: "talk_first", action: { kind: "follow_up", label: "Follow up", rationale: "r", signals: [], person: "Sam", tone: "talk_first" } });
    expect(workspaceSummary([talk, research, funding, due])).toEqual({ total: 4, needConversation: 2, withOpenings: 1, followUpsDue: 1, fundingConcerns: 1, newOpenings: 1 });
  });

  it("shows a helpful empty state, never an empty page", () => {
    const html = renderWorkspace([], options());
    expect(html).toContain("No tracked employers yet");
    expect(html).not.toContain("Targets");
  });
});
