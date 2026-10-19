# Workbench and Career Loop Redesign

Status: founder-approved direction, documented 2026-10-19. Planning only; this document does not claim implementation.

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

1. Plan and prototype: preserve founder purpose, map both journeys and the action lifecycle, inventory existing stores/analysis dependencies, and sketch the Workbench plus an opened task. Reproduce recommendation problems.
2. First complete loop: employer research capture, durable outcome, explicit strategy update, supported changes, and action resolution. Include failure/retry and no-new-information paths.
3. Connect existing pages: Intake, Evidence, Career Lanes, relationships, funding, and opportunity handoffs with shared capture and persistent action context. Preserve the deeper questions.
4. User-supplied job slice: import, dedupe, source verification, separate personal-fit evaluation, saved recommendation/correction, and Workbench action. This must be delivered before declaring the redesign complete.
5. Consolidate navigation and apply the shared visual design after the working flow is proven. Earlier prototype work can establish the visual direction.

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
