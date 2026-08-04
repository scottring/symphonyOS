# Today Is A Commitment Surface — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Today render only commitments, and replace the three backlog pools it currently renders with one bounded, drainable attention line.

**Architecture:** Purely read-side. A new `src/lib/today/attention.ts` composes existing predicates (`selectSlipped`, `isStaleWeekPlacement`) plus two age thresholds into a single `AttentionItem[]`. `computeTodayData` stops returning `inboxTasks`/`weekTasks`/`monthTasks` and starts returning `attentionItems`. `SlippedPointer` generalises into `AttentionLine`. No schema change, no migration, no writes.

**Tech Stack:** React 19, TypeScript strict, Vitest + React Testing Library, Tailwind v4, path alias `@/` → `src/`.

## Global Constraints

- **Nothing in this change writes to the database.** No mutation, no migration, no backfill, no cron. If a task tempts you to write, the design is wrong — stop and flag it.
- **Node must be 22.14.0.** Node 26 breaks every bare-`localStorage` test. Run `node -v` first; if wrong, `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`.
- **`npm test` is watch mode.** Always use `npx vitest run <path>`.
- **Age is measured from `createdAt`, never `updatedAt`.** `tasks` has no `updated_at` trigger, so that column is unreliable.
- **Work happens in this worktree** (`.worktrees/intentional-today`, branch `intentional-today`). Never edit or commit in the main worktree.
- **No emojis in UI copy.** Use `lucide-react` icons.
- Thresholds, verbatim: `GRACE_DAYS = 2` (existing, do not redefine), `AGING_INBOX_DAYS = 14`, `AGING_MONTH_DAYS = 45`, `MAX_PROPOSALS_PER_DAY = 3`.

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/today/attention.ts` *(create)* | The attention predicate and its thresholds. Pure, `now`-injected. |
| `src/lib/today/attention.test.ts` *(create)* | Unit table for the predicate, including the podiatrist regression. |
| `src/lib/today/taskPools.ts` *(modify)* | Export the `Match` type so `attention.ts` shares it. |
| `src/lib/today/types.ts` *(modify)* | `TodayData` swaps three pool fields for `attentionItems`. |
| `src/lib/today/computeTodayData.ts` *(modify)* | Stop selecting the three pools; add `attentionItems`; fix `totalItems`. |
| `src/components/schedule/AttentionLine.tsx` *(create)* | The one bounded line. Replaces `SlippedPointer`. |
| `src/components/schedule/AttentionLine.test.tsx` *(create)* | Floor-guarantee and copy tests. |
| `src/components/schedule/SlippedPointer.tsx` *(delete)* | Superseded. |
| `src/components/schedule/TodayView.tsx` *(modify)* | Remove `PullStrip` + both `StagingFloat` triggers; render `AttentionLine`. |
| `src/components/schedule/PullStrip.tsx` *(delete)* | Today-only; the strip it drew is what we are removing. |
| `src/components/schedule/TodayInvariant.test.tsx` *(create)* | The regression guard: non-commitment rows do not grow with backlog. |

Task order is dependency order: the predicate (1) → the data layer (2) → the UI line (3) → removing the pools from the page (4) → the invariant test (5) → the Anytime row (6) → the proposal cap (7).

---

### Task 1: The attention predicate

**Files:**
- Create: `src/lib/today/attention.ts`
- Create: `src/lib/today/attention.test.ts`
- Modify: `src/lib/today/taskPools.ts:4` (export the `Match` type)

**Interfaces:**
- Consumes: `selectSlipped(tasks, isToday, match, now?, graceDays?)` and `GRACE_DAYS` from `./taskPools`; `isStaleWeekPlacement(task, viewedWeekStart)` from `./weekPlacement`.
- Produces: `AttentionReason`, `AttentionItem`, `AGING_INBOX_DAYS`, `AGING_MONTH_DAYS`, and `selectNeedsAttention(tasks, match, now, weekStart): AttentionItem[]`. Tasks 2 and 3 depend on these exact names.

- [ ] **Step 1: Export the `Match` type**

`src/lib/today/taskPools.ts` line 4 currently reads `type Match = ...`. Change it to:

```typescript
export type Match = (assignedTo: string | null | undefined, assignedToAll?: readonly string[] | null) => boolean
```

Do not redeclare `Match` in `attention.ts` — two copies of the assignee predicate drifting apart is the bug `weekPlacement.ts` was extracted to prevent.

- [ ] **Step 2: Write the failing test**

Create `src/lib/today/attention.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { selectNeedsAttention, AGING_INBOX_DAYS, AGING_MONTH_DAYS } from './attention'
import type { Task } from '@/types/task'

