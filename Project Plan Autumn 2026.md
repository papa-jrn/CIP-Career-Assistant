# Project Plan Autumn 2026

Last updated: 2026-09-10

## Why This Plan Exists

This is not a tidy continuation of the Spring plan. It is a restart.

The Spring work produced a real foundation: intake, evidence records, linked-source analysis, lane-aware resume generation, network intelligence, employer discovery, live job search, follow-up workflows, and a deterministic report. But the app did not become the product it claimed to be. The founder ran the real test: he had high-value conversations, entered the learnings, re-ran the analysis, and the app did not meaningfully change its guidance. After that, he stopped using it for more than two months.

That is the product diagnosis.

CIP does not currently fail because the prose is not good enough. It fails because the app records learning without turning that learning into visible change. It behaves like a one-way funnel:

1. collect evidence
2. saturate evidence
3. declare the evidence phase complete
4. stop responding deeply to new information

The Autumn 2026 rebuild turns CIP from a saturating funnel into a loop.

The failure had a second face. The founder also expected CIP to go out and find new potential roles and employers every week when he ran it. It never did. Discovery depended on static job-board APIs (Adzuna plus configured Greenhouse/Lever slugs) that nothing ever scheduled and that pointed at the exact big-tech market he had already left. The app neither learned from him nor looked out for him. The Autumn rebuild retires the board pipeline and makes LLM-with-web-search the discovery engine, feeding the loop's memory.

The app must beat the founder's current alternative: a monthly Claude-with-web-search check-in plus his own memory. That benchmark matters. Claude can search the web well and will keep improving. CIP should not try to beat frontier models at generic research prose. CIP should win where a monthly chat structurally struggles:

- persistent structured memory
- conversation outcomes
- lane movement over time
- employer movement over time
- follow-up obligations
- confidence-labeled claims
- week/month-over-week deltas
- a visible explanation of what changed and why

The Autumn plan is therefore not "make the AI smarter." It is:

> Build the continuity layer that makes every conversation, employer discovery run, resume revision, and search pass change the next recommendation.

## Product North Star

CIP is an evidence-backed career search operating system for people who should not blindly compete in generic application piles.

It should help a user answer:

> Given who I actually am, who I know, where I live, what I will not do, what evidence I can prove, and what I learned from real conversations, where should I place the next five bets?

The app should optimize for:

- fewer, better applications
- conversation-led market learning
- persistent memory
- local and lane-specific intelligence
- transparent evidence and confidence
- target organization strategy
- weekly or monthly deltas
- human restraint

The app should avoid:

- mass apply workflows
- fake job discovery
- sponsored-listing incentives
- generic resume praise
- pretending active monitoring exists before adapters exist
- treating every contact as a referral path
- hardcoding the founder's biography into shared logic
- letting "evidence complete" mean "stop thinking"

## Strategic Decision

This plan chooses Option A from `Next Steps.md`: rebuild the analysis core from a saturating funnel into an actual loop.

Option B, treating CIP as a one-time career intelligence workup, remains legitimate in theory. But it is not the chosen path. The SaaS thesis only makes sense if the loop works. If CIP cannot show what changed since the last pass and what to do differently now, it does not have a reason to exist beyond a good LLM check-in.

## Definition Of Autumn Success

The rebuild is working when CIP can truthfully produce output like:

> Last month you thought AI operations strategist was the strongest lane. Two conversations weakened that title for Upper Valley nonprofits because local organizations do not seem to buy the work under that label. Those conversations strengthened program operations / digital systems lead and communications plus workflow modernization. Three target organizations moved up because of mission fit and warm paths. One employer moved down because salary plausibility looks weak. This month, do not apply broadly. Follow up with two people, rewrite the resume headline for nonprofit operations, and check these five employer-owned career pages.

This is the acceptance bar. Everything in this plan serves that moment.

## Phasing Overview

The implementation order matters.

1. Prove the loop failure on saved data.
2. Stop the saturation gate from shutting down new learning.
3. Make conversation outcomes structured.
4. Propagate conversation signals into lanes, employers, evidence, and briefings.
5. Build the weekly/monthly diff briefing.
6. De-founder the codebase.
7. Add tests for the state layer.
8. Build lane infrastructure for structurally different markets.
9. Add nonprofit/regional intelligence v0.
10. Add game-dev lane v0.
11. Add outcome tracking v0.
12. Retire job-board ingestion; add LLM web-search discovery and employer-direct monitoring.
13. Prepare for invite-only beta.

