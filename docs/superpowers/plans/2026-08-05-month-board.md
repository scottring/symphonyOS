# Month Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/month`'s wrap-flow pill wall with a grouped board where every move sits in exactly one labeled block, and a block header drags its whole cluster onto a week.

**Architecture:** Three layers, bottom-up. (1) `monthShelfGroups` becomes a *total partition* — every pool task lands in exactly one block, with a synthetic `unfiled` block for the remainder. (2) `PlanningShelf` gains a `layout: 'flow' | 'board'` prop; `'flow'` is the default so `/week` is untouched, `'board'` renders blocks in a CSS multi-column. (3) `MonthCalendarGrid` learns an additive `text/task-ids` drag payload and a plural `onPlaceTasksInWeek` callback; `MonthPage` places a whole block under one undo action.

**Tech Stack:** React 19, TypeScript strict, Tailwind v4, Vitest + React Testing Library, native HTML5 drag-and-drop (not dnd-kit).

## Global Constraints

- **Worktree:** all work happens in `/Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/month-board` on branch `month-board`. Never edit or commit in the main worktree.
- **Node version:** tests require Node 22.14.0. Run this FIRST in every shell, and verify with `node -v`:
  ```bash
  export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
  ```
- **`npm test` is WATCH mode.** Always use `npx vitest run <path>`.
- **Type-check with `npx tsc --noEmit -p tsconfig.app.json`.** Bare `npx tsc --noEmit` at the repo root is a no-op.
- **No emoji in UI strings or code.** Use `lucide-react` icons.
- **Straight apostrophes in UI strings** (`August's moves`), matching the codebase's dominant convention.
- **Do not push to `main`.** This branch stays local until Scott reviews it in the browser.
- **Spec:** `docs/superpowers/specs/2026-08-05-month-board-design.md`.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/lib/planning/monthGroups.ts` | Pure partition of the month pool into labeled blocks | Modify — total partition, `kind`, sort order |
| `src/lib/planning/monthGroups.test.ts` | Partition rules | Modify — update shape assertions, add totality tests |
| `src/components/planning/horizon/MonthCalendarGrid.tsx` | Week strips + drop targets | Modify — `text/task-ids`, plural callback |
| `src/components/planning/horizon/MonthCalendarGrid.test.tsx` | Grid drawing + drop behavior | Modify — plural callback, multi-id drop |
| `src/components/planning/guided/stepTypes/PlaceOnWeeksStep.tsx` | Wizard's place-on-weeks step | Modify — call site only |
| `src/components/planning/PlanningShelf.tsx` | The pool surface for `/week` and `/month` | Modify — `layout` prop, board render, `kind` on `ShelfGroup` |
| `src/components/planning/PlanningShelf.test.tsx` | Shelf behavior | Modify — board-mode tests |
| `src/apps/tasks/horizons/MonthPage.tsx` | `/month` page wiring | Modify — `layout="board"`, batched place + one undo |

Task order is bottom-up so each task's tests can pass on their own: partition → grid protocol → shelf rendering → page wiring.

---

## Task 1: `monthShelfGroups` becomes a total partition

**Files:**
- Modify: `src/lib/planning/monthGroups.ts`
- Test: `src/lib/planning/monthGroups.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  ```ts
  export interface MonthShelfGroup {
    id: string
    label: string
    kind: 'pick' | 'project' | 'unfiled'
    taskIds: string[]
  }
  export function monthShelfGroups(
    pool: readonly Task[],
    allTasks: readonly Task[],
    projectsMap: Map<string, { id: string; name: string }>,
  ): MonthShelfGroup[]
  ```
  Tasks 3 and 4 rely on `kind` and on the guarantee that every `pool` id appears in exactly one returned block.

**Background:** Today this returns blocks for *some* tasks (pick-threaded always, project clusters at `CLUSTER_THRESHOLD = 3`) and leaves the rest for the caller to render loose. That partial partition is what forces grouped and ungrouped pills into one `flex-wrap` container. Making it total is what makes a board possible.

**Note on existing tests:** four existing tests assert exact object shapes with `toEqual` and will fail once `kind` is added and the unfiled block appears. Updating them is part of Step 1, not collateral damage — read them before writing.

- [ ] **Step 1: Update the existing tests to the new shape and add the new rules**

Replace the whole `describe('monthShelfGroups', ...)` body in `src/lib/planning/monthGroups.test.ts` with:

