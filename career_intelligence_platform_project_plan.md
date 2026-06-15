# Career Intelligence Platform (CIP)
## Project Planning Document

### Version
0.1 — Foundational Architecture & MVP Planning

---

# 1. Vision

Build an AI-assisted Career Intelligence Platform that helps users:

- Understand their professional strengths
- Discover strong-fit career opportunities
- Identify emerging industry trends
- Improve resumes and LinkedIn profiles
- Strategically position themselves for higher-income career paths
- Build long-term career trajectories instead of mass-applying blindly

The system should function less like a generic “AI apply bot” and more like:

> A career strategist + labor market intelligence system.

The initial test user will be the founder, but the system should be architected from the beginning with future SaaS expansion in mind.

---

# 2. Core Product Philosophy

## What We Are NOT Building

We are NOT building:

- A spam auto-apply engine
- A generic resume keyword optimizer
- A fake AI recruiter
- A hallucination-heavy “career coach”
- A blind ATS gaming tool

---

## What We ARE Building

We ARE building:

- A research-backed career intelligence system
- A labor market analysis platform
- A user modeling and trajectory engine
- A strategic opportunity recommendation system
- A trusted AI-assisted advisor

---

## Product Interpretation: What CIP Is Really Trying To Do

CIP is not meant to be "upload a resume, get a polished resume." That is too shallow for the user who is trying to figure out a next step instead of merely tailoring an application.

The product should behave more like a thoughtful career coach who keeps widening and sharpening the picture until the user can see options they were too close to notice. It should combine:

- Who the user is
- What the user has actually proven
- What the user wants and needs
- Where the market is creating opportunity
- Who the user already knows or can legitimately reach

This makes CIP different from AI as a search engine and different from AI as a resume tailor. Search returns information. Resume tailoring returns packaging. CIP should return interpretation: a proof-backed understanding of the user's background, plausible career hypotheses, relationship paths, open questions, and next actions.

The system should help the user notice:

- Patterns in their experience they may be underselling
- Career adjacencies that are plausible but need validation
- Gaps or risks that should become questions instead of confident claims
- Opportunities that match both evidence and constraints
- Existing relationship paths they may not realize they already have

The coaching posture matters. CIP should ask better questions, name uncertainty, show its evidence, and avoid locking the user into one story too early. The desired feeling is not "the AI generated an answer." The desired feeling is "this helped me understand my own career more clearly and gave me a respectful next move."

---

# 3. Core Product Goals

## Primary Goal

Help users identify and secure:

- Higher quality job opportunities
- Better compensation paths
- Better career alignment
- Faster market positioning

---

## Secondary Goals

- Improve LinkedIn profiles
- Improve resumes
- Detect career gaps
- Recommend skills
- Identify emerging industries
- Provide weekly labor market intelligence
- Create long-term career strategy tracking

---

# 4. User Problem Statement

Modern job searching is fragmented and inefficient.

Users currently deal with:

- Thousands of low-quality listings
- Fake/ghost job postings
- ATS black boxes
- Poor application targeting
- Generic AI-generated resumes
- Lack of career strategy
- No visibility into emerging opportunities

Most systems optimize for:

> Number of applications.

This platform will optimize for:

> Career outcomes.

---

# 5. Initial Target User

## Founder Test Case

Profile:

- Mid-career professional
- Leadership experience
- Entrepreneurial background
- Transitioning into AI-enabled technical work
- Interested in remote/hybrid opportunities
- Seeking ~$120K/year trajectory

This founder test case is strategically valuable because:

- The user has real operational experience
- The user is learning modern development workflows
- The user can evaluate practical usefulness
- The user understands communication and media systems

---

# 6. Product Differentiators

## 1. Deep User Modeling

The system goes beyond resumes.

Inputs include:

- Resume(s)
- LinkedIn profile
- Portfolio URLs
- GitHub
- Public websites
- Career goals
- Interests
- Work style
- Preferred industries
- Geographic preferences
- Compensation goals
- Personal narrative

---

## 2. Research-Backed Recommendations

Recommendations MUST:

- Be source-backed
- Include citations/references where possible
- Avoid hallucinated opportunities
- Include confidence scoring
- Explain reasoning

---

## 3. Strategic Career Analysis

The system should identify:

- Transferable strengths
- Career adjacencies
- Emerging opportunities
- Compensation growth paths
- Underleveraged experience
- Strategic positioning

---

## 4. Weekly Career Intelligence Reports

Potential “killer feature”:

A recurring AI-generated labor market intelligence briefing.

Example outputs:

- Top opportunities
- Industry shifts
- Recommended networking
- Skill demand changes
- Compensation movement
- Resume updates needed
- LinkedIn recommendations

---

# 7. High-Level Product Architecture

## Layer 1 — Identity Graph

Purpose:

Build a structured understanding of the user.

### Inputs

- Resume upload
- LinkedIn URL
- Portfolio URLs
- GitHub URL
- Questionnaire
- User interview prompts
- Career preferences

### Outputs

Structured profile object:

- Skills
- Experience themes
- Industry exposure
- Leadership level
- Technical maturity
- Career archetype
- Preferred roles
- Salary target
- Geographic flexibility

---

## Layer 2 — Career Intelligence Engine

Purpose:

Analyze user strengths and strategic positioning.

### Responsibilities

- Infer career pathways
- Identify hidden strengths
- Recommend adjacent roles
- Estimate compensation potential
- Detect skill gaps
- Recommend portfolio improvements

---

## Layer 3 — Labor Market Research Engine

Purpose:

Collect and structure job market data.

### Sources

- Greenhouse
- Lever
- Public company job boards
- Remote job boards
- Startup job boards
- RSS feeds
- Industry trend sources
- Funding databases

### Features

- Job ingestion
- Deduplication
- Semantic tagging
- Salary estimation
- Industry categorization
- Trend analysis

---

## Layer 4 — Match & Recommendation Engine

Purpose:

Generate explainable job recommendations.

### Outputs

- Match score
- Why the role fits
- Missing skills
- Compensation estimate
- Strategic value
- Suggested resume changes
- Suggested networking actions

---

## Layer 5 — Career Asset Optimization

Purpose:

Improve the user’s professional presentation.

### Features

- Resume refinement
- LinkedIn optimization
- Profile positioning
- Project recommendations
- Narrative consistency
- ATS readability checks

IMPORTANT:

The system should NEVER invent:

- Fake metrics
- Fake accomplishments
- Fake job history
- Fake education
- Fake certifications

All modifications should:

- Be traceable
- Be editable by user
- Include confidence scoring
- Clearly distinguish AI suggestions from verified user data

---

## Layer 6 — Career Intelligence Briefings

Purpose:

Provide recurring strategic insight.

### Weekly Outputs

- Best-fit opportunities
- Emerging trends
- High-value companies
- Skill gaps
- Suggested actions
- Industry movement
- Compensation insights

---

# 8. Hallucination Prevention Strategy

This is a critical architectural requirement.

The platform MUST prioritize trust.

---

## Anti-Hallucination Principles

### 1. Source Grounding

Every recommendation should:

- Link to source material
- Reference job data
- Show extracted evidence

---

### 2. Confidence Scoring

Outputs should include:

- High confidence
- Medium confidence
- Low confidence

---

### 3. Structured Extraction

Prefer:

- Structured parsing
- Semantic tagging
- Controlled transformations

Over:

- Fully generative rewriting

---

### 4. Human Approval Layer

The user always approves:

- Resume edits
- LinkedIn edits
- Suggested claims
- Application materials

---

### 5. Audit Trail

Track:

- Original source
- AI modifications
- User edits
- Final outputs

---

# 9. Suggested Technical Stack

## Existing Foundation

Base platform:

- AHA Stack

Potential technologies:

---

## Frontend

- Next.js
- Tailwind
- shadcn/ui
- TypeScript

---

## Backend

- Supabase
- PostgreSQL
- Edge Functions
- Row Level Security

---

## AI Layer

- OpenAI APIs
- Anthropic APIs
- Embeddings
- RAG pipelines
- LangGraph (future)

---

## Data Processing

- Vector embeddings
- Semantic search
- Structured extraction
- Classification pipelines

---

## Research Layer

Potential ingestion:

- RSS
- Job board APIs
- Greenhouse APIs
- Lever APIs
- Company career pages

IMPORTANT:

Avoid fragile or legally risky scraping strategies where possible.

---

# 10. MVP Definition

## MVP Goal

Build a trusted AI-assisted career strategist.

NOT a full autonomous application engine.

---

## MVP Features

### User Intake

- Resume upload
- LinkedIn URL
- Questionnaire
- Career goals

---

### Career Analysis

- Skill extraction
- Career pathway analysis
- Strength identification
- Compensation estimation

---

### Job Research

- Pull relevant openings
- Rank opportunities
- Explain matches

---

### Career Recommendations

- Resume suggestions
- LinkedIn suggestions
- Skill recommendations
- Portfolio recommendations

---

### Weekly Briefing

- Weekly opportunity digest
- Market trends
- Strategic recommendations

---

# 11. Post-MVP Expansion Ideas

## Phase 2

- Networking intelligence
- Outreach drafting
- Company research dossiers
- Interview preparation
- Career path simulations

---

## Phase 3

- Team collaboration
- Recruiter mode
- Coaching mode
- Company-side hiring intelligence
- Skill roadmap generation

---

## Phase 4

- SaaS platform launch
- Subscription model
- Enterprise career intelligence tools
- University/career center partnerships

---

# 12. Recommended Development Sequence

## Phase 1 — Foundation

Build:

- Authentication
- User profiles
- Resume ingestion
- Database schema
- Intake questionnaire

---

## Phase 2 — User Intelligence

Build:

- Skill extraction
- User profile synthesis
- Career theme analysis
- Narrative engine

---

