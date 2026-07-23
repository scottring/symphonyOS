# Week Grid Click-to-Create — Design

**Date:** 2026-07-23. **Requested by Scott:** "need to be able to click inside weekly planning grid to create a new item."

## Behavior

Clicking an **empty hour slot** in the `/week` planning grid opens a small quick-create popover anchored at that slot: a title input; **Enter** creates a task scheduled at that day + slot time; **Escape** (or clicking elsewhere) cancels. The new task appears as a placed card (default 30-min render height — no duration write; `estimatedDuration` isn't part of `AddTaskOptions`).

- Creation is one atomic `addTask(title, undefined, undefined, scheduledFor, { isAllDay: false, assignedTo: <current member>, context: <domain if not universal> })` — passing `scheduledFor` makes `useSupabaseTasks` derive `bucket: 'timed'` on the INSERT (`useSupabaseTasks.ts:410`), satisfying the never-create-then-setBucket rule and the timed-bucket invariant.
- `scheduledFor` is built with LOCAL date parts (`new Date(y, m, d, hour, minute)`), same as the slot drag-drop branch (`PlanningSession.tsx` slot handler).
- **Past-day refusal:** clicking a slot on a day before `minDropDate` shows the existing `dropNotice` toast (same copy pattern as drag refusal) and does not open the popover.
- **Drag coexistence:** the click handler is suppressed while a dnd-kit drag is active (`activeId != null`). dnd-kit's 5px `MouseSensor` activation constraint already keeps genuine clicks from starting drags.
- Clicking a **placed card** keeps its current raise-to-front behavior — cards are absolutely-positioned siblings of the slots, so no bubbling conflict.
- The **all-day lane** is out of scope (drag remains its only input).

## Architecture

- `PlanningTimeSlot` gains `onSlotClick?: () => void` — fires on click of the empty slot div.
- Threaded `PlanningSession` → `PlanningGrid` → `PlanningColumn` → `PlanningTimeSlot` as `onSlotClick(dateKey, hour, minute, anchorEl)`.
- `PlanningSession` owns: new optional prop `onCreateTaskAt?: (title: string, scheduledFor: Date) => void | Promise<void>`, the quick-create popover state `{ dateKey, hour, minute }`, the minDropDate check (reusing `dropNotice`), and renders the popover (small `.card` box positioned near the slot, autofocused input). If `onCreateTaskAt` is not provided, slots behave exactly as before (no-op) — the wizard drawer (`StepSchedule`) and any other mount site are unaffected until wired.
- `WeekPage` passes `onCreateTaskAt` wired to `addTask` (it already destructures `addTask` from `useHorizonPageData`), mirroring the option stamping in `shared.tsx`'s `onCreateTaskFromValue` (assignedTo current member, context when domain ≠ universal).

## Tests (`PlanningSession.test.tsx`)

1. Clicking an empty slot opens the quick-create input.
2. Typing a title + Enter calls `onCreateTaskAt` with the exact local `Date` for that slot, and closes the popover.
3. Escape closes without creating.
4. Clicking a slot on a day before `minDropDate` shows the refusal notice and no popover.
5. Without `onCreateTaskAt`, clicking a slot does nothing (no popover).

## Non-goals

All-day lane click-create; drag-span duration selection; wiring the wizard drawer or home grids; end times/durations.
