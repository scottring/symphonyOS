# Week / Planning View — Design

**Status:** Approved (2026-05-20).
**Author:** Claude (with Scott).
**Implementation phase:** Phase 4 (follows Phase 1 typography + Phase 2 right rail + Phase 3 meals revert + sidebar polish).
**Scope estimate:** 17–22 hours of focused implementation work.

## Goal

Make the Week mode of HomeView (accessed via the Day/Week/Month toggle on Today, AND via the restored "This Week" sidebar item) a genuine planning surface — a calendar grid you can drag, drop, and resize to compose your week, with editorial summary cards above and an unscheduled-this-week chip strip alongside.

## Non-goals

- Conflict resolution beyond visual overlap. No auto-shift, no "are you sure?" prompts, no smart scheduling.
- Touch/mobile drag. Mobile gets a degraded list view (no drag, no resize, no cross-week-edge interactions).
- Drag-to-create. Empty time slots aren't draw-targets. New items are still created via Quick Capture, inline insert points, or the chip strip's "+ Add" affordance (if added later).
- Cross-day-DST handling beyond what `Date` already gives us. Block positions are computed from `startTime`/`endTime` in local TZ; DST transitions land where the timestamps say.
- Multi-block drag. One block at a time.

## Architecture

```
HomeView (existing)
└─ when currentView === 'week':
   ├─ desktop (≥lg): <WeekViewV2>
   │                  ├─ <WeekSummaryRow>        (3 cards)
   │                  ├─ <UnscheduledChipStrip>  (drag source)
   │                  ├─ <WeekNavArrows>         (also auto-advance drop targets)
   │                  ├─ <WeekGrid>              (drop targets, 7 cols × hours)
   │                  │   └─ <WeekEventBlock>... (drag + resize + click)
   │                  └─ <UndoToast>             (after every drag)
   │
   └─ mobile (<lg):   <WeekViewMobile>
                      ├─ <WeekSummaryRow>        (stacked)
                      ├─ "Unscheduled this week" list
                      └─ Day-grouped event list
```

A single `DndContext` from `@dnd-kit/core` wraps the desktop variant. All drag and drop interactions go through it. Resize uses custom pointer events (dnd-kit lacks first-class resize support).

The existing `WeekView` component stays in the tree for one cycle as a fallback (gated by a feature flag, default off after this lands; remove in the cycle after).

## Component contracts

### `WeekViewV2.tsx`

The desktop orchestrator. Owns:

- `weekStart: Date` (Sunday of the displayed week). State here so the auto-advance handler can update it during a drag.
- `dndState: { activeId, overTarget }` — `useState` synced from `DndContext` callbacks.
- Computes the 7 day-column dates from `weekStart`.
- Filters incoming `tasks`/`events`/`routines` to the displayed week.
- Splits scheduled (has `startTime`) from unscheduled (week-scheduled but no specific time) — the latter feeds the chip strip.
- Renders the layout above; provides drag/resize/cross-week handlers down to children.

Props:
```typescript
interface WeekViewV2Props {
  tasks: Task[]
  events: CalendarEvent[]
  routines: Routine[]
  dateInstances: ActionableInstance[]
  weekStart: Date
  onWeekChange: (weekStart: Date) => void
  selectedAssignee?: string | null
  eventNotesMap?: EventNotesMap
  // detail-panel + edit callbacks identical to existing WeekView
  onSelectItem: (id: string | null) => void
  onUpdateTask?: (taskId: string, updates: Partial<Task>) => Promise<void>
  onUpdateEvent?: (eventId: string, updates: Partial<CalendarEvent>) => Promise<void>
  onUpdateRoutine?: (routineId: string, updates: Partial<Routine>) => Promise<void>
}
```

### `WeekViewMobile.tsx`

Read-mostly variant. Renders the 3 summary cards (stacked), then "Unscheduled this week" as a tap-to-open list, then events grouped by day in chronological order. No drag, no resize. Tap a row → opens the existing detail panel via `onSelectItem`.

Props: subset of `WeekViewV2Props` — same data, no drag callbacks.

### `WeekSummaryRow.tsx`

