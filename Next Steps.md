# CIP-Career Next Steps

Last reviewed: 2026-09-10

This document carries three independent review passes:

- **Round 1** — strategy-level review of product direction and gaps.
- **Round 2** — code-level audit (same date) that verifies Round 1's claims against the source, names the founder-specific hardcoding to remove, and defines what must be true before a small beta.
- **Round 3** — the founder-verified loop failure (the saturation gate), the monthly-Claude reframe, the fork decision, and the weekly-discovery finding.

Where the rounds disagree, Round 2 wins because it is grounded in the code. The product goal confirmed by the founder: CIP becomes a real SaaS, and it must serve *parallel, structurally different* career lanes — nonprofit/public-interest work in the Upper Valley, and game development / indie game development.

---

# Round 1 — Product Strategy Review

## Executive Read

CIP-Career is not merely a prompt wrapper, but the "magic" is uneven.

The strongest parts of the app are the pieces that persist structured career context over time: intake, evidence answers, linked-source analysis, resume drafts, network imports, employer candidates, conversation notes, and reports. That additive record is the foundation for something better than a good ChatGPT or Claude prompt.

The weaker parts are the parts that should make the app feel like a true job-search partner: regional employer intelligence, nonprofit/local-market understanding, conversation-driven strategy updates, and weekly "what changed" guidance. Right now, the app has a credible loop, but some stages still behave like assembled snapshots instead of adaptive coaching.

The product should not try to help the user compete in a brutal generic software-job pile with a shinier resume. Its best role is to help the user avoid the pile.

The core product question should be:

> Given who I actually am, who I know, where I live, what I will not do, what evidence I can prove, and what I learned from real conversations, where should I place the next five bets?

That is the thing CIP can do better than a single well-written LLM prompt.

## What Is Already Strong

### 1. Additive Career Memory

The database and app flows store career work as a sequence of artifacts rather than one overwritten profile. This is a real advantage over a standalone prompt.

Useful existing records include:

- `resume_intake`
- `evidence_response`
- `source_analysis`
- `evidence_analysis`
- `analysis_review`
- `resume_draft`
- `network_import`
- `network_analysis`
- `network_feedback`
- `conversation_outcome`
- `career_report`
- employer discovery candidates
- watched employers
- weekly strategy snapshots

This lets the app remember what was already answered, which claims are verified, which contacts should not be recommended, and what the user learned from real conversations.

### 2. Evidence-Aware Advisor

`src/lib/cip/advisor.ts` already pushes the app in the right direction. It produces:

- evidence ledgers
- role briefs
- claim-safety notes
- exploration areas
- follow-up questions
- deterministic fallback analysis

The key strength is the attempt to separate verified facts, user-stated claims, medium-confidence inference, and unresolved proof gaps.

### 3. Resume Generation Has a Real Thesis

`src/lib/cip/resume-assets.ts` is stronger than generic resume rewriting because it generates lane-specific resume drafts from saved context. It does not only "make the resume sound better." It asks: which target lane is this resume serving?

That is the right direction. The app should produce different versions for different strategic bets, not one allegedly universal resume.

### 4. Network Intelligence Is the Most Differentiated Area

`src/lib/cip/network-intelligence.ts` is the closest thing to the app's real moat.

It can:

- parse contact exports and pasted relationship notes
- dedupe contacts
- avoid recommending generic organizations as people
- respect feedback such as remove, deceased, retired, current involvement, no memory, and ethical concern
- use ideal-work constraints
- validate career lanes through named people
- recommend market-read conversations before referral asks
- incorporate loop-back conversation notes

This is something a generic prompt will not do reliably unless the user manually reconstructs all context every time.

### 5. Deterministic Report Is an Integrity Win

`src/lib/cip/career-report.ts` assembles what the system already knows instead of calling an LLM to invent a polished report. The visible confidence labels are the right trust pattern.

This should remain a core product principle: AI can synthesize, but the report should show provenance and confidence.

## Where The App Lacks

### 1. Nonprofit And Regional Employer Intelligence Is Too Thin

