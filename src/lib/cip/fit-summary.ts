/** Recognize the old schema-boundary symptom without inventing missing text. */
export function fitSummaryLooksCutOff(summary: string): boolean {
  const text = summary.trim();
  return text.length === 600 && !/[.!?…]["'”’)\]]*$/u.test(text);
}