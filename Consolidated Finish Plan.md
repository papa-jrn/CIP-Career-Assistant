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
7. **Historical contact metadata issue — current importer defect not reproduced (2026-10-26).**
   The October 21 stored-data observation was Eric Kidd's `contactTitle` "Managing Director, Custom
   Software" and `contactOrganization` "Senior Lead Programmer, Managing Directo". This was on the
   People/Follow-ups contact, not a job import. Both values look like title text; calling them
   "swapped" did not establish the original organization or where corruption began. Current LinkedIn
   CSV/XLSX parsing maps Company and Position by header, preserves quoted commas and long strings,
   and contains no 40-character cap. Contact feedback and display also retain the field mapping.
   Three focused fixtures pass, including reordered columns and values longer than 40 characters;
   the full contact-parser file passes all 40 tests. No production parser change is warranted from
   this evidence. The original export row and corresponding saved import/analysis are still needed
   to trace this particular historical record. Follow-ups prefers saved analysis matches, so a newer
   import alone does not prove what an older displayed analysis contained. Keep this as an unresolved
   provenance/data-correction item, not a confirmed current LinkedIn-import bug.
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
9. ~~**Follow Ups capture is gated behind a non-empty queue**~~ **FIXED 2026-10-26.** Both capture forms now render independently of the queue in the People Follow-ups view; signed-in users can capture a person not yet imported.

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

### D. Redesign delivery and remaining verification

- ~~**Imported-job slice** (Workbench §10 step 4)~~ **CORE FLOW IMPLEMENTED AND FOUNDER-REVIEWED 2026-10-23.**
  Import/dedupe, separate source checks and personal fit, additive correction, Workbench actions,
  source-grounded employer research, reversible archives/restores, and full fit assessment for searched
  jobs are implemented. Founder tested the assessment and completion flow, exposed calibration and
  evidence-recognition defects, and reviewed the improvements. The current rubric separates ability
  from pay/preferences, preserves complete resume context, asks about unknowns, and reuses user-stated
  experience corrections. Assessments show the familiar working animation and finish in place, with
  an explicit notice before lower-fit grouping on a later visit. AI failures remain unscored.
  Personal-fit provider calls have a 60-second limit; browser requests have a 90-second limit.
  **Section 7 still has broader open scope:** document attachments, independent checks of every
  supplied source, and further redirect/red-flag hardening. Founder review of this slice does not
  close the full acceptance plan, screen-reader testing, or scoring calibration across other users.
- **People consolidation — FOUNDER-REVIEWED 2026-10-26.** `/people` provides Connections and Follow-ups views; legacy routes preserve context. Founder approved switching between views and successfully saved a new conversation. Re-analysis of that note is not yet verified.
- **Import component extraction — DEFERRED 2026-10-26.** Founder reports roughly 11 successful LinkedIn imports. Extraction alone is not needed; revisit placement only if empty-account acceptance reveals a real usability problem.
- **Target workspace slices 1–2 are implemented** (Rethink §14), including saved user decisions and reversible exclusions. Compact dossier/status UI is founder-accepted. Broader workspace/discovery work remains deferred; exclusion/restore live acceptance is distinct from the reviewed Researching control.
- **Careers-page persistence — IMPLEMENTED; final live confirmation pending.** Saved choices now reach dossier links, web-search requests and guarded direct reads. Save/reload/search integration fixtures cover correction and no-page answers; see October 26 checkpoint below.

### E. Acceptance work still open

**Planned 2026-10-26: see section 4 for the accounts, the order, and what each pass proves.**

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

**Step 4 — Finish the redesign.** ~~(D)~~ **CLOSED 2026-10-26.**
Every agreed implementation slice is built and founder-accepted: core jobs (October 23), consolidated
People navigation/capture and compact employer dossiers/status access (October 26), careers-page
persistence through dossier links and both search paths, and the fit-summary boundary repair. The
founder saved real careers pages for employers discovery had failed to find one for, confirmed they
were retained, and ran a further weekly search.

Closed with two gaps stated rather than resolved, because closing a step on an inference is how a
feature nobody has watched work reaches beta:

