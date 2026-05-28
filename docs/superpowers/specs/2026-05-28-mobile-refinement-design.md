# Mobile refinement: list card, swipe gesture, capture, detail panel

**Date:** 2026-05-28
**Status:** Design — pending plan
**Scope:** Mobile only. Desktop renders are unchanged unless explicitly noted.

## Problem

The mobile experience works functionally — swipe-to-complete and swipe-to-edit are the right gestures, the day view is scannable — but it feels sparse and unpolished, and the swipe is choppy and reversed from the natural reading direction.

Specifically:

- **Today list card** (`src/components/schedule/ScheduleItem.tsx:321`–`426`). The code comment at `:318` promises "a tinted icon block" but the JSX has none — the row goes time-column → title → right-cluster, leaving the left side visually empty. Cards use `border-neutral-200/50` flat, ignoring `shadow-card`, the design-system token built for warm card lift.
- **Section headers on mobile are hidden** (`src/components/schedule/TodayView.tsx:593`, `className="hidden md:flex"`). The day streams as an undifferentiated list — no Morning / Afternoon / Evening structure.
- **Swipe directions are inverted** from the desired reading: today right→complete / left→edit; we want left (right-to-left swipe) = Complete, right (left-to-right swipe) = Edit.
- **Swipe is choppy.** `ScheduleItemMobileCard` (`ScheduleItem.tsx:913`–`1007`) calls `setDx()` on every `touchmove`, re-rendering the entire card subtree (including dropdowns) at finger speed.
- **Quick Capture on mobile** is a centered floating modal (`src/components/layout/QuickCapture.tsx:263`–`275`) — `bg-white`, centered, ~90% width. Feels foreign next to the warm-paper app.
- **Detail panel** (`src/components/surface/TapContextPanel.tsx`) is a flat single-scroll of section components with no rhythm between them; spacing reads as inconsistent on a phone.

## Goals

1. The Today mobile list looks intentional and crafted — calmly differentiated by type and time, grouped by part-of-day.
2. The swipe gesture maps complete to right-to-left and edit to left-to-right, and runs at 60fps under the finger with no per-frame React reconciliation.
3. Quick Capture on mobile feels native (bottom sheet), not a centered modal.
4. The detail panel reads as one composed surface with clear section rhythm.
5. Zero new dependencies. All visual tokens come from `src/index.css`.

## Non-goals

- No information-architecture changes. Same fields, same sections, same actions.
- Desktop visuals are not in scope.
- No new entity types, no new pickers, no new keyboard shortcuts.
- Not a redesign of the bottom nav, mobile header, or domain switcher.

## Approach

Targeted polish pass — restrained, within the Editorial Calm system. Rebuild only the visual layer of these four surfaces and the swipe gesture's runtime; leave structure intact.

Two bolder approaches were considered and rejected:

- **Card redesign with a timeline spine** — bigger editorial cards, vertical rail connecting times. More distinctive but risks regressing dense-list scanning that already works, and is larger than this refinement warrants.
- **Swipe-only fix** — cheapest, but doesn't address the sparseness or polish gripes.

## Design — Today list card (mobile)

### Anatomy (proposed)

```
┌──────────────────────────────────────────────────────┐
│ 1:00  │┃ ╭───╮  Call Dr. Smith                    👤 │
│  PM   │┃ │ ✓ │  ● Health                              │
│       │┃ ╰───╯                                        │
└──────────────────────────────────────────────────────┘
  time    tile + title + context line              right
  column  (tinted, type-glyph)                     cluster
  w-10    w-9 tinted square                        chips
```

