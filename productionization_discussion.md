# Productionization & Launch Discussion

### Status
Draft for discussion — set 2026-06-30. Not a commitment; a working document to return to.
Companion to `career_intelligence_platform_project_plan.md` (which owns the *product* decisions).
This document owns the *"make it reachable and sustainable beyond the founder"* questions.

---

## Purpose

CIP works end-to-end for the founder-as-user. The next set of questions is no longer "does the
engine run?" but "how do we host it, name it, and eventually sustain it without betraying the
product's trust thesis?" This document lays out the four pieces in the order they actually need
to happen, with honest trade-offs and the decisions that are still the founder's to make.

The framing rule throughout: **do not present unfinished systems as real** (the project integrity
rule, §19). That applies to launch too — the app should not be "open for customers" in a way that
implies capabilities, monitoring, or guarantees it does not yet have.

---

## 1. Cleanup (unblocked, low-risk, anytime)

### What it is
Pre-existing code-health items that predate the UI rebuild and don't block anything else. No
product-integrity implications — purely technical debt.

### Specific items
- **Type errors** flagged by `astro check` in `src/lib/cip/network-intelligence.ts`,
  `src/lib/cip/labor-market.ts`, and `src/pages/api/intake/save.ts` (~18 total). The app builds
  and runs fine without fixing them, but they are real loose ends.
- **Roadmap cleanup items** already recorded in the planning doc's "Next Session Roadmap":
  - Nav stepper step-completion states from saved data (long-queued).
  - Reconcile the Roles page's older "Run market research" ingest path with the new live
    remote/geographic searches (one clear story, not two engines).
  - Feed per-contact Follow-Up conversation fields into the network analysis prompt as typed
    inputs (currently free text via `conversation_outcome`).
  - Briefing week-over-week deltas.

### Why it's first in priority but flexible
It's the only piece with zero launch risk and zero dependency on the others. It can be done in
parallel with hosting setup, or deferred entirely. Recommend doing it whenever there's a session
without a bigger agenda.

### Decision needed
None. Just time.

---

## 2. Hosting (the real prerequisite to "anyone but the founder")

### The reality
The *code* is on GitHub (`github.com/papa-jrn/CIP-Career-Assistant`). But "usable by others"
means the **running app** has to live somewhere. Requirements:

- **Node SSR hosting.** The app uses the Astro Node adapter (`@astrojs/node`), so it needs a host
  that runs a Node process — not static/CDN-only hosting. (`astro.config.mjs` confirms the
  `output: "server"` mode.)
- **Secret environment variables** kept off the client: `PUBLIC_SUPABASE_URL`,
  `PUBLIC_SUPABASE_ANON_KEY`, `OPENAI_API_KEY`, `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`,
  `GEOCODIO_API_KEY`, `STRIPE_*`. These must never be committed (`.env` is gitignored — verified).
- **The Supabase backend already exists** as a hosted service (auth + Postgres + RLS). That half
  is solved; hosting only needs to reach it.

### Options and honest trade-offs

| Path | Pros | Cons |
|---|---|---|
| **PaaS (Render / Railway)** | Easiest path from GitHub for a Node+Astro app; hobby/free tier to start; native env vars and deploys; scales when real users arrive. | Free tiers sleep on idle and have usage caps; paid tier ~$7–20/mo once active. |
| **Vercel / Netlify** | Polished DX, generous free tiers for traffic. | Astro Node adapter needs a small config check (serverless vs. long-running); pricing climbs faster past free tier; SSR edge behavior can differ. |
| **VPS (self-hosted, e.g. Hetzner/DigitalOcean)** | Max control, most predictable cost (~$5–10/mo flat), no per-request surprises. | You operate the server: OS patches, TLS certs, process manager (pm2), deploys, backups. Most moving parts. |

### Recommendation (open for discussion)
Lead with a **PaaS (Render or Railway)** for the first non-founder users. It removes operational
load at the moment when you have the least time to spare, and it scales predictably. Migrate to a
VPS only if/when cost or control demands it — not before.

### What "ready to host" still needs
- A production Supabase project (or confirmation the current one is the prod one), with RLS
  policies reviewed for multi-user isolation (they exist per-table; worth a re-audit before real
  users share the DB).
- A `PUBLIC_SITE_URL` env var set to the real domain (the CSRF guard in `src/lib/security.ts`
  relies on it).
