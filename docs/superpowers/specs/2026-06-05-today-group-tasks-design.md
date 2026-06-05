# Today — "Group" selected tasks into a wrapper task

**Date:** 2026-06-05
**Branch / worktree:** `feat/today-group-tasks` (`.worktrees/today-group-tasks`)
**Status:** Design approved in brainstorming; spec for review.

## Problem / intent

On the Today view you can already multi-select tasks (hover check-circle → bottom
`BulkActionToolbar` with When / Send-to-list / Context / Assign). There's no way to
say "these three belong together." Scott wants to select e.g. *food shopping*,
*drop off library books*, *get car washed* and **group them into one item** —
"Sat AM errands" — that sits on Today with the three nested under it.

## Chosen model (from brainstorming)

- **A wrapper task with subtasks.** "Sat AM errands" becomes a real parent task;
  the selected tasks become its subtasks (reuses Symphony's existing
  `parentTaskId` / subtask system end-to-end).
- **You pick a time for the group.** The wrapper lands in that slot on Today; an
  all-day option covers the "just an errand run" case.
- **Children inherit the group's time.** Each grouped task takes the wrapper's
  `scheduledFor` + `isAllDay` so it lands in the same day-section and nests under
  the wrapper. (Consequence: children lose their individual times — accepted.)
- **Completion is unchanged** — whatever the app already does for parent/subtask
  completion. This feature does not alter that.

### Out of scope (v1)
Ungrouping (promote a subtask via the detail panel), nesting groups inside
groups, reordering within a group, grouping non-task items (events/routines).

## How the current code works (grounding)

- `src/components/schedule/ScheduleItem.tsx` — task rows already render a hover
  **check-circle** (`bulkSelectable` / `bulkSelected` / `onToggleBulkSelect`,
  `showBulkAffordance`).
- `src/components/schedule/TodayView.tsx` — owns `selectedTaskIds: Set<string>`
  and `handleBulkDefer/Schedule/SetContext/Assign`; renders `<BulkActionToolbar>`
  when `selectedTaskIds.size > 0` (≈ line 813).
- `src/components/schedule/BulkActionToolbar.tsx` — the shared bottom bar (also
  used by Inbox). Buttons: `SchedulePopover` (When), `ListPicker`, `ContextPicker`,
  `MultiAssigneeDropdown`, Cancel.
- `src/contexts/ScheduleActionsContext.tsx` — exposes `onUpdateTask`,
  `onCreateTask(title)`, `onAssignTaskAll`, etc. **No** create-with-options or
  reparent handler today.
- `src/hooks/useSupabaseTasks.ts` —
  `addTask(title, contactId?, projectId?, scheduledFor?, options?) → Promise<string|undefined>`;
  `AddTaskOptions` includes `isAllDay`, `parentTaskId`, `context`, `assignedTo`.
  `updateTask(id, Partial<Task>)` can set `parentTaskId`, `scheduledFor`, `isAllDay`.
- `src/lib/today/grouping.ts` — already nests subtasks (`isSubtask` +
  `parentTaskId === taskId`) **right after their parent within the same
  day-section**. → If wrapper and children share a day-section, nesting is
  automatic; **no change to grouping.ts needed.**

## Design

### 1. New context action — `onGroupTasks`
`src/contexts/ScheduleActionsContext.tsx`:
```ts
onGroupTasks?: (
  taskIds: string[],
  groupName: string,
  date: Date,
  isAllDay: boolean,
) => Promise<void>
```

`src/App.tsx` (in the `ScheduleActions` provider value, next to `onCreateTask`):
```ts
onGroupTasks: async (taskIds, groupName, date, isAllDay) => {
  // 1. Create the wrapper task, scheduled to the picked slot.
  const wrapperId = await addTask(groupName, undefined, undefined, date, {
    isAllDay,
    assignedTo: getCurrentUserMember()?.id,
    context: currentDomain !== 'universal' ? currentDomain : undefined,
  })
  if (!wrapperId) { showToast("Couldn't create group", 'warning'); return }
  // 2. Reparent each selected task under the wrapper, same slot so it nests.
  for (const id of taskIds) {
    await updateTask(id, { parentTaskId: wrapperId, scheduledFor: date, isAllDay })
  }
}
```
Notes:
- Mirrors the existing `onCreateTask` defaults (assignee = current user, domain
  context). Wrapper is a normal task — editable/deletable like any other.
- `addTask` already does an optimistic insert; `updateTask` is optimistic too, so
  the regroup reflects immediately.

### 2. `TodayView` — bulk handler + wiring
`src/components/schedule/TodayView.tsx`:
```ts
const handleBulkGroup = useCallback(
  async (name: string, date: Date, isAllDay: boolean) => {
    if (!onGroupTasks) return
    await onGroupTasks(Array.from(selectedTaskIds), name, date, isAllDay)
    clearBulkSelection()
  },
  [selectedTaskIds, onGroupTasks, clearBulkSelection],
)
```
Pass `onGroup={handleBulkGroup}` to `<BulkActionToolbar>` (destructure
`onGroupTasks` from context alongside the other `on*` handlers).

