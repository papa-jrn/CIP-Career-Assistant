/**
 * Organization-name comparison, kept dependency-free so maintenance scripts can import the same
 * rule the app ingests with instead of reimplementing it in SQL or JavaScript and drifting.
 */

/**
 * A company is not its own parent. The model is asked to leave `parent_organization` empty for a
 * top-level organization and routinely does not, which rendered "Intuit Inc." as "Part of Intuit
 * Inc." and let a self-parented row count towards the shared-organization notice, so the UI
 * suggested adding a parent that was already in the list. Prompt wording did not hold; this does.
 */
export function resolveParentOrganization(name: string, parent?: string) {
  const trimmed = parent?.trim() ?? "";
  if (!trimmed) return "";
  return normalizeOrganizationName(trimmed) === normalizeOrganizationName(name) ? "" : trimmed;
}

/** Drops legal suffixes and punctuation so "Intuit" and "Intuit Inc." compare equal. */
export function normalizeOrganizationName(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(the|inc|incorporated|llc|llp|lp|ltd|limited|corp|corporation|company|co|plc|gmbh|ag|nv|sa)\b/g, " ")
    .replace(/[^a-z0-9]/g, "");
}