- A `.env.production` checklist (we already have `.env.example` as the template).

### Decision needed
Which platform. Everything downstream (domain DNS, deploy pipeline) follows from this.

---

## 3. Domain name (easy, but follows hosting)

### The reality
~$12–15/yr for a `.com`. Registration + DNS pointing at wherever the app is hosted. This is
almost entirely decided by the hosting choice, not independent of it.

### Considerations
- **Name.** Should reflect the "career intelligence strategist" positioning, not "job applier."
  Worth brainstorming 3–5 candidates and checking availability before committing.
- **TLS.** The hosting platform should terminate HTTPS (all PaaS options do; VPS needs Let's
  Encrypt). The app must be served over HTTPS — it handles auth and personal career data.
- **Email.** If pricing or contact is added, a `you@yourdomain` address improves trust over a
  gmail. Often bundled cheaply with the registrar or via a mail host.

### Decision needed
The name (and implicitly the registrar). Pointing it at the host is mechanical.

---

## 4. Pricing (needs honest cost math first, and has a gate)

This is the piece the project's own documents treat most carefully. Two things are true at once.

### The cost reality

The report layer is now **deterministic** — assembling it costs zero OpenAI tokens (a deliberate
design choice; see `career-report.ts`). But these features all call OpenAI and scale linearly with
active users:

- Advisor analysis (intake + evidence re-analysis)
- Resume / master-resume synthesis (`/api/assets/resume-draft`)
- Linked-source analysis (`/api/evidence/analyze-sources`)
- Strategic question review (`/api/evidence/review`)
- Outreach message drafting (`/api/network/draft-message`)
- Employer discovery live search (OpenAI Responses `web_search`)

**Before any price is set, we need the actual usage math:** average AI calls per user per week ×
real token costs = per-user cost floor. That number (plus Supabase + hosting) sets the minimum
viable price. We do not yet have that number — it has to be measured, not guessed.

### The integrity gate (from the planning doc, §Business Model Concern + §First Real Weekly Pass)

> *"CIP should not be sold before it is proven on user #1. Four to six real weekly passes that
> measurably change the founder's search are both the validation and the founding story."*

The likely users include people who may be job-at-risk, unemployed, or unable to afford another
subscription. So the model must avoid dark patterns: no click revenue from sponsored job spam,
no fake urgency, honest free options, clear value before payment. (The planning doc already
rejected the Adzuna ad-republisher model on exactly these grounds.)

### Options already recorded in the planning doc

- Founder-led coaching + software (high-touch, app supports the service).
- Low-cost individual subscription with clear free trial, no dark patterns.
- Pay-what-you-can / scholarship seats for unemployed users.
- B2B partnerships: workforce boards, schools, bootcamps, libraries, career centers.
- Employer-sponsored outplacement or transition support.
- University / career-center licensing.
- One-time paid career intelligence report (the deterministic report makes this feasible — it's
  a bounded deliverable with no recurring AI cost per generation).

### Suggested pricing principles (for when we get there)
1. **Measure cost before setting price.** No price floors based on guesses.
2. **Lead with the one-time report** as the lowest-risk first paid offer — bounded cost, clear
   deliverable, no subscription trap. It's also the most honest "try before you buy" artifact.
3. **Keep a real free path** so financially vulnerable users are never locked out.
4. **Charge for interpretation and targeting, never for volume** (the core product thesis).
5. **No advertising or sponsored-listing revenue** — it conflicts directly with the product.

### Decision needed
Nothing yet — and the doc's own logic says *not* yet. This comes after hosting is live and after
the founder's 4–6 real weekly passes produce real cost numbers.

---

## Weekly job search: cost and beta access (TO DISCUSS)

**Status: open. Recorded 2026-09-23, before the beta. Do not price or invite testers until this is worked through.**

The weekly job search (Employers & Opportunities Rethink, build step 3) is the first feature with a
real per-use cost: each search runs up to 7 bounded provider calls, each using web search and a
reasoning model, plus our own verification fetches. The founder plans to open the app to a few
friends for beta and expects to pay about $10/month for Vercel hosting; the question is what the
whole app costs to keep running, per month, with N testers.

**What we know (measured, not estimated)**
- Live spike, 2026-09-23, one provider call covering three employers: roughly 9,000 to 32,000
  input tokens, 600 to 2,000 output tokens, and 1 to 6 web-search/page-open calls, depending on model.
