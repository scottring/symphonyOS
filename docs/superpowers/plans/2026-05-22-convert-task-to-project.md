# Convert Task to Project — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hover folder icon on Today task rows that converts a task into a project — subtasks become the project's tasks, the parent task is removed, and notes/links/phone/context carry over.

**Architecture:** A pure helper `convertTaskToProject(task, details, deps)` runs the create→re-parent→delete transaction and is unit-tested with mocked deps. `App.tsx` wires it to the real hooks and exposes it on `ScheduleActionsContext` as `onConvertTaskToProject`. A new `PromoteTaskToProjectButton` (mirroring the existing event `PromoteToProjectButton`) renders the folder icon + a confirmation modal and calls the action.

**Tech Stack:** React 19 + TypeScript (strict), Vitest + React Testing Library, Tailwind v4. Run commands with the PATH fix below.

**Shell note:** Prefix npm/npx commands with the project PATH fix:
`export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`

**Worktree:** All work happens in `.worktrees/convert-task-to-project/` on branch `feat/convert-task-to-project`. Run all commands from that directory.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/convertTaskToProject.ts` | **New.** Pure orchestrator: create project, re-parent subtasks, delete parent. No React, no hooks — takes deps as args. |
| `src/lib/convertTaskToProject.test.ts` | **New.** Unit tests for the orchestrator with mocked deps. |
| `src/contexts/ScheduleActionsContext.tsx` | Widen `onAddProject` type to accept `links`/`phoneNumber`; add `onConvertTaskToProject`. |
| `src/App.tsx` | Implement `handleConvertTaskToProject` (looks up the task, calls the helper) and add it to the context value + dep array. |
| `src/components/schedule/PromoteTaskToProjectButton.tsx` | **New.** Folder icon (`FolderPlus`/`FolderOpen`) + confirmation modal; calls `onConvertTaskToProject`. |
| `src/components/schedule/ScheduleItem.tsx` | Render `PromoteTaskToProjectButton` for task rows. |

---

## Task 1: Pure `convertTaskToProject` helper (TDD)

**Files:**
- Create: `src/lib/convertTaskToProject.ts`
- Test: `src/lib/convertTaskToProject.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/convertTaskToProject.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { convertTaskToProject } from './convertTaskToProject'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Plan Q3 launch',
    completed: false,
    bucket: 'inbox',
    createdAt: new Date('2026-05-22T00:00:00Z'),
    updatedAt: new Date('2026-05-22T00:00:00Z'),
    ...overrides,
  } as Task
}

const project: Project = {
  id: 'proj-99',
  name: 'Plan Q3 launch',
  status: 'not_started',
}

function makeDeps() {
  return {
    addProject: vi.fn().mockResolvedValue(project),
    updateTask: vi.fn().mockResolvedValue(undefined),
    deleteTask: vi.fn().mockResolvedValue(undefined),
  }
}

