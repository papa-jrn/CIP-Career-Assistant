# Image Provenance Record

**Integrity rule (project plan §2475):** CIP must not present hardcoded/fixture data as live
results, and must not hotlink or scrape imagery. Every image used in the UI must be properly
licensed and recorded here with source, license, date, and intended use. This file is the
authoritative provenance ledger for all images in `public/images/`.

---

## Licensing source

**PhotoDune / Envato Elements** — licensed stock photography, properly purchased under an
active Envato Elements subscription. These are NOT hotlinked, scraped, or redistributed
externally; the optimized files are served from this repo's `public/images/` directory.

License terms (Envato Elements standard): lifetime use of downloaded items under the active
subscription, including use in digital products. Each file below traces to a licensed download.

---

## Image slots

Drop optimized images into `public/images/` using the exact filenames below. Recommended sizes
are noted — these are web display targets, not the full-resolution originals (which were
~16–25MB JPEGs at 6000–8000px and must be compressed before placement).

| Filename | Surface | Actual size | Status |
|---|---|---|---|
| `hero-workspace.jpg` | Workbench home hero | 1600×1200, 216 KB | **placed ✓** |
| `intake-coach.jpg` | Intake first-touch | 900×1100, 115 KB | **placed ✓** |
| `empty-state.jpg` | Workbench empty-state encouragement | 600×450, 86 KB | **placed ✓** |
| `report-cover.jpg` | Career Intelligence Report cover | 1400×700, 170 KB | **placed ✓** |

All four images placed 2026-06-30. Compressed to web sizes (sRGB JPEG), well within budget. The
report cover uses the 1400×700 spec per the founder's edit. Each renders with an overlay gradient
for text legibility where copy is placed over imagery.

---

## Source images (PhotoDune/Envato downloads)

Licensed downloads, compressed to the sizes above before placement. Until an image is dropped in,
its slot falls back to a warm `--surface-wash` so the UI never breaks and never implies an image
it doesn't have (all four are now in place, so no fallbacks currently render).


1. **`smiling-woman-shake-hands-in-bright-workspace`** (original 7360×4912, 24.8 MB)
   - Candidate slot: `hero-workspace.jpg` (welcome moment) — *default mapping in code*.
2. **`young-professionals-engaged-in-a-dynamic-job-interview`** (original 8256×5504, 23.6 MB)
   - Candidate slot: Opportunities / role-research surface or report cover.
3. **`confident-businesswoman-with-team-in-modern-office`** (original 6720×4480, 16.0 MB)
   - Candidate slot: Assets / leadership positioning or report cover.

---

## Process for placing an image

1. Compress the licensed original to the recommended size (sRGB, JPEG quality ~80–85).
2. Save it to `public/images/` using the exact filename from the table above.
3. Record the one-line visual note in this file (warm/cool light, subject position) so future
   placement decisions stay grounded.
4. Verify it renders without the `onerror` fallback firing.

**If you add a new image:** append a row to the table with its source, license, and intended use.
Never reference an unlicensed, hotlinked, or scraped image anywhere in the app.