```ts
describe('monthShelfGroups', () => {
  it('rolls threaded moves up under the pick they serve', () => {
    const pick = task({ id: 'p1', title: 'Porch and backyard set up for guests', bucket: 'quarter', pickedAt: new Date(), goalId: 'g1' })
    const pool = [
      task({ id: 'm1', title: 'Weed the backyard', sourceId: 'p1' }),
      task({ id: 'm2', title: 'Put down sand', goalId: 'g1' }),
    ]
    const groups = monthShelfGroups(pool, [pick, ...pool], projects)
    expect(groups).toEqual([
      { id: 'pick:p1', label: 'Porch and backyard set up for guests', kind: 'pick', taskIds: ['m1', 'm2'] },
    ])
  })

  it('rolls an unthreaded 3+ project cluster up under the project', () => {
    const pool = ['Weed the backyard', 'Put down sand', 'Buy a bench'].map((title, i) =>
      task({ id: `c${i}`, title, projectId: 'proj' }))
    const groups = monthShelfGroups(pool, pool, projects)
    expect(groups).toEqual([
      { id: 'project:proj', label: 'Transform the Back and Frontyards', kind: 'project', taskIds: ['c0', 'c1', 'c2'] },
    ])
  })

  it('files a threaded move under its pick even when it also has a project', () => {
    const pick = task({ id: 'p1', title: 'Porch and backyard', bucket: 'quarter', pickedAt: new Date() })
    const pool = ['a', 'b', 'c'].map((title, i) => task({ id: `c${i}`, title, projectId: 'proj', sourceId: i === 0 ? 'p1' : undefined }))
    const groups = monthShelfGroups(pool, [pick, ...pool], projects)
    expect(groups.find((g) => g.id === 'pick:p1')?.taskIds).toEqual(['c0'])
    // Two left on the project is under the cluster threshold — no project group.
    expect(groups.find((g) => g.id === 'project:proj')).toBeUndefined()
    // ...but they are not lost: they fall to Unfiled.
    expect(groups.find((g) => g.kind === 'unfiled')?.taskIds).toEqual(['c1', 'c2'])
  })

  // THE load-bearing property. The board renders one block per group and
  // nothing else, so anything missing from a block is invisible on the page.
  it('is a TOTAL partition — every pool task lands in exactly one block', () => {
    const pick = task({ id: 'p1', title: 'A pick', bucket: 'quarter', pickedAt: new Date() })
    const pool = [
      task({ id: 'a', sourceId: 'p1' }),
      task({ id: 'b', projectId: 'proj' }),
      task({ id: 'c', projectId: 'proj' }),
      task({ id: 'd', projectId: 'proj' }),
      task({ id: 'e' }),
    ]
    const groups = monthShelfGroups(pool, [pick, ...pool], projects)
    const placed = groups.flatMap((g) => g.taskIds)
    expect(placed.slice().sort()).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(new Set(placed).size).toBe(placed.length)
  })

  it('collects the remainder into a single Unfiled block, pinned last', () => {
    const pool = [
      task({ id: 'l1', title: 'Decide what to do with the car' }),
      task({ id: 'l2', title: 'Plan a winter vacation', projectId: 'proj' }),
    ]
    const groups = monthShelfGroups(pool, pool, projects)
    expect(groups).toEqual([
      { id: 'unfiled', label: 'Unfiled', kind: 'unfiled', taskIds: ['l1', 'l2'] },
    ])
  })

  it('orders blocks by member count descending, Unfiled always last', () => {
    const big = task({ id: 'pBig', title: 'Big pick', bucket: 'quarter', pickedAt: new Date() })
    const small = task({ id: 'pSmall', title: 'Small pick', bucket: 'quarter', pickedAt: new Date() })
    const pool = [
      task({ id: 'loose1' }),
      task({ id: 'loose2' }),
      task({ id: 'loose3' }),
      task({ id: 's1', sourceId: 'pSmall' }),
      task({ id: 'b1', sourceId: 'pBig' }),
      task({ id: 'b2', sourceId: 'pBig' }),
    ]
    const groups = monthShelfGroups(pool, [big, small, ...pool], projects)
    expect(groups.map((g) => g.id)).toEqual(['pick:pBig', 'pick:pSmall', 'unfiled'])
  })

  it('omits the Unfiled block entirely when nothing is left over', () => {
    const pick = task({ id: 'p1', title: 'A pick', bucket: 'quarter', pickedAt: new Date() })
    const pool = [task({ id: 'm1', sourceId: 'p1' })]
    const groups = monthShelfGroups(pool, [pick, ...pool], projects)
    expect(groups.map((g) => g.kind)).toEqual(['pick'])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
cd /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/month-board
npx vitest run src/lib/planning/monthGroups.test.ts
```

Expected: FAIL. The shape assertions fail on the missing `kind` property; the totality, ordering, and Unfiled tests fail because no `unfiled` block is produced.

- [ ] **Step 3: Make the partition total**

In `src/lib/planning/monthGroups.ts`, update the header comment, the interface, and the function body:

```ts
// src/lib/planning/monthGroups.ts
//
// The month shelf's partition. A month list fills with the STEPS of a move —
// five backyard chores are one move ("Porch and backyard") with five steps —
// and reading them as five separate lines makes the month look like a chore
// list instead of a plan. Two ways a cluster earns its own block:
//   1. the moves thread to the same season pick (the real parent), or
//   2. three or more share a project and nothing has been threaded yet.
//
// Everything else falls into one 'unfiled' block. This is a TOTAL partition:
// every pool task lands in exactly one block. The board renders one block per
// group and nothing else, so a task missing from every block would be
// invisible on the page — the previous partial partition left a remainder for
// the caller to render loose, which is what forced grouped and ungrouped pills
// into a single wrap-flow. Pure — the shelf renders whatever this returns.

import type { Task } from '@/types/task'
import { partitionSeason, partitionMonth } from '@/lib/planning/betPulse'

export interface MonthShelfGroup {
  id: string
  label: string
  /** 'unfiled' is the residue, not a cluster — the shelf renders it last and
   *  gives it no drag handle (dragging nine unrelated moves onto one week is
   *  a footgun, not a feature). */
  kind: 'pick' | 'project' | 'unfiled'
  taskIds: string[]
}

const CLUSTER_THRESHOLD = 3

export function monthShelfGroups(
  pool: readonly Task[],
  allTasks: readonly Task[],
  projectsMap: Map<string, { id: string; name: string }>,
): MonthShelfGroup[] {
  const inPool = new Set(pool.map((t) => t.id))
  const groups: MonthShelfGroup[] = []
  const taken = new Set<string>()

  // 1. By pick — the move's real parent. partitionMonth already resolves a
  //    move to exactly one pick, so nothing can land in two groups.
  const picks = partitionSeason(allTasks).picks
  const { byPick } = partitionMonth(picks, allTasks)
  for (const p of picks) {
    const members = (byPick.get(p.id) ?? []).filter((t) => inPool.has(t.id))
    if (members.length === 0) continue
    for (const m of members) taken.add(m.id)
    groups.push({ id: `pick:${p.id}`, label: p.title, kind: 'pick', taskIds: members.map((t) => t.id) })
  }

  // 2. By project, for what's left — only once a cluster is big enough that
  //    the project, not the item, is the honest unit.
  const byProject = new Map<string, Task[]>()
  for (const t of pool) {
    if (taken.has(t.id) || !t.projectId) continue
    const arr = byProject.get(t.projectId) ?? []
    arr.push(t)
    byProject.set(t.projectId, arr)
  }
  for (const [projectId, members] of byProject) {
    if (members.length < CLUSTER_THRESHOLD) continue
    const name = projectsMap.get(projectId)?.name
    if (!name) continue
    for (const m of members) taken.add(m.id)
    groups.push({ id: `project:${projectId}`, label: name, kind: 'project', taskIds: members.map((t) => t.id) })
  }

  // Biggest clusters lead; a singleton keeps its own block because the label
  // IS the point — it names the season pick that move serves.
  groups.sort((a, b) => b.taskIds.length - a.taskIds.length)

  // 3. The remainder — one block, always last. Threaded work reads first;
  //    unfiled residue is what you should thread or cut.
  const unfiled = pool.filter((t) => !taken.has(t.id)).map((t) => t.id)
  if (unfiled.length > 0) {
    groups.push({ id: 'unfiled', label: 'Unfiled', kind: 'unfiled', taskIds: unfiled })
  }

  return groups
}
```

