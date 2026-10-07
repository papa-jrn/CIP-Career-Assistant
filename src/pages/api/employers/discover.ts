import type { APIRoute } from "astro";
import {
  type BusinessSearchCandidate,
  type BusinessSearchResult,
  type BusinessSearchSource,
  runBusinessSearch,
  saveBusinessSearchResult,
} from "@/lib/cip/business-search-engine";
import {
  deriveDiscoveryTargeting,
  partitionAgainstExisting,
  tagCandidateLanes,
  type DiscoveryTargeting,
  type LaneLike,
} from "@/lib/cip/discovery-targeting";
import { loadStrategicState } from "@/lib/cip/strategic-state";
import { loadLatestIntake } from "@/lib/cip/profile";
import { checkRateLimit, clientRateLimitKey, rateLimitedHtml } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/security";
import { createServer } from "@/lib/supabase/server";

type SavedCandidateRow = {
  id: string;
  name: string;
  category: string;
  location: string | null;
  estimated_size: string | null;
  priority: string;
  fit_score: number;
  fit_summary: string;
  discovery_channel: string;
  discovery_source_names: string[];
  relevant_lanes: string[];
  review_state: string;
};

type AlreadyTracked = { candidate: BusinessSearchCandidate; trackedAs: string };

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOriginRequest(request)) {
    return html('<p class="text-sm text-red-700">Invalid request origin.</p>', 403);
  }

  const supabase = createServer(cookies);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const form = await request.formData();
  const customGeography = String(form.get("custom_geography") ?? "").trim();
  const regions = form.getAll("regions").map(String).filter(Boolean);
  const geography = customGeography || regions.join(", ");
  const manualSectors = form.getAll("sectors").map(String).filter(Boolean);
  const minimumSize = String(form.get("minimum_size") ?? "100");
  const radiusMiles = Number(form.get("radius_miles") ?? 50);

  if (!geography) {
    return html('<p class="text-sm text-red-700">Enter a geography before running business search.</p>', 400);
  }

  if (!user) {
    const limit = checkRateLimit({
      key: clientRateLimitKey(request, "anonymous:employer-discovery"),
      limit: 3,
      windowMs: 15 * 60 * 1000,
    });
    if (!limit.allowed) {
      return rateLimitedHtml("Too many public employer searches. Sign in or try again in a few minutes.", limit);
    }
  }

  // Lane-aware targeting: derive what org types to look for from the user's lanes (strategic state
  // needs auth). Manual sectors, when the user picks any, override the lane-derived ones.
  let lanes: LaneLike[] = [];
  let targeting: DiscoveryTargeting | null = null;
  if (user) {
    try {
      const state = await loadStrategicState(supabase, user.id);
      lanes = state.lanes.map((lane) => ({ lane: lane.lane, label: lane.label }));
      targeting = deriveDiscoveryTargeting(lanes);
    } catch {
      // Fall back to manual sectors if the strategic state can't be built.
    }
  }
  const usingLaneTargeting = manualSectors.length === 0 && Boolean(targeting?.derivedFromLanes);
  const sectors = usingLaneTargeting ? (targeting as DiscoveryTargeting).sectors : manualSectors;

  const searchInput = { geography, radiusMiles, sectors, minimumSize, lanes: usingLaneTargeting ? targeting?.lanes : undefined };
  const result = await runBusinessSearch(searchInput);
  let savedSources = 0;
  let savedCandidates = 0;
  let currentSearchCandidates: SavedCandidateRow[] = [];
  let alreadyTracked: AlreadyTracked[] = [];

  if (user && result.mode === "live_web_search") {
    // Tag every candidate with the lane(s) it serves, then set aside ones already tracked so the queue
    // is not shown duplicates; only genuinely new employers are saved.
    for (const candidate of result.candidates) {
      candidate.relevantLanes = tagCandidateLanes({ name: candidate.name, category: candidate.category }, lanes);
    }
    const existingNames = await loadExistingEmployerNames(supabase, user.id);
    const partition = partitionAgainstExisting(result.candidates, existingNames);
    alreadyTracked = partition.alreadyTracked;
    result.candidates = partition.fresh;

    const intake = (await loadLatestIntake(supabase, user.id)) ?? {};
    const saved = await saveBusinessSearchResult(supabase, user.id, intake, searchInput, result);
    savedSources = saved.savedSources;
    savedCandidates = saved.savedCandidates;

    const names = result.candidates.map((candidate) => candidate.name);
    if (names.length) {
      const { data } = await supabase
        .from("employer_candidates")
        .select("id,name,category,location,estimated_size,priority,fit_score,fit_summary,discovery_channel,discovery_source_names,relevant_lanes,review_state")
        .eq("user_id", user.id)
        .eq("region", result.geography)
        .in("name", names)
        .order("fit_score", { ascending: false });
      currentSearchCandidates = (data ?? []) as SavedCandidateRow[];
    }
  }

  return html(renderDiscoveryResult({ result, savedSources, savedCandidates, signedIn: Boolean(user), currentSearchCandidates, targeting: usingLaneTargeting ? targeting : null, alreadyTracked }));
};

