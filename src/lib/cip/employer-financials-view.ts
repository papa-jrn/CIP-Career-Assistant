import {
  computeRevenueTrend,
  FRESH_PROFILE_DAYS,
  profileToSignal,
  type FinancialsMode,
  type FinancialsPlan,
  type FundingProfile,
  type FundingTrend,
} from "@/lib/cip/employer-financials";
import { escapeHtml } from "@/lib/cip/job-search-view";
import { formatRevenueUsd } from "@/lib/cip/propublica-990";

/**
 * Server-rendered HTML for the IRS Form 990 financials on Employers cards. One renderer for the
 * page, the single-employer actions, and the bulk refresh (which swaps each card in place with an
 * out-of-band fragment), so every state reads the same. All dynamic text is escaped.
 *
 * Filings exist only for nonprofits, so each employer has a setting (Auto / Always / Never). Auto skips
 * government bodies and clearly for-profit companies and says why; employers whose type is unclear are
 * looked up, and a miss is shown as one quiet line, not a block.
 */

export const FINANCIALS_SETUP_MESSAGE =
  "Financial profiles are not set up in your database yet. Apply the migration 20261007140000_employer_990_profiles.sql in Supabase, then reload.";

export const FINANCIALS_MODE_SETUP_MESSAGE =
  "Saving this setting needs a database update. Apply the migration 20261008120000_watched_employer_financials_mode.sql in Supabase, then try again.";

const TREND_LABEL: Record<FundingTrend, { text: string; tone: string }> = {
  growing: { text: "Revenue growing", tone: "cip-pill" },
  stable: { text: "Revenue steady", tone: "cip-pill" },
  shrinking: { text: "Revenue shrinking", tone: "bg-yellow-50 text-yellow-900" },
  unknown: { text: "Trend unknown", tone: "border border-[var(--line)] text-[var(--muted)]" },
};

const LOADING_LINES = [
  "Finding this organization in IRS filings...",
  "Reading its recent Form 990 filings...",
  "Comparing revenue year over year...",
  "Working out the funding trend...",
  "Saving what the filings say...",
];

const DEFAULT_PLAN: FinancialsPlan = { lookup: true, basis: "auto_nonprofit", reason: "looks like a nonprofit" };

export function friendlyFinancialsError(message: string | null | undefined): string {
  const text = message ?? "";
  if (/financials_mode/i.test(text)) return FINANCIALS_MODE_SETUP_MESSAGE;
  if (/employer_990_profiles|schema cache|does not exist|relation .* does not exist/i.test(text)) return FINANCIALS_SETUP_MESSAGE;
  return text;
}

export function thinkingPanel(id: string, title: string, srText: string): string {
  return `
    <div id="${escapeHtml(id)}" class="htmx-indicator cip-thinking-panel mt-3" role="status" aria-live="polite">
      <div class="cip-thinking-orbit" aria-hidden="true"><span></span><span></span><span></span></div>
      <div class="min-w-0 flex-1">
        <p class="text-sm font-semibold uppercase text-[var(--accent-strong)]">${escapeHtml(title)}</p>
        <div class="cip-thinking-lines" aria-hidden="true">${LOADING_LINES.map((line) => `<span>${escapeHtml(line)}</span>`).join("")}</div>
        <p class="sr-only">${escapeHtml(srText)}</p>
        <div class="cip-thinking-bar" aria-hidden="true"><span></span></div>
      </div>
    </div>`;
}

function money(value: number | null): string {
  return value === null ? "unknown" : formatRevenueUsd(value);
}

function safeHref(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
  } catch {
    return null;
  }
}

function seriesLine(profile: FundingProfile): string {
  return profile.revenueSeries
    .filter((point) => point.revenue !== null)
    .map((point) => `FY ${point.year}: ${money(point.revenue)}`)
    .join(" · ");
}

function ageNote(profile: FundingProfile, nowIso: string): string {
  const days = Math.floor((Date.parse(nowIso) - Date.parse(profile.updatedAt)) / 86_400_000);
  const checked = `Checked ${escapeHtml(profile.updatedAt.slice(0, 10))}`;
  return Number.isFinite(days) && days > FRESH_PROFILE_DAYS ? `${checked} (over ${FRESH_PROFILE_DAYS} days ago, refresh to update)` : checked;
}

