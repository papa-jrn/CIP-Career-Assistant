# Workbench and Career Loop Redesign

Status: founder-approved direction, documented 2026-10-19. First Workbench foundation implemented locally; see the implementation-progress sections for completed work and remaining boundaries. The full redesign is not complete.

This is the current UX and sequencing plan. It complements the master project plan, Next Steps.md, Project Plan Autumn 2026.md, and Employers-Opportunities Rethink.md. Existing security, verification, evidence-lineage, and beta obligations remain in force.

## 1. Purpose and founder context

CIP helps people understand and communicate the continuity of their experience, identify credible directions, and decide where to invest their next effort. It helps users focus, interpret, and act rather than compete on raw listing volume or application counts.

The founder described a varied career whose transferable value depended on telling its story; prolonged searches experienced by family and friends; concerns about misleading listings and recruiter impersonation; and dissatisfaction with compensation relative to experience and living costs. These are founder-reported motivations, not independently established labor-market statistics. The product must not interpret search silence as evidence of personal inadequacy.

CIP should help answer: Where should I aim, who should I talk to, which opportunities warrant my effort, and what has changed as I learn? Success means better-supported decisions and useful next moves, not hundreds of applications. It cannot guarantee hiring outcomes.

## 2. Diagnosis and protected functionality

The engine supports a loop but the interface teaches a numbered sequence. Returning users must remember to return to Evidence for deeper re-analysis after recording learning elsewhere. The Workbench currently summarizes other pages instead of providing a distinct place to work.

Preserve the working Intake, deeper Evidence questions, and Career Lanes experiences. Improve their connections and presentation rather than rebuilding their underlying value. First-time guidance and repeated use are equally required.

Pause broad feature expansion while repairing the capture, action, analysis, and return flow. User-supplied job evaluation below is explicitly included in this plan.

## 3. Workbench as the signed-in home

Four focused areas:
- Your direction: concise, editable goals, constraints, and directions being explored.
- Your next moves: a small prioritized action queue, each with rationale and relevant context.
- Add an update: capture conversations, research, documents, links, corrections, project progress, and changes in goals.
- What changed: meaningful strategy changes, supporting evidence, uncertainty, and proposed next actions.

Statistics, historical outputs, and technical explanations should not dominate ordinary work. The public home can remain a separate introduction; the Workbench becomes the signed-in default.

First use: establish situation through Intake, add initial evidence, answer deeper questions, review and correct initial lanes, then choose a first action. Each stage returns a concrete result to the Workbench. Returning use: review priorities, capture learning or work an action, record the outcome, update strategy, review changes, and choose the next move. Do not require repeating onboarding.

## 4. Capture and return contract

Capture is available in the Workbench and from relevant detail pages. Start with ordinary language and optional documents or links; propose categorization and entity connections for review rather than requiring users to understand the schema.

Keep distinct: user intentions, observed facts, reported conversations, AI inferences, and unresolved questions. Preserve provenance and confidence; allow corrections. A desire does not require proof before it can influence goals.

Example: the conference increased interest in entrepreneurship and launching CIP. Ask whether this is a side project, parallel exploration, or primary direction. Do not equate launching a product with teaching entrepreneurship. CIP can support career experiments without expanding into startup accounting, fundraising CRM, or product-backlog management.

Contextual capture preselects the relevant employer, person, lane, opportunity, or action, with correction available. All entry points use the same underlying records. Research belongs with the employer and action as well as the evidence history.

After saving, distinguish persisted information from pending analysis: Saved; not yet incorporated into strategy. Permit batching and offer Update my strategy at capture completion and in the Workbench. Show what it will process. Dependency handling must not require manual navigation among engines. Do not silently trigger a web search or regenerate all resumes.

Analysis failure must preserve captured data, show pending state, and permit retry. Distinguish a refreshed strategic snapshot from completed advisor re-analysis. Pending detection must cover all supported input types, not just conversations.

## 5. Persistent work and outcomes

A queue item needs stable identity, source references, rationale, related entities, lifecycle, and outcomes. Proposed lifecycle: proposed, active, deferred, completed, dismissed; confirm naming during implementation. Actions and outcomes persist; regenerating analysis must not recreate dismissed or completed work without explaining new evidence that justifies reopening it.

An opened action provides its context, sources, a way to record findings or create the needed draft, and complete/defer/dismiss/correct controls. Completing work and incorporating its learning into strategy are distinct states. Investigation with an unknown result is a valid completion.

Examples:
- Alexis follow-up: a concise question or objective, conversation context, subsequent findings, and a recorded resolution.
- Employer research: sources, findings, uncertainty, and a decision about further attention.
- Funding check: existing 990 data plus user research, source dates, and a conclusion such as concern remains, concern addressed, or unable to establish. Refreshing a filing alone does not complete an investigation; a historical filing cannot establish current solvency or an opening's pay.
- Career experiment: user intention, a bounded test, what happened, and implications.

Prefer additive records and events; decide exact schema after inspecting current action/disposition models. Reuse existing capabilities and avoid parallel stores for the same information. Any new persistence needs migrations, user scoping, RLS, and explicit failure behavior.

## 6. Process-page connections

Every handoff carries the result and entity context, opens an existing related action when present, and preserves the user's place when returning from a detail page. A generic Back link alone is insufficient.

| Surface | Continuing purpose | Contextual handoff |
| --- | --- | --- |
| Intake | Maintain story, goals, constraints | Review the effect on strategy |
| Evidence | Deepen understanding, add proof, resolve questions | Review changes and work on next moves |
| Career Lanes | Explore and refine directions and supporting assets | Work on this direction |
| Network / Follow Up | Relationships, conversations, obligations | Continue this follow-up |
| Employers | Organization suitability, research, funding | Work on this employer |
| Opportunities | Discover, import, verify, evaluate openings | Evaluate or work on this opportunity |
| Briefing | Explain changes and priorities | Actionable content becomes Workbench work |
| Report | Preserve or export a snapshot | Available as an output |

Decision confirmed 2026-10-19: combine Network and Follow Up into People; move Opportunities inside Workbench; absorb Briefing into Workbench; preserve Report only as a useful export after a content inventory. See section 12 for the approved navigation and consolidation contract. Keep Employers distinct from Opportunities: a target can matter without a vacancy. Deep tools remain accessible without becoming mandatory stops in a numbered cycle.

## 7. Bring a job found elsewhere

Founder addition, 2026-10-19: users can submit a job found outside CIP. They can paste a URL or job description, add employer/title/context, or attach a supported document. Support this from the Workbench and Opportunities. Preserve the original material and supplied URL with capture time. Pasted text alone is user-supplied material, not a verified listing.

The flow must answer separately:
1. Is the listing attributable to the actual employer and currently verifiable?
2. Is the work a credible fit for this user, and why?
3. Is investing effort worthwhile given constraints, evidence, uncertainty, and available human paths?

Verification requirements:
- Seek the employer's own careers page or attributable ATS listing; retain the original external source and link the corroborating source. Reuse existing verification and employer-resolution machinery.
- Show source, checked-at time, current status, and supporting observations. Model output alone is not verification.
- Distinguish verified on employer source, closed/expired, unable to verify, and potential impersonation or other red flags. Treat reachability, employer identity, and hiring intent as separate questions; finalize storage/display vocabulary during implementation.
- A live employer listing cannot prove active hiring intent, guarantee a response, or rule out every scam. Never label an unreachable or login-gated listing fake solely because it cannot be read. Explain limitations and offer manual corroboration.
- Redirects, off-domain application destinations, requests for money or sensitive information, and identity inconsistencies can warrant caution when supported by observed evidence. Do not invent allegations or guarantee safety.
- Recheck before a consequential apply recommendation when the verification is stale; retain earlier observations rather than overwriting history. No guessed publication dates.

Fit and recommendation requirements:
- Compare duties, required qualifications, scope, compensation when stated, geography, work model, user goals, transferable evidence, and proof gaps.
- Explain strong matches, material mismatches, unknowns, and confidence with source references. Separate explicit requirements from inferred preferences. Do not invent salary, eligibility, credentials, or experience.
- Recommend apply, talk first, research, hold, or skip using the existing recommendation vocabulary where practical. Explain the next action rather than relying on a percentage.
- A real job may be unsuitable; an appealing job may remain unverified. Show both conclusions independently.
- Allow the user to correct the interpretation and choose whether to pursue. Persist evaluation and subsequent findings so future analysis can learn from them.

Imported jobs use the existing opportunity identity/dedupe and dispositions where possible, including across discovery runs. Importing does not auto-watch an employer, apply, contact anyone, or count an unverified job as lane validation. Evaluation can be an explicit standalone action without starting a full search run; define its own appropriate limits and cost visibility.

Reuse SSRF guards for URLs, authentication before upload parsing, size/archive limits, same-origin POST protection, strict AI schemas and output caps, and deterministic fallback. Treat listing/document content as untrusted data, never instructions. When research or AI is unavailable, save the input and explain the incomplete evaluation rather than manufacturing a verdict.

## 8. Recommendation repair gate

Investigate the founder's 2026-10-19 briefing screenshot before elevating its queue into the Workbench:
- Duplicate hospital changes and Christopher Diak follow-ups.
- Raw conversation text in place of a concise follow-up objective.
- Employer movement described as a strengthened lane.
- A CRNA opening appearing in guidance about the founder's direction; trace relevance and signal propagation before treating the conclusion as valid.
- Old obligations resurfacing without a clear resolution path.

These are observations to reproduce and diagnose, not assertions that their exact root causes are established. Every recommendation must identify a relevant action, explain its evidence, and support recording the result. Vacancy existence is not personal suitability. Negative evidence, unknowns, and corrections must remain visible.

## 9. Visual direction

Replace the cream/sage/brass editorial emphasis with cool white/slate surfaces, navy text, and a stronger blue or violet accent. Prefer crisp sans-serif headings, clearer hierarchy, and compact usable work areas. Maintain accessible contrast and distinct semantic colors for verified, warning, danger, and pending states. Green should not double as the main decorative identity and every positive signal.

Design the Workbench and one complete task flow first, then extend shared tokens and components across pages. Navigation composition is approved in section 12; the final palette and detailed layout remain to be prototyped. The facelift must reinforce usable work rather than disguise the existing summary page.