## Phase 3 — Research Engine

Build:

- Job ingestion
- Parsing
- Deduplication
- Semantic tagging
- Match scoring

---

## Phase 4 — Recommendation Engine

Build:

- Opportunity ranking
- Explainable reasoning
- Resume guidance
- LinkedIn guidance

---

## Phase 5 — Reporting Layer

Build:

- Weekly briefings
- Dashboards
- Opportunity tracking
- Trend summaries

---

## Phase 6 — Productization

Build:

- Billing
- User onboarding
- Usage quotas
- Multi-user architecture
- Analytics

---

# 13. Key Product Risks

## 1. Scope Explosion

Risk:

Trying to build too much too quickly.

Mitigation:

Stay disciplined with MVP.

---

## 2. Hallucinated Career Advice

Risk:

AI invents misleading or inaccurate information.

Mitigation:

Source-backed outputs.

---

## 3. Scraping Fragility

Risk:

Job sources change frequently.

Mitigation:

Use APIs and stable ingestion patterns where possible.

---

## 4. Generic AI Outputs

Risk:

Advice feels shallow or repetitive.

Mitigation:

Deep personalization.

---

# 14. Success Metrics

## User Success Metrics

- Interview conversion rate
- Salary improvement
- Career satisfaction
- Reduced application volume
- Increased role relevance

---

## Product Success Metrics

- Weekly active usage
- Saved opportunities
- User retention
- Resume optimization engagement
- Recommendation accuracy

---

# 15. Founder Strategic Positioning

The founder’s background creates a strong market narrative:

- Leadership experience
- Media and communications expertise
- Technical growth trajectory
- AI-enabled operations mindset
- Community/media systems understanding

This positions the platform uniquely against:

- Generic AI resume tools
- Low-trust auto-apply systems
- Mass-market job spam products

---

# 16. Final Strategic Recommendation

The highest-value opportunity is likely NOT:

> “Apply to more jobs automatically.”

The highest-value opportunity is:

> “Help users understand where they can create the most value in the labor market.”

The platform should prioritize:

- Trust
- Explainability
- Research grounding
- Strategic guidance
- Long-term career outcomes

over:

- Application volume
- Full automation
- Generic AI-generated content

---

# 17. Immediate Next Steps

## Technical

- Finalize database schema
- Define user object model
- Define ingestion pipelines
- Define job normalization schema
- Define recommendation scoring model

---

## Product

- Design onboarding flow
- Design intake questionnaire
- Define weekly briefing format
- Design dashboard wireframes

---

## Research

- Evaluate job data sources
- Evaluate trend data sources
- Research salary estimation approaches
- Define anti-hallucination architecture

---

## Development

Build the first version for:

> One highly engaged power user.

The founder.

Then expand toward:

> A scalable career intelligence SaaS platform.

---

# 18. Employer Discovery Reset

## What We Learned

The first employer-discovery implementation created useful rails, but not the actual engine.

It included:

- Hardcoded regional employer seeds
- Hardcoded discovery sources
- A UI for geography and sector selection
- Candidate/save database tables
- A watched-employer workflow

This is not enough.

The product goal is not to show prebuilt regional lists. The product goal is to let any user enter a geography and discover credible employers in that area.

Hardcoded lists are acceptable only as test fixtures and regression checks. They should not drive normal product search results.

---

## Correct Product Direction

CIP should begin labor-market research with:

> Find credible employers in a geography, then monitor those employers for relevant roles.

Not:

> Search public job boards and hope the listings are useful.

The employer-discovery flow should be:

1. User enters a geography, such as `Sunapee, NH`, `Lyndon, VT`, `Boston, MA`, or `Burlington, VT`.
2. User optionally chooses radius, employer size, and sectors.
3. The system identifies the relevant search area.
4. The system discovers source directories:
   - Chambers of commerce
   - Economic development agencies
   - Municipal business directories
   - School systems
   - Healthcare systems
   - Higher education institutions
   - Regional planning commissions
   - Workforce boards
   - Business associations
   - Networking groups when useful
5. The system extracts candidate employers from those sources.
6. The system verifies each employer:
   - Website
   - Careers/help-wanted page
   - Location
   - Estimated employee size
   - Sector/category
   - Confidence
   - Source URLs
7. The user reviews candidates.
8. The user saves selected employers to watched employers.
9. Later, employer-specific adapters monitor those saved employers for jobs.

---

## What Must Change

### 1. Remove Hardcoded Employer Data From Normal Search

Hardcoded employers such as Dartmouth Health, King Arthur Baking, New London Hospital, and NVRH should not be returned just because they exist in code.

They should become regression fixtures only.

Example regression test:

> When running discovery for `Sunapee, NH`, the real discovery algorithm should rediscover New London Hospital, Colby-Sawyer College, Mount Sunapee, and the Lake Sunapee Region Chamber directory.

If it does not, the algorithm needs improvement.

---

### 2. Build the Actual Discovery Algorithm

For a query like `Lyndon, VT`, the app should generate and execute searches such as:

- `Lyndon VT chamber business directory`
- `Caledonia County major employers`
- `Lyndon VT economic development employers`
- `Lyndon VT school district jobs`
- `Lyndon VT healthcare employers`
- `Northeast Kingdom largest employers`
- `Northeast Kingdom business directory`

The algorithm should then:

- Find likely source pages
- Extract organization names
- Classify employers
- Estimate employer size where possible
- Locate career pages
- Store candidates with source citations
- Mark confidence and review status

This is the real Layer 3 employer-discovery engine.

---

### 3. Fix the Employer Search UI

The UI should not imply that an engine exists before it does.

The employer search page should show:

- Search geography
- Radius/search area
- Nearby municipalities included
- Source directories found
- Candidate employers found
- Largest discovered employers
- Top sectors found
- Which candidates are saved

The current target/ring graphic is only a placeholder. A real map may be useful later, but the first priority is the data engine.

Do not add Google Maps or Mapbox before the discovery engine is working. If mapping is needed, start with a simple geocoding/radius model and a clear textual area summary.

---

### 4. Use Presets Only After Search Or As Saved User Context

Saved regional presets can be useful after a user has:

- Searched a region
- Saved employers
- Built a recurring watched-employer map

They should not dominate the first-time search UI.

A new user should be able to start with:

> Boston, MA

or:

> Sunapee, NH

and receive a real discovery result, not a hardcoded list or an empty placeholder.

---

## Immediate Next Build

The next implementation should focus on the real discovery engine:

- Move hardcoded employer/source lists into fixtures or test data.
- Add a real `employer_discovery_runs` table.
- Add a source-discovery step powered by AI/web search.
- Store discovered source pages separately from employer candidates.
- Extract employer candidates from discovered sources.
- Add regression tests using Upper Valley, Northeast Kingdom, and Lake Sunapee known anchors.
- Simplify the UI around the real engine.

The goal is to stop building pretty pixels around fake data and build the employer-search engine first.

---

# 19. Product Integrity Rule

This project must not pretend unfinished systems are real.

If a capability is not implemented, the UI and documentation should say so plainly.

Examples:

- `Employer discovery engine is not implemented yet.`
- `This result is a test fixture, not live discovery.`
- `This adapter is planned but not active.`
- `This analysis uses deterministic fallback, not AI.`

Do not present hardcoded data, fixture data, placeholder visuals, or seeded examples as live search results.

Do not use polished UI to imply a working engine exists underneath.

This is especially important because CIP is intended to help people navigate a difficult job market. Users may be worried about losing work, under financial pressure, or unable to afford tools that do not deliver real value. Trust is not a nice-to-have; it is the product.

---

## Working Agreement

When developing this app:

- Be direct about what works and what does not.
- Ask questions when product intent is unclear.
- Do not hand-wave missing architecture.
- Do not hide uncertainty behind confident language.
- Push on weak assumptions.
- Separate prototype, fixture, fallback, and production behavior.
- Label AI-generated, deterministic, manually seeded, and live-sourced outputs differently.
- Prioritize useful truth over impressive UI.

The user expectation for this project is:

> No hallucination, no smoke, no fake engines.

If something needs more research, say so.

If a feature is only a scaffold, say so.

If a design is misleading, fix the design before extending it.

---

## Current Honest Capability Status

Updated 2026-06-12.

- Intake: first real pass exists; saved intake reload implemented.
- Identity graph: first real pass exists.
- AI advisor analysis: real only when `OPENAI_API_KEY` is active and the response succeeds; deterministic fallback is labeled.
- Evidence Builder, evidence re-analysis, strategic question review, linked-source analysis, evidence sufficiency score: implemented as additive `career_sources` records.
- Authentication: implemented for test use.
- Career assets / resume builder: prototype workflow. Editable builder with `.doc`/`.rtf`/print exports works; AI master-resume synthesis now runs on demand via `/api/assets/resume-draft` and is cached as additive `resume_draft` records, so the Assets page renders instantly instead of blocking 15-20s on OpenAI. Output quality still needs the structured-parsing tuning pass before it is a finished resume product.
- Network intelligence: implemented — LinkedIn/alumni/manual imports, ideal-work filter, lane validation, named-contact matches, context pools, conversation plans, and loop-back conversation notes feeding network re-analysis and the evidence ledger.
- Employer geography search: first live engine pass exists (geocoded search area + OpenAI Responses web search). The Discovery QA loop (live-search validation against known anchors, source scoring, regression fixtures) has not been run yet, so result quality is unproven.
- Employer adapters/job monitoring: not implemented. Saved/watched employers do not yet feed any monitoring or the Roles page.
- Roles (opportunities) page: still the pre-cycle Greenhouse/Lever ingestion scorer with operator-configured sources. It does not yet consume validated lanes, ideal-work constraints, saved employers, or conversation intelligence. Empty state shows clearly labeled fixtures. Job-board search lanes: planned, not built.
- Weekly briefing: scaffold that counts watched employers and matches. It does not yet compute week-over-week deltas or read conversation notes.
- Nav stepper: shared across pages; step-completion states from saved data not yet implemented.

