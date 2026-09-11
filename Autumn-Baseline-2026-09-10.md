# Autumn 2026 Baseline — Phase 0 Record

Recorded: 2026-09-10

## Purpose

The Autumn restart plan (Project Plan Autumn 2026.md, Phase 0) requires the loop-failure
diagnosis to be proven on real data before and during the rebuild. This file is the baseline
record. Phase 1 (Kill Saturation-As-Shutdown) was implemented against this baseline on
2026-09-10.

## Evidence of the loop failure

### 1. Code trace (verified by direct reading, pre-repair)

- `src/lib/cip/evidence-sufficiency.ts` (old): `evidenceRound >= 4` alone forced
  `phase = "complete"`; `score >= 100 && evidenceRound >= 3` also forced it. Round counts
  were `prior analyses + 1`, so a user who re-analyzed a few times was permanently "complete."
- `src/lib/cip/advisor.ts` (old): in the "complete" phase, the model instruction became
  *"the evidence phase is complete; do not ask for more proof; opportunity-mapping questions
  only"* — the engine was instructed to stop engaging with new evidence.
- `src/pages/api/evidence/analyze.ts` (old): conversation notes were merged into
  `combinedEvidence` and counted by `calculateEvidenceSufficiency` — so adding a rich
  conversation pushed the user *deeper* into the "complete" shutdown.
- `conversation-notes.ts` `conversationNotesToEvidence()` (old flow): all notes were
  flattened into one generic Q&A inside a flat evidence array; no signal extraction.
- The advisor output schema had no "what changed" field anywhere, and nothing propagated to
  watched employers, lanes, or the briefing.

### 2. Founder live observation (2026-09-10)

- "View Career Report → Generate Weekly Snapshot" produced **no new information**.
- The last snapshot (~2026-08-03) was a near-duplicate of the 2026-07-06 snapshot.
- This duplication is expected old-code behavior: `weekly-strategy.ts` renders template
  strings from current row counts, so identical inputs produce identical snapshots forever.
- The founder stopped using the app after this period — the churn event recorded in
  Next Steps.md Round 3.

### 3. Database confirmation (Phase 0 script — CONFIRMED 2026-09-11)

Run output (via `scripts/phase0-baseline.mjs`, founder-executed with service role key):

**The smoking gun, exact and worse than expected:**

- Latest `evidence_analysis`: **2026-05-18T15:12Z**, `phase: "complete"`, score 170, with the
  old shutdown reason ("More standard proof questions are likely diminishing returns").
  Follow-up questions were already pure opportunity-mapping (target sectors, hybrid balance,
  LinkedIn connections).
- **Both saved conversation outcomes postdate the last analysis:**
  - "Pasted conversation notes" — 2026-06-15
  - "Notes with Vince Berk.docx" — 2026-08-06T15:47Z
  - `conversation_note_count` is null on every saved analysis: **the loop the product exists
    for never executed even once.** The notes were entered, and the surfaces pressed next
    (career report 15:48, weekly snapshot 15:51) are deterministic/templated and structurally
    could never reflect them. The advisor was never re-run after the conversations.
- **Weekly snapshots proven duplicate:** weeks 2026-07-06 and 2026-08-03 have byte-identical
  summary and next_actions (28 watched employers, **0 opportunity matches** — the board-based
  job pipeline produced nothing in its entire life).
- Record counts: 43 evidence responses, 2 conversation outcomes, 10 network analyses,
  3 resume drafts, 28 watched employers (Dartmouth Health, Dartmouth College, City of
  Lebanon, ...).

**New finding — profile stacking hazard:** analyses from 5/15 13:57 and 15:30 summarize
"Joshua Nelson … multimedia, web development, Executive Director of Claremont Community
Television"; analyses from 5/15 21:44 through 5/18 switch to "Jennifer Nelson … nonprofit
operations leader … Director of Operations." The 2026-08-06 career report reverted to a
Joshua summary. Cause: intake/analysis context is "latest saved wins," so multiple people's
(or multiple framings of a profile) silently overwrite each other. Decide before Phase 2:
single-person account (archive the other intake) or multi-profile support.

**Immediate implication with the repaired engine:** because both conversation notes are
newer than the 2026-05-18 prior analysis, the very next "Re-analyze" on the Evidence page
will process them as new signals (Vince Berk + the June notes), produce a "What changed"
banner, and retire the stale 5/18 opportunity-mapping questions. That is the exact moment
that failed in August.

## Before-state (to compare after the rebuild)

