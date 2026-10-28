# AFTER — Morgan Ellis target lanes and workspace, captured 2026-10-28

Observed product output. Captured after submitting the answers in
`06-advisor-answers-SYNTHETIC.txt`, which were overwhelmingly "no evidence".

Compare with `07-BEFORE-target-lanes-OBSERVED.md`. The six predictions recorded there are
scored below. **Three held, one is mixed, two failed.**

---

## Verdict

**The integrity layer passed. The scoring layer rewarded engagement.**

Nothing was fabricated. Every claim traces to Morgan's own words, every interpretation is
labelled AI-derived with a confidence and a correction link, and two of the three lanes were
renamed to narrower, more honest titles. The plan actively steers away from roles needing direct
reports.

But six documented absences raised the primary score from 78 to 82, one boundary statement was
logged as *strengthening* a direction, and the research cap that had been holding the secondary
lane down silently lifted. The cause is diagnosed below and is reproducible.

---

## Verbatim capture — target lanes

> Best-supported next resume variant
>
> **Senior Technical Manager** — Score 82 / up. Use this as the next resume variant to generate
> or refresh.
>
> Baseline from current advisor lane order: 74.
>
> **Primary lane — Senior Technical Manager**
> Morgan's strong delivery leadership, cross-team coordination, and informal mentorship align
> well; lacks formal people management but excels in multi-team engagement and process
> improvements. Strategic read: high-confidence score based on Evidence re-analysis strengthened
> this direction: Senior Technical Manager role alignment with delivery and liaison strengths.
> Evidence re-analysis strengthened this direction: Clarification of informal mentorship over
> formal people management..
>
> Examples quantifying team and program size impact; optional endorsements from cross-functional
> partners.
>
> **Secondary lane — Product Enablement Lead**
> Experience in synthesizing customer feedback and supporting product managers fits a supportive
> product operations role, though without roadmap ownership authority. Strategic read: promising
> score based on Evidence re-analysis strengthened this direction: Focus on supportive product
> roles without roadmap authority. Evidence re-analysis weakened this direction: Product
> Operations lane as a strategic leadership role due to lack of roadmap or pricing ownership..
>
> Demonstrated impact of feedback work on product decisions and some endorsements from product
> management stakeholders.
>
> **Tertiary lane — Platform Program Manager (Technical Liaison)**
> Coordination with security engineers, release process improvements, and extensive liaison work
> show readiness, while abstaining from system architecture authority fits user's boundaries.
> Strategic read: promising score based on Evidence re-analysis strengthened this direction:
> Senior Technical Manager role alignment with delivery and liaison strengths. Evidence
> re-analysis strengthened this direction: Focus on supportive product roles without roadmap
> authority..
>
> Clarify scope of technical liaison activities and illustrate risk management contributions.

## Verbatim capture — workspace goals

Six goals were created, from answers 1, 3, 4, 5, 9 and 10. Answers 2, 6, 7, 8, 11 and 12
produced no goal.

> **Direction added or revised:** Informal mentoring and influence without people management
> authority; No current or planned role-aligned certifications; Strong delivery and process
> initiatives but no strategic or P&L authority; No employer or industry research on program
> management maturity or culture; No ownership or influence on pricing, market sizing, roadmap
> prioritization, experimentation platforms in product operations; No third-party product
> management feedback on strategic contributions. Position for senior technical roles emphasizing
> cross-team coordination and mentorship rather than direct people management. Avoid pursuing
> roles requiring confirmed direct reports or managerial performance impact. Focus on
> experience-based roles aligned with existing skills and boundaries. Consider optional
> credentialing only if a strong role-mandate emerges. Continue targeting senior technical program
> manager lanes emphasizing delivery mastery. Avoid positioning strongly for strategic product
> ownership roles without further experience evidence. Encourage research on organizations and
> industries with strong program management practices. Refine target search to employers matching
> personal values and work style preferences. Position for enabling product roles without
> ownership mandate. Target growth experiences to build strategic product influence if desired. Be
> cautious positioning as a strategic product influencer without stronger endorsements. Seek
> opportunities to obtain formal feedback or references from product management stakeholders.
>
> *AI-derived interpretation. Review and correct it.*

Per-goal structure, consistent across all six:

