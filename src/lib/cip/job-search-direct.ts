import {
  detectListSource,
  icimsListUrl,
  peopleAdminListUrl,
  readIcimsListings,
  readPeopleAdminListings,
  type DirectReadResult,
  type DirectListing,
  type ListSource,
} from "@/lib/cip/ats-reader";
import { addUsage, checkBudget, EMPTY_USAGE, type JobSearchConfig, type RunUsage } from "@/lib/cip/job-search-config";
import {
  buildSelectionRequest,
  parseSelectionPayload,
  type DiscoveredPosting,
  type JobSearchProvider,
  type ParsedStepResponse,
  type SearchStep,
} from "@/lib/cip/job-search-engine";
import type { PageFetcher } from "@/lib/cip/job-verifier";
import type { OutboundSearchFacets } from "@/lib/cip/search-brief";

/**
 * Fallback for target employers whose job list the web search could not read
 * (`page_found_but_could_not_read_listings`). Never runs for employers the search read fine.
 * Everything it does is reported: a coverage line says the app read the list itself, and the run
 * summary names the employer, so the user always knows which results came this way.
 */

export interface DirectReadTrace {
  employer: string;
  host: string;
  pages: number;
  listings: number;
  selected: number;
}

export interface DirectCoverage {
  name: string;
  status: "read_directly_by_app" | "direct_read_failed" | "direct_read_unsupported";
  note: string;
  careersPageUrl: string | null;
}

export interface DirectReadOutcome {
  candidates: Array<DiscoveredPosting & { tier: "direct_read" }>;
  coverage: DirectCoverage[];
  reads: DirectReadTrace[];
  actions: string[];
  usage: RunUsage;
}

export interface DirectReadCommonArgs {
  step: SearchStep;
  facets: OutboundSearchFacets;
  config: Pick<JobSearchConfig, "model" | "limits" | "pricing">;
  provider: JobSearchProvider;
  fetcher: PageFetcher;
  usedSoFar: RunUsage;
  alreadyReadHosts: Set<string>;
}

/**
 * FALLBACK trigger: read the job list of a saved target the web search reported it could not read
 * (`page_found_but_could_not_read_listings`). Unsupported pages are reported as "check by hand".
 */
export async function directReadStuckTargets(
  args: DirectReadCommonArgs & { entries: ParsedStepResponse["employers_checked"] },
): Promise<DirectReadOutcome> {
  const outcome: DirectReadOutcome = { candidates: [], coverage: [], reads: [], actions: [], usage: EMPTY_USAGE };
  const stuck = args.entries
    .filter((entry) => entry.status === "page_found_but_could_not_read_listings" && entry.careers_page_url)
    .slice(0, args.config.limits.directReadsPerStep);
  for (const entry of stuck) {
    await attemptTargetDirectRead({ name: entry.name, url: entry.careers_page_url as string }, args, outcome, "stuck");
  }
  return outcome;
}

/**
 * KNOWN-TARGET trigger (Rethink §8 step 9 amendment, 2026-09-29): deterministically read a saved
 * target's own board each run when its listing URL is known and its format is supported — rather
 * than only on web-search failure, so a readable but large board (e.g. Dartmouth College's 124
 * postings) is fully read instead of partially surfaced by the general search. Unsupported or
 * unreadable targets are skipped silently here; the web search and the fallback path still cover
 * them and report honestly.
 */
export async function directReadKnownTargets(
  args: DirectReadCommonArgs & { targets: Array<{ name: string; url: string }> },
): Promise<DirectReadOutcome> {
  const outcome: DirectReadOutcome = { candidates: [], coverage: [], reads: [], actions: [], usage: EMPTY_USAGE };
  for (const target of args.targets.slice(0, args.config.limits.directReadsPerStep)) {
    await attemptTargetDirectRead(target, args, outcome, "known");
  }
  return outcome;
}