Each phase below lists the goal, implementation steps, acceptance criteria, and notes.

---

# Phase 0 — Restart Baseline

## Goal

Create a factual baseline before changing the system. Confirm the Round 3 diagnosis against the founder's saved data, then preserve the findings as the starting point for the rebuild.

## Steps

1. Inspect recent `evidence_analysis` records for the founder.
2. Confirm whether the latest failed runs stored:
   - `evidence_sufficiency.phase`
   - `evidenceRound`
   - `conversation_note_count`
   - advisor summary and follow-up questions
3. Verify whether the founder's breakthrough conversation notes were flattened into generic evidence.
4. Record the specific before-state:
   - latest lanes
   - watched employers
   - latest briefing
   - latest evidence analysis
   - conversation note count
5. Add a short "Autumn baseline" note to the planning docs or an internal audit file.

## Acceptance Criteria

- The diagnosis is confirmed or corrected from actual saved data.
- The team knows whether the latest failed run was in `phase: complete`.
- The founder's loop-failure case becomes a regression target.

## Notes

Do this before any architectural changes. The rebuild should begin from proof, not vibe.

---

# Phase 1 — Kill Saturation-As-Shutdown

## Goal

Stop the current evidence sufficiency model from making the app less responsive as the user provides more useful information.

## Problem

Current behavior treats enough evidence as a reason to stop gathering proof and move to generic opportunity-mapping questions. That was reasonable when the product was a one-time evidence workflow, but it is wrong for a loop.

New conversations should reopen analysis. They should not push the user deeper into "complete" and reduce responsiveness.

## Steps

1. Redesign evidence sufficiency semantics.
   - Keep evidence sufficiency as "enough to act," not "stop thinking."
   - Rename or reinterpret phases if needed.
   - Ensure a new conversation outcome can trigger a fresh strategic pass even when evidence is otherwise complete.

2. Update `src/lib/cip/evidence-sufficiency.ts`.
   - Remove logic where repeated rounds alone force "complete" in a way that suppresses engagement.
   - Separate `evidenceReadiness` from `analysisMode`.
   - Add a concept like `hasNewStrategicSignals`.

3. Update `src/lib/cip/advisor.ts`.
   - Remove instructions that cause complete-phase analysis to ignore new evidence.
   - Make "what changed" an explicit output requirement.
   - Keep claim safety and evidence grounding.

4. Update `src/pages/api/evidence/analyze.ts`.
   - Detect new conversation outcomes since the last analysis.
   - Pass those signals separately from ordinary evidence answers.
   - Do not let conversation count inflate a shutdown threshold.

5. Add regression coverage for the founder failure.
   - Scenario: high evidence count + phase complete + new conversation weakening a lane.
   - Expected: analysis produces explicit delta and changed recommendation.

6. Decide per-task model tiers.
   - Model, provider, and token budget become per-pass configuration, not one global default.
   - Cheap extraction and classification passes can run on small fast models; strategist synthesis, loop deltas, and discovery passes need stronger tiers.
   - The current implicit default (`gpt-4.1-mini` everywhere) is a placeholder that was never actually chosen.
   - Write the decision down and revisit it at beta pricing.

## Acceptance Criteria

- New conversation input triggers analysis even when evidence is mature.
- Evidence sufficiency no longer suppresses new strategic learning.
- The advisor can say what changed, what weakened, what strengthened, and what to do next.
- Per-pass model tier and provider are explicit, recorded configuration decisions.

## Notes

This is the first true rebuild step. Do not bury it under employer features. Without this phase, every later intelligence layer feeds a broken loop.

***This looks to have been completed. We have smoke tested it, and performed to re-analyze rounds. The first one was the most important take data and conversations that I had with two colleagues and adding that to my CIP analysis. It actually shows a couple of changes I should make as I move forward.

Furthermore we went in and updated some data on the SUPABASE database, this allows Supabase to send more than 2 emails an hour. The email is now linked to my beebalmproductions.com email and works like a charm.