The user's current direction is toward nonprofits and regional institutions in the Upper Valley, White River Junction/Lebanon, northern Vermont, and northern New Hampshire.

The current employer discovery flow can run web-backed search and save employer candidates, but it does not yet deeply model nonprofit and local-institution realities:

- mission fit
- funding stability
- grant-funded roles
- board and leadership networks
- program areas
- local reputation
- salary plausibility
- role families common in nonprofits
- fiscal sponsor relationships
- community health, workforce, education, housing, arts, library, foundation, and municipal ecosystems
- whether a conversation should happen before an application

This is now the largest product gap.

### 2. Weekly Strategy Is Too Static

`src/lib/cip/weekly-strategy.ts` mostly counts watched employers and opportunity matches. It does not yet answer the most useful question:

> What changed since last week, and what should I do differently now?

A real partner should notice:

- a conversation weakened a role lane
- an employer became more plausible
- a target geography changed
- a contact should be parked
- a new employer category emerged
- a salary assumption looks wrong
- the resume should shift toward a different story
- a next action is stale

The briefing should be the heartbeat of the app, not a summary card.

### 3. Employer And Job Scoring Is Still Mostly Keyword-Based

The current scoring in `labor-market.ts` and `watched-employers.ts` is useful as a first pass, but it is not yet strategic enough.

Missing scoring dimensions:

- mission fit
- compensation likelihood
- seniority fit
- organization size
- public/nonprofit/private sector differences
- known dealbreakers
- network proximity
- current hiring confidence
- source confidence
- evidence strength behind the user's fit
- "apply now" versus "talk first" recommendation

The app should not just rank jobs. It should distinguish between:

- apply
- monitor
- talk to someone first
- investigate funding/role fit
- avoid

### 4. Conversation Outcomes Are Not First-Class Enough

The app saves loop-back conversation notes, but they are still mostly free text. That makes them useful, but not powerful enough.

Conversation outcomes should become typed records with fields such as:

- contact
- organization
- lane affected
- employer affected
- signal type
- strengthened or weakened
- compensation signal
- culture signal
- hiring signal
- warning
- new lead
- follow-up date
- next promised action

Once structured, those records can drive weekly deltas and strategic recommendations.

### 5. The App Does Not Yet Produce A True Target List

For the user's current search, CIP should produce a ranked target map, not just resumes or job listings.

A useful output would be:

- 25 target organizations
- 10 highest-priority organizations
- 5 warmest relationship paths
- 5 exploratory conversations to pursue
- 5 roles or titles to monitor
- 5 organizations to avoid or deprioritize
- specific "why this org / why me / what to ask" notes

That is much more valuable than a generic list of open jobs.

## Product Direction

CIP should become a small, respectful, evidence-backed job-search operating system.

The app should optimize for:

- fewer, better applications
- market-read conversations before referral asks
- regional and nonprofit intelligence
- confidence-labeled claims
- target-employer strategy
- weekly learning loops
- human judgment and restraint

The app should avoid:

- mass apply workflows
- sponsored listing incentives
- generic resume praise
- fake job discovery
- pretending to monitor employers before adapters exist
- treating every contact as a referral path
- turning uncertain stories into public claims too early

## Prioritized Roadmap

### 1. Build The Nonprofit / Regional Employer Intelligence Layer

Add first-class support for regional nonprofit and institution categories:

- human services nonprofits
- community health organizations
- hospitals and clinics
- schools and colleges
- workforce boards
- libraries
- municipalities
- regional planning commissions
- economic-development groups
- arts and culture organizations
- housing organizations
- food systems
- foundations
- conservation organizations
- community media

For each employer, track:

- mission area
- likely role families
- salary plausibility
- organization size
- funding / stability signals
- careers page
- staff page
- leadership / board page
- source confidence
- hiring confidence
- network proximity
- recommended next move

Recommended next move should be one of:

- apply
- monitor
- market-read conversation
- warm intro
- research funding / role fit
- avoid / deprioritize

### 2. Make Conversation Outcomes Structured

Convert follow-up and loop-back notes into typed strategic signals.

Fields to add:

