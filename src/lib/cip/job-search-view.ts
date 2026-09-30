import type { ObservationRow, RunView, WeeklyDiff } from "@/lib/cip/job-search-run";
import { countByState, isOutsideArea } from "@/lib/cip/job-search-run";
import { describePay } from "@/lib/cip/pay";
import type { Recommendation, RecommendationCategory } from "@/lib/cip/recommendation";
import { matchDisposition, type DispositionStatus, type PostingDisposition } from "@/lib/cip/posting-dispositions";
import type { PostingAnnotations } from "@/lib/cip/opportunity-recommendations";

/**
 * Server-rendered HTML for the weekly job-search panel (Rethink §10, first cut). One function
 * renders every state (idle, running, finished, failed) so the page and the htmx endpoints
 * always agree. All dynamic text is escaped, and only http(s) links are emitted.
 */

export interface PanelContext {
  /** A fresh key for this render; a repeated click with the same key reuses the same run. */
  runKey: string;
  due: { lastRunAt: string | null; dueAt: string | null; due: boolean };
  configured: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  queued: "Queued",
  running: "Searching",
  succeeded: "Completed",
  partial: "Partly completed",
  failed: "Failed",
  not_configured: "Not configured",
  budget_limited: "Stopped at a limit",
};

const VERIFICATION_LABEL: Record<string, { text: string; tone: string }> = {
  verified_open: { text: "Verified open on the source page", tone: "cip-pill" },
  discovered_unverified: { text: "Not verified yet", tone: "bg-yellow-50 text-yellow-900" },
  verification_unavailable: { text: "Could not check the source", tone: "bg-yellow-50 text-yellow-900" },
  source_reports_closed: { text: "Source says closed", tone: "bg-red-50 text-red-800" },
  no_longer_visible: { text: "Posting page is gone", tone: "bg-red-50 text-red-800" },
};

const COVERAGE_LABEL: Record<string, string> = {
  read_openings: "Read their openings",
  no_matching_openings: "Read; nothing matched",
  page_found_but_could_not_read_listings: "Found the page but could not read the listings",
  not_found: "Could not find a careers page",
  read_directly_by_app: "Search could not read it, so the app read the employer's job list directly",
  direct_read_failed: "Could not be read, even directly. Check it by hand",
  direct_read_unsupported: "Could not be read, and no supported job-list format was found. Check it by hand",
  direct_read_blocked: "The site asks automated readers not to access its job list (robots.txt). Check it by hand",
};

const TIER_LABEL: Record<string, string> = {
  target_page: "Employer career page",
  preferred_source: "Your preferred source",
  general: "Open-web search",
  direct_read: "Read directly from the employer's job list",
};

const PILL = "inline-flex rounded-md px-2 py-1 text-xs font-semibold";

// The app's suggested next move (step 6). Tone is muted and semantic, never louder than the
// verification pill it sits under.
const CHIP_META: Record<RecommendationCategory, { label: string; tone: string }> = {
  talk_first: { label: "Talk to someone first", tone: "bg-[var(--accent-soft)] text-[var(--accent-strong)]" },
  check_funding: { label: "Check the funding first", tone: "bg-yellow-50 text-yellow-900" },
  apply: { label: "Apply now", tone: "bg-green-50 text-green-800" },
  monitor: { label: "Monitor", tone: "bg-[var(--panel)] text-[var(--muted)]" },
  skip: { label: "Skip", tone: "bg-red-50 text-red-800" },
};

// What the user has decided/done (their override of the suggestion; also the action-tracking state).
const STATUS_LABEL_USER: Record<DispositionStatus, string> = {
  watching: "Keeping an eye on it",
  applied: "Applied",
  talking: "Reached out",
  passed: "Not for me",
};

// The buttons offered in the expander. "Keep an eye on for now" is the park-without-deciding action.
const STATUS_ACTIONS: Array<{ status: DispositionStatus; label: string }> = [
  { status: "watching", label: "Keep an eye on for now" },
  { status: "applied", label: "Mark applied" },
  { status: "talking", label: "Reached out" },
  { status: "passed", label: "Not for me" },
];

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeHref(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
  } catch {
    return null;
  }
}

function formatDate(iso: string | null) {
  return iso ? iso.slice(0, 10) : "";
}

const LOADING_LINES = [
  "Opening your target employers' career pages...",
  "Reading the listings and job descriptions...",
  "Checking your preferred job sources...",
  "Matching roles to your lanes and places...",
  "Confirming each posting on its own page...",
];

