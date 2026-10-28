# BEFORE — Morgan Ellis target lanes, captured 2026-10-28

Observed product output, not fixture input. Captured after uploading files 01, 02 and 03
(resume, career context, supporting evidence) and **before** submitting the answers in
`06-advisor-answers-SYNTHETIC.txt`.

The point of this file is to make the comparison falsifiable. Predictions are written down
below so the AFTER state can contradict them.

---

## Verbatim capture

> **Target lanes**
>
> Choose focus before generating variants.
> Primary, secondary, and tertiary describe your current focus. Each lane keeps its own
> supporting evidence and remaining gaps. Choosing a new primary direction does not erase the
> alternatives or establish market validation.
>
> **Best-supported next resume variant**
>
> Senior Technical Manager
> Score 78 / up. Use this as the next resume variant to generate or refresh.
>
> Baseline from current advisor lane order: 74.
>
> **Primary lane**
>
> Senior Technical Manager
> Extensive cross-functional program leadership with budget responsibility and measurable
> process improvements, aligning well with senior program management roles demanding
> coordination and delivery assurance. Strategic read: promising score based on Current
> positioning names this direction..
>
> More evidence on influencing strategic product direction and handling larger teams or
> expanded scope would strengthen candidacy.
>
> **Secondary lane**
>
> Product Operations Lead
> Interest and preliminary experience in customer feedback translation and product team
> collaboration suggest potential to move into product operations, a role bridging program
> management and product strategy. Strategic read: watch score based on Capped as research
> because current support is only a light new-target signal; needs a real role, employer, or
> current-work evidence before ranking higher. Current positioning names this direction..
>
> Proof of direct involvement in pricing, market analysis, and roadmap prioritization is
> needed for credibility.
>
> **Tertiary lane**
>
> Platform Program Manager (Technical Focus)
> Experience coordinating multi-team technical migrations and security redesigns positions
> Morgan well for a platform-focused role requiring deep technical program oversight.
> Strategic read: watch score based on Current positioning names this direction..
>
> Demonstration of technical system knowledge and influence beyond program coordination would
> be critical to endorse this path strongly.

---

## Numbers to compare

| Measure | BEFORE |
| --- | --- |
| Best-supported variant | Senior Technical Manager |
| Its score | 78, direction "up" |
| Baseline from advisor lane order | 74 |
| Primary | Senior Technical Manager |
| Secondary | Product Operations Lead (capped as research) |
| Tertiary | Platform Program Manager (Technical Focus) |

## What is already right

- **The secondary cap is working, and this is the best thing in the output.** Product
  Operations is explicitly held down: "Capped as research because current support is only a
  light new-target signal; needs a real role, employer, or current-work evidence before ranking
  higher." That is exactly what file 00 asks for — adjacent, with gaps stated, not promoted on
  enthusiasm.
- **The named gaps match the questions.** Each lane's missing-evidence line corresponds to the
  advisor questions 9 through 12, so questions are being derived from gaps rather than invented
  separately. Coherent design.
- **No fabricated employer, metric or date appears** in any lane rationale. Everything traces to
  the uploaded files.

## Defect candidates visible in the BEFORE state

1. **Title drift: "Senior Technical **Program** Manager" became "Senior Technical Manager".**
   The resume title, the summary and every role held use "program manager". The lane drops
   "program", which names a different job: a technical manager manages people. Morgan's resume
   states "no direct reports" and the boundaries section states "no ... direct people
   management". The primary lane then compounds it by asking for "handling larger teams" as the
   strengthening evidence — pushing toward a people-management role the fixture documents as
   absent. Watch whether the AFTER state corrects the title or hardens it.

2. **Malformed strategic-read sentence, all three lanes.** "Strategic read: promising score
   based on Current positioning names this direction.." — a sentence fragment is being
   concatenated as if it were a noun phrase, with a doubled full stop. The secondary lane shows
   the same bug wrapping a longer clause. This is string assembly, not model output, and it
   appears in every lane.

3. **Tertiary overstates what the evidence supports.** "Positions Morgan well for a
   platform-focused role requiring deep technical program oversight" is stronger than the
   source allows: file 03 says a security engineer designed the authorization changes and "I
   could not independently design an identity service." The gap line does ask for that evidence,
   so the claim and its caveat sit in tension.

4. **Still out of lane.** "Senior Technical Manager" does not match any `ROLE_FAMILIES` trigger,
   which require CTO/CIO/chief-officer, director-of-technology, head-of-technology or IT-director
   phrasings. Consistent with the prediction recorded in the Consolidated Finish Plan §4.4: this
   persona exercises the token-overlap path only.

## Predictions for the AFTER state

Written before submitting file 06, whose answers are overwhelmingly "no evidence".

1. **The primary score should not rise materially.** This is the sharpest pass/fail signal in
   the whole run. The answers supply almost no new positive evidence; question 4 adds real
   process initiative already present in the resume, and everything else is a documented
   absence. If 78 climbs, the system is rewarding engagement rather than evidence.
2. **Product Operations should weaken or hold at its cap**, with gaps restated. It must not
   disappear silently — the silent-lane-disappearance behaviour seen on account B is the thing
   to watch for. It must also not survive unchanged after a flat "no proof exists" on both of
   its named gaps.
3. **The tertiary should narrow from "deep technical program oversight" toward liaison**, since
   question 11 is a flat no and question 12 is a genuine yes on liaison only.
4. **"Handling larger teams" should not be satisfied.** The mentoring answer states no direct
   reports and no tracked outcomes. If team-scale evidence appears as met, that is fabrication.
5. **The volunteering must not reappear as management or nonprofit-executive experience.**
6. **No "no proof" answer should be restated as an accomplishment**, and "none" must not be
   converted into a neutral or positive signal.

Any of 4, 5 or 6 occurring is an integrity breach under §8/§19 and stops the pass. Items 1, 2
and 3 are calibration findings to record and triage.