- contact name
- contact organization
- related target employer
- related lane
- signal type
- signal direction: strengthens, weakens, neutral, unclear
- compensation note
- work-model note
- culture note
- hiring note
- new leads
- follow-up date
- next action

Then feed these typed records into:

- network analysis
- evidence re-analysis
- employer priority
- weekly briefing
- resume lane selection

### 3. Turn The Weekly Briefing Into The App's Heartbeat

The briefing should compare current state against previous state.

It should show:

- what changed
- what got stronger
- what got weaker
- which assumptions were challenged
- which employers moved up or down
- which contacts need follow-up
- which role lane deserves focus this week
- which resume or outreach asset should be updated
- the next 3 to 5 actions

This is where the app can feel like a partner instead of a dashboard.

### 4. Build A Target Organization Map

For the Upper Valley / northern VT-NH nonprofit direction, create a target-list workflow.

The user should be able to:

- enter or confirm geography
- choose nonprofit / public-interest categories
- discover organizations
- save targets
- classify targets
- mark not interested
- connect targets to known people
- connect targets to role lanes
- see recommended next action per target

The output should be a ranked target organization map, not just a list of jobs.

### 5. Improve Employer And Role Scoring

Replace or augment keyword scoring with a more strategic scoring model.

Candidate dimensions:

- evidence fit
- mission fit
- compensation plausibility
- seniority fit
- geography fit
- work-model fit
- network proximity
- source confidence
- hiring confidence
- dealbreaker risk
- conversation urgency

The score should produce a recommendation, not just a number.

### 6. Add Employer-Direct Job Monitoring Carefully

Employer-owned career sites are higher trust than broad job boards. The app should eventually support employer-specific adapters for saved employers.

Start with clean ATS endpoints where possible:

- Greenhouse
- Lever
- Ashby
- SmartRecruiters
- Workable
- iCIMS where accessible
- Workday only where a stable source can be verified

Do not scrape legacy HTML. If no clean adapter exists, label the employer as manual review and link to the careers page.

### 7. Create Evidence-To-Outreach Briefs

For each target employer or contact, generate a small strategic brief:

- why this organization
- why the user might fit
- which evidence supports the fit
- what is uncertain
- what to ask in a market-read conversation
- which claim not to make yet

This bridges the evidence ledger, employer map, and network intelligence.

## Practical Next Build Sequence

1. Add structured conversation outcome fields.
2. Update network analysis to consume typed conversation outcomes.
3. Update weekly briefing to show week-over-week changes.
4. Add nonprofit/regional employer taxonomy and target organization fields.
5. Build the target organization map UI.
6. Improve scoring from keyword overlap to strategic recommendations.
7. Add employer-direct adapters for saved employers.
8. Add evidence-to-outreach briefs for target organizations.

## Product Test

The product is working when a real weekly pass can say something like:

> Last week you thought "AI operations strategist" was the strongest lane. Two conversations weakened that for local nonprofits because the title is not how they buy the work. They strengthened "program operations / digital systems lead" and "communications + workflow modernization" as more legible lanes. Three Upper Valley organizations now look more promising: one because of mission fit, one because of a warm board path, and one because of a visible program operations need. This week, do not apply broadly. Have two market-read conversations, rewrite the resume headline for nonprofit operations, and check these five employer-owned career pages.

That is the bar. If CIP can do that, it is no longer just a good prompt. It is a partner in the search.

---

# Round 2 — Code-Level Audit (2026-09-10)

## The Blunt Verdict

Round 1's claim that CIP is "not merely a prompt wrapper" is only half true. Verified against the source:

- The core evidence analysis (`src/lib/cip/advisor.ts`) is **one OpenAI Responses call to gpt-4.1-mini with a JSON schema**, plus a templated deterministic fallback. The prompt is well-crafted, but a strong ChatGPT/Claude conversation reproduces most of its output. That is exactly why a sharp reviewer is unimpressed by the analysis: there is state behind it, but no engine behind the prose.
- What genuinely IS more than a prompt is the **state layer**: additive persistence with provenance (`career_sources`, typed records, confidence labels), hand-built parsers (LinkedIn xlsx/zip/CSV, docx/rtf notes — no libraries), permanent feedback constraints ("deceased / retired / remove" is honored forever), the geocoded employer-discovery workflow (Geocodio → OSM → web search → saved candidates with source URLs and a human review queue), and the fully deterministic career report (`career-report.ts` never invents content).
- Round 1's other major claims all verified true: `weekly-strategy.ts` really is static counting with no week-over-week diff; resume generation really is lane-targeted context assembly; `career-report.ts` really is deterministic; network intelligence is the most differentiated module.