// Existing tracked employer names (watched + candidates) for dedupe against new discovery results.
async function loadExistingEmployerNames(supabase: ReturnType<typeof createServer>, userId: string): Promise<string[]> {
  const [{ data: watched }, { data: candidates }] = await Promise.all([
    supabase.from("watched_employers").select("name").eq("user_id", userId).limit(1000),
    supabase.from("employer_candidates").select("name").eq("user_id", userId).limit(1000),
  ]);
  const names = [
    ...((watched ?? []) as Array<{ name: string }>).map((row) => row.name),
    ...((candidates ?? []) as Array<{ name: string }>).map((row) => row.name),
  ];
  return [...new Set(names.filter(Boolean))];
}

function renderLaneChips(tags: Array<{ label: string }> | undefined) {
  if (!tags || !tags.length) {
    return `<p class="mt-2 text-xs text-[var(--muted)]">No current lane fit — kept for your review.</p>`;
  }
  const seen = new Set<string>();
  const chips = tags
    .filter((tag) => tag.label && !seen.has(tag.label) && seen.add(tag.label))
    .map((tag) => `<span class="inline-flex rounded-md bg-[var(--accent-soft)] px-2 py-1 text-xs font-semibold text-[var(--accent-strong)]">Fits your ${escapeHtml(tag.label)}</span>`)
    .join(" ");
  return `<p class="mt-2 flex flex-wrap gap-1">${chips}</p>`;
}

function renderTargetingBanner(targeting: DiscoveryTargeting | null) {
  if (!targeting || !targeting.derivedFromLanes) return "";
  const laneNames = targeting.lanes.map((lane) => `${escapeHtml(lane.lane)} (${escapeHtml(lane.label)})`).join("; ");
  return `
    <div class="rounded-md border border-[var(--accent)] bg-[var(--accent-soft)] p-3">
      <p class="text-sm font-semibold text-[var(--accent-strong)]">Targeting your lanes</p>
      <p class="mt-1 text-sm text-[var(--muted)]">This search looked for employers that fit: ${laneNames}. Pick sectors manually above to override.</p>
    </div>`;
}

function renderAlreadyTracked(alreadyTracked: AlreadyTracked[]) {
  if (!alreadyTracked.length) return "";
  return `
    <details class="mt-4 rounded-md border border-[var(--line)] bg-[var(--panel)] p-3">
      <summary class="cursor-pointer text-sm font-semibold">Already tracked (${alreadyTracked.length}) — not added again</summary>
      <ul class="mt-2 grid gap-1 text-sm text-[var(--muted)]">
        ${alreadyTracked
          .map((entry) => `<li><span class="font-semibold">${escapeHtml(entry.candidate.name)}</span> — already on your list as ${escapeHtml(entry.trackedAs)}</li>`)
          .join("")}
      </ul>
    </details>`;
}

