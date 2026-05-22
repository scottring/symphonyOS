# Pin Projects + Due-Date Sort on the Today Rail — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the Today right-rail "Active projects" panel, let the user pin projects to the top and sort the rest by their earliest incomplete task's due date.

**Architecture:** Pure sort logic in `src/lib/projectProgress.ts` (pinned-first, then earliest incomplete timed `scheduledFor`, undated last). `TodayRail.tsx` supplies pinned project ids and a toggle via the existing `usePinnedItems` hook (reusing the `pinned_items` table with `entityType==='project'`). `ActiveProjects.tsx` stays presentational and renders a per-row pin button. No DB migration, no `Project`/`useProjects` changes.

**Tech Stack:** React 19 + TypeScript (strict), Vitest + React Testing Library, Tailwind v4, lucide-react.

**Shell note:** Prefix npm/npx commands with the project PATH fix:
`export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`

**Worktree:** All work happens in `.worktrees/pin-projects/` on branch `feat/pin-projects-rail`. Run all commands from that directory.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/projectProgress.ts` | Pure ranking: add `pinned` to `RankedProject`; new sort (pinned-first, due-date, undated-last). |
| `src/lib/projectProgress.test.ts` | Add sort unit tests; extend the `mkTask` helper with an overrides param. |
| `src/components/today/ActiveProjects.tsx` | Presentational: per-row pin button + `onTogglePin` prop. |
| `src/components/today/ActiveProjects.test.tsx` | Update existing render calls for new props; add pin-button tests. |
| `src/components/today/TodayRail.tsx` | Wire `usePinnedItems` → pinned ids + `onTogglePin`. |

---

## Task 1: Ranking — pinned-first + due-date sort (TDD)

**Files:**
- Modify: `src/lib/projectProgress.ts`
- Modify: `src/lib/projectProgress.test.ts`

- [ ] **Step 1: Extend the `mkTask` test helper with overrides**

In `src/lib/projectProgress.test.ts`, replace the `mkTask` helper:

```typescript
function mkTask(id: string, projectId: string | null, completed: boolean): Task {
  return {
    id,
    title: `t-${id}`,
    completed,
    scheduledFor: null,
    context: null,
    projectId,
    contactId: null,
    assignedTo: null,
    bucket: 'today',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Task
}
```

with (adds an `overrides` param; existing 3-arg calls keep working):

```typescript
function mkTask(
  id: string,
  projectId: string | null,
  completed: boolean,
  overrides: Partial<Task> = {},
): Task {
  return {
    id,
    title: `t-${id}`,
    completed,
    scheduledFor: null,
    context: null,
    projectId,
    contactId: null,
    assignedTo: null,
    bucket: 'today',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Task
}
```

- [ ] **Step 2: Write the failing tests**

Append these tests inside the existing `describe('rankActiveProjects', () => { ... })` block in `src/lib/projectProgress.test.ts`, just before its closing `})`:

```typescript
  it('marks pinned projects and orders them first by pin order', () => {
    const projects = [
      mkProject('a', 'A'),
      mkProject('b', 'B'),
      mkProject('c', 'C'),
    ]
    const result = rankActiveProjects(projects, [], 5, ['c', 'a'])
    expect(result.map((p) => p.id)).toEqual(['c', 'a', 'b'])
    expect(result.find((p) => p.id === 'c')!.pinned).toBe(true)
    expect(result.find((p) => p.id === 'a')!.pinned).toBe(true)
    expect(result.find((p) => p.id === 'b')!.pinned).toBe(false)
  })

  it('sorts unpinned projects by earliest incomplete timed task date', () => {
    const projects = [mkProject('a', 'A'), mkProject('b', 'B'), mkProject('c', 'C')]
    const tasks = [
      mkTask('1', 'a', false, { bucket: 'timed', scheduledFor: new Date(2026, 5, 10) }),
      mkTask('2', 'b', false, { bucket: 'timed', scheduledFor: new Date(2026, 5, 1) }),
      mkTask('3', 'c', false, { bucket: 'timed', scheduledFor: new Date(2026, 5, 20) }),
    ]
    const result = rankActiveProjects(projects, tasks)
    expect(result.map((p) => p.id)).toEqual(['b', 'a', 'c'])
  })

  it('uses only the earliest incomplete timed task and ignores completed ones', () => {
    const projects = [mkProject('a', 'A'), mkProject('b', 'B')]
    const tasks = [
      // a's only incomplete dated task is late; its early task is completed (ignored)
      mkTask('1', 'a', true, { bucket: 'timed', scheduledFor: new Date(2026, 0, 1) }),
      mkTask('2', 'a', false, { bucket: 'timed', scheduledFor: new Date(2026, 6, 1) }),
      mkTask('3', 'b', false, { bucket: 'timed', scheduledFor: new Date(2026, 3, 1) }),
    ]
    const result = rankActiveProjects(projects, tasks)
    expect(result.map((p) => p.id)).toEqual(['b', 'a'])
  })

  it('sinks projects with no dated tasks below dated ones, bucket-ranked', () => {
    const projects = [
      mkProject('dated', 'Dated'),
      mkProject('week', 'Weekly'),
      mkProject('quarter', 'Quarterly'),
    ]
    const tasks = [
      mkTask('1', 'dated', false, { bucket: 'timed', scheduledFor: new Date(2026, 5, 1) }),
      mkTask('2', 'week', false, { bucket: 'week' }),
      mkTask('3', 'quarter', false, { bucket: 'quarter' }),
    ]
    const result = rankActiveProjects(projects, tasks)
    expect(result.map((p) => p.id)).toEqual(['dated', 'week', 'quarter'])
  })

  it('keeps pinned projects on top even when an unpinned one is due sooner', () => {
    const projects = [mkProject('soon', 'Soon'), mkProject('pinned', 'Pinned')]
    const tasks = [
      mkTask('1', 'soon', false, { bucket: 'timed', scheduledFor: new Date(2026, 0, 1) }),
      mkTask('2', 'pinned', false, { bucket: 'timed', scheduledFor: new Date(2026, 11, 1) }),
    ]
    const result = rankActiveProjects(projects, tasks, 5, ['pinned'])
    expect(result.map((p) => p.id)).toEqual(['pinned', 'soon'])
  })
