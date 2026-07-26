# Stage 2b walkthrough — what was actually tried on :5173

**Date:** 2026-07-25 · **Branch:** `today-drag-gestures` · Dev server served from this worktree.

Type-checks are not inspection. This file records what was performed by hand, on
real data, and — just as importantly — **what was not**. A bullet nobody
performed is a fail, not a blank.

## Gate

| | |
|---|---|
| `npx tsc -b` | clean |
| `npx vitest run` | **406 files · 4016 passed · 3 skipped** (baseline 3939 → +77) |
| `npm run build` | clean (`✓ built in 5.61s`) |
| `npm run lint` | **8 errors, 290 warnings** — errors unchanged from the 8-error baseline |
| `TodayView.tsx` | **1185 → 996 lines** (the spec forbids it growing) |

## Verified by hand

| Gesture | Result |
|---|---|
| Group two cards → wrapper renders **without a refresh** | PASS (Task 1 gate; wrapper + both children, `0/2` progress) |
| …and survives a reload | PASS |
| Delete group → wrapper and children both go | PASS, no orphans |
| Pick up a card | PASS — overlay follows the cursor, source row dims to 40% |
| Empty bands materialise mid-drag | PASS — **Early morning** and **Night** appear, absent at rest |
| All seven bands outline while dragging | PASS (7 dashed outlines counted in the DOM) |
| Gap shows an insertion line | PASS |
| **Tap** a row still opens the detail panel | PASS (`?detail=task:…`) — the 5px/250ms sensor constraint holds |
| Drag a card into an All Day **gap** → reorders | PASS |
| …and the order **survives a reload** | PASS |
| A second reorder moves **only** the dragged row | PASS (single write; nothing else shifted) |
| Drag a card onto a **band** → takes that band's time | PASS — dropped on Night, landed at **9:00 PM** = `computeBandDropTime('night', [], …)` |
| Drop onto a **row** → creates a group | PASS (this is how the group-date defect was found) |
| **Time-block** control opens the hour grid | PASS — `PlanningSession` `placementGrain='time'`, previously unreachable |

## Defects found by doing this, not by tests

1. **dnd-kit's `attributes` nested a button inside a button.** It sets
   `role="button"`, and `ScheduleItem` already is one. Broke `getByRole` and
   would read as two controls to a screen reader. Dropped (`attributes` exists
   for the `KeyboardSensor`, which is not configured). Guarded by a test.
2. **A band materialised mid-drag claimed "· up next".** `emptyBecauseHero` was
   true for *any* empty section, so an empty band said its item had been lifted
   into the hero. Now requires the section to have had items.
3. **Group intents stamped the wall clock.** `viewedDate` is a live `new Date()`.
   `create-group`/`add-to-group` passed it straight through as the group's date,
   so a drop stamped the group and every member with the instant it happened —
   it retimed a real 7:00 PM commitment to 9:09 PM. Groups now inherit the
   **target's** moment. **This one mutated production data** (see below).
4. **`untimedOrder` excluded completed tasks**, so the "full untimed set" wasn't
   full: a renormalise gave `0…n` to incomplete rows and left completed ones
   `null`, sinking every one to the bottom of All Day. Same shape as Stage 2a
   residual 3, one layer up.
5. **`updateTaskOrders` only handled a resolved `{ error }`.** A *rejected*
   query escaped with the optimistic order still applied. (Stage 2a residual 2 —
   fixed with a mock seam that fails against the old code.)

## Live-data incident, and the repair

Defect 3 was found the hard way: a test drop landed on Scott's real task
**"Invite Guy + Jess over for pizza - talk about the block potluck"**. It
created a duplicate wrapper (`bfb7f2ba…`), reparented the real task under it,
and retimed both to 9:09 PM.

Repaired the same session, verified on screen:
- real task `b0818655…` → `parent_task_id: null`, `scheduled_for` back to
  `2026-07-25T23:00:00Z` (**7:00 PM EDT**), `is_all_day: false`
- duplicate wrapper `bfb7f2ba…` deleted
- every `zz*` throwaway task deleted (`title=like.zz*` → 0 remaining)

Today now reads exactly as before: All Day **4 · 3 done**, Evening
**7:00 PM Invite Guy + Jess**, "7 of 43 done".

**Lesson for the next session:** walkthroughs on this app run against
**production data**. Create throwaway rows and drag *those* — and never aim a
drop at a real row, because `pointerWithin` prefers the innermost droppable and
a band drop can land on whatever row is under the cursor.

## NOT verified — open, and honestly so

- **Drop onto All day to clear a time.** Blocked: after the band drop the item
  became the Up Next hero, and the hero is not a drag source (below). Covered by
  unit tests only.
- **A read-only calendar event refusing the drag.** No `reader`-role event was
  on the day. `useCalendarPermissions` + `refusalFor` are unit-tested; the
  end-to-end refusal is unseen.
- **Meal / routine-collection / dosed-routine refusals.** Unit-tested only.
- **Routine one-day override.** The wiring is `onPushRoutine` → `reschedule()` →
  `status:'pending' + deferred_to`, which `grouping.ts:93` already reads back.
  Verified by reading and by the grain test — **not** by dragging a routine,
  deliberately: it would have mutated a real routine and needed another repair.
- **Collapsed-group hover auto-expand**, and **dragging a card out of a group**.
- **Mobile / touch.** Nothing here was exercised on a touch device, and Today is
  the mobile-primary surface.

## Follow-ups worth a decision

1. **The Up Next hero is not draggable.** The hero lifts its item out of its
   section, and only section rows are drag sources — so the single most
   prominent item on the page is the one you cannot drag. Either make the hero a
   drag source or accept it deliberately.
2. **A band is only droppable where no row covers it.** `pointerWithin` prefers
   the innermost droppable, so "drop on the band" in practice means its header
   strip or its empty space. That is arguably right (empty space = the band, a
   row = group with it) but it is undocumented in the spec and easy to
   experience as "the band drop doesn't work".
3. **Auto-naming a group after the target card** is still a guess. It reads fine
   for "errands"-shaped targets and poorly for a long sentence — the group
   created during this walkthrough was named
   "Invite Guy + Jess over for pizza - talk about the block potluck".