function renderDiscoveryResult({
  result,
  savedSources,
  savedCandidates,
  signedIn,
  currentSearchCandidates,
  targeting,
  alreadyTracked,
}: {
  result: BusinessSearchResult;
  savedSources: number;
  savedCandidates: number;
  signedIn: boolean;
  currentSearchCandidates: SavedCandidateRow[];
  targeting: DiscoveryTargeting | null;
  alreadyTracked: AlreadyTracked[];
}) {
  if (result.mode === "not_configured") {
    return `
      <div class="rounded-md border border-[var(--warning)] bg-[var(--background)] p-4">
        <p class="text-sm font-semibold text-[var(--warning)]">Business search engine not configured yet.</p>
        <p class="mt-2 text-sm leading-6 text-[var(--muted)]">${escapeHtml(result.summary)}</p>
      </div>
    `;
  }

  if (result.mode === "error") {
    return `
      <div class="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p class="font-semibold">Business search failed.</p>
        <p class="mt-2">${escapeHtml(result.summary)}</p>
        ${result.error ? `<p class="mt-2 text-xs">${escapeHtml(result.error)}</p>` : ""}
      </div>
    `;
  }

  return `
    <div class="rounded-md border border-[var(--line)] bg-[var(--background)] p-4">
      <p class="text-sm font-semibold text-[var(--accent-strong)]">${signedIn ? "Live business search complete." : "Live business search preview."}</p>
      <p class="mt-2 text-sm text-[var(--muted)]">
        ${signedIn ? `${savedSources} source pages saved. ${savedCandidates} employer candidates saved.` : `${result.sourcePages.length} source pages found. ${result.candidates.length} candidates found. Sign in to save employer candidates.`}
      </p>
      <p class="mt-3 text-sm leading-6 text-[var(--muted)]">${escapeHtml(result.summary)}</p>
      ${renderTargetingBanner(targeting) ? `<div class="mt-3">${renderTargetingBanner(targeting)}</div>` : ""}
      ${renderSearchArea(result)}
      ${signedIn ? `<p class="mt-3 text-sm text-[var(--muted)]">Refresh this page to review saved candidates and source pages.</p>` : ""}
    </div>
    ${renderSourcePages(result.sourcePages)}
    ${renderAlreadyTracked(alreadyTracked)}
    ${renderCurrentSearchSaveForm(currentSearchCandidates)}
    <div class="mt-4 grid gap-3">
      ${result.candidates.length ? result.candidates.map((candidate) => `
        <article class="rounded-md border border-[var(--line)] bg-[var(--background)] p-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 class="font-semibold">${escapeHtml(candidate.name)}</h3>
              <p class="mt-1 text-sm text-[var(--muted)]">${escapeHtml(candidate.location)} - ${escapeHtml(candidate.estimated_size)}</p>
            </div>
            <span class="rounded-md bg-[var(--accent-tint)] px-2 py-1 text-xs font-semibold text-[var(--accent-strong)]">${escapeHtml(candidate.priority)} priority</span>
          </div>
          <p class="mt-3 text-sm leading-6 text-[var(--muted)]">${escapeHtml(candidate.category)}</p>
          ${renderLaneChips(candidate.relevantLanes)}
          <p class="mt-2 text-xs text-[var(--muted)]">Sources: ${candidate.discovery_source_names.map(escapeHtml).join(", ")}</p>
        </article>
      `).join("") : `
        <p class="rounded-md border border-[var(--line)] bg-[var(--background)] p-4 text-sm text-[var(--muted)]">No employer candidates matched this live search yet. Try a larger radius, nearby municipality, fewer sector filters, or "Any strategic size."</p>
      `}
    </div>
  `;
}

