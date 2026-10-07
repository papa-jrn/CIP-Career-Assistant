import { escapeHtml } from "@/lib/cip/job-search-view";
import type { RecommendationCategory } from "@/lib/cip/recommendation";
import {
  groupDossiers,
  STATUS_LABEL,
  type TargetAction,
  type TargetDossier,
  type TargetPosting,
  type TargetStatus,
} from "@/lib/cip/target-dossier";

/**
 * Server-rendered HTML for the Employers target workspace (Rethink §14, slice 1). Every dynamic value is
 * escaped and only http(s) links are emitted. The status and the next action are labeled as the app's
 * SUGGESTION; talk-first is styled as prominently as apply. Per-card extras (the 990 financials block,
 * fit summary, notes) come from callbacks, so this module stays free of page and database concerns.
 */

export interface WorkspaceViewOptions {
  /** The IRS 990 financials block for this target (already-escaped HTML). */
  renderFunding: (dossier: TargetDossier) => string;
  /** Extra detail the dossier does not carry: fit summary, target roles, source notes, links (already-escaped HTML). */
  renderExtras?: (dossier: TargetDossier) => string;
  /** The latest searched run, to say honestly whether openings are known at all. */
  run: { startedAt: string; finishedAt: string | null; status: string } | null;
}

const STATUS_BLURB: Record<TargetStatus, string> = {
  talk_first: "A saved person or an open follow-up makes a conversation the best next move.",
  applying: "You marked a posting here as applied or in conversation.",
  researching: "A verified opening may fit. Check it before acting.",
  monitoring: "Nothing to act on yet. Kept on your watch list.",
  new: "Recently added with no signals yet.",
  paused: "Paused by you.",
  not_interested: "Marked not interested by you.",
};

const CHIP_LABEL: Record<RecommendationCategory, string> = {
  talk_first: "Talk first",
  check_funding: "Check funding",
  apply: "Apply",
  monitor: "Monitor",
  skip: "Skip",
};

function safeHref(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
  } catch {
    return null;
  }
}

function actionClasses(tone: TargetAction["tone"]): string {
  if (tone === "talk_first" || tone === "apply") return "border-[var(--accent)] bg-[var(--accent-soft)]";
  if (tone === "check_funding") return "border-yellow-300 bg-yellow-50 text-yellow-900";
  return "border-[var(--line)] bg-[var(--panel)]";
}

function statusClasses(status: TargetStatus): string {
  return status === "talk_first" || status === "applying" || status === "researching" ? "cip-pill" : "border border-[var(--line)] text-[var(--muted)]";
}

export interface WorkspaceSummary {
  total: number;
  needConversation: number;
  withOpenings: number;
  followUpsDue: number;
  fundingConcerns: number;
  newOpenings: number;
}

export function workspaceSummary(dossiers: TargetDossier[]): WorkspaceSummary {
  return {
    total: dossiers.length,
    needConversation: dossiers.filter((d) => d.status === "talk_first").length,
    withOpenings: dossiers.filter((d) => d.openings.verified.length > 0).length,
    followUpsDue: dossiers.filter((d) => d.action.kind === "follow_up").length,
    fundingConcerns: dossiers.filter((d) => d.funding.trend === "shrinking").length,
    newOpenings: dossiers.reduce((sum, d) => sum + d.openings.verified.filter((p) => p.isNew).length, 0),
  };
}

function summaryStrip(summary: WorkspaceSummary): string {
  const item = (count: number, label: string, tone = "") =>
    `<div class="rounded-md border border-[var(--line)] bg-[var(--panel)] p-3 text-center ${tone}"><p class="text-2xl font-semibold text-[var(--accent-strong)]">${escapeHtml(String(count))}</p><p class="mt-1 text-xs font-semibold uppercase text-[var(--muted)]">${escapeHtml(label)}</p></div>`;
  return `<div class="grid grid-cols-2 gap-3 md:grid-cols-5">
    ${item(summary.total, "Targets")}
    ${item(summary.needConversation, "Talk first")}
    ${item(summary.followUpsDue, "Follow-ups due")}
    ${item(summary.withOpenings, "With verified openings")}
    ${item(summary.fundingConcerns, "Funding concerns")}
  </div>`;
}