export interface FinancialsBlockInput {
  employerId: string;
  employerName: string;
  profile: FundingProfile | null;
  /** Whether a lookup applies to this employer and why. Defaults to "looks like a nonprofit". */
  plan?: FinancialsPlan;
  /** Set when the profiles table is unavailable (migration not applied): no buttons, just the setup message. */
  setupError?: string | null;
  /** A one-off message from the action that just ran (e.g. a failed refresh that kept old data, or a bad EIN). */
  message?: string | null;
  /** Render as an out-of-band swap target (used by the bulk refresh to update every card in place). */
  oob?: boolean;
  nowIso?: string;
}

function modeOf(plan: FinancialsPlan): FinancialsMode {
  return plan.basis === "user_on" ? "on" : plan.basis === "user_off" ? "off" : "auto";
}

/** One tiny form that sets the employer's mode (hidden inputs, so it needs no button-value support). */
function modeForm(input: FinancialsBlockInput, mode: FinancialsMode, label: string, current: FinancialsMode): string {
  const id = `fin-${input.employerId}`;
  const loadingId = `fin-load-${input.employerId}`;
  return `
    <form hx-post="/api/employers/financials" hx-target="#${escapeHtml(id)}" hx-swap="outerHTML" hx-indicator="#${escapeHtml(loadingId)}">
      <input type="hidden" name="employer_id" value="${escapeHtml(input.employerId)}" />
      <input type="hidden" name="mode" value="${mode}" />
      <button class="cip-fancy-button cip-fancy-button-secondary" type="submit" ${mode === current ? "disabled" : ""}><span>${escapeHtml(label)}</span></button>
    </form>`;
}

function modeControl(input: FinancialsBlockInput, plan: FinancialsPlan): string {
  const current = modeOf(plan);
  const label = current === "on" ? "Always look up" : current === "off" ? "Never look up" : `Auto (${plan.reason})`;
  return `
    <details class="mt-3 text-xs">
      <summary class="cursor-pointer font-semibold text-[var(--muted)]">IRS 990 setting: ${escapeHtml(label)}</summary>
      <div class="mt-2 flex flex-wrap gap-2">
        ${modeForm(input, "auto", "Auto", current)}
        ${modeForm(input, "on", "Always look up", current)}
        ${modeForm(input, "off", "Never look up", current)}
      </div>
      <p class="mt-1 max-w-md text-[var(--muted)]">Filings exist only for nonprofits. Auto skips government bodies and clearly for-profit companies, and checks the rest. Your choice here always wins.</p>
    </details>`;
}

