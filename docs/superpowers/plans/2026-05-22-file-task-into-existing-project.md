# File a Task into an Existing Project — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Today task-row folder-icon modal so it can file a task into an existing project (just set `projectId`, keeping the task), in addition to the existing "create a new project from this task" path.

**Architecture:** A single-file change to `src/components/schedule/PromoteTaskToProjectButton.tsx`. The modal gains a `view: 'picker' | 'create'` state. The picker lists active projects (filtered client-side over `ctx.projects`) with a "+ New project" row that switches to the existing create form. Filing calls `ctx.onUpdateTask(taskId, { projectId })`. No changes to context, `App.tsx`, `useProjects`, or the `convertTaskToProject` helper — all needed values (`projects`, `onUpdateTask`, `onConvertTaskToProject`, `projectsMap`, `onOpenProject`) are already on the context.

**Tech Stack:** React 19 + TypeScript (strict), Tailwind v4, lucide-react icons, Vitest.

**Shell note:** Prefix npm/npx commands with the project PATH fix:
`export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`

**Worktree:** All work happens in `.worktrees/file-into-project/` on branch `feat/file-task-into-project`. Run all commands from that directory.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/components/schedule/PromoteTaskToProjectButton.tsx` | The only file changed. Button is unchanged; `ConvertTaskModal` is refactored into a two-view modal (picker + create). |

---

## Task 1: Two-view modal — picker (file into existing) + create (existing form)

**Files:**
- Modify: `src/components/schedule/PromoteTaskToProjectButton.tsx` (rewrite the `ConvertTaskModal` function; the exported `PromoteTaskToProjectButton` button component above it is unchanged)

This task replaces the `ConvertTaskModal` function (currently lines 66–227). The button component (lines 1–57) and the `ConvertTaskModalProps` interface (lines 61–64) stay as-is.

- [ ] **Step 1: Confirm the context fields exist (read-only sanity check)**

Run: `grep -n "projects:\|onUpdateTask\|onConvertTaskToProject\|onOpenProject\|projectsMap" src/contexts/ScheduleActionsContext.tsx`
Expected: shows `projects: Project[]`, `onUpdateTask?`, `onConvertTaskToProject?`, `onOpenProject?`, `projectsMap?`. (Confirms no context change is needed.)

- [ ] **Step 2: Update imports**

In `src/components/schedule/PromoteTaskToProjectButton.tsx`, replace the import block at the top (lines 1–5):

```typescript
import { useState, useRef, useEffect, useCallback } from 'react'
import type { TimelineItem } from '@/types/timeline'
import type { TaskContext } from '@/types/task'
import { useScheduleActionsContext } from '@/contexts/ScheduleActionsContext'
import { FolderPlus, FolderOpen } from 'lucide-react'
```

with (adds `useMemo`, `ArrowLeft`, `Search`):

```typescript
import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import type { TimelineItem } from '@/types/timeline'
import type { TaskContext } from '@/types/task'
import { useScheduleActionsContext } from '@/contexts/ScheduleActionsContext'
import { FolderPlus, FolderOpen, ArrowLeft, Search } from 'lucide-react'
```

- [ ] **Step 3: Replace the `ConvertTaskModal` function**

Replace the entire `ConvertTaskModal` function (currently lines 66–227, from `function ConvertTaskModal({ item, onClose }: ConvertTaskModalProps) {` through its closing `}` before the file ends) with the following. The `// ── Modal ──` comment line and `ConvertTaskModalProps` interface above it stay unchanged.

