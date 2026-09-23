# Employers & Opportunities Rethink (Plan)

Status: **Reviewed 2026-09-23 — gap-closure pass applied, ready to build.** Set 2026-09-23.
Companion to `Next Steps.md` (Rounds 1–3) and `Project Plan Autumn 2026.md`. This document owns
the redesign of **Part 6 (Employers)** and **Part 7 (Opportunities)** now that the premise they
were built on is obsolete.

The same-day review closed the engineering-spec gaps this plan was missing: posting identity +
dedupe, employer resolution/aliasing, staleness honesty, the weekly trigger model, cost and
empty-state guardrails, the fit-correction loop, nonprofit-intelligence (990) integration as a
fit-signal source, the Part 7 surface sketch, and the test discipline. See §5, §6, §8, §10, §11.
The only outstanding items are the founder decisions in §9.

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
The keyword-scoring board-scraper approach must be retired or demoted. The question is no longer
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
   *what is new, what closed, what moved* — the same diff logic already built for lanes/employers
   in `weekly-strategy.ts`, applied to jobs. That is a partner, not a prompt.

3. **An evidence-grounded fit check that beats Indeed's.** Indeed grades a posting against a
   *resume*. The app can grade it against the *verified evidence ledger + lanes + comp floor +
   exclusions + what real conversations revealed* and return a **recommendation, not a number**:
   `apply` / `talk-first` / `research-funding` / `monitor` / `skip`. Strictly more than Indeed can
   do, because Indeed has none of that accumulated context.

**The moat is connective tissue, not search.** A market event — e.g. Dartmouth Hitchcock cutting
400+ healthcare jobs — should ripple across the whole picture: weaken DH as a near-term target,
flag a flooded local healthcare-ops market (a real competition headwind), possibly strengthen
employers who absorb displaced demand, generate an outreach angle, and re-weight next week's search
away from DH-dependent roles. No chat prompt connects a friend's tip → the employer list → lane
strategy → next week's jobs. The app can. That connection *is* the product.

## 3. The Geocodio / geographic edge — use it everywhere

`geography-engine.ts` is the single most un-promptable asset in the codebase: real geocoding
(Geocodio → OpenStreetMap/Nominatim), an Overpass lookup of towns/cities within a radius, Haversine
distance math, population-ranked nearby places, and generated locality search queries. A chat
window cannot do this reliably — it will latch onto a place name and miss the real labor shed.

Today this only feeds employer *discovery*. It should ground **the entire job search**:

- Expand a search to the real commute/labor shed (nearby towns within the radius), not just the
  typed city — so "White River Junction" also searches Lebanon, Hanover, Norwich, Wilder, etc.
- Rank results by true distance from the user's anchor, not string matching.
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

**Retire or demote (the dead-premise machinery)**
- Greenhouse/Lever board scraping and `scoreOpportunity`'s keyword-overlap number. Keep only if a
  specific saved employer exposes a clean ATS feed worth monitoring; otherwise remove.
- Treating a raw board pull as "the search." It is not the product anymore.

**Build (new)**
- A **search-brief assembler**: turn the user's current strategic state (lanes, evidence,
  exclusions, comp floor, geocoded area, conversation signals) into a structured brief object.
- An **LLM-web-search job engine** that consumes the brief, returns real postings *with source
  URLs*, and never fabricates listings (the §19 integrity rule — the original hallucinated-listing
  failure must not return).
- **Persistence + weekly diff** of results (new / still-open / closed / moved).
- An **evidence-grounded fit + recommendation** per posting (apply / talk-first / research / skip),
  with the reasons drawn from the evidence ledger and conversation intelligence.

## 5. The accumulation flywheel (why this compounds)

Every artifact the user adds should sharpen the *next* search:
- A conversation signal ("DH cut 400 healthcare roles") → down-weights DH-dependent searches and
  raises a competition warning.
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
surface as named reasons on recommendations (step 7).

## 6. Integrity guardrails (non-negotiable, §8 / §19)

- **No fabricated listings, ever.** Every job shown carries a real source URL from the search;
  no invented postings, employers, salaries, or dates. This was the original failure that started
  the whole "no fake engines" rule.
- **Label AI-derived content** (fit reads, extracted signals) and show its confidence; let the
  user correct it.
- **Recommendation over score.** Never show a bare match number as if it were truth.
- **`talk-first` is a first-class outcome**, consistent with the product's relationship-first,
  anti-mass-apply thesis. The app should sometimes say "don't apply yet — have a conversation."
- **Staleness honesty.** The app can never truly know a role "closed" — only that it is no longer
  visible at the source. Every posting carries "first seen" and "last verified [date]"; the diff
  reports "no longer visible on [source]," never "closed."
- **Privacy boundary on the brief.** The search brief holds comp floor, exclusions, and
  conversation-derived signals. Only search-relevant, non-sensitive facets leave the app:
  role language, geocoded area, work model, broad comp range. Private claims — unverified
  stories, named confidences, sensitive constraints — never go to the provider.
- **User-correctable recommendations.** Every apply / talk-first / research-funding / skip chip
  carries an inline "correct this" control ("actually, I applied", "already talked to them").
  Corrections are persisted, fold back into preferences and exclusions, and are the on-ramp to
  outcome tracking (build step 8). A recommendation the user cannot overrule is a claim the
  app is not willing to be wrong about — that is not integrity, it is arrogance.

## 7. Worked example / acceptance test

