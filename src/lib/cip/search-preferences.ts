import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  preferencesFromIntake,
  type BriefWorkMode,
  type SearchPreferences,
} from "@/lib/cip/search-brief";
import type { GeocodedSearchArea } from "@/lib/cip/geography-engine";

/**
 * Persistence and form handling for structured search preferences.
 * Rows live in `search_preference_items` (append-only; see the migration).
 * Pure helpers here are unit-tested; only `load*` / `save*` touch Supabase.
 */

export type PreferenceKind =
  | "salary_floor"
  | "work_mode"
  | "remote_limit"
  | "exclusion_industry"
  | "exclusion_role"
  | "exclusion_employer"
  | "anchor";

export interface PreferenceRow {
  id: string;
  kind: PreferenceKind;
  value: string;
  amount: number | null;
  radius_miles: number | null;
  scope: string;
  scope_ref: string | null;
  created_at: string;
}

/** A preference the user asked to have; becomes a row when it is new. */
export interface DesiredPreference {
  kind: PreferenceKind;
  value: string;
  amount?: number;
  radiusMiles?: number;
}

export interface AnchorRequest {
  label: string;
  radiusMiles: number;
}

/** What is stored, before anchors are geocoded (geocoding happens at run time, build step 2). */
export interface StoredSearchPreferences {
  hasAny: boolean;
  salaryFloorUsd?: number;
  workModes: BriefWorkMode[];
  remoteLimits?: string;
  exclusions: { industries: string[]; roles: string[]; employers: string[] };
  anchorRequests: AnchorRequest[];
}

const SINGLE_VALUED = new Set<PreferenceKind>(["salary_floor", "remote_limit"]);
const WORK_MODES: BriefWorkMode[] = ["onsite", "hybrid", "remote"];
const DEFAULT_RADIUS_MILES = 25;
const MAX_ANCHORS = 5;
const MAX_LIST_ITEMS = 30;

export const preferenceFormSchema = z.object({
  salaryFloor: z.number().int().positive().max(1_000_000).optional(),
  workModes: z.array(z.enum(["onsite", "hybrid", "remote"])),
  remoteLimits: z.string().trim().max(300),
  industries: z.array(z.string().trim().min(1).max(120)).max(MAX_LIST_ITEMS),
  roles: z.array(z.string().trim().min(1).max(120)).max(MAX_LIST_ITEMS),
  employers: z.array(z.string().trim().min(1).max(120)).max(MAX_LIST_ITEMS),
  anchors: z
    .array(z.object({ label: z.string().trim().min(2).max(120), radiusMiles: z.number().int().min(1).max(100) }))
    .max(MAX_ANCHORS),
});

export type PreferenceFormValues = z.infer<typeof preferenceFormSchema>;

export function parsePreferenceForm(form: FormData) {
  const salaryText = text(form, "salary_floor").replace(/[$,\s]/g, "");
  return preferenceFormSchema.safeParse({
    salaryFloor: salaryText ? Number(salaryText) : undefined,
    workModes: form.getAll("work_modes").map(String),
    remoteLimits: text(form, "remote_limits"),
    industries: splitLines(text(form, "exclusion_industries")),
    roles: splitLines(text(form, "exclusion_roles")),
    employers: splitLines(text(form, "exclusion_employers")),
    anchors: splitLines(text(form, "anchors")).map(parseAnchorLine),
  });
}

/** "White River Junction, VT | 30" -> label + radius (default 25 miles when omitted). */
export function parseAnchorLine(line: string): { label: string; radiusMiles: number } {
  const [label, radius] = line.split("|").map((part) => part.trim());
  const parsed = radius ? Number(radius.replace(/[^\d.]/g, "")) : DEFAULT_RADIUS_MILES;
  return { label: label ?? "", radiusMiles: Number.isFinite(parsed) ? Math.round(parsed) : Number.NaN };
}

