# Employers & Opportunities Rethink (Plan)

Status: **Updated 2026-10-07 — the Opportunities-page redesign AND the lane-scoring ↔ evidence-analysis propagation fix are complete: steps 0-4, weekly diff, recommendation chips + user status / action tracking, employer resolution, lane-scoring propagation (A: re-analysis deltas, B: verified-posting validation + cap exemption), plus step 9, all built and unit-tested (238 tests). Employers-page redesign underway — first slice (lane-aware employer discovery: lane-derived targeting, lane tagging, dedupe) BUILT 2026-10-07 (247 tests); second slice (ProPublica 990 nonprofit discovery, deterministic + standalone) BUILT 2026-10-07 (+26 tests); deferred: broader coverage, target-workspace UX, 990 enrichment of saved targets. See §16.**
Companion to `Next Steps.md` (Rounds 1–3) and `Project Plan Autumn 2026.md`. This document owns
the redesign of **Part 6 (Employers)** and **Part 7 (Opportunities)** now that the premise they
were built on is obsolete.

The same-day review closed the engineering-spec gaps this plan was missing: posting identity +
dedupe, employer resolution/aliasing, staleness honesty, the weekly trigger model, cost and
empty-state guardrails, the fit-correction loop, nonprofit-intelligence (990) integration as a
fit-signal source, the Part 7 surface sketch, and the test discipline. See §5, §6, §8, §10, §11.
The follow-up review adds verification, durable run history, failure semantics, evidence lineage,
separate actions and corrections, and a Part 6 acceptance contract. See §12–§15. These are build
requirements, not claims of completed functionality. Remaining configuration decisions are in §9.

---

## 1. Why this rethink exists — the dead premise

Parts 6 and 7 were built 6–7 months ago on a specific assumption: **an LLM could not reliably
find and evaluate real jobs**, so the app had to do it with hand-built machinery — Greenhouse/
Lever board scrapers (`labor-market.ts`), an Adzuna geographic feed (`adzuna-jobs.ts`), remote-job
RSS (`remote-jobs.ts`), and keyword-overlap scoring (`scoreOpportunity`, starting at 38 and adding
points per matched token).

That assumption is now false. Frontier models with web search (Claude, and the founder's own
monthly Claude routine) do job discovery **and** fit evaluation well, and improve every month.
Indeed now ships an AI "reality check" that summarizes a posting and grades the user's uploaded
resume against it. The founder confirmed this from real use: *"Here we are 6–7 months later, and
Claude rocks those jobs out."*

**Consequence:** competing with a frontier model on raw job discovery is unwinnable and pointless.
The keyword-scoring board-scraper approach must be retired. The question is no longer
"how do we search better than Claude," but **"what do we do that a Claude prompt and Indeed
structurally cannot?"**

## 2. The thesis — what the app does that a chat prompt cannot

Three things, all of which the user's accumulating data feeds. None are things a cold one-shot
prompt or Indeed can do:

1. **A far better brief going *in*.** A stranger's Claude prompt starts cold; Indeed sees only an
   uploaded resume. The app already holds a rich, current, structured profile — verified evidence
   ledger, three ranked lanes, explicit exclusions, comp floor, geography, work-model, and now
   conversation-derived signals. It can hand the search engine a *precise brief every week* so the
   search is targeted from the first query. **This is the answer to the founder's own question:
   yes, the data the user puts in should produce more targeted jobs — but only once that data
   flows into the search brief. Building that flow is the point.**

2. **Memory and a weekly *diff* going *out*.** Claude-on-the-1st produces a fresh list monthly
   with no memory of last month's. The app can run the search weekly, persist results, and report
   *what is new, what was verified, what changed at its source, what moved* — the diff logic built for lanes/employers
   in `weekly-strategy.ts`, applied to jobs. That is a partner, not a prompt.

3. **An evidence-grounded fit check that beats Indeed's.** Indeed grades a posting against a
   *resume*. The app can grade it against the *verified evidence ledger + lanes + comp floor +
   exclusions + what real conversations revealed* and return a **recommendation, not a number**:
   `apply` / `talk-first` / `research-funding` / `monitor` / `skip`. Strictly more than Indeed can
   do, because Indeed has none of that accumulated context.

**The moat is connective tissue, not search.** The founder uploaded Dartmouth Health's actual
[September 15, 2026 staff-reductions release](https://www.dartmouth-health.org/news/article/dartmouth-health-announces-staff-reductions)
alongside the conversation. This is primary-source evidence: 124 employees' positions eliminated
and 303 open positions canceled, not 427 people laid off. The release identifies Dartmouth
Hitchcock Medical Center and Dartmouth Hitchcock Clinics Southern Region. Preserve that scope.
This verified event can inform target priority and next week's search. Additional competition in
the local applicant pool or opportunities at other employers are separate inferences, not facts
established by the release. Connect the conversation and uploaded source to the same event,
without double-counting it. That connection is the product.

## 3. The Geocodio / geographic edge — use it everywhere

`geography-engine.ts` is the single most un-promptable asset in the codebase: real geocoding
(Geocodio → OpenStreetMap/Nominatim), an Overpass lookup of towns/cities within a radius, Haversine
distance math, population-ranked nearby places, and generated locality search queries. A chat
window cannot do this reliably — it will latch onto a place name and miss the real labor shed.

Today this only feeds employer *discovery*. It should ground **the entire job search**:

- Expand a search to the real commute/labor shed (nearby towns within the radius), not just the
  typed city — so "White River Junction" also searches Lebanon, Hanover, Norwich, Wilder, etc.
- Rank local results by geocoded straight-line distance from the user's anchor, not string matching.
  This is not driving distance or commute time; unknown locations remain unknown. See §14.
- Feed the geocoded locality list into the search engine's query set (it already generates
  employer queries; extend to role/opportunity queries).
- This is a concrete, defensible advantage over both a generic Claude prompt and Indeed's
  location filter. **Make the geographic grounding a first-class input to every search.**

## 4. Keep / retire / build

**Keep and elevate**
- `geography-engine.ts` — becomes the geographic spine of all search (see §3).
- The propagation engine (`strategic-state.ts`) and weekly diff (`weekly-strategy.ts`) — extend
  them to cover *jobs*, not just lanes/employers.
- Employer discovery via web search (`business-search-engine.ts`) — already the right shape
  (geocoded brief → LLM web search → persisted candidates with provenance + review queue).
- The confidence/provenance discipline and the human review queue.

**Retire (the dead-premise machinery)**
- Board discovery and `scoreOpportunity`'s keyword-overlap number. Clean ATS endpoints may verify
  already-discovered postings; they do not remain a parallel discovery or fallback engine. (One narrow,
  founder-approved exception, disclosed to the user, is described in the §8 step 9 amendment.)
- Treating a raw board pull as "the search." It is not the product anymore.

**Build (new)**
- A **search-brief assembler**: turn the user's current strategic state (lanes, evidence,
  exclusions, comp floor, geocoded area, conversation signals) into a structured brief object.
- An **LLM-web-search job engine** that consumes the brief, returns real postings *with source
  URLs*, and never fabricates listings (the §19 integrity rule — the original hallucinated-listing
  failure must not return).
- **Persistence + weekly diff** of results and source-verification observations (§12).
- An **evidence-grounded fit + recommendation** per posting (apply / talk-first / research-funding / monitor / skip),
  with the reasons drawn from the evidence ledger and conversation intelligence.

## 5. The accumulation flywheel (why this compounds)

Every artifact the user adds should sharpen the *next* search:
- The DH conversation plus uploaded release → one source-backed event, with any target-priority
  adjustment explained separately from a tentative competition warning (§7, §13).
- A lane movement (Program Operations up) → shifts the search's role vocabulary.
- A new exclusion or comp-floor edit → filters results.
- A saved/target employer → prioritizes its openings.
- An outcome (applied / replied / interviewed / closed — *not yet built*, flagged in Round 3) →
  teaches what actually converts.

A chat prompt cannot accumulate this. The app can, and that accumulation is the reason it beats the
monthly Claude routine the founder already runs.

**The nonprofit-intelligence tie-in — Autumn Phase 8 is a fit-signal source, not a separate
feature.** The founder's active lane is nonprofits, and the planned ProPublica Form 990 layer
(multi-year revenue trend, funding stability, program area, executive compensation → salary
plausibility) is exactly the kind of accumulated, unpromptable context the fit engine in build
step 7 consumes. "Good mission fit but weak salary plausibility → research-funding, don't
blind-apply" is a recommendation Indeed cannot make and a cold prompt will not persist. The
Rethink is therefore not a replacement for the 990 work — **it is the consumer that makes the
990 data pay off.** Build them as one pipeline: 990 fields feed the search brief (step 1) and
surface as named reasons on recommendations (step 7). Define that enrichment contract now, but
do not block the first complete discovery loop on the full 990 integration. Missing enrichment
means unknown, not poor fit. Retain filing year and source; historical executive compensation
does not establish a current opening's salary or available budget.

## 6. Integrity guardrails (non-negotiable, §8 / §19)

- **No fabricated listings, ever.** Every job shown carries a real source URL from the search;
  no invented postings, employers, salaries, or dates. This was the original failure that started
  the whole "no fake engines" rule.
- **Label AI-derived content** (fit reads, extracted signals) and show its confidence; let the
  user correct it.
- **Recommendation over score.** Never show a bare match number as if it were truth.
- **`talk-first` is a first-class outcome**, consistent with the product's relationship-first,
  anti-mass-apply thesis. The app should sometimes say "don't apply yet — have a conversation."
- **Staleness honesty.** Search omission does not establish disappearance. Only a successful
  source check can establish "no longer visible"; blocked pages mean verification unavailable.
  An explicit source closure can be labeled "source reports closed." Show first seen, last
  seen in discovery, last verification attempt, and last verified open separately (§12).
- **Privacy boundary on the brief.** The search brief holds comp floor, exclusions, and
  conversation-derived signals. Only search-relevant, non-sensitive facets leave the app:
  role language, geocoded area, work model, broad comp range. Private claims — unverified
  stories, named confidences, sensitive constraints — never go to the provider.
- **User-correctable recommendations.** Every recommendation supports a reasoned correction.
  Activity ("I applied", "already talked"), factual corrections, and explicit preference changes
  are separate records. Applying does not prove the recommendation wrong; dismissing one role
  does not exclude its employer or lane. Only an explicit scoped preference changes exclusions.

## 7. Worked example / acceptance test

The redesign is working when the conversation and uploaded DH release flow through together:

> The Dartmouth Health release you supplied confirms occupied-position eliminations and canceled
> vacancies. We linked it to your conversation and the affected organizations. Here is whether
> that changed your target priorities, why, and how it affected this run's search. Any local
> competition concern is labeled as an inference. Your Program Operations lane need not weaken
> because one employer reduced staffing. Here are the actual verified openings and relationship
> actions found, or an honest account of why there are none.

Acceptance requires correct source-linked counts (§2), event date and organization scope; no
double-counting of the note and release; and a traceable decision through brief, recommendation,
and briefing. It does not require a particular ranking movement or invented quota of new jobs.
Only show a warm path supported by saved relationship evidence. A missing search result is not
a closed role. The source upload must participate without the user retyping it into dropdowns.

## 8. Phased build sequence (reviewed and expanded)

The sequence below adds the connective-tissue engineering the original draft assumed but never
specified. Steps 4 and 5 (identity, employer resolution) are not optional polish — they are what
makes §5's flywheel actually connect.

0. **(Done 2026-09) Conversation-note auto-extraction** — merged as `conversation-extraction.ts`;
   raw note → typed signals, so the loop fires from natural input.
1. **Search-brief assembler** — strategic state → a structured, versioned brief object: ranked
   lanes with direction, explicit exclusions, comp floor → range, work model, geocoded area with
   generated locality queries, saved/target employers, and relevant non-sensitive conversation
   signals (privacy facets enforced here, §6). Conflicts resolve explicitly — e.g. a conversation
   comp signal that contradicts the stated floor is noted in the brief, never silently reconciled.
   *Status 2026-09-23: schema + pure assembler built (`search-brief.ts`, tested). Finding: comp
   floor, exclusions, and location anchor exist today only as free text in intake (`salary_target`
   and `work_modes` are the only structured fields). The brief takes structured preferences,
   reports free-text constraints as unresolved gaps rather than interpreting them, and exposes an
   allow-listed `toOutboundFacets()` projection as the sole provider-facing view. Exclusions are
   applied locally to results, never sent. Still needed: a small explicit capture UI that turns
   the free-text constraints into confirmed structured preferences.*
2. **Geographic grounding of search** — every search expands to the geocoded labor shed
   (nearby localities from `geography-engine.ts`); local results ranked by straight-line distance from the
   anchor, never string-matched.
   *Status 2026-09-23: built and verified live (`search-geography.ts`, `brief-loader.ts`, coverage
   preview on `/preferences`). Findings: Overpass returns no state for nearby towns, so towns across
   a state line (e.g. Norwich VT vs Lebanon NH) were mislabeled with the center's state. Each of the
   12 nearest towns is now reverse-geocoded for its real state; unverified stays unknown and is
   treated as ambiguous, never in range. A failed nearby-town lookup retries once, then is reported
   as a gap ("center only"), never presented as an expanded search. Worksite distance is
   straight-line from coordinates or a state-matched locality; unlisted locations are unknown, not
   outside. Still needed: geocode a posting's worksite to coordinates during verification (step 4).*
