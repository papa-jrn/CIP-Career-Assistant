import {
  detectListSource,
  icimsListUrl,
  readIcimsListings,
  type DirectListing,
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

export async function directReadStuckTargets(args: {
  entries: ParsedStepResponse["employers_checked"];
  step: SearchStep;
  facets: OutboundSearchFacets;
  config: Pick<JobSearchConfig, "model" | "limits" | "pricing">;
  provider: JobSearchProvider;
  fetcher: PageFetcher;
  usedSoFar: RunUsage;
  alreadyReadHosts: Set<string>;
}): Promise<DirectReadOutcome> {
  const { config } = args;
  const outcome: DirectReadOutcome = { candidates: [], coverage: [], reads: [], actions: [], usage: EMPTY_USAGE };
  const stuck = args.entries
    .filter((entry) => entry.status === "page_found_but_could_not_read_listings" && entry.careers_page_url)
    .slice(0, config.limits.directReadsPerStep);

  for (const entry of stuck) {
    const url = entry.careers_page_url as string;
    const fail = (status: DirectCoverage["status"], note: string) =>
      outcome.coverage.push({ name: entry.name, status, note, careersPageUrl: url });

    const budget = checkBudget(addUsage(args.usedSoFar, outcome.usage), args.step.index, config);
    if (!budget.ok) {
      fail("direct_read_failed", `Not read directly: ${budget.reason}. Please open this employer's job list yourself.`);
      continue;
    }

    const shell = await args.fetcher(url);
    const source = detectListSource(url, shell?.text ?? null);
    if (!source) {
      fail("direct_read_unsupported", "The search could not read this page and it does not use a job-list format the app can read on its own (iCIMS is supported). Please check it by hand.");
      continue;
    }
    if (args.alreadyReadHosts.has(source.host)) {
      fail("read_directly_by_app", `The app already read the job list at ${source.host} earlier in this run.`);
      continue;
    }

    const read = await readIcimsListings(args.fetcher, source.host, {
      maxPages: config.limits.directReadMaxPages,
      delayMs: config.limits.directReadDelayMs,
      maxListings: config.limits.directReadMaxListings,
    });
    if (!read.ok) {
      fail("direct_read_failed", `The search could not read this job list and the app's own attempt also failed. ${read.problem ?? ""} Please check it by hand.`.trim());
      continue;
    }
    args.alreadyReadHosts.add(source.host);
    outcome.actions.push(`direct read: ${source.host} (${read.pagesRead} of ${read.totalPages} pages, ${read.listings.length} listings)`);

    const request = buildSelectionRequest(entry.name, read.listings, args.facets, config);
    const result = await args.provider.runStep(request as unknown as Record<string, unknown>);
    if (!result.ok) {
      fail("direct_read_failed", `Read ${read.listings.length} listings but could not choose from them (provider error ${result.status}).`);
      continue;
    }
    const selection = parseSelectionPayload(result.payload, read.listings.length);
    outcome.usage = addUsage(outcome.usage, selection.usage);
    if (!selection.ok) {
      fail("direct_read_failed", `Read ${read.listings.length} listings but could not choose from them: ${selection.error}`);
      continue;
    }

    for (const index of selection.selected) {
      outcome.candidates.push({ ...toPosting(read.listings[index], entry.name), tier: "direct_read" });
    }
    outcome.reads.push({ employer: entry.name, host: source.host, pages: read.pagesRead, listings: read.listings.length, selected: selection.selected.length });
    outcome.coverage.push({
      name: entry.name,
      status: "read_directly_by_app",
      careersPageUrl: icimsListUrl(source.host, 0),
      note: `The search could not read this employer's job list, so the app read it directly from ${source.host}: ${read.listings.length} listings across ${read.pagesRead} of ${read.totalPages} pages${read.problem ? ` (${read.problem})` : ""}. ${selection.selected.length} looked relevant; each was then checked on its own page.`,
    });
  }
  return outcome;
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