Note the two `taken.add` loops: the project loop previously never marked its members taken (nothing downstream needed it). It does now, or project-clustered tasks would appear in both their project block and Unfiled, breaking totality.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/lib/planning/monthGroups.test.ts
```

Expected: PASS, all tests in the file.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

Expected: clean. `ShelfGroup` in `PlanningShelf.tsx` is structurally compatible (it has no `kind`, and the extra property on the value is allowed at the call site because `shelfGroups` is not an object literal).

- [ ] **Step 6: Commit**

```bash
git add src/lib/planning/monthGroups.ts src/lib/planning/monthGroups.test.ts
git commit -m "refactor(month): make monthShelfGroups a total partition

Every pool task now lands in exactly one block, with the remainder
collected into a single 'unfiled' block pinned last and blocks sorted by
member count descending. Adds 'kind' so the shelf can tell a cluster from
the residue. Prerequisite for the board layout: the board renders one
block per group and nothing else.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `MonthCalendarGrid` accepts a multi-id drop

**Files:**
- Modify: `src/components/planning/horizon/MonthCalendarGrid.tsx:33` (prop), `:153-158` (rail drop), `:210-216` (week drop)
- Modify: `src/components/planning/guided/stepTypes/PlaceOnWeeksStep.tsx:74` (call site)
- Modify: `src/apps/tasks/horizons/MonthPage.tsx:307` (call site)
- Test: `src/components/planning/horizon/MonthCalendarGrid.test.tsx`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  ```ts
  // MonthCalendarGridProps
  onPlaceTasksInWeek?: (taskIds: string[], weekStart: Date) => void
  onUnscheduleTask?: (taskId: string) => void   // unchanged, still singular
  ```
  Drag payload contract, used by Task 3: a drag source MAY set `text/task-ids` to a comma-joined id list. Every drop target reads `text/task-ids` first and falls back to `text/task-id`. Task 4 supplies the `onPlaceTasksInWeek` implementation.

**Background:** The rename to a plural callback is deliberate — one signature, one code path. Keeping both a singular and a plural handler would let them drift. `onUnscheduleTask` stays singular because the shelf is where things go to be *unplaced*, and there is no cluster gesture for that direction.

- [ ] **Step 1: Write the failing tests**

In `src/components/planning/horizon/MonthCalendarGrid.test.tsx`, add this describe block after the existing `describe('MonthCalendarGrid week placement', ...)`:

```ts
describe('MonthCalendarGrid cluster drop', () => {
  const monthTask = (over: Partial<Task>): Task => ({
    id: 'rock', title: 'Order the vanity', completed: false, bucket: 'month',
    createdAt: new Date(), updatedAt: new Date(), ...over,
  })

  // Placing 24 moves one at a time is the actual chore the board exists to
  // kill, so a block header hands the whole cluster over in one gesture.
  it('a text/task-ids drop places every id in that row\'s week', () => {
    const onPlaceTasksInWeek = vi.fn()
    render(
      <MonthCalendarGrid
        month={JULY} tasks={[monthTask({})]} events={events}
        weekStartsOn={1} onPlaceTasksInWeek={onPlaceTasksInWeek} now={NOW}
      />,
    )
    fireEvent.drop(screen.getByTestId('week-col-2'), {
      dataTransfer: { getData: (f: string) => (f === 'text/task-ids' ? 'a,b,c' : '') },
    })
    expect(onPlaceTasksInWeek).toHaveBeenCalledTimes(1)
    const [ids, weekStart] = onPlaceTasksInWeek.mock.calls[0]
    expect(ids).toEqual(['a', 'b', 'c'])
    expect(weekStart.getDate()).toBe(13)
  })

  // Single pills never changed their payload — the new MIME type is purely
  // additive, so PlacementChip and the wizard keep working untouched.
  it('a text/task-id drop still places exactly one', () => {
    const onPlaceTasksInWeek = vi.fn()
    render(
      <MonthCalendarGrid
        month={JULY} tasks={[monthTask({})]} events={events}
        weekStartsOn={1} onPlaceTasksInWeek={onPlaceTasksInWeek} now={NOW}
      />,
    )
    fireEvent.drop(screen.getByTestId('week-col-2'), {
      dataTransfer: { getData: (f: string) => (f === 'text/task-id' ? 'rock' : '') },
    })
    expect(onPlaceTasksInWeek).toHaveBeenCalledWith(['rock'], expect.any(Date))
  })

  it('read-only rows refuse a cluster drop too', () => {
    const onPlaceTasksInWeek = vi.fn()
    render(
      <MonthCalendarGrid
        month={JULY} tasks={[monthTask({})]} events={events}
        weekStartsOn={1} onPlaceTasksInWeek={onPlaceTasksInWeek} readOnly now={NOW}
      />,
    )
    fireEvent.drop(screen.getByTestId('week-col-2'), {
      dataTransfer: { getData: (f: string) => (f === 'text/task-ids' ? 'a,b' : '') },
    })
    expect(onPlaceTasksInWeek).not.toHaveBeenCalled()
  })

  it('an empty payload places nothing', () => {
    const onPlaceTasksInWeek = vi.fn()
    render(
      <MonthCalendarGrid
        month={JULY} tasks={[monthTask({})]} events={events}
        weekStartsOn={1} onPlaceTasksInWeek={onPlaceTasksInWeek} now={NOW}
      />,
    )
    fireEvent.drop(screen.getByTestId('week-col-2'), {
      dataTransfer: { getData: () => '' },
    })
    expect(onPlaceTasksInWeek).not.toHaveBeenCalled()
  })
})
```