3. **LLM-web-search job engine** — brief in → real postings with source URLs out; persisted.
   Acceptance criteria: source verification before an apply recommendation; provider failure
   displays "search failed" while preserving prior results (never "no matches"); cost guardrails are
   part of *done*, not a follow-up — caps on postings per run, per-user weekly budget, and
   measured tokens per run.
   *Status 2026-09-23: built (`job-search-*.ts`, run records, weekly panel on the Briefing page).
   Live spike findings that shaped it: `gpt-4.1-mini` fabricated postings (fake requisition IDs, 404
   URLs), so discovery requires a reasoning model (default `gpt-5.4`, configurable; `gpt-5.4-mini`
   also worked but returned a duplicate and a dead posting and could not read Dartmouth Health). A
   removed posting returned HTTP 200, so verification checks page content (title plus requisition
   ID), never status alone. Search runs as up to 7 bounded steps in tiers: target career pages,
   preferred sources, general. Caps: 3 runs per user per week, 12 scopes, 25 postings, tool-call and
   token ceilings per run, a per-run dollar ceiling once pricing is configured. Dollar cost is
   recorded as unavailable until `JOB_SEARCH_PRICING_JSON` is set. Cost and beta-access questions are
   recorded in `productionization_discussion.md` and must be settled before inviting testers.
   Not yet done: two live acceptance passes (§15.3), postings identity across runs (step 4), and a
   careers-URL hint for saved targets.*
4. **Posting identity + dedupe** — prefer source-scoped requisition IDs and canonical posting
   URLs. Employer/title/location/description similarity supports matching, not automatic merging
   of distinct requisitions. Preserve source observations and repost lineage; uncertain merges
   require review and can be corrected. Pure functions, fixture-tested.
5. **Employer resolution** — discovered posting employers resolve onto the saved employer map
   (`watched_employers` / `employer_candidates`) via normalization + an alias table, with a
   human-confirm nudge for uncertain matches. Resolve DH and historical Dartmouth Hitchcock naming
   with source context; preserve parent/member/clinic relationships rather than merging them all. This
   is the connective tissue of §2's moat: without it, conversations ↔ employers ↔ postings never
   actually link and the flywheel spins free.
6. **Weekly job diff + trigger** — new / verified-open / source-status-changed / moved, wired into the briefing
   heartbeat, with staleness labels (§6). **Trigger model, stated:** v1 is a manual weekly action
   on the briefing page ("Run this week's search"); scheduled automation is a later upgrade. Do
   not repeat the Round 3 failure where "weekly" meant "whenever someone remembers."
7. **Evidence-grounded fit + recommendation** — apply / talk-first / research-funding / monitor / skip,
   reasoned from the evidence ledger, conversation signals, and the **990 nonprofit intelligence
   when available for the target** (funding stability, salary plausibility — see §5). The
   "better-than-Indeed reality check," correctable per §6.
8. **Minimal action tracking in the first release** — applied / conversation-held / replied /
   interviewed / user-closed, separate from source posting status, corrections, and preferences.
   Richer conversion learning follows later; a few actions must not silently rewrite preferences.
9. **Retire the dead-premise scrapers** once the engine above is trusted. ATS adapters (Autumn
   Phase 13) survive **only as verification** of discovered postings against employer-owned
   pages — never again as the discovery engine.
   *Status 2026-09-23: DONE at the Opportunities cutover. Deleted `adzuna-jobs.ts`, `remote-jobs.ts`,
   `labor-market.ts` (board ingestion, `scoreOpportunity`), and the `/api/jobs/geographic`,
   `/api/jobs/remote`, `/api/labor-market/ingest` routes; removed the Adzuna and board-slug env vars.
   Board-era `opportunities` / `opportunity_matches` rows are archived in place (migration
   `20260923140000`, `archived_at` + `archive_reason`), not deleted, and are no longer read. The
   briefing snapshot and the career report now summarize verified openings from the latest weekly
   search (`loadLatestVerifiedPostings`); the snapshot column `opportunity_match_count` keeps its
   historical name. The Opportunities page is now the home for the weekly search (run, progress,
   results grouped by verification, coverage, "what this search covers"); the Briefing page shows a
   read-only summary that links to it, so there is one place to run a search. Amends step 6's
   "on the briefing page": the trigger lives on Opportunities and the Briefing surfaces status and
   due state.*

   *Amendment 2026-09-23 (founder decision): a NARROW direct reader is allowed, only as a fallback
   and only for saved target employers whose job list the web search reported it could not read
   (`page_found_but_could_not_read_listings`). It never runs for employers the search read fine,
   is not a separate discovery pipeline, and is not a general crawler. Trigger case: Dartmouth
   Health's career site is a JavaScript app that shows programs nothing, while its underlying
   iCIMS job list is plain public HTML (382 listings over 8 pages). The reader (`ats-reader.ts`,
   `job-search-direct.ts`) finds the iCIMS host from the page the search reported, checks
   robots.txt, reads the list politely (pause between pages, page cap), and a model then chooses
   listings BY INDEX only, so it cannot introduce a title or URL of its own. Every choice is
   verified on its own page like any other posting. The user is always told: the coverage line and
   the run summary say the app read the list itself, and employers it could not read at all
   (unsupported site, robots block, error) are named with "please check by hand." iCIMS is the only
   supported format so far. Verification also learned that iCIMS job pages are an empty wrapper
   unless fetched with `?in_iframe=1`.*

## 9. Open decisions (for the founder)

- [x] Search engine: OpenAI Responses API with web search, using a reasoning model (`gpt-5.4`
      default). Chosen 2026-09-23 after a live comparison; provider sits behind an adapter so it
      can change by configuration. Non-reasoning models are not acceptable for discovery.
- [x] Retire board discovery at cutover; retain only posting verification adapters. Archive old
      user history, remove discovery entry points and dead configuration, and update briefing consumers.
- [ ] Cost posture — weekly per-user web-search calls have real token cost; measure before pricing
      (consistent with `productionization_discussion.md`). Caps are enforced in code; the monthly
      cost per beta user and hosting total are OPEN and written up in `productionization_discussion.md`.
- [x] `talk-first` is as prominent as `apply`; use one recommendation vocabulary throughout (§8).
- [x] V1 uses a manual "Run this week's search" action; show last successful run and when due.
      Scheduled automation is deferred and must not be implied by the UI.
- [x] Activities, factual corrections, recommendation overrides, and scoped preferences remain
      distinct (§6, §8). User-closed activity does not assert that the employer closed a posting.

## 10. Part 7 surface (sketch)

The weekly Opportunities view is a **work queue, not a job board**:

- Run banner: "This week's search ran [date] · 14 real postings within 25 mi · 3 new,
  1 source-status change." Label run status and comparison dates; cost detail lives in run details.
- One card per posting:
  - title + resolved employer (linked to its target-map entry)
  - straight-line distance or location unknown; remote/hybrid eligibility + discovery locality
  - source URL + first-seen date + last-verified date
  - separate discovery-change and source-verification badges (§12)
  - recommendation chip — apply / talk-first / research-funding / monitor / skip — with named reasons
    (evidence ledger, conversation signals, 990 fields) and an inline "correct this" control
- Empty state is first-class: "No real postings matched this week's brief within your
  constraints. The brief searched these 6 localities; widen radius or comp range?" Never
  scraped-board filler, never invented listings. Use this only after a successful search;
  partial/failure/budget states disclose coverage and retain previous results. Widening constraints
  is a user decision, never an automatic response to low yield.

## 11. Engineering disciplines (house rules, applied here)

- The brief assembler, posting-identity matching, and diff logic are pure, deterministic
  functions, unit-tested against fixture postings — no live search in the suite (same
  discipline as the existing test files).
- Every LLM step keeps its deterministic/degraded path: provider down or over budget → an
  explicit unavailable/budget status with previous results retained. Fit can fall back to
  evidence-grounded rules; never manufacture discovery results or scraped-board filler.
- AI-derived fit reads are labeled with confidence and correctable; corrections persist.
- Cost is a requirement, not a report: caps and budgets are enforced in code before beta.

## 12. Search runs, verification, and durable history

Implement these contracts before connecting the new engine to the weekly briefing:

- **Run record:** append a user-scoped run with brief/schema version, strategic-input IDs,
  private brief and outbound search facets, provider/model, start/end times, queries attempted,
  coverage by lane/locality/employer, tool usage, tokens, measured or explicitly estimated cost,
  and errors. Lifecycle: queued → running → succeeded / partial / failed / not-configured /
  budget-limited. An empty successful run is different from every unavailable state.
- **Retry and budget safety:** use a per-user idempotency key and one active run per scope;
  reserve budget before calls, bound retries/timeouts, and reconcile usage afterward. A repeated
  click must not start another paid run. Partial work remains auditable; it must not overwrite
  the last successful comparison baseline. Do not claim exact costs when usage is unavailable.
- **Verification stage:** a search-generated URL alone is insufficient. Retain the observed
  source URL, retrieval time, relevant excerpt/content reference, source requisition ID when
  present, and field-level provenance for employer/title/location/salary. A generic careers page
  is an employer lead, not a verified opening. Prefer employer-owned or authorized ATS sources.
  States include discovered-unverified, verified-open, source-reports-closed, no-longer-visible,
  and verification-unavailable. Check the exact role and source identity before marking open.
- **Separate observations:** store first seen, last seen in discovery, last verification attempt,
  last verified open, and observed source state. Search omission, rate limits, login walls,
  blocked fetches, and server errors cannot turn a posting into no-longer-visible or closed.
  Explicit closure or a confirmed unavailable posting after a successful source check records
  evidence for that observation; it does not invent an employer decision or closure date.
- **Action eligibility:** `apply` requires a verified-open source and stated verification time;
  unverified/stale roles need verification first. Define the freshness interval as configuration.
  Unknown salary, credentials, work model, or eligibility remain uncertainty, not invented fit.
- **Additive history:** separate posting identity, per-run observations, recommendation versions,
  and user actions. Keep original records when correcting a match. Existing weekly snapshot
  upserts are not sufficient history: persist runs first and link briefing snapshots to run IDs.
- **Comparison policy:** v1 compares against the previous successful run for the same user and
  search scope, with dates visible. No prior success means baseline. A changed brief must show
  changed constraints; out-of-scope postings did not disappear from their sources. Repeated runs
  within a week retain history; a future weekly rollup can reference these immutable runs.
- **Security:** authenticate with `getUser()`, scope all records and relations by user with RLS,
  and guard POSTs with `isSameOriginRequest`. Verify fetched URLs and redirects through SSRF
  protections with size/time limits. Treat external page text as untrusted evidence, never tool
  instructions. Validate structured responses at runtime and escape rendered fragments.

## 13. Evidence lineage and bounded strategic influence

- Link conversations, uploaded documents, and public URLs through source IDs to an event/claim.
  Save publication/event dates separately from upload and retrieval dates. An uploaded press
  release is not downgraded to hearsay merely because it arrived with a conversation.
- Distinguish primary-source facts, attributed personal reports, user preferences, and derived
  strategic inferences. Each recommendation names the supporting records and any uncertainty.
  Retain the uploaded artifact reference even when its public URL can also be verified.
- DH's release and the friend's account are one event for weighting purposes. Separate the
  employer's reported reductions from estimates of displaced applicants, regional competition,
  or demand at other employers. A verified event does not verify every downstream implication.
- Resolve historical names and abbreviations using source context. Dartmouth Health, its member
  institutions, DHMC, clinics, and Dartmouth College must not be indiscriminately merged.
- Bound a single event's effect; do not apply it again each run. Record review/expiry timing for
  strategic influence without deleting historical facts. Corrections, retractions, or newer
  evidence must be able to reverse the influence and explain the change.
- Recommendations retain evidence IDs and versioned reasons. User actions are not automatic
  preference labels. Explicit preference edits state their scope: role, employer, lane, or global.

## 14. Part 6 acceptance and search constraints

**Employers is a target-organization workspace, including organizations without vacancies.**

Each target shows why it is relevant to a lane, current priority and what changed, supporting
sources and dates, known relationship paths, hiring/financial unknowns, and the recommended next
action. A careers URL or high employer fit is never evidence of a current opening. The weekly run
can discover new organizations as well as jobs at saved targets. New candidates enter the review
queue; promotion, parking, correction, and exclusion decisions persist. Parked/excluded targets
must not silently return as fresh recommendations. Link jobs to targets and targets to their
verified jobs, conversation history, and outreach/follow-up actions.

Acceptance includes a relevant target with no vacancy and a supported talk-first action, plus a
new candidate that is not automatically promoted. A warm path needs an actual saved person and
relationship basis, not a guessed affiliation. Keep talk-first as prominent as apply.

**Constraint contract:**

- Separate hard exclusions from ranked preferences. Never broaden either silently to fill cards.
- Hourly-to-annual (founder decision 2026-09-23): a stated hourly rate is converted assuming a full-time
  year, 40 hours x 52 weeks = 2,080 hours ($35/hour is about $72,800), always labeled an estimate. Stated
  weekly hours are honored; part-time with no hours, monthly, and vague pay stay unknown (`pay.ts`).
