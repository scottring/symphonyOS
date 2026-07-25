# Today Drag — Stage 2a: Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the four data-layer pieces the Today drag gestures need — a persisted manual order, the pure ordering maths, a bulk order writer, and the ability to add an item to an existing group — with no UI wiring.

**Architecture:** `tasks` gains a nullable `sort_order` integer used with **gap-based** spacing (increments of 1000), so a typical drag rewrites exactly ONE row instead of renormalising the whole list. A pure `taskOrdering.ts` mirrors the existing `lib/today/stepOrdering.ts` but returns gap-based positions and only signals a full renormalise when a gap collapses. `updateTaskOrders` writes many per-row values in one round trip. `addToGroup` closes the one genuinely missing hole in `groupTasks.ts`.

**Tech Stack:** React 19 + TypeScript strict, Supabase (Postgres), Vitest, `@dnd-kit/sortable` (for `arrayMove` only — no UI in this plan).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-25-today-asks-what-time-design.md`. This plan is **Stage 2a only**: no dnd-kit context, no drop targets, no gesture wiring, no visual change whatsoever. Stage 2b consumes what this builds.
- **Worktree:** `.worktrees/today-drag`, branch `today-drag`, based on `today-what-time` (Stage 1). **Never** edit or commit in the main worktree at `/Users/scottkaufman/Developer/Developer/symphonyOS`.
- **Node:** the machine default is v26.5.0 and this repo has a Node-26 test trap. Prefix EVERY command, in the same shell invocation, with:
  `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`
- **Never run `npm test`** — it is vitest watch mode and hangs forever. Always `npx vitest run`.
- **Baseline:** `npx tsc -b` clean · `npx vitest run` → 426 files, 4041 passed, 3 skipped · `npm run build` clean · `npm run lint` → **8 pre-existing errors** (confirm unchanged with your work stashed before blaming yourself).
- **Migrations are known out of sync** in this project. Apply DDL via the Supabase Management API (`POST /v1/projects/mwadppyrqzuzgstmwpuy/database/query`), not the CLI. The token is in the keychain; the on-disk token is stale.
- TypeScript strict. Path alias `@/` → `src/`. Lucide icons only, never emojis.
- A dev server may be running on port 5173 from a sibling worktree. Leave it alone.

**Ordering model — the one design decision every task depends on:**

`sort_order` is a nullable integer with **gaps of 1000**. Appending uses `max + 1000`. Inserting between neighbours `a` and `b` uses `floor((a + b) / 2)`. When `b - a <= 1` there is no room left, and only then does the whole list renormalise to `0, 1000, 2000, …`.

This is a **deliberate departure from the in-repo precedent.** `stepOrdering.ts` renormalises `0..n-1` on every move and `RoutinesApp.tsx:82` persists it with `Promise.all(writes.map(w => updateRoutine(...)))` — one DB write per item. That is fine for a handful of routine steps. Today holds ~27 all-day items, so that pattern means 27 writes plus 27 realtime echoes per drag, and Supabase egress is a known cost problem in this project. Gap-based ordering makes the common case one write.

`sort_order` governs **only items with no time** — the all-day set, the unscheduled set, and members within a group. Timed items sort by time (Stage 2b makes reordering a timed item rewrite its time instead).

---

### Task 1: The `sort_order` column

**Files:**
- Modify: `src/hooks/useSupabaseTasks.ts` — `DbTask` interface (~line 45-62), `dbTaskToTask` (~line 109-135), the update-mapping blocks (~line 928 and ~line 1046)
- Modify: `src/types/task.ts` — the `Task` interface
- Test: `src/hooks/useSupabaseTasks.test.ts` (or the nearest existing serializer test — find it before creating a new file)

**Interfaces:**
- Consumes: nothing.
- Produces: `Task.sortOrder?: number | null` (camelCase in app code, `sort_order` in the DB).

- [ ] **Step 1: Apply the DDL**

Via the Supabase Management API (the CLI is out of sync in this project):

```sql
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sort_order integer;
```

Nullable with no default and no backfill — a `null` `sort_order` means "never manually ordered", which the ordering maths treats as "sort by the existing fallback". Backfilling every row would be a large write for no benefit.

Confirm it landed:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'tasks' AND column_name = 'sort_order';
```
Expected: one row, `integer`, `YES`.

