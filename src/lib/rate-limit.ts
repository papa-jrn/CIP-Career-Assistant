type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

const buckets = new Map<string, RateLimitEntry>();
const MAX_BUCKETS = 5_000;

export function clientRateLimitKey(request: Request, scope: string) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const clientIp =
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    forwardedFor ||
    "unknown";

  return `${scope}:${clientIp}`;
}

export function checkRateLimit(options: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  pruneExpiredBuckets(now);

  const current = buckets.get(options.key);
  const entry = current && current.resetAt > now
    ? current
    : { count: 0, resetAt: now + options.windowMs };

  entry.count += 1;
  buckets.set(options.key, entry);

  if (buckets.size > MAX_BUCKETS) {
    pruneOldestBucket();
  }

  const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));

  return {
    allowed: entry.count <= options.limit,
    remaining: Math.max(0, options.limit - entry.count),
    resetAt: entry.resetAt,
    retryAfterSeconds,
  };
}

// Throttle an email-sending auth endpoint (magic link, password reset).
// Guards two abuse shapes at once: bombing one address (per email+IP) and
// one IP spraying many addresses (per IP). Returns the blocking result, or
// null when the request is under both limits. `scope` distinguishes
// endpoints (e.g. "auth-login" vs "auth-reset").
export function checkAuthEmailRateLimit(
  request: Request,
  scope: string,
  email: string,
): RateLimitResult | null {
  const normalizedEmail = email.trim().toLowerCase();
  const windowMs = 60 * 60 * 1000; // 1 hour

  const perEmail = checkRateLimit({
    key: clientRateLimitKey(request, `${scope}:email:${normalizedEmail}`),
    limit: 5,
    windowMs,
  });
  if (!perEmail.allowed) return perEmail;

  const perIp = checkRateLimit({
    key: clientRateLimitKey(request, `${scope}:ip`),
    limit: 20,
    windowMs,
  });
  if (!perIp.allowed) return perIp;

  return null;
}

export function rateLimitedHtml(message: string, result: RateLimitResult) {
  return new Response(`<p class="text-sm font-semibold text-red-700">${escapeHtml(message)}</p>`, {
    status: 429,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Retry-After": String(result.retryAfterSeconds),
      "X-RateLimit-Remaining": String(result.remaining),
      "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
    },
  });
}

function pruneExpiredBuckets(now: number) {
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

function pruneOldestBucket() {
  let oldestKey: string | null = null;
  let oldestReset = Number.POSITIVE_INFINITY;

  for (const [key, entry] of buckets) {
    if (entry.resetAt < oldestReset) {
      oldestKey = key;
      oldestReset = entry.resetAt;
    }
  }

  if (oldestKey) {
    buckets.delete(oldestKey);
  }
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