The redesign is working when the Dartmouth Hitchcock scenario produces this, end to end:

> You logged a conversation: a friend at Dartmouth Hitchcock said they cut 400+ healthcare roles
> this week. Since then: **Dartmouth Health moved down** as a near-term target, and a **competition
> warning** is flagged for local healthcare-operations roles (a wave of experienced people just
> entered your market). Your **Program Operations lane is unchanged**, but this week's job search
> **de-prioritized DH-dependent roles** and surfaced 3 new openings within 25 miles of White River
> Junction at other employers, 1 marked *talk-first* because of a warm path. One role from last
> week is **no longer visible on the employer's site** (first seen 9/12, last verified today).

If the app can produce that from a pasted note — with no hand-coding of dropdowns — it is
decisively better than the monthly Claude prompt.

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
2. **Geographic grounding of search** — every search expands to the geocoded labor shed
   (nearby localities from `geography-engine.ts`); results ranked by true distance from the
   anchor, never string-matched.
3. **LLM-web-search job engine** — brief in → real postings with source URLs out; persisted.
   Acceptance criteria: no fabricated listings; provider failure degrades to an honest
   "no results this week" state (never a fallback to scraped boards); and cost guardrails are
   part of *done*, not a follow-up — caps on postings per run, per-user weekly budget, and
   measured tokens per run.
4. **Posting identity + dedupe** — normalized employer + normalized title + fuzzy description
   similarity + location forms the matching key; `first_seen` / `last_seen` lifecycle; reposts
   and multi-source duplicates collapse into one posting. Pure functions, fixture-tested.
   (Without this, step 6's diff produces phantom "new" and "closed" churn and user trust dies.)
5. **Employer resolution** — discovered posting employers resolve onto the saved employer map
   (`watched_employers` / `employer_candidates`) via normalization + an alias table, with a
   human-confirm nudge for uncertain matches ("Dartmouth Hitchcock" = "Dartmouth Health"). This
   is the connective tissue of §2's moat: without it, conversations ↔ employers ↔ postings never
   actually link and the flywheel spins free.
6. **Weekly job diff + trigger** — new / open / no-longer-visible / moved, wired into the briefing
   heartbeat, with staleness labels (§6). **Trigger model, stated:** v1 is a manual weekly action
   on the briefing page ("Run this week's search"); scheduled automation is a later upgrade. Do
   not repeat the Round 3 failure where "weekly" meant "whenever someone remembers."
7. **Evidence-grounded fit + recommendation** — apply / talk-first / research-funding / skip,
   reasoned from the evidence ledger, conversation signals, and the **990 nonprofit intelligence
   when the target is a nonprofit** (funding stability, salary plausibility — see §5). The
   "better-than-Indeed reality check," correctable per §6.
8. **Outcome tracking** (Round 3 item) — applied / replied / interviewed / closed, plus the
   per-recommendation corrections from §6, so the loop learns what converts.
9. **Retire the dead-premise scrapers** once the engine above is trusted. ATS adapters (Autumn
   Phase 13) survive **only as verification** of discovered postings against employer-owned
   pages — never again as the discovery engine.

## 9. Open decisions (for the founder)

- [ ] Which search engine backs discovery — the existing OpenAI web-search Responses pattern
      (as `business-search-engine.ts` already uses), or another? (Cede discovery to the frontier
      model; do not rebuild a scraper.)
- [ ] How aggressively to retire Greenhouse/Lever/Adzuna — delete, or keep behind a flag for any
      employer with a clean feed?
- [ ] Cost posture — weekly per-user web-search calls have real token cost; measure before pricing
      (consistent with `productionization_discussion.md`).
- [ ] Is `talk-first` surfaced as prominently as `apply`? (The thesis says it must be.)
- [ ] Weekly trigger model — confirm v1 is a manual "Run this week's search" action on the
      briefing page, with scheduled automation deferred until the engine is trusted (§8 step 6).
- [ ] Confirm the correction/outcome vocabulary for steps 7–8: per-recommendation overrides
      ("wrong — I applied", "already talked") plus applied / replied / interviewed / closed.

## 10. Part 7 surface (sketch)

The weekly Opportunities view is a **work queue, not a job board**:

- Run banner: "This week's search ran [date] · 14 real postings within 25 mi · 3 new,
  1 no-longer-visible · engine cost: N searches."
- One card per posting:
  - title + resolved employer (linked to its target-map entry)
  - true distance from the anchor + the locality query that found it
  - source URL + first-seen date + last-verified date
  - diff badge: NEW / OPEN / NO-LONGER-VISIBLE
  - recommendation chip — apply / talk-first / research-funding / skip — with named reasons
    (evidence ledger, conversation signals, 990 fields) and an inline "correct this" control
- Empty state is first-class: "No real postings matched this week's brief within your
  constraints. The brief searched these 6 localities; widen radius or comp range?" Never
  scraped-board filler, never invented listings.

## 11. Engineering disciplines (house rules, applied here)

- The brief assembler, posting-identity matching, and diff logic are pure, deterministic
  functions, unit-tested against fixture postings — no live search in the suite (same
  discipline as the existing test files).
- Every LLM step keeps its deterministic/degraded path: provider down or over budget → an
  honest empty state, never scraped-board filler, never invented listings.
- AI-derived fit reads are labeled with confidence and correctable; corrections persist.
- Cost is a requirement, not a report: caps and budgets are enforced in code before beta.