- Preserve an explicit salary floor; do not invent an upper bound when expressing search facets.
  Compare known pay on compatible currency/period/hours; missing or noncomparable pay is unknown.
  Unknown compensation can require research without asserting the role meets the floor.
- Geocode the job's actual worksite, not only headquarters. Label distance as straight-line;
  multiple worksites remain distinct locations and ambiguous locations require review.
- Remote is not automatically available everywhere: record residency/work-authorization limits
  where stated. Hybrid requires worksite and attendance expectations, or an explicit unknown.
- Support multiple user-selected regions/anchors and lane-specific role vocabulary. Record which
  scopes were actually searched. Bounded search is not an exhaustive claim about the local market.
- Lane rules and enrichment inputs are configuration/data. Nonprofit-specific evidence must not
  determine an unrelated lane's fit. Missing 990 data does not exclude public institutions or
  other targets that do not have applicable filings.

## 15. First release, retirement, and proof

Build one complete vertical slice using §8's components: current state and linked sources →
privacy-filtered brief → discovery → source verification → identities and immutable observations
→ evidence-grounded recommendation → briefing delta and a minimal action record. Define identity,
run, and observation schemas before writing discovery results. Include both the target map and
opportunity queue; do not stop at a provider response or an isolated search button.

Use a small, explicitly bounded set of lanes, targets, and geographies for the first live proof.
The full 990 enrichment pipeline, scheduled execution, and richer conversion learning follow
that proof. Their interfaces belong in the first slice; their absence is shown honestly. Existing
de-founder, state-layer testing, configurable lane infrastructure, and beta gates remain required.

At cutover, disable legacy discovery routes/buttons, replace `opportunity_matches` score consumers
in the briefing, and archive board-era records with provenance rather than deleting user history.
Remove dead configuration/docs. Verification adapters cannot initiate a second discovery pipeline
(the one exception is the fallback-only direct reader for target pages the search could not read;
see the amendment under §8 step 9).
An operational rollback disables the new search and retains saved history; it must not silently
reactivate retired discovery. Show last successful run, due state, in-progress state, and visible
errors; update results after completion without requiring an unexplained reload.

**Required proof before calling the slice complete:**

1. Deterministic fixture tests with `vi.stubEnv("OPENAI_API_KEY", "")`: brief constraints/privacy,
   source validation, exact IDs versus fuzzy duplicates, reposts, employer/member resolution,
   partial and failed runs, blocked sources, baseline comparisons, changed scope, idempotency,
   budget enforcement, and separation of actions/corrections/preferences. Mock all provider calls.
2. DH regression: uploaded release plus conversation produces one source-backed event with the
   exact counts and scope in §2; downstream inferences stay labeled and bounded. Correcting the
   evidence changes the next brief/recommendation; no fabricated openings or forced movement.
3. Two live passes on the same account: establish a baseline, then add meaningful evidence or
   change a constraint. Inspect sources manually and trace the actual change through brief,
   search, saved observations, targets, recommendation, and visible briefing. No-change and
   successful-zero-result paths must also work; simulate failures without real paid calls.
4. A second account/fixture verifies user isolation and absence of founder assumptions. Any
   reuse of `scripts/phase0-baseline.mjs` first requires `user_id` filtering on every query;
   the historical all-account output is not an account-specific baseline.
5. Record actual coverage, verified relevant results, dedupe mistakes, unsupported claims,
   latency/cost, and whether the founder can identify a useful next action. Run the repo's
   required typecheck/tests and build checks for implementation changes. Document the live
   outcome; do not claim discovery quality from unit tests alone.

---

## 16. Status board and build log (as of 2026-09-23, evening)

This section is the running record of what is built, what was learned, and what is next. §1-§15 are the
plan; where they disagree with this section, this section reflects what actually exists. Do not read the
plan as a claim of completed functionality: the two live acceptance passes in §15.3 have not been done.

### Status board

| §8 step | State | Where it lives |
|---|---|---|
| 0. Conversation-note auto-extraction | Done | `conversation-extraction.ts` |
| 1. Search-brief assembler | Done, tested | `search-brief.ts`; confirmed preferences in `search_preference_items`, edited at `/preferences` |
| 2. Geographic grounding | Done, verified live | `geography-engine.ts`, `search-geography.ts`, `brief-loader.ts`; "Check coverage" on `/preferences` |
| 3. LLM-web-search job engine | Done, live-tested, one real run reviewed | `job-search-*.ts`, `job-verifier.ts`; runs in `job_search_runs` / `job_search_observations` |
| 4. Posting identity + dedupe across runs | NOT started (only same-run dedupe exists) | next |
| 5. Employer resolution / aliasing | NOT started | |
| 6. Weekly job diff + trigger | Trigger done (manual run on Opportunities, due state); diff vs the previous run NOT started | |
| 7. Evidence-grounded fit + recommendation | NOT started (postings show verification, location, and pay only; no apply / talk-first / skip yet) | |
| 8. Minimal action tracking | NOT started | |
| 9. Retire the dead-premise scrapers | Done at the Opportunities cutover; direct reader added by amendment (§8 step 9). 2026-09-29: generalized to a board-adapter registry (iCIMS + PeopleAdmin/SilkRoad) AND trigger flipped — saved targets with a known supported board are read deterministically each run (`directReadKnownTargets`), founder-confirmed. 182 tests green. Live end-to-end confirmation still to do | |

Surfaces: **Opportunities** is the home of the weekly search (run, progress, results grouped by verification,
coverage, "what this search covers"). **Briefing** shows a read-only summary that links there. **Search
preferences** holds the confirmed constraints. **Employers** is unchanged; its redesign (§14) has not started.

### What was built and learned (2026-09-23 session)

**Brief and preferences.** Comp floor, exclusions, and location existed only as free text in intake; the brief takes
structured preferences and reports unconfirmed free text as gaps. Nothing is applied from intake until the user
confirms it on `/preferences`. The intake `salary_target` is treated as a suggestion, not a floor (a target is not
a minimum). Exclusions are applied locally to results and never sent to the provider; `toOutboundFacets()` is an
allow-list, tested to exclude private content. Preferred job sources (trusted domains) are stored as preferences.

**Geography.** Overpass returns no state for nearby towns, so towns across a state line (Norwich VT vs Lebanon NH)
were mislabeled with the center's state. Each of the 12 nearest towns is now reverse-geocoded for its real state;
unverified stays unknown and is treated as ambiguous, never in range. A failed nearby-town lookup retries once and is
reported ("only the center place is covered"), never presented as an expanded search. Worksite distance is
straight-line from a geocoded clean city/state (or a state-matched locality); unlisted or unresolvable locations are
"unknown", never "outside".

