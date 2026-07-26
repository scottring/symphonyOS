# Today Drag — Stage 2b: The Gestures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Today draggable — drop an item onto a band to give it a time, onto a gap to reorder it, onto a card to group it — consuming the Stage 2a data layer that is currently wired to nothing.

**Architecture:** One **pure resolver** (`lib/today/todayDrop.ts`) turns a `(activeId, overId)` pair into a list of `DropIntent`s; a **thin dnd-kit layer** (`TodayDragProvider` + row/gap/band droppables) does nothing but report the pair and apply the intents. Every rule — refusals, band times, reorder maths, group create/add/remove — lives in the pure module where it can be tested without a DOM. `TodayView`'s section loop is lifted into `TodaySectionList` **first**, so the drag wiring lands in a file that can hold it and `TodayView` gets shorter, not longer.

**Tech Stack:** React 19 + TypeScript strict, `@dnd-kit/core` ^6.3.1 + `@dnd-kit/sortable` ^10.0.0 (already dependencies), Supabase, Vitest + React Testing Library.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-25-today-asks-what-time-design.md`. This plan is **Stage 2b**: moves #0, #1, #2 and #3. Stage 3 (page cap, duplicate sweep, density, assistant proposal) is a separate plan.
- **Stage 2a's outcome section is required reading:** `docs/superpowers/plans/2026-07-25-today-drag-foundations.md`, "Outcome, and what Stage 2b inherits". Its five parked residuals are Tasks 2, 4 and 9 here.
- **Worktree:** `.worktrees/today-drag-gestures`, branch `today-drag-gestures`, based on `origin/main` `1a0ebbc3`. **Never** edit or commit in the main worktree at `/Users/scottkaufman/Developer/Developer/symphonyOS`.
- **Node:** the machine default is v26.5.0 and this repo has a Node-26 test trap. Prefix EVERY command, in the same shell invocation, with:
  `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`
- **Never run `npm test`** — it is vitest watch mode and hangs forever. Always `npx vitest run`.
- **Baseline measured in this worktree, 2026-07-25:** `npx tsc -b` clean · `npx vitest run` → **402 files, 3939 passed, 3 skipped** · lint baseline is recorded in Task 1 (confirm the count is unchanged with your work stashed before blaming yourself).
- **NEVER partial-`upsert` a row in `tasks`** — Postgres checks NOT NULL and the RLS `WITH CHECK` against the proposed tuple *before* probing the conflict arbiter, so it fails `23502` 100% of the time. Use `.update({…}).eq('id', …)` per row. `updateTaskOrders` already does this correctly; do not "optimise" it back.
- **Type-checks are not inspection.** Six UI defects shipped green under `tsc` on 2026-07-25. Every task that changes rendering ends by opening **port 5173** and looking. Scott's browser holds a session for that origin only — other ports and preview URLs hit the sign-in wall, and you must not sign in as him.
- TypeScript strict. Path alias `@/` → `src/`. **Lucide icons, never emojis.** Nordic Journal (`src/index.css`). Tailwind v4 — unlayered CSS beats every utility, so overridable defaults belong in `@layer base`.
- A dev server may be running on port 5173 from a sibling worktree. Check before starting your own; leave a sibling's alone.

### The drop-target vocabulary — the one design decision every task depends on

The spec asks for both "card onto card → create a group" and "drag to reorder". Those collide: a row cannot mean two things. **The gap decides.**

| Drop target | Element | Means |
|---|---|---|
| `today-band-<section>` | the section header + its empty space | give the item a **time** (or make it all-day) |
| `today-gap-<section>:<index>` | the existing `TimelineInsertPoint` between two rows | **reorder** to that position |
| `today-row-<itemId>` | a whole row | **group** with that item |

This is unambiguous, needs no dwell timer or modifier key (Today is mobile-primary), and reuses DOM that already renders between every pair of rows. The cost is that grouping and reordering are different gestures rather than one — which is correct: they are different intentions.

**Rejected alternative,** recorded so it is not re-litigated: dwell-to-group (hover a row ~600ms mid-drag to switch from reorder to group). It needs a timer, an extra visual state, and it makes a slow drag do something the user did not ask for.

---

### Task 1: The drop→render gate

**Files:**
- Create: `docs/superpowers/notes/2026-07-25-drop-render-gate.md`
- Modify: only if the defect reproduces — the fix's location is unknown until then.

**Interfaces:**
- Consumes: nothing.
- Produces: a written finding. Every later task assumes drops render without a refresh.

**Context:** The spec makes this a hard gate — "Making drag the primary gesture of Today on top of an unreliable drop pipeline converts an annoyance into a blocker. Nothing below ships until this is green." Two cheap explanations are already **dead**: `HomeViewContainer.tsx:439` does pass a real `refetch` (`refetch: fetchTasks`), and the optimistic wrapper *is* correctly bucketed (`useSupabaseTasks.ts:421` sets `bucket: scheduledFor ? 'timed' : …`, and `groupItems` passes a date). The bug also stopped reproducing in a later session and is now believed intermittent.

So this task is **time-boxed reproduction, not open-ended debugging.**

- [ ] **Step 1: Record the lint baseline**

```bash
export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
npm run lint 2>&1 | tail -5
```

Write the exact error count into `docs/superpowers/notes/2026-07-25-drop-render-gate.md` under a `## Lint baseline` heading. Every later task compares against this number, not against a remembered "8".

- [ ] **Step 2: Start the dev server (if no sibling worktree already has 5173)**

```bash
export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
lsof -ti:5173 || npm run dev
```

If 5173 is already served by a sibling worktree, **do not kill it** — note that the walkthrough must happen from whichever worktree owns it, and coordinate. A blank screen in a worktree means a missing `.env`; this worktree has one copied in.

- [ ] **Step 3: Try to reproduce, three ways, then stop**

On Today, with real data:

1. Bulk-select two all-day cards → the bottom toolbar's **Group** action → name it. Does the wrapper card render, with both children nested, **without a refresh**?
2. Repeat with a mix: one task + one calendar event.
3. Repeat while the assignee filter is set to a single person.

Watch the console for `[updateTask]`/`[groupItems]` errors and the network tab for the `tasks` PATCH + the refetch GET.

- [ ] **Step 4: Write the finding, then branch**

Append to `docs/superpowers/notes/2026-07-25-drop-render-gate.md`: what was tried, what happened, screenshots or console output.

- **Did not reproduce** → write "DISCHARGED — three attempts, listed above, all rendered immediately" and **continue to Task 2.** Later tasks must watch for the same shape: a write that lands in the DB and not on the screen.
- **Reproduced** → **stop this plan** and run `superpowers:systematic-debugging` against it. Do not build drag on top of it. Come back to Task 2 with the fix committed.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/notes/2026-07-25-drop-render-gate.md
git commit -m "docs(today): drop-render gate finding before Stage 2b

The spec gates every drag gesture on drops rendering reliably. Records the
reproduction attempts and the lint baseline the rest of the stage compares to."
```

---

### Task 2: Manual order actually sorts the page

**Files:**
- Modify: `src/lib/timeUtils.ts` — `groupByDaySection` (~line 365-392)
- Modify: `src/lib/today/taskOrdering.ts` — add `reorderTasksToIndex`
- Test: `src/lib/today/taskOrdering.test.ts`, `src/lib/timeUtils.test.ts`

**Interfaces:**
- Consumes: `sortByManualOrder`, `SORT_ORDER_GAP`, `OrderWrite` from `taskOrdering.ts` (Stage 2a).
- Produces:
  - `export function reorderTasksToIndex(orderedIds: string[], activeId: string, toIndex: number, currentOrders: Map<string, number | null>): OrderWrite[]`
  - `groupByDaySection` sorts `allday` by `sortOrder` (nulls last, then title) instead of alphabetically.

**Why this comes before any gesture:** `timeUtils.ts:388` sorts the All Day section with `a.title.localeCompare(b.title)`, and Unscheduled is not sorted at all. Persisting a `sort_order` would change nothing on screen — the drag would "work", the write would land, and the row would snap back to alphabetical. **Reorder is invisible until this changes.** Stage 2a's plan never said this because Stage 2a never rendered anything.

- [ ] **Step 1: Write the failing ordering test**

Add to `src/lib/today/taskOrdering.test.ts`:

```typescript
import { reorderTasksToIndex } from '@/lib/today/taskOrdering'

describe('reorderTasksToIndex', () => {
  const orders = (pairs: [string, number | null][]) => new Map(pairs)

  it('writes ONE row when there is room at the target index', () => {
    // a=0, b=1000, c=2000 — move c to index 1 (between a and b)
    const writes = reorderTasksToIndex(['a', 'b', 'c'], 'c', 1,
      orders([['a', 0], ['b', 1000], ['c', 2000]]))
    expect(writes).toHaveLength(1)
    expect(writes[0].id).toBe('c')
    expect(writes[0].sortOrder).toBeGreaterThan(0)
    expect(writes[0].sortOrder).toBeLessThan(1000)
  })

  it('writes one row when moved to the front', () => {
    const writes = reorderTasksToIndex(['a', 'b', 'c'], 'c', 0,
      orders([['a', 0], ['b', 1000], ['c', 2000]]))
    expect(writes).toHaveLength(1)
    expect(writes[0].id).toBe('c')
    expect(writes[0].sortOrder).toBeLessThan(0)
  })

  it('writes one row when moved past the end', () => {
    const writes = reorderTasksToIndex(['a', 'b', 'c'], 'a', 3,
      orders([['a', 0], ['b', 1000], ['c', 2000]]))
    expect(writes).toHaveLength(1)
    expect(writes[0].id).toBe('a')
    expect(writes[0].sortOrder).toBeGreaterThan(2000)
  })

  it('renormalises when the gap at the target is spent', () => {
    const writes = reorderTasksToIndex(['a', 'b', 'c'], 'c', 1,
      orders([['a', 0], ['b', 1], ['c', 5000]]))
    expect(writes.length).toBeGreaterThan(1)
    const byId = new Map(writes.map((w) => [w.id, w.sortOrder]))
    expect(byId.get('a')!).toBeLessThan(byId.get('c')!)
    expect(byId.get('c')!).toBeLessThan(byId.get('b')!)
  })

  it('returns no writes when the index is where the item already is', () => {
    expect(reorderTasksToIndex(['a', 'b'], 'a', 0, orders([['a', 0], ['b', 1000]]))).toEqual([])
  })

  it('returns no writes for an unknown id', () => {
    expect(reorderTasksToIndex(['a', 'b'], 'zz', 0, orders([['a', 0], ['b', 1000]]))).toEqual([])
  })
})
```

- [ ] **Step 2: Write the failing sort test**

Add to `src/lib/timeUtils.test.ts` (match the file's existing import style; if it has no `TimelineItem` factory, add this local one):

```typescript
import { groupByDaySection } from './timeUtils'
import type { TimelineItem } from '@/types/timeline'

const allDayItem = (id: string, title: string, sortOrder: number | null): TimelineItem => ({
  id, type: 'task', title,
  startTime: new Date(2026, 6, 25), endTime: null,
  completed: false, allDay: true,
  originalTask: { sortOrder } as never,
})

describe('groupByDaySection — All Day manual order', () => {
  it('orders All Day by sortOrder, not alphabetically', () => {
    const groups = groupByDaySection([
      allDayItem('task-a', 'Aardvark', 2000),
      allDayItem('task-z', 'Zebra', 1000),
    ])
    expect(groups.allday.map((i) => i.id)).toEqual(['task-z', 'task-a'])
  })

  it('puts never-ordered items after ordered ones, alphabetically among themselves', () => {
    const groups = groupByDaySection([
      allDayItem('task-b', 'Banana', null),
      allDayItem('task-a', 'Apple', null),
      allDayItem('task-o', 'Ordered', 1000),
    ])
    expect(groups.allday.map((i) => i.id)).toEqual(['task-o', 'task-a', 'task-b'])
  })

  it('does not read a null sortOrder as 0', () => {
    // 0 is a real first position; a null → 0 coercion would tie them and let
    // the alphabetical tiebreak pin an unordered item above an ordered one.
    const groups = groupByDaySection([
      allDayItem('task-unordered', 'Aaa', null),
      allDayItem('task-first', 'Zzz', 0),
    ])
    expect(groups.allday[0].id).toBe('task-first')
  })
})
```

- [ ] **Step 3: Run both and watch them fail**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH" && npx vitest run src/lib/today/taskOrdering.test.ts src/lib/timeUtils.test.ts`
Expected: FAIL — `reorderTasksToIndex` is not exported; All Day is still alphabetical.

