# Founder test queue

What needs **your** hands and eyes, in the order worth doing. Written 2026-10-28, at `ab37fad`.
Nothing here needs a code change first. Tick things off and this file shrinks.

Restart the server before the first item — the dev server builds and serves `dist/`, so code
changes need a restart:

    npm run dev

---

## A. Fast and free (about ten minutes, no API spend)

**A1. Morgan's lanes dropped out of high confidence — `/assets`, Morgan's account.**
Expect the primary, Senior Technical Manager, to read **79** and *not* "high-confidence". It was
**90** before this fix. A reason should be visible: *"Held just below high confidence: the lift came
from re-reading your own records, and nothing outside them has confirmed this direction yet."*
If it still says 90 or high-confidence, the fix did not take.

**A2. Each phrase on one lane only — same page.**
The tertiary (Platform Program Manager) must **not** cite *"Senior Technical Manager role alignment
with delivery and liaison strengths"* — that's the primary's phrase. The tertiary should instead be
**weakened** by *"Technical ownership roles requiring architecture input..."*. Secondary should read
**watch**, not promising.

**A3. One conversation, one lane — `/assets`, your own account.**
*"Christopher Diak: strengthens new_target (+5)"* appeared on **both** the Executive Director lane
and the Director of Media Innovation lane. It should now appear on **one**.

**A4. Nothing of yours is wrongly capped — your own account.**
The research cap now applies to every non-primary lane with no external validation. Yours were
exempt via verified-open postings (11 and 12), so expect no change. **But** the conversation
exemption only fires for outcomes *tagged to that lane* via `relatedLane`. If a lane you know is
well-founded now reads **58 / "Capped as research"**, say so — the rule is too strict as written and
the fix is to broaden what counts as validation, not to restore the old prose regex.

**A5. The saved-evidence panel updates without a reload — `/evidence`, either account.**
Save an evidence answer. "Recently saved evidence" should fill in immediately; it used to keep
saying "No evidence answers saved yet" until a reload. **This has never been verified signed in** —
I could only test the response shape and the empty-state render. If it fails, the likely cause is
that the per-card forms target `#evidence-result-<card.id>` rather than `#strategic-update-result`,
and the out-of-band swap needs checking from that path too.

**A6. Did the search actually use your saved careers pages? — `/opportunities`, your account.**
Expand **"What was checked"** on the last run. If Town of Lebanon and Norwich University each show a
**(page)** link pointing at the address you supplied, the saved-URL-to-search leg is confirmed and
Step 4's last fixture-only gap closes. No new search needed; this reads a run you already paid for.

**A7. Exclusion and restore — `/employers`, your account.**
Never seen signed in beyond "Excluded (0)". Hit **Not interested** on a queue candidate; expect a
hidden-count notice rather than silence, then put it back from the **Excluded** list.

## B. Continues the Morgan acceptance pass (costs API spend)

**B1. Finish the fixture** from `test-data/phase5-mountain-view/00-START-HERE-do-not-upload.txt`,
steps 4 through 7: the 24-contact CSV, the relationship context, then the Mountain View search at 25
miles with the 150K base floor. Watch the review expectations in file 00 — particularly that a 150K
*base* floor never becomes 150K *total*, and that Mountain View is a search centre and not a
requirement to work for Google.

**B2. The propagation test**, after B1 is recorded: change **only** the radius from 25 to 10 miles
and compare the saved brief, coverage and exclusions against the baseline.

## C. Still open in Step 5 (section 4 of the finish plan)

- First use on a genuinely empty account (account C) — decides whether import-first placement needs
  revisiting
- A deliberately induced analysis failure and retry
- Screen-reader pass
- The two live passes with a constraint change traced through brief, search, observations, result

## D. Decisions only you can make

1. **Lane title fidelity.** Every mention in Morgan's resume is *Senior Technical **Program**
   Manager*; the lane renders *Senior Technical Manager* — a different job, one that manages people,
   against a resume stating "no direct reports". The plan text meanwhile says "targeting senior
   technical **program manager** lanes", so the product contradicts itself. May a lane rename
   someone's own job title?
2. **The entrepreneur and workforce-development caps.** The prose regex I removed also carried
   deliberate skepticism about those two lane types specifically. That skepticism is now gone.
   Nothing changed for you, because your Founder/CIP lane sits at index 0 where it never applied.
   Restore them as explicit structural rules, or let the general rule stand?
3. **"Primary lane" versus the headline score.** On your account the primary is the Founder/CIP lane
   at *promising*, while the best-supported variant is the secondary at **87**. "Primary" means the
   advisor's ordering and the score means evidence weight; they disagree without saying so.
4. **Jen's run — three unanswered questions**, from the 2026-10-28 finding in the finish plan. Her
   data is on the home machine:
   - her top lane's exact role text (if it was phrased in operations terms it missed
     `ROLE_FAMILIES` too, which would mean **zero in-lane coverage across two real users**)
   - whether education was disclosed as considered-and-outweighed, or simply absent
   - whether agricultural *sector* experience was asserted anywhere

## E. Launch gates, unchanged

Hosted migrations beyond `employer_target_events`; `BETA-RESTORE` of the weekly search cap; OpenAI
key baked into the server build; Vercel adapter and the in-memory rate limiter; sign-up lockdown;
security audit `FirstPass-BetaCodeAudit.md` from item 7; the repo's move off OneDrive plus key
rotation; CIP name and domain.