describe('convertTaskToProject', () => {
  it('creates a project and carries over notes, links, phone, and context', async () => {
    const deps = makeDeps()
    const task = makeTask({
      notes: 'kickoff Q3',
      links: [{ url: 'https://x.test', label: 'brief' }],
      phoneNumber: '555-1212',
      context: 'work',
    })

    const result = await convertTaskToProject(
      task,
      { name: 'Plan Q3 launch', notes: 'kickoff Q3', context: 'work' },
      deps,
    )

    expect(result).toBe(project)
    expect(deps.addProject).toHaveBeenCalledWith({
      name: 'Plan Q3 launch',
      notes: 'kickoff Q3',
      context: 'work',
      links: [{ url: 'https://x.test', label: 'brief' }],
      phoneNumber: '555-1212',
    })
  })

  it('re-parents each subtask into the project then deletes the parent', async () => {
    const deps = makeDeps()
    const task = makeTask({
      subtasks: [
        makeTask({ id: 'sub-a', title: 'Buy cake', parentTaskId: 'task-1' }),
        makeTask({ id: 'sub-b', title: 'Send invites', parentTaskId: 'task-1' }),
      ],
    })

    await convertTaskToProject(task, { name: 'Plan Q3 launch' }, deps)

    expect(deps.updateTask).toHaveBeenCalledWith('sub-a', {
      projectId: 'proj-99',
      parentTaskId: undefined,
    })
    expect(deps.updateTask).toHaveBeenCalledWith('sub-b', {
      projectId: 'proj-99',
      parentTaskId: undefined,
    })
    expect(deps.deleteTask).toHaveBeenCalledWith('task-1')
  })

  it('handles a task with no subtasks (empty project, no updates)', async () => {
    const deps = makeDeps()
    const task = makeTask()

    await convertTaskToProject(task, { name: 'Plan Q3 launch' }, deps)

    expect(deps.updateTask).not.toHaveBeenCalled()
    expect(deps.deleteTask).toHaveBeenCalledWith('task-1')
  })

  it('bails safely if project creation fails (no re-parent, no delete)', async () => {
    const deps = makeDeps()
    deps.addProject.mockResolvedValue(null)
    const task = makeTask({
      subtasks: [makeTask({ id: 'sub-a', parentTaskId: 'task-1' })],
    })

    const result = await convertTaskToProject(task, { name: 'X' }, deps)

    expect(result).toBeNull()
    expect(deps.updateTask).not.toHaveBeenCalled()
    expect(deps.deleteTask).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH" && npx vitest run src/lib/convertTaskToProject.test.ts`
Expected: FAIL — "Failed to resolve import './convertTaskToProject'" / module not found.

- [ ] **Step 3: Write the helper**

Create `src/lib/convertTaskToProject.ts`:

```typescript
import type { Task, TaskContext, TaskLink } from '@/types/task'
import type { Project } from '@/types/project'

/** Dependencies the orchestrator needs — supplied by App.tsx hooks or mocked in tests. */
export interface ConvertTaskToProjectDeps {
  addProject: (project: {
    name: string
    notes?: string
    context?: TaskContext
    links?: TaskLink[]
    phoneNumber?: string
  }) => Promise<Project | null>
  updateTask: (id: string, updates: Partial<Task>) => Promise<void> | void
  deleteTask: (id: string) => Promise<void> | void
}

/**
 * Convert a task into a project: the task "expands" into a project.
 * - title/notes/context come from `details` (editable in the modal)
 * - links/phoneNumber carry over from the source task
 * - each subtask is re-parented into the new project (parentTaskId cleared)
 * - the original parent task is deleted
 * Returns the new project, or null if creation failed (no destructive ops run).
 */
export async function convertTaskToProject(
  task: Task,
  details: { name: string; notes?: string; context?: TaskContext },
  deps: ConvertTaskToProjectDeps,
): Promise<Project | null> {
  const newProject = await deps.addProject({
    name: details.name,
    notes: details.notes,
    context: details.context,
    links: task.links,
    phoneNumber: task.phoneNumber,
  })

  if (!newProject) return null

  for (const subtask of task.subtasks ?? []) {
    await deps.updateTask(subtask.id, {
      projectId: newProject.id,
      parentTaskId: undefined,
    })
  }

  await deps.deleteTask(task.id)
  return newProject
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH" && npx vitest run src/lib/convertTaskToProject.test.ts`
Expected: PASS — 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/convertTaskToProject.ts src/lib/convertTaskToProject.test.ts
git commit -m "feat(convert): pure convertTaskToProject orchestrator + tests

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Extend `ScheduleActionsContext`

**Files:**
- Modify: `src/contexts/ScheduleActionsContext.tsx:68` (widen `onAddProject`), and add `onConvertTaskToProject` nearby.

- [ ] **Step 1: Add the `TaskLink` import**

The file already imports `Task, TaskContext` from `@/types/task` (line 2). Change that import to also bring in `TaskLink`:

Find:
```typescript
import type { Task, TaskContext } from '@/types/task'
```
Replace with:
```typescript
import type { Task, TaskContext, TaskLink } from '@/types/task'
```

- [ ] **Step 2: Widen `onAddProject` and add `onConvertTaskToProject`**

Find (line 68):
```typescript
  onAddProject?: (project: { name: string; notes?: string; context?: 'work' | 'family' | 'personal' }) => Promise<Project | null>
```
Replace with:
```typescript
  onAddProject?: (project: { name: string; notes?: string; context?: 'work' | 'family' | 'personal'; links?: TaskLink[]; phoneNumber?: string }) => Promise<Project | null>
  /** Convert a task into a project: subtasks become the project's tasks, the parent task is deleted. */
  onConvertTaskToProject?: (taskId: string, details: { name: string; notes?: string; context?: TaskContext }) => Promise<Project | null>
```

- [ ] **Step 3: Typecheck**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH" && npx tsc --noEmit`
Expected: PASS (no errors). The widened `onAddProject` is structurally compatible with the existing `addProject` already assigned in App.tsx.

- [ ] **Step 4: Commit**

```bash
git add src/contexts/ScheduleActionsContext.tsx
git commit -m "feat(convert): add onConvertTaskToProject to schedule actions context

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Wire the action in `App.tsx`

**Files:**
- Modify: `src/App.tsx` — add `handleConvertTaskToProject` callback; add it to the context `useMemo` value and its dependency array; import the helper.

Context: hooks are in scope — `tasks`, `addProject`, `updateTask`, `deleteTask` (declared at `src/App.tsx:208` and `:228`). The context value is a `useMemo` ending around line 1372 with a dependency array.

- [ ] **Step 1: Import the helper**

Add near the other `@/lib` imports at the top of `src/App.tsx` (search for an existing `from '@/lib/` import and add this line after it):

```typescript
import { convertTaskToProject } from '@/lib/convertTaskToProject'
```

- [ ] **Step 2: Add the callback**

Find the existing delete-task wrapper (around `src/App.tsx:1015-1018`):

```typescript
    await deleteTask(taskId)
  }, [deleteTask])
```

Immediately after that callback's closing line, add:

```typescript
  const handleConvertTaskToProject = useCallback(async (
    taskId: string,
    details: { name: string; notes?: string; context?: import('@/types/task').TaskContext },
  ) => {
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return null
    const project = await convertTaskToProject(task, details, { addProject, updateTask, deleteTask })
    if (project) handleOpenProject(project.id)
    return project
  }, [tasks, addProject, updateTask, deleteTask, handleOpenProject])
```

Note: `handleOpenProject` already exists (it's wired as `onOpenProject` in the context value). If `useCallback`/`tasks` ordering causes a "used before declaration" error for `handleOpenProject`, drop the `if (project) handleOpenProject(project.id)` line and the `handleOpenProject` dep — opening the project is a nicety, not required (the task simply disappears and the project appears in the sidebar).

- [ ] **Step 3: Add to the context value**

Find (around `src/App.tsx:1360`):
```typescript
    onAddProject: addProject,
```
Replace with:
```typescript
    onAddProject: addProject,
    onConvertTaskToProject: handleConvertTaskToProject,
```

- [ ] **Step 4: Add to the `useMemo` dependency array**

The context `useMemo` dependency array begins with `}), [` after the object (search for the line `onUpdateEventProject: updateEventProject,` which is near the end of the object, then find the `}), [` that follows). Add `handleConvertTaskToProject` to that dependency array (insert it alongside related deps such as `addProject`).

Example — find:
```typescript
    addProject,
```
within the dependency array and replace with:
```typescript
    addProject,
    handleConvertTaskToProject,
```
(If `addProject` is not listed individually in the deps array, append `handleConvertTaskToProject,` to the array before its closing `])`.)

- [ ] **Step 5: Typecheck**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH" && npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat(convert): wire onConvertTaskToProject to hooks in App

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `PromoteTaskToProjectButton` component

**Files:**
- Create: `src/components/schedule/PromoteTaskToProjectButton.tsx`

This mirrors `PromoteToProjectButton.tsx` (events) but for tasks: it calls `onConvertTaskToProject` instead of `onUpdateEventProject`, and there is no "already linked" relink concept — if the task is already in a project we show `FolderOpen` → open it.

- [ ] **Step 1: Create the component**

Create `src/components/schedule/PromoteTaskToProjectButton.tsx`:

```typescript
import { useState, useRef, useEffect, useCallback } from 'react'
import type { TimelineItem } from '@/types/timeline'
import type { TaskContext } from '@/types/task'
import { useScheduleActionsContext } from '@/contexts/ScheduleActionsContext'
import { FolderPlus, FolderOpen } from 'lucide-react'

interface PromoteTaskToProjectButtonProps {
  item: TimelineItem
}

/**
 * Button shown on task rows to convert the task into a project.
 * If the task is already linked to a project, shows "View Project" instead.
 */
export function PromoteTaskToProjectButton({ item }: PromoteTaskToProjectButtonProps) {
  const ctx = useScheduleActionsContext()
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Already linked to a project → open it (mirror the event affordance)
  if (item.projectId) {
    const project = ctx.projectsMap?.get(item.projectId)
    if (!project) return null
    return (
      <button
        onClick={(e) => {
          e.stopPropagation()
          ctx.onOpenProject?.(item.projectId!)
        }}
        className="shrink-0 p-1.5 rounded-lg text-primary-500 hover:text-primary-700 hover:bg-primary-50 transition-all opacity-0 group-hover:opacity-100"
        title={`View project: ${project.name}`}
        aria-label={`View project: ${project.name}`}
      >
        <FolderOpen className="w-4 h-4" />
      </button>
    )
  }

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation()
          setIsModalOpen(true)
        }}
        className="shrink-0 p-1.5 rounded-lg text-neutral-400 hover:text-primary-600 hover:bg-primary-50 transition-all opacity-0 group-hover:opacity-100"
        title="Convert task to project"
        aria-label="Convert task to project"
      >
        <FolderPlus className="w-4 h-4" />
      </button>

      {isModalOpen && (
        <ConvertTaskModal item={item} onClose={() => setIsModalOpen(false)} />
      )}
    </>
  )
}

// ── Modal ───────────────────────────────────────────────────────────

interface ConvertTaskModalProps {
  item: TimelineItem
  onClose: () => void
}

function ConvertTaskModal({ item, onClose }: ConvertTaskModalProps) {
  const ctx = useScheduleActionsContext()
  const modalRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const taskId = item.originalTask?.id ?? item.id.replace('task-', '')
  const [projectName, setProjectName] = useState(item.title)
  const [context, setContext] = useState<TaskContext>(item.context ?? 'work')
  const [notes, setNotes] = useState(item.notes ?? '')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onClose])

  const handleSubmit = useCallback(async () => {
    if (!projectName.trim() || submitting) return
    setSubmitting(true)
    const project = await ctx.onConvertTaskToProject?.(taskId, {
      name: projectName.trim(),
      notes: notes.trim() || undefined,
      context,
    }) ?? null
    setSubmitting(false)
    if (project) onClose()
  }, [projectName, notes, context, submitting, ctx, taskId, onClose])

  const contextOptions: Array<{ value: TaskContext; label: string; color: string }> = [
    { value: 'work', label: 'Work', color: 'bg-blue-100 text-blue-700 border-blue-200' },
    { value: 'family', label: 'Family', color: 'bg-amber-100 text-amber-700 border-amber-200' },
    { value: 'personal', label: 'Personal', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  ]

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
      <div
        ref={modalRef}
        className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden animate-slide-in-up"
        role="dialog"
        aria-modal="true"
        aria-label="Convert task to project"
      >
        <div className="bg-primary-50 border-b border-primary-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
              <FolderPlus className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold text-neutral-800">
                Create Project
              </h2>
              <p className="text-sm text-neutral-500">from task</p>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
              Project Name
            </label>
            <input
              ref={inputRef}
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmit()
                }
              }}
              className="w-full px-4 py-3 text-lg font-display rounded-xl border border-neutral-200
                         focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="Project name"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
              Domain
            </label>
            <div className="flex gap-2">
              {contextOptions.map(({ value, label, color }) => (
                <button
                  key={value}
                  onClick={() => setContext(value)}
                  className={`
                    px-3 py-1.5 rounded-lg text-sm font-medium border transition-all
                    ${context === value ? color : 'bg-neutral-50 text-neutral-400 border-neutral-200 hover:bg-neutral-100'}
                  `}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-4 py-3 text-sm rounded-xl border border-neutral-200 resize-none
                         focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="Notes carry over from the task"
            />
          </div>
        </div>

        <div className="border-t border-neutral-100 px-5 py-4 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 rounded-xl text-sm font-medium text-neutral-600
                       hover:bg-neutral-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!projectName.trim() || submitting}
            className="flex-1 btn-primary flex items-center justify-center gap-2
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FolderPlus className="w-4 h-4" />
            {submitting ? 'Converting...' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH" && npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/components/schedule/PromoteTaskToProjectButton.tsx
git commit -m "feat(convert): PromoteTaskToProjectButton (folder icon + convert modal)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Render the button in `ScheduleItem`

**Files:**
- Modify: `src/components/schedule/ScheduleItem.tsx` — import + render for task rows.

- [ ] **Step 1: Import the component**

Find (line 15):
```typescript
import { PromoteToProjectButton } from './PromoteToProjectButton'
```
Add immediately after:
```typescript
import { PromoteTaskToProjectButton } from './PromoteTaskToProjectButton'
```

- [ ] **Step 2: Render it for task rows**

Find the event promote block (around lines 648-651):
```typescript
        {/* Promote to Project button - for events */}
        {isEvent && !item.completed && !item.skipped && (
          <PromoteToProjectButton item={item} isSuggestedPromotion={isSuggestedPromotion} />
        )}
```
Add immediately after it:
```typescript
        {/* Convert to Project button - for tasks */}
        {isTask && !item.completed && (
          <PromoteTaskToProjectButton item={item} />
        )}
```

- [ ] **Step 3: Typecheck**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH" && npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 4: Commit**

```bash
git add src/components/schedule/ScheduleItem.tsx
git commit -m "feat(convert): show convert-to-project folder icon on task rows

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Full verification

- [ ] **Step 1: Run the unit tests**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH" && npx vitest run src/lib/convertTaskToProject.test.ts`
Expected: PASS — 4 passed.

- [ ] **Step 2: Typecheck + build**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH" && npm run build`
Expected: TypeScript check passes and Vite build completes with no errors.

- [ ] **Step 3: Lint**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH" && npm run lint`
Expected: No new errors in the touched files.

- [ ] **Step 4: Manual smoke test (dev server)**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH" && npm run dev`
In the Today view, verify:
1. Hovering a task row reveals a folder (`FolderPlus`) icon next to the push control.
2. Clicking it opens the Create Project modal prefilled with the task title (and notes, if any).
3. Editing the name + Create converts: the task disappears, a project is created, and you land on the new project.
4. A task that had subtasks → the subtasks now appear under the project; the parent task is gone.
5. A task already linked to a project shows `FolderOpen` and opens that project instead.

---

## Notes for the implementer

- **Don't touch `main` in the shared worktree.** All work is in `.worktrees/convert-task-to-project/`.
- The event button (`PromoteToProjectButton`) has no unit test — UI coverage here is the manual smoke test plus the helper's unit tests, matching the existing pattern. Don't add a heavyweight RTL test for the modal unless something breaks.
- If `handleOpenProject` causes a TS "use before declaration" error in Task 3, omit the auto-open (see the note in Task 3 Step 2).
