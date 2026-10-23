import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeUrl } from "./job-search-engine";
import { buildImportedJob, type ImportedJob } from "./imported-jobs";
import type { ObservationRow } from "./job-search-run";
import { safePageFetcher, verificationFetchUrl, judgeVerification, htmlToText } from "./job-verifier";
export function searchedFitId(url: string) { return "search-" + createHash("sha256").update(normalizeUrl(url)).digest("hex").slice(0, 40); }
export async function loadSearchedFitJob(db: SupabaseClient, userId: string, observationId: string): Promise<ImportedJob | null> {
  const { data, error } = await db.from("job_search_observations").select("*").eq("user_id", userId).eq("id", observationId).limit(1);
  if (error) throw new Error("The saved search result could not be loaded.");
  const row = data?.[0] as ObservationRow | undefined;
  if (!row) return null;
  const page = await safePageFetcher(verificationFetchUrl(row.source_url));
  const now = new Date().toISOString();
  const verification = judgeVerification(page, { sourceUrl: row.source_url, title: row.title, requisitionId: row.requisition_id }, now);
  // A readable, matching posting is required. Never assess a login wall or
  // substitute a search snippet/title for the description.
  const readable = page ? htmlToText(page.text) : "";
  const material = verification.state === "verified_open" && page && readable.trim().length >= 400 ? readable.slice(0, 24000) : "";
  const job = buildImportedJob({ title: row.title, employer: row.employer_text, sourceUrl: row.source_url, originalMaterial: material, requisitionId: row.requisition_id ?? undefined, worksiteText: row.worksite_text ?? undefined }, { importId: searchedFitId(row.source_url), capturedAt: now });
  job.verification = verification;
  return job;
}