function postingLine(posting: TargetPosting): string {
  const href = safeHref(posting.url);
  const title = href
    ? `<a class="font-semibold underline" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(posting.title)}</a>`
    : `<span class="font-semibold">${escapeHtml(posting.title)}</span>`;
  return `<li class="rounded-md border border-[var(--line)] bg-[var(--panel)] p-3 text-sm">
      <div class="flex flex-wrap items-center gap-2">
        ${title}
        <span class="inline-flex rounded-md px-2 py-1 text-xs font-semibold ${posting.chip.category === "check_funding" ? "bg-yellow-50 text-yellow-900" : "cip-pill"}">${escapeHtml(CHIP_LABEL[posting.chip.category])}</span>
        ${posting.isNew ? '<span class="inline-flex rounded-md border border-[var(--line)] px-2 py-1 text-xs font-semibold text-[var(--muted)]">New this search</span>' : ""}
        ${posting.userStatus ? `<span class="inline-flex rounded-md border border-[var(--line)] px-2 py-1 text-xs font-semibold text-[var(--muted)]">You marked it ${escapeHtml(posting.userStatus)}</span>` : ""}
      </div>
      <p class="mt-1 text-xs leading-5 text-[var(--muted)]">${escapeHtml(posting.worksite)} · ${escapeHtml(posting.chip.rationale)}</p>
    </li>`;
}

function section(title: string, body: string): string {
  return `<div class="mt-4"><h4 class="text-xs font-semibold uppercase text-[var(--muted)]">${escapeHtml(title)}</h4>${body}</div>`;
}

function peopleSection(d: TargetDossier): string {
  const paths = d.warmPaths.map(
    (path) => `<li class="text-sm"><span class="font-semibold">${escapeHtml(path.name)}</span> <span class="text-[var(--muted)]">— ${escapeHtml(path.basis)}${path.firstAsk ? `. ${escapeHtml(path.firstAsk)}` : ""}</span></li>`,
  );
  const followUps = d.followUps.map(
    (item) => `<li class="text-sm"><span class="font-semibold">Follow-up with ${escapeHtml(item.person)}</span> <span class="text-[var(--muted)]">— ${escapeHtml(item.nextAction || "next step not recorded")}${item.due ? ` (due ${escapeHtml(item.due)})` : ""}${item.urgency === "overdue" ? " — overdue" : ""}</span></li>`,
  );
  const talks = d.conversations.map(
    (c) => `<li class="text-sm text-[var(--muted)]">${escapeHtml(c.date)} · ${c.person ? `<span class="font-semibold text-[var(--foreground)]">${escapeHtml(c.person)}</span>` : "A conversation"} (${escapeHtml(c.direction)})${c.signal ? `: ${escapeHtml(c.signal)}` : ""}</li>`,
  );
  if (!paths.length && !followUps.length && !talks.length) {
    return section("People", `<p class="mt-1 text-sm text-[var(--muted)]">No saved contact or conversation at this employer. Nobody is guessed.</p>`);
  }
  return section("People", `<ul class="mt-1 grid gap-1">${[...paths, ...followUps].join("")}</ul>${talks.length ? `<p class="mt-2 text-xs font-semibold text-[var(--muted)]">Conversations</p><ul class="mt-1 grid gap-1">${talks.join("")}</ul>` : ""}`);
}

function openingsSection(d: TargetDossier, run: WorkspaceViewOptions["run"]): string {
  const { openings } = d;
  const careersHref = safeHref(d.careersUrl);
  const careers = `<p class="mt-2 text-xs leading-5 text-[var(--muted)]">${escapeHtml(openings.careersNote)}${careersHref ? ` <a class="underline" href="${escapeHtml(careersHref)}" target="_blank" rel="noopener noreferrer">Careers page</a>` : ""}</p>`;
  if (!run) {
    return section("Openings", `<p class="mt-1 text-sm text-[var(--muted)]">No search has run yet, so openings here are unknown.</p>${careers}`);
  }
  if (!openings.verified.length) {
    const outside = openings.outsideArea ? ` ${escapeHtml(String(openings.outsideArea))} verified ${openings.outsideArea === 1 ? "opening is" : "openings are"} outside your places.` : "";
    return section("Openings", `<p class="mt-1 text-sm text-[var(--muted)]">No verified openings right now (latest search ${escapeHtml(run.startedAt.slice(0, 10))}). A careers page or a high fit is not evidence of an opening.${outside}</p>${careers}`);
  }
  return section("Openings", `<ul class="mt-1 grid gap-2">${openings.verified.map(postingLine).join("")}</ul>${careers}`);
}

function unknownsSection(d: TargetDossier): string {
  if (!d.unknowns.length) return "";
  return section("Still unknown", `<ul class="mt-1 list-disc pl-5 text-sm text-[var(--muted)]">${d.unknowns.map((u) => `<li>${escapeHtml(u)}</li>`).join("")}</ul>`);
}

