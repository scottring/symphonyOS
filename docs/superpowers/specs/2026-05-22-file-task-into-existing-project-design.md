# File a Task into an Existing Project — Design

**Date:** 2026-05-22
**Status:** Approved (pending spec review)
**Builds on:** `2026-05-22-convert-task-to-project-design.md` (the folder-icon convert flow, now live on `main`)

## Problem

The folder icon on a Today task row can only **create a new project** from the
task. Often the task already belongs to an existing project — you want to file
it there, not spin up a new one. This adds that path to the same affordance.

## Two different semantics, both correct

| Action | What happens to the task |
|--------|--------------------------|
| **New project** (already shipped) | Task *expands*: title → project name, subtasks re-parented as the project's tasks, parent task deleted, new project opened. |
| **Existing project** (this spec) | Task is *filed*: `updateTask(taskId, { projectId })`. The task stays a task, its subtasks stay nested under it, nothing is deleted. It appears in that project's task list. No navigation. |

The asymmetry is intentional. For a new project the task title *becomes* the
project name, so keeping a same-named task would be redundant — hence expand.
An existing project already has its own name and identity, so the task should
keep its own identity as a task within it — hence a simple link. Filing into an
existing project is exactly how the rest of the app already associates tasks
with projects (`ProjectView` lists tasks where `task.projectId === project.id`).

## UX: one modal, two views

The existing `ConvertTaskModal` (in `PromoteTaskToProjectButton.tsx`) gains a
view state: `'picker'` (default) and `'create'`.

**Picker view (default, opens here):**
- Header: "Add to project".
- A `"+ New project"` row pinned at the top → switches to the create view.
- A search input filtering the project list by name (case-insensitive
  substring), client-side over `ctx.projects`, excluding `status === 'completed'`.
- A scrollable list of the matching projects. Clicking one:
  - `ctx.onUpdateTask?.(taskId, { projectId: project.id })`
  - closes the modal.
  - No navigation — the task stays on the Today row, now with a project chip,
    and the row's folder icon flips to the open-folder "view project" state
    (because `item.projectId` is now set; existing behavior in the button).
- Empty state (no projects at all, or no search match): the list area shows a
  muted "No projects" line; the `"+ New project"` row is always available.

**Create view (reached via "+ New project"):**
- The current create form, unchanged: name (prefilled from task title), domain
  pills, notes. Submitting calls `ctx.onConvertTaskToProject?.(taskId, …)` —
  identical expand + delete + open behavior to what's live.
- A back affordance (left arrow / "Back") returns to the picker view.
- The name input prefills from the search query if the user typed one before
  clicking "+ New project" (matches the TaskView picker's `setNewProjectName(projectSearchQuery)`),
  otherwise from the task title.

## Architecture

**Everything is contained in `src/components/schedule/PromoteTaskToProjectButton.tsx`.**
No changes to `ScheduleActionsContext`, `App.tsx`, `useProjects`, or the
`convertTaskToProject` helper — the context already exposes `projects`,
`onUpdateTask`, `onConvertTaskToProject`, `projectsMap`, and `onOpenProject`.

- The button component is unchanged (still shows `FolderPlus` / `FolderOpen`).
- `ConvertTaskModal` is refactored to hold `view: 'picker' | 'create'` state and
  render the picker or the existing form accordingly.
- Project filtering is a `useMemo` over `ctx.projects`:
  `projects.filter(p => p.status !== 'completed' && p.name.toLowerCase().includes(query.toLowerCase()))`.
- Filing handler: `const handleFileInto = (projectId) => { ctx.onUpdateTask?.(taskId, { projectId }); onClose() }`.

### Why not extract a shared `ProjectPicker`

The same picker UI is duplicated inline in `TaskViewRedesign` and
`DetailPanelRedesign` (×2). Extracting a shared component is tempting but out of
scope here — it would pull in three unrelated call sites. We keep the picker
inline in this one modal and leave a shared extraction as future work.

## Error / edge handling

- `onUpdateTask` or `projects` missing from context → the picker still renders;
  clicking a project is a no-op via optional chaining (consistent with the rest
  of the component). In practice both are always provided by `App.tsx`.
- A task that is already linked never reaches this modal — the button shows
  `FolderOpen` instead (existing behavior, unchanged).
- Escape / outside-click / a Cancel control close the modal from either view.

## Testing

The filing path is a one-line `onUpdateTask` call with no branching logic, and
the codebase's existing project pickers are untested UI. So:

- **Build + typecheck** must pass.
- **Manual smoke test:**
  1. Hover a task → folder icon → modal opens on the picker view.
  2. Search narrows the list; clicking a project closes the modal, the task
     gains that project's chip, and the icon flips to open-folder.
  3. Open the chosen project → the task appears in its task list with subtasks
     intact.
  4. "+ New project" → create form (prefilled) → Create still expands the task
     into a new project and opens it (unchanged).
  5. Back arrow returns from create to picker.

## Out of scope (YAGNI)

- Shared `ProjectPicker` extraction / refactor of the other 3 call sites.
- Changing the task's `context`/domain to match the project on filing.
- Multi-select (filing several tasks at once).
- Undo toast (filing is non-destructive and reversible by re-opening the modal —
  which now shows "view project", or by unlinking in the task detail).