- [ ] **Step 4: Implement `reorderTasksToIndex`, and express `reorderTasksByDrag` in terms of it**

In `src/lib/today/taskOrdering.ts`, replace the body of `reorderTasksByDrag` and add the new export:

```typescript
/**
 * Move `activeId` to `toIndex` in `orderedIds`. Index-based because Today's
 * reorder target is the GAP between two rows, not a row — see the drop-target
 * vocabulary in the Stage 2b plan. `toIndex` is the position in the list as it
 * reads BEFORE the move (0 = before the first row, length = after the last).
 *
 * Returns the minimal set of writes: one row when a gap exists between the new
 * neighbours, otherwise a full renormalise. Empty when the move is a no-op or
 * the id is unknown.
 */
export function reorderTasksToIndex(
  orderedIds: string[],
  activeId: string,
  toIndex: number,
  currentOrders: Map<string, number | null>,
): OrderWrite[] {
  const from = orderedIds.indexOf(activeId)
  if (from === -1) return []
  const clamped = Math.max(0, Math.min(toIndex, orderedIds.length))
  // Dropping into the gap immediately before or after yourself changes nothing.
  if (clamped === from || clamped === from + 1) return []

  const moved = orderedIds.filter((id) => id !== activeId)
  // Removing the active item shifts every later index down by one.
  const insertAt = clamped > from ? clamped - 1 : clamped
  moved.splice(insertAt, 0, activeId)

  const pos = moved.indexOf(activeId)
  const beforeId = pos > 0 ? moved[pos - 1] : null
  const afterId = pos < moved.length - 1 ? moved[pos + 1] : null
  const before = beforeId ? currentOrders.get(beforeId) ?? null : null
  const after = afterId ? currentOrders.get(afterId) ?? null : null

  // A participant without an order leaves nothing to interpolate between.
  if ((beforeId && before == null) || (afterId && after == null)) return renormalise(moved)
  if (before == null && after == null) return renormalise(moved)
  if (before == null) return [{ id: activeId, sortOrder: after! - SORT_ORDER_GAP }]
  if (after == null) return [{ id: activeId, sortOrder: before + SORT_ORDER_GAP }]
  // No integer strictly between the neighbours — the gap is spent.
  if (after - before <= 1) return renormalise(moved)
  return [{ id: activeId, sortOrder: Math.floor((before + after) / 2) }]
}
```

Then rewrite `reorderTasksByDrag` to delegate, so the two can never drift:

```typescript
export function reorderTasksByDrag(
  orderedIds: string[],
  activeId: string,
  overId: string,
  currentOrders: Map<string, number | null>,
): OrderWrite[] {
  if (activeId === overId) return []
  const from = orderedIds.indexOf(activeId)
  const to = orderedIds.indexOf(overId)
  if (from === -1 || to === -1) return []
  // arrayMove semantics: landing ON an index means taking that index. In
  // gap terms that is the gap before it when moving up, after it when down.
  return reorderTasksToIndex(orderedIds, activeId, to > from ? to + 1 : to, currentOrders)
}
```

Keep the `arrayMove` import only if still used; if not, delete it and the `@dnd-kit/sortable` import with it.

- [ ] **Step 5: Implement the All Day sort**

In `src/lib/timeUtils.ts`, replace line ~388:

```typescript
  groups.allday.sort((a, b) => a.title.localeCompare(b.title))
```

with:

```typescript
  // All Day has no times to sort by, so manual order governs it (Stage 2b) and
  // the title is only the tiebreak among never-ordered items. Reading a null
  // sortOrder as 0 would pin unordered items above genuinely-first ones — 0 is
  // a real position. Unscheduled stays insertion-ordered: it holds routine
  // instances, which carry no sortOrder to order by.
  groups.allday.sort((a, b) => {
    const ao = a.originalTask?.sortOrder ?? null
    const bo = b.originalTask?.sortOrder ?? null
    if (ao != null && bo != null) return ao - bo || a.title.localeCompare(b.title)
    if (ao != null) return -1
    if (bo != null) return 1
    return a.title.localeCompare(b.title)
  })
```

- [ ] **Step 6: Verify**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH" && npx vitest run src/lib/ && npx tsc -b`
Expected: PASS, tsc clean. If a pre-existing test asserted alphabetical All Day order, **that test is now wrong** — update it and say so in the commit.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(today): manual order governs All Day, and an index-based reorder

groupByDaySection sorted All Day alphabetically, so persisting sort_order would
have changed nothing on screen — the drag would land, the write would succeed,
and the row would snap back. Reorder is invisible without this.

reorderTasksToIndex is index-based because Today's reorder target is the GAP
between rows, not a row. reorderTasksByDrag now delegates to it so the two
cannot drift."
```

---

### Task 3: `useCalendarPermissions` — which calendars refuse writes

**Files:**
- Create: `src/hooks/useCalendarPermissions.ts`
- Test: `src/hooks/useCalendarPermissions.test.ts`

**Interfaces:**
- Consumes: `useGoogleCalendar()`'s `fetchCalendarList(): Promise<GoogleCalendarInfo[]>` and `isConnected`.
- Produces: `export function useCalendarPermissions(): { isReadOnlyCalendar: (calendarId?: string | null) => boolean }`

**Context:** The spec's hazard #1 — "read-only calendar events must refuse the drag visibly, never accept it and bounce". `CalendarEvent` carries **no** permission field (verified against `useGoogleCalendar.tsx:41-73`); `accessRole` lives on `GoogleCalendarInfo` (line 92-98), reachable only through `fetchCalendarList()`, which is a promise-returning function with no cached state. Scott's work calendar is a read-only share, so this is a live case, not a hypothetical.

**Unknown calendars are treated as writable.** Refusing a drag because a fetch has not resolved yet would be a worse failure than letting Google reject the write — the user would see a refusal they cannot explain.

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useCalendarPermissions.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useCalendarPermissions } from './useCalendarPermissions'

const fetchCalendarList = vi.fn()
vi.mock('@/hooks/useGoogleCalendar', () => ({
  useGoogleCalendar: () => ({ isConnected: true, fetchCalendarList }),
}))

describe('useCalendarPermissions', () => {
  it('reports reader calendars as read-only and writer/owner as writable', async () => {
    fetchCalendarList.mockResolvedValue([
      { id: 'work@group', summary: 'Work', accessRole: 'reader', primary: false },
      { id: 'primary', summary: 'Me', accessRole: 'owner', primary: true },
      { id: 'shared@group', summary: 'Shared', accessRole: 'writer', primary: false },
    ])
    const { result } = renderHook(() => useCalendarPermissions())
    await waitFor(() => expect(result.current.isReadOnlyCalendar('work@group')).toBe(true))
    expect(result.current.isReadOnlyCalendar('primary')).toBe(false)
    expect(result.current.isReadOnlyCalendar('shared@group')).toBe(false)
  })

  it('treats an unknown or missing calendar as writable', async () => {
    fetchCalendarList.mockResolvedValue([])
    const { result } = renderHook(() => useCalendarPermissions())
    // Refusing on incomplete knowledge is worse than letting Google reject it:
    // the user would see a refusal with no explanation.
    expect(result.current.isReadOnlyCalendar('never-seen')).toBe(false)
    expect(result.current.isReadOnlyCalendar(undefined)).toBe(false)
    expect(result.current.isReadOnlyCalendar(null)).toBe(false)
  })

  it('survives a failing fetch without throwing', async () => {
    fetchCalendarList.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useCalendarPermissions())
    await waitFor(() => expect(result.current.isReadOnlyCalendar('anything')).toBe(false))
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH" && npx vitest run src/hooks/useCalendarPermissions.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `src/hooks/useCalendarPermissions.ts`:

```typescript
import { useCallback, useEffect, useRef, useState } from 'react'
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar'

/**
 * Which Google calendars refuse writes.
 *
 * `CalendarEvent` carries no permission field — `accessRole` is only on the
 * calendar LIST. Today's drag needs it so a read-only event refuses the gesture
 * visibly instead of accepting it, failing at Google, and springing back for no
 * visible reason (the spec's hazard #1; Scott's work calendar is a read-only
 * share, so this is a live case).
 *
 * Fetched once per mount and cached. An unknown calendar is WRITABLE: refusing
 * on incomplete knowledge shows the user a refusal they cannot explain, which
 * is worse than letting Google reject the write.
 */
export function useCalendarPermissions(): {
  isReadOnlyCalendar: (calendarId?: string | null) => boolean
} {
  const { isConnected, fetchCalendarList } = useGoogleCalendar()
  const [readOnly, setReadOnly] = useState<Set<string>>(() => new Set())
  const fetched = useRef(false)

  useEffect(() => {
    if (!isConnected || fetched.current) return
    fetched.current = true
    let cancelled = false
    fetchCalendarList()
      .then((calendars) => {
        if (cancelled) return
        setReadOnly(new Set(calendars.filter((c) => c.accessRole === 'reader').map((c) => c.id)))
      })
      .catch(() => {
        // Offline or revoked scope. Staying empty means "everything writable",
        // which is the deliberate default above.
      })
    return () => { cancelled = true }
  }, [isConnected, fetchCalendarList])

  const isReadOnlyCalendar = useCallback(
    (calendarId?: string | null) => (calendarId ? readOnly.has(calendarId) : false),
    [readOnly],
  )

  return { isReadOnlyCalendar }
}
```

- [ ] **Step 4: Verify**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH" && npx vitest run src/hooks/useCalendarPermissions.test.ts && npx tsc -b`
Expected: PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCalendarPermissions.ts src/hooks/useCalendarPermissions.test.ts
git commit -m "feat(today): useCalendarPermissions, so read-only events can refuse a drag

CalendarEvent has no permission field — accessRole is only on the calendar
list. Unknown calendars are writable on purpose: a refusal the user can't
explain is worse than letting Google reject the write."
```

---

### Task 4: `todayDrop.ts` — the pure resolver

**Files:**
- Create: `src/lib/today/todayDrop.ts`
- Test: `src/lib/today/todayDrop.test.ts`

**Interfaces:**
- Consumes: `reorderTasksToIndex`, `OrderWrite` (Task 2); `TimelineItem`; `DaySection`, `DAY_SECTION_BOUNDS` (`@/lib/timeUtils`); `GroupMemberRef` (`@/types/task`).
- Produces:
  ```typescript
  export const BAND_PREFIX = 'today-band-'
  export const GAP_PREFIX = 'today-gap-'
  export const ROW_PREFIX = 'today-row-'
  export function bandDropId(section: DaySection): string
  export function gapDropId(section: DaySection, index: number): string
  export function rowDropId(itemId: string): string
  export type DropIntent =
    | { kind: 'set-time'; itemId: string; when: Date }
    | { kind: 'make-all-day'; itemId: string }
    | { kind: 'reorder'; writes: OrderWrite[] }
    | { kind: 'create-group'; groupName: string; taskIds: string[]; memberRefs: GroupMemberRef[]; date: Date; isAllDay: boolean }
    | { kind: 'add-to-group'; wrapperId: string; taskIds: string[]; memberRefs: GroupMemberRef[]; date: Date; isAllDay: boolean }
    | { kind: 'remove-from-group'; taskId: string }
    | { kind: 'refuse'; reason: string }
  export interface DropContext { … }   // exact shape in Step 3
  export function refusalFor(item: TimelineItem, isReadOnlyEvent: (i: TimelineItem) => boolean): string | null
  export function computeBandDropTime(section: DaySection, itemsInBand: TimelineItem[], viewedDate: Date): Date
  export function resolveDrop(ctx: DropContext): DropIntent[]
  ```

**Context — the four kinds of item that must refuse:**

| Item | Why it refuses |
|---|---|
| an event on a `reader` calendar | the write fails at Google and the optimistic update reverts — the event "springs back" (spec hazard #1) |
| `meal:*` synthetic items | manufactured by the meal planner from the week's plan; there is no row to retime |
| `routine-collection-*` | a synthetic wrapper over several steps; retiming it means retiming each step |
| a dosed routine step `routine-<id>#<n>` | `grouping.ts:81-96` applies a `deferred_to` time override **by bare id only** — a dosed step's override would silently apply to the wrong dose |

