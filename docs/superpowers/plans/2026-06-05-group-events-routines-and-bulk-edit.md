# Group events/routines + multi-type bulk edits — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Today multi-select include events and routines — group any mix into one wrapper card, and bulk-edit time (all types, today-only), context, and assignee (tasks + events via local overrides; routines skipped) — with no Google writes and no routine-pattern mutation.

**Architecture:** Generalize the existing tasks-only selection (`Set<taskId>` → `Set<timelineKey>`) and un-gate the bulk check-circle that `ScheduleItem` already renders for all three types. Group membership for non-tasks lives in a new `group_members` JSONB column on the wrapper task (tasks keep `parentTaskId`); `grouping.ts` relocates members under the wrapper. Bulk edits fan out per type using handlers that already exist on `ScheduleActionsContext` (`onPushEvent`, `onPushRoutine`, `onUpdateEventContext`, `onAssignEventAll`, `onAssignTaskAll`).

**Tech Stack:** React 19 + TS strict, Supabase (Postgres + JSONB), Vitest. Path alias `@/` → `src/`.

**Spec:** `docs/superpowers/specs/2026-06-05-group-events-routines-and-bulk-edit-design.md`

---

## Task 0: Rebase the worktree onto origin/main

**Files:** none (git only)

- [ ] **Step 1: Fetch and rebase**

Run (from the worktree root `/Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/today-group-tasks`):
```bash
git fetch origin
git rebase origin/main
```
Expected: clean replay of the `feat/today-group-tasks` commits on top of `origin/main`. If conflicts arise (unlikely — the 4 ahead commits are the unrelated Shell cutover), resolve, `git rebase --continue`.

- [ ] **Step 2: Sanity build**

Run: `npx tsc --noEmit`
Expected: no errors (baseline before changes).

---

## Task 1: DB migration — `group_members` column

**Files:** none in repo (schema change via Supabase Management API; migration history is out of sync — see project memory).

- [ ] **Step 1: Apply the migration**

Run (pulls the live token from keychain, per memory):
```bash
TOKEN=$(security find-generic-password -s "Supabase CLI" -a "access-token" -w | sed 's/^go-keyring-base64://' | base64 -d)
curl -sS -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"alter table tasks add column if not exists group_members jsonb not null default '"'"'[]'"'"'::jsonb;"}'
```
Expected: `[]` (success, no rows returned).

- [ ] **Step 2: Verify the column exists**

Run:
```bash
curl -sS -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"select column_name, data_type, column_default from information_schema.columns where table_name='"'"'tasks'"'"' and column_name='"'"'group_members'"'"';"}'
```
Expected: one row — `group_members | jsonb | '[]'::jsonb`.

No commit (no repo files changed).

---

## Task 2: `GroupMemberRef` type + Task mapping

**Files:**
- Modify: `src/types/task.ts` (add `GroupMemberRef` + `groupMembers` field)
- Modify: `src/hooks/useSupabaseTasks.ts` (`DbTask` ~line 29, `dbTaskToTask` ~line 93, `updateTask` write paths ~lines 722 & 815)
- Test: `src/hooks/dbTaskToTask.test.ts` (new — or extend an existing useSupabaseTasks test if present)

- [ ] **Step 1: Write the failing test**

