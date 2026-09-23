import type { APIRoute } from "astro";
import { formValuesToDesired, parsePreferenceForm, saveSearchPreferences } from "@/lib/cip/search-preferences";
import { isSameOriginRequest } from "@/lib/security";
import { createServer } from "@/lib/supabase/server";

// Plain form POST that redirects back to the page, so it works without htmx and the page
// always re-renders from what is actually stored.
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  if (!isSameOriginRequest(request)) {
    return new Response("Invalid request origin.", { status: 403 });
  }

  const supabase = createServer(cookies);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return redirect("/login", 303);

  const parsed = parsePreferenceForm(await request.formData());
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => `${issue.path.join(".") || "form"}: ${issue.message}`).join("; ");
    return redirect(`/preferences?error=${encodeURIComponent(message.slice(0, 300))}`, 303);
  }

  try {
    const result = await saveSearchPreferences(supabase, user.id, formValuesToDesired(parsed.data));
    return redirect(`/preferences?saved=${result.inserted}-${result.retired}`, 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save preferences.";
    return redirect(`/preferences?error=${encodeURIComponent(message.slice(0, 300))}`, 303);
  }
};