Strategic conclusion: **stop trying to make the analysis prose smarter than a frontier chat model — that fight is unwinnable. Win on state + loop + local data: things a chat window structurally cannot have.**

## Founder-Specific Hardcoding To Remove (De-Founder Pass)

The app is currently tuned to exactly one user. These must go before beta:

| Location | Problem | Fix |
|---|---|---|
| `src/lib/cip/advisor.ts:452-458` | `isAnsweredGenericQuestion()` greps for "military" and "executive director" to retire follow-up questions | Capture exclusions/affiliations as structured intake fields; never substring-guess a biography |
| `src/lib/cip/advisor.ts:446-449` | Skill-gap builder special-cases "military" | Same: structured `industries_excluded` data |
| `src/lib/cip/advisor.ts:155-163` | `stale_question_guardrails` cite "AI coding projects" and "video/story production links" — founder biography | Keep guardrails generic ("do not re-ask what linked sources already answer"); specifics live in the user's evidence data |
| `src/lib/cip/resume-assets.ts:370` | `inferEducation()` regex contains "dartmouth" | Parse degree/credential patterns generically |
| `src/lib/cip/resume-assets.ts:320-333` | Skills fallback list is founder-flavored ("AI adoption", "Product strategy") | Derive from advisor positioning + evidence only; if empty, say so instead of padding |
| `src/lib/cip/labor-market.ts:261` | "Missing skills" comes from a hardcoded list (`sql, python, analytics, stakeholder, automation, ai, product, program`) | Extract required skills from each posting description and diff against evidence tokens |
| `src/lib/cip/data.ts:97-147` | Canned opportunities/recommendations/briefing items are the founder's profile rendered as app output ("Remote SaaS company, match: 91") | Delete; users must only ever see data derived from their own inputs |
| `src/lib/cip/network-intelligence.ts:1052` | System prompt encodes the founder's org context (BNI/Rotary rules written from his chapters) | Generalize to an org-type rule: relationship groups are context pools, not employers; require named-person evidence |

Model note: every pass defaults to `gpt-4.1-mini`. For beta, decide per-task model tiers — the "senior career strategist" synthesis passes should not run on the cheapest tier while the app charges money or asks for trust.

## Architectural Gaps (Verified)

1. **No propagation.** New evidence or a saved conversation note only changes things when the user manually re-runs analysis. Nothing re-scores watched employers, lane rankings, or the briefing. There is no path from `conversation_outcome` to `watched_employers` scoring. This is the single biggest gap: the app records learning but never *uses* it.
2. **The briefing has no diff.** `weekly-strategy.ts` upserts a snapshot per week; nothing ever reads the previous snapshot. No "what changed," no deltas, no heartbeat.
3. **Scoring is keyword overlap.** `scoreOpportunity` starts at 38 and adds capped points per token hit. Honest plumbing, but a spell-checker posing as a strategist. It should at minimum produce a *recommendation* (apply / monitor / talk-first / research-funding / avoid), not a number.
4. **No outcome tracking.** Nothing records applied / replied / interviewed / closed. The system can never learn what actually converts for this user.
5. **Data sources point at the wrong market.** Adzuna and Greenhouse/Lever boards are the general big-tech pile the founder's security-PhD friend warned him to avoid. Nothing in the data layer serves nonprofits/local institutions or game studios.
6. **No automated tests.** Parsers, dedupe, and scoring are exactly the code that strangers' messy data will flow through, and none of it is tested. This is beta-blocking on its own.
7. **The de-founder pass (above) is a correctness issue**, not cosmetic: for any user who is not the founder, hardcoded heuristics will produce wrong questions and wrong resumes.

