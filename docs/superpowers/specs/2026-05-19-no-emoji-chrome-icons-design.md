# No-Emoji Main-App Chrome → Lucide Icons — Design Spec

**Date:** 2026-05-19
**Status:** Approved (design), pending implementation plan
**Branch:** `feat/no-emoji-icons` (worktree `.worktrees/no-emoji-icons`, off `origin/main`)
**Slice:** 1 of N — main-app UI chrome only

## Problem

Symphony's standing UI rule is **no emojis** — they render inconsistently
across platforms and read as unpolished against the elegant Nordic Journal
design language. The codebase has ~787 emoji occurrences across ~102 files.
This is too large for one pass and parts (the kiosk wall) may use emoji
intentionally for 8-foot glanceable viewing.

## Scope (Slice 1)

**In scope:** main-app UI chrome — the ~46 `.tsx` component files under
`src/components/**` that contain emoji, **excluding** `src/components/wall/**`.
~40 distinct glyphs, dominated by semantic UI emoji (✓ done ×19, 📋 list ×13,
📅 when ×7, 📁 project ×7, 👤 person ×7, 📝 note, ✅ task, 🔁 routine,
🏷 context, 🧹/🚗/⚽ categories, 📞 call, ✕ close, 🔥 streak, …).

**Explicitly OUT (separate future slices):**
- `src/components/wall/**` (kiosk — emoji may be intentional UX for kids).
- Emoji embedded in content/data `.ts` files (`soccerTips.ts`,
  `runningTips.ts`, `weatherMessages.ts`, `roomConfig.ts`, `contact.ts`, …)
  — content, not chrome.
- Any non-emoji refactor of the touched files.

## Approved Concept → Icon Mapping

`lucide-react` (already the house icon set — 38 files, named imports). One
icon per **concept**, not per call-site:

| Concept | lucide | | Concept | lucide |
|---|---|---|---|---|
| done / complete | `check` | | close / clear | `x` |
| list / inbox | `clipboard-list` | | add | `plus` |
| when / event | `calendar` | | streak | `flame` |
| note | `sticky-note` | | discussion | `message-circle` |
| task | `square-check-big` | | email | `mail` |
| routine | `repeat` | | location | `map-pin` |
| project | `folder` | | attachment | `paperclip` |
| person / assign | `user` | | warning | `triangle-alert` |
| context / domain | `tag` | | time | `clock` |
| chore | `spray-can` | | ai / highlight | `sparkles` |
| errand | `car` | | celebration | `party-popper` |
| activity | `volleyball` | | idea / tip | `lightbulb` |
| call | `phone` | | | |

Long-tail / one-off emoji map through this same table (closest concept).

## Architecture

### `src/lib/conceptIcons.tsx` (new — single source of truth)

- Exports a `ConceptIcon` component: props
  `{ name: ConceptName; size?: number; className?: string;
  'aria-label'?: string; decorative?: boolean }`.
- `ConceptName` is a string-literal union of the concept keys above.
- Internally maps each `ConceptName` → the approved lucide icon component.
- Default `size` = 16 (inline text scale); icon stroke inherits
  `currentColor` so existing text-color utility classes still apply.
- Accessibility: if `decorative` (icon sits beside a text label) →
  `aria-hidden="true"`. Otherwise renders an accessible name from
  `aria-label` (falling back to a humanized `name`) so screen readers and
  tests can query by role/name. This is a strict a11y improvement over bare
  emoji glyphs.
- Exports the `ConceptName` union and a `CONCEPT_ICONS` record for tests.

### Chrome conversion

Each in-scope `.tsx` replaces emoji string literals with
`<ConceptIcon name="…" decorative? />`, preserving surrounding layout
(emoji were inline text; icons get consistent inline sizing/vertical
alignment — wrap in a span or apply alignment classes where the emoji was
load-bearing for spacing). No call-site picks its own icon; all go through
`conceptIcons`.

### Behavior-preserving discipline

In-scope components include tested ones (`ParsedFieldChips`, `QuickCapture`
[20-test gate], `TimelineInsertPoint`, `ScheduleItem`, `ProactiveSuggestionChips`,
`OutcomePicker`, `InboxTriageModal`, …). Where a test asserts an emoji glyph,
swapping to an icon is an **intentional** behavior change: that test is
updated in the same task (assert the icon via accessible name / `data-testid`),
and the remainder of each suite stays green. The QuickCapture 20-test gate
and all timeline/capture suites must remain green throughout (a test needing
an unrelated change = signal to stop and reconcile, as in the
QuickCapture-extraction work).

## Plan Shape (for the implementation plan)

1. **`conceptIcons` module** — build + unit test the contract (every concept
   renders its lucide icon; decorative → aria-hidden; non-decorative →
   accessible name; size/className applied).
2. **Conversion batches** grouped by area, each self-contained (convert
   emojis → `ConceptIcon`, update that batch's emoji-asserting tests, keep
   suites + `npm run build` green):
   - `schedule/` (incl. timeline wheel/chips/cards)
   - `triage/` + `capture/`
   - `layout/` + `notes/`
   - `detail/` + `settings/` + `health/` + `surface/` + remaining chrome
3. **Guard + verify** — grep-guard: zero pictographic emoji remaining in
   in-scope chrome (`src/components/**` `.tsx` excluding `wall/`, excluding
   tests that legitimately reference glyphs in fixtures); full unit suite
   (only the documented pre-existing unrelated failures — `useSpaces` /
   `NotesPage` — may remain, no new failures); manual spot-check (timeline
   wheel, chips, triage 📅/🏷/👤 row, inbox, celebration) for alignment /
   no layout breakage, desktop + mobile.

## Risks & Constraints

- **Width/alignment:** icons aren't 1:1 with emoji width — consistent inline
  sizing + vertical alignment is part of each conversion, not deferred.
- **Test gates:** QuickCapture 20-gate + timeline/capture suites stay green;
  emoji-asserting tests updated deliberately, never to vacuity.
- **Scope creep guard:** `wall/` and content `.ts` untouched; no unrelated
  refactor of converted files.
- **Enforceability:** the grep-guard in the final task makes "no emoji in
  chrome" a regression-checkable invariant going forward.

## Out of Scope

- Kiosk wall (`src/components/wall/**`).
- Emoji in content/data `.ts` files.
- Any visual redesign beyond emoji→icon substitution.
- The other ~740 emoji occurrences outside Slice 1 (future slices).
