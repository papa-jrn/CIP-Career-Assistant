import type { SupabaseClient } from "@supabase/supabase-js";
import type { IntakeForm } from "@/lib/cip/intake";
import { type GeocodedSearchArea, resolveSearchArea } from "@/lib/cip/geography-engine";
import { type EmployerCandidate, scoreEmployer } from "@/lib/cip/watched-employers";

export interface BusinessSearchInput {
  geography: string;
  radiusMiles: number;
  sectors: string[];
  minimumSize: string;
}

export interface BusinessSearchSource {
  name: string;
  source_type:
    | "chamber"
    | "economic_development"
    | "municipality"
    | "school_system"
    | "healthcare_network"
    | "business_directory"
    | "networking"
    | "government_data"
    | "industry_association"
    | "company_site"
    | "other";
  url: string;
  usefulness_score: number;
  notes: string;
}

export interface BusinessSearchCandidate extends EmployerCandidate {
  discovery_channel: string;
  discovery_source_names: string[];
}

export interface BusinessSearchResult {
  mode: "live_web_search" | "not_configured" | "error";
  geography: string;
  radiusMiles: number;
  searchArea?: GeocodedSearchArea;
  summary: string;
  sourcePages: BusinessSearchSource[];
  candidates: BusinessSearchCandidate[];
  error?: string;
}

export function canRunLiveBusinessSearch() {
  return Boolean(import.meta.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY);
}

export async function runBusinessSearch(input: BusinessSearchInput): Promise<BusinessSearchResult> {
  const openAiKey = import.meta.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  const normalized = normalizeBusinessSearchInput(input);

  if (!openAiKey) {
    return {
      mode: "not_configured",
      geography: normalized.geography,
      radiusMiles: normalized.radiusMiles,
      summary:
        "Live employer discovery is not configured yet. Add OPENAI_API_KEY on the server to run web-backed business search. No fixture employer candidates were returned.",
      sourcePages: [],
      candidates: [],
      error: "OPENAI_API_KEY is missing.",
    };
  }

  try {
    const searchArea = await resolveSearchArea(normalized.geography, normalized.radiusMiles);
    return await runOpenAiBusinessSearch(normalized, searchArea, openAiKey);
  } catch (error) {
    return {
      mode: "error",
      geography: normalized.geography,
      radiusMiles: normalized.radiusMiles,
      summary:
        "Live employer discovery attempted a web-backed search but did not complete. No fixture employer candidates were returned.",
      sourcePages: [],
      candidates: [],
      error: error instanceof Error ? error.message : "Unknown business search failure.",
    };
  }
}

export async function saveBusinessSearchResult(
  supabase: SupabaseClient,
  userId: string,
  intake: Partial<IntakeForm>,
  input: BusinessSearchInput,
  result: BusinessSearchResult,
) {
  const now = new Date().toISOString();
  const runInsert = {
    user_id: userId,
    geography: result.geography,
    radius_miles: result.radiusMiles,
    sectors: input.sectors,
    minimum_size: input.minimumSize,
    engine_mode: result.mode,
    summary: result.summary,
    sources_found: result.sourcePages.length,
    candidates_found: result.candidates.length,
    error_message: result.error ?? null,
    created_at: now,
  };

  await supabase.from("employer_discovery_runs").insert(runInsert);

  let savedSources = 0;
  let savedCandidates = 0;

  for (const source of result.sourcePages) {
    const { error } = await supabase.from("discovery_sources").upsert(
      {
        user_id: userId,
        name: source.name,
        region: result.geography,
        source_type: source.source_type,
        url: source.url,
        access_type: "public",
        usefulness_score: source.usefulness_score,
        notes: source.notes,
        last_checked_at: now,
      },
      { onConflict: "user_id,name,region" },
    );
    if (!error) savedSources += 1;
  }

  for (const candidate of result.candidates) {
    const scored = scoreEmployer(candidate, intake);
    const { error } = await supabase.from("employer_candidates").upsert(
      {
        user_id: userId,
        name: candidate.name,
        region: result.geography,
        category: candidate.category,
        location: candidate.location,
        estimated_size: candidate.estimated_size,
        priority: candidate.priority,
        fit_score: scored.fit_score,
        fit_summary: scored.fit_summary,
        target_roles: candidate.target_roles,
        source_url: candidate.source_url,
        careers_url: candidate.careers_url,
        adapter_status: candidate.adapter_status,
        confidence: candidate.confidence,
        discovery_channel: candidate.discovery_channel,
        discovery_source_names: candidate.discovery_source_names,
        source_notes: candidate.source_notes,
        review_state: "pending",
        last_reviewed_at: now,
        updated_at: now,
      },
      { onConflict: "user_id,name,region" },
    );
    if (!error) savedCandidates += 1;
  }

  return { savedSources, savedCandidates };
}

function normalizeBusinessSearchInput(input: BusinessSearchInput): BusinessSearchInput {
  return {
    geography: input.geography.trim(),
    radiusMiles: Number.isFinite(input.radiusMiles) ? Math.max(10, Math.min(150, input.radiusMiles)) : 50,
    sectors: input.sectors.map((sector) => sector.trim()).filter(Boolean).slice(0, 10),
    minimumSize: input.minimumSize || "100",
  };
}

