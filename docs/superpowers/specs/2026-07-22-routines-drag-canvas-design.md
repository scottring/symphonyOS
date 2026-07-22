# Routines: The Draggable Day Canvas

**Date:** 2026-07-22
**Status:** Approved by Scott via visual companion ("Blocks on the line" base
merged with "edit-on-expand" restraint; "ship-it" clicked on the full-page v2
mockup). Mockups persisted at `.superpowers/brainstorm/33871-1784720669/content/`.

## Problem

The calm consolidation made the page read-only, which missed the real want:
Scott needs to *rearrange* the day directly — move steps between routines,
move routines in time, change what day of the week something happens — with
drag and drop on the same time-canvas he looks at. Curation through a drawer
of forms is indirection; the rearranging should BE the interface.

## Goal

/routines is a **draggable day canvas**: a horizontal day timeline of routine
blocks (steps visible inside), a horizontal week band below, and drag as the
primary verb. Tap still opens panels. The mockup at
`day-canvas-v2.html` is the source of truth for look/feel.

## Drag mechanism

Native HTML5 drag-and-drop, exactly the pattern proven in
`src/components/planning/horizon/MonthCalendarGrid.tsx` (`draggable`,
`dataTransfer.setData(key, value)`, `onDragOver` with `preventDefault` +
hover state, `onDrop` with `getData`). No new library. Touch drag is out of
scope this cycle (same limitation the Month/Year grids already accept; the
iOS app is a separate surface).

### Payload keys (module `src/components/routine/rhythm/dragTypes.ts`)

- `text/rhythm-step` — a child routine id (has `parent_routine_id`)
- `text/rhythm-routine` — a loose top-level routine id (cluster member,
  single, anytime pill, or week chip)
- `text/rhythm-collection` — a collection's routine id (block-header drag)
- `text/rhythm-group` — JSON array of member ids (auto-group header drag)
- `text/rhythm-from-day` — set alongside a chip drag from a week column:
  the source `DayKey` (used to move one day of a multi-day routine)

The module exports typed helpers: `setDragPayload(e, payload)`,
`readDragPayload(e): DragPayload | null` where

```typescript
export type DragPayload =
  | { kind: 'step'; id: string }
  | { kind: 'routine'; id: string; fromDay?: DayKey }
  | { kind: 'collection'; id: string }
  | { kind: 'group'; ids: string[] }
```

plus `timeFromAxisX(clientX: number, rect: DOMRect): string` mapping an x
position on the axis to `'HH:MM'`, linear over ARC_START=6:00 → ARC_END=21:30,
clamped, rounded to the nearest 5 minutes. ARC_START/ARC_END move from
DailyArc into this module (DailyArc imports them back).

### Drop rules (module `src/components/routine/rhythm/dropRules.ts`)

Pure function `resolveDrop(payload: DragPayload, target: DropTarget): DropIntent | null`
with

```typescript
export type DropTarget =
  | { kind: 'collection-block'; collectionId: string }
  | { kind: 'axis'; time: string }               // 'HH:MM' already resolved
  | { kind: 'week-day'; day: DayKey }

export type DropIntent =
  | { type: 'add-steps'; collectionId: string; ids: string[] }         // reparent/fold
  | { type: 'stand-alone-at'; id: string; time: string }               // step promoted to standalone daily at time
  | { type: 'retime'; id: string; time: string }                        // top-level routine: set time (daily)
  | { type: 'shift-group'; ids: string[]; time: string }                // move whole auto-group, preserve offsets
  | { type: 'weekly-on'; ids: string[]; day: DayKey }                   // set weekly on one day (time preserved)
  | { type: 'move-day'; id: string; fromDay: DayKey; toDay: DayKey }    // multi-day weekly: replace one day
```

Resolution table (anything not listed → `null`, drop is a no-op):