**Search engine.** Tiered: saved targets' career pages, then preferred sources, then the open web, as up to 7 bounded
steps advanced by separate requests. OpenAI Responses API with web search; default model `gpt-5.4`, configurable.
Live spike results: `gpt-4.1-mini` (the repo's old default) fabricated postings (fake requisition IDs, 404 URLs) and must
not be used for discovery; `gpt-5.4` returned only verified postings; `gpt-5.4-mini` mostly worked but returned a
duplicate and a dead posting. Non-reasoning models are not acceptable here. Caps enforced in code: 3 runs per user per
rolling week, 12 scopes, 25 postings, tool-call and token ceilings, a per-run dollar ceiling once pricing is set. Cost is
recorded as "not estimated" until `JOB_SEARCH_PRICING_JSON` is configured; the app never hardcodes provider prices.

**Verification rules learned from live results.** Every posting is fetched and checked on its own page.
- HTTP status alone is not enough: a removed posting returned 200 with a generic shell page. The page must show the
  title (and the requisition ID when one is distinctive).
- A stated application deadline that has passed is not "verified open" (a real result caught this).
- iCIMS job pages are an empty wrapper unless fetched with `?in_iframe=1`; the verifier does this.
- Blocks, login walls, rate limits and server errors are "could not check", never "closed".

**Location, pay, and grouping.** Postings outside the user's distance are kept and shown in their own group, not mixed
with local matches or hidden. Hourly pay converts to an annual estimate assuming a full-time year (40 x 52 = 2,080
hours; $35/hour is about $72,800), always labeled an estimate, compared with the salary floor; part-time without hours,
monthly, and vague pay stay unknown (`pay.ts`).

**Cutover.** Deleted the Adzuna, remote-feed, and board-ingestion code and routes and their env vars; archived board-era
`opportunities` / `opportunity_matches` rows in place (migration `20260923140000`); the briefing snapshot and career
report now count verified openings from the latest weekly search. The snapshot column `opportunity_match_count` keeps its
historical name.

**Direct reader (fallback only, founder-approved).** Dartmouth Health's public career site is a JavaScript app that shows
a program nothing; its job list lives in iCIMS as plain HTML (382 listings over 8 pages, read in about 6 seconds in the live
check). When the search reports it could not read a saved target's listings, the app finds the iCIMS host, checks
robots.txt, reads the list politely, and a model chooses listings by index only (so it cannot invent a title or URL); every
pick is verified on its own page. The coverage line, the posting label, and the run summary all say the app read the list
itself; employers it cannot read at all are named with "please check by hand." iCIMS is the only supported format.

**HealthcareSource (symplr) sites: decided NOT to build a reader (founder decision, option 1).** Northeast VT Regional
Hospital (St. Johnsbury, `pm.healthcaresource.com/cs/dhanortheasternvt`) and the other Dartmouth Health member hospitals
(Alice Peck Day in Lebanon, Mt. Ascutney in Windsor, Cheshire, Springfield, Valley Regional) use it. It is a single-page app
backed by a private, undocumented search service with its own token layer, no robots.txt, sitemap, or feed, and a request format
buried in a 15 MB bundle. Reading it would be reverse-engineering a private service, unlike iCIMS's public HTML. Today the app
says these pages need a hand check and links to them. Revisit after a few real runs show how much is being missed.

### Live results so far

- First real search (7 of 7 steps): 6 postings found, 4 verified open, 1 not yet verifiable, 1 gone (404). It correctly held back
  a posting whose requisition ID did not match and caught a dead link. Review found a passed-deadline posting marked open
  (fixed), a DC hybrid role reported as "distance unknown" (fixed by geocoding a clean city/state), and a misleading "lead"
  label on verified rows (fixed).
- Recall varies run to run: the Dartmouth "Executive Director" role found in earlier tests was missed in the first run. This is why
  step 4 (re-verify earlier finds without the model) and remembering each employer's listing page are next.
- OpenAI spend: $0.23 month-to-date on the CIP project after the tests. A full run's cost is not yet measured.

### 2026-09-29 — recall diagnosis (searchjobs.dartmouth.edu) + generic board reader

The founder reported the first real runs missing Dartmouth **College** postings that should have
appeared (e.g. `/postings/87321`, `86741`, `84307`, `87206`). Diagnosed against the code and the
live site:

- **Not a readability problem.** `searchjobs.dartmouth.edu` is a **PeopleAdmin/SilkRoad** board
  served as plain HTML: `/postings/search` lists all open postings (124 at check time) with
  `data-posting-title`, `/postings/{id}` links, self-labeled columns, and `?page=N` pagination;
  `/postings/{id}` detail pages carry the title in the HTML. Fully readable.
- **It is a targeting + recall problem, three compounding causes:** (1) the engine passes the
  `target_page` tier only the org *name* (`targetOrganizations = targets.map(t => t.name)`), not a
  listing URL, so the model must rediscover the board every run — non-deterministic; (2) each step
  returns "at most 10 postings" and does not paginate the full list; (3) the deterministic direct
  reader only supported **iCIMS** (Dartmouth Health), so it never helped for the College's board.
  Result: College postings fell to the flaky general web-search tier — exactly the "Executive
  Director found in tests, missed in the first run" symptom already noted above.

**Fix (founder chose the generic option, 2026-09-29):** turn the single-format direct reader into a
small **board-adapter registry** (shared robots/pagination/choose-by-index/verify machinery; one
detector + parser per board format). iCIMS stays; **PeopleAdmin/SilkRoad is the second adapter**,
parsed by its own column headers so it works beyond Dartmouth. Also carry each target's real
listing URL into the brief/search (long-standing "Next" item 3) so the search opens the exact page.

**Open decision this surfaces — the reader's TRIGGER.** The reader today is fallback-only: it runs
only when the web search reports `page_found_but_could_not_read_listings`. A *readable* board like
the College's makes the search report `read_openings` (with just ~10 of 124), so the fallback never
fires and the full list is still missed. Realizing the founder's stated goal — "find the
business, find its jobs, list them" — means **deterministically reading a saved target's own board
each run when its listing URL is known and its format is supported**, rather than only on failure.
This amends the §8-step-9 "fallback only" rule (still employer-owned, robots-checked, choose-by-
index, per-posting verified, fully disclosed). **Founder confirmed the flip (2026-09-29).** Amend §8-step-9: saved targets with a known,
supported listing URL are read deterministically each run — not only on failure.

**Built 2026-09-29 (tests green, 182 passing).**
- *Generic reader.* The single-format reader is now a board-adapter registry: `ats-reader.ts`
  shares one `readPagedBoard` loop (robots → paginate → parse), with iCIMS and a new header-driven
  **PeopleAdmin/SilkRoad** parser as adapters; `detectListSource` returns `icims | peopleadmin`;
  `job-search-direct.ts` dispatches on the kind. iCIMS behavior is unchanged (its tests still pass).
- *Trigger flipped.* `directReadKnownTargets` reads a saved target's own board every run when its
  stored `careers_url` resolves to a supported, readable board; `job-search-run.ts` runs it on the
  `target_page` step (`loadTargetCareerUrls` maps target names → stored URLs), then the existing
  fallback, both sharing `alreadyReadHosts` so a board is read once. The general web search still
  runs and dedupe collapses overlap. Known-target reads are quiet on unsupported/already-read (only
  genuine failures are surfaced), so the search+fallback still report honestly. Verified by a run
  test: a target whose page the search read `read_openings` is still fully read directly.
- *No new storage needed.* `watched_employers.careers_url` already exists (Dartmouth College's is
  `searchjobs.dartmouth.edu`); the root page carries the `/postings/search` + Applicant-Portal
  markers, so detection resolves the board even when the stored URL is the site root.

Net effect: a saved target with a readable board (iCIMS or PeopleAdmin) now has its full list read
and filtered every run, instead of the ~10 the general search happened to surface — the direct fix
for the Dartmouth College recall miss. Remaining: a live run on the founder's account to confirm
end-to-end, and letting employer discovery capture/refine each target's exact listing URL.

### 2026-09-29 (later) — skill-aware matching (lanes under-represent a multi-skilled candidate)

First live run after the trigger flip: 18 verified postings (up from ~5), and the direct reader
correctly read Dartmouth College's full 123-posting board. But the board selection kept only a weak
lane-keyword match ("Director of Child Care") and skipped the founder's genuinely-good matches
(verified live: Web Optimization & Support Analyst; Associate Director of Social Media; Sr. Business
Development & Licensing Mgr — Engineering/AI/Digital; an Executive Director). Diagnosis: **not a
reader/caps bug** — the full list was read and handed to selection. The cause is structural: both
the web-search step (`buildStepRequest`) and the board selection (`buildSelectionRequest`) are fed
**only the declared lane `role_vocabulary`**, never the candidate's proven résumé/evidence skills.
The founder's good matches (web, digital/social, AI/biz-dev, leadership) fit his RÉSUMÉ breadth, not
his narrow nonprofit lanes, so the search — faithfully following the brief — skips them. The brief
under-represents him. This is the "better brief in" lever (Rethink §2, step 1/7) becoming binding.

**Founder decision (2026-09-29): match proven skills too, labeled separately.** Feed verified
skills as a SECONDARY signal; surface skill-matches that fall outside the declared lanes in their own
clearly-labeled group ("strong on your proven skills, outside your current lanes"). Keep lanes as the
PRIMARY, higher-weighted signal — this must not regress to the retired keyword-spray. Skill terms are
résumé-derived role/skill words (non-sensitive) and are allow-listed for outbound like lane vocab;
private evidence never leaves.

**Slice plan:**
1. **DONE 2026-09-29 (tests green, 189 passing).** Brief skill vocabulary + selection integration.
   `brief-loader.deriveProvenSkills` pulls positioning + `evidenceLedger` claims marked
   verified_from_resume / stated_by_user (inferred/needs-confirmation left out); `search-brief`
   carries `skillVocabulary` and exposes an allow-listed `skillTerms` outbound facet;
   `buildSelectionRequest` (the direct-read choose-by-index) now sends `proven_skills` and returns a
   per-pick `basis: "lane" | "skill"` (`parseSelectionPayload` → `basisByIndex`, default "lane");
   skill-basis direct-read picks carry a `matched_role_term` marker (no migration) and the view
   badges them "Outside your current lanes — matches your proven experience." **Effectiveness caveat:
   this only surfaces skill-matches if the saved advisor analysis actually captures those skills as
   positioning or verified/stated claims. If the analysis is nonprofit-ops-flavored and omits the
   founder's web/digital/AI/leadership breadth, the skill vocabulary will too — re-running evidence
   analysis so the ledger reflects the full résumé is the upstream fix.**
2. *(next) Web-search step skill enrichment.* Add skill terms as a secondary signal to
   `buildStepRequest` so the general/target web search also surfaces skill-matches, tagged by basis.
3. *(next) First-class `match_basis` column* on `job_search_observations` (migration) if the
   `matched_role_term` marker proves too coarse for grouping/recommendations.

Guardrail: a skill-match outside all lanes is always labeled as such and never presented as a top
lane recommendation. Lanes remain the intentional focus; skills widen the net honestly.

### 2026-09-29 (later) — lane scoring is siloed from re-analysis and from verified postings (FIX QUEUED → BUILT 2026-10-07, see entry above)

Founder observation after the magic re-analysis (Round 4) + a search that found real matching roles:
the **Career Lanes page barely moved.** Primary lane = Executive Director; "No validated secondary
lane yet"; the CTO / Media-Innovation lane sat at score 53 in the research queue, the Entrepreneurship
lane at 58, both "capped as research." Diagnosed: `strategic-state.ts scoreLanes` (which ranks the
lanes) is **disconnected from two signals it should consume**:

1. **The evidence re-analysis's strengthened/weakened deltas.** The re-analysis just strengthened the
   founder's web-dev / AI / executive-technical positioning, but `scoreLanes` never reads
   `advisor.positioning` / `changeLog` / the strengthened claims. It scores from a fixed base order +
   network adjustments + conversation outcomes + text-pattern `exploratoryLaneCap`. So the
   strengthening never reaches the lane that best represents it (CTO / Media-Innovation).
2. **The verified job-search postings.** That same lane's cap message asks for "a real role, employer,
   or current-work evidence before ranking higher" — and the weekly search *found* verified-open
   matches (Dartmouth College VP/CIO, Executive Director). But `scoreLanes` does not consume
   `job_search_observations`, so the validation it demands is sitting right there, unused.

The conservatism itself is fine and intended (a lane should not become a search focus on résumé
strength alone; it wants market validation). The bug is that the scorer **cannot tell a speculative
lane with nothing behind it from a well-evidenced lane the search just validated**, because neither
the re-analysis deltas nor the verified postings arrive. Same connective-tissue theme: right pieces,
not wired together. Note too that `exploratoryLaneCap` caps by *name/text pattern* (e.g. "entrepreneur",
"workforce development"), which can suppress a lane regardless of its actual evidence.

**Fix (queued, sequenced AFTER confirming the search works end-to-end — the verified postings are an
input to this fix):** propagate into `scoreLanes` (a) the re-analysis strengthened/weakened signals as
a lane boost/penalty, and (b) verified-open matching postings as lane validation that can lift a lane
out of the research cap. Keep the anti-overconfidence guardrail: verified postings + strengthened
evidence count toward validation; résumé strength alone still does not promote a lane. Expected
outcome on the founder's data: the CTO / Media-Innovation lane rises to Strong Alternate (it now has
both strengthened evidence and verified matching roles). Pure/deterministic, fixture-tested, per house
rules. **Documented now; not built — build after the live search run confirms the reader/skill work.**

#### Fix spec: wire Career Lanes to the evidence analysis and the search (for build, 2026-09-29)

Goal: `strategic-state.ts scoreLanes` consumes two signals it currently ignores, so the Career Lanes
page reflects what the evidence re-analysis and the weekly search already established. All of this is
internal scoring — nothing new leaves the app. Pure/deterministic, fixture-tested (house rule).

**A. Evidence re-analysis deltas → lane boost/penalty (the "lanes talk to the evidence analysis" part).**
Source is already available: `StrategicStateInputs.latestAdvisor`. Use `advisor.changeLog.strengthened[]`
and `.weakened[]` (the mandatory change-detection output from the Autumn loop-repair) plus
`advisor.positioning[]`.
- For each lane, deterministically match its `role` + `roleVocabulary` against each strengthened /
  weakened phrase (reuse the existing `matchesText` / shared-token helper in this file).