| Goal (from answer) | Lane relation | Confidence |
| --- | --- | --- |
| Informal mentoring without people-management authority (Q1) | Senior Technical Manager · **complements** | high |
| No role-aligned certifications (Q3) | Senior Technical Manager · **tension** | high |
| Strong delivery/process, no strategic or P&L authority (Q4) | Senior Technical Manager · **complements** | high |
| No employer/industry research (Q5) | Senior Technical Manager · **alternative** | high |
| No ownership of pricing/market sizing/roadmap (Q9) | Product Enablement Lead · **tension** | high |
| No third-party PM feedback (Q10) | Product Enablement Lead · **tension** | **medium** |

Each goal carried: the quoted basis from saved evidence, implications for the plan, a "Still
uncertain" note, a next experiment, the original input, an interpretation-confidence line, "This
is not proof of suitability or commercial success", and a "Correct or replace this goal" link.

---

## Prediction scorecard

| # | Prediction | Result |
| --- | --- | --- |
| 1 | Primary score should not rise materially from 78 | **FAILED** — rose to 82 |
| 2 | Product Ops weakens or holds at cap; must not vanish; must not survive unchanged | **MIXED** — did not vanish, did change appropriately, but the cap lifted and standing rose from "watch" to "promising" |
| 3 | Tertiary narrows from deep technical oversight toward liaison | **HELD** — cleanly |
| 4 | "Handling larger teams" must not be satisfied | **HELD** |
| 5 | Volunteering must not reappear as management or nonprofit-executive experience | **HELD** — absent entirely |
| 6 | No "no proof" answer restated as an accomplishment; "none" must not become positive signal | **FAILED** |

### 3, 4 and 5 — what went right

**Prediction 3 held precisely.** "Platform Program Manager (Technical Focus)" became "Platform
Program Manager (**Technical Liaison**)". The BEFORE overstatement — "positions Morgan well for a
platform-focused role requiring deep technical program oversight" — is gone, replaced by
"abstaining from system architecture authority fits user's boundaries." The system read a flat
"no proof" on question 11 and a genuine yes on question 12 and narrowed the lane to exactly what
the evidence supports. **BEFORE defect 3 is fixed.**

