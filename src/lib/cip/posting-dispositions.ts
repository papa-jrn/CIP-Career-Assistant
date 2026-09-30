import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeUrl } from "@/lib/cip/job-search-engine";

/**
 * The user's own status on a posting (Opportunities step 6, items 2 & 3): their override of the
 * app's recommendation chip and the minimal action-tracking store, in one table. A status is keyed
 * by posting identity (normalized URL, with employer + requisition as a secondary match) so it
 * survives across weekly runs — including when the posting is carried forward.
 *
 * The app's chip is a *suggestion* (computed deterministically each render); this is what the user
 * *decided* or *did*, and it takes visual precedence when set while the suggestion is still shown.
 */

export const DISPOSITION_STATUSES = ["watching", "applied", "talking", "passed"] as const;
export type DispositionStatus = (typeof DISPOSITION_STATUSES)[number];

export function isDispositionStatus(value: unknown): value is DispositionStatus {
  return typeof value === "string" && (DISPOSITION_STATUSES as readonly string[]).includes(value);
}

export interface PostingDisposition {
  normalized_url: string;
  source_url: string;
  employer_key: string;
  requisition_id: string | null;
  status: DispositionStatus;
  note: string;
  updated_at: string | null;
}

/** A posting-shaped subset sufficient to compute its identity keys. */
export interface PostingIdentityLike {
  source_url: string;
  employer_text?: string | null;
  employer?: string | null;
  requisition_id?: string | null;
}

function employerKey(posting: PostingIdentityLike): string {
  return String(posting.employer_text ?? posting.employer ?? "").trim().toLowerCase();
}

/** The identity a disposition is stored and matched by, mirroring carry-forward's identity. */
export function dispositionKeys(posting: PostingIdentityLike): {
  normalizedUrl: string;
  employerKey: string;
  requisitionId: string | null;
  reqKey: string | null;
} {
  const emp = employerKey(posting);
  const req = posting.requisition_id ? String(posting.requisition_id).trim().toLowerCase() : null;
  return {
    normalizedUrl: normalizeUrl(posting.source_url),
    employerKey: emp,
    requisitionId: posting.requisition_id ? String(posting.requisition_id) : null,
    reqKey: req ? `${emp}|${req}` : null,
  };
}

const COLUMNS = "normalized_url,source_url,employer_key,requisition_id,status,note,updated_at";

/** All of a user's saved statuses (bounded), for matching against the run's postings at render. */
export async function loadDispositions(supabase: SupabaseClient, userId: string): Promise<PostingDisposition[]> {
  const { data } = await supabase
    .from("posting_dispositions")
    .select(COLUMNS)
    .eq("user_id", userId)
    .limit(1000);
  return (data ?? []) as PostingDisposition[];
}

/**
 * An index for O(1) lookup of a posting's status, by normalized URL first then employer+requisition.
 * Build it once per render and pass it alongside the observations.
 */
export interface DispositionIndex {
  byUrl: Map<string, PostingDisposition>;
  byReq: Map<string, PostingDisposition>;
}

export function indexDispositions(rows: PostingDisposition[]): DispositionIndex {
  const byUrl = new Map<string, PostingDisposition>();
  const byReq = new Map<string, PostingDisposition>();
  for (const row of rows) {
    byUrl.set(normalizeUrl(row.source_url), row);
    const emp = row.employer_key.trim().toLowerCase();
    const req = row.requisition_id ? String(row.requisition_id).trim().toLowerCase() : null;
    if (req) byReq.set(`${emp}|${req}`, row);
  }
  return { byUrl, byReq };
}

export function matchDisposition(posting: PostingIdentityLike, index: DispositionIndex): PostingDisposition | null {
  const keys = dispositionKeys(posting);
  return index.byUrl.get(keys.normalizedUrl) ?? (keys.reqKey ? index.byReq.get(keys.reqKey) ?? null : null);
}

/**
 * Set (or replace) the user's status on a posting. Upsert-by-identity without a DB upsert: update the
 * existing row for this normalized URL, or insert a new one. Returns nothing; the caller re-renders.
 */
export async function setDisposition(
  supabase: SupabaseClient,
  userId: string,
  posting: PostingIdentityLike,
  status: DispositionStatus,
  note: string,
  now: () => string = () => new Date().toISOString(),
): Promise<void> {
  const keys = dispositionKeys(posting);
  const patch = {
    source_url: posting.source_url,
    employer_key: keys.employerKey,
    requisition_id: keys.requisitionId,
    status,
    note: note.slice(0, 500),
    updated_at: now(),
  };
  const { data: updated } = await supabase
    .from("posting_dispositions")
    .update(patch)
    .eq("user_id", userId)
    .eq("normalized_url", keys.normalizedUrl)
    .select("normalized_url");
  if (updated && (updated as unknown[]).length) return;
  await supabase.from("posting_dispositions").insert({
    user_id: userId,
    normalized_url: keys.normalizedUrl,
    created_at: now(),
    ...patch,
  });
}

/** Clear the user's status on a posting (back to following the app's suggestion). */
export async function clearDisposition(supabase: SupabaseClient, userId: string, posting: PostingIdentityLike): Promise<void> {
  const keys = dispositionKeys(posting);
  await supabase.from("posting_dispositions").delete().eq("user_id", userId).eq("normalized_url", keys.normalizedUrl);
}
