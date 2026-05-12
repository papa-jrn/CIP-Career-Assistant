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