export function renderTargetCard(d: TargetDossier, options: WorkspaceViewOptions): string {
  const laneChips = d.lanes.length
    ? d.lanes.map((lane) => `<span class="inline-flex rounded-md bg-[var(--accent-soft)] px-2 py-1 text-xs font-semibold text-[var(--accent-strong)]" title="${escapeHtml(lane.reason)}">Fits: ${escapeHtml(lane.label)}</span>`).join(" ")
    : '<span class="text-xs text-[var(--muted)]">No current lane fit</span>';
  const move =
    d.movement && d.movement.direction !== "steady"
      ? `<span class="text-xs font-semibold ${d.movement.direction === "down" ? "text-[var(--warning)]" : "text-[var(--accent-strong)]"}">${d.movement.direction === "up" ? "↑ moved up" : "↓ moved down"}</span>`
      : "";
  const fundingLine = d.funding.line ? `<p class="mt-2 text-xs leading-5 text-[var(--muted)]">Funding: ${escapeHtml(d.funding.line)}</p>` : "";
  const changes = d.changes.length ? `<ul class="mt-3 list-disc pl-5 text-xs leading-5 text-[var(--muted)]">${d.changes.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul>` : "";
  const why = d.action.signals.length
    ? `<details class="mt-2 text-xs"><summary class="cursor-pointer font-semibold text-[var(--muted)]">Why this suggestion</summary><ul class="mt-1 list-disc pl-5 text-[var(--muted)]">${d.action.signals.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul></details>`
    : "";

  return `
  <article id="target-${escapeHtml(d.employerId)}" class="rounded-md border border-[var(--line)] bg-[var(--background)] p-5">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <h3 class="text-lg font-semibold">${escapeHtml(d.name)}</h3>
          <span class="inline-flex rounded-md px-2 py-1 text-xs font-semibold ${statusClasses(d.status)}" title="The app's suggestion from what it knows. Setting your own status comes next.">${escapeHtml(STATUS_LABEL[d.status])} · ${d.statusSource === "set" ? "set by you" : "suggested"}</span>
          ${d.category ? `<span class="rounded-md border border-[var(--line)] px-2 py-1 text-xs text-[var(--muted)]">${escapeHtml(d.category)}</span>` : ""}
          ${d.region ? `<span class="rounded-md border border-[var(--line)] px-2 py-1 text-xs text-[var(--muted)]">${escapeHtml(d.region.replaceAll("_", " "))}</span>` : ""}
        </div>
        <p class="mt-2 flex flex-wrap items-center gap-2">${laneChips}</p>
      </div>
      <div class="text-right">
        <span class="text-2xl font-semibold text-[var(--accent-strong)]">${d.fitScore === null ? "–" : `${escapeHtml(String(d.fitScore))}%`}</span>
        ${move ? `<p class="mt-1">${move}</p>` : ""}
        ${d.priority ? `<p class="mt-1 text-xs text-[var(--muted)]">${escapeHtml(d.priority)} priority</p>` : ""}
      </div>
    </div>
    <div class="mt-4 rounded-md border p-3 ${actionClasses(d.action.tone)}">
      <p class="text-xs font-semibold uppercase opacity-70">Suggested next action</p>
      <p class="mt-1 text-sm font-semibold">${escapeHtml(d.action.label)}</p>
      <p class="mt-1 text-sm leading-6">${escapeHtml(d.action.rationale)}</p>
      ${why}
    </div>
    ${fundingLine}${changes}
    <details class="mt-3">
      <summary class="cursor-pointer text-sm font-semibold text-[var(--muted)]">Dossier: people, openings, funding</summary>
      ${peopleSection(d)}
      ${openingsSection(d, options.run)}
      ${section("Funding", options.renderFunding(d))}
      ${unknownsSection(d)}
      ${options.renderExtras ? options.renderExtras(d) : ""}
    </details>
  </article>`;
}

/** The whole workspace: a summary strip and the target cards grouped by status. */
export function renderWorkspace(dossiers: TargetDossier[], options: WorkspaceViewOptions): string {
  if (!dossiers.length) {
    return `<div class="rounded-md border border-[var(--line)] bg-[var(--panel)] p-5"><h3 class="text-lg font-semibold">No tracked employers yet</h3><p class="mt-2 text-sm leading-6 text-[var(--muted)]">Search a place below, review the candidates, and save the ones worth tracking. They will appear here with what you know about each.</p></div>`;
  }
  const groups = groupDossiers(dossiers);
  return `
    ${summaryStrip(workspaceSummary(dossiers))}
    ${groups
      .map(
        (group) => `
      <section class="mt-6" aria-label="${escapeHtml(STATUS_LABEL[group.status])}">
        <div class="flex flex-wrap items-baseline gap-2">
          <h2 class="text-lg font-semibold">${escapeHtml(STATUS_LABEL[group.status])}</h2>
          <span class="text-sm text-[var(--muted)]">${escapeHtml(String(group.items.length))}</span>
          <span class="text-sm text-[var(--muted)]">— ${escapeHtml(STATUS_BLURB[group.status])}</span>
        </div>
        <div class="mt-3 grid gap-3">${group.items.map((item) => renderTargetCard(item, options)).join("")}</div>
      </section>`,
      )
      .join("")}`;
}
