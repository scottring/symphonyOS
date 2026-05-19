# Today Rebuild — Phase 1: `useTodayData` Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the legacy `TodaySchedule` data logic (grouping, overdue, week/inbox pools, counts, routine/event status resolution) into a pure, fully-tested `computeTodayData()` module plus a thin `useTodayData()` hook, with a parity test proving it reproduces the legacy output — without touching the live route.

**Architecture:** A pure function `computeTodayData(input): TodayData` ports each legacy `useMemo` verbatim (no behavior change). `useTodayData(input)` is a thin `useMemo` wrapper. Built behind the seam: nothing imports it into the route in this phase. A parity test feeds representative fixtures and asserts exact output, so the later cutover that deletes `TodaySchedule` is safe.

**Tech Stack:** React 19 + TypeScript (strict), Vitest. Pure module + hook; no UI in this phase.

**Spec:** `docs/superpowers/specs/2026-05-19-today-redesign-rebuild-design.md` (§3 seam, §7 data hook, §9 parity).

---

## Pre-flight (not a code task)

- Work in the existing worktree: `/Users/scottkaufman/Developer/Developer/symphonyOS/.claude/worktrees/today-redesign-layer1` (branch `worktree-today-redesign-layer1`). Do NOT touch the main repo.
- Node PATH for every command: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`.
- Baseline: `npm test -- --run` → expect the single pre-existing unrelated failure `src/hooks/useSpaces.test.ts` and ~2040+ passing. No NEW failures allowed by this phase.
- This phase adds new files only and does NOT modify `TodaySchedule.tsx`, `HomeView.tsx`, or `ViewRouter.tsx`. The live route is untouched until the Phase 5 cutover (separate plan).

## Reference: legacy logic being ported (read-only context)

All in `src/components/schedule/TodaySchedule.tsx` (current line anchors; the engineer must read the file to confirm exact text before porting — port the behavior verbatim):

- `matchesAssigneeFilter(assignedTo)` ~576-583 — closure over `selectedAssignee` (`null/undefined`→all, `'unassigned'`→only unassigned, else equality).
- `isToday` ~587-594.
- `overdueTasks` ~621-657 (includes subtasks; completed-only-if-completed-today).
- `inboxTasks` ~662-670 (`bucket==='inbox'`).
- `weekTasks` ~673-681 (`bucket==='week'`).
- `completedInboxTasks` ~697-713.
- `filteredTasks` ~716-749 (`bucket==='timed'` on viewed date, incl. scheduled subtasks); `allFilteredTasks = filteredTasks` ~828.
- `filteredEvents` ~752-777 (viewed-date filter + dedupe by `title|startTime`).
- `routineStatusMap` ~782-799 (status priority completed>skipped>deferred>pending).
- `visibleRoutines` ~810-814 (`show_on_timeline!==false`; if `hideRoutines`, drop `isEverydayRoutine`).
- `eventStatusMap` ~817-825.
- `grouped` ~830-954 (map task/event/routine → `TimelineItem`, event context/notes/instance overrides, routine instance overrides, `groupByDaySection`, subtask-after-parent reordering).
- `sectionsOrder` ~956: `['allday','morning','afternoon','evening','unscheduled']`.
- Counts ~968-975: `completedCount`, `incompleteOverdue`, `actionableCount`, `totalItems`, `progressPercent`.

Helpers already exist and must be reused (do not reimplement): `taskToTimelineItem`, `eventToTimelineItem`, `routineToTimelineItem` from `@/types/timeline`; `groupByDaySection`, `DaySection` from `@/lib/timeUtils`; `isEverydayRoutine` from `@/lib/routineUtils`.

---

## Task 1: `TodayData` types + input contract

**Files:**
- Create: `src/lib/today/types.ts`
- Test: `src/lib/today/types.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/today/types.test.ts
import { describe, it, expect } from 'vitest'
import type { TodayDataInput, TodayData } from './types'
import { EMPTY_TODAY_DATA } from './types'