const NOW = new Date('2026-08-04T12:00:00')
const WEEK_START = new Date('2026-08-02T00:00:00')

function task(p: Partial<Task>): Task {
  return {
    id: 'id', title: 't', completed: false, bucket: 'inbox',
    scheduledFor: null, assignedTo: null,
    createdAt: new Date('2026-08-04T00:00:00'),
    updatedAt: new Date('2026-08-04T00:00:00'),
    subtasks: undefined,
    ...p,
  } as Task
}
const all = () => true

describe('selectNeedsAttention', () => {
  it('flags a dated task past the grace window as slipped', () => {
    const t = task({ id: 's1', bucket: 'timed', scheduledFor: new Date('2026-07-28T09:00:00') })
    const got = selectNeedsAttention([t], all, NOW, WEEK_START)
    expect(got.map(i => [i.task.id, i.reason])).toEqual([['s1', 'slipped']])
  })

  it('does NOT flag a dated task inside the grace window', () => {
    const t = task({ id: 'c1', bucket: 'timed', scheduledFor: new Date('2026-08-03T09:00:00') })
    expect(selectNeedsAttention([t], all, NOW, WEEK_START)).toEqual([])
  })

  // The podiatrist. bucket='week', week_start = the week of 2026-07-26, viewed
  // on 2026-08-04 — the exact row that was believed lost.
  it('flags a week placement left behind on a past week', () => {
    const t = task({ id: 'w1', bucket: 'week', weekStart: new Date('2026-07-26T00:00:00') })
    const got = selectNeedsAttention([t], all, NOW, WEEK_START)
    expect(got.map(i => [i.task.id, i.reason])).toEqual([['w1', 'stranded-week']])
  })

  it('does NOT flag a week placement on the current week', () => {
    const t = task({ id: 'w2', bucket: 'week', weekStart: new Date('2026-08-02T00:00:00') })
    expect(selectNeedsAttention([t], all, NOW, WEEK_START)).toEqual([])
  })

  it('does NOT flag a week placement with no week (legacy = current week)', () => {
    const t = task({ id: 'w3', bucket: 'week', weekStart: undefined })
    expect(selectNeedsAttention([t], all, NOW, WEEK_START)).toEqual([])
  })

  it('does NOT flag a week placement on a FUTURE week', () => {
    const t = task({ id: 'w4', bucket: 'week', weekStart: new Date('2026-08-09T00:00:00') })
    expect(selectNeedsAttention([t], all, NOW, WEEK_START)).toEqual([])
  })

  it('flags an inbox task older than the threshold, and reports its age', () => {
    const created = new Date(NOW)
    created.setDate(created.getDate() - (AGING_INBOX_DAYS + 1))
    const t = task({ id: 'i1', bucket: 'inbox', createdAt: created })
    const got = selectNeedsAttention([t], all, NOW, WEEK_START)
    expect(got.map(i => [i.task.id, i.reason])).toEqual([['i1', 'aging-inbox']])
    expect(got[0].ageDays).toBe(AGING_INBOX_DAYS + 1)
  })

  it('does NOT flag an inbox task exactly at the threshold', () => {
    const created = new Date(NOW)
    created.setDate(created.getDate() - AGING_INBOX_DAYS)
    const t = task({ id: 'i2', bucket: 'inbox', createdAt: created })
    expect(selectNeedsAttention([t], all, NOW, WEEK_START)).toEqual([])
  })

  it('flags a month task older than the month threshold', () => {
    const created = new Date(NOW)
    created.setDate(created.getDate() - (AGING_MONTH_DAYS + 1))
    const t = task({ id: 'm1', bucket: 'month', createdAt: created })
    const got = selectNeedsAttention([t], all, NOW, WEEK_START)
    expect(got.map(i => [i.task.id, i.reason])).toEqual([['m1', 'aging-month']])
  })

  it('never flags a someday task, however old', () => {
    const created = new Date('2024-01-01T00:00:00')
    const t = task({ id: 'sd1', bucket: 'someday', createdAt: created })
    expect(selectNeedsAttention([t], all, NOW, WEEK_START)).toEqual([])
  })

  it('never flags a completed task', () => {
    const t = task({ id: 'd1', bucket: 'week', completed: true, weekStart: new Date('2026-07-26T00:00:00') })
    expect(selectNeedsAttention([t], all, NOW, WEEK_START)).toEqual([])
  })

  it('respects the assignee match', () => {
    const t = task({ id: 'x1', bucket: 'week', assignedTo: 'someone-else', weekStart: new Date('2026-07-26T00:00:00') })
    const none = () => false
    expect(selectNeedsAttention([t], none, NOW, WEEK_START)).toEqual([])
  })

  it('reports each task at most once', () => {
    const t = task({ id: 'once', bucket: 'week', weekStart: new Date('2026-07-26T00:00:00') })
    expect(selectNeedsAttention([t, t], all, NOW, WEEK_START).filter(i => i.task.id === 'once')).toHaveLength(1)
  })
})
```

- [ ] **Step 3: Run the test and confirm it fails**

```bash
cd .worktrees/intentional-today
node -v   # must print v22.14.0
npx vitest run src/lib/today/attention.test.ts
```

Expected: FAIL — `Failed to resolve import "./attention"`.

- [ ] **Step 4: Write the implementation**

Create `src/lib/today/attention.ts`:

```typescript
/**
 * What needs attention, and why — Today's one bounded signal.
 *
 * Expiry (see `taskPools.ts`) gave DATED work a lifecycle: today, carried over,
 * slipped. Placed-but-undated work never had one. A task placed on a week that
 * passed, or captured to the inbox and forgotten, sat in a legitimate home that
 * no daily surface rendered — which is how three real tasks were believed lost
 * on 2026-08-04.
 *
 * This is the read-side answer, and it never writes. `week_start` is not
 * rolled forward and `scheduled_for` is not cleared: the stale value IS the age
 * signal, and a wrong filter is a one-line fix where a wrong migration against
 * the only copy of someone's life is not.
 *
 * Composed from the existing predicates rather than reimplementing them, so the
 * definitions cannot drift.
 */

