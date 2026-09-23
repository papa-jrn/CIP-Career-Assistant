# Employers & Opportunities Rethink (Plan)

Status: **Plan, pre-build.** Set 2026-09-23. Companion to `Next Steps.md` (Rounds 1–3) and
`Project Plan Autumn 2026.md`. This document owns the redesign of **Part 6 (Employers)** and
**Part 7 (Opportunities)** now that the premise they were built on is obsolete.

Do not start building from this until it is reviewed. The conversation-note auto-extraction work
(the prerequisite that lets the loop fire from natural input) is being built separately and
first; this plan assumes it lands.

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

## 6. Integrity guardrails (non-negotiable, §8 / §19)

- **No fabricated listings, ever.** Every job shown carries a real source URL from the search;
  no invented postings, employers, salaries, or dates. This was the original failure that started
  the whole "no fake engines" rule.
- **Label AI-derived content** (fit reads, extracted signals) and show its confidence; let the
  user correct it.
- **Recommendation over score.** Never show a bare match number as if it were truth.
- **`talk-first` is a first-class outcome**, consistent with the product's relationship-first,
  anti-mass-apply thesis. The app should sometimes say "don't apply yet — have a conversation."

## 7. Worked example / acceptance test

The redesign is working when the Dartmouth Hitchcock scenario produces this, end to end:

> You logged a conversation: a friend at Dartmouth Hitchcock said they cut 400+ healthcare roles
> this week. Since then: **Dartmouth Health moved down** as a near-term target, and a **competition
> warning** is flagged for local healthcare-operations roles (a wave of experienced people just
> entered your market). Your **Program Operations lane is unchanged**, but this week's job search
> **de-prioritized DH-dependent roles** and surfaced 3 new openings within 25 miles of White River
> Junction at other employers, 1 marked *talk-first* because of a warm path. One role you saw last
> week has closed.

If the app can produce that from a pasted note — with no hand-coding of dropdowns — it is
decisively better than the monthly Claude prompt.

## 8. Phased build sequence (proposed)

0. **(Prerequisite, in progress) Conversation-note auto-extraction** — raw note → typed signals,
   so the loop fires from natural input. Without this, everything here still requires hand-coding.
1. **Search-brief assembler** — strategic state → structured search brief (includes geocoded area).
2. **Geographic grounding of search** — expand every search to the geocoded labor shed; rank by
   real distance.
3. **LLM-web-search job engine** — brief in → real postings with source URLs out; persisted.
4. **Weekly job diff** — new / open / closed / moved, wired into the briefing heartbeat.
5. **Evidence-grounded fit + recommendation** — apply / talk-first / research / skip, reasoned from
   the ledger; the "better-than-Indeed reality check."
6. **Outcome tracking** (Round 3 item) — applied / replied / interviewed / closed, so the loop
   learns what converts.
7. **Retire the dead-premise scrapers** once the engine above is trusted.

## 9. Open decisions (for the founder)

- [ ] Which search engine backs discovery — the existing OpenAI web-search Responses pattern
      (as `business-search-engine.ts` already uses), or another? (Cede discovery to the frontier
      model; do not rebuild a scraper.)
- [ ] How aggressively to retire Greenhouse/Lever/Adzuna — delete, or keep behind a flag for any
      employer with a clean feed?
- [ ] Cost posture — weekly per-user web-search calls have real token cost; measure before pricing
      (consistent with `productionization_discussion.md`).
- [ ] Is `talk-first` surfaced as prominently as `apply`? (The thesis says it must be.)
