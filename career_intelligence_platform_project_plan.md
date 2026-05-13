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