---

# Phase 2 — Structured Conversation Outcomes

## Goal

Turn conversation notes from blobs into first-class strategic signals.

## Current Problem

Conversation notes are saved and can be included in analysis, but they are flattened into undifferentiated text. The app cannot reliably know which lane, employer, compensation assumption, or follow-up obligation changed.

## Data Model

Add a structured conversation outcome model. This can begin as JSON inside `career_sources` or as a dedicated table. A dedicated table is likely cleaner once the shape stabilizes.

Suggested fields:

- `user_id`
- `contact_name`
- `contact_organization`
- `contact_title`
- `conversation_date`
- `source_note_id`
- `related_lane`
- `related_employer`
- `signal_type`
- `signal_direction`
- `confidence`
- `compensation_signal`
- `work_model_signal`
- `culture_signal`
- `hiring_signal`
- `market_signal`
- `new_leads`
- `warnings`
- `promised_follow_up`
- `follow_up_due_date`
- `next_action`
- `raw_note_excerpt`
- `created_at`
- `updated_at`

Signal direction should include:

- `strengthens`
- `weakens`
- `neutral`
- `unclear`
- `contradicts`

Signal type should include:

- `lane_fit`
- `employer_fit`
- `compensation`
- `hiring_process`
- `culture`
- `network_path`
- `role_language`
- `dealbreaker`
- `new_target`
- `follow_up_obligation`

## Steps

1. Add schema migration.
2. Update follow-up forms to capture structured fields.
3. Update loop-back import to parse or ask for structured conversation metadata.
4. Add deterministic parsing helpers for old notes.
5. Add AI-assisted extraction only as an enhancement, not the source of truth.
6. Display conversation outcomes on the Follow-Up page.
7. Add edit/correct controls so the user can fix extracted signals.

## Acceptance Criteria

- A user can record that a conversation weakened one lane and strengthened another.
- A user can tie a conversation to a target employer.
- A follow-up obligation can appear later in the briefing.
- The app can distinguish "interesting note" from "strategic signal."

## Notes

The UI should stay small. The user should not feel like they are filling out a CRM after every conversation. Start with a compact "what changed?" form and optional details.

## Autumn 2026 Status

Phase 2 is complete and smoke tested.

Implemented:

- Dedicated `conversation_outcomes` table and migration.
- Shared structured conversation outcome model.
- Follow-Up capture for lane, employer, signal type, signal direction, confidence, market/comp/work/culture/hiring signals, warnings, promised follow-up, and next action.
- Network loop-back capture for advisor conversations and structured summaries.
- Evidence-page capture for GitHub repositories, project proof, CCTV updates, grants, annual-report context, and other corrected work facts.
- Conversation outcomes now feed evidence re-analysis as first-hand strategic signals.
- Smoke-test fix: structured summaries save even when the user has no separate pasted/uploaded full notes.

Remaining polish can move into later phases: compact editing controls, AI-assisted extraction from old unstructured notes, and richer conversation-history displays.

---

# Phase 3 — Propagation Engine

## Goal

Make saved learning change the rest of the app automatically.

## Current Problem

The app records conversation outcomes, employer candidates, evidence, and network feedback, but the records do not reliably propagate. The user must manually rerun analysis, and even then many surfaces do not change.

## Design

Create a propagation layer that recalculates strategic state when meaningful inputs change.

Initial propagation targets:

- lane rankings
- watched employer priority
- employer candidate recommendations
- follow-up queue
- briefing deltas
- resume lane recommendation
- evidence ledger notes

## Steps

1. Create a shared strategic state loader.
   - Latest intake
   - Latest advisor analysis
   - latest structured conversation outcomes
   - watched employers
   - employer candidates
   - network feedback
   - latest network analysis
   - outcome tracking records

2. Create a lane scoring module.
   - Evidence support
   - conversation direction
   - network support
   - employer availability
   - compensation plausibility
   - user interest / exclusions

3. Create an employer recommendation module.
   - Evidence fit
   - mission fit
   - lane fit
   - network proximity
   - hiring confidence
   - salary plausibility
   - dealbreaker risk
   - next move