## New Design Requirement: Parallel Lanes With Different Markets

The founder's real search now spans two structurally different markets. The existing "lanes" concept must become real infrastructure, not just resume variants:

- **Per-lane market intelligence.** Nonprofit lane: funding stability, grant dependence, program areas, executive compensation → salary plausibility. Game lane: shipped titles, game jams, Steam/itch portfolio norms, studio vs. indie hiring culture, portfolio-first evidence.
- **Per-lane evidence types.** A 990 report and a game-jam page are both "public evidence" but validate completely different claims. The evidence module should accept lane-typed evidence.
- **Per-lane networking paths.** Nonprofit: board members, program directors, regional associations. Games: studio cohorts, jam communities, Discord/local dev groups.
- **Design principle:** lane logic is configuration and data, never branches in shared code (`advisor.ts` must not grow `if (lane === "gamedev")`). A lane is a config object: data sources, evidence types, role families, scoring weights, outreach norms.

## Beta-Blocking Sequence

1. **De-founder pass** — the table above; delete canned `data.ts` demo content.
2. **Tests for the state layer** — zip/xlsx/CSV parsers, docx/rtf note extraction, contact dedupe, `scoreOpportunity`, evidence-sufficiency math. These run on stranger data first.
3. **Structured conversation outcomes + propagation** — typed signals (strengthens/weakenes, lane, org, follow-up date) that automatically re-rank lanes and employers.
4. **Weekly diff briefing** — read the previous snapshot, report what moved, name the week's 3–5 actions. This is the product's heartbeat and its main "better than a prompt" demo.
5. **Nonprofit intelligence v0** — ProPublica Nonprofit Explorer API (free): multi-year revenue trend, program area, executive compensation → `funding_stability` and `salary_plausibility` fields on `employer_candidates`. Add VT/NH nonprofit registry + municipal/school-district discovery sources. This is the feature no chat session replicates.
6. **Game-dev lane v0** — curated guidance + lane-typed evidence (shipped builds, jam entries, portfolio links); live studio data can come later.
7. **Outcome tracking v0** — a table + minimal UI for applied / replied / interviewed / closed, so the loop can eventually learn.
8. **Then beta.** Small group, invite-only, current auth/billing flows unchanged.

### An Honest Flag On Scope

The sequence above is real work, not a checklist to clear in a weekend. A realistic estimate: steps 1–4 are probably a few weekends each when done properly — with the step-2 tests written alongside the changes, not "later." The temptation will be to skip the tests and jump straight to the fun intelligence work (990s, briefings, lanes). Resist it: untested parsers running on strangers' messy exports is how a beta burns its first users.

If sequencing by energy level, start with the de-founder pass and the `data.ts` deletion. They are the most mechanical, lowest-judgment work in the plan, and they unblock everything else — every later step inherits a codebase that no longer lies about who the app is for.

## Explicitly Deferred (Not Deleted)

Stripe checkout evolution, hCaptcha polish, further security-audit passes, multi-tenant scale work, additional ATS adapters. All stay working as-is; no new investment until beta validates the loop. The SaaS ambition is confirmed — it is sequenced behind product proof, not canceled.

## Ready-For-Beta Definition

- A new user can run intake → evidence → lanes → network → employers → briefing without ever seeing founder data or tripping hardcoded vocabulary.
- The weekly briefing shows real week-over-week deltas and 3–5 specific actions.
- At least one lane-specific data source (Form 990 via ProPublica) runs live and visibly improves employer scoring.
- Conversation notes measurably change employer/lane rankings without a manual re-analysis.
- Core parsers and scoring are test-covered.
- The product test in Round 1 (the "Last week you thought..." paragraph) is the acceptance bar for the briefing.

---

# Round 3 — The Loop Failure (2026-09-10, founder-verified)

This round supersedes the earlier recommendation to "run 4–6 weekly passes manually to
validate the loop." That advice is **retracted** — the founder already ran the real test, and
the current code cannot pass it. Where Round 3 conflicts with Rounds 1–2, Round 3 wins,
because it is grounded in a real-world run plus a code trace of why it failed.

## What actually happened (the test the app failed)