## 10. Delivery sequence

1. Review and prototype: preserve founder purpose, inspect the current Workbench flow, map both journeys and the action lifecycle, and inventory existing stores/analysis dependencies. Reproduce recommendation problems. Use Product Design to compare three visual directions with the same content and workflow, then prototype the selected direction through one complete employer-research loop. Include the approved navigation from section 12 in the early prototype. See the October 20 design-process refinement below.
2. First complete loop: employer research capture, durable outcome, explicit strategy update, supported changes, and action resolution. Include failure/retry and no-new-information paths.
3. Connect existing pages: Intake, Evidence, Career Lanes, relationships, funding, and opportunity handoffs with shared capture and persistent action context. Preserve the deeper questions.
4. User-supplied job slice: import, dedupe, source verification, separate personal-fit evaluation, saved recommendation/correction, and Workbench action. This must be delivered before declaring the redesign complete.
5. Complete navigation consolidation and extend the shared visual design after the working flow is proven. Test the approved navigation in the early prototype and migrate actual routes incrementally, preserving existing links. Earlier work establishes the selected visual direction and reusable patterns; this step completes their rollout.

Do not deploy or claim beta readiness merely because this redesign is complete. Existing security, cost, de-founder, and live acceptance gates still apply. Do not expand into mass application, full job-board coverage, new discovery providers, or startup-management software during this work.

## 11. Acceptance and verification

- A new user reaches a credible first direction and first action without understanding internal engine order.
- A returning user records learning, updates strategy, understands changes, and continues work without retracing onboarding.
- A changed intention is respected as intent, not fabricated proof; launching CIP remains distinct from teaching entrepreneurship.
- Conversations, research, funding findings, documents, corrections, and external jobs are capturable with correctable context and provenance.
- Process-page handoffs open the relevant Workbench work and return to detailed sources without losing place or creating duplicates.
- Completed, deferred, and dismissed work survives reload and re-analysis; unknown investigation results are valid outcomes.
- Saved/pending/analyzing/updated/failed states are truthful. Failures preserve input and allow retry.
- A submitted job is deduplicated, its source/status checked, and its suitability assessed separately. An unverified import cannot validate a lane. Unsupported safety or hiring-intent guarantees never appear.
- An irrelevant verified vacancy cannot strengthen a personal lane merely because its employer is relevant.
- Meaningful parser, matching, dedupe, propagation, lifecycle, fallback, and user-isolation tests run without real AI calls. Keep typecheck/test suite green and follow repository dev-server/build discipline.
- Perform founder live passes for first-use and returning-use journeys, employer/funding research, the conference intention, external-job evaluation, and analysis failure/retry. Review the UI in browser, including narrow screens and keyboard access.

## 12. Navigation and consolidation decisions - approved 2026-10-19

The founder confirmed the following direction after reviewing the current Process pages, Briefing, and Report. This resolves the navigation/consolidation portion of the original section 12. This section supersedes any earlier suggestion that Opportunities or Briefing remain separate primary destinations. These are approved design decisions, not claims of implemented changes.

### Navigation

Signed-in primary destinations: Workbench, Your direction, People, Employers. Account and Help are utility navigation; Contact is available through Help. Remove Process and its numbered sequence from the primary navigation. Do not bury every destination in a Workbench dropdown.

Public navigation: Home, How CIP works, Contact, Sign in. Keep the public introduction separate from the signed-in working home.

Your direction contains the existing Intake, Evidence, and Career Lanes as clearly labeled subviews, preserving their useful functionality and deeper questions. First-time guidance leads through them; returning users revisit them directly without repeating onboarding.

### Workbench views

| View | Responsibility |
| --- | --- |
| Overview | Current-direction Executive Summary, priorities, and information waiting for analysis |
| My work | Follow-ups, employer research, funding checks, career experiments, and recorded outcomes |
| Opportunities | Add an outside job, run CIP discovery, inspect fit and verification, and decide whether to pursue |
| What changed | Explain meaningful shifts in strategy and priorities with supporting evidence |

Use separate views rather than stacking all capabilities into one long page. Open task and opportunity details contextually, preserve place, and provide direct access to related people, employers, and evidence. Opportunities is part of Workbench, not a fifth primary destination.

Move the useful Report Executive Summary into Overview as Your current direction: transferable value, pursued/explored directions, important constraints, and last-updated time. Allow users to correct an interpretation that no longer reflects their goals. Keep next actions adjacent but distinct so summary prose does not substitute for actionable work.

Absorb Briefing into Workbench: actions belong in My work, changes in What changed, and funding concerns/assumptions link to the relevant work and entity. Maintain one persistent action queue, not a competing briefing queue.

Remove Report and Capstone as primary destinations. Inventory the current report before retiring its surface; retain uniquely useful content. Offer Export a strategy snapshot with the summary, selected directions, evidence, priorities, unresolved questions, and generation date. A snapshot is a record, not completion of the career loop. Do not delete historical reports or break existing links during consolidation; define route compatibility during implementation.

### People: streamline Network and Follow Up

One People destination with Connections and Follow-ups views. Connections leads with actual people and compact search/filter/add/import/analyze controls. Keep deeper relationship information available on demand. Move general networking explanations, alumni guidance, examples, and instructional content into expandable/contextual help. Actionable recommendations go to Workbench; do not merely relocate all Network prose there.

Follow-ups uses compact expandable rows with a disclosure triangle, name, organization, truthful status, next action, and due date when present. Expand to show history, capture notes, and edit or resolve work. Use stacked mobile rows with accessible keyboard controls; do not show every person's full form by default.

Founder-observed bug: the Met/capture-notes area says You talked but have not logged it yet for people whose notes were already captured. Trace entity matching and state derivation; do not fix by hiding the label. Distinguish met, notes saved, analysis pending, and follow-up due. Saving notes clears a missing-notes prompt but does not automatically complete a future obligation. Verify against the founder's affected records and regression fixtures.

### Employers and external opportunity sources

Support both entry paths equally: job first (outside listing -> Workbench evaluation -> employer research) and employer first (local organization -> research/relationship -> potential opening). Employer-first is optional, not a required philosophy or a gate to job evaluation. CIP works alongside external job boards, helping users decide which opportunities deserve effort; it does not compete on exhaustive listing volume.

Employers page order:
1. Compact existing employers and their next actions.
2. Find and review employers by geography: the main employer-discovery entry point.
3. Optional nonprofit discovery through IRS 990 filings, after geographic discovery.
4. Source directories and detailed search explanations on demand.

Distinguish nonprofit discovery from an individual employer's funding investigation. Keep funding data and per-employer controls in that employer's dossier; bulk financial-refresh controls remain secondary. Nonprofit interest is optional and must not be assumed for every user. Pay suitability follows the individual's constraints and available evidence, not a blanket sector judgment.

Within Workbench Opportunities, provide a curated Where else to look area for relevant external sources, including remote-job sources when appropriate. Research actual recommendations at implementation time, explain their relevance, and make bringing listings back into CIP easy. Do not promise comprehensive coverage or add integrations merely to display links.

### Additional acceptance criteria

- Signed-in users can identify the four primary destinations and find Opportunities inside Workbench.
- There is one working queue; briefing regeneration cannot create a competing queue or duplicate actions.
- Intake, Evidence questions, and Career Lanes remain directly reachable and retain their existing useful depth.
- Executive Summary, actionable next steps, and change explanations have distinct roles in one workspace.
- People is usable on a narrow screen without scrolling through every person's expanded form; disclosure controls are keyboard accessible.
- A person with captured notes is not incorrectly described as missing notes; pending analysis and future follow-ups remain independently visible.
- Both job-first and employer-first journeys can reach evaluation, research capture, and recorded outcomes.
- Nonprofit discovery is optional and follows general employer discovery; detailed financial research stays contextual.
- Report content is inventoried before consolidation; useful exports and historical records remain accessible.

## 13. Remaining implementation and visual decisions

Navigation and consolidation are settled at the product level in section 12. Remaining work: persistent action schema and migration boundaries; update orchestration and ingestion dependencies; a usable job-verification freshness policy; external-job evaluation caps; exact prototype layout, responsive navigation controls, and palette; route compatibility and report-content inventory. Resolve these within the approved scope before implementation expands. Do not treat them as reasons to restart the product plan.
### Behavioral decisions approved 2026-10-19

The founder accepted the following recommendations before implementation:
- Actions can be completed, deferred, dismissed, or reopened. Findings remain saved when an action is dismissed. Re-analysis preserves decisions and can propose reopening completed work with an explanation tied to new evidence; it does not silently restore it. Carry forward existing follow-ups and opportunity decisions where possible.
- Strategy updates remain deliberate through Update my strategy. Show pending inputs, handle required source ingestion in the update flow, preserve inputs on failure, and explain retry needs. Job searches and resume generation remain separate explicit actions.
- Verify imported jobs at submission. Always display the source and last-checked time. Automatically recheck when the user chooses to pursue or apply if the last check is more than 24 hours old, with visible progress. The threshold is an initial policy, not a guarantee. A failed recheck retains historical evidence but marks current status unconfirmed; a live listing does not establish hiring intent. Do not repeatedly recheck every saved job in the background during alpha.

The agent will inspect existing persistence and define additive migrations, orchestration, route compatibility, and report inventory. External-job evaluation caps require a code/cost review before numbers are proposed. Detailed layout and palette require a reviewable prototype. These remaining implementation choices do not reopen the approved product direction.

## Implementation progress - 2026-10-19, slice 1

First working foundation: the Workbench now has Overview, My work, and What changed views, a current-direction summary from saved advisor analysis, research/goal capture, explicit strategy analysis on the same page, and expandable persistent actions with outcome history. Opportunities remains linked to its existing route until its full workspace integration is ready; primary navigation consolidation is not yet implemented.

Storage decision: reuse career_sources under existing RLS. Append workbench_action records for status-only events; findings and their action event share a single evidence_response insert, making outcome capture atomic and readable by the existing advisor. No database migration is needed for this foundation. Read the entire paginated history so older terminal decisions cannot disappear behind a recent-record limit. User-entered goals are labeled as intentions; research remains unverified user-reported evidence. Existing posting dispositions and relationship outcomes remain authoritative in their own domains; automatic task adoption is deferred until recommendation defects are diagnosed.