describe('today types', () => {
  it('EMPTY_TODAY_DATA has the documented zeroed shape', () => {
    expect(EMPTY_TODAY_DATA.isToday).toBe(false)
    expect(EMPTY_TODAY_DATA.overdueTasks).toEqual([])
    expect(EMPTY_TODAY_DATA.weekTasks).toEqual([])
    expect(EMPTY_TODAY_DATA.inboxTasks).toEqual([])
    expect(EMPTY_TODAY_DATA.sectionsOrder).toEqual(['allday', 'morning', 'afternoon', 'evening', 'unscheduled'])
    expect(EMPTY_TODAY_DATA.counts).toEqual({
      completedCount: 0, incompleteOverdue: 0, actionableCount: 0, totalItems: 0, progressPercent: 0,
    })
    // grouped has an empty array for every section
    for (const s of EMPTY_TODAY_DATA.sectionsOrder) {
      expect(EMPTY_TODAY_DATA.grouped[s]).toEqual([])
    }
  })
  it('type-only check compiles', () => {
    const _i = null as unknown as TodayDataInput
    const _d = null as unknown as TodayData
    expect(true).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest src/lib/today/types.test.ts --run`
Expected: FAIL — cannot find module `./types`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/today/types.ts
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine, ActionableInstance } from '@/types/actionable'
import type { TimelineItem } from '@/types/timeline'
import type { DaySection } from '@/lib/timeUtils'
import type { Contact } from '@/types/contact'

export type AssigneeFilter = string | null | undefined

export interface TodayDataInput {
  tasks: Task[]
  events: CalendarEvent[]
  routines: Routine[]
  dateInstances: ActionableInstance[]
  viewedDate: Date
  selectedAssignee: AssigneeFilter
  hideRoutines: boolean
  eventNotesMap?: Map<string, { notes?: string; assignedTo?: string | null }>
  eventContextOverrides?: Map<string, 'work' | 'family' | 'personal'>
  getDomainForCalendar?: (calendarId?: string, calendarName?: string) => 'work' | 'family' | 'personal' | null
  /** Present for parity with legacy deps; not used by current logic. */
  projectsMap?: Map<string, { name: string }>
  contactsMap?: Map<string, Contact>
}

export interface TodayCounts {
  completedCount: number
  incompleteOverdue: number
  actionableCount: number
  totalItems: number
  progressPercent: number
}

export interface TodayData {
  isToday: boolean
  overdueTasks: Task[]
  inboxTasks: Task[]
  weekTasks: Task[]
  completedInboxTasks: Task[]
  grouped: Record<DaySection, TimelineItem[]>
  sectionsOrder: DaySection[]
  counts: TodayCounts
}

export const SECTIONS_ORDER: DaySection[] = ['allday', 'morning', 'afternoon', 'evening', 'unscheduled']

export const EMPTY_TODAY_DATA: TodayData = {
  isToday: false,
  overdueTasks: [],
  inboxTasks: [],
  weekTasks: [],
  completedInboxTasks: [],
  grouped: { allday: [], morning: [], afternoon: [], evening: [], unscheduled: [] },
  sectionsOrder: SECTIONS_ORDER,
  counts: { completedCount: 0, incompleteOverdue: 0, actionableCount: 0, totalItems: 0, progressPercent: 0 },
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest src/lib/today/types.test.ts --run`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/today/types.ts src/lib/today/types.test.ts
git commit -m "feat(today): TodayData types + input contract"
```

---

## Task 2: `makeAssigneeFilter` pure helper

Ports the legacy `matchesAssigneeFilter` closure (TodaySchedule ~576-583) into a pure factory.

**Files:**
- Create: `src/lib/today/assigneeFilter.ts`
- Test: `src/lib/today/assigneeFilter.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/today/assigneeFilter.test.ts
import { describe, it, expect } from 'vitest'
import { makeAssigneeFilter } from './assigneeFilter'

describe('makeAssigneeFilter', () => {
  it('null/undefined selected → matches everything', () => {
    const f = makeAssigneeFilter(null)
    expect(f('alice')).toBe(true)
    expect(f(null)).toBe(true)
    expect(makeAssigneeFilter(undefined)('bob')).toBe(true)
  })
  it("'unassigned' → only items with no assignee", () => {
    const f = makeAssigneeFilter('unassigned')
    expect(f(null)).toBe(true)
    expect(f(undefined)).toBe(true)
    expect(f('alice')).toBe(false)
  })
  it('a person id → only that person', () => {
    const f = makeAssigneeFilter('alice')
    expect(f('alice')).toBe(true)
    expect(f('bob')).toBe(false)
    expect(f(null)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest src/lib/today/assigneeFilter.test.ts --run`
Expected: FAIL — cannot find module `./assigneeFilter`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/today/assigneeFilter.ts
import type { AssigneeFilter } from './types'

/** Ports TodaySchedule.matchesAssigneeFilter verbatim as a pure factory. */
export function makeAssigneeFilter(selectedAssignee: AssigneeFilter) {
  return (assignedTo: string | null | undefined): boolean => {
    if (selectedAssignee === null || selectedAssignee === undefined) return true
    if (selectedAssignee === 'unassigned') return !assignedTo
    return assignedTo === selectedAssignee
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest src/lib/today/assigneeFilter.test.ts --run`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/today/assigneeFilter.ts src/lib/today/assigneeFilter.test.ts
git commit -m "feat(today): makeAssigneeFilter pure helper (ports legacy closure)"
```

---

## Task 3: Task-pool selectors (overdue / inbox / week / completedInbox / timed)

Ports `overdueTasks`, `inboxTasks`, `weekTasks`, `completedInboxTasks`, `filteredTasks` verbatim as pure functions.

**Files:**
- Create: `src/lib/today/taskPools.ts`
- Test: `src/lib/today/taskPools.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/today/taskPools.test.ts
import { describe, it, expect } from 'vitest'
import { selectOverdue, selectInbox, selectWeek, selectCompletedInbox, selectTimed } from './taskPools'
import type { Task } from '@/types/task'

const TODAY = new Date('2026-05-19T12:00:00')
function task(p: Partial<Task>): Task {
  return {
    id: 'id', title: 't', completed: false, bucket: 'timed',
    scheduledFor: null, assignedTo: null, updatedAt: new Date('2026-05-19T12:00:00'),
    subtasks: undefined,
    ...p,
  } as Task
}
const all = () => true

describe('taskPools', () => {
  it('selectOverdue: past-dated incomplete task is overdue when isToday', () => {
    const t = task({ id: 'o1', bucket: 'timed', scheduledFor: new Date('2026-05-17T09:00:00') })
    expect(selectOverdue([t], true, all, TODAY).map(x => x.id)).toEqual(['o1'])
  })
  it('selectOverdue: returns [] when not today', () => {
    const t = task({ scheduledFor: new Date('2026-05-17T09:00:00') })
    expect(selectOverdue([t], false, all, TODAY)).toEqual([])
  })
  it('selectOverdue: completed task only if completed today', () => {
    const doneOld = task({ id: 'a', scheduledFor: new Date('2026-05-10'), completed: true, updatedAt: new Date('2026-05-10') })
    const doneToday = task({ id: 'b', scheduledFor: new Date('2026-05-10'), completed: true, updatedAt: new Date('2026-05-19T08:00:00') })
    const ids = selectOverdue([doneOld, doneToday], true, all, new Date()).map(x => x.id)
    expect(ids).toContain('b')
    expect(ids).not.toContain('a')
  })
  it('selectOverdue: includes overdue subtasks', () => {
    const parent = task({ id: 'p', bucket: 'timed', scheduledFor: new Date('2026-05-19'),
      subtasks: [task({ id: 's', scheduledFor: new Date('2026-05-10') })] as Task[] })
    expect(selectOverdue([parent], true, all, TODAY).map(x => x.id)).toContain('s')
  })
  it('selectInbox: only bucket=inbox, incomplete, when today', () => {
    const i = task({ id: 'i', bucket: 'inbox' })
    const done = task({ id: 'd', bucket: 'inbox', completed: true })
    expect(selectInbox([i, done], true, all).map(x => x.id)).toEqual(['i'])
    expect(selectInbox([i], false, all)).toEqual([])
  })
  it('selectWeek: only bucket=week, incomplete, when today', () => {
    const w = task({ id: 'w', bucket: 'week' })
    expect(selectWeek([w], true, all).map(x => x.id)).toEqual(['w'])
    expect(selectWeek([w], false, all)).toEqual([])
  })
  it('selectCompletedInbox: completed non-timed updated on viewed date', () => {
    const c = task({ id: 'c', bucket: 'inbox', completed: true, updatedAt: new Date('2026-05-19T10:00:00') })
    const timed = task({ id: 'x', bucket: 'timed', completed: true, updatedAt: new Date('2026-05-19T10:00:00') })
    const ids = selectCompletedInbox([c, timed], new Date('2026-05-19T00:00:00'), all).map(x => x.id)
    expect(ids).toEqual(['c'])
  })
  it('selectTimed: bucket=timed on viewed date, plus scheduled subtasks', () => {
    const t = task({ id: 't1', bucket: 'timed', scheduledFor: new Date('2026-05-19T09:00:00'),
      subtasks: [task({ id: 'sub', bucket: 'timed', scheduledFor: new Date('2026-05-19T10:00:00') })] as Task[] })
    const other = task({ id: 'no', bucket: 'timed', scheduledFor: new Date('2026-05-20T09:00:00') })
    const ids = selectTimed([t, other], new Date('2026-05-19T00:00:00'), all).map(x => x.id)
    expect(ids).toEqual(['t1', 'sub'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest src/lib/today/taskPools.test.ts --run`
Expected: FAIL — cannot find module `./taskPools`.

- [ ] **Step 3: Write minimal implementation** (port verbatim from TodaySchedule lines listed in Reference)

```ts
// src/lib/today/taskPools.ts
import type { Task } from '@/types/task'

type Match = (assignedTo: string | null | undefined) => boolean

/** Ports TodaySchedule.overdueTasks (~621-657). `now` defaults to new Date(). */
export function selectOverdue(tasks: Task[], isToday: boolean, match: Match, now: Date = new Date()): Task[] {
  if (!isToday) return []
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)

  const isOverdue = (task: Task): boolean => {
    if (!task.scheduledFor) return false
    if (!match(task.assignedTo)) return false
    const taskDate = new Date(task.scheduledFor)
    taskDate.setHours(0, 0, 0, 0)
    if (task.completed) {
      const completedDate = new Date(task.updatedAt)
      completedDate.setHours(0, 0, 0, 0)
      const todayDate = new Date(now)
      todayDate.setHours(0, 0, 0, 0)
      if (completedDate.getTime() !== todayDate.getTime()) return false
    }
    return taskDate < today
  }

  const result: Task[] = []
  for (const task of tasks) {
    if (isOverdue(task)) result.push(task)
    if (task.subtasks) {
      for (const subtask of task.subtasks) {
        if (isOverdue(subtask)) result.push(subtask)
      }
    }
  }
  return result
}

/** Ports TodaySchedule.inboxTasks (~662-670). */
export function selectInbox(tasks: Task[], isToday: boolean, match: Match): Task[] {
  if (!isToday) return []
  return tasks.filter((task) => {
    if (task.completed) return false
    if (task.bucket !== 'inbox') return false
    if (!match(task.assignedTo)) return false
    return true
  })
}

/** Ports TodaySchedule.weekTasks (~673-681). */
export function selectWeek(tasks: Task[], isToday: boolean, match: Match): Task[] {
  if (!isToday) return []
  return tasks.filter((task) => {
    if (task.completed) return false
    if (task.bucket !== 'week') return false
    if (!match(task.assignedTo)) return false
    return true
  })
}

/** Ports TodaySchedule.completedInboxTasks (~697-713). */
export function selectCompletedInbox(tasks: Task[], viewedDate: Date, match: Match): Task[] {
  const startOfDay = new Date(viewedDate)
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date(viewedDate)
  endOfDay.setHours(23, 59, 59, 999)
  return tasks.filter((task) => {
    if (!task.completed) return false
    if (task.bucket === 'timed') return false
    if (!match(task.assignedTo)) return false
    const updatedDate = new Date(task.updatedAt)
    if (updatedDate < startOfDay || updatedDate > endOfDay) return false
    return true
  })
}

/** Ports TodaySchedule.filteredTasks (~716-749). */
export function selectTimed(tasks: Task[], viewedDate: Date, match: Match): Task[] {
  const startOfDay = new Date(viewedDate)
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date(viewedDate)
  endOfDay.setHours(23, 59, 59, 999)
  const isOnViewedDate = (date: Date | undefined | null) => {
    if (!date) return false
    const d = new Date(date)
    return d >= startOfDay && d <= endOfDay
  }
  const result: Task[] = []
  for (const task of tasks) {
    if (!match(task.assignedTo)) continue
    if (task.bucket === 'timed' && isOnViewedDate(task.scheduledFor)) result.push(task)
    if (task.subtasks) {
      for (const subtask of task.subtasks) {
        if (!match(subtask.assignedTo)) continue
        if (subtask.bucket === 'timed' && isOnViewedDate(subtask.scheduledFor)) result.push(subtask)
      }
    }
  }
  return result
}
```

> Note: the legacy `filteredTasks` checks `match(task.assignedTo)` once at the top of the loop, which also gates the parent-push. The port preserves that exact ordering. If reading the live file shows any divergence from the code above, port the **file's** behavior and update the test to match the real behavior (document the difference in the commit message).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest src/lib/today/taskPools.test.ts --run`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/today/taskPools.ts src/lib/today/taskPools.test.ts
git commit -m "feat(today): pure task-pool selectors (port overdue/inbox/week/timed)"
```

---

## Task 4: Status maps + visible routines

Ports `routineStatusMap`, `eventStatusMap`, `visibleRoutines`.

**Files:**
- Create: `src/lib/today/statusMaps.ts`
- Test: `src/lib/today/statusMaps.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/today/statusMaps.test.ts
import { describe, it, expect } from 'vitest'
import { buildRoutineStatusMap, buildEventStatusMap, selectVisibleRoutines } from './statusMaps'
import type { ActionableInstance, Routine } from '@/types/actionable'

function inst(p: Partial<ActionableInstance>): ActionableInstance {
  return { entity_type: 'routine', entity_id: 'r1', status: 'pending', deferred_to: null, ...p } as ActionableInstance
}

describe('statusMaps', () => {
  it('routine status map prefers completed > skipped > deferred > pending', () => {
    const m = buildRoutineStatusMap([
      inst({ entity_id: 'r1', status: 'deferred' }),
      inst({ entity_id: 'r1', status: 'completed' }),
      inst({ entity_id: 'r1', status: 'pending' }),
    ])
    expect(m.get('r1')?.status).toBe('completed')
  })
  it('routine status map ignores non-routine instances', () => {
    const m = buildRoutineStatusMap([inst({ entity_type: 'calendar_event', entity_id: 'e1' })])
    expect(m.size).toBe(0)
  })
  it('event status map keeps calendar_event instances only', () => {
    const m = buildEventStatusMap([
      inst({ entity_type: 'calendar_event', entity_id: 'e1', status: 'completed' }),
      inst({ entity_type: 'routine', entity_id: 'r1' }),
    ])
    expect(m.get('e1')?.status).toBe('completed')
    expect(m.size).toBe(1)
  })
  it('visible routines: show_on_timeline!==false, and hideRoutines drops everyday', () => {
    const daily = { id: 'd', show_on_timeline: true, recurrence_pattern: { type: 'daily' } } as unknown as Routine
    const weekly = { id: 'w', show_on_timeline: true, recurrence_pattern: { type: 'weekly', days: ['tue'] } } as unknown as Routine
    const hidden = { id: 'h', show_on_timeline: false } as unknown as Routine
    expect(selectVisibleRoutines([daily, weekly, hidden], false).map(r => r.id)).toEqual(['d', 'w'])
    expect(selectVisibleRoutines([daily, weekly, hidden], true).map(r => r.id)).toEqual(['w'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest src/lib/today/statusMaps.test.ts --run`
Expected: FAIL — cannot find module `./statusMaps`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/today/statusMaps.ts
import type { ActionableInstance, Routine } from '@/types/actionable'
import { isEverydayRoutine } from '@/lib/routineUtils'

/** Ports TodaySchedule.routineStatusMap (~782-799). */
export function buildRoutineStatusMap(dateInstances: ActionableInstance[]): Map<string, ActionableInstance> {
  const statusPriority: Record<string, number> = { completed: 3, skipped: 2, deferred: 1, pending: 0 }
  const map = new Map<string, ActionableInstance>()
  for (const instance of dateInstances) {
    if (instance.entity_type === 'routine') {
      const existing = map.get(instance.entity_id)
      if (!existing || (statusPriority[instance.status] ?? 0) > (statusPriority[existing.status] ?? 0)) {
        map.set(instance.entity_id, instance)
      }
    }
  }
  return map
}

/** Ports TodaySchedule.eventStatusMap (~817-825). */
export function buildEventStatusMap(dateInstances: ActionableInstance[]): Map<string, ActionableInstance> {
  const map = new Map<string, ActionableInstance>()
  for (const instance of dateInstances) {
    if (instance.entity_type === 'calendar_event') {
      map.set(instance.entity_id, instance)
    }
  }
  return map
}

/** Ports TodaySchedule.visibleRoutines (~810-814). */
export function selectVisibleRoutines(routines: Routine[], hideRoutines: boolean): Routine[] {
  const showable = routines.filter(r => r.show_on_timeline !== false)
  if (!hideRoutines) return showable
  return showable.filter(r => !isEverydayRoutine(r.recurrence_pattern))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest src/lib/today/statusMaps.test.ts --run`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/today/statusMaps.ts src/lib/today/statusMaps.test.ts
git commit -m "feat(today): pure status maps + visible-routines selector"
```

---

## Task 5: `buildGroupedSections` (the timeline grouping)

Ports the `grouped` memo (~830-954) verbatim: map task/event/routine → `TimelineItem`, apply event note/context/instance overrides and routine instance overrides, `groupByDaySection`, then subtask-after-parent reorder.

**Files:**
- Create: `src/lib/today/grouping.ts`
- Test: `src/lib/today/grouping.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/today/grouping.test.ts
import { describe, it, expect } from 'vitest'
import { buildGroupedSections } from './grouping'
import type { Task } from '@/types/task'

const all = () => true
function task(p: Partial<Task>): Task {
  return { id: 'id', title: 't', completed: false, bucket: 'timed', scheduledFor: null, assignedTo: null,
    updatedAt: new Date(), subtasks: undefined, ...p } as Task
}

describe('buildGroupedSections', () => {
  it('groups a morning timed task into the morning section', () => {
    const t = task({ id: 't-m', title: 'AM', scheduledFor: new Date('2026-05-19T08:00:00') })
    const g = buildGroupedSections({
      timedTasks: [t], events: [], routines: [], viewedDate: new Date('2026-05-19T00:00:00'),
      routineStatusMap: new Map(), eventStatusMap: new Map(), match: all,
    })
    expect(g.morning.map(i => i.title)).toContain('AM')
    expect(g.evening).toEqual([])
  })
  it('places a subtask immediately after its parent within a section', () => {
    const parent = task({ id: 'p', title: 'Parent', scheduledFor: new Date('2026-05-19T08:00:00'),
      subtasks: [task({ id: 'c', title: 'Child', scheduledFor: new Date('2026-05-19T08:30:00') })] as Task[] })
    // selectTimed flattens parent+subtask; pass both flattened (mirrors real input)
    const child = (parent.subtasks as Task[])[0]
    const g = buildGroupedSections({
      timedTasks: [parent, child], events: [], routines: [], viewedDate: new Date('2026-05-19T00:00:00'),
      routineStatusMap: new Map(), eventStatusMap: new Map(), match: all,
    })
    const titles = g.morning.map(i => i.title)
    expect(titles.indexOf('Child')).toBe(titles.indexOf('Parent') + 1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest src/lib/today/grouping.test.ts --run`
Expected: FAIL — cannot find module `./grouping`.

- [ ] **Step 3: Write minimal implementation**

Read TodaySchedule lines ~830-954 and port the body verbatim into this signature. The implementation MUST reproduce the legacy logic exactly (event note/assignee/context override precedence: `eventContextOverrides` → `getDomainForCalendar` → none; event completed via `eventStatusMap`; event `deferred_to` while `pending` overrides `startTime`/clears all-day/endTime; routine completed/skipped via `routineStatusMap`; routine `deferred_to` override when `status==='pending'` or (`status==='deferred'` and `deferredDateStr===viewedDateStr`); then `groupByDaySection`; then subtask-after-parent reorder for every section key):

```ts
// src/lib/today/grouping.ts
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine, ActionableInstance } from '@/types/actionable'
import type { TimelineItem } from '@/types/timeline'
import type { DaySection } from '@/lib/timeUtils'
import { taskToTimelineItem, eventToTimelineItem, routineToTimelineItem } from '@/types/timeline'
import { groupByDaySection } from '@/lib/timeUtils'

export interface GroupingInput {
  timedTasks: Task[]
  events: CalendarEvent[]
  routines: Routine[]
  viewedDate: Date
  routineStatusMap: Map<string, ActionableInstance>
  eventStatusMap: Map<string, ActionableInstance>
  match: (assignedTo: string | null | undefined) => boolean
  eventNotesMap?: Map<string, { notes?: string; assignedTo?: string | null }>
  eventContextOverrides?: Map<string, 'work' | 'family' | 'personal'>
  getDomainForCalendar?: (calendarId?: string, calendarName?: string) => 'work' | 'family' | 'personal' | null
}

/** Ports TodaySchedule.grouped (~830-954) verbatim. */
export function buildGroupedSections(input: GroupingInput): Record<DaySection, TimelineItem[]> {
  const {
    timedTasks, events, routines, viewedDate,
    routineStatusMap, eventStatusMap, match,
    eventNotesMap, eventContextOverrides, getDomainForCalendar,
  } = input

  const taskItems = timedTasks.map(taskToTimelineItem)

  const eventItems = events
    .map((event) => {
      const item = eventToTimelineItem(event)
      const eventId = event.google_event_id || event.id
      const eventNote = eventNotesMap?.get(eventId)
      if (eventNote?.notes) item.notes = eventNote.notes
      if (eventNote?.assignedTo) item.assignedTo = eventNote.assignedTo
      const contextOverride = eventContextOverrides?.get(eventId)
      if (contextOverride) {
        item.context = contextOverride
      } else if (getDomainForCalendar) {
        const calendarId = event.calendar_id || event.calendarId
        const calendarName = event.calendar_name || event.calendarName
        const resolved = getDomainForCalendar(calendarId, calendarName)
        if (resolved) item.context = resolved
      }
      const instance = eventStatusMap.get(eventId)
      if (instance?.status === 'completed') item.completed = true
      if (instance?.deferred_to && instance.status === 'pending') {
        const deferredTime = new Date(instance.deferred_to)
        item.startTime = deferredTime
        if (deferredTime.getHours() !== 0 || deferredTime.getMinutes() !== 0) {
          item.allDay = false
          item.endTime = null
        }
      }
      return item
    })
    .filter((item) => match(item.assignedTo))

  const routineItems = routines
    .filter((routine) => match(routine.assigned_to))
    .map((routine) => {
      const item = routineToTimelineItem(routine, viewedDate)
      const instance = routineStatusMap.get(routine.id)
      if (instance?.status === 'completed') item.completed = true
      else if (instance?.status === 'skipped') item.skipped = true
      if (instance?.deferred_to) {
        const deferredTime = new Date(instance.deferred_to)
        const deferredDateStr = deferredTime.toISOString().split('T')[0]
        const viewedDateStr = viewedDate.toISOString().split('T')[0]
        if (instance.status === 'pending' || (instance.status === 'deferred' && deferredDateStr === viewedDateStr)) {
          item.startTime = deferredTime
        }
      }
      return item
    })

  const allItems = [...taskItems, ...eventItems, ...routineItems]
  const sections = groupByDaySection(allItems)

  for (const key of Object.keys(sections) as DaySection[]) {
    const items = sections[key]
    const subtasks: TimelineItem[] = []
    const nonSubtasks: TimelineItem[] = []
    for (const item of items) {
      if (item.isSubtask) subtasks.push(item)
      else nonSubtasks.push(item)
    }
    if (subtasks.length === 0) continue
    const result: TimelineItem[] = []
    const placed = new Set<string>()
    for (const item of nonSubtasks) {
      result.push(item)
      const taskId = item.id.startsWith('task-') ? item.id.replace('task-', '') : null
      if (taskId) {
        for (const sub of subtasks) {
          if (sub.parentTaskId === taskId) {
            result.push(sub)
            placed.add(sub.id)
          }
        }
      }
    }
    for (const sub of subtasks) {
      if (!placed.has(sub.id)) result.push(sub)
    }
    sections[key] = result
  }

  return sections
}
```

> Before finalizing, read TodaySchedule ~830-954 and diff it against the body above line-by-line. If anything differs (field names, override order), port the **file's** behavior and adjust the test accordingly; note the diff in the commit message.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest src/lib/today/grouping.test.ts --run`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/today/grouping.ts src/lib/today/grouping.test.ts
git commit -m "feat(today): buildGroupedSections (port grouped memo verbatim)"
```

---

## Task 6: `computeTodayData` composition + counts

Composes Tasks 2–5 and ports the counts (~968-975) into one pure function.

**Files:**
- Create: `src/lib/today/computeTodayData.ts`
- Test: `src/lib/today/computeTodayData.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/today/computeTodayData.test.ts
import { describe, it, expect } from 'vitest'
import { computeTodayData } from './computeTodayData'
import type { TodayDataInput } from './types'
import type { Task } from '@/types/task'

function task(p: Partial<Task>): Task {
  return { id: 'id', title: 't', completed: false, bucket: 'timed', scheduledFor: null, assignedTo: null,
    updatedAt: new Date('2026-05-19T12:00:00'), subtasks: undefined, ...p } as Task
}
function baseInput(over: Partial<TodayDataInput> = {}): TodayDataInput {
  return {
    tasks: [], events: [], routines: [], dateInstances: [],
    viewedDate: new Date('2026-05-19T00:00:00'),
    selectedAssignee: null, hideRoutines: false, ...over,
  }
}

describe('computeTodayData', () => {
  it('empty input → zeroed counts, empty sections, sectionsOrder set', () => {
    const d = computeTodayData(baseInput())
    expect(d.counts).toEqual({ completedCount: 0, incompleteOverdue: 0, actionableCount: 0, totalItems: 0, progressPercent: 0 })
    expect(d.sectionsOrder).toEqual(['allday', 'morning', 'afternoon', 'evening', 'unscheduled'])
    expect(d.grouped.morning).toEqual([])
  })
  it('isToday true when viewedDate is today', () => {
    const now = new Date()
    const d = computeTodayData(baseInput({ viewedDate: now, tasks: [] }))
    expect(d.isToday).toBe(true)
  })
  it('actionableCount = timed + visibleRoutines + overdue; progressPercent computed', () => {
    const now = new Date()
    const t1 = task({ id: 'a', bucket: 'timed', scheduledFor: now, completed: true })
    const t2 = task({ id: 'b', bucket: 'timed', scheduledFor: now, completed: false })
    const d = computeTodayData(baseInput({ tasks: [t1, t2], viewedDate: now }))
    expect(d.counts.actionableCount).toBe(2)
    expect(d.counts.completedCount).toBe(1)
    expect(d.counts.progressPercent).toBeCloseTo(50)
  })
  it('week + inbox pools populate only when isToday', () => {
    const now = new Date()
    const w = task({ id: 'w', bucket: 'week' })
    const i = task({ id: 'i', bucket: 'inbox' })
    const today = computeTodayData(baseInput({ tasks: [w, i], viewedDate: now }))
    expect(today.weekTasks.map(t => t.id)).toEqual(['w'])
    expect(today.inboxTasks.map(t => t.id)).toEqual(['i'])
    const past = computeTodayData(baseInput({ tasks: [w, i], viewedDate: new Date('2020-01-01') }))
    expect(past.weekTasks).toEqual([])
    expect(past.inboxTasks).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest src/lib/today/computeTodayData.test.ts --run`
Expected: FAIL — cannot find module `./computeTodayData`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/today/computeTodayData.ts
import type { TodayDataInput, TodayData } from './types'
import { SECTIONS_ORDER } from './types'
import { makeAssigneeFilter } from './assigneeFilter'
import { selectOverdue, selectInbox, selectWeek, selectCompletedInbox, selectTimed } from './taskPools'
import { buildRoutineStatusMap, buildEventStatusMap, selectVisibleRoutines } from './statusMaps'
import { buildGroupedSections } from './grouping'

function computeIsToday(viewedDate: Date): boolean {
  const today = new Date()
  return (
    viewedDate.getFullYear() === today.getFullYear() &&
    viewedDate.getMonth() === today.getMonth() &&
    viewedDate.getDate() === today.getDate()
  )
}

/** Pure port of TodaySchedule's data memos + counts (~587-975). No React. */
export function computeTodayData(input: TodayDataInput): TodayData {
  const match = makeAssigneeFilter(input.selectedAssignee)
  const isToday = computeIsToday(input.viewedDate)

  const overdueTasks = selectOverdue(input.tasks, isToday, match)
  const inboxTasks = selectInbox(input.tasks, isToday, match)
  const weekTasks = selectWeek(input.tasks, isToday, match)
  const completedInboxTasks = selectCompletedInbox(input.tasks, input.viewedDate, match)
  const timedTasks = selectTimed(input.tasks, input.viewedDate, match)

  const routineStatusMap = buildRoutineStatusMap(input.dateInstances)
  const eventStatusMap = buildEventStatusMap(input.dateInstances)
  const visibleRoutines = selectVisibleRoutines(input.routines, input.hideRoutines)

  // filteredEvents: viewed-date filter + dedupe (ports TodaySchedule ~752-777)
  const vY = input.viewedDate.getFullYear()
  const vM = input.viewedDate.getMonth()
  const vD = input.viewedDate.getDate()
  const eventsForDay = input.events.filter((event) => {
    const s = event.start_time || event.startTime
    if (!s) return false
    const es = new Date(s)
    return es.getFullYear() === vY && es.getMonth() === vM && es.getDate() === vD
  })
  const seen = new Set<string>()
  const filteredEvents = eventsForDay.filter((event) => {
    const s = event.start_time || event.startTime
    const key = `${event.title}|${s}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const grouped = buildGroupedSections({
    timedTasks,
    events: filteredEvents,
    routines: visibleRoutines,
    viewedDate: input.viewedDate,
    routineStatusMap,
    eventStatusMap,
    match,
    eventNotesMap: input.eventNotesMap,
    eventContextOverrides: input.eventContextOverrides,
    getDomainForCalendar: input.getDomainForCalendar,
  })

  // Counts — port TodaySchedule ~968-975 exactly.
  const completedTasks = timedTasks.filter((t) => t.completed).length
  const completedRoutines = visibleRoutines.filter((r) => routineStatusMap.get(r.id)?.status === 'completed').length
  const completedOverdue = overdueTasks.filter((t) => t.completed).length
  const completedCount = completedTasks + completedRoutines + completedOverdue
  const incompleteOverdue = overdueTasks.filter((t) => !t.completed).length
  const actionableCount = timedTasks.length + visibleRoutines.length + incompleteOverdue + completedOverdue
  const totalItems = timedTasks.length + filteredEvents.length + visibleRoutines.length + inboxTasks.length + overdueTasks.length
  const progressPercent = actionableCount > 0 ? (completedCount / actionableCount) * 100 : 0

  return {
    isToday,
    overdueTasks,
    inboxTasks,
    weekTasks,
    completedInboxTasks,
    grouped,
    sectionsOrder: SECTIONS_ORDER,
    counts: { completedCount, incompleteOverdue, actionableCount, totalItems, progressPercent },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest src/lib/today/computeTodayData.test.ts --run`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/today/computeTodayData.ts src/lib/today/computeTodayData.test.ts
git commit -m "feat(today): computeTodayData composition + counts (pure)"
```

---

## Task 7: `useTodayData` hook wrapper

Thin memoized React wrapper. No new logic.

**Files:**
- Create: `src/hooks/useTodayData.ts`
- Test: `src/hooks/useTodayData.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/hooks/useTodayData.test.ts
import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useTodayData } from './useTodayData'
import type { TodayDataInput } from '@/lib/today/types'

function baseInput(over: Partial<TodayDataInput> = {}): TodayDataInput {
  return {
    tasks: [], events: [], routines: [], dateInstances: [],
    viewedDate: new Date(), selectedAssignee: null, hideRoutines: false, ...over,
  }
}

describe('useTodayData', () => {
  it('returns computed TodayData and is referentially stable across re-render with same input', () => {
    const input = baseInput()
    const { result, rerender } = renderHook((p: TodayDataInput) => useTodayData(p), { initialProps: input })
    const first = result.current
    expect(first.sectionsOrder).toEqual(['allday', 'morning', 'afternoon', 'evening', 'unscheduled'])
    rerender(input)
    expect(result.current).toBe(first) // same input reference → memoized
  })
  it('recomputes when input changes', () => {
    const { result, rerender } = renderHook((p: TodayDataInput) => useTodayData(p), { initialProps: baseInput() })
    const first = result.current
    rerender(baseInput())
    expect(result.current).not.toBe(first)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest src/hooks/useTodayData.test.ts --run`
Expected: FAIL — cannot find module `./useTodayData`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/hooks/useTodayData.ts
import { useMemo } from 'react'
import type { TodayDataInput, TodayData } from '@/lib/today/types'
import { computeTodayData } from '@/lib/today/computeTodayData'

/** Thin memoized wrapper over the pure computeTodayData. */
export function useTodayData(input: TodayDataInput): TodayData {
  return useMemo(() => computeTodayData(input), [input])
}
```

> The dependency is the `input` object reference. Consumers (Phase 4 `TodayView`) must memoize the input object so this only recomputes on real change — mirrors the legacy memo dependency lists. This is documented for Phase 4; no action here.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest src/hooks/useTodayData.test.ts --run`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useTodayData.ts src/hooks/useTodayData.test.ts
git commit -m "feat(today): useTodayData memoized hook wrapper"
```

---

## Task 8: Cutover parity test (legacy ↔ computeTodayData)

Proves `computeTodayData` reproduces the legacy `TodaySchedule` grouping/counts for representative fixtures, so the Phase 5 deletion of `TodaySchedule` is safe. Since the legacy memos are private to the component, the parity test asserts against **golden fixtures**: hand-constructed inputs whose correct legacy output is derived from the algorithm in the Reference section and pinned as expectations. This is the contract the legacy code must also satisfy.

**Files:**
- Create: `src/lib/today/__fixtures__/todayScenarios.ts`
- Create: `src/lib/today/parity.test.ts`

- [ ] **Step 1: Write the fixtures**

```ts
// src/lib/today/__fixtures__/todayScenarios.ts
import type { Task } from '@/types/task'
import type { TodayDataInput } from '../types'

const TODAY = new Date()
TODAY.setHours(0, 0, 0, 0)
function at(h: number, m = 0) { const d = new Date(TODAY); d.setHours(h, m, 0, 0); return d }
function task(p: Partial<Task>): Task {
  return { id: 'id', title: 't', completed: false, bucket: 'timed', scheduledFor: null,
    assignedTo: null, updatedAt: new Date(), subtasks: undefined, ...p } as Task
}

/** Mixed realistic day: morning+afternoon+evening timed tasks, a week task,
 *  an inbox task, an overdue task, a completed-today overdue task. */
export const mixedDayInput: TodayDataInput = {
  tasks: [
    task({ id: 'm1', title: 'Hang up hooks', scheduledFor: at(8) }),
    task({ id: 'a1', title: 'Cut the rugs', scheduledFor: at(14) }),
    task({ id: 'e1', title: 'Storm vs Blue', scheduledFor: at(19) }),
    task({ id: 'w1', title: 'Finish vital docs', bucket: 'week' }),
    task({ id: 'i1', title: 'Brain dump', bucket: 'inbox' }),
    task({ id: 'o1', title: 'Old overdue', scheduledFor: new Date(TODAY.getTime() - 3 * 864e5) }),
    task({ id: 'o2', title: 'Done today overdue', scheduledFor: new Date(TODAY.getTime() - 2 * 864e5),
      completed: true, updatedAt: new Date() }),
  ],
  events: [], routines: [], dateInstances: [],
  viewedDate: new Date(), selectedAssignee: null, hideRoutines: false,
}

/** Expected, derived by hand from the legacy algorithm (Reference section). */
export const mixedDayExpected = {
  isToday: true,
  groupedTitles: {
    morning: ['Hang up hooks'],
    afternoon: ['Cut the rugs'],
    evening: ['Storm vs Blue'],
    allday: [] as string[],
    unscheduled: [] as string[],
  },
  weekIds: ['w1'],
  inboxIds: ['i1'],
  overdueIds: ['o1', 'o2'], // o2 completed today still included
  counts: {
    // timed actionable = m1,a1,e1 (3); visibleRoutines 0; incompleteOverdue o1 (1); completedOverdue o2 (1)
    actionableCount: 3 + 0 + 1 + 1,
    completedCount: 0 /*timed*/ + 0 /*routines*/ + 1 /*o2*/,
    incompleteOverdue: 1,
  },
}
```

- [ ] **Step 2: Write the failing parity test**

```ts
// src/lib/today/parity.test.ts
import { describe, it, expect } from 'vitest'
import { computeTodayData } from './computeTodayData'
import { mixedDayInput, mixedDayExpected } from './__fixtures__/todayScenarios'

describe('parity: computeTodayData reproduces legacy TodaySchedule output', () => {
  const d = computeTodayData(mixedDayInput)

  it('isToday', () => {
    expect(d.isToday).toBe(mixedDayExpected.isToday)
  })
  it('grouped section membership matches legacy grouping', () => {
    for (const s of ['morning', 'afternoon', 'evening', 'allday', 'unscheduled'] as const) {
      expect(d.grouped[s].map(i => i.title)).toEqual(mixedDayExpected.groupedTitles[s])
    }
  })
  it('week / inbox / overdue pools match', () => {
    expect(d.weekTasks.map(t => t.id)).toEqual(mixedDayExpected.weekIds)
    expect(d.inboxTasks.map(t => t.id)).toEqual(mixedDayExpected.inboxIds)
    expect(d.overdueTasks.map(t => t.id).sort()).toEqual([...mixedDayExpected.overdueIds].sort())
  })
  it('counts match legacy formulas', () => {
    expect(d.counts.actionableCount).toBe(mixedDayExpected.counts.actionableCount)
    expect(d.counts.completedCount).toBe(mixedDayExpected.counts.completedCount)
    expect(d.counts.incompleteOverdue).toBe(mixedDayExpected.counts.incompleteOverdue)
  })
})
```

- [ ] **Step 3: Run test to verify it fails then passes**

Run: `npx vitest src/lib/today/parity.test.ts --run`
Expected: initially FAIL if any selector/grouping/counts port diverges from the legacy algorithm. Fix the implementing module (Tasks 3–6) — NOT the expected values — until it PASSES (4 tests). The expected values are the legacy contract; if a genuine legacy behavior contradicts an expectation, re-derive the expectation from the legacy code in TodaySchedule and note the reasoning in the commit message.

- [ ] **Step 4: Commit**

```bash
git add src/lib/today/__fixtures__/todayScenarios.ts src/lib/today/parity.test.ts
git commit -m "test(today): cutover parity fixtures + legacy-equivalence test"
```

---

## Task 9: Phase 1 verification gate

**Files:** none (verification only).

- [ ] **Step 1: Targeted suite**

Run: `npx vitest src/lib/today src/hooks/useTodayData.test.ts --run`
Expected: PASS — all Phase 1 suites green (types, assigneeFilter, taskPools, statusMaps, grouping, computeTodayData, useTodayData, parity).

- [ ] **Step 2: Full suite — no regressions**

Run: `npm test -- --run`
Expected: only the pre-existing unrelated `src/hooks/useSpaces.test.ts` failure; everything else passes; new Phase 1 tests included. No NEW failures. (Phase 1 added files only; `TodaySchedule.tsx`/`HomeView.tsx`/`ViewRouter.tsx` are untouched, so the live route and its tests are unaffected.)

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit` then `npm run build`
Expected: zero type errors; clean build.

- [ ] **Step 4: Lint changed files**

Run: `npx eslint src/lib/today/**/*.ts src/hooks/useTodayData.ts --max-warnings=0`
Expected: clean.

- [ ] **Step 5: Confirm seam untouched**

Run: `git diff --name-only origin/main...HEAD | grep -E 'TodaySchedule|HomeView|ViewRouter' || echo "SEAM UNTOUCHED"`
Expected: prints `SEAM UNTOUCHED` (Phase 1 must not modify those files).

---

## Self-review notes (author)

- **Spec coverage:** This plan implements spec §7 (data hook) and §9 parity, and the §3/§12 "behind the seam, nothing on the live route" constraint (Task 9 Step 5 enforces it). Phases 2–5 (detail module model, weather/AI, TodayView shell, cutover) are separate plans authored after Phase 1 lands, because their concrete code depends on the now-defined `TodayData` shape — flagged to the user at handoff, not a silent gap.
- **Placeholder scan:** none — every step has complete code; the two "diff against the live file before finalizing" notes in Tasks 3 & 5 are explicit verification instructions with a concrete default port, not vague TODOs.
- **Type consistency:** `TodayDataInput`/`TodayData`/`TodayCounts`/`SECTIONS_ORDER`/`AssigneeFilter` defined in Task 1 and consumed unchanged in Tasks 6–8; `makeAssigneeFilter`→`Match`, `buildGroupedSections`→`GroupingInput`, `computeTodayData`→`useTodayData` signatures are consistent across tasks.
- **Open assumption to verify during execution:** exact legacy text at TodaySchedule ~716-749 and ~830-954 — Tasks 3 & 5 instruct the implementer to diff the live file and port its real behavior, adjusting the test (never the parity expectations) if it diverges.