**Routines that DO accept a retime** write a **one-day override**, never a rule change. The existing primitive: `reschedule('routine', id, viewedDate, dateTime)` (`useActionableInstances.ts:341`) — when the target day equals the instance's own day it writes `status:'pending' + deferred_to`, and `grouping.ts:93` already reads exactly that as a same-day time override. It is reachable as `onPushRoutine(routineId, dateTime)`. **Do not use `scheduleRoutineOnDate`** (`routineUtils.ts:18`): it rewrites `recurrence_pattern` to `weekly` on that weekday plus a new `time_of_day` — a permanent rule change, which is precisely hazard #2.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/today/todayDrop.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import type { TimelineItem } from '@/types/timeline'
import type { DaySection } from '@/lib/timeUtils'
import { emptySections } from '@/lib/today/types'
import {
  resolveDrop, refusalFor, computeBandDropTime,
  bandDropId, gapDropId, rowDropId,
  type DropContext,
} from './todayDrop'

const DAY = new Date(2026, 6, 25)

function item(over: Partial<TimelineItem> & { id: string }): TimelineItem {
  return {
    type: 'task', title: over.id, startTime: null, endTime: null, completed: false,
    ...over,
  } as TimelineItem
}

function ctx(over: Partial<DropContext>): DropContext {
  return {
    activeId: 'task-a',
    overId: bandDropId('morning'),
    sections: emptySections<TimelineItem>(),
    fullOrderIds: {},
    orders: new Map(),
    viewedDate: DAY,
    isReadOnlyEvent: () => false,
    groupMembersOf: () => [],
    ...over,
  }
}

describe('refusalFor', () => {
  it('refuses an event on a read-only calendar', () => {
    const ev = item({ id: 'event-1', type: 'event' })
    expect(refusalFor(ev, () => true)).toMatch(/read-only/i)
  })
  it('allows an event on a writable calendar', () => {
    expect(refusalFor(item({ id: 'event-1', type: 'event' }), () => false)).toBeNull()
  })
  it('refuses a synthetic meal item', () => {
    expect(refusalFor(item({ id: 'meal:mon-dinner', type: 'event' }), () => false)).toMatch(/meal/i)
  })
  it('refuses a routine collection', () => {
    expect(refusalFor(item({ id: 'routine-collection-1', type: 'routine-collection' }), () => false)).toBeTruthy()
  })
  it('refuses a DOSED routine step', () => {
    // grouping.ts applies a deferred_to override by bare id only, so a dosed
    // step's override would land on the wrong dose.
    expect(refusalFor(item({ id: 'routine-r1#2', type: 'routine' }), () => false)).toMatch(/dose/i)
  })
  it('allows an undosed routine', () => {
    expect(refusalFor(item({ id: 'routine-r1', type: 'routine' }), () => false)).toBeNull()
  })
  it('allows a plain task', () => {
    expect(refusalFor(item({ id: 'task-a' }), () => false)).toBeNull()
  })
})

describe('computeBandDropTime', () => {
  it('uses the band start when the band is empty', () => {
    const when = computeBandDropTime('morning', [], DAY)
    expect(when.getHours()).toBe(8)
    expect(when.getMinutes()).toBe(0)
  })
  it('uses the last item\'s end time when the band is occupied', () => {
    const end = new Date(2026, 6, 25, 9, 30)
    const when = computeBandDropTime('morning', [item({ id: 'x', startTime: new Date(2026, 6, 25, 9), endTime: end })], DAY)
    expect(when.getHours()).toBe(9)
    expect(when.getMinutes()).toBe(30)
  })
  it('falls back to startTime when an item has no end', () => {
    const when = computeBandDropTime('afternoon', [item({ id: 'x', startTime: new Date(2026, 6, 25, 14) })], DAY)
    expect(when.getHours()).toBe(14)
  })
  it('never returns a time outside its own band', () => {
    // A 20:45 item in Evening (17:00-20:59) must not push the drop into Night.
    const when = computeBandDropTime('evening', [item({ id: 'x', startTime: new Date(2026, 6, 25, 20, 45) })], DAY)
    expect(when.getHours()).toBeLessThanOrEqual(20)
  })
})

describe('resolveDrop — bands', () => {
  it('a band drop gives a timed item a time', () => {
    const a = item({ id: 'task-a' })
    const out = resolveDrop(ctx({
      activeId: 'task-a', overId: bandDropId('evening'),
      sections: { ...emptySections<TimelineItem>(), allday: [a] },
    }))
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('set-time')
    if (out[0].kind === 'set-time') expect(out[0].when.getHours()).toBe(17)
  })

  it('the All day band clears the time', () => {
    const a = item({ id: 'task-a', startTime: new Date(2026, 6, 25, 9) })
    const out = resolveDrop(ctx({
      activeId: 'task-a', overId: bandDropId('allday'),
      sections: { ...emptySections<TimelineItem>(), morning: [a] },
    }))
    expect(out).toEqual([{ kind: 'make-all-day', itemId: 'task-a' }])
  })

  it('a read-only event refuses instead of being retimed', () => {
    const ev = item({ id: 'event-1', type: 'event' })
    const out = resolveDrop(ctx({
      activeId: 'event-1', overId: bandDropId('evening'),
      sections: { ...emptySections<TimelineItem>(), morning: [ev] },
      isReadOnlyEvent: () => true,
    }))
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('refuse')
  })

  it('dragging a group CHILD onto a band leaves the group and takes the time', () => {
    const child = item({ id: 'task-c', isSubtask: true, parentTaskId: 'w1' })
    const out = resolveDrop(ctx({
      activeId: 'task-c', overId: bandDropId('afternoon'),
      sections: { ...emptySections<TimelineItem>(), allday: [child] },
    }))
    expect(out.map((i) => i.kind)).toEqual(['remove-from-group', 'set-time'])
  })

  it('the Unscheduled band is not a drop target', () => {
    const a = item({ id: 'task-a' })
    const out = resolveDrop(ctx({
      activeId: 'task-a', overId: bandDropId('unscheduled'),
      sections: { ...emptySections<TimelineItem>(), allday: [a] },
    }))
    expect(out).toEqual([])
  })
})

describe('resolveDrop — gaps (reorder)', () => {
  const a = item({ id: 'task-a' })
  const b = item({ id: 'task-b' })
  const c = item({ id: 'task-c' })
  const untimed = { ...emptySections<TimelineItem>(), allday: [a, b, c] }

  it('reordering in an untimed band writes sort orders', () => {
    const out = resolveDrop(ctx({
      activeId: 'task-c', overId: gapDropId('allday', 1),
      sections: untimed,
      fullOrderIds: { allday: ['task-a', 'task-b', 'task-c'] },
      orders: new Map([['task-a', 0], ['task-b', 1000], ['task-c', 2000]]),
    }))
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('reorder')
    if (out[0].kind === 'reorder') expect(out[0].writes[0].id).toBe('task-c')
  })

  it('reorders against the FULL untimed set, not the rendered subset', () => {
    // Stage 2a residual 3: renormalising a filtered subset resets it to
    // 0..n*1000 while unfiltered siblings keep their old values and interleave.
    const out = resolveDrop(ctx({
      activeId: 'task-c', overId: gapDropId('allday', 0),
      sections: { ...emptySections<TimelineItem>(), allday: [c] }, // only c rendered
      fullOrderIds: { allday: ['task-a', 'task-b', 'task-c'] },
      orders: new Map([['task-a', null], ['task-b', null], ['task-c', null]]),
    }))
    expect(out[0].kind).toBe('reorder')
    if (out[0].kind === 'reorder') {
      expect(out[0].writes.map((w) => w.id).sort()).toEqual(['task-a', 'task-b', 'task-c'])
    }
  })

  it('reordering into a TIMED band rewrites the time instead', () => {
    // Spec move 3: reordering a timed item rewrites its time, so the list
    // stays genuinely time-sorted rather than layering manual order on top.
    const nine = item({ id: 'task-9', startTime: new Date(2026, 6, 25, 9), endTime: new Date(2026, 6, 25, 9, 30) })
    const ten = item({ id: 'task-10', startTime: new Date(2026, 6, 25, 10) })
    const out = resolveDrop(ctx({
      activeId: 'task-10', overId: gapDropId('morning', 1),
      sections: { ...emptySections<TimelineItem>(), morning: [nine, ten] },
    }))
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('set-time')
    if (out[0].kind === 'set-time') {
      expect(out[0].when.getHours()).toBe(9)
      expect(out[0].when.getMinutes()).toBe(30)
    }
  })

  it('no untouched item is retimed — the drop writes exactly one intent', () => {
    const nine = item({ id: 'task-9', startTime: new Date(2026, 6, 25, 9) })
    const ten = item({ id: 'task-10', startTime: new Date(2026, 6, 25, 10) })
    const eleven = item({ id: 'task-11', startTime: new Date(2026, 6, 25, 11) })
    const out = resolveDrop(ctx({
      activeId: 'task-11', overId: gapDropId('morning', 1),
      sections: { ...emptySections<TimelineItem>(), morning: [nine, ten, eleven] },
    }))
    expect(out).toHaveLength(1) // no cascade
  })
})

describe('resolveDrop — rows (grouping)', () => {
  it('a card onto a plain card creates a group named after the target', () => {
    const a = item({ id: 'task-a', title: 'Pick up dry cleaning' })
    const b = item({ id: 'task-b', title: 'Morning errands' })
    const out = resolveDrop(ctx({
      activeId: 'task-a', overId: rowDropId('task-b'),
      sections: { ...emptySections<TimelineItem>(), allday: [a, b] },
    }))
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('create-group')
    if (out[0].kind === 'create-group') {
      expect(out[0].groupName).toBe('Morning errands')
      expect(out[0].taskIds.sort()).toEqual(['a', 'b'])
      expect(out[0].isAllDay).toBe(true)
    }
  })

  it('a card onto an EXISTING group adds to it, appending refs', () => {
    const wrapper = item({ id: 'task-w1', title: 'Errands' })
    const child = item({ id: 'task-c', isSubtask: true, parentTaskId: 'w1' })
    const ev = item({ id: 'event-e9', type: 'event', title: 'Dentist' })
    const out = resolveDrop(ctx({
      activeId: 'event-e9', overId: rowDropId('task-w1'),
      sections: { ...emptySections<TimelineItem>(), allday: [wrapper, child, ev] },
      groupMembersOf: () => [{ type: 'routine', id: 'r5' }],
    }))
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('add-to-group')
    if (out[0].kind === 'add-to-group') {
      expect(out[0].wrapperId).toBe('w1')
      expect(out[0].memberRefs).toEqual([{ type: 'event', id: 'e9' }])
      expect(out[0].taskIds).toEqual([])
    }
  })

  it('an event dropped on a task groups it as a member ref, not a child', () => {
    const t = item({ id: 'task-b', title: 'Errands' })
    const ev = item({ id: 'event-e9', type: 'event' })
    const out = resolveDrop(ctx({
      activeId: 'event-e9', overId: rowDropId('task-b'),
      sections: { ...emptySections<TimelineItem>(), allday: [t, ev] },
    }))
    expect(out[0].kind).toBe('create-group')
    if (out[0].kind === 'create-group') {
      expect(out[0].taskIds).toEqual(['b'])
      expect(out[0].memberRefs).toEqual([{ type: 'event', id: 'e9' }])
    }
  })

  it('dropping a card on itself does nothing', () => {
    const a = item({ id: 'task-a' })
    expect(resolveDrop(ctx({
      activeId: 'task-a', overId: rowDropId('task-a'),
      sections: { ...emptySections<TimelineItem>(), allday: [a] },
    }))).toEqual([])
  })

  it('a read-only event refuses to be grouped too', () => {
    const t = item({ id: 'task-b' })
    const ev = item({ id: 'event-e9', type: 'event' })
    const out = resolveDrop(ctx({
      activeId: 'event-e9', overId: rowDropId('task-b'),
      sections: { ...emptySections<TimelineItem>(), allday: [t, ev] },
      isReadOnlyEvent: () => true,
    }))
    expect(out[0].kind).toBe('refuse')
  })
})