Current boundaries: text capture only; source ingestion is still explicit on Evidence, the existing advisor limits still apply, and full pending-input orchestration/concurrency handling is not claimed complete. This slice does not build external-job import, streamline People, consolidate navigation, retire Report/Briefing, or apply the final global palette. Those remain required plan work. The Workbench uses a scoped cool-color prototype for review while other pages retain their current design.

## Workbench source and report inventory

Existing stores inspected: career_sources (free source_type, existing user RLS), conversation_outcomes (typed signals and obligations), posting_dispositions (job-specific status keyed by URL), career_strategy_snapshots (generated briefings). They describe different domains; no destructive migration or bulk conversion is needed for slice 1. General captures are evidence records, not artificial completed tasks. Only explicit actions enter the action ledger.

The Report's Executive Summary uses advisor.summary, which Overview now reads from the latest evidence analysis with its analysis mode and date. Report also contains confidence-labeled evidence, lanes, exploration experiments, skill gaps, safety notes, and opportunity context. These are not deleted; the existing report remains reachable pending the later snapshot/export consolidation. No historical report is overwritten.

Employer cards now offer a contextual Workbench handoff with editable employer/action fields, and evidence-analysis completion links to What changed. Creating an already-saved matching title/context returns to its existing history, including completed/dismissed work, instead of reopening it. This is initial application-level dedupe; concurrent creation needs a database uniqueness mechanism before broader automated adoption.

Verification for slice 1: TypeScript and all 424 tests passed; SSR build passed. Browser confirmed signed-out handling and signed-in rendering of the founder's saved analysis, pending-input count, and narrow-screen layout. No synthetic research or tasks were inserted into the founder's account during verification; live save/analyze acceptance remains to be exercised with genuine input. No database migration or deployment was performed.

### Live acceptance finding: explicit goal omitted by analysis (2026-10-19)

The founder saved a complete note about launching CIP, testing traction and paying users, and creating their own job. The saved Evidence page showed the full note, but the resulting analysis emphasized older nonprofit metrics and campaign websites. The transport sent a mixed historical evidence list plus a new-answer count, without identifying the new answers explicitly or distinguishing user intentions in the analysis contract. This is a handoff weakness; exact model reasoning cannot be established from its output.

The analysis context now supplies the actual timestamp-selected new answers and a separate list of saved user goals. The AI contract must explicitly address changed intentions, distinguish building a venture from teaching entrepreneurship or seeking startup employment, and avoid inventing commercial validation. Deterministic mode retains intentions verbatim with a feasibility-test caveat. Historical user goals remain visible on later passes; they are not relabeled as new. This correction does not automatically rerun or overwrite the founder's analysis. Goal supersession, historical loading limits, and more complete input lineage remain broader orchestration work.

## Next-session priority: synthesis of changed goals - 2026-10-19 live acceptance

Status: newly identified analysis gap; the five changes below are planned, not implemented by the earlier goal-handoff repair. The founder confirmed the expected response would have made CIP feel like it understood the situation.

Live sequence: the founder saved the conference/entrepreneurship update and ran analysis. The initial result focused on older achievements. After the handoff correction, a second live result acknowledged the CIP direction but said it needed outcome evidence to adjust positioning and reported no changes. Capture and goal recognition improved, but the synthesis acceptance bar still failed. The earlier note that live save/analyze acceptance was pending is superseded by this observation: genuine input was saved and analyzed; meaningful goal-to-strategy interpretation remains unresolved.

Expected behavior: recognize the user's desire to finish and launch CIP as a viable SaaS/AI product and potentially create their own job; connect that intention to existing career context, potentially including CTO/technical leadership, as a clearly labeled inference for confirmation; distinguish ambition from proven customers, traction, revenue, or viability; propose a bounded next experiment. Do not assume abandoning employment or infer that launching a product means teaching entrepreneurship. The founder subsequently confirmed the CTO connection was plausible even though it was not explicitly named in the captured update.

Core rule: a changed goal can change the plan immediately; evidence determines confidence in the path. Users should not have to establish business success before CIP helps them explore building it.

### Five required analysis improvements

1. Separate goals from evidence. Model what the user wants to pursue independently from proof of ability, feasibility, or market outcomes. A changed intention can revise the strategy without requiring proof of success. Preserve both kinds of information and their provenance; never turn an intention into a verified accomplishment.

2. Compare a new direction with the existing career model. Require analysis to identify supported connections, tensions, and alternatives rather than merely acknowledge the new text. For this case, founder/product exploration may reinforce technical leadership while creating a different route to income. Label that relationship as an inference, explain its basis, and invite correction. Do not hardcode the founder/CTO relationship for other users.

3. Expand what counts as change. The strengthened/weakened/questions-answered contract is insufficient for intention changes. Add direction added or revised and implications for your plan, with compatible schema, persistence, rendering, and deterministic behavior. An unchanged evidence score does not establish an unchanged plan.

4. Require a practical implication. Each meaningful change must explain what CIP understood, how it connects to existing context, what remains uncertain, and one useful next action. An illustrative experiment here is testing CIP with prospective users while documenting technical decisions relevant to technical-leadership positioning; this is an example, not a prescribed answer or evidence of demand. Avoid generic credential requirements unless the selected path or sourced requirements justify them. The live result's executive-certification gap needs this scrutiny.

5. Preserve unresolved changes across runs. Newly saved input and adequately addressed input are different states. A goal overlooked in the prior analysis must remain pending review until it is explicitly addressed; timestamps alone cannot prove understanding. Define input-to-analysis lineage and reconciliation behavior, distinguish correction of a prior omission from newly arrived information, and avoid marking a goal resolved merely because its wording appeared in output. Allow user correction of the interpretation.

### Verification and resume point

Build general reasoning-contract regression coverage using multiple structurally different goal changes. Verify connections to prior context, inference labels, uncertainty, actionable experiments, correction handling, and repeat-run behavior. Do not enforce a canned founder/CTO phrase or make a live AI call from the suite. Deterministic fallback must preserve intention and honestly state the limits of its synthesis. Automated tests of structure do not establish that live AI reasoning meets the acceptance bar; repeat a genuine founder pass after implementation.

Latest engineering checkpoint before this documentation: TypeScript and all 427 tests passed; SSR build passed after the goal-handoff correction. Those checks establish the implemented foundation and transport/fallback behavior, not completion of these five new requirements. No database migration or deployment was performed. Workbench first slice and goal handoff are implemented locally; navigation consolidation, People redesign, imported-job evaluation, full update orchestration, and the five synthesis improvements remain open.

Next session: implement this synthesis contract and unresolved-goal handling before expanding the Workbench redesign. Also retain the observed save-to-analysis UX issue: after capture, show Saved - ready to analyze with a nearby strategy-update action, so users do not have to ask where analysis happens. Reuse the genuine saved goal; do not ask the founder to re-enter it or create duplicate evidence.

## Implemented 2026-10-20: goal-to-strategy synthesis contract

The five analysis improvements now have a first implementation, pending a new genuine-input acceptance pass. This supersedes the previous status that they were entirely unimplemented; it does not establish that every live model response is semantically correct.

1. Goals and proof: explicit goal records are supplied as intentions outside the factual evidence/readiness calculation. AI output can propose implied goals from identifiable new evidence or conversation inputs; these remain labeled hypotheses for confirmation. Neither intention nor a matched lane establishes capability, demand, revenue, or suitability.
2. Connections: a structured goal assessment must include understanding, a contextual comparison, lane connections when supported, implications, uncertainty, and a bounded next action. Connections must name an existing lane and cite a source reference with a quote actually present in the supplied context. This verifies attribution, not the truth of a model inference. A separate direction with no existing-lane connection is valid when explained.
3. Meaningful change: the strict Responses JSON schema adds goalReviews and changeLog.directionChanges / planImplications. A newly interpreted older intention can revise the plan without newly saved evidence or score movement. Older saved analyses remain readable because new TypeScript properties are optional for legacy data.
4. Practical implications: the shared goal-review view appears in analysis results and Workbench Overview/What changed. It distinguishes user-stated intention, proposed implied goal, AI connection/confidence, uncertainty, and next experiment. Experiments have contextual Workbench handoffs. The schema no longer forces a minimum number of skill gaps or follow-up questions, reducing pressure to manufacture credentials or generic missing proof.
5. Unresolved inputs: content-derived input IDs and persisted versioned reviews distinguish included input from a structurally complete interpretation. Missing, malformed, incomplete, unknown-input, or ungrounded reviews remain pending. Pending goals select reconciliation mode even with zero new answers. Valid prior assessments survive later omissions and are not announced as new on every run. Review-ready means a complete proposal for human review, not user agreement or a guarantee of understanding.

Persistence and correction: assessment lineage and unresolved IDs live inside each additive evidence_analysis record. Goal loading scans paginated user-scoped history rather than relying on the latest 40 answers. An explicit correction links to an owned source and appends a replacement goal; original records remain. The active goal view retires explicitly replaced goals instead of silently reinterpreting a contradiction as proof. No new table or migration is required. Analysis stops visibly if prior-strategy, conversation, or goal-history loading fails.

Output budget: the existing 8,000-token cap remains. Up to three unresolved explicit goals are requested per pass; remaining or omitted goals stay visible as pending. Ordinary AI calls still have a deterministic fallback. Fallback preserves the exact stated intention, supplies an honest generic review step, and leaves synthesis pending instead of pretending to infer a career connection.

Verification covers varied founder, occupational-change, and caregiving intentions; implied versus stated goals; old overlooked goals; repeat-run preservation; missing practical fields; unknown lanes and fabricated source quotes; additive corrections and cross-user isolation; goals beyond a database page; and escaped shared rendering. Tests do not call a live provider. Structural checks cannot prove a useful or correct inference: the next founder pass must inspect whether the saved CIP goal is connected meaningfully to existing technical-leadership context, without forcing a canned CTO conclusion.

Still open outside this change: the broader Workbench/navigation/People/imported-job redesign, full source-ingestion orchestration, concurrent-update arbitration, and the product acceptance pass. The analysis response now exposes the structured interpretation and pending state; the UI must continue to distinguish saving, analyzing, reviewing, and acting.

