# Today-Surface Polish (scrollbar + ClarityIndicator icons) — Design Spec

**Date:** 2026-05-19
**Status:** Approved (design), pending implementation plan
**Branch:** `feat/today-polish` (worktree `.worktrees/today-polish`, off `origin/main`)
**Scope:** Two tiny, bundled UI-polish changes on the Today surface (~5 lines total).

## Problem

1. The Today view `<main>` column (`AppShell.tsx`) uses `overflow-auto`; its
   global-styled 6px gray (`neutral-300`) scrollbar renders at `<main>`'s right
   edge — exactly the seam against the fixed scratchpad `<aside>`. It reads as a
   hideous divider between the two panes.
2. `ClarityIndicator.tsx` still has 2 raw emoji (`✓`, `✨`) — the last emoji in
   the rebuilt Today surface; everything else was converted in no-emoji Slice 1.

## Change 1 — hide the Today-column scrollbar (keep scroll)

Add a scoped utility to `src/index.css` (in the existing SCROLLBAR STYLING
section):

```css
.scrollbar-none { scrollbar-width: none; }
.scrollbar-none::-webkit-scrollbar { display: none; }
```

Add the class `scrollbar-none` to the Today `<main>` element in
`src/components/layout/AppShell.tsx` (the `relative flex-1 overflow-auto
overflow-x-hidden …` element, ~line 237). `overflow-auto` is **kept** — scroll
via wheel / trackpad / touch / keyboard is unchanged; only the visible bar is
removed. The utility is opt-in and applied to this one container only, so
global thin scrollbars elsewhere are unaffected.

## Change 2 — ClarityIndicator emoji → ConceptIcon

In `src/components/schedule/ClarityIndicator.tsx` (add
`import { ConceptIcon } from '@/lib/conceptIcons'`):

- `<span className="text-primary-500">✓</span>`
  → `<ConceptIcon name="done" decorative className="text-primary-500" />`
- `<span>✨</span>` → `<ConceptIcon name="ai" decorative />`

Both decorative (beside text), matching the no-emoji Slice 1 pattern and the
already-shipped, approved `done`/`ai` mappings.

## Behavior-Preserving Gates

- `src/components/schedule/ClarityIndicator.test.tsx` exists: if it asserts the
  `✓`/`✨` glyphs, that single assertion is re-pointed deliberately (to
  still-true text or the icon's accessible name); every other assertion stays
  byte-identical and green. Same discipline as Slice 1's gated batch.
- If `AppShell` has a test, it stays green (no test asserts a scrollbar).
- Scroll functionality of `<main>` is unchanged (only the bar's visibility).

## Out of Scope

- No scroll-shadow / fade affordance (deliberate; easy follow-up if content
  ever looks visually clipped once the bar is gone).
- No other emoji, no other AppShell layout changes, no unrelated refactor.
- The broader future emoji slices (wall, content `.ts`) — separate, ledgered.

## Verification

- `npm run build` clean (0 tsc errors).
- `ClarityIndicator.test.tsx` green; repo chrome grep-guard
  (`grep -rlP "[emoji-ranges]" src/components --include=*.tsx | grep -v /wall/
  | grep -v .test.`) returns no NEW chrome emoji (Today surface now fully
  emoji-free).
- Manual: on the live result, the Today column scrolls with no visible gray
  bar at the scratchpad seam; ClarityIndicator's check/sparkle render as
  lucide icons aligned with their text.

## Plan / Execution Note

Single tiny plan; **inline execution** is proportionate (one CSS utility +
one className + two icon swaps + possibly one test re-point) — the
fresh-subagent-per-task pipeline would be disproportionate overhead here.