- [ ] **Step 2: Write the failing serializer test**

Find the existing test that covers `dbTaskToTask` / the update mapping (this project has a locked-down column-set test from the push-sync work — search for `dbTaskToTask` or `group_members` in `src/hooks/*.test.ts`). Add to it:

```typescript
it('round-trips sort_order', () => {
  const task = dbTaskToTask({ ...baseDbTask, sort_order: 2000 } as DbTask)
  expect(task.sortOrder).toBe(2000)
})

it('treats a missing sort_order as null, not 0', () => {
  const task = dbTaskToTask({ ...baseDbTask, sort_order: null } as DbTask)
  expect(task.sortOrder).toBeNull()
})
```

The second test matters: `0` is a legitimate first position, so a `null → 0` coercion would silently pin unordered tasks to the top.

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run src/hooks/useSupabaseTasks.test.ts`
Expected: FAIL — `sortOrder` is not a property of `Task`.

- [ ] **Step 4: Implement**

In `src/types/task.ts`, add to the `Task` interface:

```typescript
  /** Manual position among items with no time (all-day, unscheduled, group
   *  members). Gap-based: increments of 1000 so a drag usually rewrites one
   *  row. null = never manually ordered. Timed items sort by time, not this. */
  sortOrder?: number | null
```

In `useSupabaseTasks.ts`, add `sort_order: number | null` to `DbTask`, then in `dbTaskToTask` add:

```typescript
    sortOrder: dbTask.sort_order ?? null,
```

In **both** update-mapping blocks (~928 and ~1046 — this file has two, and missing one is a known trap in this codebase), add:

```typescript
    if ('sortOrder' in updates) dbUpdates.sort_order = updates.sortOrder ?? null
```

- [ ] **Step 5: Verify**

Run: `npx vitest run src/hooks/ && npx tsc -b`
Expected: PASS, tsc clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(today): tasks.sort_order for manual ordering

Nullable integer, gap-based (increments of 1000). No backfill: null means
never manually ordered, and 0 is a legitimate first position, so the mapping
must not coerce null to 0."
```

---

### Task 2: `taskOrdering.ts` — the pure maths

**Files:**
- Create: `src/lib/today/taskOrdering.ts`
- Test: `src/lib/today/taskOrdering.test.ts`

**Interfaces:**
- Consumes: `Task` with `sortOrder` (Task 1).
- Produces:
  - `export const SORT_ORDER_GAP = 1000`
  - `export interface OrderWrite { id: string; sortOrder: number }`
  - `export function nextSortOrder(items: { sortOrder?: number | null }[]): number`
  - `export function sortByManualOrder<T extends { id: string; sortOrder?: number | null; createdAt: Date }>(items: T[]): T[]`
  - `export function reorderByDrag(orderedIds: string[], activeId: string, overId: string, currentOrders: Map<string, number | null>): OrderWrite[]`

`reorderByDrag` returns **one** write in the common case, or writes for the whole list when a renormalise was required. The caller does not need to know which.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/today/taskOrdering.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  SORT_ORDER_GAP, nextSortOrder, sortByManualOrder, reorderByDrag,
} from '@/lib/today/taskOrdering'

const d = (n: number) => new Date(2026, 6, 25, 0, 0, n)

describe('nextSortOrder', () => {
  it('starts at 0 for an empty list', () => {
    expect(nextSortOrder([])).toBe(0)
  })
  it('appends one gap past the highest', () => {
    expect(nextSortOrder([{ sortOrder: 0 }, { sortOrder: 1000 }])).toBe(2000)
  })
  it('ignores nulls when finding the highest', () => {
    expect(nextSortOrder([{ sortOrder: null }, { sortOrder: 5000 }])).toBe(6000)
  })
})