Workbench analysis completion now opens its saved What changed view after a successful save, refreshing both pending-input and pending-goal counts. A failed save stays in place with its error; a failed briefing propagation is shown separately from the saved analysis. Evidence-page analysis retains its existing inline result. This avoids leaving a stale pending banner above a successfully interpreted goal.

### 2026-10-20 verification and live refinement

Final automated checks: TypeScript and all 450 tests passed; the SSR build passed. Signed-in browser verification used the founder's genuine saved conference/CIP intention, with new analysis records appended rather than editing the original goal or manufacturing research/task outcomes.

Live checks exposed attribution and presentation defects that the fixtures did not reveal: a quote could exist in supplied prior-review history while the validator checked only selected prior-analysis fields, and the model could copy a prior pending heading into an otherwise complete assessment. Validation now checks the actual text of all supplied prior-analysis fields without JSON string-escaping artifacts, and stale placeholder headings cannot remain the accepted direction label. Unknown sources, invented quotes, and unknown lanes are still rejected. Rejection reasons are saved as diagnostics; logs contain input hashes and validation reasons, not credentials or whole source documents. The strict response schema requires an assessment entry for each requested pending slot; incomplete entries still stay pending.

A further guard keeps intention-only reconciliation from manufacturing strengthened/weakened proof-score signals. Actual newly analyzed source evidence or conversation/evidence inputs remain separate. Prompts explicitly preserve current income commitments unless the user chooses a tradeoff; a desire to explore a venture is not permission to recommend sidelining employment.

The final browser result recognized completing and piloting CIP as a founder/product direction, connected it to the existing career model as a medium-confidence inference, proposed MVP criteria and a small user pilot with engagement/feedback measures, retained existing income commitments, and listed readiness/resource/adoption uncertainties. The saved goal moved from pending synthesis to interpretation ready for review. This is developer-observed live behavior, not founder confirmation that every inference or recommendation is right. No CTO connection was hardcoded or guaranteed. The user can take the experiment into My work or correct/replace the goal.

No database migration, deployment, commit, or push was performed as part of this implementation pass. The running local app includes the changes. The larger redesign remains separate work.

### October 20: lane continuity correction
A new entrepreneurial priority must not erase previously supported employment paths. Preserve omitted role briefs and their evidence; order the working portfolio as primary, secondary, tertiary, with additional directions still visible. Priority is distinct from market validation: remove the misleading count of "validated lanes" derived from slot selection. Recover an already-truncated portfolio from the newest saved analysis with a complete three-lane set (fall back to intake), rather than combining all historical suggestions. Future explicit retirement/rejection needs a separate recorded user decision; omission is never such a decision. No new market proof is created by restoring a saved path.

## Design-process refinement - approved 2026-10-20

Product Design is installed locally for the next design phase. It supports review, visual exploration, prototyping, and design QA; it does not change the approved product purpose, navigation composition, integrity requirements, or underlying Astro architecture. These refinements update sections 9-11 and the sequencing of section 12 without reopening those decisions.

### Prototype the complete experience

Review the current Workbench flow before generating concepts. The prototype must cover opening an employer-research action, reviewing its context and sources, recording findings, saving a durable outcome, deliberately updating strategy, reviewing supported changes, and choosing the next move. Preserve the distinction between completing an investigation and incorporating its findings into strategy. A polished Overview alone does not demonstrate that the career loop works.

### Compare three visual directions

Explore three distinct visual concepts using the same representative content, workflow, and navigation so hierarchy, density, typography, color, and usability can be compared fairly. Ground them in captured current screens and the established product brief. The founder's preference remains a sharper AI/technology feel with accessible contrast and clear semantic states. Select a visual direction before building its detailed interactive prototype; do not treat generated imagery or a static mockup as working functionality.

### Design first use and repeated use together

Show both states within one Workbench: a new user receives guidance toward an initial direction and first action; a returning user sees active work, information awaiting analysis, and a clear continuation path. Preserve direct access to Intake, deeper Evidence questions, and Career Lanes. Returning users must not repeat onboarding, and first-time guidance must not obscure ordinary work after setup.

### Make state clarity a design requirement

Include saved/awaiting-analysis, analysis in progress, failed/retry, no meaningful change, and completed-work states in the prototype and acceptance review. Show what is saved, what remains pending, what was incorporated, and what the user can do next. Failed analysis preserves the captured input. Test these states within the same journey rather than presenting only a successful result screen.

### Test navigation early, migrate incrementally

Include Workbench, Your direction, People, and Employers in the early prototype, with Opportunities inside Workbench and utility navigation as specified in section 12. Validate where users expect to find work before polishing individual pages. Prototype navigation does not imply that unfinished People or imported-job functionality has shipped; use honest boundaries. Migrate production routes and links incrementally after the chosen flow is proven, preserving compatibility and saved context.

### Immediate slice and remaining scope

The immediate design/implementation slice is Workbench, one complete employer-research loop, shared navigation, and reusable visual patterns. People consolidation and outside-job evaluation remain required later slices of the overall redesign; they are not removed or prerequisites to completing this first slice. Preserve the protected Intake, Evidence, and Career Lanes functionality. Do not expand this pass into startup-management tools or additional discovery integrations.

Acceptance for this slice: the founder can follow both first-use and returning-use paths, identify the next action, record research, distinguish saving from analysis, understand meaningful changes or an unchanged result, recover from failure, and continue without losing task context. Review desktop, narrow-screen, and keyboard use. Compare the rendered implementation with the selected visual target and exercise the actual interactions; visual similarity alone is insufficient.

Next step: review the current Workbench flow, then present three comparable Workbench concepts grounded in that flow. This documentation update does not claim that the audit, concepts, prototype, navigation consolidation, or remaining redesign slices are implemented.

## Implemented 2026-10-20: selected purple Workbench design, first working slice

The founder selected the third Career Map concept with the purple action treatment from the second concept. The approved revised reference is saved in design/workbench-purple-reference.png. The working implementation stays in the existing Astro app and uses existing Supabase auth, RLS, career_sources history, htmx endpoints, and deliberate strategy analysis. No separate prototype stack, destructive migration, or new deployment was introduced.

Product wording: "Connect your experience to career directions that fit you. Test them, learn what works, and refine your plan as you go." This remains open for founder refinement. Apt was reviewed through its public product page only: it advertises a quiz-led entry and broader mentoring/job/resume tools. Do not claim its personalization was tested or that it is only a generic quiz. The CIP design emphasizes experience, evidence, evolving goals, investigation, and decisions rather than matching competitor feature counts.

Signed-in navigation now uses Workbench, Your direction, People, and Employers in a navy sidebar, with a compact phone layout. Your direction groups the existing story/evidence/lanes routes; People groups the existing Connections/Follow-ups routes. Opportunities retains its existing implementation and URL inside the Workbench navigation context. Report remains available through the strategy view; existing routes are retained. Signed-in visits to the public root return to Workbench. This is navigation consolidation, not completion of the deeper People or Opportunities redesign.

Workbench presents the preserved three-lane portfolio, a repeatable choose/capture/update/review loop, and a working action editor with sources, findings, separate conclusions, status decisions, and additive history. The empty state creates real work rather than displaying mock tasks. Overview keeps the lengthy current analysis and goal interpretations available on demand; What changed retains their detailed review and correction handoffs. Phone users can expand alternative lanes, and all four Workbench tabs are visible in a two-column arrangement.

Research outcomes now optionally include sourceUrl and conclusion (continue, hold, unknown). These are stored with the action event and analysis evidence in one insert. A source link is an unverified reference, not a fetched or verified source. HTTP(S) validation rejects executable schemes; this slice adds no outbound URL fetching. An unknown conclusion is distinct from rejecting a direction and from task lifecycle. Status-only changes remain outside evidence. New fields are optional for existing saved events, preserving prior history.

Successful action saves return to that action's editor. Research-tool links carry an action identifier and expose a return-to-action link. The current source fields and context remain user-correctable; these generic tool links do not claim resolved employer/entity matching. Saved/pending state refreshes on return. Analysis remains explicit, source ingestion remains in Evidence, and failed saves keep the form visible.

Verification: typecheck and 459 tests passed; SSR build passed. Signed-in browser checks covered saved lanes, empty-to-created action, reload persistence, employer-tool return to the same action, visible rejection of an invalid source URL with form retained, keyboard focus, expandable phone lanes, navigation, and 390px/1440px layouts. One genuine next action was created from the founder's existing CIP goal: defining MVP completion criteria and a pilot-user test. No research findings, commercial proof, completed investigation, or new strategy analysis were fabricated for verification.

Remaining: People streamlining and its notes-state bug, external-job import/evaluation, recommendation repair, full source-ingestion orchestration, automatic action adoption, complete entity-specific return context, and broader first-use/failure acceptance. This first working slice is not the completed redesign or a beta-readiness claim. No commit, push, or deployment was performed in this implementation pass.

### October 20 acceptance: landing page and job discoverability

Founder confirmed the new visual direction, then identified two navigation/content issues. The public Home needs a rewritten landing experience explaining bring experience, discover directions, test them, and return learning; the old numbered-process description is misleading. Keep the public introduction accessible to signed-in users as How CIP works in the forthcoming landing-page slice; Workbench remains their working home.

Saved jobs were confirmed present in the existing Opportunities view: the October 19 search contained 55 listings, 33 marked open at its historical check. This observation is not a new verification of listing availability or personal suitability. Rename the working view Jobs & opportunities and expose a prominent Jobs to review strip on Workbench with saved-search counts/date and a direct View job listings link. No new search, application, provider fetch, or disposition change is triggered by this discoverability repair. A clearer listing workspace and recommendation-quality fixes remain separate work.

## Implemented 2026-10-20: public landing page

Replaced the old eight-step/report-led Home with an explanation of the repeating career-learning loop: bring experience, explore credible directions, test directions, and return learning to the plan. The headline and supporting copy emphasize the individual, transferable experience, credible alternatives, and useful next steps rather than a final career answer or application volume. The purple/slate visual direction carries through the public page and navigation.

Visitors see the landing page at /. Signed-in requests to / still open Workbench; /?intro=1 explicitly opens the public introduction for either audience. A signed-in How CIP works utility link makes it discoverable. A publicPage layout option displays the public header without the workspace sidebar even for signed-in visitors. Public navigation is Home, How CIP works, Contact, and Sign in/Open your Workbench. Start with your experience leads signed-out visitors to login and signed-in visitors to their existing Intake. No account, auth, or evidence behavior was replaced.