describe('resolveDrop — nothing to do', () => {
  it('returns no intents for an unknown active id', () => {
    expect(resolveDrop(ctx({ activeId: 'task-nope' }))).toEqual([])
  })
  it('returns no intents for an unrecognised drop target', () => {
    const a = item({ id: 'task-a' })
    expect(resolveDrop(ctx({
      activeId: 'task-a', overId: 'something-else',
      sections: { ...emptySections<TimelineItem>(), allday: [a] },
    }))).toEqual([])
  })
})
```

- [ ] **Step 2: Run and watch them fail**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH" && npx vitest run src/lib/today/todayDrop.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `src/lib/today/todayDrop.ts`:

```typescript
import type { TimelineItem } from '@/types/timeline'
import type { GroupMemberRef } from '@/types/task'
import type { DaySection } from '@/lib/timeUtils'
import { DAY_SECTION_BOUNDS } from '@/lib/timeUtils'
import { reorderTasksToIndex, type OrderWrite } from './taskOrdering'

/**
 * Today's drop rules, as pure functions.
 *
 * The dnd-kit layer knows only how to report "this id was dropped on that id";
 * every decision — refusals, band times, reorder maths, grouping — is here, so
 * it can be tested without a DOM. That split is deliberate: the Stage 2a review
 * found that the only defect that mattered was invisible to both tsc and a
 * 4,000-test suite because it lived in an untestable seam.
 *
 * The drop-target vocabulary (see the Stage 2b plan):
 *   today-band-<section>        → give the item a TIME (or make it all-day)
 *   today-gap-<section>:<index> → REORDER to that position
 *   today-row-<itemId>          → GROUP with that item
 * A row cannot mean both "reorder here" and "group with me", so the gap decides.
 */

export const BAND_PREFIX = 'today-band-'
export const GAP_PREFIX = 'today-gap-'
export const ROW_PREFIX = 'today-row-'

export function bandDropId(section: DaySection): string {
  return `${BAND_PREFIX}${section}`
}
export function gapDropId(section: DaySection, index: number): string {
  return `${GAP_PREFIX}${section}:${index}`
}
export function rowDropId(itemId: string): string {
  return `${ROW_PREFIX}${itemId}`
}

export type DropIntent =
  | { kind: 'set-time'; itemId: string; when: Date }
  | { kind: 'make-all-day'; itemId: string }
  | { kind: 'reorder'; writes: OrderWrite[] }
  | {
      kind: 'create-group'
      groupName: string
      taskIds: string[]
      memberRefs: GroupMemberRef[]
      date: Date
      isAllDay: boolean
    }
  | {
      kind: 'add-to-group'
      wrapperId: string
      taskIds: string[]
      memberRefs: GroupMemberRef[]
      date: Date
      isAllDay: boolean
    }
  | { kind: 'remove-from-group'; taskId: string }
  | { kind: 'refuse'; reason: string }

export interface DropContext {
  activeId: string
  overId: string
  /** The RENDERED sections — what the user can see and aim at. */
  sections: Record<DaySection, TimelineItem[]>
  /**
   * Every untimed id in a section, INCLUDING rows filtered out of the render
   * (domain switcher, assignee filter). Reorder must renormalise against this,
   * not the rendered subset: renormalising a subset resets it to 0…n×1000
   * while its hidden siblings keep their old values and interleave on the next
   * render (Stage 2a residual 3).
   */
  fullOrderIds: Partial<Record<DaySection, string[]>>
  /** Task id (raw, no `task-` prefix stripped — keys match fullOrderIds). */
  orders: Map<string, number | null>
  viewedDate: Date
  isReadOnlyEvent: (item: TimelineItem) => boolean
  /** The wrapper's CURRENT group_members, read fresh at drop time (residual 4). */
  groupMembersOf: (wrapperRawId: string) => GroupMemberRef[]
}

/** Raw entity id for a timeline id (`task-abc` → `abc`, `routine-r1#2` → `r1#2`). */
function rawId(timelineId: string): string {
  const dash = timelineId.indexOf('-')
  return dash === -1 ? timelineId : timelineId.slice(dash + 1)
}

/** The bare routine id, dose suffix stripped (`r1#2` → `r1`). */
function bareRoutineId(timelineId: string): string {
  return rawId(timelineId).split('#')[0]
}

/**
 * Why this item cannot be dragged, or null if it can.
 *
 * Each of these accepts the gesture and then fails silently if not refused
 * here, which is the worst outcome — the item springs back for no visible
 * reason and the user learns to distrust the whole surface.
 */
export function refusalFor(
  item: TimelineItem,
  isReadOnlyEvent: (i: TimelineItem) => boolean,
): string | null {
  if (String(item.id).startsWith('meal:')) {
    return 'Meals come from the meal plan — change it there.'
  }
  if (item.type === 'routine-collection') {
    return 'Open the routine to give its steps times.'
  }
  if (item.type === 'routine' && String(item.id).includes('#')) {
    // grouping.ts applies a deferred_to override by BARE id only, so a dosed
    // step's override would silently land on the wrong dose.
    return 'This routine has more than one dose — set its times on the routine.'
  }
  if (item.type === 'event' && isReadOnlyEvent(item)) {
    return "That calendar is read-only — this event can't be moved here."
  }
  return null
}

/**
 * Where a drop onto a band lands. Band start when empty; otherwise straight
 * after whatever is already there, which is the same rule a gap drop uses —
 * one rule, not two. Never leaves its own band: a 20:45 item in Evening must
 * not push the next drop into Night.
 */
export function computeBandDropTime(
  section: DaySection,
  itemsInBand: TimelineItem[],
  viewedDate: Date,
): Date {
  const bound = DAY_SECTION_BOUNDS.find((b) => b.section === section)
  const start = new Date(viewedDate)
  start.setHours(bound ? bound.startHour : 8, 0, 0, 0)
  if (!bound) return start

  const cap = new Date(viewedDate)
  cap.setHours(bound.endHour, 30, 0, 0)

  let latest = start
  for (const it of itemsInBand) {
    const end = it.endTime ?? it.startTime
    if (end && new Date(end) > latest) latest = new Date(end)
  }
  return latest > cap ? cap : latest
}

/** The group_members ref for a non-task item, or null if it is a task. */
function memberRefFor(item: TimelineItem): GroupMemberRef | null {
  if (item.type === 'event') return { type: 'event', id: rawId(item.id) }
  if (item.type === 'routine') return { type: 'routine', id: bareRoutineId(item.id) }
  return null
}

function findItem(sections: Record<DaySection, TimelineItem[]>, id: string): TimelineItem | null {
  for (const list of Object.values(sections)) {
    const found = list.find((i) => i.id === id)
    if (found) return found
  }
  return null
}

function sectionOf(sections: Record<DaySection, TimelineItem[]>, id: string): DaySection | null {
  for (const key of Object.keys(sections) as DaySection[]) {
    if (sections[key].some((i) => i.id === id)) return key
  }
  return null
}

/** True when this row is a group wrapper — something is nested under it. */
function isWrapper(sections: Record<DaySection, TimelineItem[]>, item: TimelineItem): boolean {
  if (item.type !== 'task') return false
  const raw = rawId(item.id)
  for (const list of Object.values(sections)) {
    if (list.some((i) => i.isSubtask && i.parentTaskId === raw)) return true
  }
  return false
}

function parseBand(overId: string): DaySection | null {
  if (!overId.startsWith(BAND_PREFIX)) return null
  return overId.slice(BAND_PREFIX.length) as DaySection
}

function parseGap(overId: string): { section: DaySection; index: number } | null {
  if (!overId.startsWith(GAP_PREFIX)) return null
  const rest = overId.slice(GAP_PREFIX.length)
  const colon = rest.lastIndexOf(':')
  if (colon === -1) return null
  const index = Number(rest.slice(colon + 1))
  if (!Number.isFinite(index)) return null
  return { section: rest.slice(0, colon) as DaySection, index }
}

const TIMED = new Set(DAY_SECTION_BOUNDS.map((b) => b.section))

/** Resolve one drop into the writes it implies. Empty array = do nothing. */
export function resolveDrop(ctx: DropContext): DropIntent[] {
  const active = findItem(ctx.sections, ctx.activeId)
  if (!active) return []

  const refusal = refusalFor(active, ctx.isReadOnlyEvent)
  if (refusal) return [{ kind: 'refuse', reason: refusal }]

  const leavingGroup: DropIntent[] =
    active.isSubtask && active.parentTaskId && active.type === 'task'
      ? [{ kind: 'remove-from-group', taskId: rawId(active.id) }]
      : []

  // ── Band: give it a time ────────────────────────────────────────────────
  const band = parseBand(ctx.overId)
  if (band) {
    // Unscheduled holds routine instances with no time to write; it is not a
    // target. Guarded here as well as by not registering the droppable.
    if (band === 'unscheduled') return []
    if (band === 'allday') return [...leavingGroup, { kind: 'make-all-day', itemId: active.id }]
    if (!TIMED.has(band)) return []
    return [
      ...leavingGroup,
      { kind: 'set-time', itemId: active.id, when: computeBandDropTime(band, ctx.sections[band] ?? [], ctx.viewedDate) },
    ]
  }

  // ── Gap: reorder (untimed) or retime (timed) ────────────────────────────
  const gap = parseGap(ctx.overId)
  if (gap) {
    if (TIMED.has(gap.section)) {
      // Reordering a timed item REWRITES its time, so vertical position keeps
      // meaning something. No cascade: untouched items keep their times.
      const before = (ctx.sections[gap.section] ?? [])
        .filter((i) => i.id !== active.id)
        .slice(0, gap.index)
      return [
        ...leavingGroup,
        { kind: 'set-time', itemId: active.id, when: computeBandDropTime(gap.section, before, ctx.viewedDate) },
      ]
    }
    if (gap.section === 'allday') {
      const ids = ctx.fullOrderIds.allday ?? (ctx.sections.allday ?? []).map((i) => rawId(i.id))
      const writes = reorderTasksToIndex(ids, rawId(active.id), gap.index, ctx.orders)
      return writes.length > 0 ? [{ kind: 'reorder', writes }] : []
    }
    return []
  }

  // ── Row: group ──────────────────────────────────────────────────────────
  if (ctx.overId.startsWith(ROW_PREFIX)) {
    const targetId = ctx.overId.slice(ROW_PREFIX.length)
    if (targetId === ctx.activeId) return []
    const target = findItem(ctx.sections, targetId)
    if (!target) return []
    if (refusalFor(target, ctx.isReadOnlyEvent)) return []

    const activeRef = memberRefFor(active)
    const activeTaskIds = active.type === 'task' ? [rawId(active.id)] : []
    const activeRefs = activeRef ? [activeRef] : []
    const targetSection = sectionOf(ctx.sections, targetId)
    const isAllDay = targetSection === 'allday'

    if (isWrapper(ctx.sections, target)) {
      const wrapperId = rawId(target.id)
      return [{
        kind: 'add-to-group',
        wrapperId,
        taskIds: activeTaskIds,
        memberRefs: activeRefs,
        date: ctx.viewedDate,
        isAllDay,
      }]
    }

    const targetRef = memberRefFor(target)
    return [{
      kind: 'create-group',
      // Dropping A onto B reads as "A joins B", so B's title names the group.
      groupName: target.title,
      taskIds: [...activeTaskIds, ...(target.type === 'task' ? [rawId(target.id)] : [])],
      memberRefs: [...activeRefs, ...(targetRef ? [targetRef] : [])],
      date: ctx.viewedDate,
      isAllDay,
    }]
  }

  return []
}
```

- [ ] **Step 4: Verify**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH" && npx vitest run src/lib/today/todayDrop.test.ts && npx tsc -b`
Expected: all PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/today/todayDrop.ts src/lib/today/todayDrop.test.ts
git commit -m "feat(today): todayDrop — every drop rule as a pure function

The dnd-kit layer will know only 'this id was dropped on that id'. Refusals,
band times, reorder maths and grouping all live here, testable without a DOM.