```

- [ ] **Step 3: Run the tests to verify the new ones fail**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH" && npx vitest run src/lib/projectProgress.test.ts`
Expected: the 5 new tests FAIL (pinned arg ignored / no `pinned` field / wrong order). Existing tests still pass.

- [ ] **Step 4: Implement the new ranking**

Replace the entire contents of `src/lib/projectProgress.ts` with:

```typescript
import type { Project } from '@/types/project'
import type { Task } from '@/types/task'

export interface RankedProject {
  id: string
  name: string
  progress: number      // 0–100, rounded integer
  totalTasks: number
  pinned: boolean       // true if this project is pinned to the top of the rail
}

// Bucket urgency for undated tasks; lower = sooner. Unknown/none = 4.
const BUCKET_RANK: Record<string, number> = {
  week: 0,
  month: 1,
  quarter: 2,
  inbox: 3,
}

interface ProjectAgg {
  total: number
  done: number
  dueMs: number       // earliest incomplete timed scheduledFor, or Infinity
  bucketRank: number  // min bucket rank among incomplete tasks, or 4
}

/**
 * Picks active projects for the Today rail's ACTIVE PROJECTS panel.
 *
 * - Filters out completed projects.
 * - Computes progress = completed-tasks / total-tasks (0% if no tasks).
 * - Orders: pinned projects first (in `pinnedIds` order), then unpinned by the
 *   earliest incomplete TIMED task's `scheduledFor` (ascending). Projects with no
 *   dated tasks sink to the bottom, ordered by bucket urgency
 *   (week < month < quarter < inbox < none) then most-recently-updated.
 * - Caps at `limit` (default 5); pinned projects take the top slots.
 */
export function rankActiveProjects(
  projects: Project[],
  tasks: Task[],
  limit = 5,
  pinnedIds: string[] = [],
): RankedProject[] {
  // Pre-aggregate tasks by project once.
  const byProject = new Map<string, ProjectAgg>()
  for (const t of tasks) {
    if (!t.projectId) continue
    const agg = byProject.get(t.projectId) ?? { total: 0, done: 0, dueMs: Infinity, bucketRank: 4 }
    agg.total += 1
    if (t.completed) {
      agg.done += 1
    } else {
      // Only incomplete tasks drive the due-date / bucket sort.
      if (t.bucket === 'timed' && t.scheduledFor) {
        agg.dueMs = Math.min(agg.dueMs, t.scheduledFor.getTime())
      }
      const rank = t.bucket ? (BUCKET_RANK[t.bucket] ?? 4) : 4
      agg.bucketRank = Math.min(agg.bucketRank, rank)
    }
    byProject.set(t.projectId, agg)
  }

  // Pin order lookup: project id → index in pinnedIds.
  const pinnedRank = new Map<string, number>()
  pinnedIds.forEach((id, i) => pinnedRank.set(id, i))

  const active = projects.filter((p) => p.status !== 'completed')

  active.sort((a, b) => {
    const aPinned = pinnedRank.has(a.id)
    const bPinned = pinnedRank.has(b.id)
    if (aPinned && bPinned) return pinnedRank.get(a.id)! - pinnedRank.get(b.id)!
    if (aPinned) return -1
    if (bPinned) return 1

    const aAgg = byProject.get(a.id)
    const bAgg = byProject.get(b.id)
    const aDue = aAgg?.dueMs ?? Infinity
    const bDue = bAgg?.dueMs ?? Infinity
    if (aDue !== bDue) return aDue - bDue

    const aRank = aAgg?.bucketRank ?? 4
    const bRank = bAgg?.bucketRank ?? 4
    if (aRank !== bRank) return aRank - bRank

    return b.updatedAt.getTime() - a.updatedAt.getTime()
  })

  return active.slice(0, limit).map((p) => {
    const agg = byProject.get(p.id)
    const progress = agg && agg.total > 0
      ? Math.round((agg.done / agg.total) * 100)
      : 0
    return {
      id: p.id,
      name: p.name,
      progress,
      totalTasks: agg?.total ?? 0,
      pinned: pinnedRank.has(p.id),
    }
  })
}
```

