# Week Phase 4b — Polish + Workweek View

**Status:** Draft — pending user review
**Author:** Claude (with Scott)
**Date:** 2026-05-20
**Predecessor:** `2026-05-20-week-planning-view-design.md`

---

## Goal

Close the rough edges in the shipped Week view (`WeekViewV2`), add a 5-day Workweek view, surface the existing hide-routines toggle in the Week header, and free up grid width for hover-target week scrollers. One coordinated pass — eight polish items plus three structural additions.

## Why now

The grid is in daily use. The traps that remain (no week navigation if there's nothing to drag, period-character DragOverlay, silent calendar-event drag, mobile view dropping events/routines) erode trust in the surface. Workweek is a one-prop variant that makes the grid usable for Scott's Mon-Fri work focus without forking the component.

## Scope

### A. Polish — 8 items

1. **Edge-hover week scrollers** (replaces "header chevron" from prior recommendation)
   - Hover the leftmost or rightmost 24px of the grid → arrow chip fades in over the grid edge
   - Click → `setWeekStart(addDays(weekStart, ±dayCount))`
   - Keyboard accelerators: `[` previous, `]` next
   - Requires reclaiming horizontal space — right panel narrows from 420px to 380px (see item C below)
   - The existing 500ms drag-edge auto-advance behavior is unchanged

2. **DragOverlay = faded block**
   - Replace the period-character DragOverlay content with a 0.6-opacity copy of the dragged `WeekEventBlock`
   - Pointer-events: none, no shadow change, just opacity

3. **Visual outline during drag-to-create**
   - `useGridCreate` already tracks the drag rectangle — render it as a dashed `border-primary-500/40 bg-primary-500/5` overlay between `dragStart` and current pointer slot
   - Outline disappears the moment the popover opens (release)

4. **Undo toast on drag, resize, click-to-create**
   - Wire `pushAction` (already used in `HomeView`) through `useWeekDragDrop` and `useGridCreate`
   - Messages: "Moved to Wed 1 PM. Undo", "Created task at Wed 1 PM. Undo"
   - Undo for create = delete the just-created item
   - Resize undo is conditional on item 8 — skip until end_time is real

5. **Mobile WeekViewMobile adds events + routines**
   - Currently renders tasks only — extend to merge `timelineItem`s for all three types per day
   - Same ordering rule as Today: by `time_of_day || scheduled_for` time, then alphabetical
   - Tap behavior identical to existing task rows (`onSelectItem`)

6. **Routine slot pre-fill**
   - `SlotQuickCreatePopover` "Routine →" currently navigates to `/routines`
   - Change to: navigate to `/routines?prefill_time_of_day=HH:MM&prefill_day=<weekday>` and have `RoutinesListRedesign` open `RoutineForm` with those defaults
   - Recurrence pattern still defaults to "daily" — the user can change it in the form
   - This stays a navigation, not an inline modal — recurrence picking doesn't fit the popover

7. **Calendar event drag persistence**
   - Add `onUpdateEvent(eventId, updates: { start, end })` to `ScheduleActionsContext`
   - Implementation calls `useGoogleCalendar.moveEvent(eventId, newStart, newEnd)` (already exists per prior grep)
   - Pass through `HomeView` → `WeekViewV2` (replaces the current `() => {}` no-op)
   - On error: revert optimistic update + toast "Couldn't move event"

8. **Resize handles — hide for now**
   - `useBlockResize` stays in the codebase
   - `WeekEventBlock` conditionally renders the resize edges only when `import.meta.env.VITE_WEEK_RESIZE_ENABLED === 'true'` (off by default)
   - Comment in `WeekEventBlock.tsx` explaining: requires `tasks.end_time` column; revisit when schema lands
   - This is the simplest reversible cut — no code deleted, just gated

### B. Workweek view (NEW)

- `HomeViewSwitcher` adds a fourth option: `Day | Workweek | Week | Month`
  - `Workweek` value = `'workweek'` added to `HomeViewType`
- `WeekViewV2` takes a new `dayCount: 5 | 7` prop (default `7`)
  - When `5`: render Mon-Fri only; `weekStart` snaps to Monday on switch
  - `WeekGrid` already iterates `Array.from({ length: 7 })` — change to `Array.from({ length: dayCount })` with Monday-anchored start
- Hover scrollers step `±dayCount` days
- Persists in `HOME_VIEW_STORAGE_KEY` (existing localStorage key) — values become `'today' | 'workweek' | 'week' | 'month'`
- Mobile: Workweek collapses to the same `WeekViewMobile` (5 day-sections instead of 7) — no separate component

### C. Hide-routines toggle on Week header

- `WeekViewV2` header currently shows the week date range
- Add an icon button at the right of the header: `EyeOff` when hidden, `Eye` when visible
- Toggles `localStorage['symphony-hide-routines']` (the same key Today reads)
- Dispatches a `storage` event so the existing `useMemo` in `WeekViewV2` re-evaluates (it currently only reads on mount)
  - Or: lift the read into a `useState` + `useEffect` listener on the same key (cleaner, do this)
- Title attr: "Hide routines" / "Show routines"

### D. Right panel: 420px → 380px

- `AppShell.tsx` lines 258, 260, 433, 482, 555: all the `w-[420px]` and the `420px` literal in the focus-mode width calc
- Change to `w-[380px]` / `380px`
- Verifies the Today rail and detail/chat panels still fit their content — both already render fine at 380px in chat panel (line 448 uses `w-[380px]` for chat)

---

## Non-Goals

- `tasks.end_time` column work — deferred (gates item 8)
- Routine creation inline modal in popover — recurrence picker too complex
- Touch-based week scrolling on mobile — separate concern, mobile uses date arrows
- Calendar event resize persistence — events have `end` already, but out of scope for this pass to avoid widening
- Workweek-respecting "today" anchor on Sunday/Saturday — if user switches to Workweek on a weekend, weekStart snaps to the *upcoming* Monday

---

## Architecture changes

### New types

```ts
// src/types/homeView.ts
export type HomeViewType = 'today' | 'workweek' | 'week' | 'month'
```

### Component props

```ts
// WeekViewV2
interface Props {
  // ...existing
  dayCount?: 5 | 7  // default 7
}

// WeekGrid
interface Props {
  // ...existing
  dayCount: number  // 5 or 7
}
```

### Context additions

```ts
// ScheduleActionsContext
onUpdateEvent?: (eventId: string, updates: { start: Date; end: Date }) => Promise<void> | void
```

### File touch list (estimated)

| File | Change | Lines |
|------|--------|-------|
| `src/types/homeView.ts` | Add `'workweek'` | +1 |
| `src/components/home/HomeViewSwitcher.tsx` | Add Workweek option | +5 |
| `src/components/home/HomeView.tsx` | Branch `currentView === 'workweek'` → `WeekViewV2 dayCount={5}` | +15 |
| `src/components/home/week/WeekViewV2.tsx` | `dayCount` prop, header toggle, hover scrollers, edge keyboard, listener for hide-routines key | +60 |
| `src/components/home/week/WeekGrid.tsx` | Honor `dayCount`, Monday-anchored start when 5 | +10 |
| `src/components/home/week/WeekEventBlock.tsx` | Gate resize handles behind env flag, accept faded variant for DragOverlay | +10 |
| `src/components/home/week/useGridCreate.ts` | Expose drag-rect for outline render | +8 |
| `src/components/home/week/WeekViewMobile.tsx` | Add events + routines, accept `dayCount` | +30 |
| `src/components/home/week/SlotQuickCreatePopover.tsx` | Routine option → query-string nav with prefills | +5 |
| `src/components/routine/RoutinesListRedesign.tsx` | Read prefill query params, open form pre-filled | +20 |
| `src/contexts/ScheduleActionsContext.tsx` | Add `onUpdateEvent` field | +3 |
| `src/App.tsx` | Wire `onUpdateEvent` to `useGoogleCalendar.moveEvent` | +5 |
| `src/components/layout/AppShell.tsx` | 420 → 380 everywhere | +5 (edits) |
| `src/hooks/useWeekDragDrop.ts` | Call `pushAction` on success | +10 |

Total: ~200 LOC across 13 files. No schema changes.

---

## Test plan

### Unit (Vitest)

- `WeekGrid.test.tsx` — add case for `dayCount: 5` rendering Mon-Fri
- `HomeViewSwitcher.test.tsx` — add Workweek option
- `useGridCreate.test.ts` — verify drag-rect emitted during drag
- `WeekViewV2.test.tsx` (new) — hover-scroller renders, hide-routines toggle persists, keyboard `[`/`]` steps weeks
- `WeekViewMobile.test.tsx` — events + routines render per day
- `SlotQuickCreatePopover.test.tsx` — routine option produces query-string nav

### E2E (Playwright)

Skip — there's still no auth fixture (see `followup_e2e_auth_fixture` memory). Add one E2E once the fixture lands: switch to Workweek → drag block → undo toast → click undo → block returns.

### Manual

- Switch Day/Workweek/Week/Month in switcher — each renders correctly
- Hover left/right edge → arrow appears → click → grid steps
- `[` / `]` keyboard — same behavior
- Drag a block → faded overlay visible, no period char
- Drag-to-create on empty slot → outline grows
- Move a block → undo toast → click Undo → reverts
- Drag a calendar event → reschedules in Google Calendar (verify in Google Calendar UI)
- Toggle hide-routines in Week header → routines vanish; refresh → still hidden
- Mobile (DevTools) → events and routines visible per day
- Right panel: 380px wide, content not clipped

---

## Risk

- **`useGoogleCalendar.moveEvent` may not exist with that signature** — grep showed it does, but verify in implementation. If signature is `(eventId, { start, end })` vs `(eventId, start, end)`, adjust wiring.
- **Monday anchoring on Workweek** — if Scott has any code that assumes Sunday-anchored weeks, Workweek's Monday anchor may surprise. The `weekStart` state stays as-is; only the *render* shifts +1 day. Tasks/events query unchanged.
- **Storage event listener** — the native `'storage'` event does not fire in the same tab that wrote the value. Use a custom `window` event named `'symphony-hide-routines-changed'` dispatched on toggle, with both `WeekViewV2` and `TodayView` listening. (Cross-tab sync via native `'storage'` still works as a bonus.)

---

## Rollout

Single PR, single deploy. All items go together:
1. Branch `feat/week-phase-4b` off main
2. Implement in the order: Workweek prop → hover scrollers → DragOverlay/outline → undo → mobile parity → routine pre-fill → event drag persistence → hide resize → panel narrow → routines toggle in header
3. `npm run build && npx vitest --run` green
4. Push to main, Vercel deploys
5. Smoke-test manually before declaring done

Feature flag is **not** added — this is polish on an already-shipped surface. If something breaks, revert the commit.
