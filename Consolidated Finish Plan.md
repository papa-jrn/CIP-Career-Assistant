# Consolidated Finish Plan — 2026-10-21

One place to see what is actually built, what is outstanding, and the order to finish it. Built by
reading `Project Plan Autumn 2026.md`, `Autumn-Baseline-2026-09-10.md`, `Next Steps.md`,
`Employers-Opportunities Rethink.md`, `Workbench Redesign Plan.md`, and `productionization_discussion.md`
against the current code on 2026-10-21 (`dcc1f37`).

Where a claim below says *verified*, it was checked against the source, not taken from a doc. The
planning docs are accurate about what they built; they are stale about each other, because each one
stopped being updated when the next slice started. That is the main thing this document fixes.

---

## 1. What is actually done

**Autumn phases**

| Phase | State | Evidence |
|---|---|---|
| 0 — Restart baseline | Done | Baseline doc, loop failure confirmed on live data |
| 1 — Kill saturation-as-shutdown | Done | Milestone 1 smoke test passed 2026-09-11 |
| 2 — Structured conversation outcomes | Done | `conversation_outcomes` table, shared model, three capture surfaces |
| 3 — Propagation engine | Built, not formally closed | `strategic-state.ts` + propagation on save; own status still reads "Started" |
| 4 — Weekly diff briefing | Built, not formally closed | `weekly-strategy.ts`, `briefing_diff`, action queue; status reads "Started" |
| 8 — Nonprofit intelligence v0 | Built, unproven live | `propublica-990.ts`, `employer-financials.ts` + tests; hosted migrations not applied |
| 12 — Outcome tracking v0 | Partial | `posting-dispositions.ts` has watching/applied/talking/passed; no replied/interviewed/closed |
| 13 — Discovery + board retirement | Done | Board era archived; LLM web search + narrow direct reader live |

**Employers & Opportunities Rethink** — search brief, confirmed preferences, geographic grounding,
weekly search engine with per-posting verification, durable runs, posting identity across runs,
weekly diff, recommendation chips, user status, employer resolution, lane-aware discovery, parent-org
dedupe, ProPublica 990 discovery and enrichment with a per-employer Auto/Always/Never setting, and
target workspace slice 1 (read-only dossier cards).

**Workbench redesign** — navigation consolidation, the purple/slate visual system, the public landing
page, the Workbench action loop with durable outcomes, goal-to-strategy synthesis, lane continuity.
Founder accepted the visual slice on 2026-10-21 with the composite-artifact limitation recorded.

**Integrity (2026-10-21)** — the canned `data.ts` content is deleted and `/briefing` has an honest
empty state; the first item of section 2A is closed.

**People (2026-10-21)** — "met but not logged" fixed, user-correctable conversation contacts, every
saved conversation reachable for correction, Connections leading with the conversation loop,
compressed follow-up cards, one capture form with the detailed form behind a toggle.

---

## 2. What is outstanding

### A. Integrity bugs — the app currently says things that are not true

1. ~~**Canned founder content renders live.**~~ **DONE 2026-10-21.** `briefingItems`,
   `opportunities` and `recommendations` are deleted from `data.ts`, and `/briefing`'s no-snapshot
   branch now explains that no briefing has been generated yet and what produces one, instead of
   rendering four hardcoded strategy lines as if CIP had written them for the reader. Verified on the
   rendered page: the canned strings return zero matches. `data.ts` keeps `navItems` (live) and
   `intakeQuestions` (an unused but generic question list, left in place).
2. **Recommendation repair gate** (Workbench §8) — **diagnosed and four of six repaired 2026-10-21.**
   - ~~Duplicate hospital changes~~ **fixed**: `buildStrategicState` listed watched employers and
     employer candidates as separate deltas with no cross-list dedupe, so an organization that was
     both appeared twice.
   - ~~Duplicate Diak follow-ups~~ **fixed**: `buildFollowUpObligations` emitted one obligation per
     conversation record rather than per person. The original exact-title hypothesis was not the
     main cause - `dedupeConversationOutcomes` keys on `sourceRef`, which differs between a raw
     upload and its structured extraction, so both survived and each became an obligation.
   - ~~Raw conversation text instead of an objective~~ **fixed**: `loopback.ts` stored the entire
     note as `marketSignal` whenever extraction returned none, so raw text appeared wherever a
     finding belonged. The note is still kept verbatim in `rawNoteExcerpt`.
   - ~~Employer movement read as a strengthened lane~~ **fixed**: in `exploratoryLaneCap` the mere
     presence of `relatedEmployer` counted as strong support and exempted a speculative lane from
     the research cap. Naming an employer is employer context, not lane validation.
   - **CRNA opening in founder guidance** — appears structurally addressed by `assignPostingsToLanes`
     (commit f5ae4fd): each posting validates only the one lane its title fits best, and a posting
     below the match threshold is assigned to none. Not re-confirmed on live data; leave open until
     a briefing run shows it.
   - ~~**Old obligations resurfacing without a resolution path**~~ **DONE 2026-10-21.** A follow-up
     can be marked done or no longer needed on the Follow Ups page, under "What you promised", and
     reopened if closed by mistake. Resolution is an additive `follow_up_resolution` record, so the
     conversation is untouched: it stays as evidence and keeps scoring lanes and employers, and only
     the debt is closed. An obligation is identified by the conversation that created it -
     `sourceRef` where a save assigned one, otherwise the promise itself - so two different promises
     to one person stay separate, and a new promise made later is owed even if an earlier one was
     closed. An unrecognised state leaves the obligation open, because failing toward "still owed"
     is safer than telling someone a promise was kept. The key is length-bounded; an unbounded one
     would exceed the endpoint's cap and fail silently.
