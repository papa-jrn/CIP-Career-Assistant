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

**People (2026-10-21)** — "met but not logged" fixed, user-correctable conversation contacts, every
saved conversation reachable for correction, Connections leading with the conversation loop,
compressed follow-up cards, one capture form with the detailed form behind a toggle.

---

## 2. What is outstanding

### A. Integrity bugs — the app currently says things that are not true

1. **Canned founder content renders live.** `src/lib/cip/data.ts:142` exports `briefingItems`, four
   hardcoded strategy lines written from the founder's profile, and `src/pages/briefing.astro:407`
   renders them to every user as app output. `opportunities` (match: 91, "Remote SaaS company") and
   `recommendations` in the same file are dead exports but still present. *Verified.* This is the
   single clearest violation of "no fabricated data presented as real" still in the product.
2. **Recommendation repair gate** (Workbench §8) — duplicate hospital changes, duplicate Diak
   follow-ups, raw conversation text instead of an objective, employer movement read as a
   strengthened lane, a CRNA opening in founder guidance. Concrete lead found 2026-10-21:
   `replaceConversationOutcome` dedupes by exact `title` match, so any variation in a contact's name
   spelling leaves the prior row behind and produces duplicates.
3. **Eric Kidd's June conversation** — unresolved. Six conversation records exist, five were ever
   displayed. The full list now shows every record so this can be identified or shown absent.
4. **Duplicate conversation records** — a raw upload and its structured extraction both count
   (the Vince Berk pair), so a logged-conversations count can overstate.
5. **Corrections are not read everywhere** — contact corrections apply on Connections and Follow Up;
   weekly strategy propagation and evidence re-analysis still read the extracted name.
6. **Mis-parsed contact titles at import** — Eric Kidd renders as "Managing Director, Custom Software
   at Senior Lead Programmer, Managing Directo"; title and company appear swapped and truncated.
7. **Follow Ups capture is gated behind a non-empty queue** — a user with no imported network cannot
   capture a conversation there at all.

### B. Phase 5 — de-founder pass (beta-blocking, barely started)

Every row below was checked against the source on 2026-10-21.

| Location | Problem | Status |
|---|---|---|
| `advisor.ts:688,697,699` | greps for "military" and "executive director" to retire questions | outstanding |
| `advisor.ts:218-219` | stale-question guardrails cite "AI coding projects", "video/story production" | outstanding |
| `resume-assets.ts:370` | `inferEducation()` regex contains "dartmouth" | outstanding |
| `resume-assets.ts:323-324` | skills fallback is founder-flavored ("AI adoption", "Product strategy") | outstanding |
| `network-intelligence.ts:712,715` | BNI and Rotary named directly in scoring reasons | partly generalized at :606, still hardcoded at :712/:715 |
| `source-analysis.ts:400-401` | matches "claremont" to infer an Executive Director title | outstanding, **not in the original table** |
| `data.ts:97-147` | canned opportunities/recommendations/briefing items | outstanding, and `briefingItems` is live |
| `labor-market.ts:261` | hardcoded missing-skills list | obsolete — the file no longer exists |
| model tiering | every pass defaults to `gpt-4.1-mini` | undecided |

### C. Phase 6 — state-layer tests (beta-blocking, partial)

499 tests across 30 files exist, but they cover the newer intelligence work. The parsers that will
meet strangers' messy data first are untested. **Untested modules:** `advisor`, `network-intelligence`,
`source-analysis`, `resume-assets`, `evidence-sufficiency`, `evidence-builder`, `career-report`,
`conversation-notes`, `intake`, `profile`, `job-verifier`, `ats-reader`, `business-search-engine`,
`geography-engine`, `job-search-engine`, `job-search-view`, `job-search-config`, `watched-employers`,
`brief-loader`, `analysis-review`, `resume-asset-context`, `goal-synthesis-view`, `server-env`,
`us-states`, `data`. Named in the plan and still missing: CSV/XLSX/ZIP contact parsing, docx/rtf note
extraction, contact dedupe, network-feedback exclusions, evidence-sufficiency math, report assembly.

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

Phase 7 lane infrastructure (no lane config exists; role families are hardcoded in
`strategic-state.ts:704`), Phase 9 game-dev lane v0 (no references in the codebase), Phase 10 target
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

**Step 1 — Stop the product asserting false things.** (A1, A2, A4, A5)
Delete the canned `data.ts` content and give `/briefing` real derived guidance or an honest empty
state. Then the recommendation repair gate, starting from the exact-title dedupe lead. Then the
duplicate conversation records and routing corrections through propagation and re-analysis. These are
integrity rules, not polish, and everything downstream inherits them.

**Step 2 — De-founder.** (B)
Mechanical, low-judgment, and it unblocks every later step: no later work has to reason about whether
a behaviour is the founder's or the user's. Add the structured intake fields the heuristics should
have been reading. Fix `source-analysis.ts` "claremont" along with the rest.

**Step 3 — Test the parsers that meet strangers first.** (C)
CSV/XLSX/ZIP, docx/rtf, dedupe, feedback exclusions, evidence-sufficiency, report assembly — written
against fixtures, not live AI. `Next Steps.md` is explicit that skipping this is how a beta burns its
first users, and steps 1 and 2 will have just touched this code.

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