describe('sortByManualOrder', () => {
  it('orders by sortOrder when present', () => {
    const out = sortByManualOrder([
      { id: 'b', sortOrder: 2000, createdAt: d(1) },
      { id: 'a', sortOrder: 1000, createdAt: d(2) },
    ])
    expect(out.map(i => i.id)).toEqual(['a', 'b'])
  })
  it('puts never-ordered items after ordered ones, oldest first', () => {
    const out = sortByManualOrder([
      { id: 'new', sortOrder: null, createdAt: d(9) },
      { id: 'old', sortOrder: null, createdAt: d(1) },
      { id: 'ordered', sortOrder: 1000, createdAt: d(5) },
    ])
    expect(out.map(i => i.id)).toEqual(['ordered', 'old', 'new'])
  })
})

describe('reorderByDrag', () => {
  const orders = (pairs: [string, number | null][]) => new Map(pairs)

  it('writes ONE row when there is room between neighbours', () => {
    // a=0, b=1000, c=2000 — move c between a and b
    const writes = reorderByDrag(['a','b','c'], 'c', 'b',
      orders([['a',0],['b',1000],['c',2000]]))
    expect(writes).toHaveLength(1)
    expect(writes[0].id).toBe('c')
    expect(writes[0].sortOrder).toBeGreaterThan(0)
    expect(writes[0].sortOrder).toBeLessThan(1000)
  })

  it('writes one row when dropped at the very end', () => {
    const writes = reorderByDrag(['a','b','c'], 'a', 'c',
      orders([['a',0],['b',1000],['c',2000]]))
    expect(writes).toHaveLength(1)
    expect(writes[0].id).toBe('a')
    expect(writes[0].sortOrder).toBeGreaterThan(2000)
  })

  it('renormalises the whole list when the gap collapses', () => {
    // a=0, b=1 — no integer strictly between them
    const writes = reorderByDrag(['a','b','c'], 'c', 'b',
      orders([['a',0],['b',1],['c',5000]]))
    expect(writes.length).toBeGreaterThan(1)
    const byId = new Map(writes.map(w => [w.id, w.sortOrder]))
    // after renormalise the requested order must actually hold
    expect(byId.get('a')!).toBeLessThan(byId.get('c')!)
    expect(byId.get('c')!).toBeLessThan(byId.get('b')!)
    // and the gaps are restored
    expect(new Set(writes.map(w => w.sortOrder)).size).toBe(writes.length)
  })

  it('renormalises when any participant has a null order', () => {
    const writes = reorderByDrag(['a','b'], 'b', 'a', orders([['a',null],['b',null]]))
    expect(writes).toHaveLength(2)
    expect(writes[0].sortOrder).toBe(0)
    expect(writes[1].sortOrder).toBe(SORT_ORDER_GAP)
  })

  it('returns no writes when the item is dropped on itself', () => {
    expect(reorderByDrag(['a','b'], 'a', 'a', orders([['a',0],['b',1000]]))).toEqual([])
  })

  it('returns no writes for an unknown id', () => {
    expect(reorderByDrag(['a','b'], 'zz', 'a', orders([['a',0],['b',1000]]))).toEqual([])
  })
})
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run src/lib/today/taskOrdering.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `src/lib/today/taskOrdering.ts`:

```typescript
import { arrayMove } from '@dnd-kit/sortable'

/**
 * Manual ordering for Today's untimed items (all-day, unscheduled, group
 * members). Timed items sort by time — see the Stage 2 spec.
 *
 * Gap-based on purpose. `lib/today/stepOrdering.ts` renormalises 0..n-1 on
 * every move, and its caller persists that with one DB write per item
 * (RoutinesApp.tsx:82). That is fine for a few routine steps; Today holds ~27
 * all-day items, so it would mean 27 writes plus 27 realtime echoes per drag.
 * With gaps of 1000, the common case is a single write.
 */
export const SORT_ORDER_GAP = 1000

export interface OrderWrite {
  id: string
  sortOrder: number
}

/** The sortOrder for a newly appended item. */
export function nextSortOrder(items: { sortOrder?: number | null }[]): number {
  const orders = items.map((i) => i.sortOrder).filter((o): o is number => o != null)
  if (orders.length === 0) return 0
  return Math.max(...orders) + SORT_ORDER_GAP
}

/**
 * Ordered items first (by sortOrder), then never-ordered ones oldest-first.
 * A null sortOrder must NOT be read as 0 — 0 is a real first position.
 */
export function sortByManualOrder<
  T extends { id: string; sortOrder?: number | null; createdAt: Date },
>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const ao = a.sortOrder ?? null
    const bo = b.sortOrder ?? null
    if (ao != null && bo != null) return ao - bo
    if (ao != null) return -1
    if (bo != null) return 1
    return a.createdAt.getTime() - b.createdAt.getTime()
  })
}

/** Evenly spaced writes for the whole list, in the given id order. */
function renormalise(orderedIds: string[]): OrderWrite[] {
  return orderedIds.map((id, i) => ({ id, sortOrder: i * SORT_ORDER_GAP }))
}

/**
 * Move `activeId` to `overId`'s position. Returns the minimal set of writes:
 * one row when a gap exists between the new neighbours, otherwise a full
 * renormalise. Empty array when the move is a no-op or an id is unknown.
 */
export function reorderByDrag(
  orderedIds: string[],
  activeId: string,
  overId: string,
  currentOrders: Map<string, number | null>,
): OrderWrite[] {
  if (activeId === overId) return []
  const from = orderedIds.indexOf(activeId)
  const to = orderedIds.indexOf(overId)
  if (from === -1 || to === -1) return []

  const moved = arrayMove(orderedIds, from, to)
  const pos = moved.indexOf(activeId)
  const beforeId = pos > 0 ? moved[pos - 1] : null
  const afterId = pos < moved.length - 1 ? moved[pos + 1] : null
  const before = beforeId ? currentOrders.get(beforeId) ?? null : null
  const after = afterId ? currentOrders.get(afterId) ?? null : null

  // Any participant without an order means there is nothing to interpolate
  // between — lay the whole list out cleanly instead.
  if ((beforeId && before == null) || (afterId && after == null)) {
    return renormalise(moved)
  }

  if (before == null && after == null) return renormalise(moved)
  if (before == null) return [{ id: activeId, sortOrder: after! - SORT_ORDER_GAP }]
  if (after == null) return [{ id: activeId, sortOrder: before + SORT_ORDER_GAP }]

  // No integer strictly between the neighbours — the gap is spent.
  if (after - before <= 1) return renormalise(moved)

  return [{ id: activeId, sortOrder: Math.floor((before + after) / 2) }]
}
```

- [ ] **Step 4: Verify**

Run: `npx vitest run src/lib/today/taskOrdering.test.ts && npx tsc -b`
Expected: all PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/today/taskOrdering.ts src/lib/today/taskOrdering.test.ts
git commit -m "feat(today): gap-based manual ordering maths

