# The Month Board — reorganizing `/month`'s shelf

**Date:** 2026-08-05
**Status:** Approved design, ready for planning
**Surface:** `/month` (`src/apps/tasks/horizons/MonthPage.tsx`)

## Problem

At 24 moves, `/month`'s shelf reads as a bag of chips rather than a plan.

The root cause is structural, not cosmetic: `PlanningShelf.tsx:379` renders
**group headers and loose task pills in the same `flex-wrap` container.** An
expandable group sits beside a bare task; its members indent below at `ml-5`;
then more headers; then a jumble of loose pills. Nothing shares a left edge, so
the eye has no column to run down.

Three consequences follow from that one decision:

1. **The pill is the wrong mark at this volume.** A pill's width is its text
   width, so 24 of them wrap into ragged rows with arbitrary gaps. Pills are
   right for the handful `/week` holds; they break at month scale.
2. **`monthGroups` is a partial partition.** It returns blocks for *some* tasks
   (pick-threaded always, project clusters at ≥3) and leaves the rest loose.
   That rule is defensible, but rendered in a single flow it reads as chaos.
3. **The decision surface is below the fold.** The month rung's one question is
   *"which week?"*, but the week strips sit under the wall. There is also a
   `+1 more` truncation, so the list is not even fully honest about its size.

## Non-goals

- Moving `/month`'s furniture. Month and week are the two **placement** rungs
  and share `PlanningShelf` above a grid; season is a **choosing** rung, and its
  two-column shape reflects a different job. Month stays shelf-above-grid.
- Changing `/week`. Its shelf holds ~8 items and wrap-flow serves it fine.
- Adding an overload nag for exceeding "10–15 is a good month". Tend already
  owns list hygiene; a second nag is not earned.
- Reworking Tend, the reference fold, the masthead, or the week strips.

## Design

### 1. Grouping becomes a total partition

`src/lib/planning/monthGroups.ts` — **every pool task lands in exactly one
block.** This is the change that makes a board possible at all: with no loose
remainder, there is nothing to interleave.

```ts
export interface MonthShelfGroup {
  id: string
  label: string
  kind: 'pick' | 'project' | 'unfiled'
  taskIds: string[]
}
```

- Existing rules are **unchanged**: pick-threaded members always group;
  project clusters group at `CLUSTER_THRESHOLD = 3`.
- Everything left over collects into one synthetic block:
  `{ id: 'unfiled', kind: 'unfiled', label: 'Unfiled' }`. A project cluster of
  2 still falls here — the threshold keeps its current meaning.
- **Order: member count descending, `unfiled` pinned last.** Threaded work
  leads; unfiled residue is what you should thread or cut.
- A one-member block keeps its own block. The label *is* the point — it names
  the season pick that move serves, and collapsing singletons into a shared
  "Threaded" block would demote that name to fine print and make the pick's
  work undraggable as a unit.
- Stays a pure function. The shelf renders whatever it returns.

### 2. `PlanningShelf` gets one layout knob

New prop `layout?: 'flow' | 'board'`, defaulting to `'flow'`.

**`/week` passes nothing and renders byte-identically to today.** `/month`
passes `layout="board"`.

Board mode:

- Blocks in `columns-1 sm:columns-2 lg:columns-3` with `break-inside-avoid`.
  CSS multi-column, deliberately **not** a grid — multi-column packs blocks of
  varying height tightly, where a grid leaves dead space under short blocks.
- Each block is a card: header row (drag handle · label · count) with members
  as pills beneath.
- **No chevron, no `openGroups` state, no `SHELF_COLLAPSED_COUNT` truncation,
  no "Show all"/"Show less".** All four exist to tame the wrap-flow and are not
  on this path. Every move is visible at all times — hiding moves behind a
  disclosure is what let 24 pile up unnoticed.
- The draft composer moves *inside* the Unfiled block (`+ Add a chunk…`). A
  newly captured chunk starts unfiled, which is true of it.
- Tend's proposal-card mode is untouched and takes precedence as it does now.

### 3. Block drag — additive MIME type

Placing 24 moves one at a time is the actual chore; dragging a block header
places the whole cluster in one gesture.

**Only `kind: 'pick'` and `kind: 'project'` headers are draggable.** The
Unfiled block is a residue, not a cluster — dragging it would place nine
unrelated moves into one week. Its header renders without a drag handle.

The protocol change is **purely additive — no existing drag source changes.**
A draggable block header writes `text/task-ids` (comma-joined ids). Every drop
target reads `text/task-ids` first and falls back to `text/task-id`:

| Drop target | Location |
|---|---|
| week row | `MonthCalendarGrid.tsx:213` |
| rail | `MonthCalendarGrid.tsx:156` |
| shelf (unschedule) | `PlanningShelf.tsx:239` |

Individual pills still drag alone via the untouched `text/task-id` path, so
`PlacementChip`, `/week`, and the guided wizard are unaffected.

The grid callback is renamed to a single plural form — one signature, one code
path, no dual-handler drift:

```ts
onPlaceTasksInWeek?: (ids: string[], weekStart: Date) => void
```

Call sites to update: `MonthPage.tsx:307` and
`PlaceOnWeeksStep.tsx:74` (which loops its existing single `updateTask`).

The write per member is unchanged from today:
`{ bucket: 'week', weekStart, scheduledFor: undefined, isAllDay: false }`.
Clearing `scheduledFor` is load-bearing — a `scheduled_for` alongside
`bucket: 'week'` would leave the item dated but absent from every day view.

### 4. One batched undo

`useUndo` is **single-slot**. N `updateTask` calls would push N undo actions
and silently orphan all but the last.

Placing a block therefore snapshots prior
`{ bucket, scheduledFor, weekStart, isAllDay }` for every member, pushes
**exactly one** `pushAction('Placed 3 moves', …)` that restores every snapshot,
then performs the writes. This mirrors the merge handler already at
`MonthPage.tsx:140–166` — same hazard, same established fix.

## Untouched

Week strips, reference fold, Tend, masthead, `/week`, the guided wizard's grid
behavior, and `text/task-id` for single drags.

## Testing

**`monthGroups.test.ts`**
- Partition totality: every pool id appears in exactly one block.
- Order: member count descending, `unfiled` last.
- A project cluster of 2 lands in `unfiled`; 3 earns its own block.
- A pick-threaded singleton keeps its own block.

**`MonthCalendarGrid.test.tsx`**
- A `text/task-ids` drop places every id in the dropped week.
- A `text/task-id` drop still places one (fallback intact).
- `readOnly` refuses both.
- Existing ~9 assertions migrate to the plural callback name.

**`PlanningShelf.test.tsx`**
- Board mode renders one block per group and zero loose pills.
- Board mode renders no chevron and no overflow control.
- The Unfiled block header carries no drag handle; pick/project headers do.
- Flow mode (`/week`'s default) is unchanged.

**Manual, in the browser.** Native HTML5 drags *can* be driven via CDP (unlike
dnd-kit, whose sensors never arm under synthetic events), so block drag on
`/month` is automation-verifiable. Still hand-check drag in the Mac shell —
`348842de` only just restored HTML5 drag pass-through there.