- **The saved careers URL steering the search is confirmed by fixtures, not by a live run.** The
  October 26 search returned nothing from the two employers whose pages the founder had supplied.
  The founder checked both pages by hand and there was genuinely nothing fitting, so the *outcome*
  is correct either way - but "nothing found" is equally consistent with the run reading the saved
  page and with the run never using it. The run's stored coverage (`careersPageUrl` per employer,
  shown in "What was checked") can still settle this for free, with no new run.
- **Exclusion and restore (§14 slice 2) has no signed-in acceptance.** It has only ever been seen
  rendering "Excluded (0)". The reviewed status control is a different path.

Import-component extraction is deferred unless empty-account acceptance identifies a real usability
problem. The historical contact-metadata issue is not a reproduced current importer defect; keep its
provenance/correction backlog separate from an unnecessary importer rewrite. Broader target workspace
work remains deferred. Both gaps above carry into Step 5, whose live passes exercise the search and
the workspace anyway. Formal end-to-end acceptance belongs to Step 5.
**Step 5 — Acceptance.** (E) **Planned 2026-10-26 — see section 4, "Step 5 acceptance plan".**
Two live passes, first use on an empty account, induced failure and retry, screen-reader. These need
steps 1–4 to be meaningful, because they test the loop end to end. Step 5 is also the first time the
product is used by someone who is not the founder, which is a larger change in test conditions than
the item list suggests.

**Step 6 — Launch gates.** (G)
Hosted migrations, restore the run cap, secrets to runtime, Vercel adapter, cost model, sign-up
lockdown, audit items, repo move. Then, and only then, Phase 14 invite-only beta.

**Deliberately deferred:** Phase 7 lane infrastructure, Phase 9 game-dev lane, Phase 11 outreach
briefs, Phase 10 beyond slice 1. All are real and none blocks beta with a single lane working well.
Lane infrastructure becomes urgent the moment a second structurally different lane is promised to
someone else.

---

## 4. Step 5 acceptance plan

Written 2026-10-26, when Step 4 closed. Everything built so far has been validated against one
person's data: the founder's. Three of the five acceptance items do not need that to change, but the
one that does is the one that matters most, and the decision below goes further than the item list.

### 4.1 The accounts

**Account A — the founder's.** Real history, known-good expectations, three concentrated lanes
(technology executive, nonprofit executive, education). Best for anything where the tester needs to
recognise a wrong answer on sight.

**Account B — the founder's wife's existing account.** Chosen deliberately over an invented persona:
real messy data beats a fixture, and this account already exists from Spring 2026, when the app
produced resumes and little else. Her background spans five strands - database/SQL work, user
support, fundraising, financial advising, and now high-school teaching.

Two properties make this account unusually valuable:

- **Her Spring records are the first legacy data this codebase has ever read.** Several migrations
  and the whole de-founder pass landed after they were written. Read-path failures on
  old-shaped records are expected here, are findings rather than setbacks, and could not be obtained
  from a fixture.
- **One of her five strands is in-lane and four are not**, which gives the lane-coverage test a
  built-in control (see 4.4).

She is a participant, not a data source: the import runs under her login, not the founder's, so her
contacts - real third parties - do not land in account A.

**Account C — a genuinely empty alias.** Account B cannot serve the first-use item because it
already holds Spring data. A `+alias` address is a distinct identity to Supabase and arrives in the
founder's inbox, so the magic-link round trip works without a second mailbox.

### 4.2 The passes, and what each one actually proves

1. **Live loop pass, twice (Rethink §15.3), account A.** Baseline run; change a constraint; re-run;
   trace the change through brief, search, observations and result. Must include a zero-result path
   and a failure path. *Proves:* the loop propagates a change rather than recomputing from scratch.
   Needs account A because recognising a wrong trace requires knowing the right one.
2. **Second-user pass, account B.** Import her network, capture a conversation, run a search, assess
   a fit, set an employer status. *Proves:* the product works for someone who is not the founder -
   and, incidentally, that RLS isolates two real concurrent users, which nothing has ever tested.
3. **First use, account C.** Sign up and get to a first useful output with nothing stored.
   *Proves:* the empty-account path is navigable. This is the pass that decides whether import-first
   placement needs revisiting; import-component extraction was deferred on 2026-10-26 pending
   exactly this evidence.
