import { getPublicEnv } from "@/lib/env";

export function getTrustedSiteOrigin() {
  try {
    return new URL(getPublicEnv().PUBLIC_SITE_URL).origin;
  } catch {
    return "http://127.0.0.1:4321";
  }
}

export function isSafeRedirectPath(
  value: string | null | undefined,
  fallback = "/account",
) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  try {
    const url = new URL(value, "http://localhost");
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export function isSameOriginRequest(request: Request) {
  const trustedOrigin = getTrustedSiteOrigin();
  const origin = request.headers.get("origin");
  if (origin) {
    return origin === trustedOrigin || isLocalDevOrigin(origin);
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      return refererOrigin === trustedOrigin || isLocalDevOrigin(refererOrigin);
    } catch {
      return false;
    }
  }

  return false;
}

function isLocalDevOrigin(origin: string) {
  return origin === "http://127.0.0.1:4321" || origin === "http://localhost:4321";
}