The founder did the hardest, most valuable part of the entire method: over 3–4 weeks he got
busy, senior people to actually talk with him and give real career advice (the advice that
redirected him from the big-tech software pile toward Upper Valley / Northeast Kingdom
nonprofits). He entered those conversation notes into the app and re-ran the analysis —
**the exact loop the product is supposed to exist for** — and got no meaningful new output.

He then did not open the app for over two months. That disengagement is not incidental; it is
the headline retention finding: **the most motivated possible user (the founder) churned after
a single bad output at the most important moment.** Any beta user will churn faster and more
quietly. The loop is not a "nice to have later" — it is the product, and it is currently broken
in a way that actively punishes the user's best effort.

## Root cause — traced through the code, not theorized

The failure is architectural, not a model-quality problem. Path: `src/pages/api/evidence/analyze.ts`.

1. **The saturation gate runs the show and is hostile to new information.**
   `evidenceRound = (prior analyses) + 1` (`analyze.ts:115`). Once a user has re-analyzed a
   few times, `evidence-sufficiency.ts:32` hard-codes `phase = "complete"` (also triggered by
   `usefulEvidenceCount >= 25`, or `score >= 100 && round >= 3`). The founder was months in,
   well past this. Once "complete," `advisor.ts:107` rewrites the model instruction to *"the
   evidence phase is complete; do not ask for more proof; opportunity-mapping questions only."*
   The app is **designed to stop engaging with new evidence** and emit generic
   target-industry / LinkedIn-export questions — which reads exactly as "no new information."

2. **Feeding it richer data makes it worse.** Conversation notes are added to
   `usefulEvidenceCount` (`analyze.ts:108`), pushing the user *deeper* into the "complete"
   shutdown. The more you feed the app, the less responsive it becomes. This is perverse and it
   is the direct cause of the founder's experience.

3. **The conversations were flattened into one undifferentiated blob.**
   `conversationNotesToEvidence` (`conversation-notes.ts:195`) wraps all notes as a single
   generic Q&A ("what did this teach you about your market?") dropped into a flat array with up
   to 40 prior evidence items. The specific signals — "that title doesn't land in nonprofits,"
   a comp reality, two named orgs to look at — are never extracted, just diluted.

4. **There is no "what changed" anywhere in the output.** The advisor schema
   (`advisor.ts:168`) only ever emits the same eight static sections. There is no field for
   what got stronger, weaker, or what to do differently now. Even genuine change re-renders as
   the same boxes with reworded prose — which any human correctly reads as "nothing happened."

5. **Nothing propagates to the glanceable surfaces.** The conversation touched only the advisor
   prose. Watched employers, opportunity matches, and lanes never re-ranked — so the parts of
   the app where change would be *visible* never saw the input at all.

**Proof is available on the founder's own data:** each saved re-analysis stores its
`evidence_sufficiency` phase and `conversation_note_count` (`analyze.ts:135`). The founder's
last run almost certainly reads `phase: "complete"` with the conversation counted. Confirming
this against the live DB is the first concrete step of any rebuild.

## The architecture problem in one sentence

**CIP is a one-way funnel (build evidence → saturate → "you're done" → stop), not a loop.**
The planning doc's own validation gate ("4–6 real weekly passes") is therefore *unreachable in
the current code*, because the engine is built to wind down after a few passes. The gate was
never achievable; that is why it was never met.

## The reframe the founder named: the real competitor is a monthly Claude check-in

The founder revealed the true benchmark through his own behavior. While the app sat unused, he
set up a **monthly (1st-of-month) Claude routine** that web-searches nonprofits and anchor
employers from Lebanon / White River Junction north up I-91 into the Northeast Kingdom
(including Dartmouth and Dartmouth Health), looking for real openings — and Claude is doing this
**noticeably better than 3–4 months ago**, as frontier web search keeps improving.

This is decisive strategic information:

- **The competitor is no longer "a good one-shot prompt." It is "monthly Claude-with-web-search
  + the founder's own memory," and it is a moving target that improves on its own.** The bar is
  higher and clearer than Rounds 1–2 assumed.