4. **Induced analysis failure and retry**, either account. Force a failure (an unreachable page, a
   missing key, a malformed upload) and retry. *Proves:* the deterministic fallbacks and retry paths
   behave as the integrity rules require, and that failure is stated rather than hidden.
5. **Screen-reader pass**, either account. *Proves:* the redesigned surfaces are operable
   non-visually. The accessibility review was static; this is the first assistive-technology run.

### 4.3 Carried in from Step 4, to close here

- **A saved careers URL steering the search is fixture-evidenced only.** The 2026-10-26 run returned
  nothing from the two employers whose pages had just been supplied; hand-checking confirmed there
  was nothing fitting, so the outcome was right, but an empty result cannot distinguish the run
  reading the saved page from the run never using it. The stored coverage (`careersPageUrl` per
  employer, surfaced in "What was checked") settles it at no cost.
- **Exclusion and restore (§14 slice 2) has no signed-in acceptance**, having only ever rendered
  "Excluded (0)".

### 4.4 Lane coverage: what to expect, and what not to fix

`ROLE_FAMILIES` (`strategic-state.ts`) still recognises three families - the founder's. Phase 7 lane
infrastructure is not started. Nothing crashes outside them: matching falls back to token overlap,
which needs two or more shared significant title tokens, so near-miss titles fail quietly.

| Account B strand | Expected lane match | Why |
| --- | --- | --- |
| High-school teacher | **education** | `teacher` trigger, and `teacher`/`instructor` are synonyms |
| Database / SQL | none | tech triggers require CTO/CIO/director-of-technology titles |
| Fundraising | none | nonprofit_exec requires ED/CEO/managing-director titles |
| User support | none | no family covers it |
| Financial advising | none | no family covers it |

**Superseded 2026-10-28 - the premise above was wrong.** It assumed that a persona with an in-lane
job *title* yields an in-lane *lane*. Lanes are derived from evidence weight, not from current
occupation, so a title predicts nothing about what the analysis produces. Account B's run proved it:
she is a current high-school teacher and no education lane arrived at all (see the October 28
finding below). Picking a control by title does not work; the only reliable in-lane reference is an
account whose *evidence* is concentrated in a recognised family, which in practice means account A.

Her breadth still stresses single-best-lane assignment and its tie-break, which three concentrated
lanes never did - "program director" is an education synonym and a fundraising title, so leakage is
plausible.

**These are Phase 7 findings, not Step 5 defects.** Widening `ROLE_FAMILIES` mid-acceptance would
destroy the evidence the pass exists to collect. Record what degraded and how badly; size Phase 7
from it afterwards.

### 4.5 Recording findings

For each pass record: what was done, what the product claimed, what was true, and whether the gap is
a defect, a known deferral, or an integrity violation (§8/§19 - fabricated data presented as real,
unlabelled AI output, a missing confidence, a bare score where a recommendation belongs). Integrity
violations stop the pass; the rest are logged and triaged after it.

Run cost is real: account B's searches and fit assessments spend API budget on top of account A's,
and `JOB_SEARCH_MAX_RUNS_PER_WEEK` is unset, so the normal weekly cap applies per user rather than
founder-dev's disabled one.

### 4.6 Order

Pass 1 on account A first - cheapest, and it establishes what correct looks like. Then pass 2 on
account B, which is where the real unknowns are. Then pass 3 on account C. Passes 4 and 5 can go on
either account at any point after pass 1. Step 5 closes when all five are recorded and the two
Step 4 carry-ins are confirmed.

---

### Step 5 finding — 2026-10-28: no education lane for a current teacher (account B)

Founder ran a full pass on account B at home. She currently teaches high-school agriculture and
botany (about one year) against 30+ years of operations and management in and around nonprofits. The
analysis weighted the operations evidence far above the teaching and produced an operations /
nonprofit direction, with her agriculture and botany teaching bridging towards agricultural
nonprofits. **No education lane arrived.** The founder found this mildly surprising but agreed with
it on the arithmetic.

**Assessed as correct behaviour, and recorded as a positive.** The analysis is evidence-weighted
rather than recency-weighted. A system that anchored on current occupation would have pointed a
30-year operations leader at teaching vacancies. Bridging botany teaching to agricultural nonprofits
is synthesis rather than keyword matching.

