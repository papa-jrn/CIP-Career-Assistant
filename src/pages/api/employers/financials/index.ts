import type { APIRoute } from "astro";
import {
  loadFundingProfiles,
  parseEinInput,
  parseFinancialsMode,
  planFinancialsLookup,
  refreshFundingProfile,
  saveFinancialsMode,
  type FinancialsMode,
} from "@/lib/cip/employer-financials";
import { friendlyFinancialsError, renderFinancialsBlock } from "@/lib/cip/employer-financials-view";
import { normOrg } from "@/lib/cip/employer-resolution";
import { checkRateLimit, clientRateLimitKey } from "@/lib/rate-limit";
import { isSameOriginRequest } from "@/lib/security";
import { createServer } from "@/lib/supabase/server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

// One tracked employer's IRS Form 990 card block. Three actions, all returning the refreshed block:
//  - refresh (no extra fields): look up now. An explicit click always works, even for an employer Auto
//    would skip (the button is only shown when a lookup applies, or after "Look up anyway").
//  - `ein`: link a specific filer the user knows (also turns the employer's setting to Always).
//  - `mode` (auto | on | off): save the employer's setting. "on" looks it up now; "off" and "auto" do not.
// Only the employer's public name and state go to ProPublica.
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

  // select("*") so a database without the financials_mode column still loads (the setting then reads as Auto).
  const { data: employer } = await supabase.from("watched_employers").select("*").eq("user_id", user.id).eq("id", employerId).maybeSingle();
  if (!employer) return html('<p class="text-sm text-red-700">That employer could not be found.</p>', 404);
  const row = employer as { id: string; name: string; location: string | null; region: string | null; category: string | null; financials_mode?: string | null };

  const { profiles, error: loadError } = await loadFundingProfiles(supabase, user.id);
  const existing = profiles.get(normOrg(row.name)) ?? null;
  let mode: FinancialsMode = parseFinancialsMode(row.financials_mode);

  const render = (extra: { message?: string | null; profile?: typeof existing; setupError?: string | null } = {}) => {
    const profile = extra.profile === undefined ? existing : extra.profile;
    const plan = planFinancialsLookup({ mode, name: row.name, category: row.category, profile });
    return html(renderFinancialsBlock({ employerId: row.id, employerName: row.name, profile, plan, message: extra.message, setupError: extra.setupError }));
  };

  if (loadError) return render({ setupError: loadError });

  const modeText = String(form.get("mode") ?? "");
  const requestedMode: FinancialsMode | null = ["auto", "on", "off"].includes(modeText) ? (modeText as FinancialsMode) : null;
  const einText = String(form.get("ein") ?? "").trim();
  const ein = einText ? parseEinInput(einText) : null;
  if (einText && ein === null) return render({ message: "An EIN is nine digits, like 12-3456789. Nothing was changed." });

  if (requestedMode) {
    const saveError = await saveFinancialsMode(supabase, user.id, row.id, requestedMode);
    if (saveError) return render({ message: friendlyFinancialsError(saveError) });
    mode = requestedMode;
    if (requestedMode !== "on") return render(); // off / auto: just the new setting, no lookup
  } else if (ein !== null && mode !== "on") {
    // Linking an EIN means "this one is a filer": remember it. A save failure here does not block the link.
    if ((await saveFinancialsMode(supabase, user.id, row.id, "on")) === null) mode = "on";
  }

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
  return render({ profile: outcome.profile, message });
};

function html(body: string, status = 200) {
  return new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