Then rename the callback in the four EXISTING tests that use it. In `describe('MonthCalendarGrid week placement', ...)` and `describe('MonthCalendarGrid hideRail', ...)`, replace every `onPlaceTaskInWeek` identifier and prop with `onPlaceTasksInWeek`, and change the two assertions that destructure a single id:

```ts
// in "dropping on a row places the rock on that ROW's week"
const [ids, weekStart] = onPlaceTasksInWeek.mock.calls[0]
expect(ids).toEqual(['rock'])
expect(weekStart.getMonth()).toBe(6)
expect(weekStart.getDate()).toBe(13)
```

```ts
// in "hides the rail copy but keeps row drops working"
expect(onPlaceTasksInWeek).toHaveBeenCalledTimes(1)
expect(onPlaceTasksInWeek.mock.calls[0][1].getDate()).toBe(13)
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/components/planning/horizon/MonthCalendarGrid.test.tsx
```

Expected: FAIL — `onPlaceTasksInWeek` is not a known prop, so the mock is never called.

- [ ] **Step 3: Add the payload reader and rename the prop**

In `src/components/planning/horizon/MonthCalendarGrid.tsx`, add this helper just below the `rangeLabel` function (around line 63):

```ts
// The drag payload. A single pill writes 'text/task-id' (unchanged, so
// PlacementChip and every other existing source keeps working); a block
// header writes 'text/task-ids' as a comma-joined list. Reading ids-first
// with a singular fallback keeps ONE drop path instead of two handlers that
// can drift apart.
function readTaskIds(dt: DataTransfer): string[] {
  const many = dt.getData('text/task-ids')
  if (many) return many.split(',').filter(Boolean)
  const one = dt.getData('text/task-id')
  return one ? [one] : []
}
```

Change the prop declaration at line 33:

```ts
  /** Place rocks onto a WEEK — the row. Receives one id for a single pill,
   *  many for a dragged block header. Absent = look-only rows. */
  onPlaceTasksInWeek?: (taskIds: string[], weekStart: Date) => void
```

Update the destructure at line 69 from `onPlaceTaskInWeek,` to `onPlaceTasksInWeek,`.

Replace the week-row drop handler (lines 210-216):

```tsx
                onDrop={weekMode ? (e) => {
                  e.preventDefault()
                  setDragOverRow(null)
                  const ids = readTaskIds(e.dataTransfer)
                  if (ids.length === 0) return
                  onPlaceTasksInWeek?.(ids, w.start)
                } : undefined}
```

Replace the rail drop handler (lines 153-158). The rail unplaces one at a time — it takes the first id rather than looping, because there is no cluster gesture in this direction and a silent multi-unplace would be a surprise:

```tsx
          onDrop={(e) => {
            e.preventDefault()
            setRailOver(false)
            const [id] = readTaskIds(e.dataTransfer)
            if (id) onUnscheduleTask?.(id)
          }}
```

Update `weekMode` at line 78 — it gates every drop handler, so missing it makes the rows inert:

```ts
  const weekMode = !readOnly && onPlaceTasksInWeek != null
```

- [ ] **Step 4: Update both call sites so the build stays green**

In `src/components/planning/guided/stepTypes/PlaceOnWeeksStep.tsx:73-75`, keep the existing comment and body exactly as they are; only the prop name and the loop are new:

```tsx
        // The month rung's one decision: which WEEK. scheduledFor is cleared,
        // not just left unwritten — a date implies bucket='timed' (the timed
        // invariant), and a week placement must set neither.
        onPlaceTasksInWeek={(ids, weekStart) =>
          ids.forEach((id) =>
            host.onUpdateTask(id, { bucket: 'week', weekStart, scheduledFor: undefined, isAllDay: false }))}
```

The wizard step has no undo store of its own, so a plain loop is correct here — the batched-undo treatment is `MonthPage`'s alone (Task 4).

In `src/apps/tasks/horizons/MonthPage.tsx:307`, apply the same minimal shim for now — Task 4 replaces it with the batched, undoable version:

```tsx
              onPlaceTasksInWeek={(ids, weekStart) => ids.forEach((id) => updateTask(id, {
                bucket: 'week', weekStart, scheduledFor: undefined, isAllDay: false,
              }))}
```

- [ ] **Step 5: Run the tests and type-check**

```bash
npx vitest run src/components/planning/horizon/MonthCalendarGrid.test.tsx
npx tsc --noEmit -p tsconfig.app.json
```

Expected: tests PASS, type-check clean.

- [ ] **Step 6: Run the smoke tests, which mount both call sites**

