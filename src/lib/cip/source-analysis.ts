import type { AdvisorEvidenceResponse } from "@/lib/cip/advisor";
import type { IntakeForm } from "@/lib/cip/intake";

export interface SourceSnapshot {
  url: string;
  title: string;
  sourceType: "github_repo" | "article" | "video" | "website" | "unknown";
  fetched: boolean;
  text: string;
  error?: string;
}

export interface SourceAnalysisItem {
  url: string;
  sourceType: SourceSnapshot["sourceType"];
  projectName: string;
  likelyUserRole: string;
  evidenceStrength: "strong" | "moderate" | "weak" | "unverified";
  proves: string[];
  technologiesOrDomains: string[];
  careerClaimsSupported: string[];
  needsUserConfirmation: string[];
  summary: string;
}

export function collectEvidenceUrls(intake: Partial<IntakeForm>, evidenceResponses: AdvisorEvidenceResponse[]) {
  const candidates = [
    intake.linkedin_url,
    intake.portfolio_urls,
    intake.public_evidence,
    ...evidenceResponses.map((response) => response.proofUrl),
    ...evidenceResponses.map((response) => response.sourceNote),
  ];

  const urls = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate) continue;
    for (const match of candidate.matchAll(/https?:\/\/[^\s<>"')]+/g)) {
      urls.add(cleanUrl(match[0]));
    }
  }

  return [...urls].filter(Boolean).slice(0, 20);
}

export async function fetchSourceSnapshots(urls: string[]) {
  const snapshots: SourceSnapshot[] = [];
  for (const url of urls.slice(0, 12)) {
    snapshots.push(await fetchSourceSnapshot(url));
  }
  return snapshots;
}

export async function buildSourceAnalysis(
  snapshots: SourceSnapshot[],
  context: {
    intake?: Partial<IntakeForm>;
    evidenceResponses?: AdvisorEvidenceResponse[];
  } = {},
) {
  const openAiKey = import.meta.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (openAiKey) {
    const ai = await tryBuildAiSourceAnalysis(snapshots, context, openAiKey);
    if (ai) return ai;
  }

  return snapshots.map((snapshot) => buildDeterministicSourceAnalysis(snapshot, context));
}

export function sourceAnalysesToEvidence(items: SourceAnalysisItem[]): AdvisorEvidenceResponse[] {
  return items.map((item) => ({
    question: `What does this linked source prove? ${item.url}`,
    answer: [
      item.summary,
      `Likely role: ${item.likelyUserRole}`,
      `What it proves: ${item.proves.join("; ") || "Needs review"}`,
      `Technologies/domains: ${item.technologiesOrDomains.join("; ") || "Needs review"}`,
      `Supports: ${item.careerClaimsSupported.join("; ") || "Needs review"}`,
      `Evidence strength: ${item.evidenceStrength}`,
    ].join("\n"),
    confidence: item.evidenceStrength === "strong" || item.evidenceStrength === "moderate" ? "known" : "needs_source",
    proofUrl: item.url,
    sourceNote: item.needsUserConfirmation.join("; "),
  }));
}

async function fetchSourceSnapshot(url: string): Promise<SourceSnapshot> {
  const sourceType = classifySource(url);
  try {
    const videoMetadata = sourceType === "video" ? await fetchVideoMetadata(url) : null;
    if (videoMetadata) {
      return {
        url,
        title: videoMetadata.title,
        sourceType,
        fetched: true,
        text: excerpt(
          [
            `Video title: ${videoMetadata.title}`,
            `Author/channel: ${videoMetadata.authorName}`,
            `Provider: ${videoMetadata.providerName}`,
            videoMetadata.description ? `Description: ${videoMetadata.description}` : "",
            "Note: video metadata was fetched, but the app cannot yet watch or transcribe the video. Treat production/story claims as needing user confirmation unless supported elsewhere.",
          ].filter(Boolean).join("\n"),
          12_000,
        ),
      };
    }

    const githubReadme = sourceType === "github_repo" ? await fetchGithubReadme(url) : null;
    if (githubReadme) {
      return {
        url,
        title: githubReadme.title,
        sourceType,
        fetched: true,
        text: excerpt(githubReadme.text, 12_000),
      };
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Career Intelligence Platform evidence analyzer",
        Accept: "text/html,text/plain,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(12_000),
    });

    if (!response.ok) {
      return {
        url,
        title: url,
        sourceType,
        fetched: false,
        text: "",
        error: `Fetch failed with HTTP ${response.status}`,
      };
    }

    const contentType = response.headers.get("content-type") ?? "";
    const body = await response.text();
    const text = contentType.includes("html") ? [extractMetaSummary(body), htmlToText(body)].filter(Boolean).join("\n") : body;
    return {
      url,
      title: extractTitle(body) || url,
      sourceType,
      fetched: true,
      text: excerpt(text, 12_000),
    };
  } catch (error) {
    return {
      url,
      title: url,
      sourceType,
      fetched: false,
      text: "",
      error: error instanceof Error ? error.message : "Unknown fetch error",
    };
  }
}