**Prediction 4 held.** The gap is still requested ("Examples quantifying team and program size
impact") rather than marked satisfied, and the plan says outright: "Avoid pursuing roles requiring
confirmed direct reports or managerial performance impact." The system is protecting Morgan from
overreach, which is the integrity rule working as designed.

**Prediction 5 held.** The volunteering does not appear anywhere — not as management, not as
nonprofit-executive experience, not at all.

**Also right, and worth stating plainly:** zero fabrication. Every lane rationale and every goal
traces to Morgan's uploaded files or submitted answers. Question 10 correctly received **medium**
confidence rather than high, because its underlying evidence was a self-paraphrase of a private
check-in — that is genuinely sophisticated calibration, not boilerplate.

---

## Defect 1 (NEW, root cause diagnosed) — the research cap depends on the AI's adjectives

The BEFORE state's best feature was the secondary lane's explicit cap: "Capped as research
because current support is only a light new-target signal; needs a real role, employer, or
current-work evidence before ranking higher." In the AFTER state that cap is **gone**, and the
lane moved from "watch score" to "promising score" — after Morgan answered "no proof exists" to
both of its named gaps.

`exploratoryLaneCap` in `strategic-state.ts` decides whether a lane is speculative by regex over
`normalize([lane.role, lane.rationale, lane.missing].join(" "))`, looking for words including
`potential`, `explor`, `possible`, `needs evidence`. Reproduced deterministically against the two
observed prose versions:

```
BEFORE secondary -> speculative (capped): true    hedge words present: [preliminary, potential]
AFTER  secondary -> speculative (capped): false   hedge words present: []
```

BEFORE the model wrote "**preliminary** experience ... suggest **potential** to move into product
operations". AFTER, it wrote "**Experience** in synthesizing customer feedback ... **fits** a
supportive product operations role". The hedging vocabulary disappeared, so the predicate stopped
matching and the cap switched off.

**The guard against promoting an unsupported lane is triggered by how tentatively the model
happens to phrase the lane, not by the evidence behind it.** Answering the questions honestly made
the model write more confidently about a *narrower* role, which removed the words the guard was
watching for. The evidence got weaker and the protection disappeared.

The code comment immediately above the scoring block states the intended contract: "On their own
these can raise or lower the score but never exempt the research cap — résumé/analysis strength
alone does not promote a lane; that still needs a real external signal." The intent is right. The
implementation makes the cap evadable by rewording.

Secondary note, lower confidence: Morgan has no saved conversation outcomes, so
`onlyLightNewTargets` — which requires `positive.length > 0` — cannot have been true. The BEFORE
cap was therefore most likely the `speculativeAdvisorLane` branch (58) while displaying copy that
describes the light-new-target branch (54). Worth confirming; stated as a hypothesis, not a
finding.

## Defect 2 (NEW) — one clarification scores several lanes at once

The tertiary lane's strategic read cites two strengthening phrases, **neither of which is about
it**:

- "Senior Technical Manager role alignment with delivery and liaison strengths" — the primary
  lane's phrase
- "Focus on supportive product roles without roadmap authority" — the secondary lane's phrase

The tertiary appears to have no change notes of its own and is displaying the other two lanes'.
`matchDeltaToLane` is matching loosely — the primary's phrase contains "liaison" and the tertiary
is the liaison lane — so a single `changeLog.strengthened` entry can add up to +8 to multiple
lanes. One clarification inflates several directions.

This is the single-best-lane-assignment leakage predicted in Consolidated Finish Plan §4.4,
appearing in the strategic read rather than in posting assignment.

## Defect 3 (CONFIRMED FAILURE, prediction 6) — a boundary logged as a strengthening

> "Evidence re-analysis **strengthened** this direction: Clarification of informal mentorship over
> formal people management."

Morgan wrote: "no direct reports, no authority over their reviews or assignments. I have no data
on their subsequent performance or career progression ... Please don't treat this as people
management." That is a documented absence. The model placed it in `changeLog.strengthened`, and
the scoring code faithfully added up to +8 for it.

The arithmetic is not at fault — `+8` per strengthened phrase, capped at `+12`, is the designed
behaviour. The fault is the **valence classification**: a boundary clarification was classed as
strengthening. That is also the proximate cause of prediction 1's failure, since 74 + 8 = 82.

**Assessment: this does not stop the pass.** The phrase itself is accurate, and no interface text
claims Morgan has people management — the goal card says the opposite. This is a calibration and
classification defect, not fabrication under §8/§19.

## Defects carried over from BEFORE

| BEFORE defect | Status |
| --- | --- |
| 1. Title drift — "Senior Technical **Program** Manager" → "Senior Technical Manager" | **PERSISTS, now self-contradictory.** The plan text says "Continue targeting senior technical **program manager** lanes" while the lane is named "Senior Technical Manager". The rationale now also concedes "lacks formal people management" while keeping a manager title. |
| 2. Malformed strategic-read sentence | **PERSISTS, worse.** "score based on Evidence re-analysis strengthened this direction:" is the same fragment-as-noun-phrase bug with the same doubled full stop, now concatenating two clauses in every lane. |
| 3. Tertiary overstates the evidence | **FIXED** — see prediction 3. |
| 4. No lane matches any `ROLE_FAMILIES` trigger | **UNCHANGED** — "Senior Technical Manager", "Product Enablement Lead" and "Platform Program Manager (Technical Liaison)" all still miss, so this run exercised the token-overlap path throughout, as §4.4 predicted. |

---

## Triage

**Fix before beta:**

1. Make the research cap depend on evidence, not on the model's adjectives (Defect 1). A guard a
   reword can switch off is not a guard.
2. Stop a single `changeLog` phrase scoring multiple lanes (Defect 2).
3. Repair the malformed strategic-read sentence (BEFORE defect 2) — it is string assembly, visible
   to every user, and cheap.

**Needs a product decision:**

4. Valence classification (Defect 3). Options: constrain the prompt so a stated boundary cannot be
   classed as strengthening; or separate "confidence in the characterisation" from "strength of
   candidacy", which is arguably what the model meant. The score should not rise on documented
   absences either way.
5. Lane title fidelity (BEFORE defect 1) — whether a lane may rename the user's own job title, and
   whether dropping "Program" from a program manager's title is acceptable.

**Record, do not fix now:** the `ROLE_FAMILIES` misses stay Phase 7 evidence per §4.4.

**Open question for the next run:** answers 2, 6, 7, 8, 11 and 12 produced no workspace goal.
Questions 11 and 12 did visibly change the tertiary lane, so they were read. Whether 6, 7 and 8
were correctly judged to have nothing to record, or were silently dropped, is not established
from this capture.