Create `src/hooks/dbTaskToTask.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { dbTaskToTask, type DbTask } from './useSupabaseTasks'

function baseRow(overrides: Partial<DbTask> = {}): DbTask {
  return {
    id: 't1', title: 'x', completed: false, bucket: 'inbox',
    scheduled_for: null, deferred_until: null, defer_count: null,
    is_all_day: null, is_someday: null, context: null, category: null,
    notes: null, links: null, phone_number: null, contact_id: null,
    assigned_to: null, assigned_to_all: null, project_id: null,
    parent_task_id: null, linked_event_id: null, link_type: null,
    linked_activity_type: null, linked_activity_id: null, estimated_duration: null,
    location: null, location_place_id: null, is_waiting: null, waiting_since: null,
    needs_discussion: null, discussion_note: null, week_deferred_at: null,
    group_members: [],
    created_at: '2026-06-05T00:00:00Z', updated_at: '2026-06-05T00:00:00Z',
    ...overrides,
  } as DbTask
}

describe('dbTaskToTask groupMembers', () => {
  it('maps an empty group_members to undefined', () => {
    expect(dbTaskToTask(baseRow()).groupMembers).toBeUndefined()
  })
  it('maps populated group_members refs through', () => {
    const refs = [{ type: 'event' as const, id: 'e1' }, { type: 'routine' as const, id: 'r1' }]
    expect(dbTaskToTask(baseRow({ group_members: refs })).groupMembers).toEqual(refs)
  })
})
```
(If `dbTaskToTask`/`DbTask` aren't exported, add `export` to both in `useSupabaseTasks.ts` as part of Step 3.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/dbTaskToTask.test.ts`
Expected: FAIL — `group_members` not on `DbTask` / `groupMembers` undefined when refs present.

- [ ] **Step 3: Implement the type + mapping**

In `src/types/task.ts`, add near the other shared types:
```ts
/** A non-task member of a Today group (events/routines attach to the wrapper here; tasks use parentTaskId). */
export type GroupMemberRef = { type: 'event' | 'routine'; id: string }
```
and add to the `Task` interface (next to `parentTaskId`):
```ts
  /** Wrapper-only: events/routines grouped under this task on Today. Tasks attach via parentTaskId. */
  groupMembers?: GroupMemberRef[]
```

In `src/hooks/useSupabaseTasks.ts`:
- Ensure exports: `export interface DbTask {` and `export function dbTaskToTask(`.
- Add to `DbTask` (after line 29 `parent_task_id`):
```ts
  group_members: GroupMemberRef[] | null
```
- Import the type at the top: add `GroupMemberRef` to the existing `import type { ... } from '@/types/task'`.
- In `dbTaskToTask`, after the `parentTaskId:` line (~93):
```ts
    groupMembers: (dbTask.group_members && dbTask.group_members.length > 0) ? dbTask.group_members : undefined,
```
- In **both** `updateTask` dbUpdates blocks (the lines that read `if ('parentTaskId' in updates) dbUpdates.parent_task_id = ...`, ~722 and ~815), add directly below each:
```ts
    if ('groupMembers' in updates) dbUpdates.group_members = updates.groupMembers ?? []
```

(Reads use `select('*')`, so the new column is fetched automatically — no select change.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/dbTaskToTask.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: no errors.
```bash
git add src/types/task.ts src/hooks/useSupabaseTasks.ts src/hooks/dbTaskToTask.test.ts
git commit -m "feat(today): persist group_members on the wrapper task"
```

---

## Task 3: timeline key helpers

**Files:**
- Create: `src/lib/today/timelineKey.ts`
- Test: `src/lib/today/timelineKey.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/today/timelineKey.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { parseTimelineKey, timelineKey, partitionSelection } from './timelineKey'

describe('timelineKey', () => {
  it('round-trips a key', () => {
    expect(timelineKey({ type: 'task', id: 'abc' })).toBe('task-abc')
    expect(parseTimelineKey('task-abc')).toEqual({ type: 'task', id: 'abc' })
  })
  it('splits on the first hyphen only (ids may contain hyphens)', () => {
    expect(parseTimelineKey('event-a-b-c')).toEqual({ type: 'event', id: 'a-b-c' })
  })
  it('returns null for an unknown prefix', () => {
    expect(parseTimelineKey('note-1')).toBeNull()
  })
  it('partitions a mixed selection by type', () => {
    const set = new Set(['task-1', 'event-2', 'routine-3', 'task-4'])
    expect(partitionSelection(set)).toEqual({
      taskIds: ['1', '4'], eventIds: ['2'], routineIds: ['3'],
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/today/timelineKey.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/today/timelineKey.ts`:
```ts
export type TimelineRef = { type: 'task' | 'event' | 'routine'; id: string }

export function timelineKey(ref: TimelineRef): string {
  return `${ref.type}-${ref.id}`
}

export function parseTimelineKey(key: string): TimelineRef | null {
  const i = key.indexOf('-')
  if (i === -1) return null
  const type = key.slice(0, i)
  if (type !== 'task' && type !== 'event' && type !== 'routine') return null
  return { type, id: key.slice(i + 1) }
}

export interface PartitionedSelection {
  taskIds: string[]
  eventIds: string[]
  routineIds: string[]
}

export function partitionSelection(keys: Iterable<string>): PartitionedSelection {
  const out: PartitionedSelection = { taskIds: [], eventIds: [], routineIds: [] }
  for (const key of keys) {
    const ref = parseTimelineKey(key)
    if (!ref) continue
    if (ref.type === 'task') out.taskIds.push(ref.id)
    else if (ref.type === 'event') out.eventIds.push(ref.id)
    else out.routineIds.push(ref.id)
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/today/timelineKey.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/today/timelineKey.ts src/lib/today/timelineKey.test.ts
git commit -m "feat(today): timeline-key parse/build + selection partition helpers"
```

---

## Task 4: `groupItems` — group mixed members

**Files:**
- Modify: `src/lib/today/groupTasks.ts` (add `groupItems`; extend `removeFromGroup`)
- Test: `src/lib/today/groupTasks.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Add to `src/lib/today/groupTasks.test.ts`:
```ts
import { groupItems } from './groupTasks'
import type { GroupMemberRef } from '@/types/task'

describe('groupItems', () => {
  it('creates a wrapper, reparents tasks, and writes event/routine refs', async () => {
    const calls: any[] = []
    const deps = {
      addTask: async () => 'wrapper-1',
      updateTask: async (id: string, updates: any) => { calls.push({ id, updates }) },
      refetch: async () => {},
    }
    const memberRefs: GroupMemberRef[] = [
      { type: 'event', id: 'e1' }, { type: 'routine', id: 'r1' },
    ]
    const date = new Date('2026-06-05T00:00:00Z')
    const wrapperId = await groupItems(
      { taskIds: ['t1'], memberRefs, groupName: 'Morning', date, isAllDay: true },
      deps,
    )
    expect(wrapperId).toBe('wrapper-1')
    // task reparented under wrapper
    expect(calls).toContainEqual({ id: 't1', updates: { parentTaskId: 'wrapper-1', scheduledFor: date, isAllDay: true } })
    // members written onto the wrapper
    expect(calls).toContainEqual({ id: 'wrapper-1', updates: { groupMembers: memberRefs } })
  })

  it('returns undefined and touches nothing if wrapper creation fails', async () => {
    const calls: any[] = []
    const deps = {
      addTask: async () => undefined,
      updateTask: async (id: string, u: any) => { calls.push({ id, u }) },
      refetch: async () => {},
    }
    const wrapperId = await groupItems(
      { taskIds: ['t1'], memberRefs: [], groupName: 'x', date: new Date(), isAllDay: true },
      deps,
    )
    expect(wrapperId).toBeUndefined()
    expect(calls).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/today/groupTasks.test.ts`
Expected: FAIL — `groupItems` not exported.

- [ ] **Step 3: Implement `groupItems`**

In `src/lib/today/groupTasks.ts`, add (reuse the existing `GroupTasksDeps`; import the ref type):
```ts
import type { Task, TaskContext, GroupMemberRef } from '@/types/task'

export interface GroupItemsInput {
  taskIds: string[]
  memberRefs: GroupMemberRef[]   // events + routines only (tasks use parentTaskId)
  groupName: string
  date: Date
  isAllDay: boolean
  assignedTo?: string
  context?: TaskContext | null
}

/**
 * Create a wrapper task and attach a mix of members: tasks reparent via
 * parentTaskId (same as groupTasks); events/routines are recorded as refs in
 * the wrapper's group_members. grouping.ts relocates all members under the
 * wrapper card. Returns the wrapper id, or undefined if wrapper creation failed
 * (in which case nothing is touched).
 */
export async function groupItems(
  input: GroupItemsInput,
  deps: GroupTasksDeps,
): Promise<string | undefined> {
  const { taskIds, memberRefs, groupName, date, isAllDay, assignedTo, context } = input
  const wrapperId = await deps.addTask(groupName, undefined, undefined, date, {
    isAllDay, assignedTo, context,
  })
  if (!wrapperId) return undefined
  for (const id of taskIds) {
    await deps.updateTask(id, { parentTaskId: wrapperId, scheduledFor: date, isAllDay })
  }
  if (memberRefs.length > 0) {
    await deps.updateTask(wrapperId, { groupMembers: memberRefs })
  }
  await deps.refetch?.()
  return wrapperId
}
```
(Keep the existing `groupTasks` for the tasks-only path, or have `onGroupTasks` delegate to `groupItems` with `memberRefs: []` — Task 6 wires the new `onGroupItems`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/today/groupTasks.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/today/groupTasks.ts src/lib/today/groupTasks.test.ts
git commit -m "feat(today): groupItems — group tasks + event/routine refs"
```

---

## Task 5: `grouping.ts` — relocate members under the wrapper

**Files:**
- Modify: `src/lib/today/grouping.ts` (post-process block, lines ~91–131)
- Test: `src/lib/today/grouping.test.ts` (extend; create if absent)

Background: members keep their own times, so a grouped 9am event lands in `morning` while an all-day wrapper is in `allday`. The post-process must find members across **all** sections by key, mark them `isSubtask`/`parentTaskId`, pull them out, and place them right after the wrapper.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/today/grouping.test.ts`:
```ts
import { buildGroupedSections } from './grouping'
// Build a minimal GroupingInput with one all-day wrapper task carrying a
// group_members ref to a 9am event, plus that event. Helpers below stub the maps.
function noMatch() { return true }
const empty = new Map<string, any>()

it('relocates a grouped event under its wrapper, across sections', () => {
  const date = new Date('2026-06-05T00:00:00Z')
  const wrapper = {
    id: 'w1', title: 'Morning', completed: false, isAllDay: true,
    scheduledFor: date, groupMembers: [{ type: 'event', id: 'evt1' }],
  } as any
  const event = {
    id: 'evt1', google_event_id: 'evt1', title: 'Standup',
    start_time: '2026-06-05T09:00:00Z', end_time: '2026-06-05T09:15:00Z', all_day: false,
  } as any
  const sections = buildGroupedSections({
    timedTasks: [wrapper], events: [event], routines: [], viewedDate: date,
    routineStatusMap: empty, eventStatusMap: empty, match: noMatch,
  })
  const all = Object.values(sections).flat()
  const wrapperIdx = all.findIndex(i => i.id === 'task-w1')
  const eventIdx = all.findIndex(i => i.id === 'event-evt1')
  // event sits immediately after the wrapper and is marked as a group child
  expect(eventIdx).toBe(wrapperIdx + 1)
  expect(all[eventIdx].isSubtask).toBe(true)
  expect(all[eventIdx].parentTaskId).toBe('w1')
  // event no longer appears as a standalone row in the morning section
  expect(sections.morning?.filter(i => i.id === 'event-evt1' && !i.isSubtask)).toEqual([])
})

it('skips a dangling member ref (member not present)', () => {
  const date = new Date('2026-06-05T00:00:00Z')
  const wrapper = {
    id: 'w1', title: 'Morning', completed: false, isAllDay: true,
    scheduledFor: date, groupMembers: [{ type: 'event', id: 'gone' }],
  } as any
  const sections = buildGroupedSections({
    timedTasks: [wrapper], events: [], routines: [], viewedDate: date,
    routineStatusMap: empty, eventStatusMap: empty, match: noMatch,
  })
  // No crash; wrapper still rendered once.
  expect(Object.values(sections).flat().filter(i => i.id === 'task-w1')).toHaveLength(1)
})
```
Note: `buildGroupedSections` reads `wrapper.groupMembers` via `originalTask` on the TimelineItem (`taskToTimelineItem` sets `originalTask`). Step 3 reads it from there.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/today/grouping.test.ts`
Expected: FAIL — event appears in `morning`, not after the wrapper; `isSubtask` not set.

- [ ] **Step 3: Implement the relocation**

In `src/lib/today/grouping.ts`, replace the post-process block (the `for (const key of Object.keys(sections)...)` loop, ~lines 91–131) with this order-independent version. It (1) indexes every item and remembers its original section, (2) marks event/routine `group_members` as subtasks of their wrapper, (3) groups all children (task subtasks + members) by wrapper, (4) rebuilds each section emitting each wrapper immediately followed by its children and skipping children/relocated-members from standalone positions, (5) restores any orphaned child (parent not rendered) to its original section:

```ts
  // ── Group relocation ─────────────────────────────────────────────────────
  // A wrapper's children are task subtasks (parentTaskId) plus event/routine
  // members (the wrapper's group_members). Members keep their own times, so a
  // member can land in a different day-section than the wrapper; we pull it out
  // and emit it right after the wrapper. Order-independent across sections.
  const byId = new Map<string, TimelineItem>()
  const originalSection = new Map<string, DaySection>()
  for (const key of Object.keys(sections) as DaySection[]) {
    for (const item of sections[key]) {
      byId.set(item.id, item)
      originalSection.set(item.id, key)
    }
  }

  // (2) Mark event/routine members as subtasks of their wrapper.
  const relocatedIds = new Set<string>() // members pulled from their own time slot
  for (const item of byId.values()) {
    if (item.type !== 'task') continue
    const refs = item.originalTask?.groupMembers
    if (!refs?.length) continue
    const wrapperRawId = item.id.replace('task-', '')
    for (const ref of refs) {
      const member = byId.get(`${ref.type}-${ref.id}`)
      if (!member) continue // dangling ref — skip
      member.isSubtask = true
      member.parentTaskId = wrapperRawId
      relocatedIds.add(member.id)
    }
  }

  // (3) Index children (subtasks + members) by wrapper raw id.
  const childrenByParent = new Map<string, TimelineItem[]>()
  for (const item of byId.values()) {
    if (item.isSubtask && item.parentTaskId) {
      const arr = childrenByParent.get(item.parentTaskId) ?? []
      arr.push(item)
      childrenByParent.set(item.parentTaskId, arr)
    }
  }

  // (4) Rebuild each section: wrapper then its children; skip children and
  //     relocated members from their standalone slots.
  const placed = new Set<string>()
  for (const key of Object.keys(sections) as DaySection[]) {
    const result: TimelineItem[] = []
    for (const item of sections[key]) {
      if (item.isSubtask) continue            // emitted under its parent
      if (relocatedIds.has(item.id)) continue // member emitted under its wrapper
      result.push(item)
      const rawId = item.type === 'task' ? item.id.replace('task-', '') : null
      if (rawId) {
        for (const child of childrenByParent.get(rawId) ?? []) {
          if (!placed.has(child.id)) { result.push(child); placed.add(child.id) }
        }
      }
    }
    sections[key] = result
  }

  // (5) Orphan children (parent filtered out / not rendered): restore to their
  //     original section so they never vanish. A relocated member reverts to a
  //     normal standalone row.
  for (const arr of childrenByParent.values()) {
    for (const child of arr) {
      if (placed.has(child.id)) continue
      if (relocatedIds.has(child.id)) { child.isSubtask = false; child.parentTaskId = undefined }
      const sec = originalSection.get(child.id)
      if (sec) sections[sec].push(child)
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/today/grouping.test.ts`
Expected: PASS (both cases). Then run the existing grouping/subtask tests to confirm no regression: `npx vitest run src/lib/today/`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/today/grouping.ts src/lib/today/grouping.test.ts
git commit -m "feat(today): relocate grouped event/routine members under the wrapper card"
```

---

## Task 6: `onGroupItems` context action + App wiring

**Files:**
- Modify: `src/contexts/ScheduleActionsContext.tsx` (add `onGroupItems` to the value type, ~after line 26)
- Modify: `src/App.tsx` (implement `onGroupItems` in the provider value, ~near line 1194)
- Test: covered via Task 4 (`groupItems`) + Task 7 manual; no separate unit test for the thin wiring.

- [ ] **Step 1: Add the context types**

In `src/contexts/ScheduleActionsContext.tsx`, below the existing `onGroupTasks?` declaration:
```ts
  onGroupItems?: (
    taskIds: string[],
    memberRefs: import('@/types/task').GroupMemberRef[],
    groupName: string,
    date: Date,
    isAllDay: boolean,
  ) => Promise<void>
  /** Show a transient toast (skip-report for bulk actions). Wired to App's toast. */
  onNotify?: (message: string) => void
```
(`useToast` is local `useState` and renders only in App's tree, so TodayView must report through this context callback rather than calling `useToast()` itself.)

- [ ] **Step 2: Implement in App.tsx**

In `src/App.tsx`, next to the existing `onGroupTasks:` handler (~line 1194), add:
```ts
    onGroupItems: async (taskIds, memberRefs, groupName, date, isAllDay) => {
      const wrapperId = await groupItems(
        {
          taskIds, memberRefs, groupName, date, isAllDay,
          assignedTo: getCurrentUserMember()?.id,
          context: currentDomain !== 'universal' ? currentDomain : undefined,
        },
        { addTask, updateTask, refetch: refetchTasks },
      )
      if (!wrapperId) showToast("Couldn't create group", 'warning')
    },
    onNotify: (message: string) => showToast(message, 'info'),
```
Add `groupItems` to the existing import from `@/lib/today/groupTasks` (the file already imports `groupTasks` from there). `showToast` is already in scope in this provider value (App calls `useToast()` at ~line 216).

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: no errors.
```bash
git add src/contexts/ScheduleActionsContext.tsx src/App.tsx
git commit -m "feat(today): wire onGroupItems through ScheduleActionsContext"
```

---

## Task 7: TodayView — unified selection + adaptive bulk edits

**Files:**
- Modify: `src/components/schedule/TodayView.tsx` (selection state ~148, bulk handlers ~158–187, ScheduleItem bulk props ~684–687, toolbar wiring)
- Test: extend `src/components/schedule/BulkActionToolbar.test.tsx` (Task 8) + manual

This is the largest change. Make it incrementally, typechecking between edits.

- [ ] **Step 1: Switch selection to timeline keys**

Replace the selection state + toggles (~lines 148–156):
```ts
  // ── Bulk multi-select (hover checkbox on any row → bottom action bar) ──────
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set())
  const clearBulkSelection = useCallback(() => setSelectedKeys(new Set()), [])
  const toggleBulkSelect = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }, [])
```
Add import:
```ts
import { partitionSelection } from '@/lib/today/timelineKey'
import type { GroupMemberRef } from '@/types/task'
```

- [ ] **Step 2: Rewrite the bulk handlers to partition + fan out**

Replace `handleBulkDefer/Schedule/SetContext/Assign/Group` (~158–187) with:
```ts
  const handleBulkDefer = useCallback((target: 'week' | 'month' | 'quarter') => {
    const { taskIds, eventIds, routineIds } = partitionSelection(selectedKeys)
    for (const id of taskIds) onUpdateTask(id, { bucket: target, scheduledFor: undefined })
    const skipped = eventIds.length + routineIds.length
    if (skipped > 0) onNotify?.(`Deferred ${taskIds.length} — ${skipped} non-task item(s) skipped`)
    clearBulkSelection()
  }, [selectedKeys, onUpdateTask, onNotify, clearBulkSelection])

  const handleBulkSchedule = useCallback((date: Date, isAllDay: boolean) => {
    const { taskIds, eventIds, routineIds } = partitionSelection(selectedKeys)
    for (const id of taskIds) onUpdateTask(id, { bucket: 'timed', scheduledFor: date, isAllDay })
    for (const id of routineIds) onPushRoutine?.(id, date)
    for (const id of eventIds) onPushEvent?.(id, date)
    clearBulkSelection()
  }, [selectedKeys, onUpdateTask, onPushRoutine, onPushEvent, clearBulkSelection])

  const handleBulkSetContext = useCallback((context: Task['context']) => {
    const { taskIds, eventIds, routineIds } = partitionSelection(selectedKeys)
    for (const id of taskIds) onUpdateTask(id, { context })
    for (const id of eventIds) onUpdateEventContext?.(id, context ?? null)
    if (routineIds.length > 0) onNotify?.(`Context set — ${routineIds.length} routine(s) skipped (edit the routine to change every day)`)
    clearBulkSelection()
  }, [selectedKeys, onUpdateTask, onUpdateEventContext, onNotify, clearBulkSelection])

  const handleBulkAssign = useCallback((memberIds: string[]) => {
    const { taskIds, eventIds, routineIds } = partitionSelection(selectedKeys)
    for (const id of taskIds) onAssignTaskAll?.(id, memberIds)
    for (const id of eventIds) onAssignEventAll?.(id, memberIds)
    if (routineIds.length > 0) onNotify?.(`Assigned — ${routineIds.length} routine(s) skipped`)
    clearBulkSelection()
  }, [selectedKeys, onAssignTaskAll, onAssignEventAll, onNotify, clearBulkSelection])

  const handleBulkGroup = useCallback(async (name: string, date: Date, isAllDay: boolean) => {
    const { taskIds, eventIds, routineIds } = partitionSelection(selectedKeys)
    const memberRefs: GroupMemberRef[] = [
      ...eventIds.map((id) => ({ type: 'event' as const, id })),
      ...routineIds.map((id) => ({ type: 'routine' as const, id })),
    ]
    if (onGroupItems) await onGroupItems(taskIds, memberRefs, name, date, isAllDay)
    else if (onGroupTasks) await onGroupTasks(taskIds, name, date, isAllDay)
    clearBulkSelection()
  }, [selectedKeys, onGroupItems, onGroupTasks, clearBulkSelection])
```
Destructure the needed handlers from the context where the others are pulled: `onPushRoutine`, `onPushEvent`, `onUpdateEventContext`, `onAssignTaskAll`, `onAssignEventAll`, `onGroupItems`, `onNotify`. (TodayView has no toast of its own — `onNotify` comes from the context, wired to App's toast in Task 6.)

- [ ] **Step 3: Un-gate the checkbox for all rows**

At the `<ScheduleItem>` props (~684–687), change:
```ts
                          bulkSelectable={true}
                          bulkSelected={selectedKeys.has(item.id)}
                          showBulkAffordance={selectedKeys.size > 0}
                          onToggleBulkSelect={() => toggleBulkSelect(item.id)}
```
(`item.id` is already the timeline key, e.g. `event-…`.) Remove the now-unused `taskId`-based `selectedTaskIds.has(taskId)` references for bulk; leave `taskId` usage for the other task-only props (complete/waiting/push).

- [ ] **Step 4: Update the toolbar mount condition + props**

The `<BulkActionToolbar>` block is at ~lines 844–854, currently guarded by `selectedTaskIds.size > 0` (the `{… && (` just above line 844) and reading `selectedCount={selectedTaskIds.size}`. Change:
- the guard `selectedTaskIds.size > 0` → `selectedKeys.size > 0`
- `selectedCount={selectedTaskIds.size}` → `selectedCount={selectedKeys.size}`
- `onGroup={onGroupTasks ? handleBulkGroup : undefined}` → `onGroup={(onGroupItems || onGroupTasks) ? handleBulkGroup : undefined}`

Leave `onSendToList={() => {}}` as-is — it is already a no-op for bulk (send-to-list stays task-only via the inbox flow; not in scope here). All other props (`onDefer/onSchedule/onSetContext/onAssign/onCancel/familyMembers`) are unchanged.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. Fix any remaining `selectedTaskIds` references (should all be `selectedKeys` now).

- [ ] **Step 6: Commit**

```bash
git add src/components/schedule/TodayView.tsx
git commit -m "feat(today): multi-type selection + adaptive bulk edits on Today"
```

---

## Task 8: ScheduleItem aria copy + BulkActionToolbar test

**Files:**
- Modify: `src/components/schedule/ScheduleItem.tsx` (aria-label, ~lines 476)
- Test: `src/components/schedule/BulkActionToolbar.test.tsx` (extend)

- [ ] **Step 1: Update aria copy**

In `ScheduleItem.tsx` (~line 476), change the checkbox `aria-label`:
```ts
          aria-label={bulkSelected ? 'Deselect item' : 'Select item'}
```

- [ ] **Step 2: Write the test (Group always available)**

Add to `src/components/schedule/BulkActionToolbar.test.tsx`:
```ts
it('shows the Group action whenever onGroup is provided (any selection mix)', () => {
  render(
    <BulkActionToolbar
      selectedCount={3}
      onDefer={() => {}} onSchedule={() => {}} onSetContext={() => {}}
      onAssign={() => {}} onSendToList={() => {}} onCancel={() => {}}
      onGroup={() => {}}
    />,
  )
  expect(screen.getByRole('button', { name: /group/i })).toBeInTheDocument()
})
```
(Match the existing import/render style in this test file.)

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/components/schedule/BulkActionToolbar.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/schedule/ScheduleItem.tsx src/components/schedule/BulkActionToolbar.test.tsx
git commit -m "feat(today): 'Select item' aria + Group-always-available test"
```

---

## Task 9: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck + full unit suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; suite green (the pre-existing flaky `useNotes` test may need a rerun — see memory; everything else passes).

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no new errors (CI gates on lint; pre-push does not — see memory).

- [ ] **Step 3: Manual smoke (dev server)**

Run: `npm run dev` (ensure `.env` exists in the worktree — copy from main worktree if blank screen, see memory). Then, logged in on Today:
- Select 2 tasks + 1 routine + 1 event → **Group** "Morning" all-day → all four nest under one tinted wrapper card; the 9am event is pulled up under the wrapper, not left at 9am.
- Select the same mix → **When** → 2pm → tasks reschedule, routine + event move via today-only override (refresh: the routine's pattern time and the Google event are unchanged).
- Select a task + an event → **Context** → Work → both take Work; add a routine to the selection and repeat → toast: "1 routine skipped".
- Select a task + event → **Assign** → a member → both show the avatar; routine in selection → toast skip.
- Remove the wrapper (delete the group task) → members return to standalone at their real times.

- [ ] **Step 4: Push (deploys to prod)**

Only after Steps 1–3 are green. Rebase first if behind:
```bash
git fetch origin && git rebase origin/main
git push origin HEAD:main
```
The pre-push hook runs `tsc --noEmit` + unit tests on a `main` push. Do not `--no-verify`.

- [ ] **Step 5: Remove the worktree once merged**

```bash
cd /Users/scottkaufman/Developer/Developer/symphonyOS
git worktree remove .worktrees/today-group-tasks
```

---

## Self-review notes (coverage check)

- Spec "unified selection model" → Task 7 Step 1.
- "Enable checkbox on every row" → Task 7 Step 3 (+ Task 8 aria).
- "Group across types / group_members" → Tasks 1, 2, 4, 6.
- "Relocate members under wrapper" → Task 5.
- "Adaptive bulk edits" (time all types; context/assignee tasks+events; routines skipped; defer/list tasks-only) → Task 7 Step 2.
- "Local overrides, no Google writes" → Task 7 uses `onPushEvent`/`onUpdateEventContext`/`onAssignEventAll` (verified local); `onUpdateEvent` is never called.
- Tests: timelineKey (T3), groupItems (T4), grouping relocation + dangling ref (T5), dbTask mapping (T2), toolbar (T8).
- Naming consistency: `groupItems`, `onGroupItems`, `GroupMemberRef`, `partitionSelection`, `selectedKeys` used identically across tasks.