One write per drag in the common case, full renormalise only when a gap
collapses. Deliberately not stepOrdering.ts's 0..n-1-every-time, which its
caller persists as one DB write per item — fine for a few routine steps,
27 writes and 27 realtime echoes per drag on Today."
```

---

### Task 3: `updateTaskOrders` — many per-row values, one round trip

**Files:**
- Modify: `src/hooks/useSupabaseTasks.ts` — add beside `updateTasksBulk` (~line 992), and add to the hook's return object (~line 1244)
- Test: the same hook test file used in Task 1

**Interfaces:**
- Consumes: `OrderWrite` from Task 2 (`{ id: string; sortOrder: number }`).
- Produces: `updateTaskOrders(writes: OrderWrite[]): Promise<void>` on the `useSupabaseTasks` return object.

**Why not `updateTasksBulk`:** its signature is `(taskIds: string[], updates: Partial<Task>)` — the SAME update applied to every id. Reordering needs a different value per row, so it cannot be expressed with it.

- [ ] **Step 1: Write the failing test**

```typescript
it('updateTaskOrders applies a different sortOrder per task, optimistically', async () => {
  // Follow this file's existing supabase-mock pattern — find how other tests
  // in this file stub `supabase.from(...)` and reuse it exactly.
  const { result } = renderHook(() => useSupabaseTasks())
  await act(async () => {
    await result.current.updateTaskOrders([
      { id: 't1', sortOrder: 0 },
      { id: 't2', sortOrder: 1000 },
    ])
  })
  const t1 = result.current.tasks.find(t => t.id === 't1')
  const t2 = result.current.tasks.find(t => t.id === 't2')
  expect(t1?.sortOrder).toBe(0)
  expect(t2?.sortOrder).toBe(1000)
})