Three cards:

1. **Family dinner** — count of evenings with a planned dinner in the displayed week, plus stacked avatars of core family members. Data from `useMealPlan(weekStart)` + `useFamilyMembers`.
2. **Groceries** — `<N> items missing` from `useGroceryStatus(plan, recipes)`. Empty state: hide card (not "Pantry stocked"; the rail already says that).
3. **Prep ahead** — heuristic: if tomorrow's planned dinner has `prepMinutes > 30`, render `Prep <recipe name> tonight`. Otherwise hide the card. Specific to the recipe — avoids generic-AI-banter pitfall.

If all three hide, the row collapses (no visible space).

### `UnscheduledChipStrip.tsx`

Horizontal-scrollable strip showing tasks where:
- `scheduledFor` falls within the displayed week, AND
- `isAllDay === true` OR no explicit time set

Each chip is a `useDraggable` source. Drag a chip onto a grid time slot → handler updates the task to `isAllDay: false, scheduledFor: <new Date>`. On a successful drop, the chip slides out of the strip with a brief animation; on cancel, it returns to position.

Empty state: collapses to a slim "All scheduled tasks have a time" subtitle (no border, no chrome).

### `WeekNavArrows.tsx`

The prev/next-week arrows in the header. Two responsibilities:
1. Click → `onWeekChange(addWeeks(weekStart, ±1))`
2. During a drag, the right arrow becomes an auto-advance trigger zone (see "Cross-week" interaction below).

This component is the **mounting point for the edge hover detection**, even though the actual hot zone is implemented at the grid level. The arrows themselves stay clickable and don't act as drop targets (decision #9 picked auto-advance over drop-on-arrow).

### `WeekGrid.tsx`

The grid layout. Renders:
- Day-column headers (`SUN 18`, `MON 19`, ...)
- All-day events row (per-day, compact)
- Hourly rows from 8 AM to 9 PM (13 hours)
- 4 sub-slots per hour (15-min increments)
- Each sub-slot is a `useDroppable` target with id `slot:<dayISO>:<HH>:<MM>`

Positioned `<WeekEventBlock>` children render absolutely on top of the slot grid, with `top` and `height` computed from `startTime` / `endTime`.

### `WeekEventBlock.tsx`

The user-visible block. Combines:

- `useDraggable` — full-block drag (move to a different slot)
- Custom pointer-event resize handles at top edge (6px) and bottom edge (6px) — drag the handle to change `startTime` (top) or `endTime` (bottom)
- Click handler → `onSelectItem(item.id)`

Visual:
- Background color from `weekColorMap` (see Color taxonomy below)
- Title + time subtitle
- Optional small avatar (if `assignedTo`)
- Optional small flame/icon for streaks/coaching (existing concepts)

When `state === dragging`, the block follows the pointer (DragOverlay). When resizing, the block stays in place; only its height adjusts.

### `weekColorMap.ts`

Pure helper: `colorFor(item: TimelineItem): { bg, text, border }`. Taxonomy from the mockup:

| Item type | Color |
|---|---|
| Calendar event (meeting) | Purple — `hsl(271 60% 92%)` bg / `hsl(271 50% 30%)` text |
| Task with category 'event' / 'activity' | Same as calendar event |
| Task with category 'errand' / 'chore' | Cream — `hsl(38 60% 92%)` bg / `hsl(35 50% 35%)` text |
| Routine | Yellow — `hsl(45 75% 90%)` bg / `hsl(40 60% 30%)` text |
| Meal | Peach — `hsl(28 55% 90%)` bg / `hsl(14 45% 35%)` text |
| Plain task | Green — `hsl(142 30% 90%)` bg / `hsl(142 50% 25%)` text |
| Overdue (any type) | Same as base but `ring-1 ring-rose-300` |

Implementations should fail soft — unknown types fall back to plain-task green.

### `useWeekDragDrop.ts`

Wraps `DndContext` setup. Exposes:

```typescript
const { dndHandlers, activeBlock, autoAdvanceState } = useWeekDragDrop({
  weekStart,
  onWeekChange,
  tasks, events, routines,
  onUpdateTask, onUpdateEvent, onUpdateRoutine,
})
```

