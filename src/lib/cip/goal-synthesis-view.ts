import { escapeHtml as e } from "./job-search-view";
import { goalReviewSchema, type GoalReview } from "./goal-synthesis";
export function renderGoalReviews(reviews: GoalReview[] = []) {
  reviews = Array.isArray(reviews) ? reviews.filter(review => review && typeof review.sourceText === "string" && goalReviewSchema.safeParse(review).success) : [];
  if (!reviews.length) return "";
  return `<section class="mt-5 rounded-md border border-[var(--line)] bg-[var(--panel)] p-4" aria-label="Your goals and their implications"><h2 class="text-xl font-semibold">Your goals and their implications</h2>
    <p class="mt-2 text-sm">Intentions can change the plan now. Evidence determines confidence in feasibility. Interpretations and lane connections are proposals for you to review.</p>
    ${reviews.map(review => `<article class="mt-4 rounded-md border border-[var(--line)] p-4">
      <p class="text-xs font-semibold uppercase">${review.status === "pending" ? "Still needs synthesis" : "Interpretation ready for your review"} · ${review.origin === "stated" ? "User-stated intention" : "Possible implied goal — please confirm"}</p>
      <h3 class="mt-2 font-semibold">${e(review.direction)}</h3><p class="mt-2">${e(review.understanding)}</p>
      <p class="mt-2 text-sm">${e(review.contextAssessment)}</p>
      ${review.connections.map(connection => `<div class="mt-3"><p class="font-semibold">${e(connection.lane)} · ${e(connection.relationship)}</p><p>${e(connection.explanation)}</p><p class="text-xs">AI inference · ${e(review.confidence)} confidence. Basis (${connection.sourceRef === "prior_analysis" ? "prior career analysis" : connection.sourceRef === "intake" ? "intake" : "saved evidence"}): “${e(connection.sourceQuote)}”</p></div>`).join("")}
      <h4 class="mt-3 font-semibold">Implications for your plan</h4><ul class="list-disc pl-5">${review.planImplications.map(item => `<li>${e(item)}</li>`).join("")}</ul>
      <h4 class="mt-3 font-semibold">Still uncertain</h4><ul class="list-disc pl-5">${review.uncertainties.map(item => `<li>${e(item)}</li>`).join("")}</ul>
      <p class="mt-3"><strong>Next experiment:</strong> ${e(review.nextAction)}</p>
      <a class="mt-3 inline-block underline" href="/workbench?view=work&amp;context=${encodeURIComponent(review.direction.slice(0, 300))}&amp;title=${encodeURIComponent(review.nextAction.slice(0, 180))}">Work on this experiment</a>
      <details class="mt-3"><summary>Original input and interpretation confidence</summary><p class="whitespace-pre-wrap">${e(review.sourceText)}</p><p>Interpretation confidence: ${e(review.confidence)}. This is not proof of suitability or commercial success.</p></details>
      <a class="mt-3 inline-block underline" href="/workbench?view=overview&amp;goalId=${e(review.inputId)}&amp;context=${encodeURIComponent(review.direction.slice(0, 300))}#capture">Correct or replace this goal</a>
    </article>`).join("")}</section>`;
}
