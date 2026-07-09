I now have three thorough, overlapping audits. Let me consolidate them into one prioritized list, dedupe the findings, and flag what I think genuinely matters vs. what's defense-in-depth. The three agents largely agreed, which gives me confidence in the findings.

This code audit was put together by GLM 5.2 on 7/8/26 before beta/alpha testing.

Before I lay this out — I want to be honest about one thing: the Geoapify PUBLIC_ key issue (M5 in audit 2) is directly my doing from yesterday's work. I'll flag that clearly.

Here's the consolidated audit.

Pre-Beta Security Audit — Consolidated Findings
The three audits agree strongly. Good news first: your RLS is solid (all 14 tables protected, auth.uid()-scoped), you use auth.getUser() everywhere (never getSession()), the service-role key is isolated, the Stripe webhook is genuinely well-hardened (signature + payment status + price pinning + identity binding), and your CSP/security headers are above average. IDOR checks out clean — every user-scoped query filters by user_id.

Now the real issues, ranked by what could actually bite you in beta:

🔴 CRITICAL — fix before any beta tester touches the app

1. SSRF in source-analysis — server fetches arbitrary user-supplied URLs
src/lib/cip/source-analysis.ts:141 — the fetch(url) has no internal-address protection. A signed-in user can save a URL like <http://169.254.169.254/latest/meta-data/iam/security-credentials/> (AWS metadata) or <http://localhost:4321/api/>... in their intake, then run "Analyze linked sources" — the server fetches it, reads the body, and returns it back to them via the OpenAI analysis result. This is internal-network probing + cloud-metadata theft, reachable by any registered account. Same finding from all three agents.

The chain: intake saves arbitrary URLs (linkedin_url, portfolio_urls, public_evidence validated only as URL-shape) → analyze-sources.ts extracts them → fetchSourceSnapshot fetches with no host validation → response body is persisted AND fed to OpenAI AND rendered back to the user. Redirect-following isn't blocked either.

Fix: Resolve the host before fetching and reject any address in private/loopback/link-local/metadata ranges (10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, ::1, fc00::/7, fe80::/10); pin scheme to http/https; set redirect: "manual" and re-validate after redirect; add a response-size cap.

🟠 HIGH — fix before beta (or accept the risk knowingly)
2. DOM-based XSS in the intake review panel (introduced by my recent work — sorry)
src/pages/intake.astro:407 and :423 — populateReview() builds HTML via .innerHTML from raw, unescaped user text (target_title, hidden_achievements, the six question fields). A payload like <img src=x onerror=...> typed into any intake field executes on the review step. This is my bug from the progressive-disclosure rewrite — the original form used .textContent-bound Astro expressions and I introduced .innerHTML in the review summary. Your production CSP (script-src 'self') blocks inline handlers in prod, but dev mode ('unsafe-inline') is exploitable and it's still a real sink.

Fix: Build <dt>/<dd> nodes and set .textContent, or escape before interpolating. Small, contained fix.

1. No upload size limit / auth-before-parse in network import
src/pages/api/network/import.ts:32-53 — the endpoint reads and fully processes the entire uploaded ZIP/CSV/XLSX (including synchronous inflateRawSync decompression) before checking if the user is signed in. An anonymous attacker can POST a multi-GB payload or a zip-bomb and exhaust server memory/CPU. No Content-Length cap, no file-count limit, no per-entry size check before inflation.

Fix: Move getUser() above request.formData(); add an upload-size cap (~25MB); check file.size before arrayBuffer(); cap file count; validate content (magic bytes, not just filename extension).

1. No rate limiting on auth endpoints (email-bomb / cost abuse)
src/pages/api/auth/login.ts and reset-password.ts — neither calls checkRateLimit. Both trigger Supabase to send emails (magic link, password reset). An attacker can spam these to mail-bomb arbitrary inboxes and inflate Supabase email costs. Anonymous-friendly, no throttle.

Fix: Add checkRateLimit (5/hour per IP per email) to both endpoints. Your limiter exists and is wired into other endpoints — this is just a gap.

1. OpenAI cost blowup — output tokens uncapped on 6 endpoints
src/lib/cip/advisor.ts:88, analysis-review.ts:62, source-analysis.ts:283, network-intelligence.ts:985, resume-assets.ts:90, api/network/draft-message.ts:102 — none set max_output_tokens. Only business-search-engine.ts:188 does (12000). A registered user can repeatedly hit these and run unbounded token spend. Also, strategic_questions in evidence/review has no per-question length cap (6 questions × hundreds of KB each into the prompt).

