# Career Intelligence Platform

A trust-first career assistant and job search intelligence app built from the AHA Stack foundation: Astro, Tailwind, HTMX, Supabase, and Stripe.

## MVP Direction

- Model the user beyond a resume with intake, links, goals, and verified source material.
- Rank opportunities by strategic fit, evidence, missing skills, and confidence.
- Improve resume, LinkedIn, and portfolio positioning without inventing claims.
- Produce recurring career intelligence briefings grounded in sources.

## Local Development

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env` and add Supabase keys before using auth-backed routes.

## Important Paths

- `src/pages/index.astro` - main CIP workbench
- `src/pages/intake.astro` - founder/user intake draft
- `src/pages/opportunities.astro` - role match research queue
- `src/pages/assets.astro` - resume, LinkedIn, and portfolio guidance
- `src/pages/briefing.astro` - weekly intelligence briefing draft
- `supabase/migrations/20260512160000_cip_core.sql` - core CIP schema