4. Trigger propagation after:
   - conversation outcome save
   - network feedback save
   - employer discovery save
   - evidence analysis save
   - resume lane selection
   - outcome tracking update

5. Save propagated state as additive snapshots.
   - Do not silently overwrite history.
   - Store why scores moved.

## Acceptance Criteria

- A conversation outcome can visibly move a lane up or down.
- A conversation outcome can visibly move an employer up or down.
- A briefing can read changed rankings without manual re-analysis.
- Each movement has a short explanation.

## Notes

This is where CIP starts to beat the monthly Claude routine. Claude can search; CIP remembers and updates.

## Autumn 2026 Status

Started.

First implementation slice:

- Shared strategic-state module.
- Lane scoring from advisor lanes, network validation, and structured conversation outcomes.
- Employer scoring from watched-employer fit plus conversation outcomes.
- Weekly briefing snapshots now save propagated lane/employer movement into the evidence payload.
- Briefing page now surfaces "What changed" from propagated state.

Second implementation slice:

- Trigger propagation immediately after key saves instead of only when generating a briefing.
- Conversation loop-back saves refresh the strategic snapshot.
- Follow-up conversation outcome saves refresh the strategic snapshot.
- Evidence re-analysis saves refresh the strategic snapshot.
- Employer promotion into watched employers refreshes the strategic snapshot.
- Conversation-origin lanes now remain visible as research lanes even before advisor analysis promotes them.
- Opportunities now reads propagated lanes as well as raw advisor lanes, so emerging lane search chips line up with briefing state.

Third implementation slice:

- Follow-Up now turns saved conversation outcomes with named contacts into queue contacts, so people like Alex Herzog do not disappear just because they entered through conversation notes instead of an import.
- Network now shows a current conversation-informed strategy memory above the older saved import analysis.
- Network lane prompts now prefer propagated strategic lanes, not stale `network_analysis` lane validations.
- The older saved network analysis is explicitly labeled as an import-based snapshot, with a stale-data warning when newer conversations exist.

Next slice:

- Add employer-candidate recommendation movement, follow-up obligations, and resume lane recommendation movement.
- Add a clearer explanation of strategic lane scores so the numbers feel interpretable rather than arbitrary.
- Store richer movement history once the current snapshot shape proves useful in smoke testing.

---

# Phase 4 — Weekly / Monthly Diff Briefing

## Goal

Make the briefing the heartbeat of the app.

## Current Problem

The current weekly snapshot mostly counts employers and opportunity matches. It does not compare against the prior period or explain movement.

## New Briefing Structure

The briefing should include:

- period covered
- top 3 to 5 recommended actions
- what changed since last briefing
- lanes strengthened
- lanes weakened
- employers moved up
- employers moved down
- contacts needing follow-up
- overdue promises
- new leads
- stale assumptions
- resume or outreach asset changes needed
- evidence gaps that still matter
- job/employer checks worth doing

## Steps

1. Redesign `career_strategy_snapshots`.
   - Add fields for lane snapshot, employer snapshot, contact obligations, deltas, and action items.

2. Update `src/lib/cip/weekly-strategy.ts`.
   - Load previous snapshot.
   - Compare lane scores.
   - Compare employer scores.
   - Compare contact follow-up state.
   - Compare outcome records.
   - Generate specific deltas.

3. Update `src/pages/briefing.astro`.
   - Make "what changed" the first section.
   - Put counts lower on the page.
   - Show action items as the main work queue.

4. Add empty states.
   - If no prior snapshot exists, call it a baseline.
   - If no conversation outcomes exist, recommend a market-read action.

5. Add tests for diff behavior.

## Acceptance Criteria

- The briefing names at least one real change when conversation outcomes exist.
- The briefing can say "nothing changed" honestly when nothing changed.
- The briefing produces 3 to 5 concrete next actions.
- The briefing becomes useful even if no new job listings were found.

## Notes

Use "weekly" in the code only where needed. The product rhythm may be weekly or monthly. The logic should support either.

---

# Phase 5 — De-Founder Pass

## Goal

Remove founder-specific hardcoding so the app can serve other users and parallel lanes.

## Steps

