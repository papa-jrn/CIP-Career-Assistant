import { normOrg } from "@/lib/cip/employer-resolution";

/**
 * The address where an employer actually posts its jobs.
 *
 * The weekly search targets this URL first, before sector boards and the open
 * web, so it has real consequences: a wrong one sends the search to the wrong
 * place and the employer looks like it has nothing open. Until now the value
 * could only come from business discovery - which is a model's suggestion -
 * and nothing distinguished a guess from a page the user had actually opened.
 *
 * Corrections are stored as additive records and applied when the employer is
 * read, like contact corrections: the discovered value is preserved, so the
 * app can say "you corrected this" rather than quietly presenting the user's
 * answer as something it worked out itself.
 */
export const CAREERS_URL_SOURCE_TYPE = "employer_careers_url";

/** Where a careers URL came from. Shown to the user, never implied. */
export type CareersUrlOrigin = "discovered" | "user_supplied";
export interface TargetCareerPage { name: string; url: string | null; origin: CareersUrlOrigin | "none_known" }

export interface CareersUrlCorrection {
  /** Normalized employer name, so a correction survives small naming differences. */
  employerKey: string;
  employerName: string;
  /** Empty string means "this employer has no careers page I know of". */
  careersUrl: string;
  note?: string;
  recordedAt: string;
}

export function careersUrlPayload(correction: CareersUrlCorrection) {
  return { careersUrl: correction };
}

export function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function parseCareersUrlCorrection(value: string | null, createdAt: string): CareersUrlCorrection | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    const record = parsed?.careersUrl;
    const employerName = typeof record?.employerName === "string" ? record.employerName.trim() : "";
    if (!employerName) return null;
    const careersUrl = typeof record?.careersUrl === "string" ? record.careersUrl.trim() : "";
    // A stored value that is not a usable address is treated as "none known"
    // rather than passed to the search.
    return {
      employerKey: typeof record?.employerKey === "string" && record.employerKey ? record.employerKey : normOrg(employerName),
      employerName,
      careersUrl: careersUrl && isHttpUrl(careersUrl) ? careersUrl : "",
      note: typeof record?.note === "string" && record.note.trim() ? record.note.trim() : undefined,
      recordedAt: typeof record?.recordedAt === "string" && record.recordedAt ? record.recordedAt : createdAt,
    };
  } catch {
    return null;
  }
}

/**
 * The correction in force for each employer.
 *
 * Records arrive newest-first, so the first seen for an employer wins and
 * earlier ones are kept rather than overwritten.
 */
export function currentCareersUrls(corrections: CareersUrlCorrection[]): Map<string, CareersUrlCorrection> {
  const byEmployer = new Map<string, CareersUrlCorrection>();
  for (const correction of corrections) {
    if (!byEmployer.has(correction.employerKey)) byEmployer.set(correction.employerKey, correction);
  }
  return byEmployer;
}

export interface ResolvedCareersUrl {
  url: string;
  origin: CareersUrlOrigin;
  /** What discovery had suggested, when the user replaced it. */
  replaced?: string;
  note?: string;
}

/**
 * What the app should use and show for this employer.
 *
 * A user's answer always wins over a discovered one - including when they say
 * there is no careers page, which is a real answer and must not fall back to
 * the guess it replaced.
 */
export function resolveCareersUrl(
  employer: { name: string; careers_url?: string | null },
  corrections: Map<string, CareersUrlCorrection>,
): ResolvedCareersUrl | null {
  const discovered = (employer.careers_url ?? "").trim();
  const correction = corrections.get(normOrg(employer.name));

  if (correction) {
    if (!correction.careersUrl) return null;
    return {
      url: correction.careersUrl,
      origin: "user_supplied",
      replaced: discovered && discovered !== correction.careersUrl ? discovered : undefined,
      note: correction.note,
    };
  }

  if (discovered && isHttpUrl(discovered)) return { url: discovered, origin: "discovered" };
  return null;
}

/** How the link should be described, so a guess never reads as a fact. */
export function describeCareersUrl(resolved: ResolvedCareersUrl | null, noneKnown = false): string {
  if (!resolved && noneKnown) return "You recorded that this employer has no careers page you know of. The search will use sector boards and the open web instead.";
  if (!resolved) return "No careers page recorded. The search will fall back to sector boards and the open web for this employer.";
  if (resolved.origin === "user_supplied") {
    return resolved.replaced
      ? "Careers page you supplied, replacing the one CIP had guessed."
      : "Careers page you supplied.";
  }
  return "Careers page CIP guessed when it found this employer. It has not been confirmed - correct it if the search is looking in the wrong place.";
}

/** Load this user's careers-URL corrections, newest first. */
export async function loadCareersUrlCorrections(
  supabase: { from: (table: string) => any },
  userId: string,
): Promise<CareersUrlCorrection[]> {
  const { data } = await supabase
    .from("career_sources")
    .select("extracted_text, created_at")
    .eq("user_id", userId)
    .eq("source_type", CAREERS_URL_SOURCE_TYPE)
    .order("created_at", { ascending: false })
    .limit(400);
  return ((data ?? []) as Array<{ extracted_text: string | null; created_at: string }>)
    .map((row) => parseCareersUrlCorrection(row.extracted_text, row.created_at))
    .filter(Boolean) as CareersUrlCorrection[];
}
