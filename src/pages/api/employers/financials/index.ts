import type { APIRoute } from "astro";
import { loadFundingProfiles, parseEinInput, refreshFundingProfile } from "@/lib/cip/employer-financials";
import { renderFinancialsBlock, friendlyFinancialsError } from "@/lib/cip/employer-financials-view";
import { normOrg } from "@/lib/cip/employer-resolution";
import { checkRateLimit, clientRateLimitKey } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/security";
import { createServer } from "@/lib/supabase/server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

// Look up (or refresh) ONE tracked employer's IRS Form 990 profile and return its card block. An
// optional `ein` links a specific filer the user knows (the escape hatch when the automatic name
// match is unconfirmed). Only the employer's public name and state go to ProPublica.
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOriginRequest(request)) return html('<p class="text-sm text-red-700">Invalid request origin.</p>', 403);

  const supabase = createServer(cookies);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return html('<p class="text-sm text-red-700">Sign in to look up financials.</p>', 401);

  const limit = checkRateLimit({ key: clientRateLimitKey(request, `employer-financials:user:${user.id}`), limit: 40, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) return html('<p class="text-sm text-red-700">Too many lookups. Wait a little before trying again.</p>', 429);

  const form = await request.formData();
  const employerId = String(form.get("employer_id") ?? "");
  if (!UUID_PATTERN.test(employerId)) return html('<p class="text-sm text-red-700">That employer could not be found.</p>', 400);

  const { data: employer } = await supabase
    .from("watched_employers")
    .select("id,name,location,region")
    .eq("user_id", user.id)
    .eq("id", employerId)
    .maybeSingle();
  if (!employer) return html('<p class="text-sm text-red-700">That employer could not be found.</p>', 404);
  const row = employer as { id: string; name: string; location: string | null; region: string | null };

  const { profiles, error: loadError } = await loadFundingProfiles(supabase, user.id);
  const existing = profiles.get(normOrg(row.name)) ?? null;
  const block = (extra: { message?: string | null; profile?: typeof existing; setupError?: string | null }) =>
    renderFinancialsBlock({ employerId: row.id, employerName: row.name, profile: extra.profile === undefined ? existing : extra.profile, message: extra.message, setupError: extra.setupError });

  if (loadError) return html(block({ setupError: loadError }));

  const einText = String(form.get("ein") ?? "").trim();
  const ein = einText ? parseEinInput(einText) : null;
  if (einText && ein === null) return html(block({ message: "An EIN is nine digits, like 12-3456789. Nothing was changed." }));

  const outcome = await refreshFundingProfile(
    supabase,
    user.id,
    { name: row.name, location: row.location, region: row.region, ein, einSource: ein ? "user" : undefined },
    existing,
    { sleep },
  );
  // A failed refresh that kept earlier data (saved:false, status ok) and a failed save both explain themselves here.
  const friendly = outcome.error ? friendlyFinancialsError(outcome.error) : null;
  const message = outcome.saved ? null : outcome.profile.status === "ok" && outcome.error?.includes("last saved") ? friendly : `Looked up, but the result could not be saved: ${friendly}`;
  return html(block({ profile: outcome.profile, message }));
};

function html(body: string, status = 200) {
  return new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