- The OpenAI organization's month-to-date spend was $0.23 after those spike runs (dashboard figure,
  which lags). A full run is up to about 7 such calls, so a run is plausibly cents to well under a
  dollar, but this is NOT yet measured for a full run and must not be quoted as a price.
- `gpt-4.1-mini` (the repo's old default) fabricated postings in the spike. Reasoning models
  (`gpt-5.4`, `gpt-5.4-mini`) did not. The job-search default is `gpt-5.4`; other AI passes still
  default to `gpt-4.1-mini` and have not been audited for this failure mode (see Phase 1 step 6, per-pass model tiers).

**What the app now records so this can be answered with data**
- Every run stores input/output/reasoning tokens, web-search-call count, model, steps, and errors.
- Dollar cost is stored as `null` ("unavailable") until pricing is configured. Set
  `JOB_SEARCH_PRICING_JSON` from OpenAI's current pricing page (input $/M tokens, output $/M
  tokens, $ per web-search call); the app never hardcodes provider prices.

**Cost drivers to model for the monthly figure**
1. Search: users x runs per week x steps per run x (tokens + search calls). Caps in code: 3 runs per
   user per rolling 7 days, 7 steps per run, 12 tool calls per step, 25 postings, and a token/call
   ceiling (or a dollar ceiling once pricing is set; default $1 per run).
2. Hosting: Vercel plan (confirm which plan the $10/month figure refers to, and its function
   duration limits, see below). Supabase plan and database size (runs and observations are append-only).
3. Geocoding: Nominatim and Overpass are free public services with usage policies meant for light
   use. A handful of testers is fine; before scaling, cache town and state lookups in the database
   and consider Geocodio for reverse lookups.
4. Other AI passes (advisor, evidence, network, resume): unmeasured per-user cost. Measure alongside search.

**Beta access controls needed before inviting anyone**
- Lock down account creation (invite-only sign-up) so strangers cannot create accounts that spend the key.
- Keep `OPENAI_API_KEY` server-side only (it is: never sent to the browser), use a dedicated
  project key for the beta, and set a monthly budget cap and alerts on that OpenAI project/org.
- Per-user caps are database-backed (weekly run cap, one active run), which survives serverless. The
  existing in-memory rate limiter (`src/lib/rate-limit.ts`) does NOT: on Vercel each instance has its
  own memory, so treat it as a courtesy, not a guardrail.
- Decide what happens at a cap: show a clear message (built), and whether extra runs can be requested.

**Deployment constraint to verify**
- Each search step is one provider call plus verification and can take up to about 1 to 2 minutes.
  The run is split into steps advanced by separate requests so no single request needs to run for
  the whole search, but each step still needs a function duration that fits. Check the hosting
  plan's current limit before deploying; if too short, reduce `targetsPerStep`/`scopesPerStep` or
  move steps to a background worker.

**Decisions for the founder**
- Model per pass and the monthly budget per beta user.
- Whether the search stays manual weekly (current) or is scheduled later.
- Whether any cost is passed through to users, and how (see the pricing section above: charge for
  interpretation and targeting, never volume).
- Who pays for beta testers' usage, and the cap that ends the beta if costs spike.

---

## Suggested sequencing (summary)

```
1. Cleanup ............. anytime, unblocked, low-risk
2. Hosting + domain .... so the app is reachable (parallel-safe with step 3)
3. Founder weekly passes. the validation gate — real conversations, real evidence movement
4. Measure OpenAI cost .. from the real passes above
5. Pricing ............. designed with real numbers + real proof, not before
```

The order matters: **hosting + domain can run in parallel with validation, but pricing must wait
for both the cost math and the proof.** Inverting the sequence (pricing before proof) is the trap
the planning doc warns against.

---

## Open questions to revisit

- [ ] Hosting platform choice (PaaS vs Vercel vs VPS)?
- [ ] Domain name candidates?
- [ ] Is the current Supabase project the production one, or do we provision a fresh one for
      real users with a clean data boundary?
- [ ] Has the founder completed the 4–6 real weekly passes? (Sets the gate for pricing.)
- [ ] What's the measured per-user-per-week OpenAI cost once those passes are done?
- [ ] First paid offer: one-time report, subscription, or coaching-led?

---

*This document is intentionally honest about what is a decision versus what is just work. Update
it as answers land; keep it consistent with the planning doc's integrity rules.*