function renderCurrentSearchSaveForm(candidates: SavedCandidateRow[]) {
  if (!candidates.length) return "";
  return `
    <form class="mt-4 rounded-md border border-[var(--line)] bg-[var(--background)] p-4" hx-post="/api/employers/promote" hx-target="#current-search-promote-result" hx-swap="innerHTML">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-sm font-semibold text-[var(--accent-strong)]">Save businesses from this search</p>
          <p class="mt-1 text-sm text-[var(--muted)]">These rows are tied to this completed search. Select the businesses you want to add to your watched list.</p>
        </div>
        <button class="cip-fancy-button" type="submit"><span>Save selected</span></button>
      </div>
      <div class="mt-3 grid gap-2">
        ${candidates.map((candidate) => `
          <label class="grid gap-2 rounded-md border border-[var(--line)] bg-[var(--panel)] p-3 md:grid-cols-[auto_1fr_auto]">
            <input class="mt-1 h-4 w-4 accent-[var(--accent)]" type="checkbox" name="candidate_ids" value="${escapeHtml(candidate.id)}" checked />
            <span>
              <span class="font-semibold">${escapeHtml(candidate.name)}</span>
              <span class="mt-1 block text-sm text-[var(--muted)]">${escapeHtml(candidate.location ?? "")} - ${escapeHtml(candidate.estimated_size ?? "")}</span>
              <span class="mt-1 block text-xs text-[var(--muted)]">${escapeHtml(candidate.category)} - ${escapeHtml(candidate.discovery_channel)}</span>
              ${candidate.relevant_lanes?.length ? `<span class="mt-1 block text-xs font-semibold text-[var(--accent-strong)]">Fits: ${candidate.relevant_lanes.map(escapeHtml).join(", ")}</span>` : ""}
            </span>
            <span class="text-sm font-semibold text-[var(--accent-strong)]">${candidate.fit_score}%</span>
          </label>
        `).join("")}
      </div>
      <div id="current-search-promote-result" class="mt-3"></div>
    </form>
  `;
}

function renderSearchArea(result: BusinessSearchResult) {
  const area = result.searchArea;
  if (!area) return "";
  const nearby = area.nearbyPlaces.slice(0, 12);
  const queries = area.searchQueries.slice(0, 8);
  return `
    <div class="mt-4 rounded-md border border-[var(--line)] bg-[var(--panel)] p-3">
      <p class="text-sm font-semibold">Geocoded search area</p>
      <p class="mt-1 text-sm text-[var(--muted)]">${escapeHtml(area.displayName)}</p>
      <p class="mt-1 text-xs text-[var(--muted)]">Center: ${area.latitude.toFixed(4)}, ${area.longitude.toFixed(4)} - Radius: ${area.radiusMiles} miles</p>
      ${nearby.length ? `
        <p class="mt-3 text-xs font-semibold uppercase text-[var(--muted)]">Nearby places included</p>
        <p class="mt-1 text-sm text-[var(--muted)]">${nearby.map((place) => `${escapeHtml(place.name)} (${place.distanceMiles} mi)`).join(", ")}</p>
      ` : ""}
      ${queries.length ? `
        <details class="mt-3">
          <summary class="cursor-pointer text-xs font-semibold uppercase text-[var(--muted)]">Generated source queries</summary>
          <ul class="mt-2 grid gap-1 text-sm text-[var(--muted)]">
            ${queries.map((query) => `<li>${escapeHtml(query)}</li>`).join("")}
          </ul>
        </details>
      ` : ""}
      <p class="mt-3 text-xs text-[var(--muted)]">Geocoding attribution: ${escapeHtml(area.attribution)}</p>
    </div>
  `;
}

function renderSourcePages(sources: BusinessSearchSource[]) {
  if (!sources.length) return "";
  return `
    <details class="mt-4 rounded-md border border-[var(--line)] bg-[var(--background)] p-4">
      <summary class="cursor-pointer text-sm font-semibold text-[var(--muted)]">Source pages checked by live search</summary>
      <div class="mt-3 grid gap-3 md:grid-cols-2">
        ${sources.map((source) => `
          <article class="rounded-md border border-[var(--line)] bg-[var(--panel)] p-3">
            <p class="font-semibold">${escapeHtml(source.name)}</p>
            <p class="mt-1 text-xs text-[var(--muted)]">${escapeHtml(source.source_type)} - score ${source.usefulness_score}</p>
            <p class="mt-2 text-sm text-[var(--muted)]">${escapeHtml(source.notes)}</p>
            <a class="mt-2 inline-block text-sm font-semibold text-[var(--accent-strong)] hover:underline" href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">Open source</a>
          </article>
        `).join("")}
      </div>
    </details>
  `;
}

function html(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