The employer page must continue to label the map layer, adapters, and any unfinished monitoring features honestly.

---

## First Engine Pass Implemented

Added:

- `business-search-engine.ts`
- `/api/employers/discover` live search path
- `employer_discovery_runs` database table
- UI status label for whether live business search is configured
- Clear empty/not-configured states instead of fixture results

The old hardcoded discovery seed path has been removed from the normal employer search endpoint. Known employers can still be kept elsewhere as fixture/regression targets, but they should not power user-facing search results.

Next validation tasks:

- Run live searches for `Sunapee, NH`, `Lyndon, VT`, `Upper Valley`, `Burlington, VT`, and `Boston, MA`.
- Confirm returned employers are source-backed.
- Confirm sources are useful and clickable.
- Check whether known anchors are rediscovered without being hardcoded.
- Add regression tests after the first live-search sample set is reviewed.

## Employer Search Hardening Plan

The employer discovery engine is a real prototype, not a finished trusted engine yet.

What is solid:

- GeoCodio is incorporated as the primary geocoder when `GEOCODIO_API_KEY` is configured.
- The product flow is correctly geography-first: discover credible employers in a labor market before monitoring jobs.
- Hardcoded fixture employers are no longer returned as normal search results.
- The result schema supports source-backed candidates, source pages, confidence labels, and candidate review.

What still needs to happen:

1. **Live-search validation**
   - Run repeated searches for `Sunapee, NH`, `Lyndon, VT`, `Upper Valley`, `Burlington, VT`, and `Boston, MA`.
   - Confirm the engine finds real local anchors.
   - Confirm source pages are useful, clickable, and connected to returned employers.

2. **Source quality scoring**
   - Add app-side scoring rules, not only AI-returned scores.
   - Chambers, municipal directories, school districts, hospital systems, economic development pages, workforce boards, and employer-owned career pages should score differently.
   - Penalize vague, stale, uncited, SEO-only, or geographically mismatched sources.

3. **Dedupe and saved-state discipline**
   - If an employer is already watched, future discovery runs should mark it as already saved or avoid returning it as a candidate.
   - Duplicate candidates should be handled server-side, not only hidden in the UI.
   - Candidate rows should clearly distinguish new, already saved, promoted, cleared, and needs-review states.

4. **Regression fixtures**
   - Known anchors should be used as test expectations, not user-facing seeded results.
   - Example: a Sunapee-region discovery should naturally rediscover New London Hospital, Colby-Sawyer College, Mount Sunapee, and Lake Sunapee Region Chamber sources.
   - If those anchors are not found, the algorithm or source-search queries need improvement.

5. **Result inspection**
   - Each candidate should show why it was included:
     - source URL
     - geography confidence
     - employer-size confidence
     - sector/category confidence
     - careers-page confidence
   - Low-confidence candidates should be useful but visibly marked as requiring human review.

6. **Caching and rate limits**
   - Cache geocoding and nearby-place results by geography/radius.
   - Cache discovery runs by geography/radius/sectors/minimum size where appropriate.
   - Avoid repeated API spend for identical searches during testing and normal use.

7. **Employer monitoring**
   - Discovery finds employers; it does not yet monitor jobs.
   - The next product payoff requires employer-specific adapters or monitoring flows for saved employers.
   - Until implemented, the UI must keep labeling adapter/monitoring features as planned or manual-review only.

The next employer-search phase should be a **Discovery QA loop**:

1. Run a live search.
2. Inspect sources.
3. Mark source and candidate quality.
4. Compare results against known anchors.
5. Improve source queries and scoring rules.
6. Add regression tests once a geography has a reviewed baseline.

---

## Resume / Intake Intelligence Hardening Plan

The resume and intake analysis should behave like a strategic partner, not a praise generator.

The product goal is for the AI to help the user notice:

- Strengths that are truly supported by evidence
- Patterns the user may be underselling
- Career adjacencies that are plausible but need validation
- Gaps, risks, or missing proof points
- Questions worth exploring before rewriting a resume or chasing roles

What is now implemented:

- The advisor prompt explicitly separates verified resume evidence, user-stated preferences, medium-confidence inference, and open questions.
- The advisor returns an `evidenceLedger` that explains each major claim, the evidence behind it, why it matters, and what should be validated next.
- The advisor returns `explorationAreas` that turn interesting but unproven possibilities into practical research lanes.
- The advisor returns `claimSafetyNotes` so weak assumptions are visible instead of hidden inside confident prose.
- The deterministic fallback now produces a basic evidence ledger and exploration lanes when the AI service is unavailable.
- The intake result UI renders the evidence ledger and exploration lanes after the main advisor analysis.

What still needs to happen:

1. **Structured resume parsing**
   - Extract roles, dates, employers, industries, tools, measurable achievements, credentials, and project evidence.
   - Keep the original text snippets attached to each extracted fact.
   - Flag missing dates, vague claims, unexplained gaps, and unsupported seniority signals.

2. **Intake cross-checking**
   - Compare resume evidence against questionnaire answers.
   - Identify contradictions, underexplained transitions, and stated goals that do not yet have enough supporting proof.
   - Convert mismatches into follow-up questions instead of smoothing them over.

3. **Claim confidence model**
   - Every strategic claim should carry a confidence level and evidence type.
   - High confidence should require direct resume/intake support.
   - Medium confidence can use pattern recognition, but must name the inference.
   - Low confidence should become a question or experiment, not a recommendation.

4. **Career hypothesis generation**
   - Generate multiple career hypotheses from the same profile.
   - For each hypothesis, list supporting evidence, missing evidence, market validation needed, and first action.
   - Avoid locking the user into a single story too early.

5. **Resume improvement map**
   - Recommend resume edits only after the evidence ledger is built.
   - Tie every edit suggestion to a target role, missing proof point, or stronger positioning angle.
   - Separate cosmetic fixes from strategic repositioning.

6. **Interview-style follow-up loop**
   - Ask a small number of sharp follow-up questions after intake.
   - Questions should target the highest-value unknowns: outcomes, scale, leadership scope, technical depth, constraints, and preferred work style.
   - New answers should update the evidence ledger instead of starting the analysis over.

7. **Regression profiles**
   - Save a few representative anonymized intake/resume examples.
   - Test that the system does not overpraise, invent unsupported claims, or miss obvious strategic opportunities.
   - Track whether analysis improves after prompt/schema changes.

The next resume-intake phase should be an **Evidence QA loop**:

1. Parse the resume into structured facts.
2. Attach source snippets to those facts.
3. Compare facts against intake answers.
4. Generate career hypotheses with confidence levels.
5. Ask targeted follow-up questions.
6. Update the evidence ledger.
7. Only then produce resume, positioning, and opportunity recommendations.

This is the part that can make CIP feel materially different from a generic AI career coach. The system should earn trust by showing its work, naming uncertainty, and pushing the user toward better evidence.

---

## Evidence Builder Plan

The advisor analysis now creates useful open loops: follow-up questions, claim safety notes, and evidence-to-find items. Those should not be left as static text.

The next product layer is an **Evidence Builder**: a guided interview and proof workspace that helps the user answer the right questions without feeling judged.

Product principles:

- The tone should be collaborative, not interrogating.
- Questions should explain why they matter.
- The UI should reduce blank-page pressure by showing what a good answer includes.
- Answers should be saved as additive evidence records, not overwrite older intake data.
- Each answer should preserve the user's uncertainty level.
- The system should avoid turning unverified stories into public resume claims too early.
- The UI should show data health: number of saved intake versions, number of saved evidence answers, and latest timestamps from the signed-in user's Supabase session.

Recommended UI model:

1. **Question cards**
   - One evidence question per card.
   - Show the question, why the app is asking, and what a useful answer includes.
   - Include a generous answer box, optional proof/source field, and confidence selector.

2. **Evidence status**
   - Track whether the answer is `known`, `needs metric`, `needs source`, or `not sure yet`.
   - This makes progress visible without forcing fake certainty.

3. **Story structure**
   - Encourage answers that cover situation, action, scope, result, and proof.
   - The interface should help the user remember useful stories rather than demand polished copy.

4. **AI follow-up later**
   - After a user answers a card, the AI can ask one or two sharper follow-ups.
   - Example: "Can we add scale here? Was this used by 5 people, 50 people, customers, students, or a team?"
   - This should happen inside the context of a card, not as an unbounded chat window.

5. **Version safety**
   - Intake saves should create new `resume_intake` source records.
   - Evidence answers should create separate `evidence_response` source records.
   - Older records should remain available for history, comparison, and rollback.
   - The app should make additive persistence visible so users trust that new analysis did not erase prior context.

Initial implementation target:

- Add an Evidence Builder page.
- Load the newest saved intake.
- Generate cards from advisor follow-up questions, proof gaps, and exploration-lane evidence needs.
- Save each answer as an additive evidence record in `career_sources`.
- Show recently saved evidence answers on the page.

Future implementation:

- Add intake history and version comparison.
- Link evidence responses back into the advisor ledger.
- Let the AI ask targeted follow-up questions after a card is answered.
- Promote verified evidence into resume bullets, LinkedIn copy, or portfolio case-study drafts only after user approval.

## Evidence Re-analysis Plan

Once evidence answers are saved, the next advisor pass should not start from the original intake alone. It should include:

- Latest saved `resume_intake`
- All recent `evidence_response` records
- The user's confidence level on each answer
- Proof/source notes and caution notes
- The previous proof gaps and exploration lanes

The re-analysis should produce:

- Updated evidence ledger
- Stronger or weaker positioning claims
- Remaining proof gaps
- New follow-up questions
- Updated exploration lanes
- A saved `evidence_analysis` source record