it('updateTaskOrders is a no-op for an empty list', async () => {
  const { result } = renderHook(() => useSupabaseTasks())
  await act(async () => { await result.current.updateTaskOrders([]) })
  // must not throw and must not issue a request
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run src/hooks/useSupabaseTasks.test.ts`
Expected: FAIL — `updateTaskOrders` is not a function.

- [ ] **Step 3: Implement**

Add beside `updateTasksBulk`:

```typescript
  /**
   * Write a different sort_order to each of several tasks in one round trip.
   * `updateTasksBulk` cannot express this — it applies ONE update object to
   * every id. Optimistic first (the list must not visibly lurch), then one
   * upsert; on failure the previous orders are restored.
   */
  const updateTaskOrders = useCallback(async (writes: { id: string; sortOrder: number }[]) => {
    if (writes.length === 0) return
    const byId = new Map(writes.map((w) => [w.id, w.sortOrder]))
    const previous = new Map<string, number | null>()
    for (const t of tasksRef.current) {
      if (byId.has(t.id)) previous.set(t.id, t.sortOrder ?? null)
    }

    const apply = (orders: Map<string, number | null>) =>
      setTasks((prev) =>
        prev.map((t) => (orders.has(t.id) ? { ...t, sortOrder: orders.get(t.id)! } : t)))

    apply(byId)
    announceLocalWrite({ kind: 'update' })

    const { error: writeError } = await supabase
      .from('tasks')
      .upsert(writes.map((w) => ({ id: w.id, sort_order: w.sortOrder })), { onConflict: 'id' })

    if (writeError) {
      apply(previous)
      showToast("Couldn't save the new order", 'warning')
      logger.error('[updateTaskOrders] failed:', writeError)
    }
  }, [])
```

Then add `updateTaskOrders` to the hook's returned object (~line 1244).

**Two things to get right.** `announceLocalWrite` is required — this project has a same-tab local write bus, and a mutation that skips it leaves other mounted instances stale (a known, previously-shipped bug class). And the upsert must send only `id` and `sort_order`; sending a partial row on a full upsert would blank other columns.

- [ ] **Step 4: Verify**

Run: `npx vitest run src/hooks/ && npx tsc -b`
Expected: PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(today): updateTaskOrders writes a different order per row

updateTasksBulk applies one update object to every id, so it cannot express a
reorder. Optimistic with rollback, one upsert, and announceLocalWrite so other
mounted hook instances don't go stale."
```

---

### Task 4: `addToGroup` — groups stop being create-once

**Files:**
- Modify: `src/lib/today/groupTasks.ts`
- Test: `src/lib/today/groupTasks.test.ts`

**Interfaces:**
- Consumes: the existing `GroupTasksDeps` (`addTask`, `updateTask`, optional `refetch`) already defined in this file.
- Produces:
  ```typescript
  export interface AddToGroupInput {
    wrapperId: string
    /** Tasks to reparent. */
    taskIds: string[]
    /** Events/routines to attach as group_members refs. */
    memberRefs: GroupMemberRef[]
    /** The wrapper's existing group_members — new refs are APPENDED to these. */
    existingMemberRefs: GroupMemberRef[]
    date: Date
    isAllDay: boolean
  }
  export async function addToGroup(input: AddToGroupInput, deps: GroupTasksDeps): Promise<void>
  ```

**Context:** `groupTasks.ts` currently exports `groupTasks`, `groupItems`, `removeFromGroup`, `ungroupTasks`, `deleteTaskGroup`. There is no way to add a member to an existing group — the only route is ungroup-then-regroup. Tasks attach via `parentTaskId`; events and routines ride as `group_members` refs which `grouping.ts` relocates under the wrapper card.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/today/groupTasks.test.ts` (match the existing tests' fake-deps style):

```typescript
describe('addToGroup', () => {
  const deps = () => {
    const updateTask = vi.fn()
    const refetch = vi.fn()
    return { addTask: vi.fn(), updateTask, refetch }
  }

  it('reparents each task onto the wrapper, inheriting its date and all-day', async () => {
    const d = deps()
    await addToGroup({
      wrapperId: 'w1', taskIds: ['t1', 't2'], memberRefs: [], existingMemberRefs: [],
      date: new Date(2026, 6, 25), isAllDay: true,
    }, d)
    expect(d.updateTask).toHaveBeenCalledWith('t1',
      expect.objectContaining({ parentTaskId: 'w1', isAllDay: true }))
    expect(d.updateTask).toHaveBeenCalledWith('t2',
      expect.objectContaining({ parentTaskId: 'w1', isAllDay: true }))
  })

  it('APPENDS new refs to the wrapper rather than replacing them', async () => {
    const d = deps()
    const existing = [{ type: 'event' as const, id: 'e1' }]
    await addToGroup({
      wrapperId: 'w1', taskIds: [], memberRefs: [{ type: 'routine', id: 'r1' }],
      existingMemberRefs: existing, date: new Date(2026, 6, 25), isAllDay: true,
    }, d)
    expect(d.updateTask).toHaveBeenCalledWith('w1', {
      groupMembers: [{ type: 'event', id: 'e1' }, { type: 'routine', id: 'r1' }],
    })
  })

  it('does not re-add a ref the group already has', async () => {
    const d = deps()
    const existing = [{ type: 'event' as const, id: 'e1' }]
    await addToGroup({
      wrapperId: 'w1', taskIds: [], memberRefs: [{ type: 'event', id: 'e1' }],
      existingMemberRefs: existing, date: new Date(2026, 6, 25), isAllDay: true,
    }, d)
    const call = d.updateTask.mock.calls.find(c => c[0] === 'w1')
    if (call) expect(call[1].groupMembers).toEqual(existing)
  })

  it('refetches once, after all writes', async () => {
    const d = deps()
    await addToGroup({
      wrapperId: 'w1', taskIds: ['t1'], memberRefs: [], existingMemberRefs: [],
      date: new Date(2026, 6, 25), isAllDay: true,
    }, d)
    expect(d.refetch).toHaveBeenCalledTimes(1)
  })

  it('does nothing when there is nothing to add', async () => {
    const d = deps()
    await addToGroup({
      wrapperId: 'w1', taskIds: [], memberRefs: [], existingMemberRefs: [],
      date: new Date(2026, 6, 25), isAllDay: true,
    }, d)
    expect(d.updateTask).not.toHaveBeenCalled()
    expect(d.refetch).not.toHaveBeenCalled()
  })
})
```

The append test is the important one: `groupItems` **replaces** `groupMembers` wholesale, and reusing that call shape here would silently drop every existing event/routine member the moment you added one more.

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run src/lib/today/groupTasks.test.ts`
Expected: FAIL — `addToGroup` is not exported.

- [ ] **Step 3: Implement**

Append to `src/lib/today/groupTasks.ts`:

```typescript
export interface AddToGroupInput {
  wrapperId: string
  /** Tasks to reparent under the wrapper. */
  taskIds: string[]
  /** Events/routines to attach as group_members refs. */
  memberRefs: GroupMemberRef[]
  /** The wrapper's CURRENT group_members. New refs append to these. */
  existingMemberRefs: GroupMemberRef[]
  date: Date
  isAllDay: boolean
}

/**
 * Add members to a group that already exists. Until this, groups were
 * create-once: `groupItems` builds one and the only way to add was to ungroup
 * and regroup.
 *
 * Note this APPENDS to group_members. `groupItems` replaces the array
 * wholesale, which is right at creation and wrong here — reusing that shape
 * would drop every existing event/routine member on the first addition.
 */
export async function addToGroup(
  input: AddToGroupInput,
  deps: GroupTasksDeps,
): Promise<void> {
  const { wrapperId, taskIds, memberRefs, existingMemberRefs, date, isAllDay } = input

  const seen = new Set(existingMemberRefs.map((r) => `${r.type}-${r.id}`))
  const fresh = memberRefs.filter((r) => !seen.has(`${r.type}-${r.id}`))

  if (taskIds.length === 0 && fresh.length === 0) return

  for (const id of taskIds) {
    await deps.updateTask(id, { parentTaskId: wrapperId, scheduledFor: date, isAllDay })
  }
  if (fresh.length > 0) {
    await deps.updateTask(wrapperId, { groupMembers: [...existingMemberRefs, ...fresh] })
  }
  await deps.refetch?.()
}
```

- [ ] **Step 4: Verify**

Run: `npx vitest run src/lib/today/groupTasks.test.ts && npx tsc -b`
Expected: PASS, tsc clean.

- [ ] **Step 5: Full verification and commit**

```bash
export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
npx tsc -b && npx vitest run && npm run build && npm run lint
git add -A
git commit -m "feat(today): addToGroup, so groups stop being create-once

groupTasks.ts had create/remove/ungroup/delete but no add — the only way to
add a member was ungroup-then-regroup. Appends to group_members rather than
replacing, which groupItems does correctly at creation and which would drop
every existing member here."
```

Expected: tsc clean; suite green (baseline 4041 + this plan's new tests); build clean; lint at exactly 8 pre-existing errors.

---

## Self-Review

**Spec coverage (Stage 2a scope only):**
- `sort_order` schema change → Task 1
- Manual order governs untimed items only; timed items sort by time → encoded in Task 2's `sortByManualOrder` doc and tests; Stage 2b enforces the time-rewrite half
- Ordering maths mirroring `stepOrdering.ts` → Task 2 (with a documented, deliberate divergence)
- Per-row bulk persistence → Task 3
- `addToGroup` → Task 4

**Deliberately deferred to Stage 2b, not omitted:** the dnd-kit context and drop targets; drag-to-time; drag-onto-card/group/out; reordering a timed item rewriting its time; read-only calendar events refusing the drag; routines writing a one-day override; empty bands materialising during a drag; tap equivalents for every gesture.

**Deliberately NOT in any plan:** the drop→render defect. It is `systematic-debugging` work requiring a live reproduction on port 5173, not plan work. Note that the leading hypothesis — the optimistically-created wrapper failing `selectTimed`'s `bucket === 'timed'` gate — has now been **ruled out**: `useSupabaseTasks.ts:421` sets `bucket: scheduledFor ? 'timed' : …` and `groupItems` does pass a date, so the wrapper is correctly bucketed. Both cheap explanations are now dead; it needs reproduction.

**Type consistency:** `OrderWrite { id, sortOrder }` is defined in Task 2 and consumed with that exact shape by Task 3. `Task.sortOrder?: number | null` from Task 1 is what Task 2's `sortByManualOrder` and Task 3's optimistic patch both read. `GroupMemberRef` and `GroupTasksDeps` are pre-existing in `groupTasks.ts` and used unchanged in Task 4.

**Known risk this plan cannot close:** nothing here is visible in the UI, so no amount of green tests proves the ordering *feels* right. That judgement arrives in Stage 2b.
