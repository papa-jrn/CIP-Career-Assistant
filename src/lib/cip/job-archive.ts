import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImportedJob } from "./imported-jobs";
import { latestFitFor, type FitAssessment } from "./imported-job-fit";
import { indexDispositions, loadDispositions, matchDisposition, setDisposition, type DispositionIndex } from "./posting-dispositions";
export const IMPORTED_ARCHIVE_SOURCE = "imported_job_archive";
export interface ImportedArchiveEvent { importId: string; archived: boolean; at: string }
export function parseArchiveEvent(raw: string | null): ImportedArchiveEvent | null {
  try { const event = JSON.parse(raw || "null")?.importedJobArchive; return typeof event?.importId === "string" && typeof event.archived === "boolean" && typeof event.at === "string" ? event : null; } catch { return null; }
}
export async function loadArchiveContext(db: SupabaseClient, userId: string) {
  const [dispositions, events] = await Promise.all([
    loadDispositions(db, userId),
    db.from("career_sources").select("extracted_text").eq("user_id", userId).eq("source_type", IMPORTED_ARCHIVE_SOURCE).order("created_at", { ascending: false }).limit(1000),
  ]);
  if (events.error) throw new Error("Archived job decisions could not be loaded. Please retry.");
  return { dispositions: indexDispositions(dispositions), events: (events.data ?? []).map(row => parseArchiveEvent(row.extracted_text)).filter((event): event is ImportedArchiveEvent => Boolean(event)) };
}
export function isImportedArchived(job: ImportedJob, fits: FitAssessment[], index: DispositionIndex, events: ImportedArchiveEvent[] = []) {
  const statuses = [...new Set([job.sourceUrl, ...(job.sourceLinks ?? []).map(source => source.url)].filter(Boolean))]
    .map(url => matchDisposition({ source_url: url, employer_text: job.employer, requisition_id: job.requisitionId }, index)).filter(Boolean)
    .sort((a, b) => String(b!.updated_at ?? "").localeCompare(String(a!.updated_at ?? "")));
  const event = events.filter(item => item.importId === job.importId).sort((a, b) => b.at.localeCompare(a.at))[0];
  const decision = latestFitFor(job.importId, fits.filter(fit => fit.basis === "user"));
  const status = statuses[0];
  const explicitAt = status?.updated_at ?? event?.at ?? "";
  if (decision && decision.assessedAt > explicitAt) return decision.recommendation === "skip";
  if (status) return status.status === "passed";
  if (event) return event.archived;
  return decision?.recommendation === "skip";

}

export async function setImportedArchive(db: SupabaseClient, userId: string, job: ImportedJob, archived: boolean) {
  if (job.sourceUrl) {
    await setDisposition(db, userId, { source_url: job.sourceUrl, employer_text: job.employer, requisition_id: job.requisitionId }, archived ? "passed" : "watching", "");
  } else {
    const { error } = await db.from("career_sources").insert({ user_id: userId, source_type: IMPORTED_ARCHIVE_SOURCE, title: (archived ? "Archived: " : "Restored: ") + job.title, extracted_text: JSON.stringify({ importedJobArchive: { importId: job.importId, archived, at: new Date().toISOString() } }), trust_state: "user_supplied" });
    if (error) throw new Error("Your archive decision could not be saved.");
  }
}