`dndHandlers` is the bag of `onDragStart` / `onDragOver` / `onDragEnd` / `onDragCancel` callbacks passed to `<DndContext>`.

Drag handling:
- `onDragStart`: stash the active item
- `onDragOver`: track which grid slot the pointer is over; check edge-hover for auto-advance
- `onDragEnd`: compute new `startTime` from drop target; call the relevant `onUpdate*` callback; emit undo toast
- `onDragCancel`: restore original state

Auto-advance:
- Internal timer (`setTimeout 500ms`) starts when pointer enters edge zone (rightmost or leftmost 40px of grid)
- If pointer leaves edge zone before timer fires, cancel
- If timer fires, `onWeekChange(addWeeks(weekStart, ±1))`; DragOverlay block stays in carry
- After the advance, 300ms cooldown before another can trigger (prevents rapid-fire skipping)

### `useBlockResize.ts`

Custom hook. Attaches `pointerdown` / `pointermove` / `pointerup` to a block's top and bottom edges (6px each). On `pointerdown`:
- Capture original `startTime` and `endTime`
- Set body cursor to `ns-resize`
- Disable `DndContext` drag for this block (`disabled: isResizing`) so the resize doesn't double-fire as a drag

During `pointermove`:
- Compute the new time from `pointerY` relative to the grid (snap to 15-min)
- Enforce min duration (15-min) — don't let the user collapse a block
- Update visual height in real time

On `pointerup`:
- Commit: call `onUpdateTask({ scheduledFor: newStart, ... })` or equivalent on the relevant entity type
- Emit undo toast
- Reset cursor

### `weekHighlights.ts`

Pure helpers for the 3 summary cards. Same pattern as `mealHighlights.ts` from the (reverted) Phase 3.

```typescript
export function familyDinnerSummary(plan, weekStart, members) → { nights: number, avatars: AvatarSummary[] }
export function groceriesSummary(plan, recipes) → { missingCount: number }
export function prepAheadSummary(plan, recipes, today) → { recipeName: string } | null
```

Each summary card consumes a single helper output. Helpers are unit-testable in isolation.

## Interactions (canonical table)

**Default duration on chip→grid drop:** 30 min. (Block lands at the dropped slot with `endTime = startTime + 30 min`. User can resize after.)

**Routines on the grid:** render-only for Phase 4. Visible and clickable (click → detail panel) but NOT draggable or resizable. Reason: routine duration / time-of-day is a recurring property, not a per-instance one; per-instance overrides need their own design and are deferred to a later phase.

| Action | Result | Persisted via |
|---|---|---|
| Drag a chip onto a grid time slot | `task.isAllDay = false, scheduledFor = <new Date>, endTime = <new Date + 30 min>` | `onUpdateTask` |
| Drag a grid block to a new slot (same day) | `startTime = <new>`, end shifts to preserve duration | type-specific `onUpdate*` |
| Drag a grid block to a different day | Same as above, `startTime` includes new day-of-week | type-specific `onUpdate*` |
| Drop on an occupied slot | Both blocks render side-by-side (50% width each) | (no special behavior) |
| Drag near right edge (>500ms) | View advances to next week; block stays in carry | `onWeekChange` |
| Drag near left edge (>500ms) | View advances to prev week; block stays in carry | `onWeekChange` |
| Drag bottom edge of a block | `endTime` adjusts (min duration: 15 min) | type-specific `onUpdate*` |
| Drag top edge of a block | `startTime` adjusts (min duration: 15 min) | type-specific `onUpdate*` |
| Click a block | Open detail panel (`onSelectItem(item.id)`) | (no persistence) |
| Cmd+Z after any drag/resize | Undo the change (restore previous state) | type-specific `onUpdate*` |
| Toast "Undo" button | Same as Cmd+Z | type-specific `onUpdate*` |

All persistence calls are async; UI updates optimistically.

## Data flow