function thinkingPanel(id: string, title: string, sr: string, extra = "", inline = false) {
  return `
    <div id="${id}" class="${inline ? "" : "htmx-indicator "}cip-thinking-panel mt-4"${inline ? ' style="display:flex"' : ""} role="status" aria-live="polite">
      <div class="cip-thinking-orbit" aria-hidden="true"><span></span><span></span><span></span></div>
      <div class="min-w-0 flex-1">
        <p class="text-sm font-semibold uppercase text-[var(--accent-strong)]">${escapeHtml(title)}</p>
        <div class="cip-thinking-lines" aria-hidden="true">${LOADING_LINES.map((line) => `<span>${escapeHtml(line)}</span>`).join("")}</div>
        <p class="sr-only">${escapeHtml(sr)}</p>
        ${extra}
        <div class="cip-thinking-bar" aria-hidden="true"><span></span></div>
      </div>
    </div>`;
}

function runForm(context: PanelContext, label: string) {
  return `
    <form class="mt-4" hx-post="/api/jobs/run" hx-target="#job-search-panel" hx-swap="outerHTML" hx-indicator="#job-search-loading">
      <input type="hidden" name="run_key" value="${escapeHtml(context.runKey)}" />
      <button class="cip-fancy-button" type="submit" ${context.configured ? "" : "disabled"}><span>${escapeHtml(label)}</span></button>
    </form>
    ${thinkingPanel("job-search-loading", "Preparing your search", "Preparing the search. This can take about half a minute before the first results appear.")}`;
}

function locationLine(row: ObservationRow) {
  if (row.remote_status === "remote") return "Remote";
  if (row.location_note) return row.location_note;
  return row.worksite_text ? `Worksite: ${row.worksite_text}` : "Worksite not stated";
}

// Slice 1 marker: a direct-read pick the model kept for proven-skill fit, not a declared lane.
// It is badged so it never reads as a lane recommendation (the labeled-secondary-signal contract).
function isSkillMatch(row: ObservationRow) {
  return row.source_tier === "direct_read" && row.matched_role_term === "skill";
}

// The recommendation chip + the user's own status + the "why / change" expander. The app's chip is
// always computed; when the user has set a status it takes visual precedence but the suggestion is
// still shown, so the card stays honest about what changed.
function recommendationBlock(row: ObservationRow, annotations?: PostingAnnotations) {
  if (!annotations) return "";
  const rec = annotations.recommendations.get(row.source_url);
  if (!rec) return "";
  const userStatus: PostingDisposition | null = matchDisposition(row, annotations.dispositions);
  const chip = CHIP_META[rec.category];

  const shown = userStatus
    ? `<span class="${PILL} bg-[var(--accent-soft)] text-[var(--accent-strong)]">Your call: ${escapeHtml(STATUS_LABEL_USER[userStatus.status])}</span><span class="text-xs text-[var(--muted)]">app suggested: ${escapeHtml(chip.label)}</span>`
    : `<span class="${PILL} ${chip.tone}">${escapeHtml(chip.label)}</span><span class="text-xs text-[var(--muted)]">· ${escapeHtml(rec.confidence)} confidence</span>`;

  const vals = (status: string) =>
    escapeHtml(JSON.stringify({ source_url: row.source_url, employer: row.employer_text, requisition_id: row.requisition_id ?? "", status }));
  const actionBtn = "rounded-md border border-[var(--line)] px-2 py-1 text-xs hover:bg-[var(--panel)]";
  const button = (status: string, label: string, disabled = false) =>
    `<button type="button" class="${actionBtn}" hx-post="/api/jobs/disposition" hx-vals='${vals(status)}' hx-target="#job-search-panel" hx-swap="outerHTML"${disabled ? " disabled" : ""}>${escapeHtml(label)}</button>`;
  const statusButtons = STATUS_ACTIONS.map((action) => button(action.status, action.label, userStatus?.status === action.status)).join("");
  const clearButton = userStatus ? button("clear", "Clear my status") : "";

  return `
    <div class="mt-3 border-t border-[var(--line)] pt-3">
      <div class="flex flex-wrap items-center gap-2">${shown}</div>
      <p class="mt-1 text-xs leading-5 text-[var(--muted)]">${escapeHtml(rec.rationale)}</p>
      <details class="mt-1">
        <summary class="cursor-pointer text-xs font-semibold text-[var(--accent-strong)]">Why / change</summary>
        <ul class="mt-2 list-disc space-y-1 pl-4 text-xs text-[var(--muted)]">${rec.signals.map((signal) => `<li>${escapeHtml(signal)}</li>`).join("")}</ul>
        <div class="mt-2 flex flex-wrap gap-2">${statusButtons}${clearButton}</div>
        ${employerFix(row, annotations)}
      </details>
    </div>`;
}