Composition (left→right):
1. **Time column, `w-10`** (was `w-12`). Tight stacked time. `text-[11px] font-medium text-neutral-500 tabular-nums`.
2. **Tinted type tile, `w-9 h-9`, `rounded-xl`.** Background = context tint at ~12% opacity; foreground = type glyph in context color at full strength. Falls back to `primary-500` when no context. This is the new element. It carries both *type* (task ✓ / routine ○ / event 📅) and *domain* (work blue / family amber / personal purple) in one calm shape, filling the previously empty left side.
3. **Title + context line.** Title: `text-[15px] font-semibold text-neutral-800 leading-tight line-clamp-2`. Context line: `text-[12px] text-neutral-500 mt-0.5 truncate`, prefixed by a 6px context/project dot when one exists. Same content as today; the type tile replaces the "you can't tell what this is" gap.
4. **Right cluster.** Project tag icon (when project) + assignee avatar — unchanged behavior; reduce horizontal gap from `gap-1.5` → `gap-1` to feel composed.

Card shell:
- `rounded-2xl` (was `xl`), `bg-bg-elevated`.
- `border border-neutral-200/70` (was `/50`) — slightly warmer hairline.
- Apply `shadow-card` (the design system's token; warm hairline + low lift). Selected state stays `ring-2 ring-primary-300` and gains `shadow-md`.
- Padding: `px-3 py-3` unchanged; internal `gap-3` unchanged.

Spacing between cards: `space-y-2` (was `space-y-1`) — minimal extra air for shadow to breathe.

### Type tile

New tiny component, e.g. `src/components/schedule/MobileTypeTile.tsx` (or inline in `ScheduleItem`'s mobile branch — finalize during planning):

- Task → `Check` glyph in 14px, or an empty rounded square (matches `TaskCheckbox` semantics).
- Routine → circular `Repeat` glyph.
- Event → calendar glyph (reuse `ScheduleItem`'s `CalendarIcon`, scaled to 14px).
- Tile color math: `backgroundColor: color-mix(in srgb, <ctx> 12%, transparent)`, foreground = `<ctx>` at full chroma. When `item.context` is null, use `primary-500`.
- Tapping the tile toggles complete (same target the current checkbox owns on desktop — no new affordance).

This is the chief visual win: it gives every row a colored anchor on the left, restores type legibility, and adds the domain color into the row without a noisy chip.

### Mobile section headers

Restore Morning / Afternoon / Evening grouping on mobile. The desktop `h3` (`TodayView.tsx:593`) is desktop-only and stays that way; add a sibling that is mobile-only:

```tsx
<h3 className="md:hidden flex items-baseline gap-2 px-1 mb-2 mt-1">
  <span className="font-display italic text-[15px] text-neutral-600">
    {meta.label}
  </span>
  {meta.range && (
    <span className="text-[11px] text-neutral-400 tabular-nums">
      {meta.range}
    </span>
  )}
</h3>
```

Warm, low-contrast, Instrument-Serif italic — matches Editorial Calm. No icon on mobile; the type tiles below carry color.

### Overdue (mobile)

`OverdueSection` is `hidden md:block` (`TodayView.tsx:547`) — out of scope for this pass. Overdue mobile handling is its own thread.

## Design — Swipe gesture

### Direction swap

In `ScheduleItemMobileCard` (`ScheduleItem.tsx:913`):

- `dx > 0` (left→right swipe, finger moves right) → **Edit** (was Complete).
- `dx < 0` (right→left swipe, finger moves left) → **Complete** (was Edit).
- Swap the reveal panels accordingly: the **emerald/Complete** panel reveals on the **right** behind the card (because the card moves left to expose it); the **sky/Edit** panel reveals on the **left**. The `Check` icon stays with Complete; the `Pencil` icon stays with Edit.
- Touch-end logic: `dx <= -swipeCommitPx → onCompleteSwipe`, `dx >= swipeCommitPx → onEditSwipe`. (`ScheduleItem.tsx:953`–`957`.)

### Smoothness

Cause: `setDx(clamped)` on every `touchmove` triggers a full re-render of the card subtree (including the dropdowns rendered inside it).

Fix — drive the visual during the drag from a ref, not state:

```ts
const cardEl = useRef<HTMLDivElement>(null)
const revealCompleteEl = useRef<HTMLDivElement>(null)
const revealEditEl = useRef<HTMLDivElement>(null)
const dxRef = useRef(0)
const rafPending = useRef(false)

function paint() {
  rafPending.current = false
  const dx = dxRef.current
  if (cardEl.current) cardEl.current.style.transform = `translateX(${dx}px)`
  const intensity = Math.min(1, Math.abs(dx) / swipeCommitPx)
  if (revealCompleteEl.current) {
    revealCompleteEl.current.style.opacity = dx < 0 ? String(intensity) : '0'
  }
  if (revealEditEl.current) {
    revealEditEl.current.style.opacity = dx > 0 ? String(intensity) : '0'
  }
}

function onTouchMove(e: TouchEvent) {
  // …existing decided.current logic stays the same…
  const ax = e.touches[0].clientX - startX.current
  dxRef.current = Math.max(-swipeMaxPx, Math.min(swipeMaxPx, ax))
  if (!rafPending.current) {
    rafPending.current = true
    requestAnimationFrame(paint)
  }
}
```

- No React state touched during the drag → no reconciliation, no child re-renders, no measurable jank from dropdowns.
- React state (`dragging`) is set only on touch-start and touch-end, to flip the CSS transition on release.
- On touch-end, read `dxRef.current`, commit the action if past threshold, then snap back: set `transform` to `translateX(0)` with the existing `transition: transform 200ms ease-out` already applied via the `dragging===false` class.
- `touchAction: 'pan-y'` stays — vertical page scroll still works.
- Resistance past `swipeMaxPx`: keep clamp; optionally add light rubber-banding past the max by halving the excess. Defer the rubber-band to planning if it adds risk.

The existing horizontal/vertical decision (`decided.current`) is correct; no change.

### Haptic affordance

When `Math.abs(dxRef.current)` first crosses `swipeCommitPx`, optionally call `navigator.vibrate?.(10)`. Behind a feature flag is overkill; just do it inline. iOS Safari ignores vibrate; Android Chrome gives a tick. No-op on unsupported platforms.

## Design — Quick Capture (mobile bottom sheet)

`QuickCapture.tsx:263`–`460` currently centers the modal regardless of viewport. Split the overlay container by viewport:

- **Mobile**: bottom sheet — full-bleed width, slides up from `translate-y-full` to `translate-y-0` over 220ms ease-out, rounded top corners (`rounded-t-3xl`), `bg-bg-elevated`, `shadow-xl`, `safe-bottom`, top drag-handle (`8 × 1.5 rounded-full bg-neutral-200`, centered, 12px from top).
- **Desktop**: unchanged — centered modal at `w-1/2 max-w-lg`.

Tailwind sketch:

```tsx
{/* Modal Overlay */}
<div className="fixed inset-0 z-50 bg-black/40 flex md:items-center md:justify-center items-end">
  <div
    className={`
      bg-bg-elevated shadow-xl
      w-full md:w-1/2 md:max-w-lg
      rounded-t-3xl md:rounded-2xl
      p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]
      transform transition-transform duration-200
      ${isClosing ? 'translate-y-full md:translate-y-0 md:opacity-0 md:scale-95'
                  : 'translate-y-0 md:opacity-100 md:scale-100'}
    `}
  >
    {/* drag handle, mobile only */}
    <div className="md:hidden mx-auto w-10 h-1.5 rounded-full bg-neutral-200 mb-3" aria-hidden />
    …existing form…
  </div>
</div>
```

Background swap (`bg-white` → `bg-bg-elevated`) makes the sheet feel like part of the same paper as the rest of the app.

Behavior unchanged: ⌘K / FAB to open, Escape / outside-tap to close, parse preview, dictation button, ⇧+Enter for raw. Tests in `QuickCapture.test.tsx` should keep passing; visual classes change but DOM structure is the same.

## Design — Detail panel polish

Scope: rhythm + container, not section internals. `TapContextPanel.tsx:94`–`172`.

- **Outer container** stays `bg-bg-elevated rounded-2xl p-5 max-w-md w-full` — but on mobile, the full-screen overlay in `AppShell.tsx:399`–`409` should let the panel breathe to the edges. Switch the panel's mobile padding to `px-4 py-3` (single source of `p-5` works fine on desktop floating panel but feels cramped against the viewport edges on mobile). Add `safe-top` padding so the title doesn't crash into the notch.
- **Section rhythm.** Each direct child of the `<article>` becomes a row in a single column. Add a hairline divider between sections via a wrapper: `divide-y divide-neutral-200/60` on the `<article>`, with each section's outer padding set to `py-4 first:pt-0 last:pb-0`. This is a one-line composition change; individual section components don't need touch-ups. (If a section already supplies its own divider, the planning step lists the override.)
- **Header.** `PanelHeader` keeps its current shape; ensure the close button is at least 44×44 hit-target on mobile (it likely is — verify in planning).
- **Footer.** `PanelFooter` (created/updated metadata) gets reduced contrast (`text-[11px] text-neutral-400`) and `pt-4` to read as auxiliary.

No section-internal changes ship in this pass. If something stands out during implementation (e.g., `PanelActions` chips would benefit from `shadow-card`), it's noted but deferred to a follow-up unless trivial.

## Files touched (expected)

- `src/components/schedule/ScheduleItem.tsx` — mobile JSX branch + `ScheduleItemMobileCard`
- `src/components/schedule/MobileTypeTile.tsx` *(new)* — or inlined; planning decides
- `src/components/schedule/TodayView.tsx` — mobile section header
- `src/components/layout/QuickCapture.tsx` — bottom-sheet variant
- `src/components/surface/TapContextPanel.tsx` — outer container + divider rhythm
- Tests: `ScheduleItem.test.tsx`, `QuickCapture.test.tsx`, `TapContextPanel.test.tsx` — keep green; add a swipe-direction test (Complete on left swipe, Edit on right swipe).

## Acceptance criteria

1. On mobile, every row in Today shows a tinted type tile (task / routine / event) colored by domain (work / family / personal).
2. On mobile, Today is grouped by Morning / Afternoon / Evening with a warm italic header.
3. Cards use `shadow-card` and the warmer border tone; visual rhythm is calm, not flat.
4. **Right-to-left swipe** commits Complete (emerald panel reveals on the right). **Left-to-right swipe** commits Edit (sky panel reveals on the left). Below the commit threshold, the card snaps back.
5. Holding a steady finger-drag, the card moves 1:1 with no visible stutter, no React reconciliation per move (DevTools profiler shows no card re-renders during the gesture).
6. Mobile Quick Capture rises from the bottom of the screen with a drag-handle, `bg-bg-elevated`, and respects the safe area. Desktop modal unchanged.
7. Detail panel sections are separated by warm hairlines; mobile padding doesn't crash into the notch.
8. `npm run build` clean. `npx vitest run` green. `npm run lint` green.
9. No new runtime dependencies.

## Open questions

1. **Mobile capture entry on Today.** `AppShell.tsx:389` hides the FAB on `isMobile && activeView === 'today'`. There must be an inline capture path on the Today screen — confirm during planning and ensure the new bottom-sheet still opens from it.
2. **Reduced motion.** Honor `prefers-reduced-motion` for the bottom-sheet slide-up (snap instead of slide). Add to planning checklist.
3. **Inbox section at bottom of Today.** Not explicitly in scope, but it lives in the same scroll. If it visibly diverges from the new card style after the pass, treat as a planning follow-up.
4. **`SwipeableCard.tsx`** (used only by `OverdueSection`, desktop-only on mobile) — leave alone. Not on mobile path today.
