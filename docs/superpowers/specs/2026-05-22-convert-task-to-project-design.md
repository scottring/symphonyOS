# Convert Task to Project — Design

**Date:** 2026-05-22
**Status:** Approved (pending spec review)

## Problem

A task sometimes turns out to be bigger than a task — it needs sub-steps,
context, and a home of its own. Today there's no way to promote a regular task
into a project; you'd recreate it by hand and lose its notes, links, and
subtasks. Calendar events already have a "promote to project" affordance
(`PromoteToProjectButton.tsx`); tasks should get the equivalent.

## Model: the task "expands" into a project

When a task is converted:

- `title → project.name`
- `notes`, `links`, `phoneNumber`, `context` copy onto the new project
- Each **subtask is re-parented into the project**: its `parentTaskId` is
  cleared and its `projectId` is set to the new project. Subtasks become the
  project's tasks.
- The original parent task is **deleted**.
- A task with **no subtasks** yields an empty project shell — this is the
  primary use case (you promote precisely because you want to break the task
  down).

### Why expand rather than keep-and-relink

Events stay and gain a `projectId` because an event is a fixed point in time you
still want on the calendar. A task is not. Relinking a task would leave a
project (e.g. "Plan Q3 launch") *containing a task of the same name* — a
redundant row visible every time you open the project. Expanding avoids that:
the parent dissolves into the project name and only its subtasks remain as work.

## Trigger: hover folder icon on the Today task row

Mirror the existing event affordance exactly:

- A `FolderPlus` icon, hover-revealed via `opacity-0 group-hover:opacity-100`,
  on the task row in Today view — same styling as
  `PromoteToProjectButton.tsx:53-64`.
- If the task is **already linked to a project** (`task.projectId` set), show
  `FolderOpen` instead, which opens that project — identical to the event
  behavior. Task and event row affordances become visually consistent.

## Flow: confirmation modal (matches events)

Clicking opens the same lightweight modal events use:

- Editable **name** prefilled from `task.title` (promoting often wants a rename,
  e.g. "Buy paint" → "Paint the house")
- **Domain** pills (work / family / personal), prefilled from `task.context`
- **Notes** textarea prefilled from `task.notes`

Confirm runs the conversion; Cancel/Escape/outside-click closes. `links` and
`phoneNumber` carry over silently (not surfaced in the modal).

## Architecture: one orchestrating action

Rather than have the button juggle create → re-parent → delete, add a single
action to `ScheduleActionsContext`:

```ts
onConvertTaskToProject?: (
  taskId: string,
  details: { name: string; notes?: string; context?: TaskContext }
) => Promise<Project | null>
```

Implemented in `App.tsx`, where the full `tasks` array, `addProject`,
`updateTask`, and `deleteTask` are all in scope. It runs the whole transaction
in one place; the button and modal stay dumb. Sequence:

1. `addProject({ name, notes, context, links, phoneNumber })` → `newProject`
   (bail if null).
2. For each subtask of the source task:
   `updateTask(subtask.id, { projectId: newProject.id, parentTaskId: undefined })`
   (the `'parentTaskId' in updates` branch at `useSupabaseTasks.ts:721` writes
   `parent_task_id = null`).
3. `deleteTask(taskId)` for the now-childless parent.
4. Return `newProject` (callers may open it / show confirmation).

### Widen `onAddProject`

`ScheduleActionsContext`'s `onAddProject` type is currently narrowed to
`{ name; notes?; context? }`. The underlying `addProject`
(`useProjects.ts:77`) already accepts `links` and `phoneNumber`. Widen the
context type to include `links?: TaskLink[]` and `phoneNumber?: string` so the
orchestrator can copy them. No runtime change to `addProject` itself.

## Components touched

| File | Change |
|------|--------|
| `src/components/schedule/PromoteTaskToProjectButton.tsx` | **New.** Mirrors `PromoteToProjectButton` for tasks; renders `FolderPlus`/`FolderOpen`, opens the modal, calls `onConvertTaskToProject`. |
| `src/components/schedule/ScheduleItem.tsx` | Render the new button for `isTask` rows (alongside the event one near line 649). |
| `src/contexts/ScheduleActionsContext.tsx` | Add `onConvertTaskToProject`; widen `onAddProject` to include `links`/`phoneNumber`. |
| `src/App.tsx` | Implement `onConvertTaskToProject` and pass it into the context value (near the existing `onAddProject: addProject` wiring, ~line 1360). |

## Edge cases

- **Task already linked to a project:** no convert offered — show `FolderOpen`
  → open existing project (matches events).
- **Empty name on submit:** disabled submit button (same guard the event modal
  uses).
- **Optimistic state on re-parent:** clearing a subtask's `parentTaskId` may not
  be perfectly reflected in the optimistic in-memory tree, but the DB writes are
  correct and the next fetch reconciles. Acceptable; covered by deleting the
  parent immediately after.
- **Completed task:** conversion still allowed; the project starts
  `not_started` regardless (project status is independent of the source task).

## Testing

Unit-test the `onConvertTaskToProject` orchestrator:

1. **Task with subtasks** → project created with correct name/notes/context;
   each subtask gets `projectId = newProject.id` and `parentTaskId = null`;
   parent task deleted.
2. **Task without subtasks** → empty project created; parent deleted; no stray
   updates.
3. **Context carry-over** → `links`, `phoneNumber`, `notes`, `context` copied
   onto the project.
4. **addProject returns null** → no subtask updates, no delete (transaction
   bails safely).

## Out of scope (YAGNI)

- Undo toast for conversion (the modal is the confirmation point).
- Converting from the live tap panel / desktop TaskView (Today-row icon only,
  per request).
- Reverse operation (project → task).