The page includes a clearly labelled illustrative Workbench design preview, the four repeating activities, practical Workbench use, CIP's complementary role alongside job boards and human conversations, uncertainty and correction principles, FAQ disclosures, and entry/return calls to action. It does not claim external-job import is already available, promise employment or business success, guarantee active hiring intent, invent customer testimonials, or present mock output as real user records. The approved illustrative preview is served locally as an optimized WebP of about 95 KB, with descriptive alt text.

Verification: typecheck, all 459 tests, and SSR build passed. Browser review covered desktop and phone layouts, loop-anchor navigation, FAQ expansion, signed-in public introduction, and Workbench return. An unauthenticated HTTP request returned the public headline, login entry, and no workspace sidebar or old eight-step copy. Phone document width stayed within the viewport. No sign-out, new account, paid search, analysis run, or new career record was needed to test this page. This is local implementation; no deployment, commit, or push is implied.

## Session checkpoint - 2026-10-20

The founder reviewed the running Workbench, shared purple navigation/layout, saved-jobs entry point, and new public landing page and approved this checkpoint for commit/push. Latest validation: all 459 tests and typecheck passed, SSR build passed, desktop/phone browser checks completed, and Git whitespace checks passed. Founder review is recorded separately from the formal composite-image QA limitation in design-qa.md; that artifact gap is not silently marked passed.

Resume with People: compact Connections/Follow-ups, expandable details, and the incorrect met-but-not-logged state for existing notes. Then continue employer discovery/funding ordering, recommendation relevance/duplicate repairs, imported-job verification and fit evaluation, and full source-ingestion orchestration. Retain the first-use and analysis-failure acceptance checks still listed above. Existing medical-role recommendations are not validated as personally suitable merely because the source listing or employer is real.

No production deployment was requested. The local server remains available for review. This checkpoint preserves the implementation, selected visual reference, landing asset, tests, and documentation; it does not declare the overall redesign complete.

## Founder acceptance of the visual slice - 2026-10-21

The founder accepted the purple/slate Workbench redesign and public landing page on direct review of
the running app, and waived the composite reference/implementation comparison artifact that had held
design-qa.md at blocked. The design QA record is now "accepted with a recorded limitation" rather
than passed: the artifact was waived, not produced, and the browser-tooling limitation that prevented
it is unchanged. See the Founder acceptance section in design-qa.md.

Founder assessment: the redesign is not finished, but the direction is substantially better than the
previous nature-oriented scheme - it reads as a current tool someone would use alongside a live job
search. Further issues are expected from real use and should be captured as they appear.

Still open and unaffected by this sign-off: first use on an empty new account, a deliberately induced
analysis failure and retry, and complete screen-reader testing. Section 11 acceptance and the existing
security, cost, de-founder, and live acceptance gates continue to apply. This acceptance covers the
visual slice only; it is not a claim that the redesign or any later slice is complete, and it is not a
beta-readiness claim.

Resume point is unchanged: People (compact Connections/Follow-ups, expandable details, and the
incorrect met-but-not-logged state for existing notes), then the section 8 recommendation repair gate,
then imported-job verification and fit evaluation.

## Fixed 2026-10-21: "met but not logged" never cleared

Diagnosis. Conversations are written to two different stores: the `network_feedback` record and
`career_sources` rows with `source_type = "conversation_outcome"`. The follow-up worklist's
"Met - capture notes" bucket only consulted the feedback record, so a conversation captured through
the outcome path never cleared the prompt. The page already loaded those outcome rows - to count
notes for the header and to synthesise contacts so people only ever talked to still appear - but
never consulted them when judging whether a person's conversation had been logged, and `QueuePerson`
had no field to carry them. There was no path by which the bucket could clear except writing a
second note into the feedback record. The page was asserting something false: that notes were
missing when they existed.

Fix. The bucket logic moved out of follow-up.astro into `src/lib/cip/follow-up-buckets.ts`
(`needsNudge`, `feedbackHasConversationContent`, `outcomeHasLoggedConversation`,
`hasLoggedConversation`, `actionBucket`) with 18 vitest cases, including the regression. Being
trapped in a page with no tests is why it drifted from the second store. Today's date is injected
rather than read inside the predicate, so the date-sensitive nudge rule is testable. `buildQueue`
now indexes outcomes by the same normalized contact name it already uses for feedback and attaches
them to each person, so no new identity logic was introduced. Cards show a conversations-logged
count and an expandable list of what was captured, labelled as recorded by the user and not
re-verified, so a cleared prompt is inspectable rather than merely inferred.

`outcomeHasLoggedConversation` is deliberately narrower than the existing
`outcomeHasStrategicContent`: a bare related lane or employer is a tag on an otherwise empty record,
not a captured conversation, and must not silence the prompt. The badge count uses the same
predicate as the bucket, so the two cannot disagree.

Known limitation, recorded not hidden: any logged conversation with content clears the prompt, so a
*subsequent* meeting with someone already logged will not re-raise it. Distinguishing that needs
per-conversation identity, not a timestamp compare - the two stores are written in either order (a
user may log the note before or after setting the status to Met), so ordering cannot tell "notes for
the new meeting are missing" from "notes were written first". Prompting for notes that demonstrably
exist is the worse failure, so this errs toward silence. Re-prompting per conversation remains open
work for the People slice.

Verification: typecheck clean, 477 tests passing (459 + 18 new), SSR build passed. Founder live pass
on the running app still to come. This is the focused bug fix only; the People consolidation
(compact Connections/Follow-ups with expandable details) remains the next slice.

## Implemented 2026-10-21: correct the contact on a saved conversation

Founder decision: extraction is useful but not always right, so the user must be able to adjust what
it recorded. Found live - a note opening "Notes with Vince Berk" was stored with contactName
"Unknown contact", and follow-up.astro drops outcomes named "Unknown contact" when building queue
contacts, so that conversation never reached Vince Berk's card at all. It was visible on Connections
as a nameless signal and invisible to People: not counted in his logged-conversations badge and
unable to clear his notes prompt.

Two causes, both dated. The deterministic fallback `contactNameFromNote` was added in e93aa32, after
that August record was saved, so nothing attempted recovery at the time. It would not have caught it
regardless: the pattern matches conversation/call/chat/met, and the note opens with "Notes with",
while "since we chatted" fails because the pattern requires whitespace immediately after "chat".
Today the name would instead fall through to the filename, producing "Notes with Vince Berk.docx" as
a person's name - not the placeholder, but not a person either, and rejected from the queue by
`isLikelyPersonName` for containing a period. Still orphaned, less visibly.

Correction, not overwrite. `src/lib/cip/conversation-corrections.ts` stores a correction as its own
`conversation_contact_correction` record naming the conversation's career_sources row id, applied
when the conversation is read. The saved outcome keeps what extraction derived, so what the system
read and what the user corrected stay distinguishable, and the card says "Contact set by you,
replacing X". This follows the additive-persistence convention rather than editing the original
record. The newest correction per conversation wins; superseded ones are retained, not deleted. A
correction that omits organization or title leaves what was recorded alone rather than erasing it.

`hasUnknownContact` treats both the "Unknown contact" placeholder and a filename that fell through
as unidentified, so the card asks who the conversation was with instead of presenting either as a
person. The form opens by default on those records and is available, collapsed, on every other
conversation.

Endpoint `POST /api/network/contact-correction` is same-origin guarded, authenticates before writing,
Zod-validates with a name length cap, body-size capped, and confirms the target row belongs to the
signed-in user and is a conversation record before storing anything - another user's row is a plain
404. The return path is rejected unless it is an in-app path. Corrections are applied on both
Connections and Follow-up, so a corrected conversation joins that person's queue card and counts
toward their logged conversations.

Known limitation, recorded not hidden: corrections are applied where these two pages read
conversations. Other consumers that read the stored outcome directly - weekly strategy propagation,
evidence re-analysis - still see the extracted name until they are routed through the same
application step. The correction record exists and is not lost; it is simply not yet read everywhere.
Widening the deterministic name patterns at capture time is separate, still-open work; it would
reduce how often a correction is needed but cannot repair records already saved.

Verification: typecheck clean, 499 tests passing (477 + 22 new), SSR build passed. Founder live pass
on the running app still to come, including correcting the Vince Berk record and confirming it
reaches his follow-up card.

## Implemented 2026-10-21: Connections leads with conversations

Founder diagnosis: the page was doing two jobs - bringing a network in, and working the conversations
- and the wrong one was winning. The returning user's actual work sat at line 923 of 1384, behind six
explainer sections and roughly 300 lines of import forms. Network intelligence stays valuable and a
user must still be able to refresh their network after the first pass, but the conversation loop is
what a returning user comes for.

New order: hero, Loop back (capture what an advisor told you), What saved conversations are changing,
then two disclosures - "Update your network" holding the import flow and the saved import-based
analysis, and "How to use your network well" holding the trust-boundary, referral-posture, lane
question bank, ideal-work, alumni, five-person-list, convert-contacts, and first-ask sections.
Founder chose to collapse all explainer content into the single disclosure rather than relocate it to
the public page; nothing was deleted, moved to another route, or reworded.

State-aware rather than fixed: `hasNetwork` is true when a saved import or analysis exists. With no
network the import disclosure renders open, because then it is the thing the user needs; with a
network it renders closed and its summary carries the saved import and analysis counts and the last
analysis date, so collapsing it hides nothing about what is stored. Verified both branches render as
intended.

The import block is rendered once, below Loop back, rather than in two positions. Rendering it in two
places would duplicate about 300 lines of form markup and its element ids; reordering it visually with
CSS would put the visual order at odds with the DOM order for keyboard and screen-reader users. If
first-use should truly lead with import, the honest fix is extracting the import into its own
component and rendering it in the chosen slot - open work, not done here.

Verification: typecheck clean, 499 tests passing, SSR build passed. The rendered signed-out page was
fetched from a build served on a spare port (the founder's dev server holds 4321 and serves a stale
dist) and its heading order confirmed: Loop back precedes the import disclosure, which precedes the
explainer disclosure, and the import disclosure carries the open attribute when no network is saved.
Signed-in sections could not be exercised this way; a founder live pass remains.