- Latest analysis: 2026-05-18, phase complete, score 170 (rounds had run out by mid-May).
- Snapshots: byte-identical across 7/6 and 8/3; 0 opportunity matches ever.
- Conversation outcomes: 2 saved, never processed by any analysis.
- Watched employers: 28 real Upper Valley / North Country institutions.

## Phase 1 changes applied (2026-09-10)

- `evidence-sufficiency.ts`: readiness is volume-based only. Round counts can never force
  "complete." Reasons reworded to "readiness, not a stop sign."
- `advisor.ts`:
  - `selectAnalysisTask()` (exported, pure): new conversation signals or new evidence
    answers always select the change-detection task, regardless of phase. Phase only shapes
    question style when nothing new arrived.
  - Mandatory `changeLog` output (hasChanges, summary, strengthened, weakened,
    newlyAnswered) added to the strict AI schema and the deterministic fallback.
  - Prior analysis (summary, positioning, roles, questions, ledger claims) is passed to the
    model for diffing; `change_contract` instructions forbid re-derivation when nothing is
    new and require plain honesty in that case.
  - Deterministic fallback: honest change log, signal-engagement question, signal ledger
    entries, conservative question-retirement heuristic.
- `analyze.ts`: loads the prior analysis, partitions evidence/conversation rows by
  `created_at` to compute "new since last pass," excludes conversation notes from the
  sufficiency count, allows conversation-only re-analysis, saves
  `new_conversation_signal_count` / `new_evidence_count`, and renders a
  "What changed since your last analysis" banner (with an honest no-changes state) as the
  first section of the readout.
- `evidence-builder.ts`: readiness "complete" no longer suppresses question cards when new
  signals exist.

## Regression coverage

`src/lib/cip/loop-repair.test.ts` (vitest, `npm test`) — 9 tests, all passing:

- Round counts alone never reach "complete" (the founder regression).
- Volume-based readiness still works, worded as readiness-not-stop.
- Task selection: signals force change detection at any phase; opportunity-mapping only when
  complete AND nothing new; standard task below saturation.
- Founder scenario end-to-end (deterministic): complete readiness + one weakening
  conversation → hasChanges, summary names the signal count and prior date, the first
  follow-up question engages the signals, the signal appears as ledger evidence.
- Honest "no changes" summary when nothing new arrived.
- Conservative retirement of prior questions the signals answer.
- First pass treated as baseline without fabricating a diff.

## Not yet done (per plan)

- ~~Confirm DB phase values~~ — done 2026-09-11 (above).
- Decide single-person vs multi-profile account handling (new finding; gate for Phase 2).
- Phase 2 (structured conversation outcomes), Phase 3 (propagation), Phase 4 (diff
  briefing), Phase 5 (de-founder pass), Phase 6 (wider test coverage).

## Root Cause Addendum — The Dead Buttons (confirmed 2026-09-11 22:xx)

Phase 0's live test surfaced a second, independent break that predates the loop rebuild:

- **2026-07-09 16:29** — commit 3a1805d re-enabled Astro `security.checkOrigin`.
- Astro's checkOrigin does a strict `Origin === request-URL-origin` compare. The node
  adapter builds the request URL origin from `PUBLIC_SITE_URL` (`http://localhost:4321`),
  so any browser on `http://127.0.0.1:4321` (what serve-local used to announce) got a
  silent **403 on every htmx POST app-wide**: evidence re-analysis, strategic review,
  conversation-note upload, snapshot generation.
- Empirically confirmed by curl: POST with `Origin: http://localhost:4321` → reaches the
  route (401 unauthenticated, as expected); POST with `Origin: http://127.0.0.1:4321` →
  403; no Origin → 403.
- This explains the intermittency: notes saved June 15 (pre-break) and Aug 6 (browsing
  localhost by luck); today's clicks on 127.0.0.1 all 403'd with no visible error.

Fixes applied:

- `src/middleware.ts` — loopback host normalization: GET/HEAD on `127.0.0.1:4321` 308-redirect
  to `http://localhost:4321`; state-changing methods get an explicit "open localhost" page.
- `scripts/serve-local.mjs` — binds/announces `localhost` so the served address is always
  the trusted one.
- `src/pages/evidence.astro` — on-page request-engine diagnostics (health chip, request-sent
  and error lines), plain-form POST fallback, and the prominent top-of-page re-analyze card.
- `src/pages/api/evidence/analyze.ts` — analysis can no longer fail silently: the
  deterministic fallback saves even when the AI pass throws.
