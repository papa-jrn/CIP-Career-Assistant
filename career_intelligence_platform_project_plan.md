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

- Intake: first real pass exists.
- Identity graph: first real pass exists.
- AI advisor analysis: partially implemented; real only when `OPENAI_API_KEY` is active and the response succeeds.
- Saved intake reload: implemented.
- Authentication: implemented for test use.
- Employer geography search: first live engine pass exists using server-side OpenAI Responses API web search when `OPENAI_API_KEY` is configured.
- Watched employer/business discovery: partial. Live source and candidate discovery can run, but result quality needs repeated testing, source inspection, and regression checks.
- Business search by geography: first implementation exists. It no longer returns hardcoded fixture employers as normal search results.
- Employer adapters/job monitoring: not implemented yet.
- Weekly strategy snapshot: scaffold based on saved employers and opportunity matches.

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
   - Accept uploaded or pasted LinkedIn connection data, alumni lists, manually entered contacts, and public profile links.
   - Match contacts to saved employers and adjacent industries.
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

