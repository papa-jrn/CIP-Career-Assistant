import type { APIRoute } from "astro";
import { createServer } from "@/lib/supabase/server";
import { isSafeRedirectPath } from "@/lib/security";

export const GET: APIRoute = async ({ request, cookies, redirect }) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = isSafeRedirectPath(url.searchParams.get("next"));

  if (code) {
    const supabase = createServer(cookies);
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return redirect(next);
    }
    console.error("Supabase auth callback failed:", error.message);
    return redirect(`/login?error=auth&reason=${encodeURIComponent(error.message)}`);
  }

  return redirect("/login?error=auth&reason=Missing%20auth%20code");
};
