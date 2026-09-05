# Planning Lists — Step 2: The week list + copy-down Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/week` stops being a pool to drain and becomes *this week's list* — with the Month rail beside the grid and a Last-week look-back — and placing a month/season task lower **copies** it so every upper list stays whole for its review.

**Architecture:** Copy-down lives in `useSupabaseTasks.updateTask`, the same choke point the goal refusal uses: a descent (month → week/day, season → month/week/day) on a non-goal row inserts a copy via `addTask` with `source_id` and leaves the original untouched — so every path (pushTask, setBucket, drags, DomainGate, bulk) is covered without each remembering. `lib/planning/lineage.ts` derives an original's fate from its copy at read time (never stored). `/week`'s lane is relabelled, gains lingering ticks and a Last-week mode; a new `WeekMonthRail` renders the current month read-only beside the grid. Placed originals show a → mark in the Month dropdown and the Time-block "This month" tab so a copy-down never reads as a failed drag.

**Tech Stack:** React 19 + TS strict, Vitest + RTL, dnd-kit (untouched), Supabase.

**Spec:** `docs/superpowers/specs/2026-09-05-planning-lists-and-lookback-design.md` — §2 (the fork), §3a (`/week`), and the "→ placed" consequences in §2. Step 1 plan: `2026-09-05-planning-lists-step1-data-and-seasons.md`.

## Global Constraints

- Node 22.14.0; work in `.worktrees/planning-lists` on `feat/planning-lists`; `npx tsc --noEmit -p tsconfig.app.json`; `npx vitest run <file>`; rebase onto `origin/main` before pushing; push to `main` only when the whole step is green and browser-verified.
- **The strip is never "bench" in UI copy; "shelf" is the physical strip, the on-screen label is "This week · N"** (`feedback_week_shelf_terminology`).
- **Copy-down copies context, assignees, notes, links, category, contact, project, phone, email, goal_id** — everything but the placement. A copy that loses its domain lands Unsorted and re-asks DomainGate; a copy that loses its assignee narrows the partner out.
- **Nothing on the original changes on a descent** — not `bucket`, not `defer_count`, not `updated_at` (no write at all).
- **Week → week is a MOVE** (carry forward rewrites `week_start`). Someday → anything is a move. Only month/quarter → lower copies.
- **Never partial-`upsert` `tasks`; no literal `scope:`** (`scopeDefaultCoverage.test.ts`).
- Commit trailer:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_018gVEL1aJaWcFFmUpgjHd3M
  ```

---

## File structure

| File | Responsibility |
|---|---|
| `src/lib/planning/lineage.ts` (+test) | **Create.** `placedCopyOf`, `placementFate`, `isDescent`, `openPool`. Pure. |
| `src/hooks/useSupabaseTasks.ts` (+test) | **Modify.** `copyDown()` helper; `updateTask` and `updateTasksBulk` route descents through it. |
| `src/components/home/week/WeekPoolLane.tsx` (+test) | **Modify.** Label per view, empty copy, lingering ticks, Last-week mode with Carry forward / Drop / Someday. |
| `src/components/home/week/WeekMonthRail.tsx` (+test) | **Create.** Read-only current-month list beside the grid; goals first; → marks; collapsible, persisted. |
| `src/components/home/week/WeekViewV2.tsx` | **Modify.** Pass `onUpdateTask`/`onDeleteTask` to the lane; wrap grid + rail in a flex row. |
| `src/components/schedule/TriageRow.tsx` (+HorizonPoolDropdown) | **Modify.** `placed?: 'open' \| 'done'` renders a → mark and hides verbs. |
| `src/components/schedule/TodayView.tsx` | **Modify.** Month dropdown passes `placedFor`. |
| `src/components/planning/PlanningTaskCard.tsx` + `PlanningTaskDrawer.tsx` | **Modify.** `placed` chip on a month-tab card whose copy exists. |

---

### Task 1: `lineage.ts` — an original's fate, derived from its copy

**Files:** Create `src/lib/planning/lineage.ts`, `src/lib/planning/lineage.test.ts`.

**Interfaces (produces):**
```ts
export type PlacementFate = 'open' | 'placed-open' | 'placed-done' | 'done'
export function placedCopyOf(task: Task, tasks: readonly Task[]): Task | undefined  // newest row with sourceId === task.id, excluding the task itself
export function placementFate(task: Task, tasks: readonly Task[]): PlacementFate
export function isDescent(from: TaskBucket | undefined, to: TaskBucket | undefined): boolean   // month→week|timed, quarter→month|week|timed
export function openPool(pool: readonly Task[], tasks: readonly Task[]): Task[]     // rows whose fate is 'open' (the badge/count population)
```

- [ ] **Step 1: Failing tests**

```ts
// src/lib/planning/lineage.test.ts
import { describe, it, expect } from 'vitest'
import { placedCopyOf, placementFate, isDescent, openPool } from './lineage'
import type { Task } from '@/types/task'