- A strengthened match adds a bounded boost (propose +8, cap the total from this source at +12 so many
  phrases can't run away). A weakened match subtracts (propose −8). A positioning phrase that names the
  lane adds a smaller +4.
- Record a human reason ("Evidence re-analysis strengthened this direction: <phrase>") the way
  conversation adjustments already record reasons, so the lane card can cite it.

**B. Verified matching postings → lane validation + cap exemption.**
Source: the latest completed run's `job_search_observations` where `verification_state = 'verified_open'`,
not excluded, not outside. `loadStrategicState` gains a query for these; add
`verifiedPostings?: Array<{ title; employer; matchedRoleTerm?; tier }>` to `StrategicStateInputs`.
- A posting matches a lane if its title matches the lane's `roleVocabulary` (deterministic), or the
  search already tagged it to that lane (`matched_role_term` / lane basis).
- A lane with ≥1 verified matching posting: (a) gets a bounded boost (propose +6 per posting, cap +12),
  and (b) is EXEMPT from `exploratoryLaneCap` — that cap literally demands "a real role, employer, or
  current-work evidence," and a verified-open posting *is* that. Without one, the cap still applies.
- This is the piece that lifts the CTO / Media-Innovation lane out of the research queue once the search
  finds a VP/CIO or Sr. Business Development role for it.

**Guardrails (keep the anti-overconfidence discipline):**
- Résumé strength ALONE still does not promote a lane. Leaving "research" requires a real external
  signal: a verified posting OR a high-confidence conversation. A strengthened re-analysis delta can
  raise the score but, on its own, does not exempt the cap.
- All boosts bounded and reason-tagged; the final `clamp(0..100)` is unchanged. Weakened deltas can pull
  a lane DOWN into research (mirroring how the DH conversation should weaken a DH-dependent lane).
- Fix `exploratoryLaneCap` so it caps for MISSING validation, not by lane vocabulary — a lane named
  "entrepreneur"/"workforce development" with real support must not be capped by its name alone.

**Touched (no schema change, no new outbound facets):** `strategic-state.ts` — `StrategicStateInputs`
(+`verifiedPostings`), `loadStrategicState` (load latest verified-open observations), `scoreLanes`
(apply A+B, exempt cap when validated), plus small `matchDeltaToLane` / `matchPostingToLane` helpers.
Consumers (`assets.astro selectAssetLanes`, briefing) reflect the new scores automatically.

**Tests (fixture, no live calls):** (1) a lane in `changeLog.strengthened` rises, one in `weakened`
falls; (2) a lane with a verified-open matching posting leaves the research cap and can become Strong
Alternate; (3) a speculative lane with neither stays capped (discipline preserved); (4) résumé-only
strength does not promote past research without an external signal.

**Acceptance on the founder's data:** the Director of Media Innovation / CTO lane — strengthened by the
re-analysis (web / AI / tech-exec) AND backed by verified DC VP/CIO + Sr. Business Development postings —
rises out of the research queue to Strong Alternate, with cited reasons.

**Sequencing:** Gap B reads the latest run's verified postings, so it works even before posting
persistence (step 4); step 4 just makes it steadier run-to-run. Build A and B together — they are one
"wire evidence + search results into lane scoring" change.

### 2026-09-29 (later) — Dartmouth College is robots-disallowed; the direct read correctly declines (NOT a bug)

First live run with the reader/trigger/skill work active: **skill matching works** (roles badged
"Outside your current lanes — matches your proven experience"), and **iCIMS employers (Dartmouth
Health, FUJIFILM Dimatix) are read directly.** But Dartmouth College still reported "could not read…
check by hand." Root cause, verified live: **`searchjobs.dartmouth.edu/robots.txt` is
`User-Agent: * / Disallow: /`** — it forbids all automated readers (it explicitly allows only
Googlebot, facebookexternalhit, LinkedInBot, and Twitterbot to `/postings`). The PeopleAdmin reader
checks robots.txt and declines. **This is the politeness/integrity rule (§8 amendment) working, not a
bug.** Fetch + detection both succeed with the app's own user-agent (200, 30 cards, detection fires);
robots is the only blocker, and it is deliberate.

Consequence: **Dartmouth College is web-search-only.** OpenAI's `web_search` reads it via
Google-indexed content (which Dartmouth allows), so College roles DO surface (VP/CIO, Sr Business
Development, Program Manager this run) but **non-deterministically** — which is why the endowed
Executive Director found in an earlier run "disappeared" the next run. **Do NOT bypass robots**
(UA-spoofing as Googlebot, ignoring the file) — that violates the discipline the whole product rests
on, and the PeopleAdmin adapter still pays off for other PeopleAdmin sites that *do* allow bots.

The real fix for "roles disappear between runs" is **posting identity + re-verification across runs
(build step 4, not built):** once a role is found and verified, re-verify it each run with no model
call and carry it forward, so a web-search-discovered role persists even when the next discovery pass
does not re-surface it. This matters most for robots-blocked, web-search-only employers like
Dartmouth College. Step 4 is now a priority alongside the lane-scoring propagation fix.

Minor UX: the run summary says only "could not read… check by hand"; the per-employer coverage detail
("What was checked") does carry the robots reason. Consider surfacing "the site asks automated readers
not to access its job list (robots.txt)" distinctly from a technical failure, so the user is not
confused into thinking the reader is broken.

### 2026-09-30 — Persistence (build step 4) + robots-block messaging are built and tested

Both halves of the step-4 fix above are now implemented, typechecked, and unit-tested (full suite
green: 195 tests).

**Persistence / carry-forward.** At the end of every run (`finalize` in `job-search-run.ts`), before
computing status and summary, `carryForwardPriorPostings` runs: it finds the most recent prior run
that actually searched (`succeeded | partial | budget_limited`), loads that run's observations, keeps
only ones still worth carrying (not `no_longer_visible` / `source_reports_closed`, not excluded),
drops any this run already re-discovered (matched by canonical `normalizeUrl` OR by
`employer|requisition_id`), caps the set at `limits.carryForwardMax` (default **40**, `0` disables),
**re-verifies each one with no model call** (`verifyPostings`, the same page-fetch check the run
uses), and inserts them into the current run with `carried_forward = true`, `first_seen_at`
**preserved** from the original find, and a verification note prefixed "Carried forward from your last
search and re-checked." This is what keeps a web-search-only / robots-blocked employer's finds
(Dartmouth College's endowed roles) from vanishing between runs. Freshly discovered postings are
inserted as before and rely on the column's `default false`.
- New column: `job_search_observations.carried_forward boolean not null default false`, plus a
  `(user_id, source_url)` index — migration `20260930120000_posting_persistence.sql`.
- View: carried postings show "· carried forward from a prior search and re-checked" on the card;
  the run summary adds "N posting(s) were carried forward from your last search and re-checked."
- Tests (`job-search-run.test.ts`): carries a live prior posting forward re-verified with its
  original first-seen date; does NOT carry one this run re-found (no duplicate) or a closed one.

**Robots-block messaging.** When a target's own board is blocked by `robots.txt`, the reader now
returns `blockedByRobots: true` (`ats-reader.ts`), and the run surfaces a distinct
`direct_read_blocked` coverage status (not the generic `direct_read_failed`) on both the fallback and
known-target triggers. The run summary now says plainly, e.g., "Dartmouth College asks automated
readers not to access its job list (robots.txt), so CIP could not read it directly; please check by
hand." — so the user understands CIP is being *blocked by the site's own rules*, not that the reader
is broken. This addresses the "Minor UX" note above. Test added in `job-search-direct.test.ts`.

**"Anything else on the Opportunities page?"** — sequenced by the founder (2026-09-30): finish the
Opportunities page (items 1-4) before the lane-scoring fix, then reassess the Employers page
(including *how we find businesses in a local area*). The four items: (1) a **weekly diff** (new /
still open / newly closed); (2) per-posting **recommendation chips** (apply / talk-first /
research-funding / skip) tied to the lanes, per §8; (3) minimal **action tracking** (applied / talked
/ passed); (4) **employer resolution** (Dartmouth Health vs DHMC vs member hospitals vs Dartmouth
College) so counts and dedupe are per real entity.

### 2026-09-30 (later) — Weekly diff (item 1) is built and tested

"What changed since your last search" now renders on the Opportunities panel and the Briefing summary.
`computeWeeklyDiff(current, previous, previousRunAt)` (pure, in `job-search-run.ts`) compares this
run's shown postings against the previous searched run's, using the **same identity as carry-forward**
(canonical `normalizeUrl` OR `employer|requisition_id`): **new** = absent last run; **returning** =
seen last run and still live; **closed** = was live last run and is now closed/gone this run OR no
longer listed at all. Excluded rows are left out of the change story.
- `loadRunView` attaches `diff` only for a finished searched run (`succeeded | partial |
  budget_limited`) that has a prior searched run — never mid-run, so the advance loop stays cheap. The
  prior run is the most recent searched run with `finished_at` before this one's.
- View: a "Since your last search on <date>: N new, M still open, K newly closed or gone" banner (or
  "No new or newly-closed postings…"); each brand-new card gets a **"New since your last search"**
  badge; the Briefing shows a one-line version. Counts are integers built into the markup; the only
  free text (the prior run's date) is escaped.
- This is the payoff of persistence: without carry-forward, a role the discovery pass missed would
  look "closed" every week; now it is correctly re-verified and shown as still open.
- Tests: pure classification (new/returning/closed/dropped, requisition-match, first-run), plus an
  end-to-end two-run test (kept / brand-new / vanished) asserting the diff counts and the rendered
  banner + badge. Full suite green: **199 tests**.

Still to do on the Opportunities page: items 2-4 (recommendation chips, action tracking, employer
resolution). Then the lane-scoring ↔ evidence-analysis propagation fix, then the Employers-page
reassessment incl. local-business discovery.

### 2026-09-30 (later) — Recommendation chips + user status: finalized design (step 6, items 2 & 3)

Founder-confirmed design for the per-posting recommendation chips, folding in items 2 (chips) and 3
(action tracking) because they share one store.

**Decisions (founder, 2026-09-30):**
1. **Deterministic, no per-posting AI call.** The chip's category, rationale, and confidence come from
   a transparent rules engine over signals we already have. Cheaper (25 postings/run), fully
   explainable (§19: label it, attach confidence, let the user correct), and there is nothing to fall
   back from. An AI-polished sentence, if ever wanted, is an additive layer with the deterministic text
   as its fallback.
2. **One shared table** for the user's override of the chip AND action tracking (item 3): the app's
   chip is the *suggestion*; the user's status is what they *decided/did*. Same row.
3. **Keep the Verified/Lead grouping** (a core integrity signal). Chips are inline per card, plus a
   count strip by the weekly-diff banner. Do NOT re-group the whole board by recommendation.

**The five app suggestions (deterministic chip), first match wins:**
1. **Talk to someone first** — strongest trigger is the **network cross-reference**: a contact in the
   user's network whose `company`/organization matches the posting's employer → "Reach out to <name>,
   connected to <employer>, about this role," using the contact's existing `recommendedFirstAsk` /
   `outreachStory`. Also fires on an open follow-up obligation tied to the employer/lane, or a senior
   title at a high-priority watched employer whose strategic `nextMove` is relationship-oriented.
2. **Check the funding first** — employer resolves to a nonprofit/public/education `category` AND it is
   a senior/program role or pay is unstated → confirm grant vs endowed before investing time. (The
   endowed-ED insight. Only fires when the employer actually resolves to a category — never invented.)
3. **Apply now** — verified open, real lane match (`matched_role_term` non-empty and not `skill`),
   within places or remote, pay ≥ floor or unknown.
4. **Monitor** — the app's "worth watching": not-yet-verified lead, skill-match outside the lanes, pay
   just under floor, or unknown location. (An unverified lead can never say Apply; it caps here.)
5. **Skip** — live but weak: no lane match at a low-priority/unknown employer, or pay well below floor.
   Never hidden; distinct from Excluded/Closed which are already their own groups.

Confidence (high/medium/low) drops when the employer does not resolve or pay/location is unknown.

**Grounding — all real, already stored:** `verification_state`, `matched_role_term`, `source_tier` +
skill marker, `salary_text` vs brief `compensation.floorUsd`, `location_status`/`remote_status` on the
observation; `watched_employers.category`/`priority`/`fit_score`; `StrategicEmployerScore.nextMove` and
`followUpObligations` from strategic state; and network **contactMatches / contact.company** from the
latest `network_analysis` in `career_sources`. Weak link: matching a posting's free-text `employer_text`
to a watched employer / contact company. That is **employer resolution (item 4), not built** — so v1
does best-effort normalized-name matching and **degrades gracefully**: unresolved → posting-level
signals only, at lower confidence, and the funding/talk-first chips simply do not fire without their
grounding. Item 4 later sharpens this.

**User status (the shared store, `posting_dispositions`):** the user can set — and it persists across
runs by the same identity key carry-forward uses (normalized URL, or employer+requisition) — one of:
`watching` ("**Keep an eye on for now**": park without a forward/backward decision; the posting stays
listed, and if it is later filled/removed carry-forward re-verifies it as closed — itself a useful data
point), `applied`, `talking` (reached out / in conversation), or `passed` ("not for me"), plus clear.
When set, the user's status takes visual precedence ("Your call: keeping an eye on this") while still
honestly showing "(app suggested: Apply)". The app's **Monitor** suggestion and the user's **watching**
status are deliberately distinct: one answers "what does the app think?", the other "what have I
decided?".

**UI:** inline chip (label + confidence + one-line why) with a "why / change" expander showing the
named signals and the status buttons; a count strip next to the diff banner; verification grouping
unchanged. Override/status writes go to a new same-origin, rate-limited `/api/jobs/disposition`
endpoint and re-render the card.

**Build order:** (A) `posting_dispositions` migration + loader/writer + tests; (B) `recommendation.ts`
deterministic engine (pure, heavily tested); (C) network cross-reference loader (latest
`network_analysis` contacts → employer match); (D) view wiring + the disposition endpoint; (E) docs.
Everything deterministic; force the deterministic path is moot (no AI here). Migration must be applied
to hosted Supabase before the endpoint can write.

### 2026-09-30 (later still) — Recommendation chips + user status: BUILT and tested

All five phases landed; full suite green (**216 tests**, +17), typecheck clean, production SSR build
compiles.
- **Engine** — `recommendation.ts`, pure `recommendPosting(posting, context)`. The five-chip ladder
  above with confidence and a transparent `signals[]` list. Unverified leads can never reach Apply;
  closed/excluded return a quiet skip. 13 unit tests pin every branch and the precedence.
- **Store** — migration `20260930130000_posting_dispositions.sql` (one row per posting identity;
  status ∈ watching/applied/talking/passed; RLS; secondary employer+requisition index). Module
  `posting-dispositions.ts`: `dispositionKeys`, `loadDispositions`/`indexDispositions`/
  `matchDisposition` (URL first, then employer+requisition), `setDisposition` (update-or-insert),
  `clearDisposition`. Shared by the chip override AND action tracking (item 3). **Apply this
  migration to hosted Supabase before the endpoint can write.**
- **Grounding loader** — `opportunity-recommendations.ts`. `loadRecommendationInputs` pulls resolved
  employers (`watched_employers.category`/priority/fit + `nextMove` from strategic state), network
  contacts by company (parsed from the latest `network_analysis`), open follow-up obligations, and
  the lanes. `recommendationForPosting` resolves each posting by best-effort normalized name
  (`normOrg`) and recommends; `buildPostingAnnotations` returns a `Map<source_url, Recommendation>`
  plus the disposition index — the single call the page/endpoints make. Degrades gracefully when an
  employer does not resolve.
- **View** — inline chip (label + confidence + one-line why) with a "Why / change" expander showing
  the named signals and the status buttons ("Keep an eye on for now", "Mark applied", "Reached out",
  "Not for me", "Clear my status"); the user's status takes visual precedence while still naming the
  app's suggestion; a "Suggested this week: N to apply · M talk first · …" count strip by the diff
  banner. Verification grouping unchanged; chips render on verified + lead cards only.
- **Endpoint** — `POST /api/jobs/disposition` (same-origin, auth, rate-limited, http-URL + status
  validated) writes/clears the status and re-renders the panel via htmx. Chips are computed only for a
  finished run, so the advance loop is untouched.

Fixtures: `fake-supabase` gained `delete`, `lt`, and `lte`. Next on the Opportunities page: none —
items 1-3 are done; item 4 (employer resolution) will sharpen the chips' grounding. Then the
lane-scoring ↔ evidence-analysis propagation fix, then the Employers-page reassessment.

### 2026-09-30 (later still) — Employer resolution (item 4): BUILT and tested

Founder decisions (2026-09-30): **auto-resolve + a one-click fix on the card that persists** (learned
aliases); the fix control lives in the posting card's "Why / change" expander. Auto-resolution is
deterministic and deliberately conservative — it under-merges rather than risk a wrong merge — and the
user's saved corrections always win.

- **Resolver** — `employer-resolution.ts`, pure. `employerMatch(aNorm, bNorm)` matches on an exact
  normalized name, an acronym (`DHMC` ↔ `Dartmouth-Hitchcock Medical Center`), or a full multi-token
  subset with ≥2 shared significant tokens — and **never on a single shared generic token**, so
  "Dartmouth College" and "Dartmouth Health" stay distinct (the named requirement). Only true
  stopwords are generic; distinguishing words like "health"/"college"/"medical" are kept.
  `resolveEmployerName(observed, canon, aliases)` lets a saved alias win (empty target = force
  unresolved), else the best conservative auto-match, and returns **unresolved when two different
  canonical employers match equally well** rather than guessing.
- **Store** — migration `20260930140000_employer_aliases.sql`: one row per normalized observed name,
  `canonical_name` ('' = force unresolved), RLS. `loadEmployerAliases` / `setEmployerAlias` (update-or-
  insert) / `clearEmployerAlias`. Apply to hosted Supabase before the fix endpoint can write.
- **Wired into the chips** — `opportunity-recommendations.ts` now resolves a posting's employer to a
  canonical watched employer, and resolves network-contact companies and follow-up related-employers
  the same way. Contacts/follow-ups match a posting when both resolve to the same canonical employer,
  or — for employers not on the watched list — by a direct conservative name match. So a contact at
  "DHMC" now links to a posting from "Dartmouth Health". `normOrg` moved here (re-exported for callers).
- **UI + endpoint** — the expander shows `Employer "<observed>" is treated as <canonical> (your
  correction)` with a `<select>` of the user's watched employers ("— not one of my saved employers —"
  forces unresolved) plus "Save employer", and "Reset to automatic" when an alias exists. Writes go to
  `POST /api/jobs/employer-alias` (same-origin, auth, rate-limited), which re-renders the panel.
- Tests: conservative-match guarantees incl. the Dartmouth guard, acronym + subset, alias precedence
  and force-unresolved, alias persistence round-trip, and a contact-by-canonical match across
  different name strings. Full suite green: **229 tests**; SSR build compiles.

The Opportunities-page redesign (items 1-4) is now complete. Next: the lane-scoring ↔
evidence-analysis propagation fix, then the Employers-page reassessment incl. local-business discovery.

### 2026-09-30 — first live full run (37 postings) + chip polish from what it showed

First full live run with everything wired: 37 postings (up from ~24), 28 verified, 12 carried
forward, diff "15 new / 22 still open", the network cross-reference naming a real contact on six
Dartmouth Health roles, employer resolution keeping Dartmouth Health vs Dartmouth College distinct, and
a persisted user override round-tripping. Four fixes from reading that output:
- **"Primary lane lane"** — the chip appended " lane" to labels that already end in "lane". Fixed.
- **Funding over-fired on core leadership** — "senior" included bare "manager" (too broad), and a CIO
  got "grant vs endowed". Narrowed `SENIOR_TITLE` (dropped "manager") and added an `OPERATIONAL_LEADER`
  exemption (CIO/CFO/CTO/HR/IT leadership are operating-budget, never funding-cautioned).
- **Below-floor now dominates** — a clearly below-floor role skips before the funding caution (a named
  network contact still wins talk-first above it, since the relationship outlasts one underpaid role).
- **Nonprofit-board source heuristic** — a posting from a nonprofit-only board (idealist.org, etc.)
  now counts as a mission role for the funding caution even when the employer is not on the watched
  list, extending the endowed-ED insight to exactly those postings. Full suite: **234 tests**.

Still noted, not changed: "Conversation research lane" reads as jargon when surfaced as a lane label.

### 2026-10-07 — lane scoring now talks to the evidence re-analysis and the search: BUILT

The FIX QUEUED above (2026-09-29, "lane scoring is siloed…") is built, per its spec. `scoreLanes`
(`strategic-state.ts`) now consumes the two signals it ignored:
- **A — re-analysis deltas.** `advisor.changeLog.strengthened[]` / `.weakened[]` phrases that match a
  lane (by `matchDeltaToLane`, reusing `matchesText` over the lane's role + rationale) adjust its score:
  strengthened +8 each (capped +12 total), weakened −8 each (capped −12), and a matching `positioning`
  phrase +4 once. Each is reason-tagged ("Evidence re-analysis strengthened this direction: …").
- **B — verified postings as validation.** `loadStrategicInputs` now loads the latest searched run's
  verified-open, non-excluded, in-area observations into `StrategicStateInputs.verifiedPostings`
  (self-contained query — no import of the job-search module, to avoid a brief↔state cycle). A posting
  matches a lane by title or by its `matched_role_term` (`matchPostingToLane`; the `skill` marker never
  counts). A lane with ≥1 match gets +6/posting (capped +12) **and is exempt from `exploratoryLaneCap`**
  — the cap asks for "a real role, employer, or current-work evidence," and a verified-open posting is
  exactly that.
- **Guardrail kept.** Only a verified posting (or, as before, a high-confidence conversation) exempts
  the cap. A strengthened delta raises the raw score but, on its own, does NOT leave research — résumé/
  analysis strength alone never promotes a lane. Weakened deltas can pull a lane down into research.
- Touched only `strategic-state.ts` (`StrategicStateInputs` +`verifiedPostings`, `loadStrategicInputs`
  +loader, `scoreLanes` +A/B +cap exemption, helpers `matchDeltaToLane`/`matchPostingToLane`/
  `trimPhrase`). No schema change, no new outbound facets; nothing leaves the app. Briefing + Assets
  reflect the new scores automatically.
- Tests (fixture, deterministic): (A) strengthened rises / weakened falls; (B) a verified-open posting
  lifts a capped lane to Strong alternate with a cited reason; (C) a speculative lane with neither stays
  capped; (D) re-analysis strength alone stays capped. Full suite: **238 tests**; SSR build compiles.

**Refinement from the first two live analyses (2026-10-07).** The founder's week-over-week data showed
Gap B working (the ED Primary lane validated by ~6 real "Executive Director" postings) but also a
mis-attribution: a Dartmouth "VP and Chief Information Officer", tagged by the search with the loose
term "executive director", leaked into the ED lane via `matched_role_term` substring matching, while
the technology-executive lane it actually belonged to got nothing and fell from Strong alternate back
to research. Fixed: posting→lane matching is now **title-based, best-lane** (`assignPostingsToLanes`) —
each verified posting validates the single lane whose role its TITLE fits best, requiring ≥2 shared
significant tokens; `matched_role_term` is no longer used (it is the search's loose tag). Result on the
founder's data: the VP/CIO now attributes to the Director-of-Media-Innovation/CTO lane (not ED) and
lifts it to Strong alternate, and the ED count reflects only real ED titles. Known limitation: two
shared generic rank tokens (e.g. "chief"+"officer") can still bind a mis-fit like a CFO to a CTO lane;
a distinctive-token weighting is a possible later refinement. Also surfaced, not a bug: the
Strong-alternate "volatility" the founder saw between weeks is the strengthened/weakened re-analysis
delta being per-analysis (it correctly does not persist when a later pass finds no new changes) — a
lane stays elevated across weeks only on durable signals (verified postings, conversations,
positioning), which is the intended discipline.

**Refinement 2 (2026-10-07, from the third live analysis).** After a conversation that produced a
weakened delta ("potential roles in large AI/tech companies where the user is not the head"), that
delta bled into the nonprofit ED and nonprofit-CTO lanes — because `matchDeltaToLane` matched a long
re-analysis phrase to a lane on any two incidental shared words in its rationale. Tightened to require a
shared **distinctive** (non-generic) domain token: a delta now adjusts a lane only when the phrase and
the lane's role/rationale share a meaningful word (not "roles"/"leadership"/"head"/etc., which are in a
`GENERIC_DELTA_TOKEN` stoplist). The big-tech-non-head note now weakens only a genuinely tech-IC lane,
not the nonprofit lanes. Mirrors the posting title-attribution fix — stop matching on incidental/generic
tokens. Test added; full suite **241**.

Issue B RESOLVED (2026-10-07, founder chose "lane synonym vocabulary"). Added `ROLE_FAMILIES` to
`strategic-state.ts`: a small deterministic map of role families (tech/digital executive, nonprofit
executive leadership, education/workforce) each with trigger keywords and equivalent titles. A lane is
granted a family's titles ONLY when the lane's own text matches that family's triggers (so tech
synonyms never attach to the nonprofit ED lane — "Nonprofit Media Leader" is not "media innovation").
Posting→lane assignment now scores a synonym-title hit as decisive over token overlap, so a real "VP and
Chief Information Officer" validates the "Director of Media Innovation / CTO" lane (via the
"chief information officer" synonym) and lifts it to Strong alternate, while the ED lane does not claim
it. Test B4 uses the founder's real lane names. Education triggers were kept narrow (teacher/workforce/
faculty/curriculum, NOT bare "educational") so a tech lane serving "educational organizations" is not
mis-filed. Full suite **242**.