This keeps the model additive. The app does not overwrite the intake or evidence answers; it creates a new analysis artifact that can be compared against prior runs.

## Strategic Question Review Plan

The Evidence Builder and Evidence Re-analysis layers still do not fully solve one important user need:

> "These are the specific questions I need this analysis to answer."

The strategic partner layer should let the user enter direct open questions and force the system to answer them from saved context.

Inputs:

- Latest saved `resume_intake`
- Saved `evidence_response` records
- Latest saved `evidence_analysis`
- User-entered strategic questions

Outputs for each question:

- Verdict: `answered`, `partially_answered`, `not_enough_evidence`, or `needs_follow_up`
- Direct answer
- Supporting evidence
- Missing evidence
- Recommended next action

Product rules:

- Do not answer beyond the evidence.
- Do not smooth over uncertainty.
- If the question is not answerable yet, say exactly what evidence would make it answerable.
- Save reviews as additive `analysis_review` source records.
- Include `analysis_review` records in backup exports.
- Show active thinking/analysis animation while reviews are running so longer AI passes do not feel frozen.

## Linked Source Analysis Plan

Project links, GitHub repositories, articles, and public websites cannot be treated as meaningful evidence simply because the user pasted URLs.

The app must inspect those sources and convert them into structured evidence.

Inputs:

- Intake `portfolio_urls`
- Intake `public_evidence`
- Evidence Builder `proof_url`
- Evidence Builder source notes that contain URLs

The linked-source analyzer should:

- Fetch public URLs when possible.
- For GitHub repositories, fetch README content first.
- For video links, fetch available public metadata and require transcript/user confirmation before making detailed production claims.
- Extract project name, source type, technologies/domains, and what the page actually proves.
- Identify likely career claims supported by the source.
- Identify what still needs user confirmation, especially the user's exact role and contribution.
- Save results as additive `source_analysis` records.
- Feed `source_analysis` records into evidence re-analysis and strategic question review.
- Cross-check source evidence against the resume/intake before asking generic role-confirmation questions.

Product integrity rule:

If the app has not fetched and analyzed a link, it should not imply that the link strengthened the user's analysis. Raw URLs are references; analyzed URLs become evidence.

If the resume and source analysis already establish a user's role or contribution, the advisor should retire that question and ask only for the next missing layer: metrics, audience, outcomes, scope, transcript, or permission to use the claim publicly.

## Evidence Rounds Plan

Evidence gathering should be iterative, but it should not become endless.

Recommended loop:

1. **Round 0: Intake**
   - Resume/work history, preferences, constraints, public links, claim boundaries.

2. **Round 1: Initial Evidence Builder**
   - Advisor follow-up questions, initial proof gaps, obvious missing source material.

3. **Round 2: Source-informed Evidence**
   - After linked-source analysis and re-analysis, refresh the evidence cards from the updated advisor questions.
   - Retire stale questions that are already answered.
   - Ask sharper questions about metrics, scope, outcomes, audience, technical depth, and public-use permission.

4. **Round 3: Strategic Closeout**
   - Use strategic question review to answer the user's remaining explicit questions.
   - Ask only final high-value questions if the answer is still not supported.

The app should usually need **2 to 3 evidence rounds after intake**. If it still needs many more questions after that, it should explain why:

- Missing metrics
- Missing source links
- Contradictory evidence
- Unclear role ownership
- Unclear target direction
- Sensitive/private claims that cannot be used publicly

After each evidence re-analysis, the app should update the evidence-gathering cards below the advisor readout. The questions should not remain static. Static questions make the product feel like a form; refreshed questions make it feel like a strategic partner.

After round 3, the app should usually pivot from proof gathering to **opportunity mapping**:

- Target industries and excluded industries
- Geography, commute radius, regions, and remote/hybrid preferences
- Employer categories to prioritize
- Existing relationships, warm introductions, and alumni networks
- Proof-backed stories to use in outreach

The app should not keep asking low-value questions such as exact budgets, team sizes, or tiny analytics details unless those details are essential for a target role.

When the evidence phase reaches this point, the Evidence page should switch to a completed-state layout:

- Show the "ready for opportunity mapping" message.
- Show the latest evidence analysis immediately below it.
- Stop showing another "next questions" block in the completed state. At that point, more questions should be optional, not the main call to action.
- Replace the question loop with a clear "Next steps" handoff into Opportunities, Employers, and Assets.
- Collapse the evidence-gathering tools behind an "Add more information for analysis" control.
- Keep recently saved evidence visible for audit/history.
- Move LinkedIn/profile/network gathering into Opportunities or Assets instead of continuing to crowd the Evidence step.

## Evidence Sufficiency Score Plan

The app needs a measurable stopping point so it does not trap users in a forever loop of proof gathering.

Use an **Evidence Sufficiency Score**:

```txt
score_years = clamp(detected_career_years, 5, 20)
evidence_sufficiency_score = round((useful_evidence_count / score_years) * 100)
```

Career-years rule:

- Use a minimum denominator of 5 years so early-career users still need enough breadth for a useful analysis.
- Use a maximum denominator of 20 years so experienced workers are not punished for having 25 or 30 years of history.
- A 30-year career should be analyzed for relevance, not forced to provide 30 proof items.
- Hiring strategy usually emphasizes the most relevant 10 to 20 years, not every year in a long career.

Examples:

```txt
15 useful evidence items / 20 scored career years = 75
20 useful evidence items / 20 scored career years = 100
29 useful evidence items / 20 scored career years = 145
20 useful evidence items / 30 raw career years still uses 20 scored years = 100
```

Useful evidence should be deduplicated and strategy-relevant. It can include saved evidence answers, public project/source analysis, measurable outcomes, leadership/scope examples, constraints, exclusions, compensation goals, and source-backed work samples. Repeated, vague, or very low-confidence answers should not inflate the score.

Linked sources must be counted as individual evidence items, not as one bulk answer. Seven GitHub repositories plus three article/project links should count as up to ten distinct evidence items once they are supplied or analyzed, assuming they are not duplicate URLs. A single evidence answer that contains multiple distinct URLs should credit each distinct URL. A `source_analysis` run should count each analyzed source item, not merely the fact that one source-analysis run occurred.

Article, blog, and resource index pages should be expanded when possible. If a user provides a page such as `/articles/` that links to 10 authored articles, the analyzer should discover and inspect the individual article URLs within a reasonable cap instead of counting the index page as one generic website. Weak or unverified sources should still appear in the record, but should carry less scoring weight than fetched, moderate, or strong evidence.

Evidence phases:

1. **Evidence Building**
   - Score below 75.
   - Ask direct evidence questions.
   - Goal: establish what the person has done and what can be proven.

2. **Evidence Strengthening**
   - Score 75 to 99.
   - Ask fewer, sharper questions.
   - Goal: fill only the gaps that could change positioning, compensation strategy, target roles, or employer search.

3. **Final Enhancement**
   - Score 100+ before the final closeout.
   - Stop asking generic proof questions.
   - Ask one final round of enhancement questions:
     - "Can you think of anything that would make this strong positioning angle even stronger?"
     - "Is there one accomplishment the analysis has underweighted?"
     - "Which proof-backed story should anchor resume, LinkedIn, outreach, and interviews?"
     - "Is there anything impressive but private that should guide strategy without becoming public copy?"

4. **Evidence Complete**
   - After the final enhancement round, or when the user has 25+ useful evidence items, or after 4 evidence-analysis rounds.
   - Stop generating evidence cards.
   - Show the final evidence-phase analysis.
   - Move the main CTA to Opportunities, Employers, and Assets.

Hard stop rules:

- If `useful_evidence_count >= 25`, evidence gathering is complete.
- If `evidence_analysis_round >= 4`, evidence gathering is complete unless a true contradiction blocks strategy.
- If `evidence_sufficiency_score >= 100`, the next question set must be a final enhancement round, not another proof round.
- If `evidence_sufficiency_score >= 100` and the app has already had enough analysis rounds to close out, evidence gathering is complete.
- If a question would not change targeting, compensation strategy, employer discovery, or career assets, suppress it.

The user-facing language should make the transition clear:

> "You have provided enough evidence for a strong career analysis. One final refinement round will focus only on strengthening your best positioning angles. After that, we will move into opportunity mapping."

After closeout:

> "Evidence phase complete. Your profile is ready for opportunity mapping."

## Opportunity Handoff Plan

The holistic product goal is not just to analyze a resume. CIP should help a user build a proof-backed understanding of their background, then turn that understanding into a path toward the best-fit job at the pay scale they want.

The core journey should be:

1. **Intake**
   - Capture resume history, constraints, preferences, public links, and raw career material.

2. **Evidence Builder**
   - Identify proof gaps, ask human-friendly follow-up questions, and collect source material without making the user feel judged.

3. **Source Analysis**
   - Read provided GitHub repositories, articles, project pages, and other public sources so the AI treats real work as evidence instead of decoration.

4. **Strategic Re-analysis**
   - Merge intake, evidence responses, and source analysis into a stronger advisor readout.
   - Retire stale questions when the evidence already answers them.

5. **Opportunity Mapping**
   - Translate the completed analysis into target roles, industries to pursue or exclude, compensation targets, geography, remote/hybrid preferences, and employer categories.

6. **Employer Discovery**
   - Use the opportunity map to search, filter, and rank employers.
   - Exclude already saved businesses from candidate lists.
   - Prioritize employers that match role direction, location preferences, pay potential, mission fit, and relationship paths.

7. **Career Assets**
   - Turn the analysis into a targeted resume, LinkedIn/profile updates, outreach stories, portfolio positioning, and interview talking points.

The Evidence page should therefore feel like a graduation point once enough material exists. The primary CTA should become "Find opportunities," with secondary paths to target employers and prepare assets. Additional evidence collection should remain available, but it should be framed as optional refinement.