**It is not a breach of the portfolio contract.** `advisor.ts` instructs the model to keep up to
three working directions and forbids *omitting* existing supported lanes when a new priority
reorders them. On a first analysis there were no existing lanes to preserve, so three stronger
directions legitimately filling the portfolio is within the contract.

**What this invalidated.** Section 4.4's lane-coverage control (see the superseded note there).

**Open against this run - to be filled from the founder's record, not inferred:**

- **The top lane's exact role text.** `ROLE_FAMILIES`'s nonprofit family matches only
  `executive director`, `chief executive`, `ceo`, `managing director`. "Nonprofit operations",
  "operations director", "program director" and "development director" all miss. If her lane was
  phrased in operations terms it missed too, which would mean **zero in-lane coverage across two
  real users** - a far stronger input to sizing Phase 7 than either run alone.
- **Whether education was disclosed as considered and outweighed, or simply absent.** The ranking is
  defensible; silence about the ranking is not. If nothing stated that one year of teaching had been
  weighed against thirty years of operations, that is a disclosure gap under §8/§19 rather than a
  ranking defect. The founder's reaction - agreeing with the result while finding it surprising - is
  the symptom of exactly that gap.
- **Whether agricultural *sector* experience was asserted anywhere.** Teaching botany is a fair
  bridge to agricultural nonprofits; claiming she has agricultural operations experience would be
  fabrication. The Morgan fixture guards the same line ("climate interest must not become invented
  domain experience"); apply it retroactively here.

**Structural observation.** There appears to be no control that lets a user *assert* a lane. Her
routes to influence the portfolio are supplying more evidence or asking a strategic question;
`changeLog.directionChanges` reports the analysis's own revisions, not a user preference. A product
that resists wishful thinking may well be right to work this way, but it should be a recorded
decision rather than an absence.

### Morgan fixture: not adjusted, deliberately (2026-10-28)

Considered and rejected changing Morgan's resume so lanes would match. All five of Morgan's candidate
directions (senior technical program manager, platform program manager, product operations,
engineering leadership, technical program management) miss all three families, verified against the
trigger expressions. Editing the resume to fix that would be tuning the fixture until the product
passes - the exact practice the fixture's own instructions forbid - and would invalidate an answer
guide calibrated against this resume. Two independent out-of-lane runs (B real and messy, Morgan
synthetic and controlled) plus account A as the in-lane reference is the stronger evidence base.

One real gap in the fixture, noted rather than patched: Morgan has no recency-versus-depth conflict
(twelve years pointing one way, same employer since 2018), so Morgan cannot exercise the weighting
that produced account B's most interesting result. That belongs in a later purpose-built fixture, not
in an edit to this one.

---

## 5. Honest notes on this plan

This is a reconciliation of plans against code, not a verification that every built feature works.
"Built" below the Autumn table means the code and its tests exist, not that it has been proven on
live data — Phase 8's 990 enrichment is the clearest example, built and tested but never run against
hosted Supabase because the migrations are unapplied.

Phases 3 and 4 are marked "built, not formally closed" because their own status blocks still say
"Started" and list next slices. Their remaining items are small; someone should decide whether to
close them or finish those slices rather than leave them ambiguous.

No estimate of effort is offered here. `Next Steps.md` already warns that this sequence is a few
weekends per step when done properly, and nothing found on 2026-10-21 makes that warning less true.

### October 22 follow-up: listing-check repair

Check listing now includes bounded, source-grounded employer research and business-consistency inference, with readable citations and explicit fallback. Careers-page links can corroborate script-only ATS listings without changing the separate direct verification state. Corrected the success redirect's query/fragment ordering and added independent progress cleanup. See the Workbench plan's imported-job employer corroboration repair entry for limits and live Vetcove evidence. Signed-in browser acceptance remains open; this does not close the broader launch gates.

### October 22: repeat-check reliability

Founder testing exposed an overly strict provider-source URL allowlist. That gate is removed in favor of actual guarded page reads, matching employer names, and grounded quotes; web-search execution is still required. Source punctuation differences and one failing read are handled independently. A failed recheck keeps the previous supported assessment visible with its date and a not-revalidated notice. See the Workbench plan's repeat-check follow-up for diagnostics and signed-in verification; this supersedes the earlier exact metadata-membership requirement.

A second repeat-click defect was also found: identical HX-Redirect destinations containing an anchor did not reload the page. Successful checks now include HX-Refresh: true. Full suite: 795 passed; final endpoint regression: 12 passed. The next founder button test is pending after the rebuild.

### Session checkpoint — 2026-10-22 evening

Founder reviewed the repaired listing-check flow and approved the compact employer-research presentation, then requested commit/push. This checkpoint includes the Workbench job-button spacing fix, grounded employer research, repeat-check refresh and failure-state repairs, and expandable business reasoning/source excerpts. Validation: full typecheck/test suite passed with 795 tests; the final refresh-header change passed all 12 endpoint tests; the final presentation SSR build passed. No production deployment was requested.

Resume next session with the Opportunities **Assess the fit** button. Review its current behavior on the genuine saved Vetcove job, the existing CIP career context and deterministic/AI paths, and the result/save/return experience. Keep personal suitability separate from employer corroboration and business consistency. Do not treat this checkpoint as founder acceptance of personal-fit results; that is the next work item.

### October 23: personal fit and reversible archives

Implemented structured comparison of imported job duties against all three saved lanes, the original resume/intake and selected broader CIP evidence. The optional 1–10 score is derived from grounded comparisons with explicit caps for exclusions, mandatory barriers, unresolved requirements and constraints. Missing evidence remains unknown; deterministic/provider-failure mode does not invent a score. Results retain recommendations, confidence, requirement distinctions, source quotations and correction controls.

Existing Not for me decisions now archive searched jobs. Imports have Active/Archived views and restore, using the existing disposition identity for URL jobs and additive career_sources events for pasted-only jobs. AI Skip suggestions do not archive. Historical capture and analysis remain intact. Workbench hides archived imports and shows saved fit scores. See the Workbench plan's October 23 entry for the analysis contract, source limits and verification status. No migration or deployment was performed.


### October 23: stricter personal competitiveness and searched jobs
Rubric 2 adds weighted core work, scope/seniority, domain and results, distinguishing concrete direct evidence from transferable/general claims. Separate resume readiness highlights context-only evidence. Shared full assessment now available on searched postings after guarded description reads; unreadable pages remain unscored. Below-6 results are collapsed and retained. Earlier generous scores require reassessment. No migration or deployment. See Employers-Opportunities Rethink.md for scoring and persistence contract.

October 23 follow-up: rubric 3 separates competitiveness from preference conflicts, distinguishes unknown evidence from confirmed barriers, and adds saved experience clarifications. Complete original resume context is sent alongside citation excerpts. Live SEO role correction used the founder's own stated SEO, WordPress, portfolio and Prouty/Luminate experience; the first revised assessment produced 8/10 while retaining below-floor salary advice. Full suite 846 passed; final version-display fix passed type checks and 46 focused tests.


### October 23 morning checkpoint
Founder reports the jobs functionality, completion UX and revised assessment now look substantially better and requested commit/push. This is acceptance of the reviewed jobs slice, not closure of all Step 4 redesign work or the separate Autumn Phase 4 weekly-diff briefing. Remaining work is listed in the Step 4 checkpoint above. No deployment or migrations were requested.

### October 26: employer status render-order repair
The new employer-status controls accessed the current-event map before initialization when rendering saved employer dossiers, causing HTTP 500 on a populated Employers page. Initialization now precedes rendering. Page-setup regression tests cover saved employers with and without a user status. Typecheck and all 917 tests passed; isolated SSR build passed. Founder confirmed the page works after the repair. No further migration is needed for this repair.


### October 26: employer dossier discoverability
Step 4 UI refinement: compact collapsed employer cards, prominent inline dossier accordion, direct status access, saved-status grouping, and neutral explicitly labelled action suggestions. Details and decision rationale remain inside each dossier. See Workbench Redesign Plan.md for the approved direction. No migration; **employer UI founder-accepted 2026-10-26**. Founder confirmed improved discoverability, reduced competing information, and saved Researching choices, then explicitly closed this slice.

### October 26: employer UI accepted; People consolidation implemented

Founder explicitly closed the compact employer dossier/status UI slice after using it and saving Researching decisions. That portion of Step 4 is COMPLETE. The employer target-event migration was applied by the founder, who reported successful SQL checks and working saved decisions; this does not establish that the other listed migrations have been applied.

The next slice now implements one `/people` destination with Connections and Follow-ups views, legacy-route compatibility, and conversation capture independent of an imported contact queue. TypeScript and all 920 tests passed; isolated SSR build passed. Built-app HTTP checks confirmed both views render with a single People heading and empty-state capture, and both old URLs preserve confirmation parameters on redirect. Signed-in populated-account review is pending. Next unfinished implementation item remains import-component extraction/first-use import ordering, followed by contact-title import diagnosis; Step 4 overall is still open.

### October 26: careers-page completion checkpoint

The agreed Step 4 implementation is ready for its final careers-page live check. Fixed saved-address propagation to the dossier Openings link and web-search request (the direct reader already had corrections), kept explicit no-page answers out of both direct-read paths, added same-dossier save confirmation/reopening and accurate not-yet-rechecked copy, and preserved additive history. See Workbench Redesign Plan.md for the exact contract, test coverage and founder checklist. No live paid search, migration, deployment, commit or push was performed. Step 4 is not declared closed before the final live check; Step 5 is the next phase of work after that confirmation.
Final automated validation for the careers-page checkpoint: TypeScript and all 931 tests passed; isolated Astro SSR build passed. Final signed-in careers-page acceptance remains pending; no push yet.

### October 26: fit-summary boundary repair during live review

Founder supplied a 600-character competitiveness summary ending mid-word. The length matches the provider summary schema ceiling; display does not truncate the saved string. Removed that tight provider bound, retained strict schema/token caps/local defensive validation and unscored fallback, rejected explicitly incomplete responses, and added an honest reassess notice to affected legacy summaries. Existing scores/comparisons/history remain intact. See Workbench Redesign Plan.md for details. Signed-in Acelero reassessment remains pending; Git push is still deferred until testing is accepted.
Fit-summary repair validation: TypeScript, all 935 tests and isolated SSR build passed. Restart the local server and reassess the affected job to obtain a new complete summary; the old missing ending cannot be recovered from saved text.

### October 26: founder testing accepted; Git checkpoint

Founder reports successful additional job-fit assessments and a complete fresh weekly search with good results, accepting the reviewed fit-summary repair and live assessment/search flow. Earlier employer UI and People navigation/capture acceptance stand. Formal Step 5 acceptance remains open, and the specific careers-URL correction scenario is not inferred from a generally successful search. Final code validation: 935 tests, TypeScript and isolated SSR build passed. This checkpoint is being committed/pushed under the founder's earlier instruction to push after testing; no deployment is part of it.

### October 26: Step 4 closed

The founder saved real careers pages for employers discovery had not found one for, confirmed the
addresses were retained, and ran a further weekly job search with new jobs appearing. Nothing
appeared from the two employers whose pages had just been supplied; the founder checked both pages
directly and confirmed there was nothing fitting there, and called the test positive. That judgement
is about the result, and the result is right.

Recorded precisely, because the distinction matters later: this establishes that saving a careers
page works end to end from the user's side, and that the search produces good results with the
saved addresses in place. It does not establish that the run read those specific saved pages, since
an empty result looks identical whether the page was read or never reached. The stored coverage for
that run still answers it at no cost.

Step 4's implementation work is complete and accepted. Carried into Step 5: live confirmation that a
saved careers URL reaches the run, and signed-in acceptance of exclusion/restore. Nine days of
building, testing and cleanup across jobs, employers, People and the search - the largest step in
the plan.

### Step 5 finding — 2026-10-27: Norwich border/radius employer-discovery failure

Account A founder tested employer discovery for Norwich, VT, radius 25 miles. The screenshot showed Geocodio's center at 43.7179,-72.3612 but only Norwich under nearby places, with an apparent in-radius Montpelier candidate and no Dartmouth entry among returned tracked results. This is an employer-discovery test, not yet the planned weekly job-search constraint-change trace.

Findings: Geocodio located the center correctly, while nearby towns depended on Overpass. A live diagnostic reproduced an Overpass timeout and HTTP 502; this UI did not disclose its center-only fallback. Unknown nearby states could also inherit the center state in generated queries. The 990 layer searched only the center state, and web employer candidates had no deterministic distance check before saving. Presenting them as within the radius was an integrity problem, not a deferred lane-family limitation. The Already tracked list covers only candidates actually returned by the bounded search; absence from it does not establish that Dartmouth was deduped incorrectly or deliberately excluded.

Implemented repair: bounded Geocodio batch reverse/forward recovery (32 sampled points, at most 16 locality geocodes), explicitly labelled limited coverage; Geocodio state verification for nearby places when configured; no guessed center-state inheritance; neighboring verified states included in nonprofit searches (up to four, with disclosed omissions); geocoded radius checks before web candidates are saved, outside results withheld and unknown locations retained with low confidence and explicit review notes. College/hospital queries now retain space under the query cap. UI shows locality states, incomplete-coverage warnings, location-check findings and a clearer tracked-results label. No hardcoded Norwich, Hanover or Dartmouth discovery rules.

Live data validation used the configured Geocodio key without OpenAI: Hanover's geocoded locality point was about 4.3 straight-line miles from the Norwich center, Montpelier's about 34.7. The final forced-map-outage recovery returned Hanover NH, West Lebanon NH, Lebanon NH and other real localities and generated Hanover NH employer queries. Sparse earlier samples missed Hanover; the final near-town ring was validated live rather than accepted on mocked fixtures alone. This confirms geographic input/recovery, not a full new employer search or exhaustive recall. Founder rerun of Norwich/25 miles remains pending. Step 5's original weekly-search propagation pass remains open.
Final Norwich repair validation: TypeScript and all 941 tests across 70 files passed; final isolated Astro SSR build passed. Forty focused geography/nonprofit checks also passed. Live Geocodio recovery and Hanover/Montpelier distance checks passed; the full employer-search rerun remains founder work. No migration, commit, push or deployment performed.

**People onboarding (2026-10-28)** — Before a saved network import or analysis exists, Connections opens with expanded networking guidance, followed by Add your network and Conversation notes. With an existing network, conversation capture leads and guidance moves to the bottom, collapsed. Lane validation now explains the path from importing contacts to choosing a person, asking for perspective, saving evidence, and revisiting the analysis. Trust boundary follows Ideal work filter and precedes Alumni data. Contact metadata alone does not validate a lane.


### October 28: live cross-border discovery acceptance and briefing wording
Founder reran employer discovery for Norwich VT / 25 miles. The result disclosed the nearby-town outage and limited Geocodio sampled recovery, included VT and NH localities, and returned Dartmouth College as already tracked alongside 13 other existing employers. This accepts the observed cross-border discovery/recovery and Dartmouth deduplication path; it does not establish exhaustive employer coverage or close the weekly-search constraint-change pass. Jen's network import and fresh job search also received positive founder review; remaining second-user acceptance actions are not inferred from that review.
The briefing button now reads Refresh strategy from saved data. Adjacent help, loading text and success confirmation distinguish refreshing the saved strategy from running a new job search and explain that search due dates stay unchanged.
### October 28 office handoff
Founder accepted the revised People introduction and import flow after using Jen's existing account, reviewing 17 suggested contacts and running another useful job search. Norwich/25-mile coverage and employer discovery have live acceptance, including NH localities, disclosed sampled fallback, and Dartmouth returned as already tracked. Strategy-refresh wording now explicitly distinguishes saved-data briefing generation from a fresh job search.

Resume Step 5 from a genuinely empty Morgan account using test-data/phase5-mountain-view/00-START-HERE-do-not-upload.txt. The six-file synthetic fixture includes a resume, career context, supporting evidence, 24-contact LinkedIn-style CSV and separate relationship context. Complete Direction before importing the network. Initial search constraints are Mountain View CA, 25 miles, and USD 150000 annual base salary. No Morgan account has been created or tested yet. The fixture's fictional affiliations and accomplishments are test inputs, not real employment or market evidence.

Step 5 remains open: weekly-search constraint propagation, empty-account first useful output, induced failure/retry, screen-reader use, employer exclusion/restore and saved careers-URL coverage still require recorded acceptance. Jen's conversation capture, fit assessment and employer-status actions are not inferred from network/search acceptance. No deployment or migration is included in this Git handoff. Automated validation already completed: typecheck and 941 tests passed, isolated People and briefing SSR builds passed, and the CSV passed 24-row uniqueness, column-mapping and serialization checks.