```typescript
function ConvertTaskModal({ item, onClose }: ConvertTaskModalProps) {
  const ctx = useScheduleActionsContext()
  const modalRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  const taskId = item.originalTask?.id ?? item.id.replace('task-', '')

  const [view, setView] = useState<'picker' | 'create'>('picker')
  const [search, setSearch] = useState('')

  // Create-view state
  const [projectName, setProjectName] = useState(item.title)
  const [context, setContext] = useState<TaskContext | undefined>(item.context ?? 'work')
  const [notes, setNotes] = useState(item.notes ?? '')
  const [submitting, setSubmitting] = useState(false)

  // Active projects matching the search query (case-insensitive substring on name)
  const matches = useMemo(() => {
    const all = (ctx.projects ?? []).filter((p) => p.status !== 'completed')
    const q = search.trim().toLowerCase()
    return q ? all.filter((p) => p.name.toLowerCase().includes(q)) : all
  }, [ctx.projects, search])

  // Focus the relevant input when the view changes
  useEffect(() => {
    const t = setTimeout(() => {
      if (view === 'picker') searchRef.current?.focus()
      else nameRef.current?.focus()
    }, 100)
    return () => clearTimeout(t)
  }, [view])

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  // Close on escape
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onClose])

  // File the task into an existing project (keeps the task; just links it)
  const handleFileInto = useCallback((projectId: string) => {
    ctx.onUpdateTask?.(taskId, { projectId })
    onClose()
  }, [ctx, taskId, onClose])

  // Create a new project from the task (expand: subtasks absorbed, parent deleted)
  const handleCreate = useCallback(async () => {
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
        aria-label="Add task to project"
      >
        {/* Header */}
        <div className="bg-primary-50 border-b border-primary-100 px-5 py-4">
          <div className="flex items-center gap-3">
            {view === 'create' ? (
              <button
                onClick={() => setView('picker')}
                className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center text-primary-600 hover:bg-primary-200 transition-colors"
                aria-label="Back to project list"
                title="Back"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            ) : (
              <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
                <FolderPlus className="w-5 h-5 text-primary-600" />
              </div>
            )}
            <div>
              <h2 className="font-display text-lg font-semibold text-neutral-800">
                {view === 'create' ? 'Create Project' : 'Add to Project'}
              </h2>
              <p className="text-sm text-neutral-500">
                {view === 'create' ? 'from task' : 'file this task into a project'}
              </p>
            </div>
          </div>
        </div>

        {view === 'picker' ? (
          <>
            {/* Search */}
            <div className="p-3 border-b border-neutral-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search projects..."
                  className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl bg-neutral-50 border border-neutral-200
                             focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* New project row */}
            <button
              onClick={() => {
                setProjectName(search.trim() || item.title)
                setView('create')
              }}
              className="w-full px-5 py-3 flex items-center gap-3 text-left border-b border-neutral-100
                         text-primary-700 hover:bg-primary-50 transition-colors"
            >
              <FolderPlus className="w-4 h-4" />
              <span className="text-sm font-medium">+ New project</span>
            </button>

            {/* Project list */}
            <div className="max-h-60 overflow-auto">
              {matches.length > 0 ? (
                matches.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleFileInto(p.id)}
                    className="w-full px-5 py-3 text-left text-sm text-neutral-700 hover:bg-neutral-50 transition-colors"
                  >
                    {p.name}
                  </button>
                ))
              ) : (
                <div className="px-5 py-6 text-center text-sm text-neutral-400">
                  {search.trim() ? 'No matching projects' : 'No projects yet'}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-neutral-100 px-5 py-4">
              <button
                onClick={onClose}
                className="w-full px-4 py-3 rounded-xl text-sm font-medium text-neutral-600 hover:bg-neutral-100 transition-colors"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Create form */}
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">
                  Project Name
                </label>
                <input
                  ref={nameRef}
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleCreate()
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
                onClick={() => setView('picker')}
                className="flex-1 px-4 py-3 rounded-xl text-sm font-medium text-neutral-600 hover:bg-neutral-100 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleCreate}
                disabled={!projectName.trim() || submitting}
                className="flex-1 btn-primary flex items-center justify-center gap-2
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FolderPlus className="w-4 h-4" />
                {submitting ? 'Converting...' : 'Create Project'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Typecheck**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH" && npx tsc --noEmit`
Expected: PASS, zero errors.

- [ ] **Step 5: Lint the file**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH" && npx eslint src/components/schedule/PromoteTaskToProjectButton.tsx`
Expected: zero errors/warnings (no unused imports — `useMemo`, `ArrowLeft`, `Search` are all used).

- [ ] **Step 6: Commit**

```bash
git add src/components/schedule/PromoteTaskToProjectButton.tsx
git commit -m "feat(file-into-project): file a task into an existing project from the folder icon

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Verification

- [ ] **Step 1: Typecheck + build**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH" && npm run build`
Expected: TypeScript check passes and Vite build completes (the pre-existing >500 kB chunk-size warning is fine).

- [ ] **Step 2: Manual smoke test**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH" && npm run dev`
In the Today view:
1. Hover a task with no project → folder icon → modal opens on the **picker** view ("Add to Project").
2. The search box filters the project list; "+ New project" sits above the list.
3. Click an existing project → modal closes; the task stays on the row, now gains that project's chip; the folder icon flips to the open-folder "view project" state.
4. Open that project (click the open-folder icon) → the task appears in its task list, with any subtasks still nested under it.
5. Re-hover a different unlinked task → "+ New project" → the create form appears (name prefilled), Create still expands the task into a new project and opens it (unchanged behavior). The "Back" button returns to the picker.
6. Escape and outside-click close the modal from both views.

---

## Notes for the implementer

- **Do not touch `main` in the shared worktree.** All work is in `.worktrees/file-into-project/`.
- This is intentionally a single-file change. Do NOT modify `ScheduleActionsContext`, `App.tsx`, `useProjects`, or `convertTaskToProject.ts` — everything needed is already on the context.
- Do NOT extract a shared `ProjectPicker` component (the same picker is duplicated in `TaskViewRedesign` and `DetailPanelRedesign`, but unifying them is out of scope here).
- The button component and `ConvertTaskModalProps` interface are unchanged — only the `ConvertTaskModal` function body and the import line change.
- Filing is non-destructive (just sets `projectId`), so there is no undo toast and no test beyond build + manual smoke (consistent with the codebase's other untested project pickers).