async function runOpenAiBusinessSearch(
  input: BusinessSearchInput,
  searchArea: GeocodedSearchArea,
  openAiKey: string,
): Promise<BusinessSearchResult> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: import.meta.env.OPENAI_BUSINESS_SEARCH_MODEL || process.env.OPENAI_BUSINESS_SEARCH_MODEL || "gpt-4.1-mini",
      tools: [{ type: "web_search" }],
      tool_choice: "auto",
      max_output_tokens: 12000,
      input: [
        {
          role: "system",
          content:
            "You are a careful labor-market research analyst. Use web search. Do not invent employers, employee counts, career URLs, or source pages. If evidence is weak, mark confidence low and explain the review need. Prefer employer-owned pages, chambers of commerce, municipalities, school systems, economic development groups, hospitals, higher education, and credible regional directories. The search area has already been geocoded; use the coordinates, radius, and nearby-place list instead of latching onto the text name alone.",
        },
        {
          role: "user",
          content: JSON.stringify({
            task:
              "Find employer candidates for a watched-employer map. This is not a job posting search. Identify real businesses/institutions near the geography that likely employ at least the requested size threshold and may have roles matching the sectors.",
            geography: input.geography,
            geocoded_search_area: {
              display_name: searchArea.displayName,
              latitude: searchArea.latitude,
              longitude: searchArea.longitude,
              radius_miles: searchArea.radiusMiles,
              city: searchArea.city,
              county: searchArea.county,
              state: searchArea.state,
              nearby_places: searchArea.nearbyPlaces.map((place) => ({
                name: place.name,
                type: place.placeType,
                state: place.state,
                distance_miles: place.distanceMiles,
                population: place.population ?? null,
              })),
              generated_search_queries: searchArea.searchQueries,
              attribution: searchArea.attribution,
            },
            radius_miles: input.radiusMiles,
            sectors: input.sectors,
            minimum_employer_size: input.minimumSize,
            requirements: [
              "Return only employers that are connected to source pages found through web search.",
              "Actively search the generated_search_queries and nearby_places, not only the original geography string.",
              "For exact-name collisions, prefer employers inside the radius and explain uncertainty. Do not include a same-name employer just because it ranks highly if it is outside the geocoded radius.",
              "For small towns, include nearby labor-market anchors inside the radius, such as nearby hospitals, colleges, manufacturers, municipalities, school systems, and regional brands.",
              "Include chambers, municipalities, economic development organizations, schools, healthcare systems, and business directories in source_pages when useful.",
              "Do not use built-in app fixtures or examples.",
              "Careers URLs should be employer-owned pages when available; otherwise use the best public hiring page and set adapter_status to manual_review.",
              "Target roles should be broad role lanes, not individual job postings.",
            ],
          }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "business_search_result",
          strict: true,
          schema: businessSearchSchema,
        },
      },
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`OpenAI business search failed (${response.status}): ${message.slice(0, 500)}`);
  }

  const payload = await response.json();
  const text = extractResponseText(payload);
  if (!text) throw new Error("OpenAI business search returned no structured text.");
  const parsed = JSON.parse(text) as Omit<BusinessSearchResult, "mode" | "geography" | "radiusMiles">;

  return {
    mode: "live_web_search",
    geography: input.geography,
    radiusMiles: input.radiusMiles,
    searchArea,
    summary: parsed.summary,
    sourcePages: parsed.sourcePages,
    candidates: parsed.candidates.map((candidate) => ({
      ...candidate,
      priority: candidate.priority ?? "medium",
      adapter_status: candidate.adapter_status ?? "manual_review",
      confidence: candidate.confidence ?? "medium",
      discovery_channel: candidate.discovery_channel || "live_web_search",
      discovery_source_names: candidate.discovery_source_names ?? [],
      source_notes: candidate.source_notes ?? [],
    })),
  };
}

const businessSearchSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "sourcePages", "candidates"],
  properties: {
    summary: { type: "string" },
    sourcePages: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "source_type", "url", "usefulness_score", "notes"],
        properties: {
          name: { type: "string" },
          source_type: {
            type: "string",
            enum: [
              "chamber",
              "economic_development",
              "municipality",
              "school_system",
              "healthcare_network",
              "business_directory",
              "networking",
              "government_data",
              "industry_association",
              "company_site",
              "other",
            ],
          },
          url: { type: "string" },
          usefulness_score: { type: "integer", minimum: 0, maximum: 100 },
          notes: { type: "string" },
        },
      },
    },
    candidates: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "name",
          "region",
          "category",
          "location",
          "estimated_size",
          "priority",
          "target_roles",
          "source_url",
          "careers_url",
          "adapter_status",
          "confidence",
          "discovery_channel",
          "discovery_source_names",
          "source_notes",
        ],
        properties: {
          name: { type: "string" },
          region: { type: "string" },
          category: { type: "string" },
          location: { type: "string" },
          estimated_size: { type: "string" },
          priority: { type: "string", enum: ["critical", "high", "medium", "low"] },
          target_roles: { type: "array", items: { type: "string" }, maxItems: 8 },
          source_url: { type: "string" },
          careers_url: { type: "string" },
          adapter_status: { type: "string", enum: ["supported", "needs_adapter", "manual_review"] },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          discovery_channel: { type: "string" },
          discovery_source_names: { type: "array", items: { type: "string" }, maxItems: 8 },
          source_notes: {
            type: "array",
            maxItems: 5,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "value", "url"],
              properties: {
                label: { type: "string" },
                value: { type: "string" },
                url: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
};

function extractResponseText(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const direct = (payload as { output_text?: unknown }).output_text;
  if (typeof direct === "string") return direct;

  const output = (payload as { output?: unknown }).output;
  if (!Array.isArray(output)) return null;

  const chunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;

    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string") chunks.push(text);
    }
  }

  return chunks.length ? chunks.join("") : null;
}
