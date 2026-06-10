import type { AstroCookies } from "astro";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { getServiceRoleKey } from "@/lib/env";

export function createServer(cookies: AstroCookies) {
  if (
    !import.meta.env.PUBLIC_SUPABASE_URL ||
    !import.meta.env.PUBLIC_SUPABASE_ANON_KEY
  ) {
    throw new Error("Supabase environment variables are not configured.");
  }

  return createServerClient(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name) {
          return cookies.get(name)?.value;
        },
        set(name, value, options) {
          cookies.set(name, value, options);
        },
        remove(name, options) {
          cookies.delete(name, options);
        },
      },
    },
  );
}

// Service-role client for server-only writes to shared tables (e.g. the
// opportunities catalog). RLS is bypassed, so callers must verify the user
// session themselves before using it. Returns null when the key is not
// configured so callers can fail with an honest message.
export function createAdmin() {
  const serviceKey = getServiceRoleKey();
  if (!import.meta.env.PUBLIC_SUPABASE_URL || !serviceKey) {
    return null;
  }

  return createClient(import.meta.env.PUBLIC_SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