// The on-card employer-resolution fix (item 4). Shows what the posting's employer was treated as, and
// lets the user correct it; the correction persists as a learned alias applied to every future run.
function employerFix(row: ObservationRow, annotations: PostingAnnotations) {
  const res = annotations.resolution.byUrl.get(row.source_url);
  const names = annotations.resolution.watchedNames;
  if (!res || !names.length) return "";
  const treatedAs = res.canonical
    ? `treated as <span class="font-semibold">${escapeHtml(res.canonical)}</span>${res.hasAlias ? " (your correction)" : ""}`
    : "not matched to one of your saved employers";
  const actionBtn = "rounded-md border border-[var(--line)] px-2 py-1 text-xs hover:bg-[var(--panel)]";
  const options = [`<option value="">— not one of my saved employers —</option>`]
    .concat(names.map((name) => `<option value="${escapeHtml(name)}"${res.canonical === name ? " selected" : ""}>${escapeHtml(name)}</option>`))
    .join("");
  return `
    <form class="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-3" hx-post="/api/jobs/employer-alias" hx-target="#job-search-panel" hx-swap="outerHTML">
      <input type="hidden" name="observed" value="${escapeHtml(res.observed)}" />
      <span class="text-xs text-[var(--muted)]">Employer "${escapeHtml(res.observed)}" is ${treatedAs}. Fix:</span>
      <select name="canonical" class="rounded-md border border-[var(--line)] bg-[var(--background)] px-2 py-1 text-xs">${options}</select>
      <button type="submit" class="${actionBtn}">Save employer</button>
      ${res.hasAlias ? `<button type="submit" name="clear" value="1" class="${actionBtn}">Reset to automatic</button>` : ""}
    </form>`;
}

function postingCard(row: ObservationRow, floorUsd: number | null, newUrls?: Set<string>, annotations?: PostingAnnotations) {
  const href = safeHref(row.source_url);
  const label = VERIFICATION_LABEL[row.verification_state] ?? VERIFICATION_LABEL.discovered_unverified;
  const isNew = Boolean(newUrls?.has(row.source_url));
  const title = href
    ? `<a class="font-semibold underline" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(row.title)}</a>`
    : `<span class="font-semibold">${escapeHtml(row.title)}</span>`;
  const bits = [
    row.remote_status !== "not_stated" ? escapeHtml(row.remote_status) : "",
    row.posted_text ? escapeHtml(row.posted_text) : "",
    row.salary_text ? escapeHtml(row.salary_text) : "",
    row.requisition_id ? `Req ${escapeHtml(row.requisition_id)}` : "",
  ].filter(Boolean);
  const payLine = describePay(row.salary_text, floorUsd);
  return `
    <article class="rounded-md border border-[var(--line)] bg-[var(--background)] p-4">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="text-sm">${title}</p>
          <p class="mt-1 text-sm text-[var(--muted)]">${escapeHtml(row.employer_text)}</p>
        </div>
        <div class="flex shrink-0 flex-wrap items-center justify-end gap-1">
          ${isNew ? `<span class="inline-flex rounded-md bg-[var(--accent-soft)] px-2 py-1 text-xs font-semibold text-[var(--accent-strong)]">New since your last search</span>` : ""}
          <span class="inline-flex rounded-md px-2 py-1 text-xs font-semibold ${label.tone}">${escapeHtml(label.text)}</span>
        </div>
      </div>
      ${isSkillMatch(row) ? `<p class="mt-2 inline-flex rounded-md bg-[var(--accent-soft)] px-2 py-1 text-xs font-semibold text-[var(--accent-strong)]">Outside your current lanes — matches your proven experience</p>` : ""}
      <p class="mt-2 text-xs leading-5 text-[var(--muted)]">${escapeHtml(locationLine(row))}${bits.length ? ` · ${bits.join(" · ")}` : ""}</p>
      ${payLine ? `<p class="mt-1 text-xs leading-5 text-[var(--muted)]">Pay: ${escapeHtml(payLine)}</p>` : ""}
      ${row.verification_note ? `<p class="mt-1 text-xs leading-5 text-[var(--muted)]">${escapeHtml(row.verification_note)}${row.verification_checked_at ? ` (checked ${escapeHtml(formatDate(row.verification_checked_at))})` : ""}</p>` : ""}
      <p class="mt-1 text-xs text-[var(--muted)]">${escapeHtml(TIER_LABEL[row.source_tier] ?? "")}${row.source_tier === "general" && row.verification_state !== "verified_open" ? " (treat as a lead until verified)" : ""}${row.carried_forward ? " · carried forward from a prior search and re-checked" : ""}</p>
      ${recommendationBlock(row, annotations)}
    </article>`;
}

