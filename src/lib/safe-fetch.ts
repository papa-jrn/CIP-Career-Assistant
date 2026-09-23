import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Shared SSRF-safe fetch. Moved out of source-analysis.ts unchanged in behavior so every
 * outbound fetch of a user- or model-supplied URL (linked evidence sources, job-posting
 * verification) goes through the same guard.
 */

// Maximum bytes read from a fetched source body. Defends against memory
// exhaustion from huge responses (the body is later excerpted to 12k chars
// anyway, so 1 MB is plenty of headroom).
const MAX_FETCH_BYTES = 1_000_000;

export type SafeResponse = {
  ok: boolean;
  status: number;
  headers: Headers;
  text: () => Promise<string>;
};

// SSRF-safe fetch: validates scheme, resolves the host, blocks private /
// loopback / link-local / metadata / multicast addresses, caps the response
// body size, and manually follows redirects (re-validating each hop) up to a
// small limit. Returns null when the URL is blocked; throws on network error.
export async function fetchSafe(
  rawUrl: string,
  timeoutMs: number,
  options: { userAgent?: string; accept?: string } = {},
): Promise<SafeResponse | null> {
  let currentUrl = rawUrl;
  for (let hop = 0; hop < 4; hop++) {
    const allowed = await isUrlAllowed(currentUrl);
    if (!allowed) return null;

    const response = await fetch(currentUrl, {
      headers: {
        "User-Agent": options.userAgent ?? "Career Intelligence Platform evidence analyzer",
        Accept: options.accept ?? "text/html,text/plain,application/xhtml+xml",
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

export function isBlockedIp(address: string): boolean {
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