import type { Task } from '@/types/task'
import { selectSlipped, type Match } from './taskPools'
import { isStaleWeekPlacement } from './weekPlacement'

export type AttentionReason = 'slipped' | 'stranded-week' | 'aging-month' | 'aging-inbox'

/**
 * How long capture may sit before it counts as rotting. Two weeks is long
 * enough that ordinary weekly triage never trips it, short enough that a
 * forgotten item surfaces while its context is still recoverable.
 */
export const AGING_INBOX_DAYS = 14

/**
 * The month bucket has no month.
 *
 * `tasks` carries exactly one period anchor, `week_start`, so a month-bucket
 * task cannot be "placed on a month that passed" — there is nothing to compare.
 * Rather than invent an anchor, this measures the honest thing: how long the
 * item has sat in the bucket. 45 days covers a full month plus slack, so a
 * genuine this-month placement never trips it.
 */
export const AGING_MONTH_DAYS = 45

export interface AttentionItem {
  task: Task
  reason: AttentionReason
  ageDays: number
}

/** Whole days between two instants, both floored to local midnight. */
function daysBetween(from: Date, to: Date): number {
  const a = new Date(from)
  a.setHours(0, 0, 0, 0)
  const b = new Date(to)
  b.setHours(0, 0, 0, 0)
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

/**
 * Age from `createdAt`, never `updatedAt`.
 *
 * `tasks` has no `updated_at` trigger (unlike contacts, projects, event_notes),
 * so that column is written only when app code happens to set it. Measuring
 * from it would under-report age on exactly the oldest items — the ones this
 * signal exists to catch.
 */
function ageDays(task: Task, now: Date): number {
  return daysBetween(task.createdAt, now)
}

export function selectNeedsAttention(
  tasks: Task[],
  match: Match,
  now: Date,
  weekStart: Date,
): AttentionItem[] {
  const out: AttentionItem[] = []
  const claimed = new Set<string>()

  const push = (task: Task, reason: AttentionReason, age: number) => {
    if (claimed.has(task.id)) return
    claimed.add(task.id)
    out.push({ task, reason, ageDays: age })
  }

  // Dated work past its grace window. `isToday` is true because attention is
  // only ever computed for the live day.
  for (const task of selectSlipped(tasks, true, match, now)) {
    if (task.completed) continue
    push(task, 'slipped', daysBetween(task.scheduledFor as Date, now))
  }

  for (const task of tasks) {
    if (task.completed) continue
    if (!match(task.assignedTo, task.assignedToAll)) continue

    if (task.bucket === 'week') {
      // NULL weekStart means "the current week" — not late. Future weeks are
      // deliberate. Only a week already passed is stranded.
      if (isStaleWeekPlacement(task, weekStart)) {
        push(task, 'stranded-week', ageDays(task, now))
      }
      continue
    }

    if (task.bucket === 'month') {
      const age = ageDays(task, now)
      if (age > AGING_MONTH_DAYS) push(task, 'aging-month', age)
      continue
    }

    if (task.bucket === 'inbox') {
      const age = ageDays(task, now)
      if (age > AGING_INBOX_DAYS) push(task, 'aging-inbox', age)
      continue
    }

    // 'someday' is deliberately absent. Someday means "no timeline"; aging it
    // would make the count un-drainable, which is the exact failure this
    // design exists to avoid.
  }

  return out
}
```

- [ ] **Step 5: Run the test and confirm it passes**

```bash
npx vitest run src/lib/today/attention.test.ts
```

Expected: PASS, 13 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/today/attention.ts src/lib/today/attention.test.ts src/lib/today/taskPools.ts
git commit -m "feat(today): a predicate for work that needs attention

Expiry gave dated work a lifecycle; placed-but-undated work never had
one, which is how a week placement on a past week became invisible on
every daily surface. Composed from selectSlipped and
isStaleWeekPlacement so the definitions cannot drift. Read-side only."
```

---

### Task 2: Swap the pools for the attention set in the data layer

**Files:**
- Modify: `src/lib/today/types.ts:56-59`, `:87-90`
- Modify: `src/lib/today/computeTodayData.ts:4`, `:28-30`, `:96`, `:103-105`
- Modify: `src/lib/today/computeTodayData.test.ts`

**Interfaces:**
- Consumes: `selectNeedsAttention`, `AttentionItem` from Task 1.
- Produces: `TodayData.attentionItems: AttentionItem[]`, and the removal of `TodayData.inboxTasks`, `.weekTasks`, `.monthTasks`. Tasks 3–5 depend on this shape.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/today/computeTodayData.test.ts`:

```typescript
describe('computeTodayData — Today is a commitment surface', () => {
  it('no longer returns the inbox, week, or month pools', () => {
    const data = computeTodayData(baseInput())
    expect('inboxTasks' in data).toBe(false)
    expect('weekTasks' in data).toBe(false)
    expect('monthTasks' in data).toBe(false)
  })

  it('returns the attention set instead', () => {
    const data = computeTodayData(baseInput())
    expect(Array.isArray(data.attentionItems)).toBe(true)
  })

  it('totalItems does not count backlog — a day with only inbox items is clear', () => {
    const input = baseInput()
    input.tasks = [
      { id: 'i1', title: 'old capture', completed: false, bucket: 'inbox',
        scheduledFor: null, assignedTo: null,
        createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') } as Task,
    ]
    expect(computeTodayData(input).counts.totalItems).toBe(0)
  })
})
```

`baseInput()` is the existing helper in that file. If it is named differently, use whatever the file already uses to build a `TodayDataInput` — do not invent a new one.

- [ ] **Step 2: Run the test and confirm it fails**

```bash
npx vitest run src/lib/today/computeTodayData.test.ts
```

Expected: FAIL — `inboxTasks` still present, `attentionItems` undefined.

- [ ] **Step 3: Update the `TodayData` type**

In `src/lib/today/types.ts`, add the import and replace the three pool fields (lines 57-59):

```typescript
import type { AttentionItem } from './attention'
```

```typescript
  slippedTasks: Task[]
  /** What needs attention, and why — Today's one bounded signal. Replaces the
   *  inbox/week/month pools, which were backlog rendered on an execution
   *  surface. */
  attentionItems: AttentionItem[]
  completedInboxTasks: Task[]
```

And in the empty-state literal (lines 87-90), replace the three `[]` entries with:

```typescript
  slippedTasks: [],
  attentionItems: [],
  completedInboxTasks: [],
```

- [ ] **Step 4: Update `computeTodayData`**

In `src/lib/today/computeTodayData.ts`:

Line 4 — drop the three pool imports, keep the rest:

```typescript
import { selectCarriedOver, selectSlipped, selectCompletedInbox, selectTimed } from './taskPools'
import { selectNeedsAttention } from './attention'
```

Lines 28-30 — replace the three `select*` calls with:

```typescript
  const attentionItems = isToday
    ? selectNeedsAttention(input.tasks, match, new Date(), input.weekStart ?? new Date())
    : []
```

Line 96 — `totalItems` must stop counting `inboxTasks`, or a day whose only remaining work is backlog renders as busy while showing nothing. This is expiry trap #1 recurring:

```typescript
  const totalItems = timedTasks.length + filteredEvents.length + visibleRoutines.length + overdueTasks.length
```

Lines 103-105 — the returned object:

```typescript
    slippedTasks,
    attentionItems,
    completedInboxTasks,
```

- [ ] **Step 5: Run the full today suite**

```bash
npx vitest run src/lib/today/
```

Expected: PASS. Other suites in this directory reference the removed fields; fix each by deleting the assertion about a pool Today no longer owns — do not re-add the field to keep a test green.

- [ ] **Step 6: Typecheck**

```bash
npx tsc --noEmit
```

Expected: errors only in `TodayView.tsx`, `InboxView.tsx`, `useSystemHealth.ts`, and `PullStrip.tsx` — those are Tasks 3 and 4. Note them and continue.

- [ ] **Step 7: Commit**

```bash
git add src/lib/today/
git commit -m "refactor(today): the page carries commitments, not the backlog

computeTodayData stops selecting the inbox, week, and month pools and
returns the attention set instead. totalItems stops counting backlog so
a day whose only work is untriaged still reads as clear."
```

---

### Task 3: `AttentionLine` replaces `SlippedPointer`

**Files:**
- Create: `src/components/schedule/AttentionLine.tsx`
- Create: `src/components/schedule/AttentionLine.test.tsx`
- Delete: `src/components/schedule/SlippedPointer.tsx`, `src/components/schedule/SlippedPointer.test.tsx`

**Interfaces:**
- Consumes: `AttentionItem` from Task 1.
- Produces: `<AttentionLine items={AttentionItem[]} onReview={() => void} />`. Task 4 renders it.

- [ ] **Step 1: Write the failing test**

Create `src/components/schedule/AttentionLine.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AttentionLine } from './AttentionLine'
import type { AttentionItem } from '@/lib/today/attention'
import type { Task } from '@/types/task'

function item(id: string, reason: AttentionItem['reason'], ageDays: number): AttentionItem {
  return { task: { id, title: id } as Task, reason, ageDays }
}

describe('AttentionLine', () => {
  it('renders nothing when there is nothing to attend to', () => {
    const { container } = render(<AttentionLine items={[]} onReview={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('states the count and the oldest age', () => {
    render(<AttentionLine items={[item('a', 'slipped', 5), item('b', 'stranded-week', 38)]} onReview={() => {}} />)
    expect(screen.getByText(/2 need attention/)).toBeInTheDocument()
    expect(screen.getByText(/oldest 38 days/)).toBeInTheDocument()
  })

  it('says "1 needs attention" for a single item', () => {
    render(<AttentionLine items={[item('a', 'slipped', 3)]} onReview={() => {}} />)
    expect(screen.getByText(/1 needs attention/)).toBeInTheDocument()
  })

  // The floor guarantee, inherited verbatim from SlippedPointer: the pointer
  // back to work that left Today must be impossible to lose.
  it('offers no way to dismiss it', () => {
    render(<AttentionLine items={[item('a', 'slipped', 3)]} onReview={() => {}} />)
    expect(screen.queryByRole('button', { name: /dismiss|close|not now/i })).toBeNull()
  })

  it('calls onReview when activated', async () => {
    const onReview = vi.fn()
    render(<AttentionLine items={[item('a', 'slipped', 3)]} onReview={onReview} />)
    await userEvent.click(screen.getByRole('button'))
    expect(onReview).toHaveBeenCalledOnce()
  })

  // The invariant, at component scale.
  it('renders the same number of rows for 3 items as for 300', () => {
    const few = Array.from({ length: 3 }, (_, i) => item(`f${i}`, 'aging-inbox', i + 1))
    const many = Array.from({ length: 300 }, (_, i) => item(`m${i}`, 'aging-inbox', i + 1))
    const a = render(<AttentionLine items={few} onReview={() => {}} />)
    const aCount = a.container.querySelectorAll('button').length
    a.unmount()
    const b = render(<AttentionLine items={many} onReview={() => {}} />)
    expect(b.container.querySelectorAll('button').length).toBe(aCount)
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
npx vitest run src/components/schedule/AttentionLine.test.tsx
```

Expected: FAIL — cannot resolve `./AttentionLine`.

- [ ] **Step 3: Write the component**

Create `src/components/schedule/AttentionLine.tsx`:

```typescript
import { useMemo } from 'react'
import { Archive } from 'lucide-react'
import type { AttentionItem } from '@/lib/today/attention'

interface AttentionLineProps {
  items: AttentionItem[]
  onReview: () => void
}

/**
 * One line closing Today: "3 need attention · oldest 38 days".
 *
 * The floor guarantee, inherited from SlippedPointer. Work now leaves Today on
 * its own — dates expire, and backlog never appears here at all — so the
 * pointer back to it must be impossible to lose: whenever the set is non-empty
 * this renders, it never expands inline, and it has no dismiss control.
 *
 * It is one row at three items and one row at three hundred. That is the
 * invariant the whole redesign rests on: anything that is not a commitment
 * gets a fixed budget that does not grow with the backlog.
 *
 * The count is drainable by construction — it counts only what is genuinely
 * late, so it reaches zero and the line disappears. A badge over the whole
 * backlog would read 96 forever and become wallpaper.
 */
export function AttentionLine({ items, onReview }: AttentionLineProps) {
  const oldestDays = useMemo(
    () => items.reduce((max, i) => (i.ageDays > max ? i.ageDays : max), 0),
    [items],
  )

  if (items.length === 0) return null

  return (
    <button
      type="button"
      onClick={onReview}
      className="w-full flex items-center gap-2 px-3 md:px-0 py-2 mt-1 text-left text-[13px] text-neutral-500 hover:text-neutral-700 transition-colors"
    >
      <Archive className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
      <span className="font-medium text-neutral-600 shrink-0">
        {items.length} {items.length === 1 ? 'needs' : 'need'} attention
      </span>
      <span className="text-neutral-400 shrink-0">· oldest {oldestDays} days</span>
      <span className="ml-auto text-primary-600 shrink-0">Review</span>
    </button>
  )
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npx vitest run src/components/schedule/AttentionLine.test.tsx
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Delete the superseded component**

```bash
git rm src/components/schedule/SlippedPointer.tsx src/components/schedule/SlippedPointer.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add src/components/schedule/AttentionLine.tsx src/components/schedule/AttentionLine.test.tsx
git commit -m "feat(today): one line for everything that needs attention

Generalises SlippedPointer from slipped dated work to all four reasons,
keeping its three load-bearing properties: always renders when non-empty,
never expands inline, no dismiss control. One row at three items and one
row at three hundred."
```

---

### Task 4: Remove the backlog from the page

**Files:**
- Modify: `src/components/schedule/TodayView.tsx` (imports at `:59`, `:64`; renders at `:465`, `:469`, `:1139`; the `PullStrip` usage)
- Delete: `src/components/schedule/PullStrip.tsx` and its test if one exists
- Modify: `src/components/schedule/SlippedReview.tsx` to accept `AttentionItem[]`

**Interfaces:**
- Consumes: `AttentionLine` (Task 3), `TodayData.attentionItems` (Task 2).
- Produces: a `TodayView` that renders no backlog pool. Task 5 asserts this.

- [ ] **Step 1: Find every reference before changing anything**

```bash
grep -n "PullStrip\|StagingFloat\|SlippedPointer\|inboxTasks\|weekTasks\|monthTasks" src/components/schedule/TodayView.tsx
```

Record the line numbers. Line numbers in this plan were taken before Tasks 1–3 and will have shifted.

- [ ] **Step 2: Remove the three backlog renders**

- Delete the `PullStrip` import and its JSX usage entirely.
- Delete both inline `StagingFloat` renders — the `horizon="week"` one (was line 465) and the `horizon="month"` one (was line 469). **Keep the `StagingFloat` import only if another usage remains in this file**; if not, remove the import too. Do **not** delete `StagingFloat.tsx` — the horizon pages still use it.

- [ ] **Step 3: Swap the pointer for the line**

Replace the `SlippedPointer` import with:

```typescript
import { AttentionLine } from './AttentionLine'
```

and its render (was line 1139) with:

```tsx
<AttentionLine
  items={data.attentionItems}
  onReview={() => setSlippedReviewOpen(true)}
/>
```

Use whatever state setter the existing `SlippedPointer` `onReview` prop already calls — do not invent a new one.

- [ ] **Step 4: Widen `SlippedReview` to all four reasons**

`SlippedReview` currently takes `Task[]`. Change its prop to `items: AttentionItem[]` and group the list by `reason`, with these exact headings:

| `reason` | Heading |
|---|---|
| `slipped` | Past their date |
| `stranded-week` | Left behind on a past week |
| `aging-month` | Sitting in this month |
| `aging-inbox` | Never triaged |

Keep every existing fate action working — the review surface's job is unchanged, only its input widened.

- [ ] **Step 5: Delete `PullStrip`**

```bash
git rm src/components/schedule/PullStrip.tsx
ls src/components/schedule/PullStrip.test.tsx 2>/dev/null && git rm src/components/schedule/PullStrip.test.tsx
```

- [ ] **Step 6: Typecheck and run the schedule suite**

```bash
npx tsc --noEmit
npx vitest run src/components/schedule/
```

Expected: both clean. `InboxView.tsx` and `useSystemHealth.ts` call `selectInbox`/`selectWeek`/`selectMonth` **directly** from `taskPools`, which are untouched — if they error, you removed an export you should not have.

- [ ] **Step 7: Commit**

```bash
git add -A src/components/schedule/
git commit -m "refactor(today): the backlog leaves the page

Removes PullStrip and both StagingFloat triggers. Inbox, /week and
/month remain the canonical homes for that work; Today stops being a
second, unbounded copy of them. SlippedReview widens to all four
attention reasons."
```

---

### Task 5: The invariant, as a test

**Files:**
- Create: `src/components/schedule/TodayInvariant.test.tsx`

**Interfaces:**
- Consumes: `computeTodayData` (Task 2).
- Produces: nothing. This is the regression guard.

- [ ] **Step 1: Write the test**

Create `src/components/schedule/TodayInvariant.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest'
import { computeTodayData } from '@/lib/today/computeTodayData'
import type { Task } from '@/types/task'

/**
 * The invariant the redesign rests on: anything on Today that is not a
 * commitment gets a fixed budget that does not grow with backlog size.
 *
 * Every one of the six pools Today used to render arrived for a defensible
 * reason and none was ever removed. A stated, tested invariant is what stops
 * the seventh.
 */
function backlog(n: number): Task[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `b${i}`, title: `backlog ${i}`, completed: false, bucket: 'inbox',
    scheduledFor: null, assignedTo: null,
    createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
  }) as Task)
}

function inputWith(tasks: Task[]) {
  return {
    tasks, events: [], routines: [], dateInstances: [],
    viewedDate: new Date(), selectedAssignee: [], hideRoutines: false,
    weekStart: new Date(),
  } as unknown as Parameters<typeof computeTodayData>[0]
}

describe('Today invariant: non-commitment space is fixed', () => {
  it('a 5-item backlog and a 500-item backlog produce the same committed rows', () => {
    const small = computeTodayData(inputWith(backlog(5)))
    const large = computeTodayData(inputWith(backlog(500)))
    expect(large.counts.totalItems).toBe(small.counts.totalItems)
    expect(large.counts.actionableCount).toBe(small.counts.actionableCount)
  })

  it('neither day is reported as busy — backlog is not the day', () => {
    expect(computeTodayData(inputWith(backlog(500))).counts.totalItems).toBe(0)
  })

  it('the attention set is the ONLY thing that grows, and it is rendered as one line', () => {
    const large = computeTodayData(inputWith(backlog(500)))
    expect(large.attentionItems.length).toBeGreaterThan(0)
    // AttentionLine.test.tsx asserts the one-row rendering; this asserts the
    // data reaches it rather than reaching the timeline.
    expect(large.grouped).toBeDefined()
  })
})
```

If `inputWith` does not typecheck against the real `TodayDataInput`, use the existing fixture in `src/lib/today/__fixtures__/todayScenarios.ts` and override `tasks` — prefer the fixture over a hand-rolled cast.

- [ ] **Step 2: Run it**

```bash
npx vitest run src/components/schedule/TodayInvariant.test.tsx
```

Expected: PASS, 3 tests.

- [ ] **Step 3: Commit**

```bash
git add src/components/schedule/TodayInvariant.test.tsx
git commit -m "test(today): the non-commitment budget does not grow with backlog

Six pools arrived on Today one defensible decision at a time and none
was ever removed. This is what stops the seventh."
```

---

### Task 6: The Anytime row

**Files:**
- Modify: `src/components/schedule/TodayView.tsx` (the Unscheduled section, around `:313-317`)
- Modify or create: the section's test file in `src/components/schedule/`

**Interfaces:**
- Consumes: the existing `selectVisibleRoutines` output and `routineStatusMap` already in `TodayView`.
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Read what already exists**

```bash
grep -n "Unscheduled\|untimed\|collapsedKeys" src/components/schedule/TodayView.tsx | head -20
```

TodayView already has an Unscheduled section that starts collapsed because it holds the untimed-routine slab. **This task changes its collapsed presentation only.** Do not build a new section.

- [ ] **Step 2: Write the failing test**

Add to the section's existing test file (or create `src/components/schedule/AnytimeRow.test.tsx`):

```typescript
it('collapsed, the untimed routines read as one row with a completion count', () => {
  // Render TodayView with 12 untimed routines, 4 of them complete.
  // Assert exactly one row is visible and it states "Anytime" and "4 of 12".
  expect(screen.getByText(/Anytime/)).toBeInTheDocument()
  expect(screen.getByText(/4 of 12/)).toBeInTheDocument()
})

it('collapsed height does not grow with routine count', () => {
  // 12 untimed routines and 60 untimed routines both render one collapsed row.
})
```

Fill both bodies using the render helpers the neighbouring tests in that file already use — match their setup rather than inventing one.

- [ ] **Step 3: Implement**

In the Unscheduled section header, when collapsed, render a single row:

```
Anytime · 4 of 12 done
```

Derive the counts from `countRoutineUnits` (already imported in `computeTodayData`) or the existing `routineStatusMap` — do not recount by hand, and do not use a flat routine count: it double-counts collection steps and misses a dosed routine's extra slots.

- [ ] **Step 4: Run the tests**

```bash
npx vitest run src/components/schedule/
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A src/components/schedule/
git commit -m "feat(today): 39 untimed routines collapse to one Anytime row

A routine with a time is a commitment to a moment and keeps its row. One
without a time is not — but it is still the daily rhythm, so it collapses
to a single row carrying its own answer rather than leaving the page."
```

---

### Task 7: Cap the proposals

**Files:**
- Modify: wherever the unprompted assistant lines are rendered in `TodayView.tsx` (introduced in `f47cc307`)

**Interfaces:**
- Consumes: the existing proposal/suggestion list.
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Locate them**

```bash
git show f47cc307 --stat
grep -n "suggestion\|proposal\|unprompted" src/components/schedule/TodayView.tsx | head -20
```

- [ ] **Step 2: Write the failing test**

```typescript
it('renders at most MAX_PROPOSALS_PER_DAY proposals however many score well', () => {
  // Supply 20 high-scoring proposals; assert exactly 3 render.
})
```

- [ ] **Step 3: Implement**

Define next to the render site:

```typescript
/**
 * Relevance decides WHICH proposals surface, never HOW MANY.
 *
 * Without this cap, Today's finishability is only as good as the scoring
 * function's restraint — the invariant would hold only by luck.
 */
const MAX_PROPOSALS_PER_DAY = 3
```

and `.slice(0, MAX_PROPOSALS_PER_DAY)` at the render site. Do not sort here; the existing ordering already encodes relevance.

- [ ] **Step 4: Run, then commit**

```bash
npx vitest run src/components/schedule/
git add -A src/components/schedule/
git commit -m "feat(today): cap proposals at a fixed count per day

Relevance picks which items surface, never how many."
```

---

### Task 8: Verify against real data, then merge

- [ ] **Step 1: Full gate**

```bash
node -v            # v22.14.0
npx tsc --noEmit
npx vitest run
npm run build      # tsc alone is not the Vercel build
npm run lint
```

All must pass. `npm run build` is required — the pre-push hook runs `tsc` only, and they differ.

- [ ] **Step 2: Look at the page**

```bash
npm run dev        # localhost:5173
```

A type-check is not an inspection. Open Today and confirm, by eye:

1. No inbox pile, no week strip, no month strip.
2. Untimed routines are one collapsed `Anytime` row.
3. The attention line appears and reads roughly `3 need attention · oldest N days`.
4. **The three stranded tasks — "schedule podiatrist", "schedule dermatology", "pack for ny trip" — are in the review surface under "Left behind on a past week".** This is the end-to-end proof and the reason the feature exists.
5. With the attention set empty, the line disappears entirely.

- [ ] **Step 3: Rebase and push**

```bash
git fetch origin
git rebase origin/main
npx vitest run && npm run build
git push origin HEAD:main
```

Pushing to `main` auto-deploys to production. Only push once every check above is green.

- [ ] **Step 4: Verify the deploy landed**

```bash
gh api repos/:owner/:repo/deployments --jq '.[0] | {sha, created_at}'
```

A push to `main` has silently failed to deploy before. Confirm at **app.symphony-os.com**.

- [ ] **Step 5: Remove the worktree**

```bash
cd /Users/scottkaufman/Developer/Developer/symphonyOS
git worktree remove .worktrees/intentional-today
git branch -d intentional-today
```

---

## Self-Review

**Spec coverage:** invariant → Task 5. Body/commitments → Tasks 2, 4. Anytime row → Task 6. Attention line → Tasks 1, 3. Read-side carry-forward → Task 1. Proposal cap → Task 7. `totalItems` follow-through → Task 2 Step 4. `PullStrip` removal → Task 4. Non-goals (no page, no badge, no migration) → nothing in any task creates them.

**Deliberately deferred, not forgotten:** `computeClaritySteps` still reads `inboxCount`/`weekCount` (spec, "Known follow-through"). The spec's default is to leave it — clarity measures system health, not the page — so no task changes it. If Scott wants it moved, it is a one-file follow-up.

**Type consistency:** `AttentionItem`, `AttentionReason`, `selectNeedsAttention`, `AGING_INBOX_DAYS`, `AGING_MONTH_DAYS` are defined in Task 1 and used with identical names in Tasks 2, 3, and 5. `Match` is exported once in Task 1 Step 1 and imported thereafter. `attentionItems` is the field name in Tasks 2, 4, and 5.

**Known softness:** Tasks 6 and 7 contain test bodies described rather than written, because both depend on `TodayView`'s existing render-helper setup, which differs per test file in that directory. The instruction in each is to match the neighbouring tests. Every other task carries complete, runnable code.
