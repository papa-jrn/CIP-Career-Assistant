import type { APIRoute } from "astro";
import { getPublicEnv } from "@/lib/env";
import { isSameOriginRequest } from "@/lib/security";
import { createServer } from "@/lib/supabase/server";

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOriginRequest(request)) {
    return html('<p class="text-sm text-red-600">Invalid request origin.</p>', 403);
  }

  let siteUrl: string;
  try {
    siteUrl = getPublicEnv().PUBLIC_SITE_URL;
  } catch {
    return html('<p class="text-sm text-red-600">Server configuration error.</p>');
  }

  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim();
  if (!email) {
    return html('<p class="text-sm text-red-600">Email is required.</p>');
  }

  const supabase = createServer(cookies);
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?next=/set-password`,
  });

  if (error) {
    return html(`<p class="text-sm text-red-600">${escapeHtml(error.message)}</p>`);
  }

  return html(
    '<p class="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-center text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">Check your email for a password setup link. Open it in this same browser.</p>',
  );
};

function html(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