## Network Mapping Plan

Networking intelligence is a key next layer, but it must be handled honestly.

The app should not pretend it can inspect private LinkedIn connections unless the user has explicitly provided accessible data.

The LinkedIn data import is not merely a parser or contact manager. It is evidence for a deeper coaching question:

> Given this person's background, goals, constraints, and existing network, what relationship paths already exist that could help them explore or reach better-fit opportunities?

The network layer should help the user see paths they may not have recognized, such as:

- Former coworkers connected to companies that match the user's evidence-backed direction
- Alumni or community contacts who are better suited for market-read conversations than referral asks
- Weak ties adjacent to industries, geographies, or role lanes that the opportunity analysis recommends
- Contacts whose current employer overlaps with saved target employers or high-fit employer categories
- Relationship paths that suggest a small respectful first step before a job ask

The desired output is not "here are your contacts." The desired output is "here are relationship paths you may not have realized you already had, and here is how to use them respectfully while figuring out your next move."

Acceptable inputs:

- LinkedIn profile URL
- LinkedIn connections export supplied by the user
- Manually pasted connection names, companies, and roles
- Alumni/university search results supplied by the user
- Target company employee lists supplied by the user
- Public profile links where access is allowed

Network mapping should answer:

- Which user connections work at target companies?
- Which connections are adjacent to target industries?
- Which alumni or university paths create plausible warm introductions?
- Which employers already have a relationship path?
- Which outreach story should be used for each connection?

LinkedIn/university networking should become a **warm-introduction map**, not a scraping feature.

### Ideal Work Filter Before Network Analysis

The network map should not begin by asking "who is nearby?" or "which familiar institution has the most contacts?" That can trap the user inside the labor market they are trying to outgrow.

Before CIP analyzes LinkedIn/profile data, connection exports, alumni lists, or manually pasted relationship notes, the Map Network workflow should ask a short ideal-work question set:

- Target role lanes or problem spaces the user wants to test.
- Compensation floor and seniority level that would make a move worthwhile.
- Remote, hybrid, onsite, relocation, travel, and time-zone preferences.
- Geography scope: local-only, regional, remote-first, national, international, or open until evidence narrows it.
- Ideal workplace traits: modern pay practices, strong management culture, tool maturity, mission fit, autonomy, learning environment, or pace.
- Stretch goals: what kind of work would help the user grow beyond the current resume story.
- Dealbreakers and caution flags: under-market pay, vague scope, mandatory onsite work that could be remote, stale tooling, unstable leadership, values conflicts, or industries to avoid.
- Local anchor notes: whether nearby institutions are true targets, research-only employers, or compensation-risk employers.

These answers should become part of the network analysis context. CIP should combine the user's LinkedIn/profile data, resume/evidence analysis, and ideal-work profile before ranking relationship paths.

This changes the purpose of Map Network:

> Given the user's desired work profile, which existing relationships can help test, understand, or reach opportunities that are actually worth pursuing?

Warm introductions remain valuable, but they are a routing layer, not the strategy itself. A contact should rise only when the app can connect the person to at least one of:

- A validated or promising career lane.
- A current or likely target employer.
- A role family, industry, or workplace trait the user wants.
- A compensation, seniority, remote/hybrid, or culture question the user needs answered.
- A respectful market-read conversation that helps decide whether a lane is real.

Geography should be treated as a user-selected constraint, not the default worldview. The app may support local, regional, remote-first, national, and hybrid searches, but it should not confine users to nearby employers unless the user explicitly chooses that tradeoff.

Local anchor employers require caution. A major nearby institution can be useful for market intelligence or warm context, but it should not be treated as a good target merely because it is familiar, large, or close. If the user's compensation floor, seniority needs, management scope, or remote/hybrid preferences conflict with that employer's public pay bands or hiring patterns, CIP should label the employer as research-only, compensation-risk, or low priority until better evidence exists.

For example, a Dartmouth College contact may be useful for asking whether any roles have modern compensation, senior scope, or meaningful decision authority. That does not make Dartmouth College a recommended target by default. Dartmouth affiliation should remain a warm-context signal unless current role, target-lane relevance, compensation evidence, and workplace fit justify stronger action.

The network should also evolve over time. The first LinkedIn/profile import gives CIP an initial map. As employer discovery and role research uncover better-fit companies, remote-first teams, or stretch opportunities, CIP should ask the user to add targeted relationship data for those new directions. This creates a loop:

1. Define ideal work and constraints.
2. Analyze current profile and relationship data.
3. Identify promising lanes and weak spots.
4. Research better-fit employers and roles.
5. Bring back new relationship data for those employers, industries, or communities.
6. Refine the map before outreach or referrals.

### Coaching the User Through the Network List

The Map Network result should not stop at "here are people." That is too close to a contact-ranking tool and does not create enough value. CIP should coach the user on how to use the list.

The key behavior is the **market read**.

A market read is a short, low-pressure conversation where the user is not asking for a job, referral, or favor yet. The user is asking someone with relevant proximity to help them understand the reality of a role lane, employer, pay band, hiring process, work model, team, or industry.

This works because public career data is thin and distorted:

- Job titles are inconsistent across employers.
- Posted salary ranges may be missing, stale, misleading, or too broad.
- Remote and hybrid expectations often differ from the posting.
- The same role can mean strategy in one organization and task execution in another.
- Local anchor employers may be visible and familiar without being strong compensation or seniority fits.
- AI can infer plausible paths, but people can confirm what is actually happening inside teams and markets.

The app should therefore teach the user that the first goal is not "get someone to help me get hired." The first goal is:

> Learn what is real before spending time applying, rewriting assets, or asking for introductions.

After producing named people, lane validations, context pools, and warm paths, CIP should explain:

- The list is a coaching queue, not a send list.
- Most first conversations should be market reads, not referral asks.
- The user should sort people into three buckets:
  - Use now: good fit for a low-pressure conversation this week.
  - Research later: potentially useful, but the role, employer, or relationship context is unclear.
  - Park: warm or familiar, but not currently strategy-relevant.
- A weekly outreach batch should stay small, usually three to five people.
- Every person needs a specific reason for contact and a specific question before outreach.
- Dense clusters, such as many Dartmouth-affiliated contacts, should be interpreted as network-density evidence, not a mandate to pursue that institution.
- Local or alumni-heavy contacts can be valuable for learning about pay bands, hiring reality, workplace culture, local labor-market ceilings, adjacent employers, and who else to speak with.
- Referral asks should come only after the user has verified fit, relationship comfort, and a relevant open role or team.

The coaching output should answer:

- Why is this person on the list?
- What should the user ask them first?
- Is this a market-read, reconnection, introduction, referral, or park-for-later contact?
- What uncertainty should be resolved before outreach?
- What should be recorded after the conversation?

For each recommended person, CIP should produce a **conversation plan**:

- Intent: market read, reconnection, employer context, role translation, warm introduction, referral later, or park.
- Why this person: the specific company, role, lane, community, or experience signal.
- First question: the safest useful question to ask first.
- Do-not-ask-yet warning: what would be premature or too transactional.
- Learning goal: what the user hopes to understand after the conversation.
- Follow-up rule: what should happen if the person replies, ignores the message, offers another contact, or shares useful evidence.

The five-person list should become a weekly operating rhythm:

1. Pick three to five people, not the whole list.
2. Assign each person an intent.
3. Generate a short message that asks for perspective, not a job.
4. Send only messages the user approves.
5. Record the conversation outcome.
6. Update career lanes, employer priorities, resume gaps, and next relationship targets.

CIP should also help the user learn from conversations. After each contact, the app should ask what changed:

- Did this confirm or weaken a career lane?
- Did it reveal salary, scope, culture, remote-work, or hiring-process evidence?
- Did it identify a new employer, role title, team, or person?
- Did it expose a resume/profile gap?
- Should this contact remain active, move to follow-up, or be parked?

## Opportunities Coaching Plan

The Opportunities page should be the user's guided transition from "we understand your background" to "here is where to look, why, and how to approach it."

The page should coach the user through:

1. **Opportunity criteria**
   - Target compensation range
   - Required, preferred, and excluded industries
   - Geography, commute radius, relocation limits, and remote/hybrid preference
   - Role families that match the completed evidence analysis
   - Non-negotiables such as no military work, mission alignment, travel limits, or schedule constraints

2. **Employer discovery setup**
   - Convert the opportunity criteria into employer-search prompts.
   - Explain why each employer category is being searched.
   - Let the user save, reject, or investigate employers.
   - Hide employers that are already saved so candidate lists do not repeat work.

3. **Relationship mapping**
   - Ask whether the user wants to add relationship data before outreach planning.
   - Collect or confirm the ideal-work profile before analyzing relationship data.
   - Accept uploaded or pasted LinkedIn connection data, alumni lists, manually entered contacts, and public profile links.
   - Match contacts to saved employers, adjacent industries, role lanes, workplace preferences, compensation questions, remote/hybrid preferences, and stretch goals.
   - Generate warm-introduction paths and outreach angles.

4. **Action plan**
   - Recommend the next small batch of employers to research.
   - Recommend which career assets need updating before outreach.
   - Generate outreach messages only after the user approves the target and relationship context.

LinkedIn data import is possible, but it should be framed carefully. The app can coach the user to download their own LinkedIn data archive or paste/export connection information that LinkedIn makes available to them. CIP should not scrape LinkedIn, bypass access controls, or claim it can inspect private connections directly.

LinkedIn coaching UI should include:

- A "Bring in networking data" step inside Opportunities or Assets.
- Plain-language instructions for getting a LinkedIn connections export or archive.
- A file upload/paste area for connection names, companies, titles, profile URLs, and notes.
- A privacy note explaining that relationship data is used to map warm introductions.
- A review screen before any contact data is used in outreach.