Fix: Add max_output_tokens to every request body; cap strategic_questions input length.

🟡 MEDIUM — fix before broad beta / production
6. CSRF protection disabled globally (single layer of defense)
astro.config.mjs — security: { checkOrigin: false } disables Astro's built-in CSRF. You rely entirely on per-route isSameOriginRequest() calls. Today every POST has it, so you're protected — but it's brittle: any future POST that forgets the call is instantly exploitable, with no backstop.

Fix: Re-enable checkOrigin: true (Astro will enforce Origin at the framework level); you can then drop the per-route calls over time. Low effort, real defense-in-depth.

1. Geoapify key exposed to browser (my doing — flagging honestly)
.env: PUBLIC_GEOAPIFY_API_KEY + src/pages/employers.astro:164 — I prefixed this with PUBLIC_ yesterday so the static-map <img src> URL works in the browser. PUBLIC_-prefixed vars ship to every client. It's the standard pattern for static-map keys (Geoapify/Google/Mapbox all support referrer restrictions), but you must enable HTTP-referrer restriction in the Geoapify dashboard, and the key isn't in your env schema (src/lib/env.ts), so it bypasses validation. If you haven't restricted it yet, anyone can scrape it from your page source and use it elsewhere.

Fix: Confirm referrer restriction is ON in Geoapify dashboard (allow your prod domain + localhost). Long-term, proxy through a server endpoint so the key stays server-side.

1. Weak password policy (client-side only, 6 chars)
src/pages/login.astro:190, set-password.astro:124,137 — minimum 6 chars, no complexity, no breached-password check, enforced only in browser JS (trivially bypassed). Supabase's leaked-password protection is noted as requiring a paid plan in 20260610120000_security_advisor_hardening.sql.

Fix: Enforce ≥12 chars server-side in set-password; consider HIBP or Supabase's leaked-password protection once on a paid plan.

1. In-memory rate limiter + spoofable IP headers
src/lib/rate-limit.ts:19,22-31 — the limiter is per-process (Map), so multi-instance/serverless deploys get limit × instances. The IP key trusts x-forwarded-for/cf-connecting-ip/x-real-ip — fine if your platform overwrites these, bypassable if it doesn't. Also the unknown fallback shares one bucket across all headerless clients (legit users DoS each other).

Fix: For beta on a single host, document the limitation. Before scaling, move to shared storage (Redis/KV/Supabase table) or rely on edge/CDN rate limiting. Verify your platform sets the connecting IP rather than trusting client headers.

1. Secrets live inside OneDrive-synced folder
.env (real OPENAI_API_KEY, GEOCODIO_API_KEY, ADZUNA_APP_KEY, hCaptcha_Secret) sits in OneDrive\Documents\BootcampAHAStack\CIP-Career\ — cloud-synced. Not in the repo (gitignored, never committed), but OneDrive could upload the file off your machine.

Fix: Move the project out of a OneDrive-synced folder, or exclude .env from sync, and rotate any keys that have lived there.

🟢 LOW / defense-in-depth
Raw Supabase error messages echoed to clients (intake/draft.ts:46, evidence/save.ts:43, many others) — escaped so no XSS, but can leak schema/constraint names. Genericize to the user, log real error server-side.
escapeHtml doesn't escape single quotes (~15 implementations) — safe today because all attributes use double quotes, but a latent foot-gun. Add &#39;.
Auth error responses return HTTP 200 (auth/login.ts) — breaks client error handling/monitoring, not a vuln.
user_id echoed in export responses (evidence/export.ts:38, network/export.ts:47) — the user's own UUID in their own download; minor PII-ish.
No paid-feature entitlement gating yet — payments is read-only on the account page; nothing is locked behind it. Fine for test payments, but if you add gating later, check server-side.
connect-src allows *.supabase.co broadly — fine, just be aware.
My recommendation on fix order
If I were shipping this to beta, I'd do these in this order — and I'd genuinely block beta on #1 and #2:

# 1 SSRF (critical, real exploit path)

# 2 intake XSS (my bug, 5-minute fix, contained)

# 3 upload limits (DoS, reorder + size cap)

# 4 auth rate limiting (email-bomb, small fix)

# 6 re-enable checkOrigin (one-line config change, big defense gain)

# 5 + #8 + #7 (cost/password/key — before broad release)

The LOW items as cleanup
That's the honest picture. Two of these (#1 and #2) I'd call ship-blockers for beta; the rest are "fix soon / accept knowingly." Want me to start working through them in that order? I'd suggest doing #1 and #2 first as one batch since they're the highest severity and both contained, then we move down the list.