// Shared per-target read: fetch the page, detect a supported board, read it politely, and let a
// model choose by index (it can never introduce a title or URL). `trigger` only changes the
// user-facing wording and whether an unsupported/failed page is reported or silently skipped.
async function attemptTargetDirectRead(
  target: { name: string; url: string },
  args: DirectReadCommonArgs,
  outcome: DirectReadOutcome,
  trigger: "stuck" | "known",
): Promise<void> {
  const { config } = args;
  const { name, url } = target;
  const report = (status: DirectCoverage["status"], note: string) => {
    // The known trigger runs for readable boards too, so it stays quiet on unsupported/already-read;
    // only genuine failures are surfaced. The fallback trigger reports every case.
    if (trigger === "stuck" || status === "direct_read_failed") {
      outcome.coverage.push({ name, status, note, careersPageUrl: url });
    }
  };

  const budget = checkBudget(addUsage(args.usedSoFar, outcome.usage), args.step.index, config);
  if (!budget.ok) {
    report("direct_read_failed", `Not read directly: ${budget.reason}. Please open this employer's job list yourself.`);
    return;
  }

  const shell = await args.fetcher(url);
  const source = detectListSource(url, shell?.text ?? null);
  if (!source) {
    report("direct_read_unsupported", "The search could not read this page and it does not use a job-list format the app can read on its own (iCIMS and PeopleAdmin are supported). Please check it by hand.");
    return;
  }
  const sourceHost = listSourceHost(source);
  if (args.alreadyReadHosts.has(sourceHost)) {
    report("read_directly_by_app", `The app already read the job list at ${sourceHost} earlier in this run.`);
    return;
  }

  const readOptions = {
    maxPages: config.limits.directReadMaxPages,
    delayMs: config.limits.directReadDelayMs,
    maxListings: config.limits.directReadMaxListings,
  };
  const read: DirectReadResult =
    source.kind === "icims"
      ? await readIcimsListings(args.fetcher, source.host, readOptions)
      : await readPeopleAdminListings(args.fetcher, source.base, readOptions);
  if (!read.ok) {
    const lead = trigger === "stuck" ? "The search could not read this job list and the app's own attempt also failed." : `The app tried to read ${name}'s job list directly but could not.`;
    report("direct_read_failed", `${lead} ${read.problem ?? ""} Please check it by hand.`.trim());
    return;
  }
  args.alreadyReadHosts.add(sourceHost);
  outcome.actions.push(`direct read: ${sourceHost} (${read.pagesRead} of ${read.totalPages} pages, ${read.listings.length} listings)`);

  const request = buildSelectionRequest(name, read.listings, args.facets, config);
  const result = await args.provider.runStep(request as unknown as Record<string, unknown>);
  if (!result.ok) {
    report("direct_read_failed", `Read ${read.listings.length} listings but could not choose from them (provider error ${result.status}).`);
    return;
  }
  const selection = parseSelectionPayload(result.payload, read.listings.length);
  outcome.usage = addUsage(outcome.usage, selection.usage);
  if (!selection.ok) {
    report("direct_read_failed", `Read ${read.listings.length} listings but could not choose from them: ${selection.error}`);
    return;
  }

  for (const index of selection.selected) {
    outcome.candidates.push({ ...toPosting(read.listings[index], name), tier: "direct_read" });
  }
  outcome.reads.push({ employer: name, host: sourceHost, pages: read.pagesRead, listings: read.listings.length, selected: selection.selected.length });
  const lead =
    trigger === "stuck"
      ? `The search could not read this employer's job list, so the app read it directly from ${sourceHost}`
      : `The app read ${name}'s job list directly from ${sourceHost}`;
  outcome.coverage.push({
    name,
    status: "read_directly_by_app",
    careersPageUrl: source.kind === "icims" ? icimsListUrl(source.host, 0) : peopleAdminListUrl(source.base, 0),
    note: `${lead}: ${read.listings.length} listings across ${read.pagesRead} of ${read.totalPages} pages${read.problem ? ` (${read.problem})` : ""}. ${selection.selected.length} looked relevant; each was then checked on its own page.`,
  });
}

function listSourceHost(source: ListSource): string {
  return source.kind === "icims" ? source.host : new URL(source.base).hostname;
}

function toPosting(listing: DirectListing, employer: string): DiscoveredPosting {
  return {
    title: listing.title,
    employer,
    worksite_text: listing.city && listing.state ? `${listing.city}, ${listing.state}` : null,
    worksite_city: listing.city,
    worksite_state: listing.state,
    source_url: listing.url,
    requisition_id: listing.requisitionId,
    posted_or_closing_date: null,
    salary_text: null,
    remote_status: "not_stated",
    matched_role_term: "",
    evidence_excerpt: listing.snippet,
  };
}