1. Remove biography-specific heuristics from `advisor.ts`.
   - No hardcoded "military."
   - No hardcoded "executive director."
   - No founder-specific stale-question guardrails.

2. Replace biography-specific checks with structured data.
   - `industries_excluded`
   - `affiliations`
   - `sensitive_claims`
   - `public_claim_boundaries`
   - `role_exclusions`

3. Remove founder-specific education parsing from `resume-assets.ts`.
   - No hardcoded Dartmouth.
   - Use generic education / credential parsing.

4. Remove founder-flavored fallback skills.
   - Do not pad with generic AI/product terms.
   - If evidence is thin, say evidence is thin.

5. Replace hardcoded missing-skills list in `labor-market.ts`.
   - Extract requirements from job descriptions.
   - Diff against evidence-backed skills.

6. Delete or quarantine canned founder output in `src/lib/cip/data.ts`.
   - Demo data must never appear as user-facing personalized output.
   - If fixtures are needed, move them to test fixtures and label them.

7. Generalize network context rules.
   - Relationship groups are context pools, not contacts.
   - Require named-person evidence.
   - Do not encode founder-specific BNI/Rotary assumptions.

## Acceptance Criteria

- A new user never sees founder data or founder assumptions.
- The app does not retire questions based on substring guesses about the founder's biography.
- Demo/fixture data cannot masquerade as personalized recommendations.

## Notes

This is beta-blocking. It is also morale-friendly work: mechanical, finite, and clarifying.

---

# Phase 6 — State-Layer Tests

## Goal

Protect the parts of the app that make it more than a prompt wrapper.

## Test Targets

Add tests for:

- CSV contact parsing
- XLSX contact parsing
- ZIP import limits and parsing
- contact dedupe
- network feedback exclusions
- conversation outcome extraction / save behavior
- evidence sufficiency math
- new conversation reopening analysis
- lane scoring
- employer recommendation scoring
- weekly diff generation
- source URL collection and SSRF-safe fetch behavior where feasible
- `scoreOpportunity` or its replacement
- report assembly from saved records

## Steps

1. Pick a test runner and pattern consistent with the app.
2. Add fixtures for messy but realistic user data.
3. Add founder-loop regression fixture.
4. Add nonprofit employer fixture.
5. Add game-dev lane fixture.
6. Wire tests into `npm test` or an equivalent command.
7. Document how to run the tests.

## Acceptance Criteria

- Core parsers and scoring can be changed without fear.
- The founder-loop failure has a regression test.
- Stranger data can hit parsers without immediately breaking beta.

## Notes

Do not postpone this. Untested parsers running on strangers' contact exports are beta risk.

---

# Phase 7 — Lane Infrastructure

## Goal

Make lanes real infrastructure, not just resume variants.

## Requirement

The app must support parallel, structurally different career lanes:

- nonprofit / public-interest / regional institutions
- game development / indie game development

The architecture must not become shared code full of `if (lane === "nonprofit")` and `if (lane === "gamedev")`.

## Lane Config Shape

Each lane should be represented by configuration and data:

- lane id
- lane label
- role families
- evidence types
- market data sources
- employer organization types
- scoring weights
- compensation signals
- network path types
- outreach norms
- asset requirements
- portfolio expectations
- disqualifying signals

## Steps

1. Add lane config module.
2. Add lane-typed evidence.
3. Add lane-specific role families.
4. Add lane-specific scoring weights.
5. Update advisor context to use lane config.
6. Update resume context to use lane config.
7. Update employer discovery and scoring to use lane config.
8. Update network analysis to validate lanes through lane-specific paths.

## Acceptance Criteria

- Nonprofit and game-dev lanes can coexist for one user.
- Evidence can support one lane but not another.
- Resume drafts can be lane-specific without hardcoded prompt branches.
- Employer scoring changes depending on lane configuration.

## Notes

This is the foundation for SaaS expansion. New lanes should become config and data work, not rewrites of core logic.

---

# Phase 8 — Nonprofit / Regional Intelligence v0

## Goal

Build the first lane-specific intelligence layer that monthly Claude cannot easily persist and combine with user history.

## Scope

Start with Upper Valley / northern Vermont / northern New Hampshire nonprofit and regional institutions.

Organization categories:

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