The networking layer should make the user feel guided, not surveilled. The app's job is to help them see relationship paths they already have access to and turn those paths into respectful outreach.

## Network Intelligence Workflow Decision

Network Intelligence should become the second post-analysis step after career assets. The purpose is not to collect social media data for its own sake. The purpose is to help the user turn legitimate relationship data into warm introductions, market intelligence, employer prioritization, and respectful outreach.

CIP must handle this layer with a clear trust boundary:

- Use user-supplied data only.
- Do not scrape LinkedIn, bypass access controls, automate logged-in browsing, or imply access to private networks.
- Explain that scraping can violate platform terms, create privacy risk, and produce brittle or misleading data.
- Coach the user through LinkedIn's own export and profile-download options instead.
- Let the user review imported data before CIP uses it for outreach recommendations.
- Keep contact data separate from public resume/profile copy unless the user explicitly approves a use.

The Network Intelligence page should walk the user through:

1. **Why this work matters**
   - Many strong opportunities are found through weak ties, alumni paths, former coworkers, community contacts, and people adjacent to target employers.
   - Networking should not mean asking strangers for jobs. It should start with learning, reconnection, and context.
   - The goal is to identify a small number of high-quality relationship moves each week, not blast messages.

2. **What data the user can bring**
   - LinkedIn connections export or larger data archive.
   - LinkedIn profile PDF.
   - Alumni lists, alumni portal contacts, university club directories, career-office mentoring platform data, manually entered contacts, prior coworkers, community contacts, conference/event lists, professional groups, and personal notes.
   - Target employer lists from the Employer Discovery page.

3. **How to gather LinkedIn data**
   - Connections/archive: LinkedIn desktop `Me > Settings & Privacy > Data privacy > Get a copy of your data`, then request the archive that includes connections.
   - Profile PDF: LinkedIn desktop `Me > View profile > More/Resources > Save to PDF` when available.
   - Explain limitations: emails may be missing, exports may take time, and LinkedIn features can vary by account/language.

4. **How to gather alumni and university relationship data**
   - Ask the user which universities, bootcamps, certificate programs, fellowships, or professional schools should be part of the network map.
   - Coach the user to use official alumni portals, alumni association directories, university career-center mentoring platforms, school-specific LinkedIn alumni search, regional alumni clubs, affinity groups, and public event/speaker lists.
   - Accept only contacts the user is allowed to access, export, paste, or manually summarize.
   - Do not scrape gated alumni databases, bypass member access controls, or imply CIP has direct access to university directories.
   - Normalize alumni data into school, program/year when known, current company, title, location, public profile URL, relationship context, and source.
   - Match alumni contacts against target employers, industries, geographies, and role lanes; alumni overlap should be treated as a warm-context signal, not automatic permission to ask for a referral.

5. **What CIP should do with the data**
   - Normalize contacts into name, company, title, public profile URL, email if present, connection date, source, and notes.
   - Match contacts against target employers, industries, role lanes, geography, alumni/company overlap, and saved career evidence.
   - Score contacts for warm-introduction potential, relevance, seniority/influence, relationship freshness, and confidence.
   - Recommend weekly actions such as reconnecting, asking for market advice, requesting a specific warm intro, or commenting thoughtfully on a relevant post.
   - Generate outreach only after the user approves the contact, target, and relationship context.

6. **Action outputs**
   - Warm-introduction map.
   - Top 10 relationship moves for the week.
   - Employer-contact overlap list.
   - Outreach drafts by intent: reconnect, market read, informational interview, referral request, follow-up, and thank-you.
   - Relationship notes and status tracking.

This page should be calm and professional. The copy should reassure users that they are not being asked to spam people. CIP is helping them turn existing relationships into informed, respectful career conversations.

### Lane Validation Model

The first network-analysis passes showed an important product risk: if CIP merely ranks contacts by warmth, it can recommend familiar but strategically weak paths. Prior coworkers, Rotary, BNI, alumni groups, and community affiliations are useful signals, but they are not automatically good recommendations. The app must distinguish relationship warmth from career-lane relevance.

Lane validation means taking the user's current career hypotheses and testing them against the available relationship data before treating those lanes as active search directions.

Examples of lanes:

- AI operations or workflow strategy
- Product enablement
- Career technology or workforce technology
- Customer success, implementation, or adoption strategy
- Regional operations or business systems leadership
- Education, healthcare, civic, or community-facing technology roles

For each lane, CIP should ask:

- Does the user's evidence support this lane?
- Do any named contacts work in or near this lane?
- Do contacts cluster around the industries, employers, titles, geographies, or communities that make the lane more plausible?
- Is the best next step a market-read conversation, a warm introduction, or more research?
- Which lanes look promising but socially unsupported and should remain research lanes for now?

This changes the network output from "who should I contact?" to "which career directions can my existing network help me validate?"

Important rules:

- CIP should validate lanes before recommending employer outreach.
- CIP should not recommend organizations, chapters, groups, or vague affiliations as contacts.
- Rotary, BNI, alumni groups, chambers, and similar organizations should be treated as context pools unless tied to a named person with company/title/context.
- Prior coworkers should be treated as relationship-strength signals, not automatically as strategic matches.
- A contact should be recommended only when CIP can explain the named person, the lane connection, the relationship context, and the respectful first ask.
- If a person is warm but not lane-relevant, CIP should label them as a general reconnection or park them until a better lane/employer connection exists.
- The default first ask should usually be a market read or perspective request, not a referral.

Network Intelligence should therefore produce separate outputs:

1. **Lane validation signals**
   - Which lanes have named people, employer overlap, industry overlap, or useful weak ties.
   - Which lanes lack enough network support and need more research.

2. **Named contact matches**
   - Specific people who connect to a lane, employer, or market question.
   - The reasoning behind the match.
   - The relationship-strength questions the user should answer before outreach.

3. **Context pools**
   - Rotary, BNI, alumni groups, schools, civic organizations, former employers, and communities that may contain useful people but should not be recommended as contacts by themselves.

4. **Weekly validation moves**
   - A small number of low-pressure conversations that help test whether a lane is real, reachable, and worth pursuing.

The desired user experience is:

> "This lane looks plausible from your evidence. Your network has a few people adjacent to it. Before applying heavily, talk to these named people to test what titles, employers, expectations, and proof points are real."

This is safer than premature referral-seeking and more useful than surface-level contact ranking.

## Next-Step Pathway Product Decision

The product should not expose the post-analysis phase as a flat top menu of disconnected feature pages such as Employers, Opportunities, Assets, and Briefing.

Once the evidence analysis is complete, the user needs a guided sequence:

1. **Turn analysis into career assets**
   - Update the resume first, because it is the proof-backed base for LinkedIn, outreach, applications, and interviews.
   - Generate LinkedIn/profile updates, portfolio positioning, and interview stories from verified evidence only.

2. **Define ideal work, then bring in networking data**
   - Coach the user to download or paste LinkedIn/profile data, LinkedIn connection data, alumni lists, manually entered contacts, and public profile links they are allowed to use.
   - Confirm target roles, compensation floor, work model, geography scope, ideal workplace traits, stretch goals, dealbreakers, and local-anchor cautions before ranking contacts.
   - Use that data to build a warm-introduction map against the user's ideal work profile, target employers, industries, and unresolved market questions.
   - Treat nearby institutions as one evidence source, not the default search boundary.

3. **Find employers by fit**
   - Ask whether geography is local-only, regional, remote-first, national, hybrid, or open until evidence narrows it.
   - Research local, regional, remote-first, national, and hybrid employers that fit the user's target lanes.
   - Use the completed profile to rank employers by compensation fit, seniority fit, work model, relationship potential, and likely role alignment.
   - Flag compensation-risk or seniority-risk employers before they become outreach priorities.

4. **Define job-board search lanes**
   - Translate the analysis into specific LinkedIn, Indeed, Monster, Greenhouse, Lever, and company-careers searches.
   - Produce role-family keywords, exclusion terms, filters, salary/work-mode requirements, and a rule for deciding whether a listing deserves deeper review.

5. **Generate a weekly action cadence**
   - The briefing should summarize what changed, which employers or roles deserve attention, which assets need revision, and what outreach should happen next.

The Workbench should become the user's primary handoff surface after evidence completion. Employers, Opportunities, Assets, and Briefing can remain underlying workspaces, but the user should experience them as steps in an action plan rather than unrelated destinations.

## Career Asset Workflow Decision

The first post-analysis asset should be a refreshed **master resume**.

The app should explain this carefully. The user already provided a resume, but that original resume was source material for analysis. The new master resume is different: it is the first public-facing strategy artifact created from the completed evidence analysis.

The master resume should incorporate:

- Verified accomplishments from the original resume
- Evidence Builder answers
- Linked source analysis
- User-approved positioning
- Target role lanes
- Claim safety notes
- Missing metrics or proof gaps
- Public-use boundaries

The user should not be asked to write five different resumes immediately. The recommended first pass is:

1. **Primary lane**
   - The strongest current career direction with the best evidence, market plausibility, and compensation path.

2. **Strong alternate**
   - A credible adjacent direction that uses much of the same evidence but opens a different employer category or job-title family.

3. **Research lane**
   - A promising direction that needs job-board, employer, salary, or networking validation before it deserves a full resume variant.

Three lanes are enough for the first asset pass. Five lanes may be useful later as parked research directions, but five active resume directions too early can dilute the user's positioning and make the resume feel generic. The product should let the user save additional lanes, but it should guide the first resume around a primary lane and one or two close variants.

### Positioning Brief

Before generating resume copy, CIP should create a positioning brief and ask the user to approve or adjust it.

The positioning brief should include:

- Primary target lane
- Strong alternate lane
- Research lane
- Target compensation range
- Geography and remote/hybrid preference
- Employer categories to prioritize
- Industries to pursue
- Industries or work contexts to exclude
- Core professional promise
- Strongest proof-backed story
- Top evidence items to feature
- Claims that need user confirmation
- Claims that should remain private or strategy-only
- Hiring-manager concerns that the resume must answer

The positioning brief is not a resume. It is the decision layer that prevents the app from producing polished but unfocused copy.

### Master Resume Process

Once the positioning brief is approved, the app should walk the user through:

1. **Resume inventory**
   - Show what the old resume already proves.
   - Show what the new evidence adds.
   - Show what should be removed, de-emphasized, or moved to LinkedIn/portfolio.

2. **Narrative spine**
   - Define the headline, summary, and top-of-resume story.
   - Make sure the story matches the primary lane and does not overclaim.

3. **Experience rewrite**
   - Rewrite bullets around situation, action, scope, result, and proof.
   - Preserve real details and user voice.
   - Mark missing numbers or vague outcomes as follow-up questions.

4. **Skills and keywords**
   - Pull keywords from target lanes and real postings.
   - Include only skills the evidence can support or the user explicitly confirms.

5. **Human review**
   - Ask the user to approve, soften, strengthen, or reject each major claim.
   - Keep an audit trail from resume bullet back to supporting evidence.

6. **Variant creation**
   - After the master resume is approved, create targeted variants for the primary lane and close alternates.
   - Do not create variants for research lanes until market validation supports them.

### Interactive Resume Builder

The Assets page should do the work, not merely describe it.

The first implementation should provide an editable master resume draft that:

- Defaults to the primary lane
- Still shows the strong alternate and research lane for context
- Lets the user switch the draft's target lane before editing
- Prefills name, contact, headline, summary, skills, experience bullets, proof bank notes, and review notes from the latest saved intake/evidence analysis
- Allows the user to edit every section directly
- Exports the edited draft, not the original generated draft

Initial export formats:

- Word-compatible `.doc`
- Rich text `.rtf`
- Browser print/save-to-PDF flow

Future export improvements:

- True `.docx` generation
- Server-side PDF rendering
- Saved resume versions in Supabase
- Per-lane resume variants
- Claim-level approval states
- Evidence links from each resume bullet back to the proof ledger

The important product rule: the app can draft, but the user remains the editor and final approver.

### Resume Builder Tuning Pause

Current status:

- The Assets page now has a functional editable resume builder.
- The builder can export edited content as Word-compatible `.doc`, rich text `.rtf`, and browser print/save-to-PDF.
- The first rough draft now excludes internal proof-bank and review-note scaffolding from the exported resume.
- The exported resume uses more appropriate public sections: headline, summary, core skills, selected impact, professional experience, education, and additional credentials/projects.

However, the resume output is **not yet strong enough** for a real senior job seeker.

Known issues:

- Professional experience formatting is still too raw.
- Education formatting is too loose and can appear mixed with unrelated copied resume text.
- The builder does not yet preserve or infer proper role blocks with employer, title, dates, location, and bullets.
- The resume does not yet feel like a polished document for someone with 20+ years of experience.
- The generated experience section can still read like extracted notes instead of a finished resume.
- The app needs better parsing before it can responsibly rebuild a master resume.

Next tuning direction:

1. Parse the original resume into structured resume blocks:
   - Name and contact
   - Summary
   - Skills
   - Employer / title / date groups
   - Bullets under each role
   - Education
   - Credentials, projects, awards, and public links

2. Preserve senior-career structure:
   - Do not flatten 20+ years of experience into a generic bullet pile.
   - Keep career chronology readable.
   - Let the user decide whether older roles should be compressed, grouped, or omitted.

3. Improve education handling:
   - Extract degree, institution, field, and graduation year when present.
   - Keep Dartmouth / bachelor's degree information visible and formatted properly.
   - Do not mix education with portfolio links or review notes.

4. Add editing controls by section:
   - Add role block
   - Remove role block
   - Add bullet
   - Mark bullet as verified, needs metric, or do not use
   - Move older experience into "Earlier Career"

5. Separate internal strategy from public resume:
   - Proof bank, claim safety notes, and review notes should remain visible to the user as guidance.
   - They should never export as resume sections.

6. Upgrade exports:
   - Move from simple HTML `.doc` to true `.docx`.
   - Add better print/PDF layout styles.
   - Add saved resume versions before variant generation.

Until this tuning is complete, the resume builder should be treated as a prototype workflow, not a finished resume product.

### Avoiding Generic AI Resume Output

CIP should assume the user is worried about AI-generated resume detection and recruiter skepticism.

The product should not promise to "beat AI detectors." Instead, it should reduce the reasons a resume feels AI-generated:

- Preserve the user's actual language where it is clear and strong.
- Use specific evidence, names, contexts, tools, audiences, and outcomes.
- Avoid inflated adjectives, generic transformation language, and repeated bullet structures.
- Do not invent metrics.
- Vary bullet rhythm and sentence construction.
- Keep claims proportional to the evidence.
- Separate verified facts from inferred strengths.
- Require user approval before turning sensitive or private evidence into public copy.
- Keep a proof ledger so the user can defend every major claim in an interview.

The desired output is not "undetectable AI writing." The desired output is a truthful, specific, human-edited career asset that could only plausibly belong to this user.

### Asset Sequence After Master Resume

After the master resume is approved, the app should generate the remaining assets in this order:

1. **LinkedIn/profile update**
   - Headline
   - About section
   - Experience updates
   - Featured links
   - Skills and keyword alignment

2. **Portfolio and proof bank**
   - Project summaries
   - Case-study outlines
   - Public links to feature
   - Claims safe for public use

3. **Outreach assets**
   - Recruiter messages
   - Warm-introduction requests
   - Alumni messages
   - Employer-specific notes

4. **Interview assets**
   - STAR stories
   - Career transition explanation
   - Compensation narrative
   - Risk/gap answers

5. **Search assets**
   - LinkedIn, Indeed, Monster, Greenhouse, Lever, and company-careers search strings
   - Target titles
   - Exclusion keywords
   - Salary and work-model filters
   - Review rules for deciding whether a posting deserves deeper research

The Assets page should therefore behave like a guided preparation sequence, not a static list of recommendations.

---

## Geography Engine Fix

The first live-search test for `Norwich, VT` failed because the engine treated the location as text, not as a search area. It latched onto web-visible exact-name matches instead of expanding to the 50-mile Upper Valley labor market.

Fix direction:

- Geocode the user's place first.
- Use the returned latitude/longitude as the center.
- Query nearby towns/cities/villages inside the radius.
- Generate source-search queries from the center, county, nearby places, and selected sectors.
- Pass the geocoded search area into the AI search prompt.
- Show the geocoded area and nearby places in the UI so bad geography can be caught immediately.

Implemented first pass:

- Added `geography-engine.ts`.
- Uses Nominatim/OpenStreetMap for one geocoding lookup per search.
- Uses Overpass for a single nearby-place query inside the radius.
- Adds generated source queries to the live business-search prompt.
- Employer discovery now fails honestly if geocoding fails instead of guessing from the raw place name.

Production note:

The public Nominatim service has usage limits and requires a meaningful User-Agent, attribution, and caching for repeated queries. This is acceptable for prototype testing, but a paid/commercial version should use a proper geocoding provider or a self-hosted geocoding stack.

---

## Navigation and Weekly Cycle Decision

The top navigation is now a single shared stepper rendered by the layout on every page, replacing the per-page link rows and the homepage-only header nav.

The step order is:

1. Intake
2. Evidence
3. Assets
4. Network
5. Follow Up
6. Employers
7. Roles (opportunities/job-board research)
8. Briefing

Workbench remains the home surface outside the numbered sequence.

Network comes before Employers deliberately. The product model is that steps 4-8 form a repeating weekly cycle, not a one-way pipeline:

1. **Network**: gather relationship data, add warm connections, and generate a reviewable candidate list.
2. **Follow Up**: human-review the list, mark people as use now / follow up / park / remove, capture conversation status, record reasons, and save market-read outcomes.
3. **Employers**: research employers informed by what advisors say.
4. **Roles**: test role families and listings against advisor intelligence.
5. **Briefing**: summarize what was learned and what changed.
6. Feed conversation outcomes back into intake/evidence context and run the next pass.

The cycle repeats until the user converges on the right position to actually apply for, rather than spraying applications. Advisor conversations are treated as a primary evidence source: each weekly pass should sharpen employer targeting, role definitions, compensation reality, and career assets.

## Follow Up Page Decision

Network analysis should not also be the relationship-management surface. The Network page is for gathering sources and generating an initial map; the Follow Up page is for working the human-reviewed queue.

This separation is necessary because the user has relationship context that AI cannot infer from LinkedIn or imported profile data:

- Some AI-suggested names need to be parked, not deleted.
- Some people should be removed, with a specific reason, so the system does not recommend them again.
- Some warm relationships that the user enters manually may be more valuable than the initial analysis list.
- Conversation status is operational data, not just analysis text.
- Market-read notes should become structured signal for Employers, Roles, Briefing, and the next Network pass.

The Follow Up page should let the user update each person with:

- Conversation status: to contact, scheduled, met, follow-up, intro offered, parked, removed.
- Decision: use now, follow up, park, active relationship, too cold, do not remember, retired/stale, sensitive/concern, remove, context only.
- Reason for decision, especially for parking and removing.
- Follow-up date or timing.
- Follow-up intent: market read, role translation, employer context, warm intro, reconnection, referral later, thank-you, research later.
- Market signals captured: salary, remote/hybrid reality, role titles, proof points, hiring process, caution flags.
- New leads: employers, roles, people, teams, communities, or sources mentioned by the contact.
- Lane impact: whether the conversation strengthened, weakened, or redirected a career direction.
- Follow-up notes and next action.

