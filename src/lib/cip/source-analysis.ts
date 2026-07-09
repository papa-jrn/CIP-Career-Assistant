import type { AdvisorEvidenceResponse } from "@/lib/cip/advisor";
import type { IntakeForm } from "@/lib/cip/intake";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export interface SourceSnapshot {
  url: string;
  title: string;
  sourceType: "github_repo" | "article" | "video" | "website" | "unknown";
  fetched: boolean;
  text: string;
  error?: string;
  discoveredUrls?: string[];
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
  const seen = new Set<string>();
  for (const url of urls.slice(0, 12)) {
    const cleaned = cleanUrl(url);
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    snapshots.push(await fetchSourceSnapshot(cleaned));
  }

  const discovered = snapshots
    .flatMap((snapshot) => snapshot.discoveredUrls ?? [])
    .filter((url) => {
      const cleaned = cleanUrl(url);
      if (seen.has(cleaned)) return false;
      seen.add(cleaned);
      return true;
    })
    .slice(0, Math.max(0, 20 - snapshots.length));

  for (const url of discovered) {
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

    const response = await fetchSafe(url, 12_000);

    if (!response) {
      return {
        url,
        title: url,
        sourceType,
        fetched: false,
        text: "",
        error: "URL blocked: resolves to a private, loopback, link-local, or metadata address, or uses a disallowed scheme.",
      };
    }

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
      discoveredUrls: contentType.includes("html") ? extractSameSiteArticleLinks(body, url) : [],
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

function extractSameSiteArticleLinks(html: string, pageUrl: string) {
  const links = new Set<string>();
  let base: URL;

  try {
    base = new URL(pageUrl);
  } catch {
    return [];
  }

  for (const match of html.matchAll(/href=["']([^"']+)["']/gi)) {
    try {
      const parsed = new URL(match[1], base);
      if (parsed.hostname !== base.hostname) continue;
      if (parsed.href === base.href) continue;
      if (!looksLikeArticleLink(parsed)) continue;
      links.add(cleanUrl(parsed.href));
    } catch {
      continue;
    }
  }

  return [...links].slice(0, 15);
}

function looksLikeArticleLink(url: URL) {
  const path = url.pathname.toLowerCase();
  if (path.includes("/tag/") || path.includes("/category/") || path.includes("/author/")) return false;
  if (path.endsWith("/articles/") || path.endsWith("/blog/") || path.endsWith("/news/")) return false;
  return ["/articles/", "/article/", "/blog/", "/posts/", "/post/", "/news/", "/insights/"].some((segment) => path.includes(segment));
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

// Maximum bytes read from a fetched source body. Defends against memory
// exhaustion from huge responses (the body is later excerpted to 12k chars
// anyway, so 1 MB is plenty of headroom).
const MAX_FETCH_BYTES = 1_000_000;

type SafeResponse = {
  ok: boolean;
  status: number;
  headers: Headers;
  text: () => Promise<string>;
};

// SSRF-safe fetch: validates scheme, resolves the host, blocks private /
// loopback / link-local / metadata / multicast addresses, caps the response
// body size, and manually follows redirects (re-validating each hop) up to a
// small limit. Returns null when the URL is blocked; throws on network error.
async function fetchSafe(rawUrl: string, timeoutMs: number): Promise<SafeResponse | null> {
  let currentUrl = rawUrl;
  for (let hop = 0; hop < 4; hop++) {
    const allowed = await isUrlAllowed(currentUrl);
    if (!allowed) return null;

    const response = await fetch(currentUrl, {
      headers: {
        "User-Agent": "Career Intelligence Platform evidence analyzer",
        Accept: "text/html,text/plain,application/xhtml+xml",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });

    // fetch surfaces 3xx as a normal response when redirect is "manual".
    const status = response.status;
    if (status >= 300 && status < 400) {
      const location = response.headers.get("location");
      if (!location) return null;
      try {
        currentUrl = new URL(location, currentUrl).href;
        continue;
      } catch {
        return null;
      }
    }

    return {
      ok: response.ok,
      status,
      headers: response.headers,
      text: () => readCappedText(response),
    };
  }
  return null;
}

async function readCappedText(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder("utf-8");
  // Collect raw bytes up to the cap, then decode once. This keeps the byte
  // ceiling exact regardless of multi-byte UTF-8 boundaries.
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (bytesRead + value.byteLength > MAX_FETCH_BYTES) {
      const remaining = MAX_FETCH_BYTES - bytesRead;
      if (remaining > 0) chunks.push(value.subarray(0, remaining));
      break;
    }
    chunks.push(value);
    bytesRead += value.byteLength;
  }
  const merged = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  return decoder.decode(merged, { stream: false });
}

// Resolve the URL's host and reject private/loopback/link-local/metadata
// addresses. Also pins the scheme to http/https and blocks non-default ports
// to internal targets (a belt-and-suspenders check).
async function isUrlAllowed(rawUrl: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const hostname = parsed.hostname;
  if (!hostname) return false;

  // Literal IP in the URL — validate directly without DNS.
  if (isIP(hostname)) {
    return !isBlockedIp(hostname);
  }

  // Hostname — resolve and reject if any resolved address is blocked.
  try {
    const records = await lookup(hostname, { all: true });
    if (!records.length) return false;
    return records.every((record) => !isBlockedIp(record.address));
  } catch {
    return false;
  }
}

function isBlockedIp(address: string): boolean {
  // Normalize IPv6-mapped IPv4 (e.g. ::ffff:169.254.169.254).
  const normalized = address.replace(/^::ffff:/, "");
  const parts = normalized.split(".").map(Number);
  const isIpv4 = parts.length === 4 && parts.every((p) => Number.isFinite(p) && p >= 0 && p <= 255);

  if (isIpv4) {
    const [a, b] = parts;
    if (a === 10) return true; // 10.0.0.0/8 private
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 0) return true; // 0.0.0.0/8 "this network"
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved
    return false;
  }

  // IPv6 checks.
  const lower = normalized.toLowerCase();
  if (lower === "::1") return true; // loopback
  if (lower.startsWith("fe80:")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // fc00::/7 unique-local
  if (lower.startsWith("ff")) return true; // multicast
  if (lower === "::" || lower === "::0") return true; // unspecified
  return false;
}

function cleanUrl(value: string) {
  return value.replace(/[.,;:!?]+$/, "");
}

function excerpt(value: string, max: number) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}...` : cleaned;
}