3. ~~**Eric Kidd's June conversation**~~ **RESOLVED 2026-10-21 — it was saved, and orphaned.**
   **The conclusion first recorded here was wrong and is corrected below.** The conversation had
   been saved in June as a `conversation_outcome` record with no contact name. Nothing displayed it:
   the recent-conversations list showed only five records and the queue drops outcomes named
   "Unknown contact", so a record attached to nobody was unreachable from every surface. It surfaced
   only once the "Every saved conversation" section listed records regardless of age and the list
   stopped being capped at five. The founder identified it on 2026-10-21 from a
   "Contact not identified — saved 6/15/2026" row.

   Root cause: extraction failed to name the contact at capture time, and nothing in the product
   ever showed a record that had no contact. The notes were never lost; they were invisible.
   Remaining: the founder re-entered the conversation on 2026-10-21, so two records now describe it
   (the June original, unnamed, and today's re-entry dated 6/12). Naming the original and removing
   one is user work, and there is currently **no way to delete a saved conversation from the UI** -
   an open gap.

   The earlier reasoning, kept because the mistake is instructive: The founder queried
   Supabase directly. Both Eric Kidd records are `network_feedback`; there is no
   `conversation_outcome` for him at all, and the six conversation records belong to other people.
   Every content field on the 2026-09-14 record is empty - `note`, `marketSignals`, `newLeads`,
   `compensationSignal`, `workModelSignal`, `cultureSignal`, `hiringSignal`, `warnings`,
   `promisedFollowUp` - and the only text anywhere is `decisionReason`, "Need to reach out for a
   follow up date." That much was accurate: those two feedback records carried no conversation
   content, and "Met - capture notes" was correct for them.

   The error was generalising from it. Having checked `network_feedback` and found nothing, the
   conclusion drawn was "the notes were never written" - a claim about all of storage, from a query
   covering one source type and one name. The June record was a `conversation_outcome` with no
   contact name, so a search by contact name could not have found it either. The lesson: when a
   query comes back empty, say what the query covered, not what exists.

   Worth recording: the proposed fix before seeing the data was to widen the content predicate to
   every text field. That would have cleared the prompt on the strength of a triage reason and
   asserted a conversation was captured when none was - the same failure class this gate exists to
   remove. Asking for the data first prevented it, and the widened-but-bounded predicate that
   shipped instead is still right.

   The orphaned record is also the strongest argument for the "Every saved conversation" section:
   the data-cleanup work surfaced a record that had been unreachable for four months.
4. ~~**Duplicate conversation records**~~ **INVESTIGATED AND FIXED 2026-10-21 — the bug was the
   reverse of the one assumed.** The suspicion was over-counting: a save writes to both the
   `conversation_outcomes` table and an additive `career_sources` record, and `loadStrategicState`
   unions the two. Tested directly: both copies parse identically, share a `sourceRef`, and already
   collapsed to one. No over-count.

   The real defect was silent loss. `dedupeConversationOutcomes` keyed on contact, date, lane and
   employer alongside `sourceRef`, so two genuinely different notes about one person on one day -
   which is every record older than `sourceRef` - produced the same key and one was discarded. A
   real conversation disappeared from lane scoring, employer scoring and the follow-up queue with no
   trace. Identity now comes from `sourceRef` where a save assigned one, and from what was actually
   said where it did not. Pinned by test, including that an identical record loaded twice still
   collapses and that two people sharing a date and lane are not merged.

   Separately: the Vince Berk pair is **not** a double count. Those are two real saves a month
   apart - an uploaded note on 2026-08-06 and a structured summary on 2026-09-14 - and whether they
   describe one conversation is something only the user knows. A card reading "2 conversations
   logged" is reporting the records that exist. Merging them would be guessing; if that becomes
   worth doing it needs a user-facing merge, not an automatic rule.
5. **The feedback content predicate was too narrow** — fixed 2026-10-21 as a separate, real gap
   found while investigating the above: `feedbackHasConversationContent` checked 4 of the 9 fields
   that carry conversation content, so someone who recorded only a hiring or compensation signal was
   still told to capture notes. It now counts all nine and deliberately excludes `decisionReason`,
   `nextAction` and `promisedFollowUp`, because a triage reason or an obligation is not a record of
   what was said.
6. ~~**Corrections are not read everywhere**~~ **DONE 2026-10-21.** Contact corrections now reach
   propagation and evidence re-analysis as well as Connections and Follow Up, so a corrected contact
   is the same person everywhere.

   Two things had to be handled. Propagation reads both stores and `dedupeConversationOutcomes`
   keeps the structured-table copy, which has no `career_sources` id for a correction to name - so
   correcting only the JSON copy would have had the correction silently thrown away by dedupe.
   Corrections are now keyed by the `sourceRef` the two copies share and applied to both. Evidence
   re-analysis reads the note as text, and the payload's `fileName` carries the contact
   ("Structured conversation with Unknown contact"), so the payload is rewritten before the advisor
   reads it; the conversation content itself is untouched, only who it is attributed to.

   `loadContactCorrections` is shared, so a new consumer picks corrections up by using it rather
   than by remembering to.
7. **Mis-parsed contact titles at import** — confirmed in the stored data 2026-10-21: Eric Kidd's
   record holds `contactTitle` "Managing Director, Custom Software" and `contactOrganization`
   "Senior Lead Programmer, Managing Directo", which are swapped, and the organization value is
   exactly 40 characters, cut mid-word. No 40-character cap exists anywhere in this codebase, so the
   truncation most likely arrived with the import source; the swap is still ours to trace.
8. ~~**No way to delete a saved conversation**~~ **DONE 2026-10-21.** A conversation can be removed
   from Connections, with an optional reason. It stops counting towards lanes, employers,
   follow-ups and evidence re-analysis, and stops appearing in the conversation lists.

   It is a recoverable removal, not a delete, and the UI says so: "It stays in your records and can
   be put back." Removal is recorded as its own additive record, like corrections, so the original
   conversation is never altered and removing the wrong half of a duplicate pair is undoable -
   which matters because that is exactly the situation that prompted this. Removed conversations
   live in a collapsed "Removed conversations" section with a Put this back control.

   A removal names a `career_sources` row, so it is also applied by `sourceRef` to the structured
   table copy that propagation keeps; without that a removed conversation would keep scoring lanes
   while showing as removed. Verified by simulating removal and restore through the real functions.

   Not done, and worth stating: there is no hard delete. A user who wants a conversation erased from
   storage rather than withdrawn from use still has no way to do that.
9. **Follow Ups capture is gated behind a non-empty queue** — a user with no imported network cannot
   capture a conversation there at all.

### B. Phase 5 — de-founder pass ~~(beta-blocking, barely started)~~ **DONE 2026-10-21**

Every row below was checked against the source and fixed, except where noted. Covered by
`src/lib/cip/de-founder.test.ts`, which contrasts the founder's own answers with a stranger's - a
nurse, a different university, a service club that is not Rotary - because before this pass the first
was handled and the second ignored.

| Location | Problem | Resolution |
|---|---|---|
| `advisor.ts` | greps for "military" and "executive director" to retire questions | replaced by `ANSWERED_BY_INTAKE`: a question is retired when the intake field that answers it is filled in, whatever the answer says |
| `advisor.ts` | skill-gap builder special-cased "military" | now asks for industries whenever `industry_preferences` is empty |
| `advisor.ts` | domain questions for AI/coding and video/story production | replaced with one domain-neutral question about the user's strongest public work |
| `advisor.ts` | stale-question guardrails cite "AI coding projects", "video/story production" | reworded generically; the specifics come from the user's own sources |
| `resume-assets.ts` | `inferEducation()` regex contains "dartmouth" | matches credential and institution words instead |
| `resume-assets.ts` | skills fallback padded with "AI adoption", "Product strategy" | the vocabulary now only ever *matches* the user's own material; nothing recognised means an empty skills section, not a plausible guess |
| `network-intelligence.ts` | BNI and Rotary named directly | `matchMembershipGroup` recognises service clubs, business networking groups, chambers, alumni communities, congregations, professional associations, board affiliations |
| `network-intelligence.ts` | **not previously catalogued:** a +6 score for notes mentioning the founder's own employers and projects ("world 2 systems", "zapdot", "guiding good", "lyndon institute") | replaced by a signal that is true for anyone: the user wrote substantive notes of their own about this person |
| `network-intelligence.ts` | **not previously catalogued:** warmth and relationship-context vocabularies containing "best coder", "top coder", "bni" | replaced with relationship words anyone might use |
| `source-analysis.ts` | **not in the original table:** infers "Executive Director" when the page mentions "claremont" | `findCorroboratedRole` claims a role only where the user's saved context and the source name the same title |
| `data.ts` | canned opportunities/recommendations/briefing items | deleted 2026-10-21 |
| `labor-market.ts` | hardcoded missing-skills list | obsolete - the file no longer exists |
| model tiering | every pass defaults to `gpt-4.1-mini` | **still undecided.** Not a de-founder item; a pricing and quality decision before charging money |

Found while doing this and **deliberately not fixed here:** `strategic-state.ts` `ROLE_FAMILIES`
recognises exactly three role families - technology executive, nonprofit executive, and education -
which are the founder's three lanes. A nurse, an accountant or a tradesperson matches none of them,
so lane scoring silently does less for them. Fixing it properly is Phase 7 lane infrastructure, which
the plan already says must not become a pile of per-lane special cases; bolting a fourth family on
here would be the thing Phase 7 exists to prevent.

`buildDeterministicSourceAnalysis` and `scoreContact` were exported so they could be tested at all.
Both were unreachable from tests, which is how the founder-specific heuristics inside them survived
this long.

### C. Phase 6 — state-layer tests ~~(beta-blocking, partial)~~ **the named gaps are closed, 2026-10-22**

Every item the plan named is now covered: CSV, XLSX and ZIP contact parsing, docx/RTF/JSON note
extraction, contact dedupe, network-feedback exclusions, evidence-sufficiency maths, and report
assembly. 663 tests across 40 files, up from 499. The parsers were exported so they could be reached
at all; being unreachable from tests is why none of them had one.

Security behaviours now pinned: a 40 MB zip bomb is refused *during* inflation rather than after, the
ZIP entry ceiling stops an endless archive, and one corrupt entry does not abort an import.

The Autumn 2026 loop failure has an explicit regression test: analysis-round counts must not move the
sufficiency phase, a high round count must not declare a thin profile complete, and an empty profile
stays in "building" however many passes have run.

Three real defects were found by writing these:
- RTF extraction stripped structural braces before decoding escapes, so braces a user typed in their
  notes came out as stray backslashes.
- Evidence sufficiency counted a link-bearing answer twice when resubmitted - once for the link, then
  again for its text - so resubmitting one piece of evidence inflated the score.
- Two more founder-specific heuristics the de-founder pass missed: `isSpecificPerson` blocklisted
  "dartmouth health" by name, and the relationship coaching detected a "local anchor cluster" by
  matching the founder's employer and towns, then named his institution back at the reader. Both now
  work from the user's own data.

Still untested, and not named in the plan's list: `advisor` (the model call paths), `job-search-engine`,
`job-verifier`, `ats-reader`, `business-search-engine`, `geography-engine`, `brief-loader`,
`analysis-review`, `profile`, `server-env`, `us-states`. These are either thin, or exercised
indirectly, or need network fixtures; none of them is a parser meeting a stranger's upload. The
founder's position, recorded 2026-10-22: the import path has worked across 11 real imports, and the
remaining validation that matters is beta users' data rather than more unit tests. These tests exist
to stop what works from breaking silently - the de-founder pass had already changed three of these
files with no way to tell.

### D. Redesign slices not yet delivered

- **Imported-job slice** (Workbench §10 step 4) — import a job found elsewhere, dedupe, verify the
  source, evaluate personal fit *separately*, save a correctable recommendation. The plan states this
  must land before the redesign can be called complete.
- **People consolidation proper** — Connections and Follow Up still exist as two routes under the
  People nav rather than one surface.
- **Import component extraction** — so first use can truly lead with import rather than it sitting
  below the loop.
- **Target workspace slices beyond slice 1** (Rethink §14), including how local-area businesses are found.
- **Remember each target's real career-page URL** and feed it back to the search and direct reader.

### E. Acceptance work still open

- Two live acceptance passes (Rethink §15.3): baseline run, change a constraint, re-run, trace the
  change through brief, search, observations, result. Include zero-result and failure paths.
- First use on an empty new account.
- A deliberately induced analysis failure and retry.
- Complete screen-reader testing.
- The composite design-comparison artifact — waived by founder review, not produced.

### F. Phases not started

Phase 7 lane infrastructure (no lane config exists; `ROLE_FAMILIES` in `strategic-state.ts`
recognises only technology-executive, nonprofit-executive and education roles - the founder's three
lanes - so any other career matches none, confirmed 2026-10-21), Phase 9 game-dev lane v0 (no references in the codebase), Phase 10 target
organization map beyond slice 1, Phase 11 evidence-to-outreach briefs (only
`/api/network/draft-message` exists).

### G. Operational and launch gates

- **Hosted migrations not applied.** Five-plus migrations must run against hosted Supabase before the
  990 and disposition features work there. Rethink §16 lists the order.
- **BETA-RESTORE:** the weekly search cap is disabled in founder dev (`JOB_SEARCH_MAX_RUNS_PER_WEEK=0`).
  Must be restored before beta.
- **The OpenAI key is copied into the server build** — move secrets to runtime reads before deploying.
- Vercel adapter swap; the in-memory rate limiter is weak on serverless.
- Cost per beta user; lock down sign-ups.
- Security audit `FirstPass-BetaCodeAudit.md` items #7 onward.
- Repo still lives on OneDrive; the decided move to `C:\dev` plus key rotation has not happened.
- CIP name and domain to be workshopped.

---

## 3. The order to finish

Sequenced so each step makes the next safer, and so nothing ships on top of something known to lie.

**Step 1 — Stop the product asserting false things.** (A1 done, A2 mostly done, A4, A5 remain)
~~Delete the canned `data.ts` content and give `/briefing` an honest empty state.~~ Done 2026-10-21.
~~Recommendation repair gate.~~ Four of six repaired 2026-10-21 with regression tests; one appears
already addressed and needs live confirmation; obligation resolution remains and needs persistence.
~~Duplicate conversation records (A4).~~ Done 2026-10-21 - the defect was silent loss, not
over-counting. ~~Routing corrections through propagation and re-analysis (A5).~~ Done 2026-10-21.
**Step 1 is complete** as of 2026-10-21, including conversation removal and obligation resolution.
Of section 8, five of six symptoms are repaired and the sixth (a CRNA opening in guidance) appears
structurally addressed but is not live-confirmed. Then the
duplicate conversation records and routing corrections through propagation and re-analysis. These are
integrity rules, not polish, and everything downstream inherits them.

**Step 2 — De-founder.** (B) ~~Mechanical, low-judgment, and it unblocks every later step.~~
**Done 2026-10-21.** Three heuristics that were not in the original table turned up during the pass,
all in the same shape: a vocabulary of the founder's own employers, phrases or hometown deciding a
score or an inference. Lane role families remain founder-shaped and are deferred to Phase 7.

**Step 3 — Test the parsers that meet strangers first.** (C) **Done 2026-10-22.** All named targets
covered against fixtures, no live AI. Three defects found and fixed in the writing, including two
founder-specific heuristics that survived Step 2.

**Step 4 — Finish the redesign.** (D)
The imported-job slice first, since the plan makes it a precondition for calling the redesign done,
then People consolidation and the remaining small bugs (A3, A6, A7).

**Step 5 — Acceptance.** (E)
Two live passes, first use on an empty account, induced failure and retry, screen-reader. These need
steps 1–4 to be meaningful, because they test the loop end to end.

**Step 6 — Launch gates.** (G)
Hosted migrations, restore the run cap, secrets to runtime, Vercel adapter, cost model, sign-up
lockdown, audit items, repo move. Then, and only then, Phase 14 invite-only beta.

**Deliberately deferred:** Phase 7 lane infrastructure, Phase 9 game-dev lane, Phase 11 outreach
briefs, Phase 10 beyond slice 1. All are real and none blocks beta with a single lane working well.
Lane infrastructure becomes urgent the moment a second structurally different lane is promised to
someone else.

---

## 4. Honest notes on this plan

This is a reconciliation of plans against code, not a verification that every built feature works.
"Built" below the Autumn table means the code and its tests exist, not that it has been proven on
live data — Phase 8's 990 enrichment is the clearest example, built and tested but never run against
hosted Supabase because the migrations are unapplied.

Phases 3 and 4 are marked "built, not formally closed" because their own status blocks still say
"Started" and list next slices. Their remaining items are small; someone should decide whether to
close them or finish those slices rather than leave them ambiguous.

No estimate of effort is offered here. `Next Steps.md` already warns that this sequence is a few
weekends per step when done properly, and nothing found on 2026-10-21 makes that warning less true.