let n = 0
const task = (over: Partial<Task> = {}): Task => ({
  id: `t${++n}`, title: 'T', completed: false, createdAt: new Date(2026, 8, 1, 0, 0, n), updatedAt: new Date(), ...over,
} as Task)

describe('placedCopyOf', () => {
  it('finds the copy pointing at the original', () => {
    const orig = task({ bucket: 'month' })
    const copy = task({ bucket: 'week', sourceId: orig.id })
    expect(placedCopyOf(orig, [orig, copy])).toBe(copy)
  })
  it('returns undefined when nothing points at it', () => {
    const orig = task({ bucket: 'month' })
    expect(placedCopyOf(orig, [orig, task()])).toBeUndefined()
  })
  // Paper plans and "Keep" can both copy the same row; the most recent copy is
  // the one whose state the original should reflect.
  it('prefers the newest copy', () => {
    const orig = task({ bucket: 'month' })
    const older = task({ bucket: 'week', sourceId: orig.id, createdAt: new Date(2026, 8, 2) })
    const newer = task({ bucket: 'timed', sourceId: orig.id, createdAt: new Date(2026, 8, 5) })
    expect(placedCopyOf(orig, [orig, older, newer])).toBe(newer)
  })
})

describe('placementFate', () => {
  it('open when untouched, done when ticked itself', () => {
    expect(placementFate(task(), [])).toBe('open')
    expect(placementFate(task({ completed: true }), [])).toBe('done')
  })
  it('placed-open / placed-done follow the copy', () => {
    const orig = task({ bucket: 'month' })
    const copy = task({ bucket: 'week', sourceId: orig.id })
    expect(placementFate(orig, [orig, copy])).toBe('placed-open')
    expect(placementFate(orig, [orig, { ...copy, completed: true }])).toBe('placed-done')
  })
  // Ticking the original itself is the stronger statement; it wins over the copy.
  it('done wins over a placed copy', () => {
    const orig = task({ bucket: 'month', completed: true })
    const copy = task({ bucket: 'week', sourceId: orig.id })
    expect(placementFate(orig, [orig, copy])).toBe('done')
  })
})

describe('isDescent', () => {
  it('month goes down to week or a day; season to month, week or a day', () => {
    expect(isDescent('month', 'week')).toBe(true)
    expect(isDescent('month', 'timed')).toBe(true)
    expect(isDescent('quarter', 'month')).toBe(true)
    expect(isDescent('quarter', 'week')).toBe(true)
    expect(isDescent('quarter', 'timed')).toBe(true)
  })
  it('anything else is a move, not a descent', () => {
    expect(isDescent('week', 'timed')).toBe(false)   // week → day stays a move (timed-bucket invariant)
    expect(isDescent('week', 'week')).toBe(false)    // carry forward
    expect(isDescent('month', 'quarter')).toBe(false) // up
    expect(isDescent('month', 'month')).toBe(false)
    expect(isDescent('someday', 'month')).toBe(false)
    expect(isDescent('inbox', 'week')).toBe(false)
    expect(isDescent(undefined, 'week')).toBe(false)
    expect(isDescent('month', undefined)).toBe(false)
  })
})