Four item kinds refuse: read-only calendar events, synthetic meal items,
routine collections, and dosed routine steps (grouping.ts applies a
deferred_to override by bare id only, so a dosed step's would hit the wrong
dose). Reorder resolves against the FULL untimed set, not the rendered one."
```

---

### Task 5: Lift the section loop out of `TodayView`

**Files:**
- Create: `src/components/schedule/TodaySectionList.tsx`
- Modify: `src/components/schedule/TodayView.tsx` — delete lines ~763-1130, render `<TodaySectionList …>` instead
- Test: `src/components/schedule/TodayView.test.tsx` (existing tests are the regression net — do not rewrite them)

**Interfaces:**
- Consumes: `TodayData['grouped']`, `TodayData['sectionsOrder']`, the context handlers `TodayView` already destructures.
- Produces: `export function TodaySectionList(props: TodaySectionListProps)` rendering the seven sections exactly as before.

**Context:** The spec is explicit: *"`TodayView.tsx` (~1199 lines — this work adds drag, collapse, five bands and the duplicate sweep, and **must not** grow it. Lift the section loop, the drag wiring and the collapse state into their own units first. If this file is longer at the end than it started, the work was done wrong."*

**This task changes NO behaviour.** It is a pure move. Doing it before the drag wiring means the diff that adds drag is readable; doing it after means one commit that both moves and changes 400 lines.

- [ ] **Step 1: Confirm the regression net is green before touching anything**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH" && npx vitest run src/components/schedule/TodayView.test.tsx`
Expected: PASS. Note the count — it must be identical at Step 5.

- [ ] **Step 2: Create `TodaySectionList.tsx` by MOVING the loop**

Create `src/components/schedule/TodaySectionList.tsx`. Move — do not retype — `TodayView.tsx`'s `data.sectionsOrder.map((section) => { … })` block (currently lines ~764-1130) and the `isMealItem`/`MEAL_RE` helpers it depends on. Everything the block reads from `TodayView`'s scope becomes a prop:

```typescript
export interface TodaySectionListProps {
  sectionsOrder: DaySection[]
  grouped: Record<DaySection, TimelineItem[]>
  viewedDate: Date
  isMobile: boolean
  selectedItemId: string | null
  upNextId: string | undefined
  firstSectionItemId: string | null
  collapsedKeys: Set<string>
  openedByUser: Set<string>
  onToggleSection: (section: DaySection, currentlyCollapsed: boolean) => void
  selectedKeys: Set<string>
  onToggleBulkSelect: (key: string) => void
  tasksMap: Map<string, Task>
  shareNudgeByEventId: Map<string, { eventId: string; context: string }>
  parserContext: ParserContext
  currentDomain: 'work' | 'family' | 'personal' | 'universal'
  insert: ReturnType<typeof useTimelineInsert>
  proactive: ReturnType<typeof useProactiveSuggestions>
  getRoutineStats: (id: string) => { currentStreak?: number } | undefined
  isPromotionSuggested: (eventId: string) => boolean
  followUpTaskId: string | null
  onToggleWithFollowUp: (taskId: string, wasCompleted: boolean) => void
  onSelectItem: (id: string | null) => void
  onToggleTask: (taskId: string) => void
  onCompleteRoutine?: (routineId: string, completed: boolean, completedAt?: Date) => void
  onCompleteEvent?: (eventId: string, completed: boolean) => void
  panelOpen?: boolean
  onClosePanel?: () => void
  familyMembers: FamilyMember[]
}
```

Keep the JSX byte-identical apart from replacing bare identifiers with `props.` equivalents. **Do not "improve" anything while moving it** — a behaviour change hidden inside a move is exactly the defect class this plan is trying to avoid.

- [ ] **Step 3: Replace the block in `TodayView.tsx`**

```tsx
            <TodaySectionList
              sectionsOrder={data.sectionsOrder}
              grouped={data.grouped}
              viewedDate={viewedDate}
              isMobile={isMobile}
              selectedItemId={selectedItemId}
              upNextId={upNextId}
              firstSectionItemId={firstSectionItemId}
              collapsedKeys={collapsedKeys}
              openedByUser={openedByUser}
              onToggleSection={toggleSection}
              selectedKeys={selectedKeys}
              onToggleBulkSelect={toggleBulkSelect}
              tasksMap={tasksMap}
              shareNudgeByEventId={shareNudgeByEventId}
              parserContext={parserContext}
              currentDomain={currentDomain}
              insert={insert}
              proactive={proactive}
              getRoutineStats={getRoutineStats}
              isPromotionSuggested={isPromotionSuggested}
              followUpTaskId={followUpTaskId}
              onToggleWithFollowUp={handleToggleTaskWithFollowUp}
              onSelectItem={onSelectItem}
              onToggleTask={onToggleTask}
              onCompleteRoutine={onCompleteRoutine}
              onCompleteEvent={onCompleteEvent}
              panelOpen={panelOpen}
              onClosePanel={onClosePanel}
              familyMembers={familyMembers}
            />
```

Delete every import in `TodayView.tsx` that is now only used by the moved block (`ScheduleItem`, `RoutineCollectionRow`, `EveningMealCard`, `DaySectionHeader`, `TimelineInsertPoint`, `ShareToFamilyNudge`, `parseMealTitle`, `computeAnchorTime`, `parseRoutineTimelineId` — confirm each with a grep, do not guess). `tsc` will catch anything still needed; an unused import will not fail `tsc` but **will** fail lint, so check both.

- [ ] **Step 4: Confirm the file actually shrank**

```bash
wc -l src/components/schedule/TodayView.tsx src/components/schedule/TodaySectionList.tsx
```
Expected: `TodayView.tsx` well under its starting 1185 lines. If it did not shrink, the move was not a move.

- [ ] **Step 5: Verify — nothing changed**

```bash
export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
npx tsc -b && npx vitest run src/components/schedule/ && npm run lint 2>&1 | tail -3
```
Expected: tsc clean; **the same test count as Step 1, all passing**; lint at the Task 1 baseline.

- [ ] **Step 6: Look at it**

Open **localhost:5173** on Today. Seven sections, correct labels and counts, collapse still toggles and still survives a reload, groups still render as tinted enclosed cards with their children nested, the Up Next hero still lifts its item out of its section. A pure refactor that changes the page is not a pure refactor.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(today): lift the section loop into TodaySectionList

No behaviour change. The spec forbids TodayView growing for this work, and the
drag wiring lands next — doing the move first keeps that diff readable instead
of one commit that both moves and changes 400 lines."
```

---

### Task 6: `TodayDragProvider` — the dnd-kit layer

**Files:**
- Create: `src/components/schedule/TodayDragProvider.tsx`
- Test: `src/components/schedule/TodayDragProvider.test.tsx`

**Interfaces:**
- Consumes: `resolveDrop`, `DropIntent`, `DropContext` (Task 4).
- Produces:
  ```typescript
  export interface TodayDragState {
    activeId: string | null
    /** True while any drag is in flight — empty bands materialise on this. */
    dragging: boolean
    /** Group wrapper raw ids force-expanded by a hover, cleared when the drag ends. */
    hoverExpanded: Set<string>
  }
  export const TodayDragContext: React.Context<TodayDragState>
  export function useTodayDragState(): TodayDragState
  export function TodayDragProvider(props: {
    resolve: (activeId: string, overId: string) => DropIntent[]
    onIntents: (intents: DropIntent[]) => void
    renderOverlay: (activeId: string) => React.ReactNode
    children: React.ReactNode
  }): JSX.Element
  ```

**Sensor configuration is copied from `PlanningSession.tsx:204-216`, not invented** — `MouseSensor` with `distance: 5` and `TouchSessor` with `delay: 250, tolerance: 5`. Those constraints are what stop a tap from becoming a drag, and Today is mobile-primary, so getting them wrong breaks tapping a row to open its panel.

- [ ] **Step 1: Write the failing test**

Create `src/components/schedule/TodayDragProvider.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { TodayDragProvider, useTodayDragState } from './TodayDragProvider'

function Probe() {
  const { dragging, activeId } = useTodayDragState()
  return <div data-testid="probe">{dragging ? `dragging:${activeId}` : 'idle'}</div>
}