/** One entry per line (or semicolon); commas stay inside names like "Health, Inc.". */
export function splitLines(value: string): string[] {
  const seen = new Set<string>();
  return value
    .split(/[\n\r;]+/)
    .map((item) => item.trim())
    .filter((item) => {
      const key = item.toLowerCase();
      if (!item || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function formValuesToDesired(values: PreferenceFormValues): DesiredPreference[] {
  const desired: DesiredPreference[] = [];
  if (values.salaryFloor) desired.push({ kind: "salary_floor", value: String(values.salaryFloor), amount: values.salaryFloor });
  for (const mode of values.workModes) desired.push({ kind: "work_mode", value: mode });
  if (values.remoteLimits) desired.push({ kind: "remote_limit", value: values.remoteLimits });
  for (const value of values.industries) desired.push({ kind: "exclusion_industry", value });
  for (const value of values.roles) desired.push({ kind: "exclusion_role", value });
  for (const value of values.employers) desired.push({ kind: "exclusion_employer", value });
  for (const anchor of values.anchors) desired.push({ kind: "anchor", value: anchor.label, radiusMiles: anchor.radiusMiles });
  return desired;
}

/**
 * Diff the active rows against what the user submitted. Anything not resubmitted is retired
 * (removing a line removes the preference); anything new is inserted. Unchanged rows are left
 * alone so their history stays intact. Callers insert first, then retire.
 */
export function planPreferenceChanges(
  active: PreferenceRow[],
  desired: DesiredPreference[],
): { toInsert: DesiredPreference[]; toRetireIds: string[] } {
  const activeGlobal = active.filter((row) => row.scope === "global");
  const desiredKeys = new Set(desired.map(desiredKey));
  const activeByKey = new Map<string, PreferenceRow[]>();
  for (const row of activeGlobal) {
    const key = rowKey(row);
    activeByKey.set(key, [...(activeByKey.get(key) ?? []), row]);
  }

  const toInsert = desired.filter((item) => !activeByKey.has(desiredKey(item)));
  const toRetireIds = activeGlobal.filter((row) => !desiredKeys.has(rowKey(row))).map((row) => row.id);
  return { toInsert, toRetireIds };
}

export function rowsToStoredPreferences(rows: PreferenceRow[]): StoredSearchPreferences {
  const globalRows = rows.filter((row) => row.scope === "global");
  const newestFirst = [...globalRows].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const single = (kind: PreferenceKind) => newestFirst.find((row) => row.kind === kind);
  const many = (kind: PreferenceKind) =>
    globalRows.filter((row) => row.kind === kind).map((row) => row.value).sort((a, b) => a.localeCompare(b));

  const salary = single("salary_floor");
  const workModes = many("work_mode").filter((mode): mode is BriefWorkMode => WORK_MODES.includes(mode as BriefWorkMode));

  return {
    hasAny: globalRows.length > 0,
    salaryFloorUsd: salary ? Number(salary.amount ?? salary.value) || undefined : undefined,
    workModes,
    remoteLimits: single("remote_limit")?.value,
    exclusions: {
      industries: many("exclusion_industry"),
      roles: many("exclusion_role"),
      employers: many("exclusion_employer"),
    },
    anchorRequests: globalRows
      .filter((row) => row.kind === "anchor")
      .sort((a, b) => a.value.localeCompare(b.value))
      .map((row) => ({ label: row.value, radiusMiles: row.radius_miles ?? DEFAULT_RADIUS_MILES })),
  };
}

/**
 * The preferences the brief should use.
 *  - Once the user has confirmed anything, only stored rows apply and the free-text intake is
 *    treated as superseded (no lingering "unresolved" warnings).
 *  - Before that, nothing from intake is applied: the salary target and work modes are only
 *    suggestions, and the free-text answers are reported as unresolved. A stated "target"
 *    is not a floor until the user says so.
 */
export function resolveSearchPreferences(
  stored: StoredSearchPreferences,
  intake: Record<string, unknown> | null | undefined,
  geocodedAnchors: GeocodedSearchArea[] = [],
): SearchPreferences {
  if (stored.hasAny) {
    return {
      salaryFloorUsd: stored.salaryFloorUsd,
      workModes: stored.workModes.length ? stored.workModes : undefined,
      remoteLimits: stored.remoteLimits,
      exclusions: stored.exclusions,
      anchors: geocodedAnchors,
    };
  }
  return { unparsedConstraints: preferencesFromIntake(intake).unparsedConstraints, anchors: geocodedAnchors };
}

/** Values to prefill the form when nothing is stored yet: suggestions only, saved only on confirm. */
export function intakeSuggestions(intake: Record<string, unknown> | null | undefined) {
  const suggested = preferencesFromIntake(intake);
  return { salaryFloorUsd: suggested.salaryFloorUsd, workModes: suggested.workModes ?? [] };
}

export async function loadActivePreferenceRows(supabase: SupabaseClient, userId: string): Promise<PreferenceRow[]> {
  const { data, error } = await supabase
    .from("search_preference_items")
    .select("id,kind,value,amount,radius_miles,scope,scope_ref,created_at")
    .eq("user_id", userId)
    .is("retired_at", null)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ ...row, amount: row.amount === null ? null : Number(row.amount) })) as PreferenceRow[];
}

export async function loadStoredSearchPreferences(supabase: SupabaseClient, userId: string) {
  return rowsToStoredPreferences(await loadActivePreferenceRows(supabase, userId));
}

/** Insert first, retire second: a failure midway can leave a duplicate-free superset, never a loss. */
export async function saveSearchPreferences(supabase: SupabaseClient, userId: string, desired: DesiredPreference[]) {
  const active = await loadActivePreferenceRows(supabase, userId);
  const plan = planPreferenceChanges(active, desired);

  if (plan.toInsert.length) {
    const { error } = await supabase.from("search_preference_items").insert(
      plan.toInsert.map((item) => ({
        user_id: userId,
        kind: item.kind,
        value: item.value,
        amount: item.amount ?? null,
        radius_miles: item.radiusMiles ?? null,
        scope: "global",
        source: "user_entered",
      })),
    );
    if (error) throw new Error(error.message);
  }

  if (plan.toRetireIds.length) {
    const { error } = await supabase
      .from("search_preference_items")
      .update({ retired_at: new Date().toISOString() })
      .eq("user_id", userId)
      .in("id", plan.toRetireIds);
    if (error) throw new Error(error.message);
  }

  return { inserted: plan.toInsert.length, retired: plan.toRetireIds.length };
}

function desiredKey(item: DesiredPreference) {
  if (SINGLE_VALUED.has(item.kind)) return `${item.kind}|${item.value.toLowerCase()}`;
  return `${item.kind}|${item.value.toLowerCase()}|${item.kind === "anchor" ? item.radiusMiles : ""}`;
}

function rowKey(row: PreferenceRow) {
  if (SINGLE_VALUED.has(row.kind)) return `${row.kind}|${row.value.toLowerCase()}`;
  return `${row.kind}|${row.value.toLowerCase()}|${row.kind === "anchor" ? row.radius_miles : ""}`;
}

function text(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}