```
HomeView (currentView === 'week')
  ↓ passes tasks/events/routines/plan/familyMembers as props
WeekViewV2
  ↓ filters to displayed week + splits scheduled/unscheduled
  ↓ provides DndContext + handlers
  ├─ WeekSummaryRow ← consumes plan + recipes + members via weekHighlights helpers
  ├─ UnscheduledChipStrip ← unscheduled-but-in-this-week task subset
  ├─ WeekGrid ← scheduled subset, positioned absolutely
  └─ WeekEventBlock (per item) ← single TimelineItem-shaped prop
```

Persistence is async and optimistic. Optimistic state in WeekViewV2 holds the in-progress drag/resize; on commit, the parent `onUpdate*` callback fires the Supabase mutation. On rollback (mutation fails), the in-progress state reverts and a sad-state toast appears: "Couldn't save — try again".

## Error handling & edge cases

- **Block partially below the hour-range floor (e.g. 6 AM start, 8 AM range start):** clip the visible part, render a small "↑" indicator at the top of the block linking to a "expand range to 6 AM" affordance (out of scope for Phase 4 — just clip with the indicator).
- **Block partially above the hour-range ceiling (e.g. 10 PM end, 9 PM range end):** symmetric to above.
- **Resize would create a 0-min block:** prevent. Min duration: 15 min (one slot).
- **Drag onto a slot outside the displayed week:** impossible (no slots exist outside the grid).
- **Mutation fails:** revert optimistic state, toast "Couldn't save — try again", do NOT lose the undo stack.
- **Routine drag attempt:** routines are not draggable in Phase 4. The block renders without a drag cursor on hover; pointer events for drag/resize are inert. Click still works → opens detail panel.
- **All-day event collides with a timed block:** all-day events render in their dedicated row; no collision in the time-slot grid.
- **DragOverlay during auto-advance:** the block ghost stays at the pointer during the week-transition; only the underlying grid swaps. dnd-kit handles this natively if the DragOverlay is rendered at the root.

## Testing approach

Per-file responsibilities:

- `weekColorMap.test.ts` — pure helper, table-driven tests (one per item type)
- `weekHighlights.test.ts` — pure helpers, one suite per summary (family dinner / groceries / prep ahead)
- `WeekSummaryRow.test.tsx` — renders count + avatars when data present; collapses when no data
- `UnscheduledChipStrip.test.tsx` — renders chips for unscheduled-this-week tasks; empty state
- `WeekGrid.test.tsx` — renders 7 day columns + 13 hours of slots; positions a block at correct top/height
- `WeekEventBlock.test.tsx` — renders title, calls onClick, resize handles invoke handlers
- `useWeekDragDrop.test.ts` — drag-end calls correct onUpdate; auto-advance fires after 500ms of edge hover
- `useBlockResize.test.ts` — pointermove updates duration; enforces min 15-min

No E2E in Phase 4 (the existing Playwright suite has no logged-in fixture per memory).

Drag-drop tests use `dnd-kit`'s test helpers (`createDragEvent`, sensor mocking). Auto-advance tests mock `setTimeout` via Vitest's fake timers.

## Out of scope (recap)

- Conflict resolution (auto-shift, prompts) — visual overlap only
- Touch / mobile drag — mobile = list view
- Drag-to-create blocks on empty slots
- Multi-block drag
- Resize past hour-range boundaries (clip with indicator instead)
- Cross-day-DST special handling

## Implementation order (suggested for the plan phase)

1. `weekColorMap` + `weekHighlights` helpers (pure, easy tests)
2. `WeekSummaryRow` (no drag dependencies)
3. `UnscheduledChipStrip` (drag source only — no drop yet)
4. `WeekGrid` static render (no drag yet)
5. `WeekEventBlock` static render (click + click-to-detail only)
6. Wire `DndContext` + chip-to-grid drop
7. Add grid-to-grid drag (move blocks)
8. Add resize handles
9. Add cross-week auto-advance
10. Wire `WeekViewMobile` (separate component, simpler)
11. Replace `WeekView` mount in `HomeView` with `WeekViewV2` (gated behind feature flag for one cycle)

This is the recommended sequence for the implementation plan but the plan-writing skill will pick its own task-level decomposition.
