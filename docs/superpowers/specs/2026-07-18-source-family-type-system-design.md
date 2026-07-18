# Source-Family Type System

**Date:** 2026-07-18
**Status:** Approved by Scott
**Scope:** App-wide font swap. No layout, color, spacing, or content changes.

## Background

Scott wants Symphony to feel authored rather than AI-default. A full visual-identity
retheme was explored on 2026-07-14 and parked; this design un-parks the smallest
high-leverage piece of it: the type system. The existing layout stays exactly as is —
Scott likes the structure; the "generic Claude aesthetic" complaint attaches to the
current typefaces (Instrument Serif + Satoshi, both heavily used in AI-generated
designs).

Direction was chosen in a visual companion session on 2026-07-18: mockups of the
current Today view with identical layout/palette and varying type systems. Scott
rejected Fontshare editorial options (Gambetta, Zodiak, Erode) and Space Grotesk,
requested the Source family, and selected variant **B: Source Serif 4 masthead +
Source Sans 3 body** over sans-only (A) and full-family-with-mono (C).

## The Change

All in `src/index.css`:

1. **Font loading** (lines 8–10): replace the two imports (Google Instrument Serif,
   Fontshare Satoshi) with a single Google Fonts import:
   - `Source Serif 4` — opsz axis, weights 400–600, plus italic 400
   - `Source Sans 3` — weights 400, 500, 600, 700
   Dropping Fontshare means all fonts come from one host.

2. **Tokens** (lines 96–97):
   - `--font-family-display: 'Source Serif 4', Georgia, serif;`
   - `--font-family-sans: 'Source Sans 3', system-ui, -apple-system, sans-serif;`

3. **Display weight compensation:** Instrument Serif exists only at weight 400 and
   looks bold by letterform; Source Serif 4 at 400 will read lighter than intended.
   The approved mockup used weight 600 for mastheads. Set the display heading rule
   (index.css line ~225 block) to `font-weight: 600` so `font-display` surfaces keep
   their presence. If individual components hard-set display weights, adjust only
   where the masthead visibly thins.

4. **Width sanity pass:** Satoshi runs slightly wider than Source Sans 3. Visually
   check tight surfaces — HomeHeader masthead + pills, task cards, detail panels,
   planning views, wall view — and fix only real regressions (truncation, wrapping),
   not subpixel drift.

## Interactions & Cascade

- Every component inherits type via the two tokens and the `font-display` utility;
  no per-component font work expected.
- **The wall kiosk inherits the new fonts.** Accepted as an interim state — serif +
  warmth reads well at kiosk distance. A full wall redesign (inspired by the ChatGPT
  "family orchestration" mockup Scott liked) is a **separate follow-up brainstorm**,
  deliberately out of scope here.
- CLAUDE.md's claim of Fraunces + DM Sans is stale documentation, not code; this
  change supersedes it and CLAUDE.md's design-system section should be corrected in
  the same commit.

## Verification

- `npm run build` (tsc + vite) and `npx vitest run` before push.
- Visual pass in the browser on: desktop Today, a task detail panel, guided planning,
  Week/Month views, and `/wall-v2`.
- No functional changes → no new tests.

## Out of Scope

- Colors, spacing, borders, shadows, layout, content order.
- Wall redesign (captured as follow-up).
- Conductor/Precision content ideas (movements, tempo lines, stat mastheads) — the
  visual-identity exploration beyond type remains parked.