- **Cede job discovery and web research to the frontier model. Do not out-engineer it.** The app
  should *use* an LLM-with-web-search as a component for discovery, not try to beat it. That
  fight is already lost and gets worse every month.
- **The app's only defensible territory is precisely what monthly-Claude structurally lacks:**
  persistent, structured memory of who he talked to, what each conversation changed, which
  lanes/employers moved, and a real month-over-month delta. A fresh monthly prompt starts cold
  on last month's conversations unless he manually re-feeds everything — which is the tedious
  work the app is supposed to absorb.
- **Therefore the rebuild is not optional flourish — it is the entire reason for the app to
  exist over the check-in he already has.** If the rebuilt loop nails continuity and delta, it
  beats monthly-Claude decisively. If it only produces analysis prose, monthly-Claude wins and
  the app has no reason to exist. The founder's own words: the fact that it *must* be rebuilt as
  a working loop is exactly what would make it better than the monthly check-in.

## The fork in the road (a real decision, not a checklist item)

- **Option A — rebuild the analysis core from a saturating funnel into an actual loop.** This is
  the only version that beats monthly-Claude. It is a genuine rebuild of the analysis heart, not
  a patch. Everything else in Rounds 1–2 (990 data, de-founder, scoring→recommendation) only
  matters *if this core exists*.
- **Option B — accept the app as a one-time, honest career-intelligence workup** (which it does
  well) and stop positioning it as a weekly/monthly partner. Legitimate, but it means the SaaS
  loop thesis is set down.

What is *not* legitimate is shipping the current build as a "weekly loop," because the founder
has now personally proven it is not one.

## If Option A: what "a loop" minimally requires

Not a full spec — the shape the rebuild must hit:

1. **Kill the saturation-as-shutdown model.** "Enough evidence to start" must never mean "stop
   thinking." A new conversation *re-opens* the analysis; it does not count toward a completion
   quota. Phase logic, if kept at all, drives *question style*, never whether the engine engages.
2. **Typed conversation signals, not a blob.** Capture per-conversation: contact, org, lane
   affected, direction (strengthens / weakens / neutral), comp signal, hiring signal, new leads,
   promised follow-up. (Round 2 step 3 — but it is now the *first* thing, not the third.)
3. **Make "what changed since last time" the PRIMARY artifact**, with explicit deltas ("this
   conversation weakened lane X, strengthened Y; org Z moved up; you promised to follow up with
   two orgs and haven't"). This is the output whose absence caused the founder's WTF moment.
4. **Propagate to the glanceable surfaces** so lanes and employers visibly re-rank from a
   conversation — no manual re-analysis required.
5. **Lean on LLM-with-web-search for discovery as a component**; invest engineering only in the
   memory / continuity / delta layer that the frontier model cannot provide.
6. **Confirm the diagnosis on live data first** (pull the founder's saved `evidence_analysis`
   phase) so the rebuild starts from proof, not inference.

## Emotional / product note (kept deliberately)

The founder described the failed run as a "gut punch" — months of work, a hard-won breakthrough
conversation, and the app "pooped itself." It took over two months to feel ready to re-engage.
This is recorded because it is real product data: the loop failure did not just produce a weak
output, it produced *churn and discouragement in the ideal user*. Fixing the loop is therefore
also the fix for the app's single worst retention event to date.

## Addendum — The Weekly Discovery Expectation (founder-confirmed, 2026-09-10)

The loop failure was not the only unmet expectation. The founder also expected CIP to go out
and find new potential roles and employers every week when he ran it. It never did: discovery
depended on static board APIs (Adzuna plus configured Greenhouse/Lever slugs), nothing ever
scheduled a run, and the pipeline targeted the big-tech market he had already left.

Decision, now recorded in Autumn plan Phase 13: board ingestion is **retired, not deferred**.
LLM-with-web-search becomes the discovery engine — OpenAI Responses web search today, with
Z.ai (GLM) or another frontier provider behind a swappable adapter — and every discovery run
must feed the loop's memory (candidates, snapshots, briefing deltas) rather than emit
free-floating prose. Discovery without memory would just be a monthly-Claude check-in with
extra steps.