describe('TodayDragProvider', () => {
  it('starts idle and exposes drag state to descendants', () => {
    render(
      <TodayDragProvider resolve={() => []} onIntents={vi.fn()} renderOverlay={() => null}>
        <Probe />
      </TodayDragProvider>
    )
    expect(screen.getByTestId('probe')).toHaveTextContent('idle')
  })

  it('applies the resolved intents on drop', () => {
    const onIntents = vi.fn()
    const resolve = vi.fn(() => [{ kind: 'make-all-day' as const, itemId: 'task-a' }])
    let handlers: { onDragEnd?: (e: unknown) => void } = {}
    // The provider passes its handlers to DndContext; capture them by rendering
    // and driving the handler directly — dnd-kit's pointer simulation is not
    // reliable in jsdom, and this test is about the wiring, not the library.
    render(
      <TodayDragProvider
        resolve={resolve}
        onIntents={onIntents}
        renderOverlay={() => null}
        __testHandlers={(h) => { handlers = h }}
      >
        <Probe />
      </TodayDragProvider>
    )
    act(() => {
      handlers.onDragEnd?.({ active: { id: 'task-a' }, over: { id: 'today-band-allday' } })
    })
    expect(resolve).toHaveBeenCalledWith('task-a', 'today-band-allday')
    expect(onIntents).toHaveBeenCalledWith([{ kind: 'make-all-day', itemId: 'task-a' }])
  })

  it('does nothing when dropped outside every target', () => {
    const onIntents = vi.fn()
    let handlers: { onDragEnd?: (e: unknown) => void } = {}
    render(
      <TodayDragProvider
        resolve={() => []} onIntents={onIntents} renderOverlay={() => null}
        __testHandlers={(h) => { handlers = h }}
      >
        <Probe />
      </TodayDragProvider>
    )
    act(() => { handlers.onDragEnd?.({ active: { id: 'task-a' }, over: null }) })
    expect(onIntents).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH" && npx vitest run src/components/schedule/TodayDragProvider.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `src/components/schedule/TodayDragProvider.tsx`:

```tsx
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  DndContext, DragOverlay, pointerWithin,
  MouseSensor, TouchSensor, useSensor, useSensors,
  MeasuringStrategy,
  type DragStartEvent, type DragEndEvent, type DragOverEvent,
} from '@dnd-kit/core'
import type { DropIntent } from '@/lib/today/todayDrop'
import { ROW_PREFIX } from '@/lib/today/todayDrop'

export interface TodayDragState {
  activeId: string | null
  /** True while any drag is in flight. Empty bands materialise on this — you
   *  cannot drop something at 6 AM if the Early morning band isn't on screen. */
  dragging: boolean
  /** Wrapper raw ids force-open by a mid-drag hover. Cleared when the drag ends. */
  hoverExpanded: Set<string>
}

const EMPTY: TodayDragState = { activeId: null, dragging: false, hoverExpanded: new Set() }

export const TodayDragContext = createContext<TodayDragState>(EMPTY)

export function useTodayDragState(): TodayDragState {
  return useContext(TodayDragContext)
}

/** How long a dragged card must hover a collapsed group before it opens. */
const HOVER_EXPAND_MS = 500

export function TodayDragProvider({
  resolve,
  onIntents,
  renderOverlay,
  children,
  __testHandlers,
}: {
  resolve: (activeId: string, overId: string) => DropIntent[]
  onIntents: (intents: DropIntent[]) => void
  renderOverlay: (activeId: string) => ReactNode
  children: ReactNode
  /** Test seam: dnd-kit's pointer simulation is unreliable in jsdom, so tests
   *  drive the handlers directly rather than faking a gesture. */
  __testHandlers?: (h: {
    onDragStart: (e: DragStartEvent) => void
    onDragOver: (e: DragOverEvent) => void
    onDragEnd: (e: DragEndEvent) => void
  }) => void
}) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [hoverExpanded, setHoverExpanded] = useState<Set<string>>(() => new Set())
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverTarget = useRef<string | null>(null)

  // Same constraints as PlanningSession (204-216): 5px for the mouse, a 250ms
  // press for touch. Today is the mobile-primary surface — loosen these and a
  // tap meant to open a row's panel becomes a drag instead.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  )

  const clearHover = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    hoverTimer.current = null
    hoverTarget.current = null
  }, [])

  const onDragStart = useCallback((e: DragStartEvent) => {
    setActiveId(String(e.active.id))
  }, [])

  // Hovering a collapsed group opens it so its members stay reachable mid-drag.
  const onDragOver = useCallback((e: DragOverEvent) => {
    const over = e.over ? String(e.over.id) : null
    if (!over || !over.startsWith(ROW_PREFIX)) { clearHover(); return }
    const rowId = over.slice(ROW_PREFIX.length)
    if (hoverTarget.current === rowId) return
    clearHover()
    hoverTarget.current = rowId
    hoverTimer.current = setTimeout(() => {
      setHoverExpanded((prev) => new Set(prev).add(rowId.replace('task-', '')))
    }, HOVER_EXPAND_MS)
  }, [clearHover])

  const onDragEnd = useCallback((e: DragEndEvent) => {
    clearHover()
    setActiveId(null)
    setHoverExpanded(new Set())
    if (!e.over) return
    const intents = resolve(String(e.active.id), String(e.over.id))
    if (intents.length > 0) onIntents(intents)
  }, [resolve, onIntents, clearHover])

  const onDragCancel = useCallback(() => {
    clearHover()
    setActiveId(null)
    setHoverExpanded(new Set())
  }, [clearHover])

  __testHandlers?.({ onDragStart, onDragOver, onDragEnd })

  const state = useMemo<TodayDragState>(
    () => ({ activeId, dragging: activeId !== null, hoverExpanded }),
    [activeId, hoverExpanded],
  )

  return (
    <TodayDragContext.Provider value={state}>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        {children}
        <DragOverlay dropAnimation={null}>
          {activeId ? renderOverlay(activeId) : null}
        </DragOverlay>
      </DndContext>
    </TodayDragContext.Provider>
  )
}
```

- [ ] **Step 4: Verify**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH" && npx vitest run src/components/schedule/TodayDragProvider.test.tsx && npx tsc -b`
Expected: PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/TodayDragProvider.tsx src/components/schedule/TodayDragProvider.test.tsx
git commit -m "feat(today): TodayDragProvider — dnd-kit context, sensors, overlay

Knows nothing about Today's rules; it reports the (active, over) pair and
applies whatever todayDrop resolves. Sensor constraints copied from
PlanningSession, not invented: Today is mobile-primary and a looser
constraint turns a tap meant to open a panel into a drag."
```

---

### Task 7: Rows drag, gaps and bands accept

**Files:**
- Create: `src/components/schedule/TodayDraggableRow.tsx`
- Create: `src/components/schedule/TodayDropZones.tsx` (`TodayBandDropZone`, `TodayGapDropZone`)
- Modify: `src/components/schedule/TodaySectionList.tsx` — wrap rows, wrap the insert points, wrap the section
- Test: `src/components/schedule/TodayDropZones.test.tsx`

**Interfaces:**
- Consumes: `bandDropId`, `gapDropId`, `rowDropId` (Task 4); `useTodayDragState` (Task 6).
- Produces:
  - `export function TodayDraggableRow(props: { itemId: string; disabled?: boolean; children: ReactNode }): JSX.Element`
  - `export function TodayBandDropZone(props: { section: DaySection; children: ReactNode }): JSX.Element`
  - `export function TodayGapDropZone(props: { section: DaySection; index: number; children: ReactNode }): JSX.Element`

**Two rules that are easy to get wrong:**
1. **A row is both a drag source and a drop target** (`useDraggable` + `useDroppable` on the same id-pair). dnd-kit allows this; the droppable must use `rowDropId(itemId)` and the draggable the bare `itemId`, or they collide.
2. **Refused items get no drag affordance at all.** `disabled` on `useDraggable` is what makes a read-only event refuse *visibly* rather than accept and bounce — the spec's hazard #1. The refusal text still comes from `resolveDrop` for the case where a drag starts some other way.

- [ ] **Step 1: Write the failing test**

Create `src/components/schedule/TodayDropZones.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { TodayBandDropZone, TodayGapDropZone } from './TodayDropZones'
import { TodayDraggableRow } from './TodayDraggableRow'

const wrap = (ui: React.ReactNode) => render(<DndContext>{ui}</DndContext>)

describe('drop zones', () => {
  it('a band zone carries its section drop id', () => {
    wrap(<TodayBandDropZone section="morning"><span>rows</span></TodayBandDropZone>)
    expect(screen.getByTestId('today-band-morning')).toBeInTheDocument()
  })

  it('a gap zone carries its section and index', () => {
    wrap(<TodayGapDropZone section="allday" index={2}><span>gap</span></TodayGapDropZone>)
    expect(screen.getByTestId('today-gap-allday:2')).toBeInTheDocument()
  })

  it('a draggable row exposes a grab handle', () => {
    wrap(<TodayDraggableRow itemId="task-a"><span>row</span></TodayDraggableRow>)
    expect(screen.getByTestId('today-row-task-a')).toBeInTheDocument()
  })

  it('a disabled row is NOT draggable — a refusal must be visible, not a bounce', () => {
    wrap(<TodayDraggableRow itemId="event-1" disabled><span>row</span></TodayDraggableRow>)
    const row = screen.getByTestId('today-row-event-1')
    expect(row).toHaveAttribute('data-drag-disabled', 'true')
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH" && npx vitest run src/components/schedule/TodayDropZones.test.tsx`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Implement the row**

Create `src/components/schedule/TodayDraggableRow.tsx`:

```tsx
import type { ReactNode } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { rowDropId } from '@/lib/today/todayDrop'

/**
 * One Today row: a drag SOURCE (its bare timeline id) and a drop TARGET
 * (`today-row-<id>`, meaning "group with me"). The two ids must differ or
 * dnd-kit sees one node claiming both roles under one key.
 *
 * `disabled` is how a refusal becomes visible. A read-only calendar event that
 * accepted the gesture would fail at Google and spring back for no visible
 * reason — the spec's hazard #1. No affordance is the honest answer.
 */
export function TodayDraggableRow({
  itemId, disabled = false, children,
}: { itemId: string; disabled?: boolean; children: ReactNode }) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: itemId, disabled,
  })
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: rowDropId(itemId) })

  return (
    <div
      ref={(node) => { setDragRef(node); setDropRef(node) }}
      data-testid={rowDropId(itemId)}
      data-drag-disabled={disabled ? 'true' : undefined}
      className={[
        'transition-shadow rounded-xl',
        isDragging ? 'opacity-40' : '',
        isOver && !isDragging ? 'ring-2 ring-primary-300 ring-offset-1' : '',
      ].filter(Boolean).join(' ')}
      {...(disabled ? {} : attributes)}
      {...(disabled ? {} : listeners)}
    >
      {children}
    </div>
  )
}
```

- [ ] **Step 4: Implement the zones**

Create `src/components/schedule/TodayDropZones.tsx`:

```tsx
import type { ReactNode } from 'react'
import { useDroppable } from '@dnd-kit/core'
import type { DaySection } from '@/lib/timeUtils'
import { bandDropId, gapDropId } from '@/lib/today/todayDrop'
import { useTodayDragState } from './TodayDragProvider'

/** A whole day band — dropping here gives the item a time (or makes it all-day). */
export function TodayBandDropZone({
  section, children,
}: { section: DaySection; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: bandDropId(section) })
  const { dragging } = useTodayDragState()
  return (
    <div
      ref={setNodeRef}
      data-testid={bandDropId(section)}
      className={[
        'rounded-2xl transition-colors',
        dragging ? 'outline-dashed outline-1 outline-neutral-200' : '',
        isOver ? 'bg-primary-50/60 outline-primary-300' : '',
      ].filter(Boolean).join(' ')}
    >
      {children}
    </div>
  )
}

/**
 * The gap between two rows — dropping here REORDERS to that position (or, in a
 * timed band, rewrites the time to that position). The row itself means
 * "group with me", so the gap is what makes the two gestures unambiguous.
 */
export function TodayGapDropZone({
  section, index, children,
}: { section: DaySection; index: number; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: gapDropId(section, index) })
  const { dragging } = useTodayDragState()
  return (
    <div ref={setNodeRef} data-testid={gapDropId(section, index)} className="relative">
      {dragging && (
        <div
          aria-hidden
          className={`absolute inset-x-2 top-1/2 -translate-y-1/2 h-0.5 rounded transition-colors ${
            isOver ? 'bg-primary-500' : 'bg-transparent'
          }`}
        />
      )}
      {children}
    </div>
  )
}
```

- [ ] **Step 5: Wire them into `TodaySectionList`**

Three edits inside the section loop:

1. Wrap each section's rendered body in `<TodayBandDropZone section={section}>`.
2. Wrap each `insertBefore` (and the trailing insert point) in `<TodayGapDropZone section={section} index={itemIndex}>` — the trailing one uses `index={items.length}`.
3. Wrap each rendered row's outer `<div data-item-id={item.id}>` in `<TodayDraggableRow itemId={item.id} disabled={!!refusalFor(item, isReadOnlyEvent)}>`.

Add two props to `TodaySectionListProps`: `isReadOnlyEvent: (item: TimelineItem) => boolean` and `hoverExpanded: Set<string>`.

**Empty bands materialise during a drag.** The loop currently returns `null` for an empty section (`if (!allSectionItems || allSectionItems.length === 0) return null`). Change to:

```tsx
              const allSectionItems = data.grouped[section]
              const isEmpty = !allSectionItems || allSectionItems.length === 0
              // Empty sections stay hidden for reading, but a drag needs
              // somewhere to aim: you cannot drop something at 6 AM if the
              // Early morning band isn't on screen. Unscheduled is never a
              // drop target, so it stays hidden either way.
              if (isEmpty && (!dragging || section === 'unscheduled')) return null
```

and render an empty band as just the header inside its `TodayBandDropZone`.

- [ ] **Step 6: Verify**

```bash
export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
npx vitest run src/components/schedule/ && npx tsc -b
```
Expected: PASS, tsc clean. The existing `TodayView.test.tsx` count must not drop.

- [ ] **Step 7: Look at it — this is the first task with a visible gesture**

On **localhost:5173**: pick up an all-day card. It should lift (40% opacity behind an overlay), every band should show a dashed outline including empty ones, and a gap should show a primary line as you pass it. **Nothing is written yet** (Task 8 wires the handlers) — a drop should be a no-op. Confirm a plain tap still opens the detail panel; if it does not, the sensor constraint is wrong.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(today): rows drag, gaps and bands accept

A row is a drag source and a 'group with me' target; the gap between rows is
the reorder target. That split is what makes card-onto-card grouping and
drag-to-reorder unambiguous without a dwell timer or a modifier key.

Refused items get no drag affordance at all — a read-only calendar event that
accepted the gesture would fail at Google and spring back for no visible
reason. Empty bands materialise mid-drag so 6 AM is reachable."
```

---

### Task 8: Drops write

**Files:**
- Modify: `src/components/schedule/TodayView.tsx` — build the `DropContext`, mount `TodayDragProvider`, apply intents
- Test: `src/components/schedule/TodayView.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 2-7, plus the context actions added in Task 9. **Task 9's context additions are needed here** — do Task 9 first if you are executing out of order, or stub the handlers as optional and let Task 9 fill them in.
- Produces: a working gesture.

**Intent → handler map. Each row is a rule from the spec; none may be silently dropped:**

| Intent | Handler | Note |
|---|---|---|
| `set-time` (task) | `onUpdateTask(id, { bucket: 'timed', scheduledFor: when, isAllDay: false })` | `bucket` and `scheduledFor` move in lockstep — a `scheduledFor` without `bucket:'timed'` never surfaces on Today (`selectTimed`, `taskPools.ts:105`) |
| `set-time` (routine) | `onPushRoutine(bareId, when)` | one-day override via `deferred_to`; **never** `scheduleRoutineOnDate` |
| `set-time` (event) | `onUpdateEvent(id, { startTime, endTime })` | preserve duration |
| `make-all-day` (task) | `onUpdateTask(id, { bucket: 'timed', scheduledFor: midnight, isAllDay: true })` | |
| `make-all-day` (routine/event) | `onNotify('…')` | no all-day concept for an instance override; say so rather than no-op |
| `reorder` | `onReorderTasks(writes)` | |
| `create-group` | `onGroupItems(taskIds, memberRefs, groupName, date, isAllDay)` | already in context |
| `add-to-group` | `onAddToGroup(…)` | new in Task 9 |
| `remove-from-group` | `onRemoveFromGroup(taskId)` | new in Task 9 |
| `refuse` | `onNotify(reason)` | |

- [ ] **Step 1: Write the failing tests**

Add to `src/components/schedule/TodayView.test.tsx`:

```typescript
import { resolveDrop, bandDropId, rowDropId } from '@/lib/today/todayDrop'

describe('TodayView drag intents', () => {
  const allDayTask = {
    id: 't1', title: 'Pick up dry cleaning', completed: false,
    bucket: 'timed', isAllDay: true, scheduledFor: new Date(),
    createdAt: new Date(), updatedAt: new Date(),
  }

  it('a band drop schedules the task with bucket and scheduledFor in lockstep', () => {
    // A scheduledFor without bucket:'timed' never surfaces on Today —
    // selectTimed gates on the bucket (taskPools.ts:105).
    const onUpdateTask = vi.fn()
    renderView({ tasks: [allDayTask as never] }, { onUpdateTask })
    const intents = resolveDrop({
      activeId: 'task-t1', overId: bandDropId('evening'),
      sections: { ...emptySections(), allday: [{ id: 'task-t1', type: 'task', title: 'x', startTime: null, endTime: null, completed: false } as never] },
      fullOrderIds: {}, orders: new Map(), viewedDate: TODAY,
      isReadOnlyEvent: () => false, groupMembersOf: () => [],
    })
    expect(intents[0]).toMatchObject({ kind: 'set-time', itemId: 'task-t1' })
  })

  it('renders a drag affordance on an ordinary row', () => {
    renderView({ tasks: [allDayTask as never] })
    expect(screen.getByTestId(rowDropId('task-t1'))).toBeInTheDocument()
  })
})
```

(The heavy rule coverage is Task 4's; these two guard the *wiring* — that TodayView mounts the provider and renders draggable rows at all.)

- [ ] **Step 2: Run and watch them fail**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH" && npx vitest run src/components/schedule/TodayView.test.tsx`
Expected: FAIL — no row test id.

- [ ] **Step 3: Build the DropContext in `TodayView`**

```tsx
  const { isReadOnlyCalendar } = useCalendarPermissions()

  const isReadOnlyEvent = useCallback((item: TimelineItem) => {
    const ev = item.originalEvent
    return isReadOnlyCalendar(ev?.calendar_id ?? ev?.calendarId ?? null)
  }, [isReadOnlyCalendar])

  // Every untimed task for this day, INCLUDING rows the domain/assignee filter
  // hides. Reorder renormalises against this: renormalising only the rendered
  // subset resets it to 0…n×1000 while hidden siblings keep their old values
  // and interleave on the next render (Stage 2a residual 3).
  const untimedOrder = useMemo(() => {
    const day = new Date(viewedDate); day.setHours(0, 0, 0, 0)
    const sameDay = (d?: Date | null) => {
      if (!d) return false
      const x = new Date(d); x.setHours(0, 0, 0, 0)
      return x.getTime() === day.getTime()
    }
    const untimed = tasks
      .filter((t) => !t.completed && t.bucket === 'timed' && t.isAllDay && sameDay(t.scheduledFor))
      .sort((a, b) => {
        const ao = a.sortOrder ?? null, bo = b.sortOrder ?? null
        if (ao != null && bo != null) return ao - bo
        if (ao != null) return -1
        if (bo != null) return 1
        return a.title.localeCompare(b.title)
      })
    return {
      ids: untimed.map((t) => t.id),
      orders: new Map(untimed.map((t) => [t.id, t.sortOrder ?? null])),
    }
  }, [tasks, viewedDate])

  const resolve = useCallback((activeId: string, overId: string) => resolveDrop({
    activeId, overId,
    sections: data.grouped,
    fullOrderIds: { allday: untimedOrder.ids },
    orders: untimedOrder.orders,
    viewedDate,
    isReadOnlyEvent,
    // Read fresh at drop time — a stale array silently drops members and
    // addToGroup cannot defend itself (Stage 2a residual 4).
    groupMembersOf: (wrapperRawId) => tasksMap.get(wrapperRawId)?.groupMembers ?? [],
  }), [data.grouped, untimedOrder, viewedDate, isReadOnlyEvent, tasksMap])
```

- [ ] **Step 4: Apply the intents**

```tsx
  const applyIntents = useCallback(async (intents: DropIntent[]) => {
    for (const intent of intents) {
      switch (intent.kind) {
        case 'refuse':
          onNotify?.(intent.reason)
          break
        case 'set-time': {
          const { routineId, slot } = intent.itemId.startsWith('routine-')
            ? parseRoutineTimelineId(intent.itemId)
            : { routineId: '', slot: null }
          if (intent.itemId.startsWith('task-')) {
            onUpdateTask?.(intent.itemId.replace('task-', ''), {
              bucket: 'timed', scheduledFor: intent.when, isAllDay: false,
            })
          } else if (intent.itemId.startsWith('routine-') && slot === null) {
            // One-day override: reschedule() writes status:'pending' +
            // deferred_to when the target day is the instance's own day, and
            // grouping.ts:93 reads exactly that. NEVER scheduleRoutineOnDate —
            // that rewrites recurrence_pattern permanently.
            onPushRoutine?.(routineId, intent.when)
          } else if (intent.itemId.startsWith('event-')) {
            const item = findTimelineItem(data.grouped, intent.itemId)
            const ev = item?.originalEvent
            if (ev) {
              const startStr = ev.start_time || ev.startTime
              const endStr = ev.end_time || ev.endTime
              const durationMs = startStr && endStr
                ? new Date(endStr).getTime() - new Date(startStr).getTime()
                : 30 * 60_000
              await ctx.onUpdateEvent?.(ev.google_event_id || ev.id, {
                startTime: intent.when,
                endTime: new Date(intent.when.getTime() + durationMs),
              })
            }
          }
          break
        }
        case 'make-all-day': {
          if (!intent.itemId.startsWith('task-')) {
            onNotify?.("Only tasks can be moved to All day.")
            break
          }
          const midnight = new Date(viewedDate); midnight.setHours(0, 0, 0, 0)
          onUpdateTask?.(intent.itemId.replace('task-', ''), {
            bucket: 'timed', scheduledFor: midnight, isAllDay: true,
          })
          break
        }
        case 'reorder':
          await ctx.onReorderTasks?.(intent.writes)
          break
        case 'create-group':
          await onGroupItems?.(intent.taskIds, intent.memberRefs, intent.groupName, intent.date, intent.isAllDay)
          break
        case 'add-to-group':
          await ctx.onAddToGroup?.(intent.wrapperId, intent.taskIds, intent.memberRefs, intent.date, intent.isAllDay)
          break
        case 'remove-from-group':
          await ctx.onRemoveFromGroup?.(intent.taskId)
          break
      }
    }
  }, [ctx, onUpdateTask, onPushRoutine, onGroupItems, onNotify, viewedDate, data.grouped])
```

Add the small helper beside `isMealItem` in `TodaySectionList.tsx` and export it, or inline it in `TodayView.tsx`:

```typescript
export function findTimelineItem(
  grouped: Record<DaySection, TimelineItem[]>, id: string,
): TimelineItem | null {
  for (const list of Object.values(grouped)) {
    const found = list.find((i) => i.id === id)
    if (found) return found
  }
  return null
}
```

- [ ] **Step 5: Mount the provider around the list**

```tsx
        <TodayDragProvider
          resolve={resolve}
          onIntents={(intents) => { void applyIntents(intents) }}
          renderOverlay={(activeId) => {
            const item = findTimelineItem(data.grouped, activeId)
            return item ? (
              <div className="card rounded-xl border border-primary-200 bg-bg-elevated px-3 py-2 shadow-lg text-sm">
                {item.title}
              </div>
            ) : null
          }}
        >
          <TodaySectionList … isReadOnlyEvent={isReadOnlyEvent} />
        </TodayDragProvider>
```

- [ ] **Step 6: Verify**

```bash
export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
npx tsc -b && npx vitest run && npm run lint 2>&1 | tail -3
```
Expected: tsc clean, suite green, lint at the Task 1 baseline.

- [ ] **Step 7: Walk every gesture on localhost:5173**

Do not skip any of these — each is a separate rule and `tsc` proves none of them:

- All-day card onto **Evening** → lands at 5 PM (or after the last evening item), **renders without a refresh**, survives reload.
- Timed card onto **All day** → time clears, moves to the All Day band.
- Card onto a **gap** in All Day → reorders; reload → still in the new order.
- Card onto a **gap** between two timed items → **its time changes to the previous item's end**, and **no untouched item's time moves**.
- Card onto **another card** → a group forms named after the target, renders immediately.
- Card onto that **group** → it joins. Drag it out to a band → it leaves and takes the time.
- Hover a dragged card over a **collapsed group** → it expands after ~0.5s.
- Drag a **routine** to a new time → today only. Check tomorrow: unchanged.
- Try to drag a **read-only work-calendar event** → no drag affordance; it does not lift.
- Try to drag a **dosed routine step** or a **meal** → refused with a message.
- Start a drag → empty bands appear; end it → they hide.
- **Tap** a row → the detail panel still opens.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(today): drops write — Today finally has the gesture

Wires every intent to a handler. Three rules worth naming:
- bucket:'timed' and scheduledFor move in lockstep; scheduledFor alone never
  surfaces on Today (selectTimed gates on the bucket).
- a routine retime writes a ONE-DAY override via deferred_to, never
  scheduleRoutineOnDate, which rewrites recurrence_pattern permanently.
- reorder renormalises against every untimed task for the day, not the
  filtered render list, or hidden siblings interleave on the next render."
```

---

### Task 9: Context, container, and Stage 2a's residuals

**Files:**
- Modify: `src/contexts/ScheduleActionsContext.tsx` — three new optional actions
- Modify: `src/apps/tasks/HomeViewContainer.tsx` — provide them
- Modify: `src/hooks/useSupabaseTasks.ts` — residual 1 (comment wording) and residual 2 (`Promise.all` rejection)
- Test: `src/hooks/useSupabaseTasks.test.ts`

**Interfaces:**
- Produces, on `ScheduleActionsValue`:
  ```typescript
  onReorderTasks?: (writes: import('@/lib/today/taskOrdering').OrderWrite[]) => Promise<boolean>
  onAddToGroup?: (wrapperId: string, taskIds: string[], memberRefs: GroupMemberRef[], date: Date, isAllDay: boolean) => Promise<void>
  onRemoveFromGroup?: (taskId: string) => Promise<void>
  ```

- [ ] **Step 1: Write the failing test for residual 2**

Add to `src/hooks/useSupabaseTasks.test.ts`, following the file's existing supabase-mock pattern:

```typescript
it('updateTaskOrders rolls back and reports when a query REJECTS rather than resolving', async () => {
  // Stage 2a residual 2: Promise.all had no catch. supabase-js normally
  // resolves { error }, but a rejection would leave the optimistic order
  // applied with no rollback and no toast — a silent lie on screen.
  mockUpdateRejects(new Error('network'))
  const { result } = renderHook(() => useSupabaseTasks())
  let ok: boolean | undefined
  await act(async () => { ok = await result.current.updateTaskOrders([{ id: 't1', sortOrder: 500 }]) })
  expect(ok).toBe(false)
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH" && npx vitest run src/hooks/useSupabaseTasks.test.ts`
Expected: FAIL — the rejection propagates out of `updateTaskOrders`.

- [ ] **Step 3: Fix residuals 1 and 2 in `updateTaskOrders`**

Wrap the `Promise.all`:

```typescript
    // One narrow UPDATE per row, in flight together. A rejection (rather than a
    // resolved { error }) would otherwise escape with the optimistic order
    // still applied — the list would show an order the database never took.
    let results: { error: unknown }[]
    try {
      results = await Promise.all(
        writes.map((w) =>
          supabase.from('tasks').update({ sort_order: w.sortOrder }).eq('id', w.id))
      )
    } catch (err) {
      apply(previous)
      showToast("Couldn't save the new order", 'warning')
      logger.error('[updateTaskOrders] rejected:', err)
      return false
    }
```

And correct the overclaiming comment (residual 1) — change *"must roll the whole move back, not leave the list half-persisted"* to:

```typescript
    // Every result is inspected — a partial failure rolls back THE LOCAL LIST.
    // The database is genuinely half-written in that case, and local state
    // re-diverges when the realtime echo for the succeeded rows lands. That is
    // self-healing toward DB truth, and the common path is a single write.
```

- [ ] **Step 4: Add the three context actions**

In `src/contexts/ScheduleActionsContext.tsx`, beside `onGroupItems`:

```typescript
  /** Persist a reorder: a different sort_order per row, one round trip. */
  onReorderTasks?: (writes: import('@/lib/today/taskOrdering').OrderWrite[]) => Promise<boolean>
  /** Add members to a group that already exists (drag a card onto a group). */
  onAddToGroup?: (
    wrapperId: string,
    taskIds: string[],
    memberRefs: import('@/types/task').GroupMemberRef[],
    date: Date,
    isAllDay: boolean,
  ) => Promise<void>
  /** Detach one task from its group; it keeps its own schedule. */
  onRemoveFromGroup?: (taskId: string) => Promise<void>
```

- [ ] **Step 5: Provide them in `HomeViewContainer`**

Beside `handleGroupItems` (~line 431):

```typescript
  // Add to an existing group. `existingMemberRefs` is read HERE, from the live
  // task list, not passed down from the drag layer — a stale array silently
  // drops every member addToGroup doesn't see (Stage 2a residual 4).
  const handleAddToGroup = useCallback(
    async (
      wrapperId: string,
      taskIds: string[],
      memberRefs: import('@/types/task').GroupMemberRef[],
      date: Date,
      isAllDay: boolean,
    ) => {
      const wrapper = tasks.find((t) => t.id === wrapperId)
      await addToGroup(
        { wrapperId, taskIds, memberRefs, existingMemberRefs: wrapper?.groupMembers ?? [], date, isAllDay },
        { addTask, updateTask, refetch },
      )
    },
    [tasks, addTask, updateTask, refetch],
  );

  const handleRemoveFromGroup = useCallback(
    async (taskId: string) => { await removeFromGroup(taskId, { updateTask, refetch }) },
    [updateTask, refetch],
  );
```

Import `addToGroup` and `removeFromGroup` from `@/lib/today/groupTasks`, and add to `scheduleActionsValue`:

```typescript
      onReorderTasks: updateTaskOrders,
      onAddToGroup: handleAddToGroup,
      onRemoveFromGroup: handleRemoveFromGroup,
```

(`updateTaskOrders` comes off `useSupabaseTasks` — confirm it is destructured there; it is exported at `useSupabaseTasks.ts:1344`.)

- [ ] **Step 6: Verify**

```bash
export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
npx tsc -b && npx vitest run && npm run lint 2>&1 | tail -3
```
Expected: tsc clean, suite green, lint at baseline.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(today): wire reorder/add-to-group/remove-from-group, clear 2a residuals

existingMemberRefs is read in the container from the live task list rather than
threaded through the drag layer — addToGroup cannot defend itself against a
stale array, and a stale one silently drops members.

Also: updateTaskOrders now catches a REJECTED query (it only handled resolved
{ error }, so a rejection escaped with the optimistic order still on screen),
and its rollback comment no longer claims a reach it doesn't have."
```

---

### Task 10: The bulk pass — "Plan today" reaches the hour grid

**Files:**
- Modify: `src/apps/tasks/HomeViewContainer.tsx` — the `PlanningSession` mount (~line 584) and the `onScheduleRoutine` prop
- Modify: `src/components/schedule/TodayView.tsx` or `StatsRow` — a second entry point
- Test: `src/components/planning/PlanningSession.test.tsx`

**Context:** `PlanningSession` with `placementGrain='time'` is a complete dnd-kit hour grid, mounted behind `planningOpen`, whose only setter `onOpenPlanning` has **zero consumers** outside a test. Meanwhile "Plan today" opens `setGuidedHorizon('daily')` — the narration session, whose `pick-today` step moves week items onto today and gives them no time, actively manufacturing the pileup this whole spec exists to fix.

**A live defect this task must fix, not inherit:** the mount passes `onScheduleRoutine={… updateRoutine(routineId, scheduleRoutineOnDate(routine, date, time))}`. `scheduleRoutineOnDate` (`routineUtils.ts:18`) rewrites `recurrence_pattern` to `weekly` on the dropped weekday and sets a new `time_of_day` — **a permanent rule change from a single drag.** On a week grid that is arguably the intent; on Today it is exactly hazard #2. Route the single-day case through the one-day override instead.

- [ ] **Step 1: Write the failing test**

Add to `src/components/planning/PlanningSession.test.tsx`:

```typescript
it('at time grain, a routine drop asks for a ONE-DAY override, not a rule change', () => {
  // scheduleRoutineOnDate rewrites recurrence_pattern permanently. On Today —
  // where the day is already settled and only the time is in question — that
  // turns one drag into "every future Saturday moves too".
  const onScheduleRoutineToday = vi.fn()
  const onScheduleRoutine = vi.fn()
  render(<PlanningSession {...timeProps}
    onScheduleRoutine={onScheduleRoutine}
    onScheduleRoutineToday={onScheduleRoutineToday} />)
  // drive handleDragEnd with a routine id onto a slot — follow this file's
  // existing drag-simulation helper
  dropRoutineOnSlot('routine-r1', 'slot-2026-07-25-14-30')
  expect(onScheduleRoutineToday).toHaveBeenCalled()
  expect(onScheduleRoutine).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH" && npx vitest run src/components/planning/PlanningSession.test.tsx`
Expected: FAIL — no such prop.

- [ ] **Step 3: Add the prop and route by grain**

In `PlanningSession.tsx`, add to props:

```typescript
  /**
   * Pin a routine to a specific time on ONE day, leaving its recurrence rule
   * alone. Used at time grain, where the day is already settled and only the
   * time is in question — `onScheduleRoutine` rewrites the rule permanently,
   * which is right on the week grid and wrong here.
   */
  onScheduleRoutineToday?: (routineId: string, when: Date) => void
```

In both routine branches of `handleDragEnd` (the drawer-routine branch ~510 and the placed-routine branch ~522), replace the single call with:

```typescript
        const when = new Date(parsed.year, parsed.month, parsed.day, parsed.hour, parsed.minute, 0, 0)
        if (!dayGrain && onScheduleRoutineToday) {
          onScheduleRoutineToday(routineId, when)
        } else {
          onScheduleRoutine?.(routineId, new Date(parsed.year, parsed.month, parsed.day), time)
        }
```

Add `onScheduleRoutineToday` to `handleDragEnd`'s dependency array.

- [ ] **Step 4: Wire the container**

In `HomeViewContainer.tsx`'s `PlanningSession` mount, add:

```tsx
            onScheduleRoutineToday={(routineId, when) => { void scheduleActions.onPushRoutine?.(routineId, when) }}
```

- [ ] **Step 5: Give it a real trigger**

`onOpenPlanning` still has no consumer. In `TodayView`'s stats-row `endControls`, add beside "Plan today":

```tsx
              {data.isToday && ctx.onOpenPlanning && (
                <button
                  type="button"
                  onClick={ctx.onOpenPlanning}
                  title="Block out the day on an hour grid"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[15px] text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 transition-all"
                >
                  <CalendarClock className="w-5 h-5" />
                  <span>Time-block</span>
                </button>
              )}
```

Import `CalendarClock` from `lucide-react`. **Lucide, never an emoji.**

Note that `TodayView.test.tsx` currently asserts *no* "Plan day" button exists — that test named the OLD control and still passes (the new one is "Time-block"). Read it before assuming; if it matches by a looser regex, update it and say so.

- [ ] **Step 6: Verify**

```bash
export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
npx tsc -b && npx vitest run && npm run lint 2>&1 | tail -3
```

- [ ] **Step 7: Look at it**

On 5173: the **Time-block** control opens the hour grid on today. Drag a task from the rail onto 2 PM → it takes 2 PM. Drag a routine onto a slot → check the routine's own settings afterward: **its recurrence must be unchanged**, and tomorrow's occurrence must be at its usual time.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(today): the hour grid is reachable, and stops retiming routines forever

PlanningSession placementGrain='time' has been complete and wired to nothing —
onOpenPlanning had zero consumers outside a test. It now has a Time-block
control on Today.

It also fixes a live defect rather than inheriting it: the routine drop called
scheduleRoutineOnDate, which rewrites recurrence_pattern to weekly-on-that-day
plus a new time_of_day. One drag, every future occurrence moved. At time grain
it now writes a one-day override."
```

---

### Task 11: Full verification and the honest walkthrough

**Files:** none — this task writes no code.

- [ ] **Step 1: Rebase onto origin/main**

```bash
git fetch origin && git rebase origin/main
```
Resolve anything, then re-run the full suite. A worktree that drifts is how a "fixed" thing ships broken.

- [ ] **Step 2: The full gate**

```bash
export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
npx tsc -b && npx vitest run && npm run build && npm run lint 2>&1 | tail -5
```
Expected: tsc clean; suite green (baseline 3939 + this plan's new tests); **build clean** — `tsc -b` is not `npm run build`, and this project has shipped a green `tsc` with a broken build before; lint at the Task 1 baseline.

- [ ] **Step 3: The spec's own verification list, on 5173**

Run every bullet in the spec's "Verification" section that Stage 2b covers. Write the result of each — pass, fail, or not reachable — into `docs/superpowers/notes/2026-07-25-stage2b-walkthrough.md`. **A bullet you did not actually perform is a fail, not a blank.**

- [ ] **Step 4: Check the file sizes the spec constrained**

```bash
wc -l src/components/schedule/TodayView.tsx
```
The spec: *"If this file is longer at the end than it started, the work was done wrong."* It started at **1185**.

- [ ] **Step 5: Push**

```bash
git push origin HEAD:today-drag-gestures
```
**Not to `main`.** Merging is Scott's call after the walkthrough notes are read — every push to `main` deploys to production.

---

## Self-Review

**Spec coverage (Stage 2b scope):**

| Spec move | Task |
|---|---|
| #0 drop→render fix (prerequisite) | Task 1 (time-boxed reproduction gate) |
| #1 drag to a time — bands, hours, back to all-day | Tasks 4, 7, 8 |
| #1 `PlanningSession` grain='time' as the bulk pass | Task 10 |
| #2 drag to group — create, add, remove | Tasks 4, 8, 9 |
| #2 collapsed group is a drop target; hover auto-expands | Task 6 (`hoverExpanded`), Task 7 |
| #3 reorder, including timed items rewriting their time | Tasks 2, 4, 8 |
| #3 hazard: read-only events refuse visibly | Tasks 3, 4, 7 |
| #3 hazard: routines write a one-day override | Tasks 4, 8, 10 |
| #5 empty bands materialise during a drag | Task 7 |
| Stage 2a residual 1 (comment overclaims) | Task 9 |
| Stage 2a residual 2 (`Promise.all` no catch) | Task 9 |
| Stage 2a residual 3 (renormalise a subset) | Tasks 4, 8 |
| Stage 2a residual 4 (`existingMemberRefs` stale) | Tasks 4, 9 |
| Stage 2a residual 5 (uncoverable branch) | Not fixed — it is honest and harmless; noted so it is not rediscovered |

**Deliberately deferred to Stage 3, not omitted:** the page cap and its always-visible hidden count (#4), the duplicate sweep (#6), the density pass (#7), the assistant's proposed order and grouping (#8). Also the `sessions.ts` `pick-today` step asking for a time — it belongs with the session-arc work, and Task 10 gives the same capability a direct route.

**Known risks this plan cannot close:**
1. **Task 5 is a 400-line move.** Reviewing a move for accidental behaviour change is genuinely hard, and `tsc` will not help. The mitigation is that the existing `TodayView.test.tsx` runs before and after with an identical count, plus Step 6's eyes-on-page. It is still the likeliest place for a silent regression.
2. **The gap-vs-row drop vocabulary is a design decision the spec did not make.** It is defensible and recorded above, but it is the thing most likely to feel wrong in the hand. Task 7 Step 7 and Task 8 Step 7 are where that judgement gets made; if it feels wrong, change it there, before Stage 3 builds on it.
3. **`create-group` names the group after the target card.** Auto-naming is a guess. The alternative — prompting for a name mid-drag — breaks the gesture. If the names read badly in practice, the fix is a rename affordance on the wrapper, not a prompt.

**Type consistency:** `OrderWrite { id, sortOrder }` from `taskOrdering.ts` is what Task 2's `reorderTasksToIndex` returns, what Task 4's `DropIntent['reorder']` carries, and what Task 9's `onReorderTasks` accepts. `DropIntent` and `DropContext` are defined in Task 4 and consumed unchanged by Tasks 6, 7 and 8. `GroupMemberRef` and `GroupTasksDeps` are pre-existing in `groupTasks.ts`. `bandDropId`/`gapDropId`/`rowDropId` are defined once in `todayDrop.ts` and are the only place those strings are built — no component hand-writes a `today-band-…` literal.