```bash
npx vitest run src/apps/tasks/horizons/pages.smoke.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/planning/horizon/MonthCalendarGrid.tsx \
        src/components/planning/horizon/MonthCalendarGrid.test.tsx \
        src/components/planning/guided/stepTypes/PlaceOnWeeksStep.tsx \
        src/apps/tasks/horizons/MonthPage.tsx
git commit -m "feat(month): let a week row accept a multi-id drop

Adds an additive 'text/task-ids' payload (comma-joined) alongside the
existing 'text/task-id'; every drop target reads ids-first with a
singular fallback, so no existing drag source changes. Renames the grid
callback to onPlaceTasksInWeek so there is one signature and one path
rather than two handlers that can drift.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `PlanningShelf` board layout

**Files:**
- Modify: `src/components/planning/PlanningShelf.tsx`
- Test: `src/components/planning/PlanningShelf.test.tsx`

**Interfaces:**
- Consumes: `MonthShelfGroup['kind']` from Task 1; the `text/task-ids` payload contract from Task 2.
- Produces:
  ```ts
  // PlanningShelfProps
  layout?: 'flow' | 'board'   // default 'flow' — /week is unchanged
  // ShelfGroup
  kind?: 'pick' | 'project' | 'unfiled'
  ```

**Background:** `/week` passes no `layout` and must render byte-identically to today. Board mode is a separate render path — it does not reuse `openGroups`, `expanded`, or `SHELF_COLLAPSED_COUNT`, all three of which exist to tame the wrap-flow.

- [ ] **Step 1: Write the failing tests**

Append to `src/components/planning/PlanningShelf.test.tsx`. The file already defines `task(id, title, projectId?)` (positional args, not an object), `baseProps(overrides)`, and `renderShelf(overrides)` which wraps in a `DndContext`. Board mode uses `dragMode="native"` and calls no dnd-kit hooks, so it needs its own render helper rather than `renderShelf`.

```tsx
describe('PlanningShelf board layout', () => {
  const boardTasks = [
    task('a', 'Rug', 'proj'),
    task('b', 'Lamp', 'proj'),
    task('c', 'Research keyboards'),
  ]
  const boardGroups = [
    { id: 'project:proj', label: 'Living room upgrades', kind: 'project' as const, taskIds: ['a', 'b'] },
    { id: 'unfiled', label: 'Unfiled', kind: 'unfiled' as const, taskIds: ['c'] },
  ]

  // No DndContext: board mode is native-drag only, and PlanningShelf itself
  // calls no dnd-kit hooks.
  const renderBoard = (over: Partial<PlanningShelfProps> = {}) => {
    const props = baseProps({
      layout: 'board', dragMode: 'native', carryOverIds: new Set<string>(),
      tasks: boardTasks, groups: boardGroups, ...over,
    })
    render(<PlanningShelf {...props} />)
    return props
  }

  it('renders one block per group, each showing all its members', () => {
    renderBoard()
    const block = screen.getByTestId('shelf-block-project:proj')
    expect(block).toHaveTextContent('Living room upgrades')
    expect(block).toHaveTextContent('Rug')
    expect(block).toHaveTextContent('Lamp')
  })

  // The chevron existed to tame the wrap-flow. Once blocks are boxed, hiding
  // moves behind a disclosure is exactly what let 24 pile up unnoticed.
  it('renders no expand/collapse control and no overflow control', () => {
    renderBoard()
    expect(screen.queryByText(/more$/)).not.toBeInTheDocument()
    expect(screen.queryByText('Show fewer')).not.toBeInTheDocument()
  })

  it('gives a cluster header a drag handle carrying every member id', () => {
    renderBoard()
    const handle = screen.getByTestId('shelf-block-drag-project:proj')
    const setData = vi.fn()
    fireEvent.dragStart(handle, { dataTransfer: { setData } })
    expect(setData).toHaveBeenCalledWith('text/task-ids', 'a,b')
  })

  // Unfiled is a residue, not a cluster — dragging it would fling unrelated
  // moves into one week.
  it('gives the Unfiled block NO drag handle', () => {
    renderBoard()
    expect(screen.queryByTestId('shelf-block-drag-unfiled')).not.toBeInTheDocument()
    expect(screen.getByTestId('shelf-block-unfiled')).toHaveTextContent('Research keyboards')
  })

  it('hosts the composer inside the Unfiled block, which renders even when empty', () => {
    renderBoard({
      tasks: [task('a', 'Rug', 'proj'), task('b', 'Lamp', 'proj')],
      groups: [boardGroups[0]],
      draftPlaceholder: 'Add a chunk to this month',
    })
    const unfiled = screen.getByTestId('shelf-block-unfiled')
    expect(unfiled).toContainElement(screen.getByPlaceholderText('Add a chunk to this month'))
  })

  it('flow layout is untouched — /week still gets its wrap-flow pills', () => {
    renderShelf({ tasks: boardTasks, carryOverIds: new Set<string>() })
    expect(screen.queryByTestId('shelf-block-unfiled')).not.toBeInTheDocument()
    expect(screen.getByText('Rug')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/components/planning/PlanningShelf.test.tsx
```

Expected: FAIL — `layout` is not a known prop and no `shelf-block-*` testids exist.

- [ ] **Step 3: Add `kind` to `ShelfGroup` and the `layout` prop**

In `src/components/planning/PlanningShelf.tsx`, extend the exported group interface (around line 94):

```ts
export interface ShelfGroup {
  id: string
  /** The move this cluster really is — a season pick, or the project. */
  label: string
  /** Board layout only. 'unfiled' is the residue, not a cluster: it renders
   *  last, hosts the composer, and gets no drag handle. */
  kind?: 'pick' | 'project' | 'unfiled'
  taskIds: string[]
}
```

Add to `PlanningShelfProps` (after the `groups` field):

```ts
  /** 'board' renders each group as a boxed block in a CSS multi-column, with
   *  every member always visible and a draggable cluster header. Used by
   *  /month, whose pool carries grouping and runs 20+ items; /week keeps the
   *  default wrap-flow, where a handful of pills reads fine. */
  layout?: 'flow' | 'board'
```

Destructure it with its default alongside the others (around line 292):

```ts
    poolLabel = 'To place', groups, layout = 'flow',
```

- [ ] **Step 4: Add the block component**

Insert above `export function PlanningShelf` (around line 284):

```tsx
// One block on the board. The header is the cluster's drag handle: dropping
// it on a week row places every member at once, which is the whole payoff of
// grouping — placing 24 moves one at a time is the chore the board exists to
// kill. Unfiled gets no handle (see ShelfGroup.kind).
function ShelfBlock({ group, members, draggable: canDrag, children }: {
  group: ShelfGroup
  members: Task[]
  draggable: boolean
  children: ReactNode
}) {
  return (
    <div
      data-testid={`shelf-block-${group.id}`}
      className="mb-2 break-inside-avoid rounded-lg border border-neutral-200 bg-white px-3 py-2"
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        {canDrag && (
          <span
            data-testid={`shelf-block-drag-${group.id}`}
            draggable
            onDragStart={(e) => e.dataTransfer.setData('text/task-ids', members.map((t) => t.id).join(','))}
            title={`Place all ${members.length} on a week`}
            className="shrink-0 cursor-grab active:cursor-grabbing text-neutral-300 hover:text-primary-500 transition-colors"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </span>
        )}
        <span className={`flex-1 min-w-0 text-[11px] font-semibold uppercase tracking-wide truncate ${
          group.kind === 'unfiled' ? 'text-neutral-400' : 'text-primary-800'
        }`}>
          {group.label}
        </span>
        <span className="shrink-0 text-[11px] text-neutral-400">{members.length}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  )
}
```

Add `GripVertical` to the existing `lucide-react` import at line 25.

- [ ] **Step 5: Build the block list and render the board**

Inside `PlanningShelf`, immediately after the existing `const { rolled, ungrouped } = useMemo(...)` block (which ends around line 339), add:

```ts
  // Board blocks. monthShelfGroups is a total partition, so `ungrouped` is
  // normally empty — but folding any remainder into Unfiled here keeps this
  // component correct for any caller, since the board renders blocks and
  // nothing else. Unfiled always exists in board mode even at zero members:
  // it hosts the composer, and a newly captured chunk starts unfiled.
  const boardBlocks = useMemo(() => {
    if (layout !== 'board') return [] as { group: ShelfGroup; tasks: Task[] }[]
    const blocks = rolled.filter((b) => b.group.kind !== 'unfiled')
    const unfiledGroup = rolled.find((b) => b.group.kind === 'unfiled')
    const unfiledTasks = [...(unfiledGroup?.tasks ?? []), ...ungrouped]
    return [
      ...blocks,
      { group: unfiledGroup?.group ?? { id: 'unfiled', label: 'Unfiled', kind: 'unfiled' as const, taskIds: [] }, tasks: unfiledTasks },
    ]
  }, [layout, rolled, ungrouped])
```

Note this uses `rolled`, which already drops empty groups via its `.filter((g) => g.tasks.length > 0)` — so a group whose members all got placed disappears on its own.

Now split the non-reviewing render. Replace the opening of the `) : (` branch at line 414 — `<div className="flex flex-wrap items-center gap-2">` and everything through the closing of that div — with a conditional. Keep the entire existing flow-mode JSX verbatim as the `else` branch; add the board branch before it:

```tsx
      ) : layout === 'board' ? (
        <div className="columns-1 sm:columns-2 lg:columns-3 gap-2">
          {boardBlocks.map(({ group, tasks: members }) => (
            <ShelfBlock
              key={group.id}
              group={group}
              members={members}
              draggable={dragMode === 'native' && group.kind !== 'unfiled' && members.length > 0}
            >
              {members.map((t) => (
                <Pill key={t.id} task={t} carried={carryOverIds.has(t.id)}
                  staleWeek={staleWeekIds.has(t.id)} onBringForward={onBringForward}
                  projectName={t.projectId ? projectsMap.get(t.projectId)?.name : undefined}
                  onOpenTask={onOpenTask} onSetBucket={onSetBucket} onDeleteTask={onDeleteTask}
                  onPushTask={onPushTask} onCompleteTask={onCompleteTask} fileUnder={fileUnder} />
              ))}
              {group.kind === 'unfiled' && composer}
            </ShelfBlock>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {/* ...existing flow-mode JSX, unchanged... */}
        </div>
      )}
```

The composer currently lives inline in the flow branch as the dashed-border `<span>` containing the `Plus` button and the draft `<input>` (around lines 434-445). Extract it verbatim into a `const composer = (...)` declared just above `const content = (isOver: boolean) => (` (line 347), and reference it as `{composer}` in BOTH branches — in flow mode exactly where it sits today, in board mode inside the Unfiled block. Do not retype it; move the existing JSX so `/week`'s composer cannot drift.

- [ ] **Step 6: Read `text/task-ids` on the shelf's own drop target**

In `NativeShelfFrame`'s `onDrop` (line 272-277), a block dragged back onto the shelf should not silently unplace only its first member. Take the first id, matching the grid rail's stance:

```tsx
      onDrop={(e) => {
        e.preventDefault()
        setIsOver(false)
        const many = e.dataTransfer.getData('text/task-ids')
        const id = many ? many.split(',').filter(Boolean)[0] : e.dataTransfer.getData('text/task-id')
        if (id) onNativeUnschedule?.(id)
      }}
```

- [ ] **Step 7: Run the tests and type-check**

```bash
npx vitest run src/components/planning/PlanningShelf.test.tsx
npx tsc --noEmit -p tsconfig.app.json
```

Expected: PASS and clean. If a pre-existing flow-mode test broke, the composer extraction changed the flow JSX — revert to moving it verbatim.

- [ ] **Step 8: Commit**

```bash
git add src/components/planning/PlanningShelf.tsx src/components/planning/PlanningShelf.test.tsx
git commit -m "feat(shelf): add a board layout for grouped pools

layout='board' renders each group as a boxed block in a CSS multi-column
with every member visible and a draggable cluster header; the composer
moves inside the Unfiled block, which always renders. layout defaults to
'flow', so /week is unchanged. Blocks use multi-column rather than a grid
so varying-height blocks pack tightly instead of leaving dead space.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `/month` renders the board and places a cluster undoably

**Files:**
- Modify: `src/apps/tasks/horizons/MonthPage.tsx:260-282` (shelf props), `:307-309` (place handler)
- Test: `src/apps/tasks/horizons/pages.smoke.test.tsx`

**Interfaces:**
- Consumes: `layout` from Task 3, `onPlaceTasksInWeek` from Task 2, `MonthShelfGroup.kind` from Task 1.
- Produces: nothing downstream.

**Background — the undo hazard.** `useUndo` is **single-slot**. `undo.pushAction` overwrites whatever was there, so N calls leave only the last recoverable and silently orphan the rest. `MonthPage.tsx:140-166` already documents and solves exactly this for merge: snapshot everything first, push exactly ONE action, then write. Placing a block has the same shape and takes the same fix.

`setBucket` cannot restore `weekStart`, so the undo uses `updateTask` directly — the same call the forward placement uses.

- [ ] **Step 1: Write the failing test**

Add to `src/apps/tasks/horizons/pages.smoke.test.tsx`, inside the existing `describe('horizon pages (smoke)', ...)` block, next to the other MonthPage drop tests.

Use a **pick** block, not a project one: the file's `useProjects` mock returns an empty `projectsMap`, so no project cluster can form, while picks are derived from `mockTasks` via `partitionSeason` and need no mock surgery. Reuse the file's existing `createMockTask`, `mockTasks`, `mockUpdateTask`, and `todayGridCell(container)` helpers. `useUndo` is NOT mocked, so the real `UndoToast` renders the pushed action's label — that is how the single-push guarantee is observed here.

```tsx
it('placing a block writes every member to the week under ONE undo action', () => {
  mockTasks.push(createMockTask({
    id: 'season-1', title: 'Living room upgrades', bucket: 'quarter', pickedAt: new Date(),
  }) satisfies Task)
  for (const [id, title] of [['a', 'Rug'], ['b', 'Lamp'], ['c', 'Shelving']]) {
    mockTasks.push(createMockTask({ id, title, bucket: 'month', sourceId: 'season-1' }) satisfies Task)
  }

  const { container } = render(<MonthPage />)

  const payload: Record<string, string> = {}
  fireEvent.dragStart(screen.getByTestId('shelf-block-drag-pick:season-1'), {
    dataTransfer: { setData: (f: string, v: string) => { payload[f] = v } },
  })
  expect(payload['text/task-ids']).toBe('a,b,c')

  fireEvent.drop(todayGridCell(container), {
    dataTransfer: { getData: (f: string) => payload[f] ?? '' },
  })

  for (const id of ['a', 'b', 'c']) {
    const call = mockUpdateTask.mock.calls.find(([taskId]) => taskId === id)
    expect(call, `expected ${id} to be placed`).toBeDefined()
    expect(call![1].bucket).toBe('week')
    expect(localYmd(call![1].weekStart as Date)).toBe(localYmd(currentWeekStart))
    expect(call![1].scheduledFor).toBeUndefined()
  }

  // useUndo is SINGLE-SLOT: three pushes would leave only the last
  // recoverable. One toast naming all three is the observable proof.
  expect(screen.getByText('Placed 3 moves')).toBeInTheDocument()
})

it('the Unfiled block gets no drag handle — it is a residue, not a cluster', () => {
  mockTasks.push(createMockTask({ id: 'loose', title: 'Research keyboards', bucket: 'month' }) satisfies Task)
  render(<MonthPage />)
  expect(screen.getByTestId('shelf-block-unfiled')).toHaveTextContent('Research keyboards')
  expect(screen.queryByTestId('shelf-block-drag-unfiled')).not.toBeInTheDocument()
})
```

If `createMockTask` does not accept `pickedAt` or `sourceId`, extend its `Partial<Task>` override rather than hand-building a task object — the fixture must carry the RAW column shape the selectors read.

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run src/apps/tasks/horizons/pages.smoke.test.tsx
```

Expected: FAIL — no `shelf-block-drag-project:lr` element, because the shelf is still in flow layout.

- [ ] **Step 3: Switch the shelf to board layout**

In `src/apps/tasks/horizons/MonthPage.tsx`, add one prop to the `<PlanningShelf>` element (around line 261, next to `dragMode="native"`):

```tsx
              layout="board"
```

- [ ] **Step 4: Add the batched, undoable place handler**

Add this callback next to `handleApplyProposal` (after line 178):

```tsx
  // Placing a block moves every member at once. useUndo is SINGLE-SLOT, so N
  // updateTask calls with N pushAction calls would leave only the last
  // recoverable and silently orphan the rest — the same hazard the merge
  // branch above documents. Snapshot everything, push exactly ONE action,
  // then write.
  //
  // The restore uses updateTask, not setBucket: setBucket cannot write
  // weekStart, so an undone placement would return to the shelf still
  // secretly carrying a week.
  const handlePlaceInWeek = useCallback((ids: string[], weekStart: Date) => {
    const prior = ids
      .map((id) => tasksById.get(id))
      .filter((t): t is Task => !!t)
      .map((t) => ({
        id: t.id,
        bucket: t.bucket ?? 'month',
        scheduledFor: t.scheduledFor,
        weekStart: t.weekStart,
        isAllDay: t.isAllDay,
      }));
    if (prior.length === 0) return;
    undo.pushAction(`Placed ${prior.length} move${prior.length === 1 ? '' : 's'}`, () => {
      for (const t of prior) {
        void updateTask(t.id, {
          bucket: t.bucket, scheduledFor: t.scheduledFor,
          weekStart: t.weekStart, isAllDay: t.isAllDay,
        });
      }
    });
    for (const t of prior) {
      // scheduledFor is CLEARED, not merely left unwritten: a scheduled_for
      // alongside bucket='week' breaks the invariant that a date implies
      // bucket='timed', leaving the item dated but absent from every day view.
      void updateTask(t.id, { bucket: 'week', weekStart, scheduledFor: undefined, isAllDay: false });
    }
  }, [tasksById, updateTask, undo]);
```

Replace the inline shim added in Task 2 (around line 307) with:

```tsx
              onPlaceTasksInWeek={handlePlaceInWeek}
```

- [ ] **Step 5: Run the tests and type-check**

```bash
npx vitest run src/apps/tasks/horizons/pages.smoke.test.tsx
npx tsc --noEmit -p tsconfig.app.json
```

Expected: PASS and clean.

- [ ] **Step 6: Run the full suite and lint**

```bash
npx vitest run
npm run lint
```

Expected: no new failures. Note `useNotes` has a known pre-existing flake — if it fails, re-run that file alone to confirm it is the flake and not a regression.

- [ ] **Step 7: Commit**

```bash
git add src/apps/tasks/horizons/MonthPage.tsx src/apps/tasks/horizons/pages.smoke.test.tsx
git commit -m "feat(month): render the moves shelf as a board

/month passes layout='board', so every move sits in exactly one labeled
block instead of a wrap-flow of pills. Dropping a block header on a week
places all its members under ONE undo action — useUndo is single-slot,
so per-task pushes would orphan all but the last. Restores via updateTask
rather than setBucket, which cannot clear weekStart.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Verify in the browser

**Files:** none — this task changes no code unless it finds a defect.

**Background:** Type-checks are not inspection. Native HTML5 drags CAN be driven under CDP automation (unlike dnd-kit, whose sensors never arm under synthetic events), so cluster drag is genuinely verifiable here — but the layout itself needs human eyes.

- [ ] **Step 1: Copy the env file into the worktree**

A worktree without `.env` renders a blank screen — the symptom looks like a build failure and is not one.

```bash
cp /Users/scottkaufman/Developer/Developer/symphonyOS/.env \
   /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/month-board/.env
```

- [ ] **Step 2: Start the dev server**

```bash
cd /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/month-board
npm run dev
```

Port 5173. Do NOT change the port — changing it drops the logged-in session. If HMR has been running through the edits, restart the server before trusting anything you see.

- [ ] **Step 3: Walk `/month` and confirm each item**

- Every move appears exactly once. Cross-check the block counts against the masthead's "N in motion".
- No `+N more`, no chevrons, no "Show fewer".
- Blocks pack into three columns at desktop width, two at tablet, one at mobile — with no ragged gap under a short block.
- Unfiled sits last and holds the `Add a chunk to this month…` composer.
- Unfiled has no drag handle; every other block does.
- Dragging a block header onto a week column moves all its members into that column's lane, and the block disappears from the board.
- The undo toast reads `Placed 3 moves`; pressing undo returns all three to the board, in their original block.
- Dragging a single pill still places just that one.
- `/week` is visually unchanged.

- [ ] **Step 4: Report findings**

Report what you saw to Scott, including screenshots of `/month` at desktop and mobile widths. Do not push. If anything in Step 3 failed, stop and report rather than patching past it.

---

## Self-Review

**Spec coverage.** Every spec section maps to a task: total partition + `kind` + ordering + singleton blocks → Task 1. Additive `text/task-ids`, three drop sites, plural callback, both call sites → Tasks 2 and 3 (the shelf's own drop target is Task 3 Step 6). `layout` knob, multi-column, no chevron/truncation, composer in Unfiled, Tend untouched → Task 3. Undraggable Unfiled → Task 3 Steps 4-5, tested in Step 1. Batched undo → Task 4. All three test groups the spec names → Tasks 1, 2, 3; the manual pass → Task 5.

**Type consistency.** `MonthShelfGroup.kind` (Task 1) is required; `ShelfGroup.kind` (Task 3) is optional so `/week`, which passes no groups, still type-checks — the two are structurally compatible at MonthPage's call site. `onPlaceTasksInWeek: (taskIds: string[], weekStart: Date) => void` is identical in Task 2's declaration, Task 2's shims, and Task 4's `handlePlaceInWeek`. `readTaskIds` is defined once, in `MonthCalendarGrid.tsx`; the shelf's own drop target inlines the same two-line read rather than importing across a component boundary.

**Harness names verified.** `PlanningShelf.test.tsx` provides `task(id, title, projectId?)` (positional), `baseProps(overrides)`, and `renderShelf(overrides)`. `pages.smoke.test.tsx` provides `createMockTask`, the hoisted `mockTasks` / `mockUpdateTask`, `todayGridCell(container)`, `localYmd`, and `currentWeekStart`; its `useProjects` mock returns an empty `projectsMap`, which is why Task 4's test uses a pick block rather than a project one; `useUndo` is unmocked, so the toast label is assertable.

**Backward-compatibility check on existing drop tests.** Several smoke tests stub `dataTransfer` as `{ getData: () => 'rock-task' }` — returning the same string for every MIME type. Under `readTaskIds` that resolves to `['rock-task']`, so those tests keep passing unchanged. This was verified against the actual test source, not assumed.