export function renderFinancialsBlock(input: FinancialsBlockInput): string {
  const id = `fin-${input.employerId}`;
  const loadingId = `fin-load-${input.employerId}`;
  const plan = input.plan ?? DEFAULT_PLAN;
  const wrapperOpen = `<div id="${escapeHtml(id)}"${input.oob ? ' hx-swap-oob="outerHTML"' : ""} class="mt-4 rounded-md border border-[var(--line)] bg-[var(--panel)] p-4">`;
  const heading = `<p class="text-xs font-semibold uppercase text-[var(--muted)]">IRS 990 financials</p>`;

  if (input.setupError) {
    return `${wrapperOpen}${heading}<p class="mt-2 text-sm text-yellow-900">${escapeHtml(friendlyFinancialsError(input.setupError))}</p></div>`;
  }

  const profile = input.profile;
  const nowIso = input.nowIso ?? new Date().toISOString();
  const message = input.message ? `<p class="mt-2 rounded-md bg-yellow-50 p-2 text-xs leading-5 text-yellow-900" role="status">${escapeHtml(input.message)}</p>` : "";
  const loadingPanel = thinkingPanel(loadingId, "Looking up IRS filings", "Looking up this employer's IRS Form 990 filings.");

  // Skipped: a government body or for-profit company (or turned off by the user). One quiet line plus a way back in.
  if (!plan.lookup && profile?.status !== "ok") {
    const why = plan.basis === "user_off" ? "Turned off by you for this employer." : `Skipped: this employer ${escapeHtml(plan.reason)}.`;
    const current = modeOf(plan);
    return `${wrapperOpen}${heading}${message}<p class="mt-2 text-sm text-[var(--muted)]">${why}</p>
      <div class="mt-3 flex flex-wrap gap-2">
        ${modeForm(input, "on", "Look up anyway", current)}
        ${current === "off" ? modeForm(input, "auto", "Back to auto", current) : ""}
      </div>
      ${loadingPanel}</div>`;
  }

  const refreshLabel = profile ? "Refresh financials" : "Look up financials";
  const einForm = `
      <details class="text-xs">
        <summary class="cursor-pointer font-semibold text-[var(--muted)]">Know the EIN?</summary>
        <form class="mt-2 flex flex-wrap items-center gap-2" hx-post="/api/employers/financials" hx-target="#${escapeHtml(id)}" hx-swap="outerHTML" hx-indicator="#${escapeHtml(loadingId)}">
          <input type="hidden" name="employer_id" value="${escapeHtml(input.employerId)}" />
          <input name="ein" class="rounded-md border border-[var(--line)] bg-[var(--background)] p-2 text-sm" placeholder="12-3456789" inputmode="numeric" maxlength="11" aria-label="Employer identification number" />
          <button class="cip-fancy-button cip-fancy-button-secondary" type="submit"><span>Link this EIN</span></button>
        </form>
        <p class="mt-1 max-w-sm text-[var(--muted)]">Use this when the automatic lookup found no match, or the wrong one.</p>
      </details>`;
  const refreshForm = `
      <form hx-post="/api/employers/financials" hx-target="#${escapeHtml(id)}" hx-swap="outerHTML" hx-indicator="#${escapeHtml(loadingId)}">
        <input type="hidden" name="employer_id" value="${escapeHtml(input.employerId)}" />
        <button class="cip-fancy-button cip-fancy-button-secondary" type="submit"><span>${escapeHtml(refreshLabel)}</span></button>
      </form>`;
  const controls = `<div class="mt-3 flex flex-wrap items-start gap-3">${refreshForm}${einForm}</div>${modeControl(input, plan)}${loadingPanel}`;

  // Looked up, nothing found, and the type was unclear: a single quiet line, details tucked away.
  if (profile && profile.status !== "ok" && plan.basis === "auto_unclear") {
    const summary =
      profile.status === "lookup_failed" ? "Could not be looked up (will be retried)" : profile.status === "no_filings" ? "Registered, but no Form 990 data filing" : "No IRS 990 filing found";
    return `${wrapperOpen}${message}<details class="text-sm">
        <summary class="cursor-pointer"><span class="text-xs font-semibold uppercase text-[var(--muted)]">IRS 990 financials</span> <span class="text-[var(--muted)]">· ${escapeHtml(summary)} (unknown, not poor funding)</span></summary>
        <p class="mt-2 text-xs leading-5 text-[var(--muted)]">${escapeHtml(profile.statusNote)} ${ageNote(profile, nowIso)}</p>
        ${controls}
      </details></div>`;
  }

  let body: string;
  if (!profile) {
    body = `<p class="mt-2 text-sm text-[var(--muted)]">Not looked up yet. Filings show how a nonprofit has been funded; they are not available for every employer.</p>`;
  } else if (profile.status === "ok") {
    const trend = computeRevenueTrend(profile.revenueSeries).trend;
    const label = TREND_LABEL[trend];
    const signal = profileToSignal(profile);
    const sourceHref = safeHref(profile.sourceUrl);
    const pdfHref = safeHref(profile.pdfUrl);
    const orgName = profile.organizationName && profile.organizationName.toLowerCase() !== input.employerName.toLowerCase()
      ? `<p class="mt-1 text-xs text-[var(--muted)]">Filed as ${escapeHtml(profile.organizationName)}${profile.ein ? ` (EIN ${escapeHtml(String(profile.ein).padStart(9, "0").replace(/^(\d{2})/, "$1-"))})` : ""}</p>`
      : "";
    body = `
      <div class="mt-2 flex flex-wrap items-center gap-2">
        <span class="inline-flex rounded-md px-2 py-1 text-xs font-semibold ${label.tone}">${escapeHtml(label.text)}</span>
        <span class="text-sm font-semibold">${escapeHtml(signal?.line ?? "")}</span>
      </div>
      ${orgName}
      <p class="mt-2 text-xs leading-5 text-[var(--muted)]">${profile.latestFilingYear ? `FY ${profile.latestFilingYear}: ` : ""}revenue ${escapeHtml(money(profile.latestRevenueUsd))} · expenses ${escapeHtml(money(profile.latestExpensesUsd))} · assets ${escapeHtml(money(profile.latestAssetsUsd))}</p>
      ${seriesLine(profile) ? `<p class="mt-1 text-xs leading-5 text-[var(--muted)]">${escapeHtml(seriesLine(profile))}</p>` : ""}
      ${profile.statusNote ? `<p class="mt-1 text-xs text-[var(--muted)]">${escapeHtml(profile.statusNote)}</p>` : ""}
      <p class="mt-2 text-xs leading-5 text-[var(--muted)]">A filing shows how the organization was funded in the past. It cannot show whether a particular role is funded now. A health system or parent organization may file separately from the hospitals and clinics under it, so check which entity this EIN is.</p>
      <p class="mt-2 flex flex-wrap gap-3 text-xs">
        ${sourceHref ? `<a class="underline" href="${escapeHtml(sourceHref)}" target="_blank" rel="noopener noreferrer">View on ProPublica</a>` : ""}
        ${pdfHref ? `<a class="underline" href="${escapeHtml(pdfHref)}" target="_blank" rel="noopener noreferrer">Latest 990 (PDF)</a>` : ""}
        <span class="text-[var(--muted)]">${ageNote(profile, nowIso)}</span>
      </p>`;
  } else {
    const failure = profile.status === "lookup_failed" ? "Could not be looked up" : profile.status === "no_filings" ? "No Form 990 data filing found" : "No confirmed IRS 990 match";
    body = `
      <p class="mt-2 text-sm font-semibold">${escapeHtml(failure)}</p>
      <p class="mt-1 text-xs leading-5 text-[var(--muted)]">${escapeHtml(profile.statusNote)}</p>
      <p class="mt-1 text-xs text-[var(--muted)]">Unknown is not the same as poor funding. ${ageNote(profile, nowIso)}</p>`;
  }

  return `${wrapperOpen}${heading}${message}${body}${controls}</div>`;
}

