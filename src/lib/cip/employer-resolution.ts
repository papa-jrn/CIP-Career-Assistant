import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Employer resolution (Opportunities item 4): map a posting's free-text employer name to one of the
 * user's watched (canonical) employers. Auto-resolution is deterministic and deliberately
 * conservative — it will never merge two distinct real entities that only share a generic token
 * (e.g. "Dartmouth College" vs "Dartmouth Health"). The user's saved corrections (employer_aliases)
 * always win, so a miss or a rare over-merge is fixed once and stays fixed.
 */

const ORG_SUFFIX = /\b(inc|llc|l\.l\.c|ltd|corp|corporation|company|co|the|group|holdings|plc)\b/g;
// Only true stopwords are generic. Words like "health", "college", "medical", or "center" are kept
// because they are exactly what distinguishes siblings (Dartmouth Health vs Dartmouth College).
// (Two-letter words like "of"/"at" are already dropped by the length filter below.)
const GENERIC_TOKEN = new Set(["and", "the", "for"]);

/** Normalize an organization name (lowercase, strip punctuation and common company suffixes). */
export function normOrg(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[.,/&'"()-]/g, " ")
    .replace(ORG_SUFFIX, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(norm: string): string[] {
  return norm.split(" ").filter(Boolean);
}

function significantTokens(norm: string): string[] {
  return tokens(norm).filter((token) => token.length >= 3 && !GENERIC_TOKEN.has(token));
}

// The acronym of a name's tokens (first letters), e.g. "dartmouth hitchcock medical center" -> "dhmc".
function acronym(norm: string): string {
  return tokens(norm)
    .map((token) => token[0])
    .join("");
}

function collapse(norm: string): string {
  return norm.replace(/\s+/g, "");
}

export type MatchBasis = "exact" | "acronym" | "tokens";

/**
 * Whether two normalized names denote the same employer, conservatively. Matches on: an exact
 * normalized name; an acronym of one equaling the collapsed other (both length >= 2); or the shorter
 * name's significant tokens being a subset of the longer's with at least two significant tokens
 * shared. A single shared generic token (e.g. "dartmouth") never matches.
 */
export function employerMatch(aNorm: string, bNorm: string): MatchBasis | null {
  if (!aNorm || !bNorm) return null;
  if (aNorm === bNorm) return "exact";

  const aAcr = acronym(aNorm);
  const bAcr = acronym(bNorm);
  if ((aAcr.length >= 2 && aAcr === collapse(bNorm)) || (bAcr.length >= 2 && bAcr === collapse(aNorm))) return "acronym";

  const aSig = significantTokens(aNorm);
  const bSig = significantTokens(bNorm);
  if (aSig.length && bSig.length) {
    const [shortSig, longSet] = aSig.length <= bSig.length ? [aSig, new Set(bSig)] : [bSig, new Set(aSig)];
    const shared = shortSig.filter((token) => longSet.has(token));
    if (shared.length >= 2 && shared.length === shortSig.length) return "tokens";
  }
  return null;
}

export interface CanonicalEmployer {
  name: string;
  norm: string;
}

export function buildCanonicalEmployers(names: string[]): CanonicalEmployer[] {
  const seen = new Set<string>();
  const out: CanonicalEmployer[] = [];
  for (const name of names) {
    const norm = normOrg(name);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push({ name, norm });
  }
  return out;
}

export type ResolutionBasis = "alias" | MatchBasis | "none";

export interface ResolvedEmployerName {
  canonical: string | null;
  basis: ResolutionBasis;
}

/**
 * Resolve an observed employer name to a canonical watched employer. A saved alias wins (an empty
 * alias target forces "unresolved"). Otherwise the best conservative auto-match wins; when two
 * different canonical employers match equally well, the result is left unresolved rather than guessed.
 * `aliases` maps a normalized observed name to a canonical name ('' = force unresolved).
 */
export function resolveEmployerName(
  observed: string,
  canon: CanonicalEmployer[],
  aliases: Map<string, string>,
): ResolvedEmployerName {
  const observedNorm = normOrg(observed);
  if (!observedNorm) return { canonical: null, basis: "none" };

  if (aliases.has(observedNorm)) {
    const target = aliases.get(observedNorm) ?? "";
    return { canonical: target.trim() ? target : null, basis: "alias" };
  }

  const rank: Record<MatchBasis, number> = { exact: 3, acronym: 2, tokens: 1 };
  let best: { canonical: string; basis: MatchBasis } | null = null;
  let ambiguous = false;
  for (const employer of canon) {
    const basis = employerMatch(observedNorm, employer.norm);
    if (!basis) continue;
    if (!best || rank[basis] > rank[best.basis]) {
      best = { canonical: employer.name, basis };
      ambiguous = false;
    } else if (rank[basis] === rank[best.basis] && employer.name !== best.canonical) {
      ambiguous = true;
    }
  }
  if (!best || ambiguous) return { canonical: null, basis: "none" };
  return { canonical: best.canonical, basis: best.basis };
}

// --- persistence -----------------------------------------------------------------------------

/** The user's saved corrections as a map of normalized observed name -> canonical ('' = unresolved). */
export async function loadEmployerAliases(supabase: SupabaseClient, userId: string): Promise<Map<string, string>> {
  const { data } = await supabase
    .from("employer_aliases")
    .select("alias_norm,canonical_name")
    .eq("user_id", userId)
    .limit(1000);
  const map = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ alias_norm: string; canonical_name: string | null }>) {
    map.set(row.alias_norm, row.canonical_name ?? "");
  }
  return map;
}

/** Save the user's correction for an observed employer name. canonicalName '' forces unresolved. */
export async function setEmployerAlias(
  supabase: SupabaseClient,
  userId: string,
  observed: string,
  canonicalName: string,
  now: () => string = () => new Date().toISOString(),
): Promise<void> {
  const aliasNorm = normOrg(observed);
  if (!aliasNorm) return;
  const patch = { canonical_name: canonicalName.trim(), updated_at: now() };
  const { data: updated } = await supabase
    .from("employer_aliases")
    .update(patch)
    .eq("user_id", userId)
    .eq("alias_norm", aliasNorm)
    .select("alias_norm");
  if (updated && (updated as unknown[]).length) return;
  await supabase.from("employer_aliases").insert({ user_id: userId, alias_norm: aliasNorm, created_at: now(), ...patch });
}

/** Remove a correction, so the observed name goes back to deterministic auto-resolution. */
export async function clearEmployerAlias(supabase: SupabaseClient, userId: string, observed: string): Promise<void> {
  const aliasNorm = normOrg(observed);
  if (!aliasNorm) return;
  await supabase.from("employer_aliases").delete().eq("user_id", userId).eq("alias_norm", aliasNorm);
}