| payload \ target | collection-block | axis | week-day |
|---|---|---|---|
| step | add-steps [id] (skip if already its parent) | stand-alone-at | weekly-on [id] (executor promotes first) |
| routine | add-steps [id] (skip if id === collectionId) | retime | `move-day` when `fromDay` present and the routine's days will still be derived by executor; otherwise `weekly-on` |
| collection | null (no nested collections) | retime | weekly-on [id] |
| group | add-steps ids | shift-group | weekly-on ids |

Notes:
- `retime` semantics: `{ time_of_day: time, recurrence_pattern: { type: 'daily' } }`
  ONLY when the routine is not already daily-zoned; if it is already daily
  (`type daily`, or weekly with 5+ days), keep its recurrence and set only
  `time_of_day`. The executor decides using the routine's current pattern;
  the intent just carries id + time.
- `move-day`: new `days = old days minus fromDay plus toDay` (dedup, keep
  order sorted by DAY_ORDER). If the routine had no explicit days (derived
  from start_date), fall back to `weekly-on`.
- `weekly-on` for a step id means: promote (parent null, step_order null)
  AND set `{ type: 'weekly', days: [day] }`.
- Drops that resolve to writing the current state (dropping a chip on its
  own day, a step on its own parent) return null.

`dropRules.ts` is pure and fully unit-tested (every table cell + the null
cases).

### Intent executor (RhythmPage)

`executeDropIntent(intent)` in RhythmPage maps intents onto the EXISTING
handler props — no new RoutinesApp handlers:

- `add-steps` → `onAddToCollection(collectionId, ids)`
- `stand-alone-at` → `onPromoteStep(id)` then `onUpdateRoutine(id, { time_of_day, recurrence_pattern: { type: 'daily' } })`
- `retime` → `onUpdateRoutine(id, { time_of_day[, recurrence_pattern daily when converting] })`
- `shift-group` → compute delta = time − earliest member's time; one
  `onUpdateRoutine(memberId, { time_of_day: member time + delta })` per member