function group(title: string, note: string, rows: ObservationRow[], floorUsd: number | null, newUrls?: Set<string>, annotations?: PostingAnnotations) {
  if (!rows.length) return "";
  return `
    <section class="mt-5">
      <h3 class="text-sm font-semibold">${escapeHtml(title)} <span class="font-normal text-[var(--muted)]">(${rows.length})</span></h3>
      ${note ? `<p class="mt-1 text-xs text-[var(--muted)]">${escapeHtml(note)}</p>` : ""}
      <div class="mt-2 grid gap-3">${rows.map((row) => postingCard(row, floorUsd, newUrls, annotations)).join("")}</div>
    </section>`;
}

// A one-line count of the app's suggestions, next to the weekly-diff banner. Skip is left out — it
// is not a call to act on. Shown only when recommendations are available.
function chipCountStrip(actionableRows: ObservationRow[], annotations?: PostingAnnotations) {
  if (!annotations) return "";
  const counts: Record<RecommendationCategory, number> = { talk_first: 0, check_funding: 0, apply: 0, monitor: 0, skip: 0 };
  for (const row of actionableRows) {
    const rec = annotations.recommendations.get(row.source_url);
    if (rec) counts[rec.category] += 1;
  }
  const order: Array<[RecommendationCategory, string]> = [
    ["apply", "to apply"],
    ["talk_first", "talk first"],
    ["check_funding", "funding check"],
    ["monitor", "monitor"],
  ];
  const parts = order.filter(([category]) => counts[category] > 0).map(([category, label]) => `${counts[category]} ${label}`);
  if (!parts.length) return "";
  return `<p class="mt-3 text-xs text-[var(--muted)]">Suggested this week: ${escapeHtml(parts.join(" · "))}.</p>`;
}

// "What changed since your last search" (step 5). Counts are integers built into the markup; the
// only free text is the previous run's date, which is escaped. Shown only when a prior run exists.
function diffBanner(diff?: WeeklyDiff): string {
  if (!diff) return "";
  const when = diff.previousRunAt ? ` on ${escapeHtml(formatDate(diff.previousRunAt))}` : "";
  if (!diff.newCount && !diff.closedCount) {
    return `<p class="mt-3 rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm">No new or newly-closed postings since your last search${when}. ${diff.returningCount} still open.</p>`;
  }
  const parts = [
    diff.newCount ? `<strong>${diff.newCount}</strong> new` : "",
    `<strong>${diff.returningCount}</strong> still open`,
    diff.closedCount ? `<strong>${diff.closedCount}</strong> newly closed or gone` : "",
  ].filter(Boolean);
  return `<p class="mt-3 rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm">Since your last search${when}: ${parts.join(", ")}.</p>`;
}

function coverageBlock(view: RunView) {
  const { coverage } = view.run;
  if (!coverage.length) return "";
  return `
    <details class="mt-5 rounded-md border border-[var(--line)] bg-[var(--panel)] p-3">
      <summary class="cursor-pointer text-sm font-semibold">What was checked (${coverage.length})</summary>
      <ul class="mt-3 grid gap-2 text-sm">
        ${coverage
          .map((entry) => {
            const href = entry.careersPageUrl ? safeHref(entry.careersPageUrl) : null;
            return `<li><span class="font-semibold">${escapeHtml(entry.name)}</span>: ${escapeHtml(COVERAGE_LABEL[entry.status] ?? entry.status)}${
              href ? ` (<a class="underline" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">page</a>)` : ""
            }${entry.note ? `<span class="block text-xs text-[var(--muted)]">${escapeHtml(entry.note)}</span>` : ""}</li>`;
          })
          .join("")}
      </ul>
    </details>`;
}