With this, the Opportunities + lane-scoring work is done. Next: the Employers-page reassessment incl.
local-business discovery.

### 2026-10-07 — Part 6 lane-aware employer discovery (SPEC, for build)

Founder decisions (2026-10-07): (1) first slice = **make discovery lane-aware** (not better coverage or
a UX rework — those come after); (2) **document the spec, then build**.

**Current state (works, keep).** `employers.astro` → `POST /api/employers/discover` →
`business-search-engine.runBusinessSearch({ geography, radiusMiles, sectors, minimumSize })`. It geocodes
the center, expands to the real labor shed (`geography-engine.resolveSearchArea`: Geocodio → Overpass
nearby towns, radius rings), runs an OpenAI web search, and returns real employers **with provenance**
(chambers, economic-development, municipalities, school systems, directories, company career pages) into
the `employer_candidates` review queue (promote / park / exclude → `watched_employers`). The geographic
grounding and provenance/review discipline are the un-promptable edge; they stay.

**The gap.** Discovery is siloed from the strategy: inputs are a geography plus **manually-typed
sectors**, so it finds "largish employers in a sector near a place" — generic, promptable. It ignores
the lanes, evidence, comp floor, conversation signals, the employer resolver (so "DHMC" can duplicate
watched "Dartmouth Health"), and never says **which lane** a found employer serves. Same connective-tissue
problem we just fixed for Opportunities and lane-scoring.

**First slice — lane-aware discovery. Three parts, all deterministic except the existing web-search call,
with a deterministic fallback (house rule):**

1. **Target from the strategic brief, not hand-typed sectors.** Reuse the job search's brief machinery
   (`search-brief.assembleSearchBrief` / strategic state) so discovery targeting is derived from the
   user's **lanes + their role-family vocabulary** (the `ROLE_FAMILIES` map added in `strategic-state.ts`
   — export a small `laneRoleFamilies(laneRole)`/targeting helper), the **geocoded area** (already),
   and **exclusions**. Manual sector selection stays as an *optional override* (hand-coding optional,
   never required — the founder's standing rule); when the user picks nothing, lanes drive it. The
   web-search prompt is extended to target the lane-implied org types/role families and to keep returning
   real, source-backed orgs only (no fabricated employers — §19).

2. **Tag each candidate with the lane(s) it serves + a short why.** Deterministic post-pass: match a
   candidate's category/name/role-families against each lane (reuse the lane-match helpers:
   `ROLE_FAMILIES` synonyms + distinctive-token overlap). `BusinessSearchCandidate` gains
   `relevantLanes: string[]` (+ a one-line reason). Labeled as AI-derived, correctable in the review
   queue. Candidates that match no active lane are kept but flagged "no current lane fit."

3. **Dedupe against what's already tracked.** Before saving, resolve each candidate's name with
   `employer-resolution` (`buildCanonicalEmployers` over existing `watched_employers` +
   `employer_candidates`, then `resolveEmployerName`). A candidate that resolves to an existing target is
   **not** re-created as a new row; it is surfaced as "already tracked (watched / in review)" so the user
   isn't shown duplicates (no more Dartmouth Health vs DHMC split).

**Loop closure (mostly already there, confirm):** promote → `watched_employers`; capture/attempt a
`careers_url` on promotion so the weekly job search + known-target direct reader pick it up; its verified
postings then validate the lane (the Gap-B wiring just built). No schema change required for the first
slice beyond adding `relevant_lanes` to the candidate record (additive; or stored in existing
`discovery_*` fields — decide at build).

**Deferred to later slices (not this one):** the ProPublica **990 nonprofit layer**, richer
**local-business coverage** (more source types, tighter labor-shed expansion), and the full §14 **target
workspace UX** (orgs with no vacancy, relationship paths, linked jobs, next-action cards).

**Touched (planned):** `business-search-engine.ts` (brief-derived targeting input, `relevantLanes`
tagging, dedup hook), a small targeting/tagging helper reusing `strategic-state`'s `ROLE_FAMILIES` +
`employer-resolution`, `api/employers/discover.ts` (load strategic state + brief, default targeting from
lanes, dedup, tag), `employers.astro` (show "targeting your lanes: …", lane tags + "already tracked"
markers on candidate cards). Fixture tests (`vi.stubEnv("OPENAI_API_KEY","")`): targeting derived from
lanes, lane tagging of a candidate, dedup of a known employer, and the empty/not-configured states.

**Acceptance:** with lanes set and no sectors typed, a discovery run targets the lane-implied org types,
each saved candidate shows the lane it serves (or "no current lane fit"), a candidate matching an existing
watched employer is shown as already-tracked rather than duplicated, and the not-configured path returns
honestly with no fabricated employers.

#### BUILT 2026-10-07

- **Shared vocabulary:** `strategic-state.ts` exports `laneRoleFamilies(laneRole)` (which `ROLE_FAMILIES`
  a lane is in — `tech | nonprofit_exec | education`) and `distinctiveTokens`, reused by discovery.
- **Deterministic core:** `discovery-targeting.ts` — `deriveDiscoveryTargeting(lanes)` maps each lane's
  families to org-type sectors (conversation-only lanes excluded; `derivedFromLanes` false ⇒ caller falls
  back to manual sectors); `tagCandidateLanes(candidate, lanes)` tags by distinctive-token overlap with
  the lane role or its org types ("no current lane fit" when none); `partitionAgainstExisting` splits
  fresh vs already-tracked via `employer-resolution`. 5 fixture tests.
- **Engine:** `business-search-engine.ts` — `BusinessSearchInput.lanes` feeds the web-search prompt
  (`target_lanes`, prioritize lane fit); `BusinessSearchCandidate.relevantLanes`; `saveBusinessSearchResult`
  persists `relevant_lanes`.
- **Endpoint:** `api/employers/discover.ts` loads strategic state, derives targeting, uses lane-derived
  sectors when the user typed none (manual overrides), tags every candidate, dedupes against watched +
  candidate employers (only fresh ones saved), and renders a "Targeting your lanes" banner, per-card lane
  chips, and an "Already tracked — not added again" section.