async function fetchVideoMetadata(url: string) {
  const oembedUrl = buildOembedUrl(url);
  if (!oembedUrl) return null;
  const response = await fetch(oembedUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Career Intelligence Platform evidence analyzer",
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) return null;
  const data = await response.json() as {
    title?: string;
    author_name?: string;
    provider_name?: string;
    description?: string;
  };
  return {
    title: data.title || url,
    authorName: data.author_name || "Unknown",
    providerName: data.provider_name || "Video",
    description: data.description || "",
  };
}

function buildOembedUrl(url: string) {
  const encoded = encodeURIComponent(url);
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtube.com") || parsed.hostname.includes("youtu.be")) {
      return `https://www.youtube.com/oembed?url=${encoded}&format=json`;
    }
    if (parsed.hostname.includes("vimeo.com")) {
      return `https://vimeo.com/api/oembed.json?url=${encoded}`;
    }
  } catch {
    return null;
  }
  return null;
}

async function fetchGithubReadme(url: string) {
  const match = url.match(/^https?:\/\/github\.com\/([^/\s]+)\/([^/#?\s]+)/i);
  if (!match) return null;
  const [, owner, rawRepo] = match;
  const repo = rawRepo.replace(/\.git$/, "");
  const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme`, {
    headers: {
      Accept: "application/vnd.github.raw",
      "User-Agent": "Career Intelligence Platform evidence analyzer",
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) return null;
  return {
    title: `${owner}/${repo} README`,
    text: await response.text(),
  };
}

async function tryBuildAiSourceAnalysis(
  snapshots: SourceSnapshot[],
  context: {
    intake?: Partial<IntakeForm>;
    evidenceResponses?: AdvisorEvidenceResponse[];
  },
  openAiKey: string,
) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: import.meta.env.OPENAI_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content:
            "You are a career evidence analyst. Analyze linked sources such as GitHub READMEs, articles, videos, and project pages in the context of the user's resume/intake and saved evidence. If the resume or saved evidence establishes the user's role with an organization/project, use that context instead of asking generic role-confirmation questions. Do not invent metrics, dates, or private contributions. For videos, use available metadata and require transcript/user confirmation for detailed production claims.",
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Convert fetched project/source snapshots into structured career evidence.",
            snapshots,
            context: {
              resumeText: context.intake?.resume_text,
              targetTitle: context.intake?.target_title,
              publicEvidence: context.intake?.public_evidence,
              portfolioUrls: context.intake?.portfolio_urls,
              claimBoundaries: context.intake?.claim_boundaries,
              evidenceResponses: context.evidenceResponses?.slice(0, 30),
            },
          }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "source_evidence_analysis",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["items"],
            properties: {
              items: {
                type: "array",
                minItems: 1,
                maxItems: 12,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: [
                    "url",
                    "sourceType",
                    "projectName",
                    "likelyUserRole",
                    "evidenceStrength",
                    "proves",
                    "technologiesOrDomains",
                    "careerClaimsSupported",
                    "needsUserConfirmation",
                    "summary",
                  ],
                  properties: {
                    url: { type: "string" },
                    sourceType: { type: "string", enum: ["github_repo", "article", "video", "website", "unknown"] },
                    projectName: { type: "string" },
                    likelyUserRole: { type: "string" },
                    evidenceStrength: { type: "string", enum: ["strong", "moderate", "weak", "unverified"] },
                    proves: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 5 },
                    technologiesOrDomains: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 8 },
                    careerClaimsSupported: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
                    needsUserConfirmation: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
                    summary: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    }),
  });

  if (!response.ok) return null;
  const payload = await response.json();
  const text = extractResponseText(payload);
  if (!text) return null;

  try {
    const parsed = JSON.parse(text) as { items?: SourceAnalysisItem[] };
    return parsed.items?.length ? parsed.items : null;
  } catch {
    return null;
  }
}

function buildDeterministicSourceAnalysis(
  snapshot: SourceSnapshot,
  context: {
    intake?: Partial<IntakeForm>;
    evidenceResponses?: AdvisorEvidenceResponse[];
  } = {},
): SourceAnalysisItem {
  const text = snapshot.text.toLowerCase();
  const technologies = ["javascript", "typescript", "react", "astro", "node", "supabase", "python", "godot", "html", "css"]
    .filter((term) => text.includes(term));
  const contextText = [
    context.intake?.resume_text,
    context.intake?.hidden_achievements,
    context.intake?.public_evidence,
    ...(context.evidenceResponses ?? []).map((response) => `${response.question} ${response.answer} ${response.sourceNote}`),
  ].join("\n").toLowerCase();
  const contextualRole =
    contextText.includes("executive director") && text.includes("claremont")
      ? "Executive Director / website and operations lead, supported by resume context"
      : contextText.includes("web developer") || contextText.includes("built")
        ? "Web/project contributor, supported by saved context"
        : "Needs user confirmation";
  return {
    url: snapshot.url,
    sourceType: snapshot.sourceType,
    projectName: snapshot.title || snapshot.url,
    likelyUserRole: contextualRole,
    evidenceStrength: snapshot.fetched ? "moderate" : "unverified",
    proves: snapshot.fetched
      ? ["A public source exists and contains inspectable project or article text."]
      : [`The source could not be fetched: ${snapshot.error ?? "unknown error"}`],
    technologiesOrDomains: technologies.length ? technologies : ["Needs extraction"],
    careerClaimsSupported: snapshot.fetched
      ? ["Potential public evidence for project work, subject matter exposure, or technical contribution."]
      : ["No career claim should rely on this source until it can be fetched or described."],
    needsUserConfirmation: contextualRole === "Needs user confirmation"
      ? [
          "What was the user's exact role?",
          "What work did the user personally complete?",
          "What outcomes, users, or business value resulted?",
        ]
      : [
          "Specific metrics, audience reach, usage, or before/after outcomes.",
          "Which parts of the work are safe to use publicly.",
        ],
    summary: snapshot.fetched
      ? `Fetched ${snapshot.title}. This should be reviewed for the user's exact contribution before using it as strong evidence.`
      : `Could not fetch ${snapshot.url}. ${snapshot.error ?? ""}`,
  };
}

function classifySource(url: string): SourceSnapshot["sourceType"] {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "github.com" && parsed.pathname.split("/").filter(Boolean).length >= 2) return "github_repo";
    if (
      parsed.hostname.includes("youtube.com") ||
      parsed.hostname.includes("youtu.be") ||
      parsed.hostname.includes("vimeo.com")
    ) return "video";
    if (parsed.pathname.match(/\.(md|html?|php|aspx?)$/i) || parsed.hostname.includes("medium") || parsed.hostname.includes("substack")) return "article";
    return "website";
  } catch {
    return "unknown";
  }
}

function extractMetaSummary(html: string) {
  const fields = [
    ["Title", extractTitle(html)],
    ["Description", extractMeta(html, "description")],
    ["OpenGraph title", extractMeta(html, "og:title")],
    ["OpenGraph description", extractMeta(html, "og:description")],
    ["Article author", extractMeta(html, "author")],
  ].filter(([, value]) => value);
  return fields.map(([label, value]) => `${label}: ${value}`).join("\n");
}

function extractMeta(html: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"))?.[1] ??
    html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escaped}["']`, "i"))?.[1] ??
    ""
  ).replace(/\s+/g, " ").trim();
}

function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitle(html: string) {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
}

function extractResponseText(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const direct = (payload as { output_text?: unknown }).output_text;
  if (typeof direct === "string") return direct;
  const output = (payload as { output?: unknown }).output;
  if (!Array.isArray(output)) return null;
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string") return text;
    }
  }
  return null;
}

function cleanUrl(value: string) {
  return value.replace(/[.,;:!?]+$/, "");
}

function excerpt(value: string, max: number) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}...` : cleaned;
}