Not done here: the People consolidation itself - compact Connections/Follow-ups with expandable
details under one People surface - plus the duplicate raw-upload versus structured-extraction records
(the Vince Berk pair) and widening the capture-time contact-name patterns.

## Fixed 2026-10-21: orphaned conversations were unreachable

Founder found Eric Kidd sitting in "Met - capture notes" despite having written up that conversation,
and asked whether the notes had been lost. The Loop back panel reports 6 saved conversation notes but
lists only the 5 most recent, the oldest dated 2026-08-06, so at least one stored record predates
every record the page displays. Nothing points to deletion.

This exposed a gap in the correction feature shipped earlier the same day: the correction form
appeared only on the 5 most recent conversations, so an older conversation whose contact was never
identified could not be corrected, and therefore could never reach anyone's follow-up card. The
repair existed but not for the records most likely to need it.

Connections now loads up to 100 saved conversations rather than 5 and renders a "Waiting for a name"
section listing every conversation whose contact is unidentified, regardless of age, each with an
excerpt for recognition and a correction form. The section states plainly that the notes are saved and
were never lost, that reading them did not identify the person, and that naming the person joins the
conversation to their card. It does not appear when there are none. The correction form moved into
`src/components/ContactCorrectionForm.astro` so the recent-signals card and this section share one
implementation.

This does not confirm what the sixth record contains or that it is the Eric Kidd conversation; it
makes whatever is stored visible and correctable so the founder can see for themselves. If a record
turns out to be missing rather than unnamed, that is a different problem and this change will show it.

Verification: typecheck clean, 499 tests passing, SSR build passed, rendered signed-out page confirms
the section is absent with nothing to show and the section order is unchanged. The signed-in path -
the list actually populating - needs a founder pass; it cannot be exercised without their session.

## Implemented 2026-10-21: compress Follow Ups, one capture form, reach every conversation

Founder review of Follow Ups raised three things.

**The list was unusable at length.** Every person rendered their suggested ask, known context, match
reasons, logged conversations, interaction history, and a full review form inline - roughly half a
page each, and worse on a phone. Each card now shows name, title, and status chips, with everything
else behind an "Open details and update" disclosure. Nothing was removed; the card frame tightened
from p-5 to p-4.

**Two forms were doing the same job.** Connections and Follow Ups each carried a differently designed
conversation-capture form. Follow Ups now leads with a quick capture - who, when, paste or upload your
own notes - posting to the existing loopback endpoint, with the detailed structured form preserved
intact behind "Use the detailed form instead". The founder's existing framing copy about when to use
a conversation outcome was kept as written. On Connections the structured tagging fields moved below
the notes themselves and into an "Add optional structure" disclosure, so the optional fields read as
optional. No endpoint, field name, or stored shape changed; this is which form leads, not new capture.

**Eric Kidd was still in "Met - capture notes".** The "Waiting for a name" section added earlier only
listed conversations whose contact was unidentified. A conversation filed under a wrong but plausible
name - "Eric" for Eric Kidd, or a misspelling - is equally orphaned and that filter cannot see it, so
the founder had no way to find or fix it. The section now lists every saved conversation with the name
it is currently filed under, unidentified ones first, each correctable. It states that a conversation
reaches a follow-up card only when the name matches, that a near-miss leaves it attached to nobody, and
that nothing has been deleted. This still does not establish what happened to the Eric Kidd notes; it
makes the stored records visible so the founder can see whether one exists under a wrong name or is
genuinely absent.

Verification: typecheck clean, 499 tests passing, SSR build passed. Connections rendered signed-out
confirms the optional-structure disclosure. The Follow Ups capture and person cards sit behind the
`queue.length` branch and could not be rendered without a session, so their markup was confirmed in
source and by a clean compile only; a founder pass is required.

Noted while working, not fixed: the Follow Ups capture forms are gated behind a non-empty queue, so a
user with no imported network cannot capture a conversation there at all. Contact titles from import
can be mis-parsed - Eric Kidd renders as "Managing Director, Custom Software at Senior Lead
Programmer, Managing Directo", title and company apparently swapped and truncated. Both are open work.

## Consolidated status - 2026-10-21

`Consolidated Finish Plan.md` reconciles this plan against the Autumn phases, the Rethink, the
baseline, and the current code. From this document specifically, still outstanding: the section 10
step 4 imported-job slice (a stated precondition for calling the redesign complete), the section 8
recommendation repair gate, the People route consolidation, extracting the import block so first use
can lead with it, and the open acceptance work - first use on an empty account, an induced analysis
failure and retry, and screen-reader testing.

## Section 8 repair gate - diagnosed 2026-10-21, four of six repaired

Each symptom was traced to a specific mechanism rather than assumed. Regression tests are in
`src/lib/cip/recommendation-repair.test.ts`.

Duplicate hospital changes: `buildStrategicState` built its delta list from watched employers and
employer candidates independently, with no cross-list dedupe, so an organization that was both
produced two "moved" lines. The watched record now wins and the candidate line is suppressed.

Duplicate Christopher Diak follow-ups: `buildFollowUpObligations` emitted one obligation per
conversation record, not per person. The earlier exact-title hypothesis about
`replaceConversationOutcome` was not the main cause: `dedupeConversationOutcomes` keys on
`sourceRef`, which differs between a raw upload and its structured extraction, so both records
survived and each produced its own obligation. Obligations now collapse per contact on a normalized
name; the kept one absorbs an employer or lane the others recorded and says how many further
conversations also recorded a follow-up, so nothing is silently dropped.

Raw conversation text in place of a concise objective: `loopback.ts` stored the entire note as
`marketSignal` when extraction returned none, so every surface that displays a market signal showed
a wall of raw text. Only an extracted finding is stored there now; the note remains verbatim in
`rawNoteExcerpt`. The heuristic extraction path already supplies a first sentence when the AI path
is unavailable, so this does not empty the field in normal use.

Employer movement described as a strengthened lane: in `exploratoryLaneCap`, the presence of
`relatedEmployer` on any matching conversation counted as strong support and exempted a speculative
lane from the research cap. Naming an employer is employer context, not evidence that the career
direction is viable. A lane now scores identically with and without an employer named, which is
pinned by test.

A CRNA opening in founder guidance: appears structurally addressed by `assignPostingsToLanes`
(f5ae4fd) - a posting validates only the lane its title fits best and needs a synonym hit or two
shared tokens, so an unrelated clinical role is assigned to no lane even when its employer is
relevant. This is a reading of the code, not a live confirmation; it stays open until a briefing run
shows it.

Old obligations resurfacing without a resolution path: NOT fixed. There is no notion of a resolved
obligation in `strategic-state.ts` - any outcome carrying a promised follow-up or due date remains an
obligation indefinitely. Fixing it means recording that an obligation was met or dropped, which is
new persistence and a deliberate next slice, not a scoring tweak.

Verification: typecheck clean, 507 tests passing (499 + 8 new), SSR build passed. These are unit-level
repairs; a founder briefing run is still needed to confirm the queue reads correctly end to end.

## Fixed 2026-10-21: the recent-conversations list described the record, not the conversation

Founder captured the June Eric Kidd conversation through the new quick-capture form, supplying the
name and the June date. The saved outcome holds both correctly - it appears right everywhere that
reads the outcome - but the "Most recent" list under Saved conversation notes showed
"Conversation outcome: Pasted conversation notes" dated 10/21/2026.

The list was rendering the `career_sources` row's `title` and `created_at`: how the note arrived and
when it was saved, not who the conversation was with or when it happened. It now renders from the
parsed, correction-applied outcomes, showing the contact and the conversation date, falling back to
"saved <date>" when no conversation date was captured and to "Contact not identified" when extraction
found no person. This also fixes the display for every record already stored.

Separately, loopback titled the stored record after the note's filename, so a pasted note became
"Pasted conversation notes" regardless of who it was about. New records are titled after the contact
when one is identified, matching the structured-summary path; a record with no identified contact
keeps the filename title rather than inventing a person. Existing titles are unchanged - the list no
longer depends on them.

Verification: typecheck clean, 522 tests passing, SSR build passed, page renders. The populated list
needs a founder pass; it cannot be exercised without their session.

## Fixed 2026-10-21: order conversations by when they happened

Founder follow-up to the display fix above: with conversation dates now shown, the June Eric Kidd
conversation still sat above a July one, because the lists were ordered by `created_at` - the save
date - while displaying `conversationDate`. A conversation entered months later jumped to the top.

Ordering now uses `conversationRecency`: the conversation's own date, falling back to the save time
only when no conversation date was captured, so such a record still sorts somewhere sensible rather
than to the bottom. The sort runs before the five-most-recent slice, so "Most recent" is the five
most recent conversations rather than the five most recently typed in. The same order applies to the
full list of saved conversations, within its unidentified-first grouping.

Pinned by test, including that a June conversation entered in October sorts below a July one, that
the result does not depend on input order, that the conversation date is preferred over the save
date, and that an unusable date does not throw. One test had to be rewritten after it failed:
`buildConversationOutcome` defaults an empty conversation date to today, so a record with no
conversation date can only come from storage, and the fallback has to be exercised by blanking the
field rather than by asking the builder for it.

Verification: typecheck clean, 528 tests passing, SSR build passed.

## Fixed 2026-10-21: reading a saved conversation invented today's date

The ordering change above made the list worse, and the founder caught it: two records showed
10/21/2026, and Eric Kidd disappeared from the list entirely.

Root cause, latent until the display changed. `parseConversationOutcome` passes the stored date to
`buildConversationOutcome`, which defaults an empty conversation date to today. Defaulting to today
is right when capturing something new and wrong when loading something saved: every record that
never stored a conversation date read as if the conversation had happened today. While the list
displayed `created_at` this was invisible; once it displayed the conversation date, those records
showed today's date and sorted above everything, pushing Eric Kidd's real June conversation off the
five-item list.

Reading a record no longer invents a date for it. An undated record stays undated, sorts by when it
was saved, and displays "saved <date>" so the difference is visible rather than guessed. Capturing a
new conversation with no date still assumes today, which is pinned by test alongside the read path.
The list cap went from five to eight so a seven-record history is not silently truncated.

