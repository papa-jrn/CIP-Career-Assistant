import type { ObservationRow, RunView } from "@/lib/cip/job-search-run";
import { countByState, isOutsideArea } from "@/lib/cip/job-search-run";
import { describePay } from "@/lib/cip/pay";

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
};

const TIER_LABEL: Record<string, string> = {
  target_page: "Employer career page",
  preferred_source: "Your preferred source",
  general: "Open-web search",
  direct_read: "Read directly from the employer's job list",
};

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

function postingCard(row: ObservationRow, floorUsd: number | null) {
  const href = safeHref(row.source_url);
  const label = VERIFICATION_LABEL[row.verification_state] ?? VERIFICATION_LABEL.discovered_unverified;
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
        <span class="inline-flex rounded-md px-2 py-1 text-xs font-semibold ${label.tone}">${escapeHtml(label.text)}</span>
      </div>
      <p class="mt-2 text-xs leading-5 text-[var(--muted)]">${escapeHtml(locationLine(row))}${bits.length ? ` · ${bits.join(" · ")}` : ""}</p>
      ${payLine ? `<p class="mt-1 text-xs leading-5 text-[var(--muted)]">Pay: ${escapeHtml(payLine)}</p>` : ""}
      ${row.verification_note ? `<p class="mt-1 text-xs leading-5 text-[var(--muted)]">${escapeHtml(row.verification_note)}${row.verification_checked_at ? ` (checked ${escapeHtml(formatDate(row.verification_checked_at))})` : ""}</p>` : ""}
      <p class="mt-1 text-xs text-[var(--muted)]">${escapeHtml(TIER_LABEL[row.source_tier] ?? "")}${row.source_tier === "general" && row.verification_state !== "verified_open" ? " (treat as a lead until verified)" : ""}</p>
    </article>`;
}

function group(title: string, note: string, rows: ObservationRow[], floorUsd: number | null) {
  if (!rows.length) return "";
  return `
    <section class="mt-5">
      <h3 class="text-sm font-semibold">${escapeHtml(title)} <span class="font-normal text-[var(--muted)]">(${rows.length})</span></h3>
      ${note ? `<p class="mt-1 text-xs text-[var(--muted)]">${escapeHtml(note)}</p>` : ""}
      <div class="mt-2 grid gap-3">${rows.map((row) => postingCard(row, floorUsd)).join("")}</div>
    </section>`;
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

export function renderJobSearchPanel(view: RunView | null, context: PanelContext): string {
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

  return `${open}${head}${runForm(context, label)}${banner}${empty}
    ${group("Verified open", "Confirmed by fetching the posting's own page. Showing the title and, where reported, the requisition ID.", verified, floorUsd)}
    ${group("Not verified yet", "Found by the search but the source page could not confirm them. Treat as leads; check the link before acting.", notVerified, floorUsd)}
    ${group("Outside your places", "Real postings, but their worksite is beyond the distance you set (straight-line). Remote roles are not listed here.", outside, floorUsd)}
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
    </div>
    ${link(context.due.due ? "Run this week's search" : "Open Opportunities")}
  </div>`;
}

export function renderPanelError(message: string): string {
  return `<div id="job-search-panel"><p class="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">${escapeHtml(message)} Progress is saved; reload the page to see where the search stands.</p></div>`;
}
