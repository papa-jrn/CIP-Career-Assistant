import { renderFitAssessment } from "./fit-assessment-view";
import type { FitAssessment } from "./imported-job-fit";
const e = (value: unknown) => String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
export function renderFitProgress(id: string): string {
  return '<div id="' + e(id) + '" class="htmx-indicator cip-thinking-panel mt-3" role="status" aria-live="polite"><div class="cip-thinking-orbit" aria-hidden="true"><span></span><span></span><span></span></div><div class="min-w-0 flex-1"><p class="text-sm font-semibold uppercase text-[var(--accent-strong)]">Assessing fit using your CIP context</p><div class="cip-thinking-lines" aria-hidden="true"><span>Reading the full job description…</span><span>Comparing your career lanes, resume and evidence…</span><span>Reviewing competitiveness and saving your assessment…</span></div><p class="text-xs">Your assessment will appear here. The job will stay in place while you read it.</p><div class="cip-thinking-bar" aria-hidden="true"><span></span></div></div></div>';
}
export function renderCompletedFit(fit: FitAssessment): string {
  const score = fit.analysis?.score;
  const complete = fit.basis === "ai_assisted" && score != null;
  const notice = !complete ? 'The full assessment could not be completed. This job stays here and remains unscored. Review the explanation below before retrying.' : score < 6 ? 'Assessment saved: ' + score + '/10. This job stays here so you can read the result. On your next visit, you will find it under Lower-fit opportunities. It has not been archived.' : 'Assessment saved: ' + score + '/10. Review the reasoning and evidence below.';
  return '<div role="status" class="mb-3 rounded-md border border-[var(--line)] bg-[var(--accent-soft)] p-3"><p class="font-semibold">' + (complete ? 'Your fit assessment is ready' : 'Assessment needs attention') + '</p><p class="mt-1 text-sm">' + e(notice) + '</p></div>' + renderFitAssessment(fit, true);
}

export function renderFitClarification(): string {
  return '<details class="my-3"><summary class="cursor-pointer text-sm font-semibold">Add missing experience or correct this assessment</summary><label class="mt-2 grid gap-1 text-sm">What experience should CIP consider?<textarea name="clarification" rows="4" maxlength="3000" class="rounded-md border border-[var(--line)] bg-[var(--background)] p-2" placeholder="Describe relevant work, tools, responsibilities and how long you have done it. Leave uncertain details clear."></textarea></label><p class="mt-1 text-xs">Saved as your stated career evidence when you reassess, and available for future assessments. This does not change your resume.</p><button type="submit" class="cip-action mt-2">Save experience and reassess</button></details>';
}
