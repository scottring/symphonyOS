# Today: a date expires — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a date on a task expire, so Today shows the day's commitments (~10 rows) instead of every past-dated task ever created (~51 rows).

**Architecture:** The overdue pool is partitioned by age into *carried over* (≤2 days, stays on Today) and *slipped* (3+ days, moves to a review queue). The partition is a **read-side filter only** — `scheduled_for` is never mutated by expiry, so the original date survives as the aging signal and nothing is destructible by a bug. Subtasks stop earning independent Today rows by inheriting their parent's date. `defer_count`, currently read in six places and written in none, finally gets incremented.

**Tech Stack:** React 19 + TypeScript strict, Vitest + React Testing Library, Supabase (PostgREST + edge functions), Tailwind v4.

## Global Constraints

- **Node must be 22.14.0.** Node 26 breaks every bare-`localStorage` test. Run `node -v` first; if wrong: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`
- **`npm test` is WATCH mode.** Always use `npx vitest run <path>`.
- **Work only in the worktree** `/Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/today-dates-expire` on branch `today-dates-expire`. Never edit or commit in the main worktree.
- **Never partial-`upsert` the `tasks` table** — always `.update().eq()`, or you get a 23502 not-null violation.
- **No emojis in UI** — use `lucide-react` icons.
- **Grace window is one exported constant**, `GRACE_DAYS = 2`, defined once in `src/lib/today/taskPools.ts` and imported everywhere else. Never re-literal it.
- Age comparisons **must zero both sides to local midnight** before subtracting. `viewedDate` carries a live wall clock.
- Existing behaviour that must not regress: a completed task stays in the overdue pool only if it was completed *today* (`taskPools.ts:16-22`).

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/lib/today/taskPools.ts` | Pure selectors over the task list | Modify — add `GRACE_DAYS`, `selectCarriedOver`, `selectSlipped`, subtask containment |
| `src/lib/today/taskPools.test.ts` | Selector tests | Modify |
| `src/lib/today/types.ts` | `TodayData` shape | Modify — add `slippedTasks` |
| `src/lib/today/computeTodayData.ts` | Assembles Today's data | Modify — split pools, keep counts honest |
| `src/components/schedule/SlippedPointer.tsx` | The one-line "N slipped" link on Today | Create |
| `src/components/schedule/SlippedReview.tsx` | Bulk triage surface for the slipped queue | Create |
| `src/components/schedule/OverdueSection.tsx` | Carried-over lane | **Unchanged** — it renders whatever pool it is handed, and Task 3 narrows that pool for it |
| `src/components/schedule/TodayView.tsx` | Today page wiring | Modify |
| `src/components/schedule/ScheduleItem.tsx` | Task row | Modify — `0/5` chip becomes a disclosure toggle |
| `src/hooks/useWallData.ts` | Kitchen wall data | Modify — grace floor on the overdue query |
| `src/hooks/useSupabaseTasks.ts` | Task CRUD | Modify — `pushTask` increments `defer_count` |
| `src/lib/overdueSuggestions.ts` | Client-side overdue chips | Modify — delete the `stale` rule |
| `supabase/functions/proactive-engine/index.ts` | Suggestion generator | Modify — delete Rule 7 |
| `supabase/functions/symphony-agent/index.ts` | Agent tool schema | Modify — subtasks are born undated |

---

### Task 1: Grace window and the carried-over / slipped partition

**Files:**
- Modify: `src/lib/today/taskPools.ts`
- Test: `src/lib/today/taskPools.test.ts`

**Interfaces:**
- Consumes: existing `selectOverdue(tasks, isToday, match, now?)`
- Produces:
  - `export const GRACE_DAYS = 2`
  - `export function selectCarriedOver(tasks: Task[], isToday: boolean, match: Match, now?: Date, graceDays?: number): Task[]`
  - `export function selectSlipped(tasks: Task[], isToday: boolean, match: Match, now?: Date, graceDays?: number): Task[]`
  - `selectOverdue` keeps its exact current signature and behaviour.

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe('taskPools', …)` block in `src/lib/today/taskPools.test.ts`:

```ts
  describe('grace window partition', () => {
    // TODAY is 2026-05-19. Grace = 2 days → 05-17 and 05-18 are carried over,
    // 05-16 and older are slipped.
    const d1 = task({ id: 'd1', scheduledFor: new Date('2026-05-18T09:00:00') })
    const d2 = task({ id: 'd2', scheduledFor: new Date('2026-05-17T09:00:00') })
    const d3 = task({ id: 'd3', scheduledFor: new Date('2026-05-16T09:00:00') })
    const old = task({ id: 'old', scheduledFor: new Date('2025-09-01T09:00:00') })
    const pool = [d1, d2, d3, old]

    it('selectCarriedOver: keeps items inside the grace window', () => {
      expect(selectCarriedOver(pool, true, all, TODAY).map(x => x.id)).toEqual(['d1', 'd2'])
    })

    it('selectSlipped: keeps items past the grace window', () => {
      expect(selectSlipped(pool, true, all, TODAY).map(x => x.id)).toEqual(['d3', 'old'])
    })

    it('the two partitions exactly reconstruct selectOverdue', () => {
      const overdue = selectOverdue(pool, true, all, TODAY).map(x => x.id).sort()
      const split = [
        ...selectCarriedOver(pool, true, all, TODAY),
        ...selectSlipped(pool, true, all, TODAY),
      ].map(x => x.id).sort()
      expect(split).toEqual(overdue)
    })

    it('the two partitions are disjoint', () => {
      const carried = new Set(selectCarriedOver(pool, true, all, TODAY).map(x => x.id))
      const slipped = selectSlipped(pool, true, all, TODAY).map(x => x.id)
      expect(slipped.filter(id => carried.has(id))).toEqual([])
    })

    it('boundary: exactly graceDays old is carried over, one day more is slipped', () => {
      const onBoundary = task({ id: 'b', scheduledFor: new Date('2026-05-17T23:59:00') })
      const pastBoundary = task({ id: 'p', scheduledFor: new Date('2026-05-16T00:01:00') })
      expect(selectCarriedOver([onBoundary, pastBoundary], true, all, TODAY).map(x => x.id)).toEqual(['b'])
      expect(selectSlipped([onBoundary, pastBoundary], true, all, TODAY).map(x => x.id)).toEqual(['p'])
    })

    it('ignores the wall clock on both sides — late-evening now still partitions by date', () => {
      const lateNow = new Date('2026-05-19T23:45:00')
      const d = task({ id: 'x', scheduledFor: new Date('2026-05-17T00:05:00') })
      expect(selectCarriedOver([d], true, all, lateNow).map(x => x.id)).toEqual(['x'])
    })

    it('returns [] when not today, like selectOverdue', () => {
      expect(selectCarriedOver(pool, false, all, TODAY)).toEqual([])
      expect(selectSlipped(pool, false, all, TODAY)).toEqual([])
    })

    it('a task completed today stays in the carried-over lane', () => {
      const doneToday = task({
        id: 'done', scheduledFor: new Date('2026-05-18'),
        completed: true, updatedAt: new Date('2026-05-19T08:00:00'),
      })
      expect(selectCarriedOver([doneToday], true, all, TODAY).map(x => x.id)).toEqual(['done'])
    })
  })