export interface BulkControlInput {
  total: number;
  withFilings: number;
  /** Tracked employers that look like government bodies or for-profit companies and are skipped. */
  skipped?: number;
  setupError?: string | null;
}

/** The "look up financials for tracked employers" control that sits above the saved-employers list. */
export function renderBulkFinancialsControl(input: BulkControlInput): string {
  if (input.setupError) {
    return `<div id="fin-bulk" class="rounded-md border border-[var(--line)] bg-[var(--panel)] p-4"><p class="text-sm font-semibold">IRS 990 financials</p><p class="mt-1 text-sm text-yellow-900">${escapeHtml(friendlyFinancialsError(input.setupError))}</p></div>`;
  }
  const skipped = input.skipped ?? 0;
  const skippedText = skipped
    ? ` ${escapeHtml(String(skipped))} look like government bodies or for-profit companies and are skipped (each card has a setting if one is wrong).`
    : "";
  return `
    <div id="fin-bulk" class="rounded-md border border-[var(--line)] bg-[var(--panel)] p-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-sm font-semibold">IRS 990 financials</p>
          <p class="mt-1 max-w-2xl text-sm leading-6 text-[var(--muted)]">Looks up the public Form 990 filings (revenue, trend) of tracked employers that may be nonprofits. It sends only the employer's name and state to ProPublica, handles up to 8 at a time, and skips ones checked in the last ${FRESH_PROFILE_DAYS} days. ${escapeHtml(String(input.withFilings))} of ${escapeHtml(String(input.total))} have filings on file.${skippedText}</p>
        </div>
        <form hx-post="/api/employers/financials/bulk" hx-target="#fin-bulk-result" hx-swap="innerHTML" hx-indicator="#fin-bulk-loading">
          <button class="cip-fancy-button" type="submit"><span>Look up financials for tracked employers</span></button>
        </form>
      </div>
      ${thinkingPanel("fin-bulk-loading", "Looking up IRS filings", "Looking up IRS Form 990 filings for your tracked employers. This can take up to about a minute.")}
      <div id="fin-bulk-result" class="mt-3" aria-live="polite"></div>
    </div>`;
}