function detailsBlock(view: RunView) {
  const usage = view.run.usage as Partial<Record<"inputTokens" | "outputTokens" | "webSearchCalls", number>>;
  const cost =
    view.run.estimated_cost_usd === null ? "not estimated (pricing not configured)" : `about $${Number(view.run.estimated_cost_usd).toFixed(2)}`;
  return `
    <details class="mt-3 text-xs text-[var(--muted)]">
      <summary class="cursor-pointer font-semibold">Run details</summary>
      <p class="mt-2">Model ${escapeHtml(view.run.model)} · ${view.run.trace.length} of ${view.run.plan.length} steps · ${Number(usage.webSearchCalls ?? 0)} searches/page opens · ${Number(usage.inputTokens ?? 0).toLocaleString("en-US")} input and ${Number(usage.outputTokens ?? 0).toLocaleString("en-US")} output tokens · cost ${escapeHtml(cost)}</p>
    </details>`;
}

export function renderJobSearchPanel(view: RunView | null, context: PanelContext, annotations?: PostingAnnotations): string {
  const open = '<div id="job-search-panel">';

  // In progress: this element advances the run by one step on load and replaces itself.
  if (view?.run.status === "running") {
    const done = view.run.next_step;
    const total = view.run.plan.length;
    const found = view.observations.length;
    return `<div id="job-search-panel" hx-post="/api/jobs/advance" hx-vals='${escapeHtml(JSON.stringify({ run_id: view.run.id }))}' hx-trigger="load" hx-target="this" hx-swap="outerHTML">
      ${thinkingPanel(
        "job-search-working",
        `Search in progress: step ${Math.min(done + 1, total)} of ${total}`,
        `Step ${Math.min(done + 1, total)} of ${total}. ${found} postings found so far.`,
        `<p class="mt-2 text-xs text-[var(--muted)]">${found} posting${found === 1 ? "" : "s"} found so far. Each step can take up to a minute. Progress is saved if you leave this page.</p>`,
        true,
      )}
    </div>`;
  }

  const { due } = context;
  const dueLine = due.lastRunAt
    ? `Last successful search: ${escapeHtml(formatDate(due.lastRunAt))}. ${due.due ? "A new search is due." : `Next due ${escapeHtml(formatDate(due.dueAt))}.`}`
    : "No search has completed yet.";
  const label = due.due ? "Run this week's search" : "Run another search now";

  const head = `
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold">Weekly job search</h2>
        <p class="mt-1 text-sm text-[var(--muted)]">Checks your target employers' career pages first, then your preferred sources, then the open web, and confirms each posting on its own page. It runs only when you start it.</p>
        <p class="mt-1 text-xs text-[var(--muted)]">${dueLine}</p>
      </div>
    </div>`;

  if (!context.configured) {
    return `${open}${head}<p class="mt-4 rounded-md bg-yellow-50 p-3 text-sm text-yellow-900">The search is not set up on this server (no provider key). Nothing has been searched.</p></div>`;
  }
  if (!view) {
    return `${open}${head}${runForm(context, label)}<p class="mt-4 text-sm text-[var(--muted)]">Nothing to show yet. Make sure your places and job sources are saved on <a class="underline" href="/preferences">Search preferences</a> first.</p></div>`;
  }

  const { run, observations } = view;
  const counts = countByState(observations);
  const brief = run.brief as { compensation?: { floorUsd?: number | null } };
  const floorUsd = typeof brief?.compensation?.floorUsd === "number" ? brief.compensation.floorUsd : null;
  const isGone = (row: ObservationRow) => row.verification_state === "source_reports_closed" || row.verification_state === "no_longer_visible";
  const gone = observations.filter((row) => !row.exclusion_hit && isGone(row));
  const outside = observations.filter((row) => !row.exclusion_hit && !isGone(row) && isOutsideArea(row));
  const local = observations.filter((row) => !row.exclusion_hit && !isGone(row) && !isOutsideArea(row));
  const verified = local.filter((row) => row.verification_state === "verified_open");
  const notVerified = local.filter(
    (row) => row.verification_state === "discovered_unverified" || row.verification_state === "verification_unavailable",
  );
  const excluded = observations.filter((row) => row.exclusion_hit);

  const bad = run.status === "failed" || run.status === "partial" || run.status === "budget_limited" || run.status === "not_configured";
  const banner = `
    <div class="mt-4 rounded-md border ${bad ? "border-yellow-300 bg-yellow-50 text-yellow-900" : "border-[var(--line)] bg-[var(--panel)]"} p-3 text-sm" role="status">
      <p class="font-semibold">${escapeHtml(STATUS_LABEL[run.status] ?? run.status)} · ${escapeHtml(formatDate(run.started_at))}</p>
      <p class="mt-1 leading-6">${escapeHtml(run.summary)}</p>
    </div>`;

  const empty =
    !observations.length && run.status === "succeeded"
      ? `<p class="mt-4 text-sm text-[var(--muted)]">Nothing matching was found in the places the search could read. That is different from a failed search. See "What was checked" below for what could and could not be read. Widening your places or roles is your call; the search will not do it on its own.</p>`
      : "";

  const newUrls = view.diff?.newSourceUrls;
  return `${open}${head}${runForm(context, label)}${banner}${diffBanner(view.diff)}${chipCountStrip([...verified, ...notVerified], annotations)}${empty}
    ${group("Verified open", "Confirmed by fetching the posting's own page. Showing the title and, where reported, the requisition ID.", verified, floorUsd, newUrls, annotations)}
    ${group("Not verified yet", "Found by the search but the source page could not confirm them. Treat as leads; check the link before acting.", notVerified, floorUsd, newUrls, annotations)}
    ${group("Outside your places", "Real postings, but their worksite is beyond the distance you set (straight-line). Remote roles are not listed here.", outside, floorUsd, newUrls)}
    ${group("Closed or gone", "The source says closed, its application deadline has passed, or the page no longer exists.", gone, floorUsd)}
    ${group("Excluded by your rules", "These match an exclusion you set and were not checked further.", excluded, floorUsd)}
    ${coverageBlock(view)}${detailsBlock(view)}
    <p class="sr-only">${counts.verified} verified.</p>
  </div>`;
}