## Data Sources

Start with:

- ProPublica Nonprofit Explorer API
- employer-owned websites
- staff pages
- board / leadership pages
- municipal and school district pages
- regional economic-development directories
- VT/NH nonprofit registries where available
- user-supplied conversation outcomes

## Fields To Add

For nonprofit/regional targets:

- mission area
- EIN where applicable
- revenue trend
- funding stability
- program area
- executive compensation where useful
- salary plausibility
- organization size
- leadership page
- board page
- staff page
- careers page
- source confidence
- hiring confidence
- relationship paths
- recommended next move

## Steps

1. Add nonprofit organization fields to employer candidates / watched employers or related tables.
2. Add ProPublica lookup by organization name / EIN.
3. Save source-backed nonprofit facts.
4. Add salary plausibility heuristic.
5. Add funding stability heuristic.
6. Add nonprofit-specific recommended next moves.
7. Update employer UI to show nonprofit intelligence.
8. Update briefing to use nonprofit signals.

## Acceptance Criteria

- At least one nonprofit source improves employer recommendations.
- The app can distinguish "good mission fit but weak salary plausibility" from "strong target."
- The app can recommend a conversation before applying when role/funding fit is unclear.

## Notes

This is the first visible "better than monthly Claude" feature for the founder's new direction.

---

# Phase 9 — Game-Dev Lane v0

## Goal

Add a structurally different lane so CIP proves it can support parallel searches, not just one nonprofit rewrite.

## Scope

Game development / indie game development v0 does not need live studio intelligence immediately. It needs correct lane structure and evidence interpretation.

Evidence types:

- shipped builds
- playable demos
- itch.io pages
- Steam pages
- game jam entries
- GitHub repos
- devlogs
- trailers
- screenshots
- design docs
- tools / engine experience
- collaboration credits

Network paths:

- local game dev groups
- jam communities
- Discord communities
- indie collaborators
- studio alumni
- convention / showcase contacts

Role families:

- gameplay programmer
- tools developer
- technical designer
- producer
- narrative / systems designer
- solo indie developer
- QA / production-adjacent entry path
- community / devrel for games

## Steps

1. Add game-dev lane config.
2. Add lane evidence types.
3. Update source analysis to classify game portfolio evidence.
4. Update resume generation to understand game portfolio norms.
5. Add game-dev market-read conversation templates.
6. Add game-dev target organization / studio placeholders.
7. Add game-dev briefing recommendations.

## Acceptance Criteria

- Game-dev evidence is not evaluated with nonprofit rules.
- Game-dev lane can be strengthened or weakened independently.
- The app can recommend portfolio proof before applications.
- The app can distinguish shipped/playable evidence from aspirational interest.

## Notes

This lane proves the architecture. It should not be overbuilt before the loop works.

---

# Phase 10 — Target Organization Map

## Goal

Replace "job list first" thinking with a ranked target map.

## Desired Output

For a chosen lane and geography, CIP should produce:

- 25 target organizations
- 10 highest-priority organizations
- 5 warmest relationship paths
- 5 exploratory conversations
- 5 roles or titles to monitor
- 5 organizations to avoid or deprioritize
- "why this org / why me / what to ask" notes

## Steps

1. Redesign Employers page around target organizations.
2. Add filters:
   - lane
   - geography
   - organization type
   - recommended next move
   - confidence
   - network proximity
3. Add target status:
   - new
   - researching
   - talk first
   - monitoring
   - applying
   - paused
   - not interested
4. Add target notes and source facts.
5. Add relationship path display.
6. Add "why this target" brief.
7. Add "next action" for each target.

## Acceptance Criteria

- The user can see where to focus without opening a job board.
- Each target organization has a next move.
- The target map integrates evidence, lane, employer facts, and network signals.

## Notes

This becomes the main operating surface for the search.

---

# Phase 11 — Evidence-To-Outreach Briefs

## Goal

Bridge the evidence ledger, target organizations, and network intelligence.

## Brief Structure

For each target employer or contact:

- why this organization / person
- why the user might fit
- supporting evidence
- uncertain claims
- what not to claim yet
- suggested market-read question
- recommended outreach intent
- follow-up action

## Steps