- `weekly-on` → per id: (promote first if it's a step) then
  `onUpdateRoutine(id, { recurrence_pattern: { type: 'weekly', days: [day] } })`
- `move-day` → `onUpdateRoutine(id, { recurrence_pattern: { ...old, days: newDays } })`

## The canvas (DailyArc changes)

Keeps everything from the calm build (ruler, staggered blocks, true-time
dots, NOW, anytime row, dimming). Adds:

- **Step pills are draggable** (`text/rhythm-step` for collection steps,
  `text/rhythm-routine` for cluster members/singles). A grip glyph
  (lucide `GripVertical`, size 12, `text-neutral-300`) appears at the left
  of each pill; the whole pill is the drag handle. Click still opens the
  panel (native dnd only activates on actual drag).
- **Block headers are draggable**: collection title sets
  `text/rhythm-collection`; auto-group title sets `text/rhythm-group` with
  member ids. Cursor `grab` + grip glyph before the title.
- **Collection blocks are drop targets** (`collection-block`): highlight
  ring (`ring-2 ring-amber-400`) + a dashed "add as step" placeholder row
  while a compatible payload hovers.
- **The axis is a drop target** (`axis`): on dragover show a vertical
  amber caret line at the pointer x with a floating `'HH:MM'` label
  (positioned via the same pct math); on drop resolve
  `timeFromAxisX` → intent.
- **Auto-group collapse rule** stays as shipped: collections render "· N
  steps ▸" summary rows inside blocks only when the collection appears as a
  pill (cluster member); collection BLOCKS list their steps as pills.
  Blocks with more than 6 pills collapse to the first 5 + "· N more ▸"
  (tap block title → panel, as today).
- **Anytime pills draggable** (`text/rhythm-routine`) — dropping on the
  axis gives them a time; the anytime row is NOT a drop target this cycle.
- **Auto-group naming moves on-canvas**: tapping an auto-group title opens
  a small inline popover (absolutely positioned under the title): name
  input (placeholder "Name this rhythm"), the fold-target suggestion list
  (same filter logic as the drawer had: case-insensitive contains, max 4,
  exact match folds instead of creating), Escape/blur closes. New tiny
  component `src/components/routine/rhythm/GroupNamePopover.tsx` receiving
  `{ card, foldTargets, onName(card,name), onFoldInto(targetId, ids), onClose }`.

## The week band (WeekStrip changes)

- **Chips draggable**: `text/rhythm-routine` + `text/rhythm-from-day` set to
  the chip's column day.
- **Day columns are drop targets** (`week-day`): highlight
  (`border-dashed border-amber-400 bg-amber-50/40`) on dragover of a
  compatible payload; drop resolves per the table.
- The strip renders even when a week is empty IF a drag is in progress
  (so a daily routine can be dragged into a week day) — implemented by
  keeping the existing early-return but treating "drag in progress"
  (a `dragActive` prop set by RhythmPage via onDragStart/End bubbling)
  as non-empty. Simplification allowed: always render the band when
  `onDropIntent` is provided.
- Chevron step-expansion, avatars, today/full markers, sometime pocket all
  unchanged. "Sometime this week" pocket is NOT a drop target this cycle.

## Tend drawer shrink

The canvas now owns grouping and placement, so the drawer keeps only what
the canvas can't do:

- REMOVE the "Name your rhythms" section (GroupRow) and the "On their own"
  loose-items section from `TendDrawer.tsx` (naming lives in
  GroupNamePopover; membership lives in drag + the panel's Move-into).
- KEEP the suggestions TendCard and the SeasonalShelf sleepers.
- Badge = `findings.length` only. `groupSuggestionKey` and its dismissal
  keys become unused by the page — remove the function from
  `tendHeuristics.ts` and RhythmPage's `activeClusters` badge math (the
  `g:` keys already stored in localStorage are harmlessly ignored).
- Drawer props shrink accordingly (drop `clusters`, `looseItems`,
  `foldTargets`, `onNameGroup`, `onFoldInto`; keep the rest). Empty state
  text unchanged.

## What does NOT change

- `rhythmModel.ts` bucketing (blocks = model cards, as shipped).
- Panels (TapRoutinePanel Move-into, TapStepPanel Promote) — they remain
  the precise/keyboard path for the same operations.
- Masthead (search, person pills, Tend button, Build with AI, New routine),
  type-anywhere search and its guards.
- RoutinesApp handler surface (`onAddToCollection`, `onGroupIntoCollection`,
  `onPromoteStep`, `onUpdateRoutine`, …) — the canvas composes them.

## Tests

- `dragTypes.test.ts`: payload round-trip through a mock DataTransfer;
  `timeFromAxisX` mapping (left edge → 06:00, right edge → 21:30, middle,
  5-minute rounding, clamping).
- `dropRules.test.ts`: every resolution-table cell, every null case
  (self-drop, step onto own parent, chip onto own day).
- `DailyArc.test.tsx`: pills carry draggable + payload on dragStart (assert
  via a stubbed DataTransfer); collection block drop fires `onDropIntent`
  with `add-steps`; axis drop fires with resolved time (mock
  getBoundingClientRect); group-title tap opens GroupNamePopover; naming
  and folding call through.
- `WeekStrip.test.tsx`: chip dragStart sets routine + from-day payloads;
  day-column drop fires `weekly-on` / `move-day` intents.
- `RhythmPage.test.tsx`: executor wiring — a simulated `add-steps` intent
  calls `onAddToCollection`; a `stand-alone-at` intent calls
  `onPromoteStep` + `onUpdateRoutine`; badge = findings only; drawer no
  longer shows group/loose sections.
- `TendDrawer.test.tsx`: updated for the shrink.
- Full suite green before push.

## Out of scope

- Touch/pointer drag (desktop mouse only, like the Month/Year grids).
- Dragging events/tasks onto the routines canvas; sometime-pocket and
  anytime-row as drop targets; drag-reordering steps *within* a block
  (panel reorder exists).
- Any change to Today, the Wall, or the iOS app.
- The guided routines setup wizard (agreed separate next cycle).
