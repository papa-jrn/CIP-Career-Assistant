# Workbench design QA - 2026-10-20

Reference: design/workbench-purple-reference.png (the founder-approved Career Map layout with purple accents).
Implementation: http://localhost:4321/workbench, signed-in existing account.

## Findings and fixes

- Desktop density: reduced top/section spacing and findings-field height after reviewing the first rendered desktop capture. The revised capture preserves a lane strip, repeatable work links, view navigation, and the two-column action/context arrangement.
- Phone navigation: replaced horizontal Workbench-tab scrolling with a two-column set of visible links. Alternative career lanes expand through an accessible button rather than occupying the whole first work area. Rechecked the revised phone capture and disclosure behavior.
- Context return: visiting Employers now offers an explicit return to the same Workbench action; verified by following both links.

## Required surfaces

- Typography: self-hosted Inter, sans-serif headings and readable form text; actual saved lane/task titles wrap rather than truncate. The approved longer tagline and real titles occupy more space than the illustrative mock.
- Layout: desktop navy sidebar and two-column workspace; phone navigation stacks above content and action/context regions become a single column. Checked 1440 x 1024 and 390 x 844 CSS viewports. Phone document width stayed within the viewport.
- Colors: navy sidebar, cool white/slate surfaces, purple primary actions/links, lavender selections. Semantic pending/warning colors remain separate from the brand accent. Visible keyboard focus uses a purple outline.
- Assets: Phosphor regular icons from a locally bundled library; no decorative raster imagery is required by the selected screen. Reference image is retained as a design artifact, not rendered as the app interface.
- Copy: approved positioning line included. Real account lanes and the genuine CIP pilot action replace illustrative mock content. No invented employer research, verification, jobs, salaries, or findings appear.

## Interaction verification

Created the genuine CIP MVP/pilot action and confirmed its editor and persisted reload. Followed employer research and returned to that same action. Verified invalid source-link validation appears without replacing the form or inserting evidence. Checked keyboard focus and phone lane expansion. Existing analysis and change-review routes remain connected; no paid analysis was rerun merely for visual QA.

Automated verification: typecheck, 459 tests, and SSR build passed. Regression checks cover atomic evidence/action persistence, unknown conclusions, source-only findings, unsafe source schemes, lifecycle preservation, source history, and cross-user boundaries.

## Evidence limits and follow-up

Browser screenshots were inspected during this run, but the browser tool does not expose a supported save path or composite-image export. A saved side-by-side reference/implementation comparison required by the Product Design workflow has not been produced. The live screens and source were inspected separately; this is not a claim of that composite comparison or pixel-exact fidelity.

Formal visual handoff remains blocked on that comparison artifact. First-use with an empty new account, a deliberately induced analysis failure/retry, and complete screen-reader testing remain separate acceptance work. Deeper People, imported-job, source-orchestration, and entity-resolution work is outside this slice.

final result: blocked

## Public landing page - subsequent implementation

The public landing page follows the established purple/Inter visual system and reviewed content brief rather than a separately selected landing-page image. Browser inspection at 1440 x 1024 and 390 x 844 covered the header, responsive hero and labelled design preview, loop content, anchor navigation, FAQ controls, overflow, and signed-in return controls. The initial phone header wrapped the return action onto a separate row; its font/spacing was tightened. The final rebuilt phone capture confirmed the brand and return action share the first row, navigation remains visible below, and the optimized image loads. No browser console errors were reported. The illustrative preview was optimized from 1.5 MB PNG to approximately 95 KB WebP. An unauthenticated root request confirmed the public page, login entry, and absence of the workspace sidebar. Automated regression suite: 459 passing, with typecheck and SSR build.

This does not close the earlier formal Workbench composite-image comparison limitation; the overall blocked status above is retained. No pixel-exact landing-page comparison is claimed.