1. Add brief generation module.
2. Use saved evidence and lane config.
3. Use target organization facts.
4. Use contact context and feedback.
5. Add display to target map and follow-up queue.
6. Add copy/edit workflow.

## Acceptance Criteria

- Outreach is specific without being spammy.
- The app does not invent shared history or unsupported claims.
- The user can understand why a conversation is recommended.

## Notes

This is not an automated sender. CIP never sends messages.

---

# Phase 12 — Outcome Tracking v0

## Goal

Let the loop eventually learn what converts.

## Records To Track

For applications and conversations:

- target organization
- lane
- role title
- source
- action type
- date
- status
- result
- next action
- notes

Statuses:

- interested
- reached out
- conversation scheduled
- conversation completed
- applied
- replied
- screened
- interviewed
- rejected
- closed
- paused

## Steps

1. Add outcome table.
2. Add minimal UI on target map and follow-up page.
3. Add outcome summary to briefing.
4. Use outcomes in scoring over time.

## Acceptance Criteria

- The app can say what happened after a recommendation.
- The briefing can surface stale applications or follow-ups.
- Future scoring has a path to learn from actual results.

## Notes

Keep this lightweight. The goal is loop learning, not applicant-tracking bloat.

---

# Phase 13 — Discovery And Monitoring (LLM Web Search First)

## Goal

Make the weekly pass actually go out and find new roles and employers — the expectation the founder had and never got — with an LLM-with-web-search as the discovery engine and employer-direct checks as verification.

## Founder Finding

The founder expected fresh, source-backed job and employer discovery every weekly run. What existed instead: Adzuna geographic/remote search and configured Greenhouse/Lever board slugs — static APIs, never scheduled, aimed at the big-tech market he had already left. Board ingestion is retired, not deferred.

## Principles

- LLM web search is the discovery engine; memory is the differentiator. Discovery output must land in the loop (candidates, snapshots, briefing deltas), never as free-floating prose.
- Provider-agnostic adapter: evaluate OpenAI Responses web_search (already proven in employer discovery), Z.ai (GLM) web search, or another frontier provider. Switching providers must be configuration, not a rewrite.
- Employer career pages remain the source of truth for verification; ATS adapters confirm what discovery claims.
- Do not scrape legacy HTML. Supported adapters must be honest. Manual review is labeled.
- Every discovered role or target carries a source URL and a discovery date.

## Board Retirement Steps

1. Disable and remove the Adzuna ingestion paths (`adzuna-jobs.ts`, `remote-jobs.ts`, `/api/jobs/geographic`, `/api/jobs/remote`).
2. Disable `ingestConfiguredSources` (Greenhouse/Lever slugs) in `labor-market.ts` and its `/api/labor-market/ingest` route.
3. Retire or repurpose the Opportunities page: it may only ever show loop-derived matches (discovery runs, watched-employer checks). Archive board-era `opportunities` / `opportunity_matches` rows rather than silently deleting user history.
4. Remove now-dead env vars from `.env.example` and documentation.

## Discovery Steps

1. Build the discovery adapter interface (provider, model, search tool, token budget).
2. Implement the first provider behind it.
3. Schedule per-lane, per-geography discovery runs on the briefing rhythm (weekly or monthly): new roles at watched targets, new target organizations in the lane's categories, funding/leadership changes.
4. Feed every discovery run through Phase 3 propagation: new employer candidates, role snapshots, briefing deltas.
5. Surface "new since last run" in the briefing as the headline discovery section.
6. Keep employer-direct adapter work as verification of what discovery claims.

## Employer-Direct Adapters (verification layer)

Start where clean endpoints exist: Greenhouse, Lever, Ashby, SmartRecruiters, Workable. Investigate carefully: iCIMS, Workday.

## Acceptance Criteria

- A weekly run produces genuinely new, source-backed roles and/or targets since the last run — the experience the founder never had.
- No code path renders board-API data as user-facing output.
- A watched employer with a supported ATS can show source-backed roles; unsupported employers are not faked.
- The discovery provider can be switched by configuration.

## Notes

This comes after the loop and lane work. Discovery without the loop just rebuilds the old funnel with better prose. Do not let adapter work distract from the core restart.

---