- **UI:** `employers.astro` — sectors marked optional ("leave blank → targets your lanes"); the review
  queue cards show the lane-fit chips.
- **Migration:** `20261007120000_employer_candidate_relevant_lanes.sql` (additive `relevant_lanes text[]`);
  **apply to hosted Supabase** before the field persists. Full suite **247**; SSR build compiles.

Deferred, unchanged: the ProPublica 990 layer, broader local-business coverage, and the full §14 target-
workspace UX.

#### Follow-up 2026-10-07 — parent-organization grouping (from first live run)

Live run surfaced three Dartmouth Health members as separate rows (Dartmouth-Hitchcock Clinic, Mary
Hitchcock Memorial Hospital, Dartmouth-Hitchcock Medical Center). The conservative name resolver cannot
link them — they share too few words with each other or with "Dartmouth Health" — because that is world
knowledge, not string overlap. Fix: discovery now asks the web search for each employer's
`parent_organization` (the health system / parent company it rolls up to; empty if top-level, never
invented). Then, deterministically: `partitionAgainstExisting` dedupes a candidate when **its name OR its
parent** resolves to a tracked employer (so a watched "Dartmouth Health" now catches its member
hospitals); each card is labeled "Part of <parent>"; and when two or more results share a parent, a note
suggests watching the parent so future runs treat the members as already tracked. Persisted in
`employer_candidates.parent_organization` (migration `20261007130000_employer_candidate_parent_org.sql` —
apply to hosted). AI provides the parent, deterministic logic groups/dedupes (house pattern). Full suite
**248**.

### 2026-10-07 — ProPublica 990 nonprofit discovery (plan sketch → BUILT same day, below)

Founder's next priority (approaching session limit): add the IRS Form 990 layer so **small/mid local
nonprofits that web search misses** are picked up. Rationale: open-web discovery finds the prominent orgs
(Dartmouth, chambers, big hospitals); smaller nonprofits don't rank, but they are all in 990 filings —
structured, geocodable, not dependent on web prominence.

**Source:** ProPublica Nonprofit Explorer API (free, public, no key). `…/api/v2/search.json?q=&state[id]=
VT&ntee[id]=…` (state + NTEE category filters; returns city) and `…/organizations/{ein}.json` (name, NTEE,
revenue/expenses/assets, address, filings by year). Real public-filing data → provenance = EIN + filing
year + ProPublica URL; no fabrication (§19). Deterministic (no model call); rate-limit + cache geocodes.

**First slice (discovery, the "slipping through the cracks" fix):**
1. `propublica-990.ts` client: search by state + NTEE, fetch org detail, with caching + polite rate limit;
   stub the fetch in tests.
2. **Geo-filter to the labor shed.** ProPublica search is state-level; filter orgs to the radius by
   matching the org city against the `geography-engine` nearby-places list first (cheap), geocoding only
   ambiguous cities (Geocodio) and Haversine against the anchor. Reuse the existing geographic spine.
3. **NTEE → lane mapping (config).** Derive NTEE major categories from the user's nonprofit lanes
   (human services, arts/media/communications, education, health, community/advocacy…). Small data map.
4. **Size by BUDGET, not headcount.** The whole point is smaller orgs — do NOT apply the 100+ employee
   minimum; use a revenue floor (e.g. ≥ ~$250k) and bucket revenue → small/medium/large. A $1–5M nonprofit
   with 15 staff is a prime target.
5. **Merge into the existing candidate flow.** Map each 990 org → `EmployerCandidate`
   (`discovery_channel: "irs_990"`, budget-based `estimated_size`, `source_notes` = EIN / revenue / NTEE /
   latest filing year, `parent_organization` usually empty). Then the lane tagging, parent/name dedupe,
   and review queue already built apply unchanged. Rank by proximity + budget + lane fit; cap volume.
6. **UI:** a "Include small nonprofits from IRS 990 filings" toggle on the discovery form; candidate cards
   show budget + an EIN/ProPublica provenance link.

**Decisions to make next session:** (a) revenue floor + size buckets; (b) the NTEE↔lane map (start broad
for nonprofit lanes); (c) city-match vs geocode-every-org for the geo filter (start with city-match);
(d) volume cap per run.

**Deferred beyond this slice:** enriching *existing* watched/candidate nonprofit targets with their 990
financials (feeds the search brief + fit reasoning — §9/§13), year-over-year financial trend signals, and
scheduled refresh. Build discovery first; enrichment is the natural follow-on. **(Enrichment and trend were
BUILT later the same day — see "BUILT 2026-10-07 — 990 enrichment" below. Scheduled refresh is still not built.)**

#### BUILT 2026-10-07 — the four decisions, settled at build start (founder)

- **(a) Budget floor $250k; buckets small <$1M / medium $1M–$10M / large >$10M.** Size is budget-based,
  never headcount; the web search's `minimum_size` does not apply to 990 rows.
- **(b) Broad five NTEE categories** for nonprofit-family lanes: 1 Arts (A), 2 Education (B), 4 Health
  (E–F), 5 Human services (I–P), 7 Public/societal benefit (S/T/W) — ids verified live against the API.
  Education-family lanes narrow to Education; no usable nonprofit/education signal → the broad five,
  disclosed in the coverage line.
- **(c) Geo filter = city-match first** against the search-area center + state-verified nearby places;
  unmatched cities geocoded (bounded at 12/run) and Haversine-checked against the anchor; unlocatable
  cities dropped and counted, never guessed in.
- **(d) 12 candidates per run** (matches the web-search cap), ranked lane fit → distance → budget.
- **Standalone mode:** with the toggle on, the layer runs even when OpenAI is absent or failed — new
  result mode `irs_990`. The deterministic path is never gated behind the paid one (house rule).

What shipped:

- **`propublica-990.ts`** — ProPublica Nonprofit Explorer client (search by `state[id]` + `ntee[id]` +
  `c_code[id]=3`, per-EIN detail endpoint), 0-based `page` (25/page, ≤2 pages/category), 600 ms pause
  between requests, one polite retry on 429/5xx, 10 s timeout, bounded TTL cache (search pages 12 h,
  org details 30 d, 500 entries prune-oldest; an injected fetch bypasses the cache so tests stay
  isolated). 501(c)(3) only and "Group Return" rows skipped. Latest-filing financials with the BMF
  summary as fallback; provenance = EIN + filing year + ProPublica URL; `careers_url` stays empty (a
  filing says nothing about a careers page). Detail budget 24/run spent closest-first after the geo
  filter; revenue-unknown orgs are dropped and counted ("no usable financials"), never shown as poor
  fit. All I/O injectable (fetchImpl / sleep / geocoder) — the repo's no-network test idiom.
- **Merge into discovery** — `POST /api/employers/discover` gains `include_990`; the layer runs after
  the web search and its candidates flow the same pipeline (lane tagging, partition-vs-tracked, save,
  review queue) with `discovery_channel: "irs_990"`, budget-based `estimated_size` ("medium nonprofit -
  $1.4M annual revenue (FY 2024)"), and `source_notes` = EIN / revenue / NTEE / ProPublica link. A 990
  org that resolves (conservative resolver) to a web candidate is counted as "also found by web
  search" — the web row keeps its source/careers URLs — instead of duplicating. A coverage `<details>`
  renders categories, counts, floor, cap, skips, and attribution; when only the 990 layer ran the run
  mode is `irs_990` and the header says so; a failed web half is disclosed without hiding the 990
  results; NTEE category phrases are pinned by test to the lane-tagging vocabulary.
- **UI** — "Also include small nonprofits from IRS 990 filings (ProPublica)" toggle on the discovery
  form; the queue's channel pill / lane chips / parent grouping needed no change.
- **No schema change** (every needed column already exists), **no new env var** (keyless API), security
  posture unchanged (same-origin, auth, anonymous rate limit).
- **Tests** — `propublica-990.test.ts`, 26 fixture tests with injected fetch (no network): NTEE↔lane
  derivation, category-phrase↔lane-tag contract, polite paging + retry, c3/group-return eligibility,
  budget buckets + formatting (never rounds up past the figure), city-match vs geocode paths (wrong
  state, unverified state, geocode cap), latest-filing parsing + BMF fallback, candidate provenance,
  end-to-end run with honest coverage counts, category-failure honesty, floor/no-financials drops,
  the 12 cap, non-US null, and web↔990 dedupe (incl. the DHMC acronym case).
- **Verification** — tsc clean, 26/26 new tests pass, SSR build compiles. Full suite on this machine
  was 270/274 at first: the 4 `loop-repair.test.ts` failures were **pre-existing on the pulled
  commit** (verified by stashing this change) and environment-dependent. **FIXED later the same
  session (280/280, suite test time 21 s → 1.2 s):** vitest loads `.env` into `import.meta.env`, and
  that file stubbed `OPENAI_API_KEY` at MODULE scope while `afterEach` called `vi.unstubAllEnvs()` —
  so the stub was cancelled after the first test, the advisor tests re-saw the real key, and they
  attempted LIVE OpenAI calls that hit vitest's 5 s timeout (and billed). Two-layer fix: (1) new
  `vitest.setup.ts` (registered in `vitest.config.ts`) strips provider credential keys from both
  `import.meta.env` and `process.env` suite-wide, making "never call the real API from the suite"
  (AGENTS.md) a guarantee instead of per-file discipline — safe because every other test already
  injects fake keys explicitly (`loadJobSearchConfig` readers with "sk-test", explicit `apiKey`
  options); (2) `loop-repair.test.ts` re-stubs in `beforeEach` so its own intent survives the
  unstub. Prod env handling (import.meta.env read by name) is untouched.

Live end-to-end pass on the founder's account still to do, as with the lane-aware slice.

#### Follow-up 2026-10-07 (from the first live run) — 990 rows now join the parent-organization dedupe

The first live run worked (the layer ran, filing-backed candidates appeared) but re-surfaced the
morning's duplication: Mary Hitchcock Memorial Hospital and Dartmouth-Hitchcock Medical Center were
listed as separate fresh candidates although the user watches Dartmouth Health. Root cause: the
morning's parent mechanism needs `parent_organization` on the candidate, and the 990 layer set it to
"" on every row — filings carry no parent name, and a member's name shares no tokens with its
system's (world knowledge, not string overlap), so the parent leg of `partitionAgainstExisting`
could never fire for 990 rows.

**Founder decision: model-assisted + stored parents** — the same house pattern as the morning's web
fix (the model provides the parent; deterministic code dedupes and groups), with the deterministic
layer intact:

- **Stored adoption (deterministic, works in standalone mode):** `adoptKnownParents` fills only
  EMPTY parents from member→parent pairs earlier runs saved on `employer_candidates.parent_organization`
  (loaded per run). Never overwrites a model-provided or already-adopted parent.
- **Model pass (when OpenAI is configured):** `enrichNineNinetyParents` — ONE small Responses call
  (strict `json_schema`, `max_output_tokens` 2000, results keyed by EIN so a response cannot
  retarget another row) links each 990 org to its parent, preferring the user's tracked employer
  names; empty string when top-level/unknown, never invented. On no key / provider failure / bad
  payload it returns "not_configured"/"unavailable" with **nothing changed** — the 990 layer itself
  never depends on it. `BusinessSearchCandidate` gained an in-memory `ein?` used as the key (not
  persisted).
- **Ordering:** adoption + enrichment run BEFORE the dedupe partition, for web and 990 rows alike;
  enriched parents then flow the morning's mechanism unchanged — dedupe vs tracked parents
  ("already tracked as Dartmouth Health"), "Part of <parent>" card labels, the watch-the-parent
  grouping note. Saved candidates persist their parents, so future runs (including standalone 990
  runs) adopt them deterministically.
- **Disclosure (§6):** the 990 coverage block reports how many orgs were linked to a parent, and
  says plainly when the model pass was unavailable ("members may be listed individually this run").
- **Tests (32 in the file):** adoption (exact + acronym, never overwrites, no-op with no stored
  members), enrichment (EIN-keyed apply, a rogue row for an unknown EIN is ignored,
  not_configured without fetching, failure changes nothing), and the founder's live case end-to-end:
  Mary Hitchcock + DHMC enriched → `partitionAgainstExisting` vs watched Dartmouth Health → both
  already-tracked, the independent org fresh. The enrichment option treats an explicit `apiKey`
  (even "") as authoritative precisely so tests stay hermetic against a real key in `.env` — the
  same `import.meta.env` trap that breaks loop-repair locally.

Confirming live re-run still to do, as with the lane-aware slice.

#### BUILT 2026-10-07 — 990 enrichment of the employers you already track

The deferred follow-on to discovery: attach IRS Form 990 filings (revenue by year, a trend) to **watched**
employers, and use them where the founder asked to see them first. Founder decisions this session:
finish the half-built enrichment; show it on **posting recommendation chips, the Employers cards, and the
weekly briefing**; fetch **on promotion plus a refresh button** (not on every weekly search).

**What it is, and the honesty rules.**
- `employer-financials.ts` (core), `employer-financials-view.ts` (HTML), `api/employers/financials/` (single
  refresh and bulk refresh), migrations `20261007140000_employer_990_profiles.sql` (one row per user +
  `normOrg(watched name)` — the same key the chips already resolve employers to) and
  `20261007150000_employer_candidate_ein.sql` (`employer_candidates.ein`, so a 990-discovered candidate
  carries its EIN to promotion).
- A profile states only what filings say: revenue / expenses / assets by tax year (newest first, up to 5),
  and a **revenue trend**: across the latest three filings that report revenue, ≥ +10% = growing, ≤ −10% =
  shrinking, otherwise steady; a single-year drop of ≥ 25% also counts as shrinking (a lost grant);
  fewer than two usable filings = unknown. Revenue (not surplus) is used because nonprofit revenue is lumpy;
  the thresholds are deliberately wide, so "steady" is the common result. Constants live in one place.
- **Unknown is never "poor funding."** No profile, no match, no filings, or a failed lookup are all shown as
  unknown, with the reason. A city, a college system, a for-profit, or a tiny organization may have no
  filing the service can find.
- **Name matching is conservative.** Only an EXACT (suffix-insensitive) or ACRONYM name match within the
  right state attaches filings automatically, and only when exactly one filer sits in that tier. A looser
  token-overlap match is never attached: it comes back as "Possible match, not confirmed: <name> (EIN …)"
  and the user confirms by entering the EIN ("Know the EIN?" on the card). Two same-named filers = ambiguous,
  shown, not guessed. An unknown state means no name search is attempted.
- **A transient failure never overwrites good data.** A failed refresh over an existing real profile keeps
  the profile and says so; a lookup-failed row is retried first by the bulk button.
- Only the employer's public name and state go to ProPublica (free, keyless). No model call anywhere.

**Where it shows up.**
1. **Chips** (`recommendation.ts`): the employer's latest filing becomes a named signal. A 990 filer counts
   as a mission employer (a filer is a nonprofit by definition). A **shrinking** trend raises the
   `check_funding` caution for any mission role, junior or senior, and even for core operational leaders
   (CIO/CFO/HR), who are otherwise exempt from the generic "grant vs endowed" caution, because the
   organization's own finances are the concern; confidence "high". A **growing/steady** filing is shown as
   evidence but **never relaxes** the caution: a filing cannot show that one particular role is funded.
   Below-floor pay still dominates, and a named network contact still wins talk-first. No profile → chips
   behave exactly as before.
2. **Employers cards** (saved businesses): an "IRS 990 financials" block per card (trend pill, latest-year
   revenue/expenses/assets, the revenue-by-year line, ProPublica and PDF links, age of the lookup, a
   caveat that a filing cannot show a role is funded and that a parent system may file separately from its
   hospitals), a per-card "Look up / Refresh financials" button, the EIN field, and a bulk "Look up financials
   for tracked employers" button (up to 8 per click; never-looked-up first, then failed, then older than 30
   days; fresh and recent no-matches skipped; each card updates in place by an out-of-band swap). Both use the
   shared loading animation. With the table missing, the page shows a plain "apply the migration" message
   instead of breaking.
