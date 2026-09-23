# Employers & Opportunities Rethink (Plan)

Status: **Updated 2026-09-23 (evening) — steps 0-3 and 9 are built and live-tested; steps 4-8 and the Employers redesign are not started. See §16 for the status board and build log.**
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
| 9. Retire the dead-premise scrapers | Done at the Opportunities cutover; a narrow fallback-only direct reader was added by amendment (§8 step 9) | |

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
`20260923150000_direct_read_tier.sql`. The last two are needed for the archive marker and to save direct-read postings.

### Next, in order

1. **Two live acceptance passes** (§15.3): establish a baseline run, change a constraint or add evidence, run again, and trace the change
   through brief, search, saved observations, and the visible result. Include a successful-zero-result and a simulated-failure path.
2. **Step 4: posting identity across runs** and re-verification of earlier finds each run (no model call).
3. **Remember each target's real career-page URL** (user-supplied or discovered) and give it back to the search and the direct reader.
4. **Steps 5-8:** employer resolution (DH vs DHMC vs the member hospitals vs Dartmouth College), the weekly diff, the apply / talk-first /
   research-funding / monitor / skip recommendation, minimal action tracking; then the Employers (target workspace) redesign (§14).
5. **De-founder and state-layer tests** (Autumn Phases 5-6), lane configuration, and the 990 enrichment, per the Autumn plan.

### Parked (not decided or not started)

- Cost per beta user and total monthly cost (see `productionization_discussion.md`), including locking down sign-ups and the API key.
- Deploying to Vercel: swap the Node adapter for the Vercel one; the in-memory rate limiter is weak on serverless (search caps are database-backed
  and hold); the OpenAI key is currently copied into the server build (a follow-up task is queued to move secrets to runtime reads).
- Workshopping the CIP name and domain.

### Working notes

- `npm run dev` builds and serves `dist/`; it does not hot-reload. Restart it to see code changes, and do not run `npm run build` while it is running.
- Private server settings must be read as `import.meta.env.NAME` written out by name (or via `readJobSearchEnv`); looking them up by a variable returns nothing.
- The OpenAI account: the key in `.env` belongs to a specific organization; confirm which account the dashboard is showing before reading spend.