/**
 * Compact read-only summary for other pages (the Briefing). It never starts or advances a run;
 * it points to Opportunities, where the search is run and reviewed.
 */
export function renderJobSearchSummary(view: RunView | null, context: PanelContext): string {
  const link = (label: string) =>
    `<a class="cip-fancy-button cip-fancy-button-secondary mt-3 inline-flex" href="/opportunities"><span>${escapeHtml(label)}</span></a>`;
  const head = `<h2 class="text-lg font-semibold">Weekly job search</h2>`;
  const open = '<div id="job-search-panel">';

  if (!context.configured) {
    return `${open}${head}<p class="mt-2 text-sm text-[var(--muted)]">The search is not set up on this server, so nothing has been searched.</p></div>`;
  }
  if (!view) {
    return `${open}${head}<p class="mt-2 text-sm text-[var(--muted)]">No search has run yet. It finds real, verified openings at your target employers and trusted job sites.</p>${link("Run this week's search")}</div>`;
  }

  const { run } = view;
  if (run.status === "running") {
    return `${open}${head}<p class="mt-2 text-sm">A search is in progress (step ${Math.min(run.next_step + 1, run.plan.length)} of ${run.plan.length}). Progress is saved.</p>${link("Watch it on Opportunities")}</div>`;
  }

  const bad = run.status === "failed" || run.status === "partial" || run.status === "budget_limited" || run.status === "not_configured";
  const dueLine = context.due.lastRunAt
    ? `Last successful search ${escapeHtml(formatDate(context.due.lastRunAt))}. ${context.due.due ? "A new search is due." : `Next due ${escapeHtml(formatDate(context.due.dueAt))}.`}`
    : "No search has completed yet.";
  return `${open}${head}
    <p class="mt-1 text-xs text-[var(--muted)]">${dueLine}</p>
    <div class="mt-3 rounded-md border ${bad ? "border-yellow-300 bg-yellow-50 text-yellow-900" : "border-[var(--line)] bg-[var(--background)]"} p-3 text-sm">
      <p class="font-semibold">${escapeHtml(STATUS_LABEL[run.status] ?? run.status)} · ${escapeHtml(formatDate(run.started_at))}</p>
      <p class="mt-1 leading-6">${escapeHtml(run.summary)}</p>
      ${view.diff && (view.diff.newCount || view.diff.closedCount) ? `<p class="mt-2 leading-6">Since your last search: ${view.diff.newCount} new, ${view.diff.returningCount} still open${view.diff.closedCount ? `, ${view.diff.closedCount} newly closed` : ""}.</p>` : ""}
    </div>
    ${link(context.due.due ? "Run this week's search" : "Open Opportunities")}
  </div>`;
}

export function renderPanelError(message: string): string {
  return `<div id="job-search-panel"><p class="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">${escapeHtml(message)} Progress is saved; reload the page to see where the search stands.</p></div>`;
}