Verified by simulating the founder's actual records through the real parse, sort and display logic:
Christopher Diak 10/7, Alexis Jamba 9/23, Vince Berk saved 9/14, Alex Herzog 8/15, Contact not
identified saved 8/6, Eric Kidd 6/12. No invented dates, and the June conversation sits below the
July and September ones as it should.

Process note worth keeping: the previous two fixes were verified with unit tests and a signed-out
page render. The signed-out page cannot show conversation data at all, so a display change shipped
without ever being looked at. Where a change alters what signed-in data looks like, simulate the real
stored shapes through the real functions and read the output, or ask the founder for a sample.

## Fixed 2026-10-21: the resume Print / PDF button did nothing

Founder reviewed the de-foundered data, generated a new resume, and found the Print / PDF button
non-functional.

Cause: the handler called `window.open("", "_blank", "noopener,noreferrer")`. Those options make
`window.open` return `null` - the opener reference is exactly what they sever - so the very next
line, `if (!printWindow) return;`, bailed every time. The button had never worked from the moment
those options were added, and failed silently because the guard returned without saying anything.

Verified in a browser rather than reasoned about: `window.open("", "_blank", "noopener,noreferrer")`
returned `null`, including from inside a real click handler.

Fixed by not using a pop-up at all. The resume now prints from a hidden iframe, which the pop-up
blocker is not involved in, so it also works for users who block pop-ups - a failure this code could
never have distinguished from the bug. The frame is removed on `afterprint`, with a timeout fallback
because that event does not fire everywhere, and a failure to open the print dialog now says so and
points at Export .doc instead of failing silently.

Verified by running the shipped logic in the browser pane, in the same environment where the pop-up
path returned null: the iframe document was created, the resume markup written and readable, the
title set, and `print()` available. The print dialog itself cannot be exercised there, so the founder
should confirm the dialog opens with the resume in it.

Noted: no other `window.open` call in the pages carries these options.

## Implemented 2026-10-21: closing out a follow-up (last open section 8 item)

An obligation was derived from a conversation and never had an end. Any outcome recording a promised
follow-up, due date or next action made the user owe that person something indefinitely, so old
promises kept resurfacing in briefings with no way to clear them.

The Follow Ups page now has "What you promised": the open follow-ups taken from the user's own
conversations, each with "I did this" and "No longer needed". Resolution is an additive
`follow_up_resolution` record, so the conversation is untouched - it stays as evidence and keeps
scoring lanes and employers - and only the debt is closed. Reopening is supported and supersedes a
closure without deleting it. The section sits outside the contact-queue branch, because a promise is
owed whether or not a contact list has been imported.

An obligation is identified by the conversation that created it: `sourceRef` where a save assigned
one, otherwise the promise text itself. So two different promises to the same person stay two
obligations, and a promise made in a later conversation is still owed after an earlier one is closed
- both pinned by test. An unrecognised stored state leaves the obligation open, because failing
toward "still owed" is safer than telling someone a promise was kept. The key is length-bounded:
unbounded, a wordy promise would produce a key longer than the endpoint accepts and closing it would
fail with nothing explaining why.

The endpoint is same-origin guarded, authenticates before writing, Zod validated and body-size
capped, and rejects off-site return paths. Unlike corrections and removals there is no target row to
check ownership against, because an obligation is derived rather than stored; the record is written
under the signed-in user's id and only ever read back for them.

Verified by simulating the flow through the real functions: three open obligations, marking the
oldest done leaves two, reopening restores three, and the key the interface submits matches the one
`buildFollowUpObligations` derives. Typecheck clean, 583 tests passing, SSR build passed. A founder
pass on the live page remains.

## Implemented 2026-10-22: bring a job found elsewhere (section 7, slice 1)

Capture and honest state. A user can bring in a job from anywhere by pasting a link, the posting
text, or both, from Opportunities. CIP keeps exactly what was supplied with the capture time, and
claims nothing it has not checked.

Where imports live, and why it needs no migration. `job_search_observations` belongs to a search run
and is read run-first everywhere, and an import has no run; making `run_id` nullable would have meant
a migration and touching every posting query. Imports are additive `career_sources` records with
`source_type = "imported_job"` instead. A useful consequence: section 7 requires that an unverified
import never counts as lane validation, and because lane scoring reads observations by run, that is
now true by construction rather than by a filter somebody has to remember. Dispositions still apply,
because `posting_dispositions` is keyed by normalized URL and knows nothing about runs.

The three questions stay separate on the card: "Is the listing real and live?" and "Does it suit
you?" are shown side by side, each able to say it has no answer yet. Pasted text reads as the user's
own material, not a listing. A reachable page says the page is live and explicitly not that the
employer is hiring or will reply. An unreadable page says it could not be checked either way and that
being unreadable does not make a posting fake - a login wall and a bot block look identical from
here. A closed posting is reported as the source saying so, not as CIP's own finding. The fit panel
states plainly that no assessment exists yet rather than showing a score.

Dedupe runs against both prior imports and anything the weekly search already found, so one posting
does not become two records with separate statuses. A matching link or requisition is definitive and
is declined; a matching title and employer is likely but not certain, so it asks and lets the user
confirm with "Add it anyway".

Found and fixed while building: `normalizeUrl` kept the whole query string, so the same posting
shared with a tracking tag was a different posting identity - a status saved on one did not follow to
the other, and carry-forward dedupe across runs would miss it. It now drops a narrow list of known
tracking parameters (utm_*, gclid, fbclid and similar) and sorts the rest. Functional parameters are
deliberately kept: a job id or iCIMS' in_iframe decides which posting the page shows, and merging two
postings into one identity is far worse than keeping two copies of one. Note for the hosted database:
existing `posting_dispositions.normalized_url` values written before this change retain their
tracking parameters, so a status saved on a tagged link may need re-setting; the employer+requisition
secondary match in `matchDisposition` already covers most of that case.

Security: same-origin guarded, authenticates before storing, Zod validated with length caps, body
capped at 60 KB, and non-http(s) schemes refused so `javascript:` or `data:` can never be stored as a
link. Importing performs no outbound fetch at all in this slice.

Verification: typecheck clean, 699 tests passing (25 unit, 11 endpoint boundary), SSR build passed,
and every card state was printed through the real functions to check what it claims.

The initial implementation surfaced the actions on Opportunities. The later completion pass adds
the remaining Workbench visibility and attribution observations; see the dated section 7 entries
below for the implementation state and limits.

### Import promoted to the top of Opportunities - 2026-10-22

Founder feedback: bringing in a job meant scrolling the whole page to reach it. That is the wrong
weighting for an action CIP expects to be frequent - the founder's point is that CIP will be used
alongside other job trackers and searchers rather than replacing them, so importing is routine, not
occasional.

"Bring a job you found" now sits in the top action row beside Search preferences and Employers, as
the primary (filled) action of the three. The form itself became a disclosure, so the section stays a
short landing target rather than a wall of fields: clicking the button opens it, scrolls to it, and
puts the cursor in the Job title field. A direct `?bring=1` link opens it server-side, so a bookmark
or the back button works without relying on script.

Two things the browser check caught that reasoning alone would not have. The anchor's own hash
navigation resets focus to the document after the click handler runs, so the first `focus()` call was
silently discarded - the panel opened but the cursor never arrived. Deferring it fixes that, and the
deferral uses a timeout rather than an animation frame because frames do not fire while a tab is
hidden, which would have left the same bug in a less obvious place. Verified by running the page's
own inline script against an injected panel: the panel opens on click and the Job title field holds
focus.

## Implemented 2026-10-22: imported-job fit assessment (section 7, slice 3)

Fit is produced independently of whether the listing is real, and shown beside it, so neither
conclusion launders the other. The app's reading is labelled as its reading, with a confidence, and
the user can overrule it.

Everything compared comes from what the user supplied: their stated salary floor, work models and
exclusions, their saved career lanes, and the posting text they pasted. Nothing infers a salary,
credential, eligibility or experience level that is not written down. Where the posting is silent the
finding is "unknown", which is reported as a real finding rather than filled in - a posting that does
not state pay yields "pay not stated, nothing is assumed about it", never "pay too low". Every
finding names its source so the reader can check it.

The recommendation reuses the existing vocabulary (talk_first, check_funding, apply, monitor, skip)
and explains a next action in words rather than a score; no percentage is produced anywhere. The
deterministic path never recommends applying - nothing it can see from a pasted posting justifies
telling someone to apply - but the user can set "Apply" themselves, and that is recorded as theirs.

Corrections are additive: the app's reading and the user's conclusion are both kept, so the
difference between them can inform later analysis rather than only the final answer surviving.

Caught by simulating the panel rather than by reasoning: two summaries contradicted their own
findings. A job with pay below the floor and the wrong work model said "worth keeping an eye on"
while leaving both conflicts unmentioned, and an off-lane job said "this lines up with what you want"
when the lane overlap was unknown. The summary now names every conflict and distinguishes "matches
your constraints" from "matches a direction you are pursuing". Both are pinned by test.

### Completed 2026-10-22: Workbench handoff, AI assistance, and source observations

Imported jobs now appear in the Workbench's Jobs to review panel alongside the latest search
summary. Each imported item shows its current check state and the latest fit recommendation, with a
direct fit-assessment action in Workbench. Opportunities remains the full detail, verification, and
editing surface.

The assessment action uses a standard POST/redirect so a successful save reliably reloads the new
assessment and its visible confirmation. The prior htmx form returned an empty body and depended on
an HX redirect being processed, leaving no obvious result when that did not happen. The current
check and assessment actions show the shared progress panel, disable the clicked button, surface
server errors, and stop waiting in the browser after their request deadline. Listing verification
makes a guarded page request and matches the title/requisition; it uses no AI. The HTTP request is
capped at 8 seconds and a 10-second outer deadline also covers DNS and body reading. A timeout is
saved as “verification unavailable,” never fake or closed. The browser stops waiting after 20
seconds. The optional fit AI request has a 15-second abort deadline and returns the deterministic
CIP assessment on timeout, provider error, or invalid output. Live acceptance still needs to confirm
this behavior on the signed-in app.

