import { normOrg } from "@/lib/cip/employer-resolution";
import type { TargetStatus } from "@/lib/cip/target-dossier";

/**
 * The user's own decision about an employer (Rethink §14, slice 2).
 *
 * Append-only. The current status is the latest event for a key, and earlier
 * events stay so the page can say what changed and so "not interested" can be
 * reversed without pretending it was never decided.
 *
 * Keyed on the normalized name rather than a row id on purpose: the same
 * decision must hold for a watched employer and for a discovery candidate that
 * was never promoted, and must keep holding when discovery re-suggests the same
 * organisation later under a slightly different name.
 */
export const TARGET_STATUSES: TargetStatus[] = [
  "new",
  "researching",
  "talk_first",
  "monitoring",
  "applying",
  "paused",
  "not_interested",
];

export interface TargetEvent {
  employerKey: string;
  name: string;
  parentKey: string | null;
  status: TargetStatus;
  note: string;
  source: "user" | "app";
  createdAt: string;
}

export interface TargetEventRow {
  employer_key: string;
  name: string;
  parent_key: string | null;
  status: string;
  note: string | null;
  source: string | null;
  created_at: string;
}

export function isTargetStatus(value: unknown): value is TargetStatus {
  return typeof value === "string" && (TARGET_STATUSES as string[]).includes(value);
}

export function parseTargetEvent(row: TargetEventRow): TargetEvent | null {
  if (!row || !isTargetStatus(row.status)) return null;
  const name = String(row.name ?? "").trim();
  if (!name) return null;
  return {
    employerKey: String(row.employer_key ?? "").trim() || normOrg(name),
    name,
    parentKey: row.parent_key ? String(row.parent_key).trim() || null : null,
    status: row.status,
    note: String(row.note ?? ""),
    source: row.source === "app" ? "app" : "user",
    createdAt: String(row.created_at ?? ""),
  };
}

/**
 * The event in force for each employer.
 *
 * Rows arrive newest first. A decision the user made outranks one the engine
 * recorded at the same moment, so an app-written status can never quietly
 * overwrite a choice somebody made.
 */
export function currentTargetEvents(events: TargetEvent[]): Map<string, TargetEvent> {
  const byKey = new Map<string, TargetEvent>();
  for (const event of events) {
    const held = byKey.get(event.employerKey);
    if (!held) {
      byKey.set(event.employerKey, event);
      continue;
    }
    const heldTime = Date.parse(held.createdAt) || 0;
    const time = Date.parse(event.createdAt) || 0;
    if (time > heldTime || (time === heldTime && event.source === "user" && held.source === "app")) {
      byKey.set(event.employerKey, event);
    }
  }
  return byKey;
}

export interface ResolvedStatus {
  status: TargetStatus;
  source: "suggested" | "set";
  note?: string;
  setAt?: string;
}

/**
 * What to show for an employer: the user's decision if they made one,
 * otherwise the app's suggestion, labelled as a suggestion.
 */
export function resolveTargetStatus(
  employerName: string,
  suggested: TargetStatus,
  events: Map<string, TargetEvent>,
): ResolvedStatus {
  const event = events.get(normOrg(employerName));
  if (!event || event.source !== "user") return { status: suggested, source: "suggested" };
  return { status: event.status, source: "set", note: event.note || undefined, setAt: event.createdAt };
}

/**
 * The organisations the user has said they are not interested in.
 *
 * Both the employer's own key and the parent key count, so excluding a parent
 * suppresses its member organisations - the case §14 names explicitly.
 */
export function excludedKeys(events: Map<string, TargetEvent>): Set<string> {
  const keys = new Set<string>();
  for (const event of events.values()) {
    if (event.status !== "not_interested") continue;
    keys.add(event.employerKey);
    if (event.parentKey) keys.add(event.parentKey);
  }
  return keys;
}

export interface ExclusionSplit<T> {
  kept: T[];
  excluded: T[];
}

/**
 * Remove organisations the user has excluded from a discovery result.
 *
 * §14 is explicit that this is never silent: the caller is handed what was
 * suppressed so the page can say how many and offer them back. A candidate
 * whose parent is excluded is suppressed too.
 */
export function partitionExcluded<T extends { name: string; parent_organization?: string | null }>(
  candidates: T[],
  excluded: Set<string>,
): ExclusionSplit<T> {
  if (!excluded.size) return { kept: candidates, excluded: [] };
  const kept: T[] = [];
  const dropped: T[] = [];
  for (const candidate of candidates) {
    const key = normOrg(candidate.name);
    const parent = candidate.parent_organization ? normOrg(candidate.parent_organization) : "";
    if (excluded.has(key) || (parent && excluded.has(parent))) dropped.push(candidate);
    else kept.push(candidate);
  }
  return { kept, excluded: dropped };
}

/** Everything the user has excluded, newest decision first, for the Excluded list. */
export function excludedTargets(events: Map<string, TargetEvent>): TargetEvent[] {
  return [...events.values()]
    .filter((event) => event.status === "not_interested")
    .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
}

/** Load this user's target events, newest first. */
export async function loadTargetEvents(
  supabase: { from: (table: string) => any },
  userId: string,
): Promise<TargetEvent[]> {
  const { data, error } = await supabase
    .from("employer_target_events")
    .select("employer_key,name,parent_key,status,note,source,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1000);
  // A missing table means the migration has not been applied yet. Treat it as
  // "no decisions recorded" rather than breaking the page.
  if (error) return [];
  return ((data ?? []) as TargetEventRow[]).map(parseTargetEvent).filter(Boolean) as TargetEvent[];
}