describe('openPool', () => {
  it('keeps only rows whose fate is open', () => {
    const a = task({ bucket: 'month' })
    const b = task({ bucket: 'month' })
    const copyOfB = task({ bucket: 'week', sourceId: b.id })
    const c = task({ bucket: 'month', completed: true })
    expect(openPool([a, b, c], [a, b, c, copyOfB])).toEqual([a])
  })
})
```

- [ ] **Step 2: Run red** — `npx vitest run src/lib/planning/lineage.test.ts` → module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/planning/lineage.ts
//
// An upper-list row's fate, read from its copy. Placing a month or season TASK
// lower COPIES it (the original stays, so the period's look-back sees the whole
// list); the copy carries source_id. Nothing is stored on the original — its
// state is derived here, at read time, from whatever copy exists. Invisible
// linking, not the sub-goal alignment refused in July.

import type { Task, TaskBucket } from '@/types/task'

export type PlacementFate = 'open' | 'placed-open' | 'placed-done' | 'done'

/** The newest row copied down from `task`. Paper plans and "Keep" can both
 *  copy the same row; the most recent copy is the one the original reflects. */
export function placedCopyOf(task: Task, tasks: readonly Task[]): Task | undefined {
  let best: Task | undefined
  for (const t of tasks) {
    if (t.id === task.id || t.sourceId !== task.id) continue
    if (!best || t.createdAt.getTime() > best.createdAt.getTime()) best = t
  }
  return best
}

/** Ticking the original is the stronger statement and wins over its copy. */
export function placementFate(task: Task, tasks: readonly Task[]): PlacementFate {
  if (task.completed) return 'done'
  const copy = placedCopyOf(task, tasks)
  if (!copy) return 'open'
  return copy.completed ? 'placed-done' : 'placed-open'
}

const RANK: Partial<Record<TaskBucket, number>> = { quarter: 3, month: 2, week: 1, timed: 0 }

/** A descent is a step DOWN the ladder from a reference list: month → week or
 *  a day; season → month, week or a day. Week → day is a move (the week list
 *  is a checklist, not a reference list); anything sideways or upward is a move. */
export function isDescent(from: TaskBucket | undefined, to: TaskBucket | undefined): boolean {
  if (from !== 'month' && from !== 'quarter') return false
  if (to === undefined) return false
  const f = RANK[from]; const t = RANK[to]
  return f !== undefined && t !== undefined && t < f
}

/** The rows a pool BADGE should count: untouched ones. A placed original is
 *  still on the list (with its mark) but is no longer asking for a decision. */
export function openPool(pool: readonly Task[], tasks: readonly Task[]): Task[] {
  return pool.filter((t) => placementFate(t, tasks) === 'open')
}
```

- [ ] **Step 4: Run green, commit** — `git commit -m "feat(planning): lineage — an upper-list row's fate, derived from its copy"`.

---

### Task 2: Copy-down in `updateTask` / `updateTasksBulk`

**Files:** Modify `src/hooks/useSupabaseTasks.ts` (updateTask after the goal refusal; updateTasksBulk after the goal filter; a `copyDown` helper defined after `addTask`); test `src/hooks/useSupabaseTasks.test.ts`.

**Interfaces:** consumes `isDescent` (Task 1), `addTask` (in-hook). Produces no new API — `updateTask(id, { bucket: 'week', … })` on a month/quarter task now inserts a copy and leaves the original.

- [ ] **Step 1: Failing tests** (new describe in the hook test):