### 3. `BulkActionToolbar` — the "Group" button + name/when popover
`src/components/schedule/BulkActionToolbar.tsx`:
- New optional prop `onGroup?: (name: string, date: Date, isAllDay: boolean) => void`.
- Render a **Group** button (lucide `FolderPlus` or `Combine` icon — **no emoji**,
  per project rule) only when `onGroup` is provided. Place it first in the actions
  row (it's the primary new action; visible on both mobile and desktop).
- Clicking opens a small popover anchored to the button:
  - **Name input** (autofocus, placeholder "Name this group", e.g. "Sat AM
    errands"). Enter submits; Esc closes.
  - **When**: reuse `SchedulePopover` (already imported here) for the date/all-day
    choice. Default **Today, all-day**; user can pick a time. The "When" already in
    the bar is for *moving* tasks — the group popover keeps its own when so the two
    flows don't collide.
  - **Create group** button: disabled until name is non-empty. On click →
    `onGroup(name.trim(), date, isAllDay)`, then close popover. The parent
    (`TodayView`) clears the selection, which unmounts the toolbar.
- Popover state is local to `BulkActionToolbar` (`isGrouping`, `name`, `date`,
  `isAllDay`).

### Data flow
```
hover check-circle (ScheduleItem)
  → selectedTaskIds (TodayView)
  → BulkActionToolbar "Group" → name + when popover
  → onGroup(name, date, isAllDay)  [TodayView.handleBulkGroup]
  → onGroupTasks(ids, name, date, isAllDay)  [App.tsx]
      → addTask(name, …, date, {isAllDay,…}) → wrapperId
      → updateTask(id, {parentTaskId: wrapperId, scheduledFor: date, isAllDay}) ×N
  → clearBulkSelection()
  → realtime/optimistic state updates → grouping.ts nests children under wrapper
```

## Edge cases & decisions

- **Empty/whitespace name** → Create button disabled; no group created.
- **One task selected** → still allowed (creates a wrapper with one child); cheap,
  no special-casing.
- **A selected task is already a subtask** → `updateTask` reparents it to the new
  wrapper (moves it). Acceptable; v1 doesn't guard against it.
- **A selected task is itself a parent (has subtasks)** → it becomes a child of the
  wrapper; its own subtasks keep pointing at it (grandchildren). Rendering only
  nests one level after the parent within a section, so grandchildren may not
  visually nest under the moved parent. **v1: allow it but don't optimize**; note as
  a known limitation. (Realistically you group leaf errands, not parents.)
- **Cross-section children** → because every child inherits the wrapper's
  `scheduledFor`/`isAllDay`, they always share the wrapper's section. No orphan rows.
- **Undo** → not wired in v1 (the existing bulk actions don't push undo either).
  Out of scope; deleting the wrapper is the manual recovery.

## Testing

- `BulkActionToolbar.test.tsx` (extend/add):
  - Group button hidden when `onGroup` not provided; visible when it is.
  - Opening the popover, typing a name, Create disabled until name non-empty.
  - Create calls `onGroup` with `(trimmedName, date, isAllDay)`.
- `src/lib/today/groupTasks` (if any pure helper is extracted) — unit-test the
  id/payload shaping. (Likely the logic is thin enough to live inline in App.tsx;
  if so, cover via the App-level handler or skip.)
- Manual / e2e (no logged-in fixture today — see memory): select 2–3 Today tasks,
  Group → "Sat AM errands" at 9am → wrapper appears in Morning with the tasks
  nested; completing children behaves like normal subtasks.

## Files touched

| File | Change |
|---|---|
| `src/contexts/ScheduleActionsContext.tsx` | add `onGroupTasks?` to the value type |
| `src/App.tsx` | implement `onGroupTasks` in the provider value |
| `src/components/schedule/TodayView.tsx` | `handleBulkGroup`, destructure `onGroupTasks`, pass `onGroup` to toolbar |
| `src/components/schedule/BulkActionToolbar.tsx` | `onGroup` prop, Group button, name/when popover |
| `src/components/schedule/BulkActionToolbar.test.tsx` | tests for the Group affordance |

No DB migration (reuses `parent_task_id`). No change to `grouping.ts`.

## Risks

- **Low.** Reuses `addTask` + `updateTask` + existing subtask nesting. The only new
  surface is one button + a small local-state popover and one thin context handler.
- Sequential `await updateTask` per child means N requests; fine for the handful of
  tasks a person groups. All child updates are identical, so this could collapse to
  one `onUpdateTasksBulk(ids, {parentTaskId, scheduledFor, isAllDay})` call after the
  wrapper is created. Left as a per-task loop for clarity in v1; switch to the bulk
  helper if it ever feels slow.
