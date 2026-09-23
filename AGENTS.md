# Agent guide — CIP (Career Intelligence Platform)

This is an **Astro** app (SSR), not Next.js. Ignore any prior instruction to read Next.js docs.

## Stack
- **Astro 7** in server mode (`output: "server"`, `@astrojs/node` adapter). Pages and API
  routes live under `src/pages/**`; API endpoints are `src/pages/api/**/*.ts`.
- **Supabase** for auth + Postgres + Row Level Security. Always `supabase.auth.getUser()`,
  never `getSession()`. Every user-scoped query filters by `user_id`; RLS enforces it too.
- **htmx** for interactivity (endpoints often return HTML fragments, not JSON).
- **TypeScript** with the `@/` alias for `src/` (e.g. `@/lib/cip/advisor`).
- **Tailwind v4**, **Zod** for validation, **Stripe** for payments, **vitest** for tests.

## Commands
- `npm run dev` — local server (`node scripts/serve-local.mjs`). **It runs `npm run build` and then serves `dist/`, so it does NOT hot-reload.** Stop it and run `npm run dev` again to see code changes. Do not run `npm run build` while it is running (it replaces the files being served); to type-check a build without disturbing it, use `npx astro build --outDir <somewhere-else>`. Sign in from
  **`http://localhost:4321`**, not `127.0.0.1` (the Supabase PKCE cookie is origin-bound, so a
  mixed loopback origin fails magic-link login).
- `npm test` — **`tsc --noEmit` then `vitest run`**. Keep this green; the repo typechecks clean.
- `npm run build` / `npm run lint`.

## Conventions that matter here
- **AI + deterministic dual paths.** Features that call OpenAI (advisor, resume, source
  analysis, network, business search, conversation extraction) use the **Responses API with a
  strict `json_schema`** and a **`max_output_tokens`** cap, and **always** fall back to a
  deterministic path when the key is missing or the call fails. Mirror this pattern; never leave
  an AI call with no fallback.
- **Additive persistence.** Career artifacts are appended to `career_sources` keyed by
  `source_type` (`resume_intake`, `evidence_analysis`, `conversation_outcome`, `career_report`,
  …), plus dedicated tables (`watched_employers`, `employer_candidates`, `conversation_outcomes`,
  `career_strategy_snapshots`). Prefer additive records over overwriting.
- **Integrity rules (§8 / §19 in the plan doc) are load-bearing, not style:**
  - No fabricated data presented as real — no invented jobs, employers, salaries, metrics, or
    dates. Hallucinated listings are the original failure the whole product reacts against.
  - Label AI-derived output as such, attach a confidence, and let the user correct it.
  - Prefer a **recommendation** over a bare score; empty/not-configured states say so plainly.
- **Security.** POST endpoints call `isSameOriginRequest`; uploads are size/zip-bomb capped and
  authenticate before parsing; outbound fetches of user URLs are SSRF-guarded; auth endpoints are
  rate-limited. Don't regress these.

## Testing discipline
- Write vitest tests alongside logic, especially for parsers, scoring, dedupe, and the
  loop/propagation engine — this is where strangers' messy data flows.
- Force the deterministic path in tests with `vi.stubEnv("OPENAI_API_KEY", "")`; never call the
  real API from the suite.

## Decision log (read before large changes)
Significant product decisions live in repo-root markdown, not just code:
- `career_intelligence_platform_project_plan.md` — the master plan.
- `Next Steps.md` — Rounds 1–3 (incl. the Autumn 2026 loop-failure diagnosis + repair).
- `Project Plan Autumn 2026.md` — the phased restart.
- `Employers-Opportunities Rethink.md` — the current Parts 6/7 redesign plan.
- `productionization_discussion.md` — hosting / pricing / launch.

Record significant product or architectural decisions in the relevant doc as part of the change.