When an OpenAI key is configured, a strict-schema Responses API call may refine the recommendation
and next-action wording from deterministic findings and curated CIP context. It cannot add findings,
recommend Apply or Skip, or contradict a deterministic mismatch. Valid evidence references are
shown explicitly on the card. Missing keys, malformed output, provider failures, timeouts, or unsafe
contradictions return the deterministic assessment.
The card labels AI-assisted versus deterministic readings, and both remain explicitly CIP's
interpretation rather than fact. The user's correction remains a separate additive record.

Each check now stores cautious observations: whether a distinctive employer word appears in the
supplied source hostname, and whether the supplied posting text explicitly mentions an application
fee/payment or sensitive identity/financial data request. These are review prompts only. A domain
clue does not prove employer identity, a hosted ATS domain is not treated as suspicious by itself,
and a text match does not establish fraud or safety. Observations display with the check history.

Imported jobs can now be edited through an additive revision. Each revision retains two source URLs
and its own pasted text for each site; the UI shows the captures separately and the fit assessment
receives both with source labels. Editing invalidates the current check and fit result until the user
runs them again. Workbench job actions now sit below the summary at tappable sizes instead of being
compressed into the same row. The imported-job summary keeps its action row directly under the
title and status to avoid the large empty vertical gap visible in the 2026-10-22 screenshot.

**Acceptance limits still open:** this still does not complete every aspiration in the original
section 7 contract. Imports accept two links and pasted text, not document attachments. The listing
check currently checks only the first link. Attribution remains a hostname clue plus the existing
title/requisition check; it does not independently corroborate employer identity or detect an
off-domain application redirect. Red-flag phrases are matched only against user-pasted text, not
fetched page contents. Fit does not yet compare duties, qualifications, scope, geography, or
transferable evidence and proof gaps in a posting-specific way. Founder live acceptance must confirm
the layout, fit result, timeout fallback, and edited two-source flow before section 7 is called closed.

### 2026-10-22: imported-job employer corroboration repair

The Check listing action now runs the bounded direct source check alongside optional AI-assisted employer research. The Responses API uses web search (at most four tool calls, 2,200 output tokens, a 25-second provider deadline), strict structured output, and a deterministic unavailable result when the key, provider, schema, or source grounding fails. Only public employer/title/description/source context is sent; personal CIP career evidence is excluded.

Research URL candidates must be supported by independently SSRF-guarded page reads containing the employer name and matching source quotes. Provider source-list membership was initially required but was removed after live rechecks exposed inconsistent URL metadata; web-tool execution is still required. Company-business consistency remains an AI inference with low/medium confidence and correctable job context. Careers corroboration requires the role title on the actual link and a matching supplied URL; tracking parameters are ignored while identity parameters such as Indeed jk are preserved. Both quoted and unquoted HTML links are supported. Alternate same-title roles can be offered for comparison without declaring two postings identical. Direct page status, employer corroboration, business consistency, and personal fit remain separate. Research never upgrades a blocked/script-only posting to verified_open.

The UI shows research, checked source quotes, links, confidence, and incomplete states. The success flag now precedes the URL fragment, fixing invisible checked confirmation. A 55-second browser deadline and independent request watchdog clear indicators, restore buttons, and advise reloading before retrying if saving may have continued. Existing checks remain readable; malformed research is ignored. Results append to the existing imported_job_check records; no migration is needed.

Verification: the full suite passed before final refinements; focused regression tests cover source fabrication, blocked pages, provider failures, query-string job identity, unquoted careers links, alternate-role suggestions, legacy parsing, redirects, and animation cleanup without a global htmx object. A live read-only Vetcove check found the company About/Careers pages, grounded quotes, confirmed the exact careers-to-Ashby URL, and returned medium-confidence business consistency. It created no career records. An authenticated browser session became available after startup. Subsequent button checks saved additive observations on the genuine Vetcove import; see the repeat-check follow-up below.


### 2026-10-22: repeat-check reliability follow-up

Founder acceptance found research fluctuating from supported business context to unavailable on the same import. The server logs identified both business and careers candidates rejected as not_in_web_sources, despite earlier readable pages. The provider source metadata was being used as an exact URL allowlist. That metadata is not stable across runs, aliases, or redirects and must not veto actual fetched evidence.

The web tool still must execute. Every candidate is now checked by the SSRF-safe fetcher, HTTP status, employer name, and matching visible quote, independently of provider URL-list membership. Unicode punctuation and whitespace normalize before quote matching. Invented quotes and unreadable pages still fail; one source throwing does not discard a separately readable source. Business-explanation sentences remain available while sentences asserting listing provenance are excluded from that field.

A failed refresh now preserves the last supported assessment in the display with its original date and an explicit not-revalidated notice, alongside the latest failed attempt. It does not copy old evidence into a new successful check, erase failure history, combine different jobs, or reuse findings from a superseded import revision. All records remain additive.

Verification includes repeat runs with changing provider metadata, punctuation variants, thrown reads, fabricated quotes, missing web-tool execution, failed-refresh preservation, cross-job and revised-import isolation. The rebuilt signed-in page correctly showed the earlier dated findings above the founder's failed attempt. A subsequent button check freshly corroborated the exact Vetcove careers-to-Ashby link, saved medium-confidence business consistency, and finished with the indicator hidden and button enabled. Broader launch gates remain open.

Additional repeat-click diagnosis: after a successful check, the page already has /opportunities?checked=1#imported-jobs. A second HX-Redirect to that identical fragment URL can perform no full navigation. htmx deliberately keeps indicators while expecting navigation, leaving stale output and a disabled button even though the request returned. Successful check responses now also send HX-Refresh: true, explicitly forcing a reload at the same destination. Endpoint regression coverage asserts both headers. The full suite passed (795 tests), and the final refresh-header change passed all 12 endpoint tests. Founder requested the next button test after server startup; do not record that user acceptance as passed in advance.

## 2026-10-23: personal-fit analysis and reversible job archives

Founder-approved scope: compare the saved job description against each of the three actual career lanes and the user's broader career evidence; provide a 1–10 alignment score with reasons/confidence/recommendation; distinguish mandatory qualifications, preferred credentials, equivalent-experience allowances, genuine gaps, and unknowns. A score is not a hiring probability or a promise that a job was literally made for someone. Missing education evidence is not proof of a missing degree.

The new structured fit path uses original resume/intake answers, recent user evidence responses, project/source analyses, lane rationales/proof gaps, strategy evidence, goals and relevant conversation signals. User statements remain distinct from inferred strategy/project interpretations. Intake contact fields are not separately included. Context is bounded (up to 60 recent records per supporting source type and 85 text excerpts); older/omitted information may need review. All reads authenticate and filter user_id. Storage failures stop the assessment rather than presenting empty context as a successful fit decision.

Responses output must compare every supplied lane, use actual posting quotes and valid profile references with matching quotations, and distinguish required/preferred/equivalent requirements. Fabricated quotes, unknown references and missing/invented lanes cannot produce a scored result. Inference-only support is not proof of eligibility. Explicit credential requirements remain visible even if model output omits them. Confirmed mandatory barriers cap the score at 2, explicit exclusions at 1, unresolved mandatory requirements at 6, and material constraint conflicts at 4. Ten requires a strong lane connection, substantial distinct supported requirements, and no unresolved gaps. Deterministic/provider-failure mode shows useful basic checks and visible credential questions but leaves the full personal-fit score unknown. Recommendations and next steps stay adjacent to the score; Apply additionally requires resolved requirements and a checked listing. Interpretation is still correctable and not independently verified merely because attribution checks pass.

Assessments append to imported_job_fit records with optional versioned detailed analysis, retaining compatibility with older records. The Opportunities result includes summary, score or unscored explanation, confidence, all lane comparisons, qualification findings, and quoted profile/posting evidence. Workbench shows the saved score beside the recommendation. The request is bounded, errors remain visible, and successful responses force refresh with query parameters before the page anchor.

User-directed Not for me now archives instead of merely decorating active cards. Existing passed posting_dispositions apply immediately, and earlier user-authored Skip decisions on imports are honored. AI Skip suggestions do not archive. URL imports reuse posting_dispositions; pasted-only imports append imported_job_archive events in career_sources. Restore returns a job to active work without deleting the captured job or fit/check history, and a later explicit user decision takes precedence by time. Imported active/archive views and an expandable searched-job archive expose restore controls; Workbench hides archived imports. No new table or migration is needed. These presentation/decision changes do not repair unrelated legacy discovery relevance suggestions.

Verification checkpoint: full suite passed with 818 tests before final display refinements; focused qualification/archive/assessment tests passed after the later guards. The initial signed-in page confirmed three previously rejected searched postings moved to Archived searched jobs without a new search. Live personal-fit and archive/restore checks are in progress; do not treat this note as founder acceptance of the resulting score.


### October 23 — personal-fit grounding repair
A live test exposed an AI lane-grounding rejection. Constrain generated lane names, evidence references and job quotations to the actual supplied values through the strict response schema. Retain runtime quote checks, and suppress title-keyword lane conclusions when the full comparison fails. The next live test must confirm a grounded assessment rather than treating fallback as completion.

October 23 follow-up: live provider calls exceeded the 25-second personal-fit deadline. Raise the bounded provider deadline to 60 seconds and both browser deadlines to 90 seconds; log only request sizes and elapsed time so slow calls can be diagnosed without exposing career data.

October 23 live trace: 85 evidence records / 49,167 characters, posting 10,317 characters; provider completed in 15.4 seconds. Whole-assessment rejection came from one unsupported lane alignment. Downgrade that lane to unknown and preserve grounded remaining lanes and requirements; retain rejection for invented identifiers and quotations.

October 23 evidence attribution repair: provider output completed in 15 seconds but failed exact personal-quote transcription. AI now selects stable evidence excerpt references; the server attaches verbatim saved excerpts. Split selected career evidence into citable 550-character excerpts, retain runtime reference validation, and never rely on generated quotes for personal attribution.

Live verification after reference-only citation repair: authenticated Vetcove Assess fit again completed in 17.365 seconds, saved and rendered AI-assisted personal fit 10/10 with Talk to someone first, three lane comparisons (partial/strong/partial), and source-backed requirement excerpts. Type check plus 27 focused tests passed. This confirms execution and persistence; scoring remains an interpretation for user review.