# Phase 14 — Small Invite-Only Beta

## Goal

Put the rebuilt loop in front of a small number of users without overclaiming.

## Beta Preconditions

- De-founder pass complete.
- Founder loop regression passes.
- Core state-layer tests exist.
- Conversation outcomes are structured.
- Briefing shows deltas.
- At least one lane-specific intelligence source works.
- New users do not see founder data.
- The app is honest about unsupported monitoring.

## Beta Scope

Small, invite-only, trust-first.

Do not sell the product as:

- an auto-apply tool
- a guaranteed job finder
- a generic resume improver
- an active monitoring platform unless adapter support exists

Position it as:

- a structured career search workspace
- a relationship and target-organization strategy tool
- a way to preserve and act on learning over time

## Beta Success Signals

- Users return after a conversation because the app helps them process it.
- Users can name what changed from one pass to the next.
- Users take fewer but better actions.
- Users trust the confidence labels.
- Users do not experience fake certainty.

## Beta Failure Signals

- Users paste notes and nothing visibly changes.
- Users still prefer a monthly Claude prompt.
- Users see irrelevant founder assumptions.
- Users receive generic resume or job advice.
- The app asks for too much data entry after every conversation.

---

# Deferred Work

These are not canceled. They are sequenced behind loop proof.

- Stripe checkout evolution
- billing/package design
- hCaptcha polish
- broader security audit pass
- multi-tenant scaling work
- additional ATS adapters
- polished onboarding
- production marketing site
- SaaS pricing experiments

The SaaS ambition remains, but it depends on product proof.

---

# Implementation Milestones

## Milestone 1 — Loop Diagnosis And Repair

Includes:

- Phase 0
- Phase 1
- founder-loop regression

Exit condition:

- New conversation evidence produces visible delta output even when evidence is mature.

## Milestone 2 — Conversation Memory And Propagation

Includes:

- Phase 2
- Phase 3
- initial structured conversation UI

Exit condition:

- A conversation can move a lane and employer recommendation without manual reinterpretation.

## Milestone 3 — Briefing Heartbeat

Includes:

- Phase 4
- snapshot diff
- top actions

Exit condition:

- Briefing answers "what changed and what should I do now?"

## Milestone 4 — Beta Safety Foundation

Includes:

- Phase 5
- Phase 6

Exit condition:

- No founder-specific output for new users; core state layer has tests.

## Milestone 5 — Lane Intelligence

Includes:

- Phase 7
- Phase 8
- Phase 9

Exit condition:

- Nonprofit and game-dev lanes coexist and use different evidence/market logic.

## Milestone 6 — Target Map And Action Layer

Includes:

- Phase 10
- Phase 11
- Phase 12

Exit condition:

- User can work from target organizations, relationship paths, briefs, and outcomes instead of generic job lists.

## Milestone 7 — Discovery, Monitoring, And Beta

Includes:

- Phase 13 (board retirement, LLM discovery adapter, employer-direct checks)
- Phase 14

Exit condition:

- A weekly run yields new, source-backed discovery, and a small invite-only beta can begin without pretending unsupported features exist.

---

# Working Rules For The Restart

1. Do not optimize the prose before fixing the loop.
2. Do not add lane-specific branches to shared logic; use configuration.
3. Do not show demo data as user output.
4. Do not treat more evidence as a reason to stop responding.
5. Do not fake monitoring.
6. Do not scrape where the product has already rejected scraping.
7. Do not turn networking into a sales tool.
8. Do not bury uncertainty.
9. Do not postpone tests around parsers and state transitions.
10. Do not compete with frontier models at generic web research. Use them as components; win on memory, continuity, and action.
11. Retired means retired: do not revive board-API job pipelines alongside LLM discovery. One discovery engine, feeding memory.

## Final Autumn 2026 Thesis

The Spring version proved that CIP could assemble a serious career intelligence workspace.

The Autumn version must prove that the workspace can learn.

If the app can show how a real conversation changed lanes, employers, next actions, and career assets, it becomes meaningfully better than a monthly LLM check-in. If it cannot, it remains a thoughtful but nonessential workup.

The restart is justified because the failed loop revealed the real product.

CIP 2026 Autumn is the loop rebuild.