```

Add `selectCarriedOver` and `selectSlipped` to the import at the top of the test file.

- [ ] **Step 2: Run the tests and verify they fail**

```bash
node -v   # must print v22.14.0
npx vitest run src/lib/today/taskPools.test.ts
```

Expected: FAIL — `selectCarriedOver is not a function`.

- [ ] **Step 3: Implement the partition**

In `src/lib/today/taskPools.ts`, add above `selectOverdue`:

```ts
/**
 * How many days past its date a task keeps a slot on Today.
 *
 * A date is a commitment to a day, and it expires. Two days covers a weekend
 * of slippage; past that the item moves to the slipped review queue instead of
 * living on Today forever. Measured against real data: items existed at 1 and
 * 2 days old and then nothing until day 7, so the cliff is natural.
 *
 * Expiry is a READ-SIDE contract. Nothing here writes, and `scheduled_for` is
 * never cleared — the original date is what makes "slipping for 245 days"
 * knowable, and a wrong filter is a one-line fix where a wrong migration is not.
 */
export const GRACE_DAYS = 2

/** Whole days between two instants, both floored to local midnight first. */
function daysBetween(from: Date, to: Date): number {
  const a = new Date(from)
  a.setHours(0, 0, 0, 0)
  const b = new Date(to)
  b.setHours(0, 0, 0, 0)
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

/** Overdue and still within the grace window — Today's "Carried over" lane. */
export function selectCarriedOver(
  tasks: Task[], isToday: boolean, match: Match,
  now: Date = new Date(), graceDays: number = GRACE_DAYS,
): Task[] {
  return selectOverdue(tasks, isToday, match, now)
    .filter((t) => daysBetween(t.scheduledFor as Date, now) <= graceDays)
}

/** Overdue past the grace window — the slipped review queue, NOT on Today. */
export function selectSlipped(
  tasks: Task[], isToday: boolean, match: Match,
  now: Date = new Date(), graceDays: number = GRACE_DAYS,
): Task[] {
  return selectOverdue(tasks, isToday, match, now)
    .filter((t) => daysBetween(t.scheduledFor as Date, now) > graceDays)
}
```

Both derive from `selectOverdue`, so the union/disjoint invariant holds by construction and the completed-today rule is inherited rather than duplicated.

- [ ] **Step 4: Run the tests and verify they pass**

```bash
npx vitest run src/lib/today/taskPools.test.ts
```

Expected: PASS, all tests including the pre-existing ones.

- [ ] **Step 5: Commit**

```bash
git add src/lib/today/taskPools.ts src/lib/today/taskPools.test.ts
git commit -m "feat(today): partition the overdue pool into carried-over and slipped"
```

---

### Task 2: Subtasks stop inheriting their parent's Today slot

**Files:**
- Modify: `src/lib/today/taskPools.ts` (the subtask loops at `:28-32` in `selectOverdue` and `:106-111` in `selectTimed`)
- Test: `src/lib/today/taskPools.test.ts`

**Interfaces:**
- Consumes: `GRACE_DAYS`, `daysBetween` from Task 1
- Produces: no new exports. `selectOverdue` and `selectTimed` change behaviour only for subtasks whose date matches their parent's.

**Why:** `symphony-agent` creates subtasks carrying the parent's `scheduled_for`, so decomposing one task manufactures N permanent Today rows. The in-app `addSubtask` (`useSupabaseTasks.ts:684`) correctly creates children undated. A step scheduled for its *own, different* day is a real commitment and must keep its row.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/today/taskPools.test.ts`:

```ts
  describe('subtask containment', () => {
    it('selectOverdue: a subtask sharing the parent date does not get its own row', () => {
      const child = task({ id: 'c1', parentTaskId: 'p1', scheduledFor: new Date('2026-05-17T09:00:00') })
      const parent = task({ id: 'p1', scheduledFor: new Date('2026-05-17T09:00:00'), subtasks: [child] })
      expect(selectOverdue([parent], true, all, TODAY).map(x => x.id)).toEqual(['p1'])
    })

    it('selectOverdue: a subtask with its OWN different date keeps its row', () => {
      const child = task({ id: 'c1', parentTaskId: 'p1', scheduledFor: new Date('2026-05-15T09:00:00') })
      const parent = task({ id: 'p1', scheduledFor: new Date('2026-05-17T09:00:00'), subtasks: [child] })
      expect(selectOverdue([parent], true, all, TODAY).map(x => x.id).sort()).toEqual(['c1', 'p1'])
    })

    it('selectOverdue: an orphan subtask (parent undated) keeps its row', () => {
      const child = task({ id: 'c1', parentTaskId: 'p1', scheduledFor: new Date('2026-05-15T09:00:00') })
      const parent = task({ id: 'p1', bucket: 'inbox', scheduledFor: null, subtasks: [child] })
      expect(selectOverdue([parent], true, all, TODAY).map(x => x.id)).toEqual(['c1'])
    })

    it('selectTimed: a subtask sharing the parent date does not get its own row', () => {
      const at = new Date('2026-05-19T09:00:00')
      const child = task({ id: 'c1', parentTaskId: 'p1', bucket: 'timed', scheduledFor: at })
      const parent = task({ id: 'p1', bucket: 'timed', scheduledFor: at, subtasks: [child] })
      expect(selectTimed([parent], TODAY, all).map(x => x.id)).toEqual(['p1'])
    })

    it('selectTimed: a subtask timed on the day while the parent is undated keeps its row', () => {
      const child = task({ id: 'c1', parentTaskId: 'p1', bucket: 'timed', scheduledFor: new Date('2026-05-19T09:00:00') })
      const parent = task({ id: 'p1', bucket: 'inbox', scheduledFor: null, subtasks: [child] })
      expect(selectTimed([parent], TODAY, all).map(x => x.id)).toEqual(['c1'])
    })

    it('the five vacation steps collapse to one row (regression: 2026-08-03)', () => {
      const at = new Date('2026-05-17T04:00:00')
      const steps = ['s1', 's2', 's3', 's4', 's5'].map((id) =>
        task({ id, parentTaskId: 'vac', scheduledFor: at }))
      const parent = task({ id: 'vac', scheduledFor: at, subtasks: steps })
      expect(selectOverdue([parent], true, all, TODAY).map(x => x.id)).toEqual(['vac'])
    })
  })
```

- [ ] **Step 2: Run the tests and verify they fail**

```bash
npx vitest run src/lib/today/taskPools.test.ts -t 'subtask containment'
```

Expected: FAIL — subtasks are currently pushed unconditionally, so the first test returns `['p1','c1']`.

- [ ] **Step 3: Implement containment**

In `src/lib/today/taskPools.ts`, add this helper next to `daysBetween`:

```ts
/**
 * True when a subtask's date was inherited from its parent rather than chosen.
 *
 * `symphony-agent` stamps the parent's `scheduled_for` onto every child it
 * creates, so a decomposed task turns into N competing Today rows. A step is
 * not a day commitment — the parent holds the slot and shows `n/m`. A step
 * deliberately scheduled for a DIFFERENT day is a real commitment and keeps
 * its own row, so this compares dates rather than suppressing all children.
 */
function hasInheritedDate(subtask: Task, parent: Task): boolean {
  if (!subtask.scheduledFor || !parent.scheduledFor) return false
  const a = new Date(subtask.scheduledFor)
  a.setHours(0, 0, 0, 0)
  const b = new Date(parent.scheduledFor)
  b.setHours(0, 0, 0, 0)
  return a.getTime() === b.getTime()
}
```

In `selectOverdue`, replace the subtask loop body:

```ts
    if (task.subtasks) {
      for (const subtask of task.subtasks) {
        if (hasInheritedDate(subtask, task)) continue
        if (isOverdue(subtask)) result.push(subtask)
      }
    }
```

In `selectTimed`, replace the subtask loop body:

```ts
    if (task.subtasks) {
      for (const subtask of task.subtasks) {
        if (hasInheritedDate(subtask, task)) continue
        if (!match(subtask.assignedTo, subtask.assignedToAll)) continue
        if (subtask.bucket === 'timed' && isOnViewedDate(subtask.scheduledFor)) result.push(subtask)
      }
    }
```

- [ ] **Step 4: Run the full today-lib suite**

```bash
npx vitest run src/lib/today/
```

Expected: PASS. If `computeTodayData.test.ts` or `parity.test.ts` fail, they are asserting the old row counts — read each failure and update the expected count, do not weaken the assertion.

- [ ] **Step 5: Commit**

```bash
git add src/lib/today/taskPools.ts src/lib/today/taskPools.test.ts
git commit -m "fix(today): a subtask inheriting its parent date no longer takes a Today slot"
```

---

### Task 3: `computeTodayData` exposes the two pools

**Files:**
- Modify: `src/lib/today/types.ts`
- Modify: `src/lib/today/computeTodayData.ts:23`, `:39`, `:87-92`, `:95-105`
- Test: `src/lib/today/computeTodayData.test.ts`

**Interfaces:**
- Consumes: `selectCarriedOver`, `selectSlipped` from Task 1
- Produces: `TodayData.overdueTasks` now means **carried over only**; new `TodayData.slippedTasks: Task[]`. `counts` is unchanged in shape.

- [ ] **Step 1: Write the failing test**

⚠️ **`computeTodayData` takes no `now` parameter** — it derives `isToday` from a live `new Date()` (`computeTodayData.ts:9-16`) and `selectOverdue` defaults `now` the same way. A test pinned to a fixed past `viewedDate` gets `isToday === false` and an empty overdue pool, so it would pass while testing nothing. Use dates relative to *now* and leave `viewedDate` at its default.

Append to `src/lib/today/computeTodayData.test.ts`, using the `task()` and `baseInput()` helpers already defined at the top of that file:

```ts
describe('grace window', () => {
  function daysAgo(n: number): Date {
    const d = new Date()
    d.setHours(9, 0, 0, 0)
    d.setDate(d.getDate() - n)
    return d
  }

  it('overdueTasks is carried-over only; slippedTasks is the rest', () => {
    const carried = task({ id: 'c', bucket: 'timed', scheduledFor: daysAgo(1) })
    const slipped = task({ id: 's', bucket: 'timed', scheduledFor: daysAgo(200) })
    const d = computeTodayData(baseInput({ tasks: [carried, slipped], viewedDate: new Date() }))
    expect(d.overdueTasks.map(t => t.id)).toEqual(['c'])
    expect(d.slippedTasks.map(t => t.id)).toEqual(['s'])
  })

  it('counts describe the visible page, not the slipped queue', () => {
    const carried = task({ id: 'c', bucket: 'timed', scheduledFor: daysAgo(1) })
    const slipped = task({ id: 's', bucket: 'timed', scheduledFor: daysAgo(200) })
    const d = computeTodayData(baseInput({ tasks: [carried, slipped], viewedDate: new Date() }))
    expect(d.counts.incompleteOverdue).toBe(1)
  })
})
```

- [ ] **Step 2: Run and verify it fails**

```bash
npx vitest run src/lib/today/computeTodayData.test.ts
```

Expected: FAIL — `slippedTasks` is undefined and `incompleteOverdue` is 2.

- [ ] **Step 3: Implement**

In `src/lib/today/types.ts`, add to the `TodayData` interface, directly under `overdueTasks`:

```ts
  /** Overdue past the grace window. Never rendered as Today rows — the page
   *  shows a single pointer line and the review surface owns the list. */
  slippedTasks: Task[]
```

In `src/lib/today/computeTodayData.ts`, change the import on line 4 to include the new selectors, then replace line 23:

```ts
  const overdueTasks = selectCarriedOver(input.tasks, isToday, match)
  const slippedTasks = selectSlipped(input.tasks, isToday, match)
```

Every downstream use of `overdueTasks` in this file (the linger filter on `:39`, and the counts on `:87-92`) now correctly describes the carried-over lane only — that is the intent, so leave those lines alone. Add `slippedTasks` to the returned object:

```ts
  return {
    isToday,
    overdueTasks: displayOverdueTasks,
    slippedTasks,
    inboxTasks,
    …
```

- [ ] **Step 4: Run and verify it passes**

```bash
npx vitest run src/lib/today/
npx tsc --noEmit
```

Expected: tests PASS; `tsc` clean (every `TodayData` construction site now needs `slippedTasks` — fix any test fixture it flags by adding `slippedTasks: []`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/today/types.ts src/lib/today/computeTodayData.ts src/lib/today/computeTodayData.test.ts
git commit -m "feat(today): computeTodayData returns carried-over and slipped separately"
```

---

### Task 4: The slipped pointer line on Today

**Files:**
- Create: `src/components/schedule/SlippedPointer.tsx`
- Create: `src/components/schedule/SlippedPointer.test.tsx`

**Interfaces:**
- Produces: `export function SlippedPointer({ tasks, onReview }: { tasks: Task[]; onReview: () => void }): JSX.Element | null`

**Design contract from the spec:** always visible when the queue is non-empty, never expands inline, cannot be dismissed. This is the floor guarantee that stops anything being permanently buried.

- [ ] **Step 1: Write the failing test**

Create `src/components/schedule/SlippedPointer.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SlippedPointer } from './SlippedPointer'
import type { Task } from '@/types/task'

function task(p: Partial<Task>): Task {
  return {
    id: 'id', title: 't', completed: false, bucket: 'timed',
    scheduledFor: null, assignedTo: null, updatedAt: new Date(),
    ...p,
  } as Task
}

describe('SlippedPointer', () => {
  it('renders nothing when the queue is empty', () => {
    const { container } = render(<SlippedPointer tasks={[]} onReview={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('states the count and the age of the oldest item', () => {
    vi.setSystemTime(new Date('2026-08-03T12:00:00'))
    const tasks = [
      task({ id: 'a', scheduledFor: new Date('2025-12-01T09:00:00') }),
      task({ id: 'b', scheduledFor: new Date('2026-07-20T09:00:00') }),
    ]
    render(<SlippedPointer tasks={tasks} onReview={() => {}} />)
    expect(screen.getByText(/2 slipped/)).toBeInTheDocument()
    expect(screen.getByText(/245 days/)).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('calls onReview when activated', async () => {
    const onReview = vi.fn()
    render(<SlippedPointer tasks={[task({ scheduledFor: new Date('2026-01-01') })]} onReview={onReview} />)
    await userEvent.click(screen.getByRole('button'))
    expect(onReview).toHaveBeenCalledOnce()
  })

  it('offers no dismiss control — the queue cannot be hidden', () => {
    render(<SlippedPointer tasks={[task({ scheduledFor: new Date('2026-01-01') })]} onReview={() => {}} />)
    expect(screen.queryByRole('button', { name: /dismiss|close|hide/i })).toBeNull()
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run and verify it fails**

```bash
npx vitest run src/components/schedule/SlippedPointer.test.tsx
```

Expected: FAIL — cannot resolve `./SlippedPointer`.

- [ ] **Step 3: Implement**

Create `src/components/schedule/SlippedPointer.tsx`:

```tsx
import { useMemo } from 'react'
import { Archive } from 'lucide-react'
import type { Task } from '@/types/task'

interface SlippedPointerProps {
  tasks: Task[]
  onReview: () => void
}

/**
 * One line closing Today's carried-over lane: "35 slipped · oldest 245 days".
 *
 * The floor guarantee from the spec. Whenever the slipped queue is non-empty
 * this renders, it never expands inline, and it has no dismiss control — the
 * whole point of expiry is that work leaves Today, so the pointer back to it
 * must be impossible to lose.
 */
export function SlippedPointer({ tasks, onReview }: SlippedPointerProps) {
  const oldestDays = useMemo(() => {
    const now = Date.now()
    let max = 0
    for (const t of tasks) {
      if (!t.scheduledFor) continue
      const a = new Date(t.scheduledFor)
      a.setHours(0, 0, 0, 0)
      const b = new Date(now)
      b.setHours(0, 0, 0, 0)
      const days = Math.round((b.getTime() - a.getTime()) / 86400000)
      if (days > max) max = days
    }
    return max
  }, [tasks])

  if (tasks.length === 0) return null

  return (
    <button
      type="button"
      onClick={onReview}
      className="w-full flex items-center gap-2 px-3 md:px-0 py-2 mt-1 text-left text-[13px] text-neutral-500 hover:text-neutral-700 transition-colors"
    >
      <Archive className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
      <span className="font-medium text-neutral-600 shrink-0">
        {tasks.length} slipped
      </span>
      <span className="text-neutral-400 shrink-0">
        · oldest {oldestDays} days
      </span>
      <span className="ml-auto text-primary-600 shrink-0">Review</span>
    </button>
  )
}
```

- [ ] **Step 4: Run and verify it passes**

```bash
npx vitest run src/components/schedule/SlippedPointer.test.tsx
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/SlippedPointer.tsx src/components/schedule/SlippedPointer.test.tsx
git commit -m "feat(today): add the slipped pointer line"
```

---

### Task 5: The slipped review surface

**Files:**
- Create: `src/components/schedule/SlippedReview.tsx`
- Create: `src/components/schedule/SlippedReview.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks beyond `Task`
- Produces:
  ```ts
  export type SlippedFate = 'today' | 'week' | 'someday' | 'delete'
  export function SlippedReview(props: {
    tasks: Task[]
    onApply: (ids: string[], fate: SlippedFate) => void
    onClose: () => void
  }): JSX.Element
  ```

**Bar to clear:** 50 items triaged in under two minutes — so selection is bulk, and the four fates are always one tap away.

- [ ] **Step 1: Write the failing test**

Create `src/components/schedule/SlippedReview.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SlippedReview } from './SlippedReview'
import type { Task } from '@/types/task'

function task(p: Partial<Task>): Task {
  return {
    id: 'id', title: 't', completed: false, bucket: 'timed',
    scheduledFor: null, assignedTo: null, updatedAt: new Date(),
    ...p,
  } as Task
}

const tasks = [
  task({ id: 'new', title: 'recent thing', scheduledFor: new Date('2026-07-20') }),
  task({ id: 'old', title: 'call window blinds', scheduledFor: new Date('2025-12-01') }),
]

describe('SlippedReview', () => {
  it('lists oldest first with the age shown', () => {
    vi.setSystemTime(new Date('2026-08-03T12:00:00'))
    render(<SlippedReview tasks={tasks} onApply={() => {}} onClose={() => {}} />)
    const rows = screen.getAllByRole('listitem')
    expect(within(rows[0]).getByText('call window blinds')).toBeInTheDocument()
    expect(within(rows[0]).getByText(/245 days/)).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('applies a fate to every selected row in one action', async () => {
    const onApply = vi.fn()
    render(<SlippedReview tasks={tasks} onApply={onApply} onClose={() => {}} />)
    await userEvent.click(screen.getByRole('checkbox', { name: /select all/i }))
    await userEvent.click(screen.getByRole('button', { name: /someday/i }))
    expect(onApply).toHaveBeenCalledWith(['old', 'new'], 'someday')
  })

  it('offers all four fates', () => {
    render(<SlippedReview tasks={tasks} onApply={() => {}} onClose={() => {}} />)
    for (const name of [/today/i, /this week/i, /someday/i, /delete/i]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
  })

  it('does nothing when no rows are selected', async () => {
    const onApply = vi.fn()
    render(<SlippedReview tasks={tasks} onApply={onApply} onClose={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /someday/i }))
    expect(onApply).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run and verify it fails**

```bash
npx vitest run src/components/schedule/SlippedReview.test.tsx
```

Expected: FAIL — cannot resolve `./SlippedReview`.

- [ ] **Step 3: Implement**

Create `src/components/schedule/SlippedReview.tsx`:

```tsx
import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import type { Task } from '@/types/task'

export type SlippedFate = 'today' | 'week' | 'someday' | 'delete'

interface SlippedReviewProps {
  tasks: Task[]
  onApply: (ids: string[], fate: SlippedFate) => void
  onClose: () => void
}

const FATES: Array<{ fate: SlippedFate; label: string }> = [
  { fate: 'today', label: 'Today' },
  { fate: 'week', label: 'This week' },
  { fate: 'someday', label: 'Someday' },
  { fate: 'delete', label: 'Delete' },
]

function ageInDays(task: Task): number {
  if (!task.scheduledFor) return 0
  const a = new Date(task.scheduledFor)
  a.setHours(0, 0, 0, 0)
  const b = new Date()
  b.setHours(0, 0, 0, 0)
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

/**
 * Bulk triage for work that slipped past the grace window.
 *
 * Oldest first, because age is the only signal these rows reliably carry —
 * measured on real data, only 5 of 35 had a project and none had a non-zero
 * defer_count. Selection is bulk and the four fates are always one tap away:
 * the bar this has to clear is 50 items in under two minutes.
 */
export function SlippedReview({ tasks, onApply, onClose }: SlippedReviewProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const ordered = useMemo(
    () => [...tasks].sort((a, b) => ageInDays(b) - ageInDays(a)),
    [tasks],
  )

  const allSelected = selected.size === ordered.length && ordered.length > 0

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(ordered.map((t) => t.id)))
  }

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const apply = (fate: SlippedFate) => {
    if (selected.size === 0) return
    onApply(ordered.filter((t) => selected.has(t.id)).map((t) => t.id), fate)
    setSelected(new Set())
  }

  return (
    <div role="region" aria-label="Slipped work review" className="card p-4">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="font-display text-xl">Slipped</h2>
        <span className="text-sm text-neutral-500">
          {ordered.length} item{ordered.length === 1 ? '' : 's'} past the grace window
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close slipped review"
          className="ml-auto text-neutral-400 hover:text-neutral-600 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          <input
            type="checkbox"
            aria-label="Select all"
            checked={allSelected}
            onChange={toggleAll}
          />
          Select all
        </label>
        <div className="ml-auto flex items-center gap-1">
          {FATES.map(({ fate, label }) => (
            <button
              key={fate}
              type="button"
              onClick={() => apply(fate)}
              className="px-2.5 py-1 text-[13px] rounded-md border border-neutral-200 hover:bg-neutral-50 transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <ul className="space-y-0.5">
        {ordered.map((t) => (
          <li key={t.id} className="flex items-center gap-3 py-1.5">
            <input
              type="checkbox"
              aria-label={`Select ${t.title}`}
              checked={selected.has(t.id)}
              onChange={() => toggleOne(t.id)}
            />
            <span className="min-w-0 truncate">{t.title}</span>
            <span className="ml-auto shrink-0 text-xs text-neutral-400 tabular-nums">
              {ageInDays(t)} days
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Run and verify it passes**

```bash
npx vitest run src/components/schedule/SlippedReview.test.tsx
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/SlippedReview.tsx src/components/schedule/SlippedReview.test.tsx
git commit -m "feat(today): add the slipped review surface"
```

---

### Task 6: Wire the pointer and review into Today

**Files:**
- Modify: `src/components/schedule/TodayView.tsx:1025-1029` (the `OverdueSection` block) and its imports
- Test: `src/components/schedule/TodayView.test.tsx` (add to the existing file)

**Interfaces:**
- Consumes: `SlippedPointer` (Task 4), `SlippedReview` + `SlippedFate` (Task 5), `data.slippedTasks` (Task 3)
- Produces: no new exports.

`TodayView` already receives `onPushTask`, `onUpdateTask` and `onDeleteTask` — the four fates map onto them, so no new prop plumbing to `App.tsx` is required.

- [ ] **Step 1: Write the failing test**

Add to `src/components/schedule/TodayView.test.tsx`. That file's existing helper is `renderView(props, ctxOverrides)` and it uses `fireEvent` (imported from `@testing-library/react`) rather than `userEvent` — match it. Inspect how neighbouring tests in that file pass tasks in before writing this; the prop name must match what `renderView` spreads.

```tsx
describe('slipped queue', () => {
  function daysAgo(n: number): Date {
    const d = new Date()
    d.setHours(9, 0, 0, 0)
    d.setDate(d.getDate() - n)
    return d
  }

  it('shows the slipped pointer, keeps slipped rows off the page, and opens the review', () => {
    renderView({ tasks: [
      { id: 'c', title: 'carried thing', completed: false, bucket: 'timed', scheduledFor: daysAgo(1), assignedTo: null, updatedAt: new Date() },
      { id: 's', title: 'slipped thing', completed: false, bucket: 'timed', scheduledFor: daysAgo(200), assignedTo: null, updatedAt: new Date() },
    ] })
    expect(screen.getByText(/1 slipped/)).toBeInTheDocument()
    expect(screen.queryByText('slipped thing')).toBeNull()
    fireEvent.click(screen.getByText(/1 slipped/))
    expect(screen.getByRole('region', { name: /slipped work review/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run and verify it fails**

```bash
npx vitest run src/components/schedule/TodayView.test.tsx
```

Expected: FAIL — no "1 slipped" text.

- [ ] **Step 3: Implement**

Add imports to `TodayView.tsx`:

```tsx
import { SlippedPointer } from './SlippedPointer'
import { SlippedReview, type SlippedFate } from './SlippedReview'
```

Add state near the other `useState` declarations:

```tsx
const [slippedOpen, setSlippedOpen] = useState(false)
```

Add the fate handler next to the other callbacks:

```tsx
// The four fates map onto writers TodayView already has. 'today' uses
// pushTask with a real Date (its non-pool branch), the pools use its
// bucket branch, and delete is the only destructive one — it is never a
// default and is always an explicit tap on a hand-made selection.
const handleSlippedApply = useCallback((ids: string[], fate: SlippedFate) => {
  for (const id of ids) {
    if (fate === 'delete') onDeleteTask?.(id)
    else if (fate === 'today') onPushTask?.(id, new Date())
    else onPushTask?.(id, fate === 'week' ? 'week' : 'month')
  }
  setSlippedOpen(false)
}, [onDeleteTask, onPushTask])
```

> Note: `pushTask` accepts `'week' | 'month' | 'quarter'`, not `'someday'`. Map the Someday fate to the `'month'` pool unless `setBucket` is already threaded into this component — if it is, prefer `setBucket(id, 'someday')` and say so in the commit message.

Then, immediately after the closing tag of the existing `OverdueSection` block at `:1025-1029`, add:

```tsx
{data.isToday && (
  <SlippedPointer tasks={data.slippedTasks} onReview={() => setSlippedOpen(true)} />
)}
{slippedOpen && (
  <SlippedReview
    tasks={data.slippedTasks}
    onApply={handleSlippedApply}
    onClose={() => setSlippedOpen(false)}
  />
)}
```

Note the pointer sits **outside** the `data.overdueTasks.length > 0` guard on `:1025` — the carried-over lane can be empty while the slipped queue is not, and the floor guarantee says the pointer still renders.

- [ ] **Step 4: Run and verify**

```bash
npx vitest run src/components/schedule/TodayView.test.tsx
npx tsc --noEmit
```

Expected: PASS and clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/TodayView.tsx src/components/schedule/TodayView.test.tsx
git commit -m "feat(today): wire the slipped pointer and review into the page"
```

---

### Task 7: Give the wall the same grace floor

**Files:**
- Modify: `src/lib/today/taskPools.ts` — export the floor as a pure function
- Modify: `src/lib/today/taskPools.test.ts`
- Modify: `src/hooks/useWallData.ts:190-195`

**Interfaces:**
- Consumes: `GRACE_DAYS` from Task 1
- Produces: `export function graceFloor(from: Date, graceDays?: number): Date`

Without this the kitchen wall keeps showing all 50 while the laptop shows 10.

⚠️ **`src/hooks/useWallData.test.ts` does not exist**, and the hook fires twelve parallel Supabase queries — standing up a mock harness for it just to assert one query bound is a poor trade and a brittle test. Instead, extract the date arithmetic into a pure function, test *that* exhaustively, and have the hook call it. The untested part shrinks to a single call site.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/today/taskPools.test.ts`:

```ts
  describe('graceFloor', () => {
    it('is midnight, graceDays before the given date', () => {
      const floor = graceFloor(new Date('2026-08-03T18:42:11'))
      expect(floor.getFullYear()).toBe(2026)
      expect(floor.getMonth()).toBe(7)   // August
      expect(floor.getDate()).toBe(1)
      expect(floor.getHours()).toBe(0)
      expect(floor.getMinutes()).toBe(0)
      expect(floor.getSeconds()).toBe(0)
      expect(floor.getMilliseconds()).toBe(0)
    })

    it('crosses a month boundary', () => {
      expect(graceFloor(new Date('2026-08-01T12:00:00')).getMonth()).toBe(6) // July
      expect(graceFloor(new Date('2026-08-01T12:00:00')).getDate()).toBe(30)
    })

    it('honours an explicit graceDays', () => {
      expect(graceFloor(new Date('2026-08-03T12:00:00'), 0).getDate()).toBe(3)
      expect(graceFloor(new Date('2026-08-03T12:00:00'), 10).getDate()).toBe(24)
    })

    it('agrees with the partition: anything at or after the floor is carried over', () => {
      const now = new Date('2026-08-03T12:00:00')
      const atFloor = task({ id: 'f', scheduledFor: graceFloor(now) })
      expect(selectCarriedOver([atFloor], true, all, now).map(x => x.id)).toEqual(['f'])
    })
  })
```

Add `graceFloor` to the import at the top of the test file.

- [ ] **Step 2: Run and verify it fails**

```bash
npx vitest run src/lib/today/taskPools.test.ts -t graceFloor
```

Expected: FAIL — `graceFloor is not a function`.

- [ ] **Step 3: Implement**

In `src/lib/today/taskPools.ts`, next to `GRACE_DAYS`:

```ts
/**
 * The oldest date still inside the grace window, floored to local midnight.
 *
 * Exists so query-side consumers (the kitchen wall) can apply the same floor
 * the in-memory selectors apply, from one definition. The wall runs its own
 * PostgREST query rather than going through `selectCarriedOver`, and before
 * this it had no lower bound at all — it rendered every past-dated family task
 * ever created.
 */
export function graceFloor(from: Date, graceDays: number = GRACE_DAYS): Date {
  const floor = new Date(from)
  floor.setHours(0, 0, 0, 0)
  floor.setDate(floor.getDate() - graceDays)
  return floor
}
```

Then in `useWallData.ts`, import it:

```ts
import { graceFloor } from '@/lib/today/taskPools'
```

and compute the bound before the `Promise.all`, next to the other date strings:

```ts
// Expiry floor — mirrors Today's grace window so the wall and the laptop
// agree. Without it the wall renders every past-dated family task ever
// created; on 2026-08-03 that was 50 rows, the oldest 245 days old.
const overdueFloor = graceFloor(startDate)
```

Then add the bound to query 11:

```ts
        supabase
          .from('tasks')
          .select(TASK_COLUMNS)
          .lt('scheduled_for', startDate.toISOString())
          .gte('scheduled_for', overdueFloor.toISOString())
          .eq('completed', false)
          .eq('context', 'family'),
```

- [ ] **Step 4: Run and verify it passes**

```bash
npx vitest run src/lib/today/taskPools.test.ts
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/today/taskPools.ts src/lib/today/taskPools.test.ts src/hooks/useWallData.ts
git commit -m "fix(wall): apply the Today grace floor to the overdue query"
```

---

### Task 8: Lock the tray count to the grace window

**Files:**
- Modify: `src/desktop/trayPayload.ts:17`
- Test: `src/desktop/trayPayload.test.ts`

**Interfaces:**
- Consumes: `selectCarriedOver` from Task 1

- [ ] **Step 1: Write the failing test**

This file's existing helper is `makeTask(overrides)` and its clock constant is `NOW = new Date('2026-07-07T12:00:00')`. Use both.

```ts
it('the badge counts carried-over work, not the whole slipped backlog', () => {
  const recent = makeTask({ id: 'r', bucket: 'timed', scheduledFor: new Date('2026-07-06T09:00:00') })
  const ancient = makeTask({ id: 'a', bucket: 'timed', scheduledFor: new Date('2025-12-01T09:00:00') })
  expect(buildTrayPayload([recent, ancient], NOW).remaining).toBe(1)
})
```

- [ ] **Step 2: Run and verify it fails**

```bash
npx vitest run src/desktop/trayPayload.test.ts
```

Expected: FAIL — receives 2.

- [ ] **Step 3: Implement**

In `src/desktop/trayPayload.ts`, change the import to `selectCarriedOver` and line 17 to:

```ts
  const overdueRemaining = selectCarriedOver(tasks, true, matchAll, now).filter((t) => !t.completed)
```

- [ ] **Step 4: Run and verify it passes**

```bash
npx vitest run src/desktop/trayPayload.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/desktop/trayPayload.ts src/desktop/trayPayload.test.ts
git commit -m "fix(desktop): tray badge counts carried-over work only"
```

---

### Task 9: Delete the "Still relevant?" suggestion

**Files:**
- Modify: `src/lib/overdueSuggestions.ts:55-62`
- Modify: `supabase/functions/proactive-engine/index.ts:347-359`
- **Create:** `src/lib/overdueSuggestions.test.ts` — this file does not exist yet

The chip asked a question 57 times and resolved nothing. Expiry answers it structurally: an item 7+ days overdue is now, by definition, in the slipped queue and off Today.

- [ ] **Step 1: Write the failing test**

Create `src/lib/overdueSuggestions.test.ts` from scratch:

```ts
import { describe, it, expect } from 'vitest'
import { getOverdueSuggestions } from './overdueSuggestions'
import type { Task } from '@/types/task'

function task(p: Partial<Task>): Task {
  return {
    id: 'id', title: 't', completed: false, bucket: 'timed',
    scheduledFor: null, assignedTo: null, updatedAt: new Date(),
    ...p,
  } as Task
}

describe('getOverdueSuggestions', () => {
  it('no longer emits a stale check — expiry answers that question', () => {
    const t = task({ scheduledFor: new Date(Date.now() - 40 * 86400000) })
    expect(getOverdueSuggestions(t).some(s => s.type === 'stale')).toBe(false)
  })

  it('still offers to call when the task carries a phone number', () => {
    const t = task({ scheduledFor: new Date(Date.now() - 40 * 86400000), phoneNumber: '555-0100' })
    expect(getOverdueSuggestions(t, 'Dr Smith')[0]).toMatchObject({ type: 'call', phoneNumber: '555-0100' })
  })

  it('returns nothing for a completed task', () => {
    expect(getOverdueSuggestions(task({ completed: true }))).toEqual([])
  })
})
```

- [ ] **Step 2: Run and verify it fails**

```bash
npx vitest run src/lib/overdueSuggestions.test.ts
```

Expected: FAIL — a `stale` suggestion is returned.

- [ ] **Step 3: Implement**

Delete this block from `src/lib/overdueSuggestions.ts`:

```ts
  // 7+ days overdue, no rich context → might be stale
  if (daysOverdue >= 7 && !task.phoneNumber && !task.links?.length && !task.notes) {
    suggestions.push({
      type: 'stale',
      label: 'Still relevant?',
      detail: `${daysOverdue} days overdue, no context`,
    })
  }
```

Remove `'stale'` from the `OverdueSuggestion['type']` union at the top of that file. Delete the corresponding Rule 7 block from `supabase/functions/proactive-engine/index.ts` (`suggestion_type: 'stale'`, title `'Still relevant?'`).

`tsc` will flag any consumer that switched on `'stale'`; remove those branches too.

- [ ] **Step 4: Run and verify**

```bash
npx vitest run src/lib/overdueSuggestions.test.ts
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/overdueSuggestions.ts src/lib/overdueSuggestions.test.ts supabase/functions/proactive-engine/index.ts
git commit -m "refactor(assistant): drop the stale check — expiry answers it structurally"
```

> The edge function is **not deployed** by this commit. Deployment is handled in Task 12.

---

### Task 10: Make `defer_count` real

**Files:**
- Modify: `src/hooks/useSupabaseTasks.ts:1434-1471` (`pushTask`)
- Test: `src/hooks/useSupabaseTasks.test.ts`

**Why:** `defer_count` is read in `urgency.ts:111`, `useReviewData.ts:66`, `coachLines.ts:60`, `overdueSuggestions.ts:48` and proactive-engine Rule 6, and incremented nowhere — every `>= 3` branch is dead code. Per the spec it counts *deliberate pushes only*; passive slippage is covered by age, and expiry never writes.

- [ ] **Step 1: Write the failing test**

```ts
it('pushTask increments defer_count', async () => {
  const { result } = renderHook(() => useSupabaseTasks())
  await waitFor(() => expect(result.current.loading).toBe(false))
  await act(() => result.current.pushTask('t1', 'week'))
  expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ defer_count: 1 }))
})

it('pushTask increments from an existing count rather than resetting', async () => {
  // t2 is seeded with defer_count: 4
  const { result } = renderHook(() => useSupabaseTasks())
  await waitFor(() => expect(result.current.loading).toBe(false))
  await act(() => result.current.pushTask('t2', 'week'))
  expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ defer_count: 5 }))
})
```

Seed `t1` with `defer_count: null` and `t2` with `defer_count: 4` in the mock fixture.

- [ ] **Step 2: Run and verify it fails**

```bash
npx vitest run src/hooks/useSupabaseTasks.test.ts -t defer_count
```

Expected: FAIL — `defer_count` never appears in the update payload.

- [ ] **Step 3: Implement**

In `pushTask`, hoist the task lookup above the branch and add the increment to both `updateTask` calls:

```ts
  const pushTask = useCallback(async (id: string, target: Date | 'week' | 'month' | 'quarter') => {
    // A push is a deliberate act of deferral, so it is what defer_count counts.
    // Passive slippage is covered by age (scheduled_for is preserved), and
    // expiry is read-side so it never writes. Five existing consumers read this
    // column and every one of their `>= 3` branches was dead until now.
    const task = findTaskById(id)
    const nextDeferCount = (task?.deferCount ?? 0) + 1

    if (target === 'week' || target === 'month' || target === 'quarter') {
      await updateTask(id, {
        bucket: target,
        scheduledFor: undefined,
        weekStart: weekStartForBucket(target, currentWeekStart()),
        deferCount: nextDeferCount,
      })
    } else {
      const newScheduledFor = new Date(target)
      …unchanged body…
      await updateTask(id, {
        bucket: 'timed',
        scheduledFor: newScheduledFor,
        isAllDay: !hasSpecificTime,
        deferCount: nextDeferCount,
      })
    }
  }, [findTaskById, updateTask])
```

Delete the now-duplicated `const task = findTaskById(id)` from inside the `else` branch. `updateTask` already maps `deferCount` → `defer_count` at `:1101`, so no new mapping is needed.

- [ ] **Step 4: Run and verify**

```bash
npx vitest run src/hooks/useSupabaseTasks.test.ts
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSupabaseTasks.ts src/hooks/useSupabaseTasks.test.ts
git commit -m "fix(tasks): increment defer_count on push — five dead consumers go live"
```

---

### Task 11: Collapsible steps on the parent row

**Files:**
- Modify: `src/components/schedule/ScheduleItem.tsx:689-697` (the `hasSubtasks` chip)
- Test: `src/components/schedule/ScheduleItem.test.tsx`

**Interfaces:**
- Consumes: `item.subtaskCount`, `item.subtaskCompletedCount`, `item.originalTask?.subtasks`

This is the original request — subtasks collapsible in Today — now on a foundation where the steps are not also competing for day slots. Collapsed is the default.

- [ ] **Step 1: Write the failing test**

This file's existing helper is `renderRow(overrides: Partial<TimelineItem>)`, built on a `baseTask: TimelineItem` constant, and it uses `fireEvent`. Match that. The chip is desktop-only (`hidden md:inline-flex`), so check how neighbouring tests in this file handle the `useMobile` mock and follow the desktop path.

```tsx
describe('subtask chip', () => {
  const withSteps = {
    subtaskCount: 3,
    subtaskCompletedCount: 0,
    originalTask: {
      subtasks: [
        { id: 's1', title: 'step one', completed: false },
        { id: 's2', title: 'step two', completed: false },
        { id: 's3', title: 'step three', completed: false },
      ],
    },
  } as Partial<TimelineItem>

  it('toggles the step list, collapsed by default', () => {
    const { getByRole, queryByText, getByText } = renderRow(withSteps)
    expect(queryByText('step one')).toBeNull()
    fireEvent.click(getByRole('button', { name: /3 steps/i }))
    expect(getByText('step one')).toBeInTheDocument()
    fireEvent.click(getByRole('button', { name: /3 steps/i }))
    expect(queryByText('step one')).toBeNull()
  })

  it('expanding the steps does not also open the detail panel', () => {
    const onSelect = vi.fn()
    const { getByRole } = renderRow({ ...withSteps, ...({ onSelect } as object) })
    fireEvent.click(getByRole('button', { name: /3 steps/i }))
    expect(onSelect).not.toHaveBeenCalled()
  })
})
```

If `renderRow` only spreads `TimelineItem` overrides and not handler props, pass `onSelect` however the file's other handler tests do it.

- [ ] **Step 2: Run and verify it fails**

```bash
npx vitest run src/components/schedule/ScheduleItem.test.tsx -t 'subtask chip'
```

Expected: FAIL — the chip is a `<span>`, not a button.

- [ ] **Step 3: Implement**

Add state near the top of the component:

```tsx
const [stepsOpen, setStepsOpen] = useState(false)
```

Replace the `hasSubtasks` `<span>` at `:689-697` with a button carrying an accessible name, keeping the existing icon and `n/m` text:

```tsx
{hasSubtasks && (
  <button
    type="button"
    aria-expanded={stepsOpen}
    aria-label={`${item.subtaskCount} steps`}
    onClick={(e) => { e.stopPropagation(); setStepsOpen((v) => !v) }}
    className="hidden md:inline-flex shrink-0 items-center gap-1 text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
  >
    <ListChecks className="w-3 h-3" />
    {item.subtaskCompletedCount}/{item.subtaskCount}
    {stepsOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
  </button>
)}
```

Import `ListChecks`, `ChevronUp`, `ChevronDown` from `lucide-react` (this also removes the hand-rolled inline `<svg>`, matching the project's no-emoji/lucide convention).

Render the step list beneath the title block, inside the same container the `belowTitleAccessory` uses so it aligns with the title rather than the card edge:

```tsx
{stepsOpen && item.originalTask?.subtasks?.length ? (
  <ul className="mt-1 space-y-0.5 border-l-2 border-neutral-200 pl-3">
    {item.originalTask.subtasks.map((s) => (
      <li key={s.id} className="flex items-center gap-2 text-[13px] text-neutral-600">
        <span className={s.completed ? 'line-through text-neutral-400' : ''}>{s.title}</span>
      </li>
    ))}
  </ul>
) : null}
```

`e.stopPropagation()` is required — the row itself is a button that opens the detail panel.

- [ ] **Step 4: Run and verify**

```bash
npx vitest run src/components/schedule/ScheduleItem.test.tsx
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/ScheduleItem.tsx src/components/schedule/ScheduleItem.test.tsx
git commit -m "feat(today): the subtask chip expands its steps, collapsed by default"
```

---

### Task 12: Stop the agent stamping parent dates, backfill, deploy, verify

**Files:**
- Modify: `supabase/functions/symphony-agent/index.ts:101` (the `parent_task_id` tool-schema description) and the create-task handler
- Data: 6 rows in `tasks`

- [ ] **Step 1: Make a subtask born undated**

In the `symphony_create_task` handler, when `parent_task_id` is present, drop any `scheduled_for`/`bucket` the model supplied and insert with `bucket: 'inbox'`, `scheduled_for: null` — matching the in-app `addSubtask` (`useSupabaseTasks.ts:684-695`). Update the tool-schema description on `:101` to state it:

```ts
parent_task_id: {
  type: 'string',
  description:
    'id of the parent task to make this a subtask of. A subtask is a STEP, not a day commitment: it is always created undated, and any scheduled_for passed alongside this is ignored. Schedule a step only if it genuinely happens on its own separate day.',
},
```

- [ ] **Step 2: Verify the affected rows before touching them**

```bash
SUPABASE_ACCESS_TOKEN=$(security find-generic-password -s "Supabase CLI" -a "access-token" -w | sed 's/^go-keyring-base64://' | base64 -d)
curl -sS -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d "$(jq -n --arg q "select c.id, c.title, c.scheduled_for from tasks c join tasks p on p.id = c.parent_task_id where c.completed = false and c.scheduled_for::date = p.scheduled_for::date" '{query:$q}')" | jq -c '.[]'
```

Expected: 6 rows, 5 of them the vacation steps. **If the count is not 6, stop and report** — the data moved since the spec was written.

- [ ] **Step 3: Backfill**

```sql
update tasks c
set scheduled_for = null, bucket = 'inbox'
from tasks p
where p.id = c.parent_task_id
  and c.completed = false
  and c.scheduled_for::date = p.scheduled_for::date
```

Run it through the same Management API endpoint. Re-run Step 2's query afterwards; expected: 0 rows.

- [ ] **Step 4: Deploy the two edge functions**

Both `proactive-engine` (Task 9) and `symphony-agent` changed. Deploy with `--use-api`:

```bash
npx supabase functions deploy proactive-engine --use-api
npx supabase functions deploy symphony-agent --use-api
```

Confirm each reports success. Note that `proactive-engine` may have been undeployed before this change (see memory `context_graph_cannot_see_other_members_tasks`) — if the deploy surfaces unrelated pending changes, report them rather than assuming they are yours.

- [ ] **Step 5: Full gate, then commit and push**

```bash
node -v                 # v22.14.0
npx tsc --noEmit
npx vitest run
npm run build
npm run lint            # 8 pre-existing errors is the accepted baseline
```

All must pass (lint at baseline). Then:

```bash
git add supabase/functions/symphony-agent/index.ts
git commit -m "fix(agent): a subtask is born undated, never inheriting the parent's date"
git fetch origin && git rebase origin/main
git push origin HEAD:main
```

Pushing to `main` auto-deploys to production. Verify the deployment actually landed (`gh api repos/:owner/:repo/deployments` — pushes have silently missed the webhook before) and then check the live page at **app.symphony-os.com/today**.

---

## Verification by eye (required — type-checks are not inspection)

After Task 12, open the real page and confirm against real data:

1. `npm run dev`, open **localhost:5173/today**.
2. Carried over shows **~10 rows**, not 50.
3. `Brainstorm vacation ideas + start exploring` is **one row** showing `0/5`; clicking the chip reveals five steps; clicking again hides them.
4. A `N slipped · oldest 245 days · Review` line sits below the carried-over lane.
5. Clicking Review lists the slipped items oldest-first; `call window blinds` (245 days) is at the top; select-all + Someday clears them; `defer test` and `test out flows` can be deleted.
6. Empty the carried-over lane (complete or push everything in it) and confirm the slipped pointer **still renders** — that is the floor guarantee.
7. Check the kitchen wall (or `/wall` on localhost) shows the same reduced set, not 50.

## Definition of done

- [ ] `npx tsc --noEmit` clean
- [ ] `npx vitest run` — all green, no reduced assertions
- [ ] `npm run build` clean
- [ ] `npm run lint` at the 8-error baseline, no new errors
- [ ] Backfill verified: 0 subtasks sharing a parent's date
- [ ] Both edge functions deployed
- [ ] All 7 by-eye checks confirmed on real data
- [ ] Pushed to `origin/main` and the production deployment verified live
