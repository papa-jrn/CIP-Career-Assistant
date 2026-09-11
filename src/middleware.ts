import { createServerClient } from "@supabase/ssr";
import { defineMiddleware } from "astro:middleware";
import { getTrustedSiteOrigin } from "./lib/security";

// htmx is bundled locally and all page scripts are Astro-processed external
// modules, so production needs no inline-script or CDN allowances. Dev keeps
// 'unsafe-inline' because the Vite dev server injects inline scripts.
// style-src keeps 'unsafe-inline' for Astro component <style> tags.
const scriptSrc = import.meta.env.DEV ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co https://api.stripe.com https://checkout.stripe.com",
  "frame-src https://checkout.stripe.com",
  "form-action 'self' https://checkout.stripe.com",
].join("; ");

const securityHeaders: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy": contentSecurityPolicy,
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), payment=(self)",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
};

export const onRequest = defineMiddleware(async (context, next) => {
  // Normalize the loopback host before anything else. Astro's checkOrigin does
  // an exact Origin === request-URL-origin compare (re-enabled in commit
  // 3a1805d), so a browser on http://127.0.0.1:4321 while PUBLIC_SITE_URL says
  // http://localhost:4321 got a silent 403 on EVERY htmx POST — the Autumn
  // 2026 "dead buttons" bug. GET/HEAD redirect to the trusted origin; other
  // methods get an explicit explanation instead of a mystery 403.
  const trustedOrigin = getTrustedSiteOrigin();
  const trustedUrl = new URL(trustedOrigin);
  if (trustedUrl.hostname === "localhost") {
    const loopbackAlias = `127.0.0.1:${trustedUrl.port}`;
    const hostHeader = context.request.headers.get("host") ?? "";
    if (hostHeader === loopbackAlias) {
      const requestUrl = new URL(context.request.url);
      const normalized = `${trustedOrigin}${requestUrl.pathname}${requestUrl.search}`;
      if (context.request.method === "GET" || context.request.method === "HEAD") {
        return new Response(null, { status: 308, headers: { Location: normalized } });
      }
      return new Response(
        `<!doctype html><html><body><h2>Open ${trustedOrigin}</h2><p>This app only accepts changes from <a href="${trustedOrigin}">${trustedOrigin}</a>, but this page was opened via http://${hostHeader}. Open ${normalized} and try again.</p></body></html>`,
        { status: 403, headers: { "Content-Type": "text/html; charset=utf-8" } },
      );
    }
  }

  const hasSupabaseEnv =
    Boolean(import.meta.env.PUBLIC_SUPABASE_URL) &&
    Boolean(import.meta.env.PUBLIC_SUPABASE_ANON_KEY);

  if (hasSupabaseEnv) {
    const supabase = createServerClient(
      import.meta.env.PUBLIC_SUPABASE_URL,
      import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          get(name) {
            return context.cookies.get(name)?.value;
          },
          set(name, value, options) {
            context.cookies.set(name, value, options);
          },
          remove(name, options) {
            context.cookies.delete(name, options);
          },
        },
      },
    );

    await supabase.auth.getUser();
  }

  const response = await next();
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(securityHeaders)) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
});