Implementation direction:

- Use additive `career_sources` records rather than overwriting prior state.
- Save structured follow-up reviews through the same feedback channel that already feeds later Network analysis.
- Treat `remove`, `deceased`, `no_memory`, `retired`, and `ethical_concern` as hard exclusion signals.
- Treat `park` as "not now" rather than a hard delete.
- Treat `active_relationship` as a positive signal that should eventually boost priority.
- Move the loop-back conversation capture off Network in a later cleanup, or mirror it on Follow Up, so the relationship workflow lives where the user is already reviewing people.

This creates the intended weekly loop:

Network finds candidates and warm paths. Follow Up turns those candidates into user-reviewed relationship intelligence. Employers and Roles use that intelligence to search smarter. Briefing summarizes what changed and activates the next weekly pass.

Implementation note: the nav stepper labels steps 4-8 as the repeating weekly cycle. A future improvement is marking step completion states in the nav from saved data (intake saved, evidence analysis complete, assets drafted, network imported, follow-up queue reviewed).

The cycle is a recommended rhythm, not a hard gate. Employers, Roles, and Briefing must keep working standalone. Things change over time: new employers can be added in a later week, and constraints like geography can loosen or shift (for example, becoming willing to relocate to another state). Each weekly pass should re-read current preferences instead of assuming the first answers are permanent.

## Loop-Back Conversation Notes

The missing piece of the weekly cycle was capturing what advisor conversations actually taught the user. This is now implemented as **loop-back conversation notes**:

- The Network page has a "Loop back: conversation notes" section.
- Users upload notes as `.txt`, `.md`, `.docx` (most likely format), `.rtf`, or `.json` files, or paste notes directly. Legacy binary `.doc` is rejected with guidance to save as `.docx`; HTML-based `.doc` files (like this app's own exports) are readable.
- Each readable note is saved as an additive `conversation_outcome` record in `career_sources` (`trust_state: user_supplied`). Nothing is overwritten.
- The next **network analysis** includes recent conversation notes as first-hand market evidence; the AI is instructed to let them confirm or weaken lanes, employers, and pay-band assumptions instead of repeating advice the conversations already answered.
- The next **evidence re-analysis** converts conversation notes into advisor evidence items, so market-read learnings update the evidence ledger and sufficiency score.
- Conversation notes are included in the evidence backup export.

Parsing is dependency-free: `.docx` text is extracted from `word/document.xml` via the existing ZIP reader, RTF via control-word stripping, JSON via pretty-printing. Notes are capped (12 files per save, 60k characters per note) to keep records and prompts bounded.

Future improvements: structured fields per conversation (contact, employer, lane affected, confirm/weaken verdict), and surfacing "what changed since last week" deltas in the Briefing.

---

## Assets Page Performance Fix (2026-06-12)

The Assets page previously called OpenAI synchronously in the page frontmatter to synthesize the master resume draft, blocking every page load for 15-20 seconds.

New pattern:

- The page render never calls OpenAI. It loads the newest saved `resume_draft` record (additive `career_sources`, `trust_state: system_generated`) when one exists, otherwise the instant deterministic coaching worksheet.
- A "Generate AI master resume" button calls `POST /api/assets/resume-draft`, which assembles the same context (intake, advisor analysis, evidence responses, source analysis, reviews), runs the AI synthesis, saves the result additively, and fills the builder.
- The draft-mode label states honestly whether the editor is showing an AI synthesis (with saved timestamp) or the deterministic worksheet.
- Regenerating warns before replacing unsaved manual edits.
- Shared context loading moved to `resume-asset-context.ts` so the page and the API endpoint cannot drift apart.

## Roles Page Honesty Fix (2026-06-12)

The Opportunities (Roles) page no longer implies unbuilt capabilities:

- The "bring in networking data" card now links to the real Network step instead of describing a feature that lives elsewhere.
- The job-board search lanes card is labeled "Planned, not built yet."
- The empty state explains that job-board sources are operator-configured and that employer-driven monitoring is planned, instead of telling users to edit `.env`; fixture example cards are labeled as fixtures.

The known direction gap stands: the Roles page must eventually consume validated lanes, ideal-work constraints, saved employers, and conversation intelligence so steps 4-8 form a real cycle. That is the next major build, not a copy fix.

## First Real Weekly Pass Decision (2026-06-12)

The next round of work is user work, not development work. The cycle is built far enough that it must now be tested with real conversations before more engine investment.

Decision: lead with advisor outreach, not with stronger geographic search. The product model already encodes the reason — Network sits before Employers because geographic and employer searching without market intelligence is searching blind. Geography preferences, pay-band assumptions, and lane priorities are exactly what market-read conversations are supposed to test, so search refinement before conversations would tune queries against unvalidated assumptions.

This week's plan:

1. **User (founder-as-user):** pick 3-5 "use now" contacts from the network lane-validation output. Market reads only — no referral asks. Assign each contact an intent and a first question, send only approved messages, and take notes after each conversation, even rough ones.
2. **Development, in parallel while replies are pending:** run the queued employer Discovery QA loop — live searches for Sunapee NH, Lyndon VT, Burlington VT, and Boston MA, checking whether known anchors (New London Hospital, Colby-Sawyer College, Mount Sunapee, Lake Sunapee Region Chamber, etc.) are rediscovered without hardcoding. This is the "stronger geographic search" work, framed as validating the existing engine so it is trustworthy when advisor intelligence arrives.
3. **After conversations:** upload notes through loop-back, run network and evidence re-analysis, and evaluate honestly whether lanes, employer priorities, or the evidence ledger actually moved. If they moved, the cycle works. If they did not, that is the most important bug report the product can get.

This pass is also the commercialization gate: per the working agreement, CIP should not be sold before it is proven on user #1. Four to six real weekly passes that measurably change the founder's search are both the validation and the founding story. The trap to avoid is inverting the sequence — polishing discovery for geographies the conversations might rule out entirely.

Commercial positioning note (from the 2026-06-12 review): tryapt.ai validates that people pay ~$30/month for AI career guidance, but it is the opposite philosophy (10-minute personality quiz, confident mass-market claims). CIP's likely path is coaching-led or institutional (workforce boards, career centers, outplacement), not consumer-quiz volume. One funnel lesson worth borrowing honestly: reduce time-to-first-value with a lighter first-touch intake that produces an immediate, limited, honest readout before asking for the full resume — framed by the evidence-sufficiency score, not personality-test theater.

## First Outreach Triage Learnings (2026-06-12)

The founder triaged the first recommended contact list. The result is the most useful product feedback so far: roughly 10 of 12 recommendations were not actionable, for reasons only the user could know:

- Three contacts retired years ago (LinkedIn exports keep stale titles/employers, so the engine cannot see retirement).
- Two contacts the user does not remember at all.
- One contact has known ethical concerns from past business dealings.
- Several were warm-but-stale ties (no contact in 10-24 years, knew in passing, social-only friendships) including one with sensitive personal history.
- One was a transactional connection from a past consulting engagement.

Meanwhile the two strongest real candidates were not ranked at the top: one contact the user spoke with about AI tooling six weeks ago (a live, lane-relevant relationship), and one long-maintained friendship with a relevant technology executive who was not surfaced at all.

What worked as designed:

- The feedback loop is real: `network_feedback` records hard-exclude removed/deceased/current contacts from future matches and feed notes into the AI prompt.
- Lane validation correctly framed contacts as "needs review," and the user's review caught every dud — the system asked for exactly this triage.

What the triage cost reveals (queued improvements):

1. **Relationship recency must outrank affiliation density.** Use the LinkedIn `Connected On` date and any user-supplied "last spoke" signal as first-class ranking inputs. A 24-year-stale tie is a cold contact wearing a warm label.
2. **Add a fast triage sweep before conversation plans.** A quick per-contact pass (know them / don't remember / last spoke roughly when / park / use) costs the user seconds per name and would have filtered most of this list before any coaching copy was generated.
3. **Add missing feedback types.** `park` (warm but not now — distinct from `remove`) and `active_relationship` (boost: live tie, rank higher) do not exist yet; `current_involvement` excludes a contact, which is wrong for live ties the user wants ranked.
4. **Treat "I don't remember this person" as a hard signal**, both for exclusion and as evidence that connection-date/source context should be shown next to every recommendation.
5. **Coach that market reads do not require sit-downs.** Remote contacts are reachable by video; distance is not the filter, relationship staleness is.

Process decision: triage feedback gets saved through the existing feedback mechanisms first, then the LinkedIn analysis is rerun so exclusions and live-tie context shape the next list. Real conversations that predate the app (such as the recent AI-tooling conversation) should be written up as loop-back conversation notes — first-hand market evidence does not need to have been scheduled by CIP to count.

---

## Business Model Concern

CIP may eventually be sellable, but monetization must be handled carefully.

The likely users include people who:

- Know their job may be at risk
- Are unemployed or underemployed
- Are trying to move into a better career path
- May not be able to afford another subscription
- Need trustworthy guidance, not generic AI output

This makes the business model ethically sensitive.

Possible models to discuss:

- Founder-led coaching plus software, where the app supports a high-touch service.
- Low-cost individual subscription with clear free trial and no dark patterns.
- Pay-what-you-can or scholarship seats for unemployed users.
- B2B partnerships with workforce boards, schools, bootcamps, libraries, or career centers.
- Employer-sponsored outplacement or transition support.
- University/career-center licensing.
- Local economic-development partnerships.
- One-time paid career intelligence report instead of recurring subscription.

Any paid version must make the value concrete:

- Better target-employer maps
- Better role fit analysis
- Source-backed opportunity recommendations
- Career asset improvements
- Weekly strategy actions
- Measurable interview/application outcomes

The app should not charge people for vague encouragement, fake job discovery, or generic AI resume advice.