```ts
  describe('copy-down: placing a month/season task lower copies it', () => {
    const monthTask = () => createMockDbTask({
      id: 'm1', title: 'Repaint the porch', bucket: 'month', month_start: '2026-09-01',
      context: 'family', assigned_to: 'member-iris', notes: 'Sage green', phone_number: '555-0100',
    })

    it('pushTask to week inserts a copy with source_id and does not touch the original', async () => {
      mockSupabaseData.push(monthTask())
      const { result } = renderHook(() => useSupabaseTasks())
      await waitFor(() => expect(result.current.tasks).toHaveLength(1))
      mockUpdate.mockClear(); mockInsert.mockClear()
      await act(async () => { await result.current.pushTask('m1', 'week') })
      expect(mockUpdate).not.toHaveBeenCalled()
      expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Repaint the porch', bucket: 'week', source_id: 'm1',
        context: 'family', assigned_to: 'member-iris', notes: 'Sage green', phone_number: '555-0100',
        month_start: null, is_goal: false,
      }))
      // Both rows are now in the hook's state: the original AND the copy.
      expect(result.current.tasks.map((t) => t.title)).toEqual(['Repaint the porch', 'Repaint the porch'])
      expect(result.current.tasks.find((t) => t.sourceId === 'm1')?.bucket).toBe('week')
      expect(result.current.tasks.find((t) => t.id === 'm1')?.bucket).toBe('month')
    })

    it('a drop onto a day (updateTask bucket timed) copies too, carrying the date', async () => {
      mockSupabaseData.push(monthTask())
      const { result } = renderHook(() => useSupabaseTasks())
      await waitFor(() => expect(result.current.tasks).toHaveLength(1))
      mockUpdate.mockClear(); mockInsert.mockClear()
      const day = new Date(2026, 8, 20)
      await act(async () => { await result.current.updateTask('m1', { bucket: 'timed', scheduledFor: day, isAllDay: true }) })
      expect(mockUpdate).not.toHaveBeenCalled()
      expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
        bucket: 'timed', scheduled_for: day.toISOString(), is_all_day: true, source_id: 'm1',
      }))
    })

    it('a season task copies down to the month with this month stamped', async () => {
      mockSupabaseData.push(createMockDbTask({ id: 'q1', title: 'Fall trips', bucket: 'quarter', season_start: '2026-07-01' }))
      const { result } = renderHook(() => useSupabaseTasks())
      await waitFor(() => expect(result.current.tasks).toHaveLength(1))
      mockInsert.mockClear()
      await act(async () => { await result.current.pushTask('q1', 'month') })
      const call = mockInsert.mock.calls.at(-1)![0] as Record<string, unknown>
      expect(call.bucket).toBe('month')
      expect(call.source_id).toBe('q1')
      expect(typeof call.month_start).toBe('string')
      expect(call.season_start).toBeNull()
    })

    // A goal never descends — the refusal from Step 1 still wins, so no copy either.
    it('a goal is refused, not copied', async () => {
      mockSupabaseData.push(createMockDbTask({ id: 'g1', title: 'Read more', bucket: 'month', is_goal: true }))
      const { result } = renderHook(() => useSupabaseTasks())
      await waitFor(() => expect(result.current.tasks).toHaveLength(1))
      mockInsert.mockClear()
      await act(async () => { await result.current.pushTask('g1', 'week') })
      expect(mockInsert).not.toHaveBeenCalled()
    })

    // Sideways and upward are still MOVES. Week→week is the carry-forward.
    it('month→quarter and week→week still update in place', async () => {
      mockSupabaseData.push(
        createMockDbTask({ id: 'm1', title: 'A', bucket: 'month' }),
        createMockDbTask({ id: 'w1', title: 'B', bucket: 'week', week_start: '2026-08-30' }),
      )
      const { result } = renderHook(() => useSupabaseTasks())
      await waitFor(() => expect(result.current.tasks).toHaveLength(2))
      mockInsert.mockClear()
      await act(async () => {
        await result.current.pushTask('m1', 'quarter')
        await result.current.updateTask('w1', { bucket: 'week', weekStart: new Date(2026, 8, 6) })
      })
      expect(mockInsert).not.toHaveBeenCalled()
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ bucket: 'quarter' }))
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ bucket: 'week', week_start: '2026-09-06' }))
    })

    it('updateTasksBulk copies the descending rows and updates the rest', async () => {
      mockSupabaseData.push(
        createMockDbTask({ id: 'm1', title: 'A', bucket: 'month' }),
        createMockDbTask({ id: 'i1', title: 'B', bucket: 'inbox' }),
      )
      const { result } = renderHook(() => useSupabaseTasks())
      await waitFor(() => expect(result.current.tasks).toHaveLength(2))
      mockInsert.mockClear()
      await act(async () => { await result.current.updateTasksBulk(['m1', 'i1'], { bucket: 'week' }) })
      expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ bucket: 'week', source_id: 'm1' }))
      expect(mockIn).toHaveBeenCalledWith('id', ['i1'])
    })
  })
```

- [ ] **Step 2: Run red** — `-t "copy-down"`.

- [ ] **Step 3: Implement**

Import: `import { isDescent } from '@/lib/planning/lineage'`.