- [ ] **Step 5: Run the tests to verify all pass**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH" && npx vitest run src/lib/projectProgress.test.ts`
Expected: PASS — all tests (the original 8 + 5 new) green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/projectProgress.ts src/lib/projectProgress.test.ts
git commit -m "feat(pin-projects): pinned-first + due-date ranking for the Today rail

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Pin button in `ActiveProjects` (TDD)

**Files:**
- Modify: `src/components/today/ActiveProjects.tsx`
- Modify: `src/components/today/ActiveProjects.test.tsx`

- [ ] **Step 1: Update existing tests for the new props + add pin tests**

Replace the entire contents of `src/components/today/ActiveProjects.test.tsx` with:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { ActiveProjects } from './ActiveProjects'

const onSelectProject = vi.fn()
const onViewAll = vi.fn()
const onTogglePin = vi.fn()

describe('ActiveProjects', () => {
  it('renders an empty state when there are no active projects', () => {
    render(
      <ActiveProjects
        projects={[]}
        onSelectProject={onSelectProject}
        onViewAll={onViewAll}
        onTogglePin={onTogglePin}
      />,
    )
    expect(screen.getByText(/no active projects/i)).toBeInTheDocument()
  })

  it('renders each project with name and rounded progress percent', () => {
    render(
      <ActiveProjects
        projects={[
          { id: 'p1', name: 'Backyard upgrades', progress: 60, totalTasks: 5, pinned: false },
          { id: 'p2', name: 'Kids room renovation', progress: 30, totalTasks: 10, pinned: false },
        ]}
        onSelectProject={onSelectProject}
        onViewAll={onViewAll}
        onTogglePin={onTogglePin}
      />,
    )
    expect(screen.getByText('Backyard upgrades')).toBeInTheDocument()
    expect(screen.getByText('60%')).toBeInTheDocument()
    expect(screen.getByText('Kids room renovation')).toBeInTheDocument()
    expect(screen.getByText('30%')).toBeInTheDocument()
  })

  it('shows the View all projects CTA', () => {
    render(
      <ActiveProjects
        projects={[{ id: 'p1', name: 'X', progress: 0, totalTasks: 0, pinned: false }]}
        onSelectProject={onSelectProject}
        onViewAll={onViewAll}
        onTogglePin={onTogglePin}
      />,
    )
    expect(screen.getByRole('button', { name: /view all projects/i })).toBeInTheDocument()
  })

  it('calls onSelectProject when a project row is clicked', async () => {
    const { user } = render(
      <ActiveProjects
        projects={[{ id: 'p1', name: 'Backyard upgrades', progress: 60, totalTasks: 5, pinned: false }]}
        onSelectProject={onSelectProject}
        onViewAll={onViewAll}
        onTogglePin={onTogglePin}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Backyard upgrades' }))
    expect(onSelectProject).toHaveBeenCalledWith('p1')
  })

  it('calls onViewAll when View all is clicked', async () => {
    const { user } = render(
      <ActiveProjects
        projects={[{ id: 'p1', name: 'X', progress: 0, totalTasks: 0, pinned: false }]}
        onSelectProject={onSelectProject}
        onViewAll={onViewAll}
        onTogglePin={onTogglePin}
      />,
    )
    await user.click(screen.getByRole('button', { name: /view all projects/i }))
    expect(onViewAll).toHaveBeenCalledTimes(1)
  })

  it('calls onTogglePin (not onSelectProject) when the pin button is clicked', async () => {
    onSelectProject.mockClear()
    onTogglePin.mockClear()
    const { user } = render(
      <ActiveProjects
        projects={[{ id: 'p1', name: 'Backyard upgrades', progress: 60, totalTasks: 5, pinned: false }]}
        onSelectProject={onSelectProject}
        onViewAll={onViewAll}
        onTogglePin={onTogglePin}
      />,
    )
    await user.click(screen.getByRole('button', { name: /pin backyard upgrades/i }))
    expect(onTogglePin).toHaveBeenCalledWith('p1')
    expect(onSelectProject).not.toHaveBeenCalled()
  })

  it('labels the pin button as Unpin and presses it for a pinned project', () => {
    render(
      <ActiveProjects
        projects={[{ id: 'p1', name: 'Backyard upgrades', progress: 60, totalTasks: 5, pinned: true }]}
        onSelectProject={onSelectProject}
        onViewAll={onViewAll}
        onTogglePin={onTogglePin}
      />,
    )
    const pinBtn = screen.getByRole('button', { name: /unpin backyard upgrades/i })
    expect(pinBtn).toHaveAttribute('aria-pressed', 'true')
  })
})
```

- [ ] **Step 2: Run the component tests to verify failure**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH" && npx vitest run src/components/today/ActiveProjects.test.tsx`
Expected: FAIL — `onTogglePin` prop doesn't exist yet; no pin button rendered.

- [ ] **Step 3: Implement the pin button**

Replace the entire contents of `src/components/today/ActiveProjects.tsx` with:

```typescript
import type { RankedProject } from '@/lib/projectProgress'
import { FolderKanban, Pin } from 'lucide-react'

interface ActiveProjectsProps {
  projects: RankedProject[]
  /** Navigate to a project's detail view. */
  onSelectProject: (id: string) => void
  /** Navigate to the full projects list. */
  onViewAll: () => void
  /** Toggle pinned state for a project. */
  onTogglePin: (id: string) => void
}

/**
 * Right-rail "Active projects" panel. Lists up to ~5 projects with a compact
 * name + progress bar + percent. Pinned projects sort to the top and show a
 * filled pin; hovering any row reveals its pin toggle. Click a row to open the
 * project; click View all for the full list.
 */
export function ActiveProjects({ projects, onSelectProject, onViewAll, onTogglePin }: ActiveProjectsProps) {
  const isEmpty = projects.length === 0

  return (
    <section
      aria-labelledby="rail-active-projects"
      className="card px-5 py-4 bg-bg-elevated border border-neutral-200/60"
    >
      <h2
        id="rail-active-projects"
        className="text-[11px] font-medium uppercase tracking-wide text-neutral-400 mb-3"
      >
        Active projects
      </h2>

      {isEmpty ? (
        <p className="flex items-center gap-2 text-[13px] text-neutral-500">
          <FolderKanban className="w-4 h-4 text-neutral-300 shrink-0" aria-hidden />
          <span>No active projects.</span>
        </p>
      ) : (
        <ul className="space-y-2.5">
          {projects.map((p) => (
            <li key={p.id} className="group flex items-start gap-1.5">
              <button
                type="button"
                onClick={() => onSelectProject(p.id)}
                className="flex-1 min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 rounded-md px-1 -mx-1 py-1"
                aria-label={p.name}
              >
                <div className="flex items-baseline justify-between gap-3 mb-1">
                  <span className="text-[13px] text-neutral-800 truncate group-hover:text-neutral-900">
                    {p.name}
                  </span>
                  <span className="text-[12px] font-medium tabular-nums text-neutral-500 shrink-0">
                    {p.progress}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-neutral-100 overflow-hidden">
                  <div
                    className="h-full bg-primary-500 transition-all"
                    style={{ width: `${Math.min(100, Math.max(0, p.progress))}%` }}
                    aria-hidden
                  />
                </div>
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onTogglePin(p.id)
                }}
                className={`
                  mt-0.5 shrink-0 p-1 rounded-md transition-all
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300
                  ${p.pinned
                    ? 'text-primary-600 hover:text-primary-700 hover:bg-primary-50'
                    : 'text-neutral-400 hover:text-primary-600 hover:bg-primary-50 opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
                  }
                `}
                aria-label={p.pinned ? `Unpin ${p.name}` : `Pin ${p.name}`}
                aria-pressed={p.pinned}
                title={p.pinned ? 'Unpin' : 'Pin to top'}
              >
                <Pin className={`w-3.5 h-3.5 ${p.pinned ? 'fill-current' : ''}`} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={onViewAll}
        className="
          mt-4 w-full text-center text-[13px] font-medium
          text-primary-700 hover:text-primary-800
          py-1.5 rounded-md hover:bg-primary-50 transition-colors
        "
      >
        View all projects
      </button>
    </section>
  )
}
```

- [ ] **Step 4: Run the component tests to verify pass**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH" && npx vitest run src/components/today/ActiveProjects.test.tsx`
Expected: PASS — all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/components/today/ActiveProjects.tsx src/components/today/ActiveProjects.test.tsx
git commit -m "feat(pin-projects): per-row pin button on the Active projects rail

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Wire pin state in `TodayRail`

**Files:**
- Modify: `src/components/today/TodayRail.tsx`

Context: `usePinnedItems()` (`src/hooks/usePinnedItems.ts`) returns `{ pins: PinnedItem[], pin(entityType, entityId), unpin(entityType, entityId), isPinned(entityType, entityId), ... }`. `PinnedItem` has `entityType`, `entityId`, `displayOrder`. The pinnable type `'project'` is valid (`src/types/pin.ts`).

- [ ] **Step 1: Add the import and `useCallback`**

In `src/components/today/TodayRail.tsx`, add to the imports (after the existing `import { useMemo } from 'react'` line, change it to include `useCallback`):

```typescript
import { useMemo, useCallback } from 'react'
```

And add this import alongside the other hook/lib imports near the top:

```typescript
import { usePinnedItems } from '@/hooks/usePinnedItems'
```

- [ ] **Step 2: Derive pinned project ids and the toggle**

Inside the `TodayRail` component body, replace the existing `activeProjects` memo:

```typescript
  const activeProjects = useMemo(
    () => rankActiveProjects(projects, tasks, 5),
    [projects, tasks],
  )
```

with:

```typescript
  const { pins, pin, unpin, isPinned } = usePinnedItems()

  const pinnedProjectIds = useMemo(
    () =>
      pins
        .filter((p) => p.entityType === 'project')
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((p) => p.entityId),
    [pins],
  )

  const activeProjects = useMemo(
    () => rankActiveProjects(projects, tasks, 5, pinnedProjectIds),
    [projects, tasks, pinnedProjectIds],
  )

  const onTogglePin = useCallback(
    (projectId: string) => {
      if (isPinned('project', projectId)) {
        unpin('project', projectId)
      } else {
        pin('project', projectId)
      }
    },
    [isPinned, unpin, pin],
  )
```

- [ ] **Step 3: Pass `onTogglePin` to `ActiveProjects`**

Replace the `<ActiveProjects ... />` usage:

```typescript
      <ActiveProjects
        projects={activeProjects}
        onSelectProject={onSelectProject}
        onViewAll={onViewAllProjects}
      />
```

with:

```typescript
      <ActiveProjects
        projects={activeProjects}
        onSelectProject={onSelectProject}
        onViewAll={onViewAllProjects}
        onTogglePin={onTogglePin}
      />
```

- [ ] **Step 4: Typecheck**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH" && npx tsc --noEmit`
Expected: PASS, zero errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/today/TodayRail.tsx
git commit -m "feat(pin-projects): wire usePinnedItems into the Today rail

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Verification

- [ ] **Step 1: Run the affected unit/component tests**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH" && npx vitest run src/lib/projectProgress.test.ts src/components/today/ActiveProjects.test.tsx`
Expected: all green.

- [ ] **Step 2: Typecheck + build + lint touched files**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH" && npm run build && npx eslint src/lib/projectProgress.ts src/components/today/ActiveProjects.tsx src/components/today/TodayRail.tsx`
Expected: build passes (pre-existing >500 kB chunk warning is fine); eslint clean on these files.

- [ ] **Step 3: Manual smoke test**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH" && npm run dev`
On the Today view, in the right-rail "Active projects" panel:
1. Hover a project row → a pin icon appears at the right.
2. Click it → the project jumps to the top and the pin shows filled (and stays visible without hover).
3. Clicking the pin does NOT open the project; clicking the name/bar still opens it.
4. Unpin → it drops back into due-date order (a project with a sooner incomplete timed task sits above one due later; projects with no dated tasks sit at the bottom).

---

## Notes for the implementer

- **Do not touch `main` in the shared worktree.** All work is in `.worktrees/pin-projects/`.
- No DB migration and no changes to `Project`, `useProjects`, or `usePinnedItems` — reuse the existing `pinned_items` system as-is.
- The pin button must be a **sibling** of the row button, not nested (nested `<button>`s are invalid HTML and would break the row-click test).
- Accept the existing pin-system rules (7-pin global cap, 21-day auto-expiry); do not add a "limit reached" toast in this scope.
- The existing `rankActiveProjects` tests pass unchanged — only add new tests; do not delete the recency test (it now documents the final tiebreak).