3. **Promotion**: after "Save selected businesses", up to 8 of the newly watched employers are looked up
   (a 990-discovered candidate uses its EIN; others by name + state), and the result says how many were
   found and that the rest can be done with the buttons. It never blocks the promotion.
4. **Weekly briefing**: each snapshot stores a `funding_profiles` entry. Shrinking tracked employers are a
   standing "Funding check" in the briefing's employer checks, every week until they stop shrinking; a
   **new filing year** or a **trend that moved** since the previous snapshot appears under "What changed",
   but only against a snapshot that already had funding data (the first enriched week is a baseline, not news).

**Found by running it against the real API (free, read-only) and fixed:**
- ProPublica answers a **zero-result search with HTTP 404 and a normal JSON body**. The client treated any
  404 as a failure, so every employer with no 990 (a municipality, say) read "lookup failed" and would have
  been retried forever, and the discovery layer reported empty categories as "incomplete". A 404 whose body is
  a search-shaped payload is now an empty result; a 404 on any other endpoint is still a miss.
- Large systems report billions: "$1980.4M" now reads "$2B".
- Real behavior worth knowing: Upper Valley Haven matches exactly (5 filings, FY 2024 revenue $8.1M, up 19%);
  Mary Hitchcock Memorial Hospital matches exactly (about $2B, up 23% since FY 2021); "Dartmouth Health" and
  "Dartmouth College" return only unconfirmed suggestions (their legal names are "Dartmouth-Hitchcock Health"
  and "Trustees Of Dartmouth College", several EINs) — the user confirms by EIN. **A parent system's own return
  can be small:** Dartmouth-Hitchcock Health (EIN 26-4812335) shows about $23M, while the operating revenue
  is on the member hospitals' returns. The card says so. Rolling members up to a watched parent (using the
  `parent_organization` the discovery layer already stores) is a possible later refinement, not built.

**Tests:** 42 (core: trend, state hint, EIN parsing, series parsing, matching tiers, lookup outcomes, persistence,
refresh rules, bulk selection, weekly diff, safe EIN save) + 12 (view: states, escaping, setup path, out-of-band
swap, loading animation) + chip, recommendation-integration, briefing, and 404 regression cases. Full suite
**349**, typecheck clean, SSR build compiles. Candidate saving writes `ein` only when a candidate has one and
retries without it if that column's migration is missing, so a not-yet-applied migration cannot silently drop
candidates. Hosted-database migrations still need applying (below). A live pass on the founder's account
(promote a candidate, bulk-refresh the 28 tracked employers, read a chip and the briefing) is still to do.

**Not built:** scheduled refresh; roll-up of member hospitals to a watched parent's totals; executive
compensation / salary plausibility (a historical officer-pay figure does not establish a current opening's
pay); feeding 990 fields into the outbound search brief (they are public data, but nothing needs them there yet).

#### Live pass 2026-10-07 (founder) and the first fix: the 990 lookup is per-employer, not for everyone

Founder's live read of the finished enrichment: **(B) chips** show useful analysis ("costs exceed revenue", "income down over the
past year", "down 31% over 3 years"); **(C) briefing** carries good funding information, and it sparked follow-up questions from the
founder's conversations and employers to be wary of; **(D) lane-aware discovery** worked ("working great"); **(E) the job search** is "coming
together pretty nicely". (A) found a real design flaw: the lookup ran for **every** tracked employer, but filings exist only for nonprofits.
Fujifilm and Hypertherm are for-profit, City of Lebanon is a municipality, and White River Junction VA is federal.

**Fix (founder chose: auto-guess + per-employer override; unclear employers are looked up and a miss is shown quietly):**
- Each watched employer has an IRS 990 **setting: Auto / Always / Never** (`watched_employers.financials_mode`, migration
  `20261008120000_watched_employer_financials_mode.sql`; absent = Auto, so nothing breaks before it is applied except saving the setting).
- **Auto** (`guessEmployerType` / `planFinancialsLookup`, deterministic, name + category text): government bodies are skipped (City/Town/
  County/State of, Department/Bureau/Agency of, Veterans Affairs and a standalone "VA" in the name, federal/U.S. agencies, school districts,
  supervisory unions, police/fire, municipal, housing authorities, and the "Government" sector category); clearly for-profit companies are
  skipped (company-form name suffixes such as LLC/Corp/Ltd, but NOT "Inc", which nonprofits use too; for-profit industry categories such as
  manufacturing, retail, software, banking, insurance, construction, utilities). Order: government first, then plain nonprofit wording
  (nonprofit, foundation, human services, community television/media, food bank, museum, hospice...), then for-profit. Everything else, including
  hospitals, colleges and anything unfamiliar, is **unclear**: it is looked up, because a miss is cheap and harmless. Agriculture, education,
  health and information are deliberately not treated as for-profit categories (nonprofits are common there).
- **The user's setting always wins**; a filing already on file or a known EIN (990-discovered candidate) counts as "yes"; linking an EIN turns the
  employer to Always.
- **Where it applies:** the bulk button and the promotion lookup skip government and for-profit employers (and say how many); the per-card button
  and "Look up anyway" always work. Skipped cards show **one quiet line** with the reason ("Skipped: this employer looks like a government body...")
  and hide any stale no-match noise; an unclear employer's miss is **one quiet line** (details tucked in a fold); a nonprofit-looking employer's miss
  still shows the full block (so a suggested EIN is never hidden); real filings are never hidden even if turned off.
- **Known limit:** with no category text and no company suffix (e.g. a bare "Fujifilm") the app cannot know it is for-profit, so it falls in the unclear
  bucket (a quiet "No IRS 990 filing found" line); set it to Never once. Tests: 54 core + 21 view; full suite **369**, SSR build clean.

### Decisions made by the founder (2026-09-23)

- Rethink first, built de-foundered from the start; the rest of Phase 5 and the legacy parsers (Phase 6) follow the slice.
- Provider: OpenAI, reasoning model, one manual full search per week; target career pages first, then sector boards, then general search.
  LinkedIn and Indeed are not targeted (login-gated, and their terms prohibit automated access).
- Remote and hourly-pay handling: remote is a later concern; hourly pay converts at 2,080 hours, labeled an estimate.
- A narrow, fallback-only, disclosed direct reader is allowed (amends step 9). HealthcareSource stays "check by hand."
- Hosting when ready: Vercel (Pro already held), CIP as its own project; not deploying yet. The CIP name and domain will be
  workshopped before the beta.

### Migrations (apply in this order; each is safe to run twice)

`20260923120000_search_preference_items.sql`, `20260923130000_job_search_runs.sql`, `20260923140000_archive_board_era_opportunities.sql`,
`20260923150000_direct_read_tier.sql`, `20260930120000_posting_persistence.sql`, `20260930130000_posting_dispositions.sql`. The archive
marker and direct-read migrations are needed for those features; `posting_persistence` adds `carried_forward` + the `(user_id, source_url)`
index for cross-run persistence; `posting_dispositions` adds the user-status / action-tracking table; `20260930140000_employer_aliases.sql` adds the employer-resolution
correction table. All three 2026-09-30 migrations **must be applied to hosted Supabase** (dashboard SQL editor) — `posting_persistence`
before carry-forward can write, `posting_dispositions` before the chip status endpoint can write, and `employer_aliases` before the employer-fix
endpoint can write. The 2026-10-07 lane-aware discovery and 990 *discovery* slices need `20261007120000` / `20261007130000` (relevant_lanes,
parent_organization) and no migration of their own. The 990 **enrichment** needs two more: `20261007140000_employer_990_profiles.sql`
(the per-employer filing profiles table) and `20261007150000_employer_candidate_ein.sql` (`employer_candidates.ein`), and the live-pass fix adds
`20261008120000_watched_employer_financials_mode.sql` (the per-employer Auto/Always/Never setting; without it the setting cannot be saved but Auto
still works). Apply all five in order; each is safe to run twice. Without the first two, saving ANY discovered candidate fails (discovery writes those columns);
without 140000 the financials blocks show a setup message and chips/briefing simply have no 990 data; without 150000 candidates still
save (the EIN write retries without it) but a 990-discovered candidate's EIN is not kept for promotion.

### Next, in order

1. **Two live acceptance passes** (§15.3): establish a baseline run, change a constraint or add evidence, run again, and trace the change
   through brief, search, saved observations, and the visible result. Include a successful-zero-result and a simulated-failure path.
2. ~~**Step 4: posting identity across runs** and re-verification of earlier finds each run (no model call).~~ **DONE 2026-09-30** — carry-forward + robots-block messaging (see the 2026-09-30 entry above).
3. **Remember each target's real career-page URL** (user-supplied or discovered) and give it back to the search and the direct reader.
4. **Steps 5-8:** ~~the weekly diff~~ **DONE 2026-09-30**; then per-posting recommendation chips (apply / talk-first / research-funding /
   monitor / skip), minimal action tracking, and employer resolution (DH vs DHMC vs the member hospitals vs Dartmouth College); then the
   Employers (target workspace) redesign (§14), including **how we find businesses in a local area**.
5. **De-founder and state-layer tests** (Autumn Phases 5-6) and lane configuration, per the Autumn plan. (The 990 enrichment is built — 2026-10-07 — pending the hosted migrations and a live pass.)

### Parked (not decided or not started)

- **BETA-RESTORE: the weekly job-search run cap is disabled in founder dev.** `maxRunsPerWeek` is
  env-overridable (`JOB_SEARCH_MAX_RUNS_PER_WEEK`, 0 = no weekly cap); the founder's local `.env`
  sets it to 0 so re-runs are unlimited during development. The committed default stays 3, and
  per-run token/call/cost caps always apply. Before beta, ensure the env is unset or set to a
  positive value so the weekly cap is back on (2026-09-29).
- Cost per beta user and total monthly cost (see `productionization_discussion.md`), including locking down sign-ups and the API key.
- Deploying to Vercel: swap the Node adapter for the Vercel one; the in-memory rate limiter is weak on serverless (search caps are database-backed
  and hold); the OpenAI key is currently copied into the server build (a follow-up task is queued to move secrets to runtime reads).
- Workshopping the CIP name and domain.

### Working notes

- `npm run dev` builds and serves `dist/`; it does not hot-reload. Restart it to see code changes, and do not run `npm run build` while it is running.
- Private server settings must be read as `import.meta.env.NAME` written out by name (or via `readJobSearchEnv`); looking them up by a variable returns nothing.
- The OpenAI account: the key in `.env` belongs to a specific organization; confirm which account the dashboard is showing before reading spend.