After `addTask` is defined (so the closure can call it), add:
```ts
  /**
   * Copy-down. Placing a month or season TASK lower does not move it — it
   * inserts a copy carrying the placement and leaves the original on its list,
   * so the period's look-back sees everything that was on it (a moved row
   * would have shown only what you DIDN'T do). The copy carries everything but
   * the placement: domain (or it lands Unsorted and re-asks DomainGate),
   * assignees (or the partner is narrowed out), notes, links, contact, project.
   * `source_id` is the only thread between them; lineage.ts reads it.
   */
  const copyDown = useCallback(async (original: Task, updates: Partial<Task>): Promise<string | undefined> => {
    const to = updates.bucket
    const scheduledFor = to === 'timed' ? updates.scheduledFor : undefined
    return addTask(original.title, original.contactId, original.projectId, scheduledFor, {
      bucket: to !== 'timed' ? to : undefined,
      weekStart: updates.weekStart,
      monthStart: updates.monthStart,
      isAllDay: to === 'timed' ? updates.isAllDay : undefined,
      sourceId: original.id,
      goalId: original.goalId,
      context: original.context ?? null,
      assignedTo: original.assignedTo ?? null,
      assignedToAll: original.assignedToAll ?? undefined,
      category: original.category,
      notes: original.notes,
      links: original.links,
      phoneNumber: original.phoneNumber,
      email: original.email,
      location: original.location,
      locationPlaceId: original.locationPlaceId,
    })
  }, [addTask])
```
(Check each `original.*` field name against the `Task` type — `grep -n "locationPlaceId\|location?:" src/types/task.ts`; drop any that don't exist.)

In `updateTask`, right after the goal refusal block:
```ts
    // A month/season TASK stepping down the ladder is copied, not moved — see
    // copyDown. The original is untouched: no bucket change, no defer_count,
    // not even updated_at.
    if (isDescent(task.bucket, updates.bucket)) {
      await copyDown(task, updates)
      return
    }
```
`updateTask`'s dependency array gains `copyDown`. **Ordering:** `copyDown` must be declared before `updateTask` in the file; `addTask` already is.

In `updateTasksBulk`, after the goal filter and before `if (taskIds.length === 0) return`:
```ts
    if (isPlacement(updates) && updates.bucket) {
      const descending = taskIds.filter((id) => { const t = findTaskById(id); return t && isDescent(t.bucket, updates.bucket) })
      if (descending.length) {
        for (const id of descending) { const t = findTaskById(id); if (t) await copyDown(t, updates) }
        taskIds = taskIds.filter((id) => !descending.includes(id))
      }
    }
```
Note `pushTask` builds `weekStart`/`monthStart` before calling `updateTask`, so the copy receives the right stamps; `pushTask`'s `deferCount` is simply dropped for a descent (the original isn't deferred — it's still on its list).

- [ ] **Step 4: Run the hook suite + tripwire + tsc; commit** — `feat(tasks): placing a month/season task lower copies it; the original stays`.

---

### Task 3: `/week` lane — label, empty copy, lingering ticks, Last week

**Files:** Modify `WeekPoolLane.tsx`, `WeekPoolLane.test.tsx`, `WeekViewV2.tsx` (pass `onUpdateTask`, `onDeleteTask`).

**Interfaces:** new props on `WeekPoolLane`: `onUpdateTask?: (id: string, u: Partial<Task>) => void | Promise<unknown>`, `onDeleteTask?: (id: string) => void`. Produces: header label `This week · N` / `This month · N` / `Everything · N` / `Routines · N`; empty copy `Nothing on the list yet.` (`Every routine has a home.` stays for the routines view); a `Last week` toggle button in the header (`aria-pressed`); in last-week mode the pills are the previous week's rows (`isPlacedOnWeek(t, prevWeekStart)`, **including completed**), ticked ones struck, unticked ones with three inline actions labelled `Carry forward`, `Drop`, `Someday`.

- [ ] **Step 1: Failing tests** (append to `WeekPoolLane.test.tsx`; `weekStart` there is Aug 31 2026, `dayCount` 5):

```ts
  it('is titled as this week\'s list and says so when empty', () => {
    render(<DndContext><WeekPoolLane weekStart={weekStart} dayCount={5} onSelectItem={() => {}} tasks={[]} /></DndContext>)
    expect(screen.getByRole('button', { name: /This week · 0/ })).toBeInTheDocument()
    expect(screen.getByText('Nothing on the list yet.')).toBeInTheDocument()
    expect(screen.queryByText(/Everything is placed/)).not.toBeInTheDocument()
    expect(screen.queryByText(/UNSCHEDULED/i)).not.toBeInTheDocument()
  })

  it('labels the other views by name', () => {
    render(<DndContext><WeekPoolLane weekStart={weekStart} dayCount={5} onSelectItem={() => {}} tasks={[]} /></DndContext>)
    fireEvent.click(screen.getByRole('button', { name: 'Everything' }))
    expect(screen.getByRole('button', { name: /Everything · 0/ })).toBeInTheDocument()
  })

  // A ticked pill lingers struck-through instead of vanishing — the week still
  // reads as a list with things done on it, not a list that shrinks.
  it('a ticked pill lingers struck-through until the strip is collapsed', () => {
    const onComplete = vi.fn()
    const { rerender } = render(
      <DndContext><WeekPoolLane weekStart={weekStart} dayCount={5} onSelectItem={() => {}} onCompleteTask={onComplete}
        tasks={[task({ id: 'a', title: 'Call VW', bucket: 'week' })]} /></DndContext>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Complete Call VW' }))
    expect(onComplete).toHaveBeenCalledWith('a')
    // The host marks it completed → unscheduledPool drops it → the lane keeps it, struck.
    rerender(<DndContext><WeekPoolLane weekStart={weekStart} dayCount={5} onSelectItem={() => {}} onCompleteTask={onComplete}
      tasks={[task({ id: 'a', title: 'Call VW', bucket: 'week', completed: true })]} /></DndContext>)
    expect(screen.getByText('Call VW')).toHaveClass('line-through')
    // Collapse → reopen: gone.
    fireEvent.click(screen.getByRole('button', { name: /This week/ }))
    fireEvent.click(screen.getByRole('button', { name: /This week/ }))
    expect(screen.queryByText('Call VW')).not.toBeInTheDocument()
  })

  describe('Last week', () => {
    const prev = new Date(2026, 7, 23) // the Sunday before weekStart (Aug 31 2026 is a Monday; default week starts Sunday → Aug 30 is this week's anchor, Aug 23 last week's)
    const onUpdateTask = vi.fn()
    const onDeleteTask = vi.fn()
    const renderLane = () => render(
      <DndContext>
        <WeekPoolLane weekStart={new Date(2026, 7, 30)} dayCount={7} onSelectItem={() => {}}
          onUpdateTask={onUpdateTask} onDeleteTask={onDeleteTask}
          tasks={[
            task({ id: 'done', title: 'Washed the car', bucket: 'week', weekStart: prev, completed: true }),
            task({ id: 'open', title: 'Call the plumber', bucket: 'week', weekStart: prev }),
            task({ id: 'now', title: 'This week thing', bucket: 'week' }),
          ]} />
      </DndContext>,
    )
    beforeEach(() => { onUpdateTask.mockClear(); onDeleteTask.mockClear() })

    it('shows last week\'s rows, ticked and unticked, and hides this week\'s', () => {
      renderLane()
      fireEvent.click(screen.getByRole('button', { name: 'Last week' }))
      expect(screen.getByText('Washed the car')).toHaveClass('line-through')
      expect(screen.getByText('Call the plumber')).toBeInTheDocument()
      expect(screen.queryByText('This week thing')).not.toBeInTheDocument()
    })

    it('carry forward is a MOVE onto this week', () => {
      renderLane()
      fireEvent.click(screen.getByRole('button', { name: 'Last week' }))
      fireEvent.click(screen.getByRole('button', { name: 'Carry forward Call the plumber' }))
      expect(onUpdateTask).toHaveBeenCalledWith('open', expect.objectContaining({ bucket: 'week', weekStart: new Date(2026, 7, 30) }))
    })

    it('drop deletes; someday writes the explicit someday shape', () => {
      renderLane()
      fireEvent.click(screen.getByRole('button', { name: 'Last week' }))
      fireEvent.click(screen.getByRole('button', { name: 'Drop Call the plumber' }))
      expect(onDeleteTask).toHaveBeenCalledWith('open')
      fireEvent.click(screen.getByRole('button', { name: 'Someday Call the plumber' }))
      expect(onUpdateTask).toHaveBeenCalledWith('open', { bucket: 'someday', scheduledFor: undefined, isAllDay: undefined })
    })
  })
```
Also update the existing test `collapses to a header count and expands on click` if it asserts the `Unscheduled ·` text — it becomes `This week ·`.

- [ ] **Step 2: Run red.**

- [ ] **Step 3: Implement** in `WeekPoolLane.tsx`:
  - Props: add `onUpdateTask?`, `onDeleteTask?`.
  - State: `const [lastWeek, setLastWeek] = useState(false)`; `const [lingering, setLingering] = useState<Task[]>([])`.
  - Label: `const VIEW_LABEL: Record<PoolView, string> = { week: 'This week', month: 'This month', all: 'Everything', routines: 'Routines' }`; header text `${lastWeek ? 'Last week' : VIEW_LABEL[view]} · ${total}`.
  - Ticking: wrap `onCompleteTask` → `(id) => { const t = tasks.find(x => x.id === id); if (t) setLingering(l => [...l, t]); onCompleteTask?.(id) }`. Render `lingering` (deduped against `pool.loose`, i.e. only ones no longer in the pool) after the loose pills as `PoolPill` with a `struck` prop → `line-through text-neutral-400` on the title span and no actions/drag. Clear `lingering` in the `setOpen` toggle handler and whenever `view` changes (`useEffect` on `view`).
  - Empty copy: replace the non-routines empty branch with `<span className="text-sm text-neutral-400">Nothing on the list yet.</span>`. Grep the file for `Everything is placed` — must be gone.
  - Last week: header gets `<button type="button" aria-pressed={lastWeek} onClick={() => setLastWeek(v => !v)} className="text-xs …">Last week</button>` beside the switcher (hidden when `view === 'routines'`). `prevWeekStart = weekStart − 7 days`. When `lastWeek`, the content is:
    ```ts
    const lastWeekRows = tasks.filter((t) => t.bucket === 'week' && isPlacedOnWeek(t, prevWeekStart))
    ```
    rendered as `PoolPill`s: completed ones `struck`, open ones with three small buttons after the title — `aria-label={`Carry forward ${task.title}`}` → `onUpdateTask(id, { bucket: 'week', scheduledFor: undefined, weekStart })` (the VIEWED week — the plan being made), `aria-label={`Drop ${task.title}`}` → `onDeleteTask(id)`, `aria-label={`Someday ${task.title}`}` → `onUpdateTask(id, { bucket: 'someday', scheduledFor: undefined, isAllDay: undefined })`. Not draggable in this mode (pass `draggable={false}` — `PoolPill` skips `useDraggable` listeners when false; `useDraggable` must still be called unconditionally, so gate the spread, not the hook). Empty: `Nothing was on last week's list.`
  - `total` in last-week mode = `lastWeekRows.length`.
  - Import `isPlacedOnWeek` from `@/lib/today/weekPlacement`.
- In `WeekViewV2.tsx` pass `onUpdateTask={(id, u) => { void onUpdateTask(id, u) }}` (the already-gated prop) and `onDeleteTask={(id) => { void deleteTask(id) }}`.

- [ ] **Step 4: Run lane + WeekViewV2 tests, tsc; commit** — `feat(week): the strip is this week's list — label, lingering ticks, Last week`.

---

### Task 4: `WeekMonthRail` — the month, read-only, beside the grid

**Files:** Create `src/components/home/week/WeekMonthRail.tsx`, `WeekMonthRail.test.tsx`; modify `WeekViewV2.tsx` (layout).

**Interfaces:** `<WeekMonthRail tasks={tasks} onSelectItem={onSelectItem} />`. Renders `<aside aria-label="This month">` with a header `This month` + a collapse chevron (persisted in `localStorage['symphony-week-month-rail']`, default open); body = current-month rows (`bucket==='month' && belongsToMonth(t, monthStartOf(now))`, including completed and placed): **Goals** group first (rows with `isGoal`, Target icon), then **Tasks**. Each row: title (button → `onSelectItem('task-<id>')`), fate mark from `placementFate`: `done` → struck; `placed-open` → `→ placed` muted; `placed-done` → `→ done` primary; `open` → nothing. Empty: `Nothing on this month's list.` Collapsed: a 40px vertical strip with the chevron and a rotated `This month` label.

- [ ] **Step 1: Failing tests**

```tsx
// src/components/home/week/WeekMonthRail.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WeekMonthRail } from './WeekMonthRail'
import type { Task } from '@/types/task'

const now = new Date()
const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
let n = 0
const task = (over: Partial<Task>): Task => ({ id: `t${++n}`, title: 'T', completed: false, createdAt: new Date(2026, 8, 1, 0, 0, n), updatedAt: new Date(), bucket: 'month', ...over } as Task)

describe('WeekMonthRail', () => {
  beforeEach(() => localStorage.clear())

  it('lists this month\'s goals first, then tasks; other months stay out', () => {
    render(<WeekMonthRail onSelectItem={() => {}} tasks={[
      task({ title: 'Repaint the porch', monthStart: thisMonth }),
      task({ title: 'Read more', monthStart: thisMonth, isGoal: true }),
      task({ title: 'Old thing', monthStart: lastMonth }),
      task({ title: 'Legacy row' }), // NULL month_start → current month
    ]} />)
    const titles = screen.getAllByRole('button', { name: /porch|Read more|Legacy/ }).map((b) => b.textContent)
    expect(titles[0]).toContain('Read more')
    expect(screen.getByText('Goals')).toBeInTheDocument()
    expect(screen.queryByText('Old thing')).not.toBeInTheDocument()
    expect(screen.getByText('Legacy row')).toBeInTheDocument()
  })

  it('marks placed originals and struck done ones', () => {
    const placed = task({ title: 'Repaint the porch', monthStart: thisMonth })
    const copy = task({ title: 'Repaint the porch', bucket: 'week', sourceId: placed.id })
    const done = task({ title: 'Book dentist', monthStart: thisMonth, completed: true })
    render(<WeekMonthRail onSelectItem={() => {}} tasks={[placed, copy, done]} />)
    expect(screen.getByText('→ placed')).toBeInTheDocument()
    expect(screen.getByText('Book dentist')).toHaveClass('line-through')
  })

  it('opens the panel for a row and collapses persistently', () => {
    const onSelect = vi.fn()
    const { unmount } = render(<WeekMonthRail onSelectItem={onSelect} tasks={[task({ id: 'x', title: 'Repaint', monthStart: thisMonth })]} />)
    fireEvent.click(screen.getByRole('button', { name: /Repaint/ }))
    expect(onSelect).toHaveBeenCalledWith('task-x')
    fireEvent.click(screen.getByRole('button', { name: 'Collapse this month' }))
    expect(screen.queryByText('Repaint')).not.toBeInTheDocument()
    unmount()
    render(<WeekMonthRail onSelectItem={onSelect} tasks={[task({ title: 'Repaint', monthStart: thisMonth })]} />)
    expect(screen.queryByText('Repaint')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Expand this month' })).toBeInTheDocument()
  })

  it('says so when the month list is empty', () => {
    render(<WeekMonthRail onSelectItem={() => {}} tasks={[]} />)
    expect(screen.getByText("Nothing on this month's list.")).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run red.**

- [ ] **Step 3: Implement** (`WeekMonthRail.tsx`): as specified; `w-64 shrink-0` open, `w-10` collapsed; rows `text-[13px]`; Target icon from lucide (`Target`); no drag, no actions. In `WeekViewV2.tsx` wrap: `<div className="flex items-start gap-3"><div className="flex-1 min-w-0"><WeekGrid …/></div><WeekMonthRail tasks={tasks} onSelectItem={onSelectItem} /></div>`. Check `WeekGrid` has no fixed width that fights `flex-1`.

- [ ] **Step 4: Run, tsc, commit** — `feat(week): the Month rail — the list you plan the week from, read-only beside the grid`.

---

### Task 5: The → mark where a copied original still shows

**Files:** Modify `TriageRow.tsx` (`placed?: PlacementFate`), `HorizonPoolDropdown.tsx` (`placedFor?: (t) => PlacementFate`), `TodayView.tsx` (Month dropdown passes it; `monthPool` badge count uses `openPool`), `PlanningTaskCard.tsx` (`placed?: PlacementFate` chip), `PlanningTaskDrawer.tsx` + `PlanningSession.tsx` (compute and pass for the month view). Tests in `TriageRow`/`HorizonPoolDropdown` and `PlanningTaskDrawer` test files.

**Behaviour:** a row whose fate is `placed-open` shows a muted `→ placed` and offers no verbs (it has already been decided); `placed-done` shows `→ done` in primary and no verbs. The Time-block "This month" tab shows the same chip on the card and the card is **not draggable** when placed (dragging it again would make a second copy).

- [ ] **Step 1: Failing tests** — `TriageRow` renders `→ placed` and no verb buttons when `placed="placed-open"`; `PlanningTaskDrawer` in `view="month"` with a task + its copy shows `→ placed` on the original and the copy is not in the month list.
- [ ] **Step 2: Run red.**
- [ ] **Step 3: Implement.** `TriageRow`: `{placed && placed !== 'open' && <span className={placed === 'placed-done' ? 'text-primary-700' : 'text-neutral-400'} …>→ {placed === 'placed-done' ? 'done' : 'placed'}</span>}`; skip the verbs row when `placed && placed !== 'open'`. `HorizonPoolDropdown`: `placedFor?: (t: Task) => PlacementFate`, passes `placed={placedFor?.(t)}`. `TodayView`: `placedFor={(t) => placementFate(t, tasks)}` on the Month dropdown only. `PlanningTaskCard`: `placed?: PlacementFate`; when set and not `'open'`, render the chip after the title and don't spread `listeners`. `PlanningTaskDrawer`: new prop `placedFor?`, pass through to cards; `PlanningSession` supplies `(t) => placementFate(t, tasks)` when `poolView === 'month'`.
- [ ] **Step 4: Run, tsc, commit** — `feat(planning): a copied original shows → placed wherever it still appears`.

---

### Task 6: Verify and push

- [ ] Full suite, lint, tsc.
- [ ] Browser (real account is what's signed in on 5173 — **verify with read-only actions and one reversible copy-down on a throwaway task you create for the purpose, then delete both rows**): `/week` header reads `This week · N`; empty-state copy; tick a pill → it lingers struck; collapse → gone. `Last week` toggle shows last week's rows with the three actions. Month rail present, goals first, collapsible and persisted across reload. Time-block → `This month` tab → drag the throwaway month task onto a day → it stays in the tab with `→ placed`, the copy appears on the grid, the original in the Month dropdown shows `→ placed`. Delete both.
- [ ] `git fetch && git rebase origin/main && git push origin HEAD:main`; confirm by grepping the live bundle for `Nothing on the list yet.`
- [ ] Memory: append a Step 2 memory (copy-down lives in updateTask; lineage.ts; the rail; Last week; the → mark; what Step 3 is).
