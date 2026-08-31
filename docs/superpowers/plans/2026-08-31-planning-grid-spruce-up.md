# Planning Grid Spruce-Up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pare and organize the planning pool behind official views (This week / This month / Everything), widen it, make routines visible and toggleable with a labeled control, make every placed item rearrangeable (including "+N" overflow items), add an Unscheduled pool lane to /week, and add rules-based drop smarts (domain picker on drop + suggested open slots).

**Architecture:** Two grids share the work: the "Plan Your Time" overlay is `PlanningSession` (drawer mode, time grain), the live `/week` is `WeekViewV2` (its own dnd-kit grid — NOT PlanningSession). Pool selection/ordering/grouping moves into a pure lib `src/lib/planning/poolViews.ts` consumed by both; slot suggestions live in pure lib `src/lib/planning/dropSmarts.ts` consumed by both. All writes ride existing mutation paths (`updateTask` derives scope from context via `scopeForDomain` — privacy needs no new logic).

**Tech Stack:** React 19 + TS strict, Vite 7, dnd-kit, Vitest + RTL, Tailwind v4 (Nordic Journal), lucide icons (никогда emoji).

**Spec:** `docs/superpowers/specs/2026-08-31-planning-grid-spruce-up-design.md`

## Global Constraints

- Work happens in the `planning-spruce` worktree (`.worktrees/planning-spruce`); NEVER edit or commit in the main worktree. Push to main only finished, verified work (`git push origin HEAD:main`); pushes auto-deploy prod.
- Run tests with `npx vitest run <file>` (bare `npm test` is watch mode). Node must be 22.14.0 (`node -v` first; PATH fix in memory if wrong). Typecheck with `npx tsc -p tsconfig.app.json --noEmit` (root `npx tsc --noEmit` is a no-op).
- Never partial-`upsert` `tasks`; all task writes via `onUpdateTask`/`updateTask` (`.update().eq()` semantics).
- Icons from lucide-react, never emoji. `useCallback` for handler props.
- Undo = set explicit prior state, never re-toggle.
- Every task-scheduling write that sets `scheduledFor` with a time must also set `bucket: 'timed'` (timed-bucket invariant).
- Live verification in the browser on prod data is required before any push — type-checks are not inspection.

---

### Task 1: `poolViews` lib — pool base, views, ordering, meal grouping, persistence

**Files:**
- Create: `src/lib/planning/poolViews.ts`
- Test: `src/lib/planning/poolViews.test.ts`

**Interfaces:**
- Produces (later tasks import all of these from `@/lib/planning/poolViews`):
  - `type PoolView = 'week' | 'month' | 'all'`
  - `interface PoolCtx { today: Date; rangeStart: Date | null; rangeEnd: Date | null; weekStartsOn: number }`
  - `unscheduledPool(tasks: Task[], ctx: PoolCtx): Task[]` — the base pool (extraction of `PlanningSession`'s `allUnscheduledTasks` memo, behavior-identical)
  - `applyPoolView(pool: Task[], view: PoolView, ctx: PoolCtx): Task[]`
  - `orderPool(pool: Task[], ctx: PoolCtx): Task[]`
  - `groupPool(pool: Task[]): { meals: Task[]; loose: Task[] }`
  - `isMealTask(t: Task): boolean`
  - `readPoolView(surface: string): PoolView` / `writePoolView(surface: string, v: PoolView): void`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/planning/poolViews.test.ts
import { describe, it, expect } from 'vitest'
import {
  unscheduledPool, applyPoolView, orderPool, groupPool, isMealTask,
  readPoolView, writePoolView, type PoolCtx,
} from './poolViews'
import type { Task } from '@/types/task'

// Fixture builder — RAW column-shaped values only where a Date is expected
// (feedback rule: fixtures match the DB shape the code actually sees).
let n = 0
function task(over: Partial<Task>): Task {
  n += 1
  return {
    id: `t${n}`, title: over.title ?? `Task ${n}`, completed: false,
    createdAt: new Date('2026-08-01'), updatedAt: new Date('2026-08-01'),
    ...over,
  } as Task
}

const today = new Date(2026, 7, 31) // Mon Aug 31 2026, local
const ctx: PoolCtx = {
  today,
  rangeStart: new Date(2026, 7, 31),
  rangeEnd: new Date(2026, 8, 2), // Wed Sep 2
  weekStartsOn: 0,
}

describe('unscheduledPool', () => {
  it('keeps undated, drops completed and future-deferred', () => {
    const pool = unscheduledPool([
      task({}),                                             // undated → in
      task({ completed: true }),                            // out
      task({ deferredUntil: new Date(2026, 8, 20) }),       // future defer → out
    ], ctx)
    expect(pool.map((t) => t.id)).toEqual(['t1'])
  })
  it('excludes tasks scheduled inside the visible range, resurfaces past-scheduled', () => {
    const pool = unscheduledPool([
      task({ scheduledFor: new Date(2026, 8, 1, 10) }),     // on the grid → out
      task({ scheduledFor: new Date(2026, 7, 20, 10) }),    // past → resurfaces
      task({ isAllDay: true, scheduledFor: new Date(2026, 8, 2) }), // all-day in range → out
      task({ isAllDay: true }),                             // all-day undated → in
    ], ctx)
    expect(pool.map((t) => t.id).sort()).toEqual(['t5', 't7'])
  })
})

describe('applyPoolView', () => {
  const carried = task({ scheduledFor: new Date(2026, 7, 20, 9) })
  const thisWeek = task({ bucket: 'week', weekStart: new Date(2026, 7, 30) })
  const staleWeek = task({ bucket: 'week', weekStart: new Date(2026, 7, 16) })
  const futureWeek = task({ bucket: 'week', weekStart: new Date(2026, 8, 13) })
  const monthMove = task({ bucket: 'month' })
  const inboxItem = task({ bucket: 'inbox' })
  const allDay = task({ isAllDay: true })
  const pool = [carried, thisWeek, staleWeek, futureWeek, monthMove, inboxItem, allDay]

  it("'week' = this week + stale placements + carried-over + all-day; future weeks and month/inbox stay out", () => {
    const ids = applyPoolView(pool, 'week', ctx).map((t) => t.id)
    expect(ids).toContain(carried.id)
    expect(ids).toContain(thisWeek.id)
    expect(ids).toContain(staleWeek.id)
    expect(ids).toContain(allDay.id)
    expect(ids).not.toContain(futureWeek.id)
    expect(ids).not.toContain(monthMove.id)
    expect(ids).not.toContain(inboxItem.id)
  })
  it("'month' = month bucket only", () => {
    expect(applyPoolView(pool, 'month', ctx).map((t) => t.id)).toEqual([monthMove.id])
  })
  it("'all' = everything", () => {
    expect(applyPoolView(pool, 'all', ctx)).toHaveLength(pool.length)
  })
})

describe('orderPool', () => {
  it('carried/stale first, then week bucket, then all-day, then the rest — stable', () => {
    const allDay = task({ isAllDay: true })
    const weekT = task({ bucket: 'week', weekStart: new Date(2026, 7, 30) })
    const carried = task({ scheduledFor: new Date(2026, 7, 20, 9) })
    const loose = task({ bucket: 'inbox' })
    const ordered = orderPool([allDay, weekT, carried, loose], ctx)
    expect(ordered.map((t) => t.id)).toEqual([carried.id, weekT.id, allDay.id, loose.id])
  })
})

describe('isMealTask / groupPool', () => {
  it('matches cook/dinner/meal titles, conservative on the rest', () => {
    expect(isMealTask(task({ title: 'Cook Monday dinner: Sesame tofu bowl' }))).toBe(true)
    expect(isMealTask(task({ title: 'Meal prep: hard-boil 10 eggs' }))).toBe(true)
    expect(isMealTask(task({ title: 'Sunday dinner' }))).toBe(true)
    expect(isMealTask(task({ title: 'Call VW Parkville lease turn in' }))).toBe(false)
    expect(isMealTask(task({ title: 'Wash and clean bookbags' }))).toBe(false)
  })
  it('splits meals from loose, preserving order', () => {
    const a = task({ title: 'Cook Saturday dinner' })
    const b = task({ title: 'Respond to Christian' })
    const { meals, loose } = groupPool([a, b])
    expect(meals.map((t) => t.id)).toEqual([a.id])
    expect(loose.map((t) => t.id)).toEqual([b.id])
  })
})

describe('pool view persistence', () => {
  it('round-trips per surface and defaults to week', () => {
    expect(readPoolView('overlay')).toBe('week')
    writePoolView('overlay', 'month')
    expect(readPoolView('overlay')).toBe('month')
    expect(readPoolView('weekbench')).toBe('week') // other surface untouched
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/planning/poolViews.test.ts`
Expected: FAIL — module `./poolViews` not found.

- [ ] **Step 3: Implement `poolViews.ts`**

```ts
// src/lib/planning/poolViews.ts
//
// The planning pool, decided once. Both planning surfaces (the Plan Your Time
// overlay's drawer and /week's pool lane) select, filter, order and group
// their Unscheduled pool through these pure functions — one derivation, so
// the two surfaces cannot drift (the same rule that put onShelfCount on
// PlanningSession).
import type { Task } from '@/types/task'
import { belongsToWeek, isStaleWeekPlacement } from '@/lib/today/weekPlacement'
import { weekStartAnchor } from '@/lib/cadence/config'

export type PoolView = 'week' | 'month' | 'all'

export interface PoolCtx {
  today: Date
  /** Bounds of the days visible on the grid (null = single-day/no range). */
  rangeStart: Date | null
  rangeEnd: Date | null
  weekStartsOn: number
}

/** The base pool: candidate tasks that are not placed on a visible day.
 *  Behavior-identical extraction of PlanningSession's allUnscheduledTasks. */
export function unscheduledPool(tasks: Task[], ctx: PoolCtx): Task[] {
  const today = new Date(ctx.today); today.setHours(0, 0, 0, 0)
  const rangeStart = ctx.rangeStart ? new Date(ctx.rangeStart) : null
  rangeStart?.setHours(0, 0, 0, 0)
  const rangeEnd = ctx.rangeEnd ? new Date(ctx.rangeEnd) : null
  rangeEnd?.setHours(23, 59, 59, 999)

  return tasks.filter((task) => {
    if (task.completed) return false
    if (task.deferredUntil) {
      const deferDate = new Date(task.deferredUntil); deferDate.setHours(0, 0, 0, 0)
      if (deferDate > today) return false
    }
    if (task.isAllDay) {
      if (!task.scheduledFor) return true
      const d = new Date(task.scheduledFor)
      if (rangeStart && rangeEnd && d >= rangeStart && d <= rangeEnd) return false
      return true
    }
    if (!task.scheduledFor) return true
    const taskDate = new Date(task.scheduledFor)
    if (rangeStart && rangeEnd && taskDate >= rangeStart && taskDate <= rangeEnd) return false
    const taskDay = new Date(taskDate); taskDay.setHours(0, 0, 0, 0)
    return taskDay < today
  })
}

/** The official views. 'week' is the old relevance rule; 'month' is the month
 *  bucket; 'all' absorbs the old "Show more from the backlog" toggle. */
export function applyPoolView(pool: Task[], view: PoolView, ctx: PoolCtx): Task[] {
  if (view === 'all') return pool
  if (view === 'month') return pool.filter((t) => t.bucket === 'month')
  const today = new Date(ctx.today); today.setHours(0, 0, 0, 0)
  const currentWeek = weekStartAnchor(today, ctx.weekStartsOn)
  return pool.filter((t) => {
    if (t.isAllDay) return true
    if (t.bucket === 'week') return belongsToWeek(t, currentWeek) || isStaleWeekPlacement(t, currentWeek)
    if (t.scheduledFor) {
      const d = new Date(t.scheduledFor); d.setHours(0, 0, 0, 0)
      if (d < today) return true // carried over
    }
    return false
  })
}

/** Actionability order: carried-over/stranded first (easiest to lose), then
 *  this-week moves, then all-day, then the rest. Stable within ranks. */
export function orderPool(pool: Task[], ctx: PoolCtx): Task[] {
  const today = new Date(ctx.today); today.setHours(0, 0, 0, 0)
  const rank = (t: Task): number => {
    if (!t.isAllDay && t.scheduledFor) {
      const d = new Date(t.scheduledFor); d.setHours(0, 0, 0, 0)
      if (d < today) return 0
    }
    if (t.bucket === 'week') return 1
    if (t.isAllDay) return 2
    return 3
  }
  return pool.map((t, i) => ({ t, i, r: rank(t) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.t)
}

// Conservative on purpose: a false positive buries a real task inside the
// Meals group; a false negative just leaves one cooking chore loose.
const MEAL_RE = /\b(cook|dinner|lunch|breakfast|meal|recipe)\b/i
export function isMealTask(t: Task): boolean {
  return MEAL_RE.test(t.title)
}

export function groupPool(pool: Task[]): { meals: Task[]; loose: Task[] } {
  const meals: Task[] = []
  const loose: Task[] = []
  for (const t of pool) (isMealTask(t) ? meals : loose).push(t)
  return { meals, loose }
}

// Per-surface persistence. try/catch because storage access can throw
// (private windows, blocked site data).
const KEY_PREFIX = 'symphony-pool-view:'
export function readPoolView(surface: string): PoolView {
  try {
    const v = localStorage.getItem(KEY_PREFIX + surface)
    return v === 'month' || v === 'all' ? v : 'week'
  } catch { return 'week' }
}
export function writePoolView(surface: string, v: PoolView): void {
  try { localStorage.setItem(KEY_PREFIX + surface, v) } catch { /* per-viewer convenience only */ }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/planning/poolViews.test.ts`
Expected: PASS (if the persistence test flakes on shared localStorage, clear it in a `beforeEach`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/planning/poolViews.ts src/lib/planning/poolViews.test.ts
git commit -m "feat(planning): poolViews lib — pool base, official views, ordering, meal grouping"
```

---

### Task 2: Overlay drawer — view switcher, meal group, cap, width

**Files:**
- Create: `src/components/planning/PoolViewSwitcher.tsx`
- Modify: `src/components/planning/PlanningTaskDrawer.tsx`
- Modify: `src/components/planning/PlanningSession.tsx` (pool memos + view state)
- Test: `src/components/planning/PlanningTaskDrawer.test.tsx` (new), `src/components/planning/PlanningSession.test.tsx` (existing — keep green)

**Interfaces:**
- Consumes: everything from Task 1.
- Produces: `PoolViewSwitcher({ view, onChange }: { view: PoolView; onChange: (v: PoolView) => void })` — a segmented control reused by Task 6's week lane. `PlanningTaskDrawer` gains props `{ view: PoolView; onViewChange: (v: PoolView) => void; mealTasks: Task[] }`; its old `hiddenCount/showingAll/onToggleShowAll` props are removed. `PlanningSession` gains optional prop `poolSurface?: string` (default `'overlay'`) and keeps the `shelf` path working by mapping `showingAll = view === 'all'` / `onToggleShowAll` toggles `'all' ↔ 'week'` / `hiddenCount = allUnscheduled − viewFiltered` (the parked WeekPage shelf mount must not break).

- [ ] **Step 1: Write failing drawer tests**

```tsx
// src/components/planning/PlanningTaskDrawer.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { PlanningTaskDrawer } from './PlanningTaskDrawer'
import type { Task } from '@/types/task'

function task(id: string, title: string): Task {
  return { id, title, completed: false, createdAt: new Date(), updatedAt: new Date() } as Task
}
const noop = () => {}

function renderDrawer(over: Partial<React.ComponentProps<typeof PlanningTaskDrawer>> = {}) {
  return render(
    <DndContext>
      <PlanningTaskDrawer
        tasks={[task('a', 'Call VW'), task('b', 'Wash bookbags')]}
        mealTasks={[task('m1', 'Cook Monday dinner'), task('m2', 'Sunday dinner')]}
        view="week" onViewChange={noop} onPushTask={noop}
        {...over}
      />
    </DndContext>,
  )
}

describe('PlanningTaskDrawer', () => {
  it('renders the three official views and reports a switch', () => {
    const onViewChange = vi.fn()
    renderDrawer({ onViewChange })
    fireEvent.click(screen.getByRole('button', { name: 'This month' }))
    expect(onViewChange).toHaveBeenCalledWith('month')
    expect(screen.getByRole('button', { name: 'This week' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Everything' })).toBeInTheDocument()
  })
  it('collapses meal tasks under a Meals group that expands on click', () => {
    renderDrawer()
    expect(screen.queryByText('Cook Monday dinner')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Meals · 2/ }))
    expect(screen.getByText('Cook Monday dinner')).toBeInTheDocument()
  })
  it('caps loose tasks at 15 behind an expander', () => {
    const many = Array.from({ length: 20 }, (_, i) => task(`t${i}`, `Loose ${i}`))
    renderDrawer({ tasks: many, mealTasks: [] })
    expect(screen.queryByText('Loose 16')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '5 more' }))
    expect(screen.getByText('Loose 16')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/planning/PlanningTaskDrawer.test.tsx`
Expected: FAIL — unknown props / missing switcher buttons.

- [ ] **Step 3: Implement `PoolViewSwitcher` + drawer changes**

```tsx
// src/components/planning/PoolViewSwitcher.tsx
import type { PoolView } from '@/lib/planning/poolViews'

const VIEWS: { value: PoolView; label: string }[] = [
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'all', label: 'Everything' },
]

/** The official pool views, as a segmented control. Shared by the overlay
 *  drawer and /week's pool lane so the vocabulary stays identical. */
export function PoolViewSwitcher({ view, onChange }: { view: PoolView; onChange: (v: PoolView) => void }) {
  return (
    <div role="group" aria-label="Pool view" className="flex rounded-lg bg-neutral-100 p-0.5 gap-0.5">
      {VIEWS.map(({ value, label }) => (
        <button
          key={value} type="button" onClick={() => onChange(value)}
          aria-pressed={view === value}
          className={`flex-1 px-2 py-1 text-xs font-medium rounded-md transition-colors ${
            view === value ? 'bg-white shadow-sm text-neutral-800' : 'text-neutral-500 hover:text-neutral-700'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
```

Drawer changes in `PlanningTaskDrawer.tsx`:
- Props become `{ tasks, mealTasks = [], routines = [], onPushTask, view, onViewChange }` (delete `hiddenCount/showingAll/onToggleShowAll` and their footer button).
- Width: `w-64` → `w-80` on the root div.
- Under the header, render `<PoolViewSwitcher view={view} onChange={onViewChange} />` inside a `px-3 pt-3` wrapper.
- Meal group above loose tasks (only when `mealTasks.length > 0`), using lucide `CookingPot` + `ChevronRight/ChevronDown`:

```tsx
const [mealsOpen, setMealsOpen] = useState(false)
const [showAllLoose, setShowAllLoose] = useState(false)
const POOL_CAP = 15
const visibleTasks = showAllLoose ? tasks : tasks.slice(0, POOL_CAP)
const looseOverflow = tasks.length - visibleTasks.length
// in the list body, before {tasks.map(...)} — which becomes visibleTasks.map:
{mealTasks.length > 0 && (
  <div>
    <button type="button" onClick={() => setMealsOpen((v) => !v)}
      className="w-full flex items-center gap-1.5 px-1 py-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500 hover:text-neutral-700">
      {mealsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      <CookingPot className="w-3.5 h-3.5" /> Meals · {mealTasks.length}
    </button>
    {mealsOpen && <div className="space-y-2 mt-1">{mealTasks.map((t) => (
      <PlanningTaskCard key={t.id} task={t} onPushTask={onPushTask} />
    ))}</div>}
  </div>
)}
{/* after visibleTasks.map: */}
{looseOverflow > 0 && (
  <button type="button" onClick={() => setShowAllLoose(true)}
    className="w-full text-center text-xs text-neutral-500 hover:text-neutral-700 py-2">
    {looseOverflow} more
  </button>
)}
```
- Empty state condition becomes `tasks.length === 0 && mealTasks.length === 0 && routines.length === 0`.

- [ ] **Step 4: Rewire `PlanningSession` pool memos**

In `PlanningSession.tsx`, delete the `allUnscheduledTasks` memo body, the `showAllUnscheduled` state and `relevantUnscheduled` memo; replace with:

```ts
import {
  unscheduledPool, applyPoolView, orderPool, groupPool,
  readPoolView, writePoolView, type PoolView,
} from '@/lib/planning/poolViews'
// new prop: poolSurface = 'overlay'
const [poolView, setPoolView] = useState<PoolView>(() => readPoolView(poolSurface))
const handleViewChange = useCallback((v: PoolView) => {
  setPoolView(v); writePoolView(poolSurface, v)
}, [poolSurface])

const poolCtx = useMemo(() => ({
  today: new Date(),
  rangeStart: dateRange.length ? dateRange[0] : null,
  rangeEnd: dateRange.length ? dateRange[dateRange.length - 1] : null,
  weekStartsOn: readCadenceConfig().weekStartsOn,
}), [dateRange])

const allUnscheduledTasks = useMemo(() => unscheduledPool(tasks, poolCtx), [tasks, poolCtx])
const viewFiltered = useMemo(
  () => orderPool(applyPoolView(allUnscheduledTasks, poolView, poolCtx), poolCtx),
  [allUnscheduledTasks, poolView, poolCtx],
)
const { meals: mealTasks, loose: unscheduledTasks } = useMemo(
  () => groupPool(viewFiltered), [viewFiltered],
)
```

- `onShelfCount` effect now reports `viewFiltered.length`.
- Drawer mount: `<PlanningTaskDrawer tasks={unscheduledTasks} mealTasks={mealTasks} routines={unplacedRoutines} onPushTask={onPushTask} view={poolView} onViewChange={handleViewChange} />`.
- Shelf mount (compat for the parked WeekPage): `tasks={viewFiltered}` (shelf does its own ordering/grouping), `hiddenCount={allUnscheduledTasks.length - viewFiltered.length}`, `showingAll={poolView === 'all'}`, `onToggleShowAll={() => handleViewChange(poolView === 'all' ? 'week' : 'all')}`.

- [ ] **Step 5: Run drawer + session + parity tests**

Run: `npx vitest run src/components/planning/PlanningTaskDrawer.test.tsx src/components/planning/PlanningSession.test.tsx src/components/planning/planningParity.test.ts src/components/planning/PlanningShelf.test.tsx`
Expected: PASS. If `PlanningSession.test.tsx` asserted the old "Show N more from the backlog" copy, update those assertions to the new switcher semantics (population changes are the point of this task — but placement/drop tests must pass untouched).

- [ ] **Step 6: Typecheck + commit**

```bash
npx tsc -p tsconfig.app.json --noEmit
git add -A src/components/planning src/lib/planning
git commit -m "feat(planning): official pool views + meal grouping + wider drawer"
```

---

### Task 3: Labeled Routines toggle on both surfaces

**Files:**
- Create: `src/components/planning/RoutinesToggle.tsx`
- Modify: `src/components/planning/PlanningHeader.tsx` (replace eye button)
- Modify: `src/components/home/week/WeekViewV2.tsx:356-366` (replace eye button)
- Test: `src/components/planning/PlanningHeader.test.tsx` (existing — update)

**Interfaces:**
- Produces: `RoutinesToggle({ hidden, onToggle }: { hidden: boolean; onToggle: () => void })`.
- Consumes: nothing new; both call sites already hold `hideRoutines` state synced via `hideRoutinesSignal`.

- [ ] **Step 1: Write the failing test** (add to `PlanningHeader.test.tsx`)

```tsx
it('shows a labeled Routines toggle reflecting hidden state', () => {
  const onToggle = vi.fn()
  render(<PlanningHeader dateRange={[new Date()]} onClose={noop} onAddDay={noop}
    onRemoveDay={noop} onDateChange={noop} hideRoutines={true} onToggleRoutines={onToggle} />)
  const toggle = screen.getByRole('switch', { name: 'Routines' })
  expect(toggle).toHaveAttribute('aria-checked', 'false') // hidden → off
  fireEvent.click(toggle)
  expect(onToggle).toHaveBeenCalled()
})
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/components/planning/PlanningHeader.test.tsx` → FAIL (no switch role).

- [ ] **Step 3: Implement**

```tsx
// src/components/planning/RoutinesToggle.tsx
import { Repeat } from 'lucide-react'

/** Labeled on/off control for grid routine visibility. Replaces the bare
 *  eye icon nobody could decode (aria-checked speaks VISIBILITY, so
 *  hidden=true renders as "off"). */
export function RoutinesToggle({ hidden, onToggle }: { hidden: boolean; onToggle: () => void }) {
  const on = !hidden
  return (
    <button
      type="button" role="switch" aria-checked={on} aria-label="Routines" onClick={onToggle}
      title={on ? 'Hide routines on the grid' : 'Show routines on the grid'}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
        on ? 'bg-primary-50 border-primary-200 text-primary-700'
           : 'bg-neutral-50 border-neutral-200 text-neutral-400'
      }`}
    >
      <Repeat className="w-3.5 h-3.5" />
      Routines
      <span className={`ml-0.5 w-6 h-3.5 rounded-full relative transition-colors ${on ? 'bg-primary-500' : 'bg-neutral-300'}`}>
        <span className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-all ${on ? 'right-0.5' : 'left-0.5'}`} />
      </span>
    </button>
  )
}
```

In `PlanningHeader.tsx`: replace the `onToggleRoutines && (<button …Eye…>)` block with `{onToggleRoutines && <RoutinesToggle hidden={hideRoutines} onToggle={onToggleRoutines} />}`; drop the now-unused `Eye/EyeOff` imports.
In `WeekViewV2.tsx:356-366`: replace the eye button with `<RoutinesToggle hidden={hideRoutines} onToggle={() => writeHideRoutines(!hideRoutines)} />`; drop unused `Eye/EyeOff` imports.

- [ ] **Step 4: Run tests** — `npx vitest run src/components/planning/PlanningHeader.test.tsx src/components/home/week/WeekViewV2.test.tsx` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/planning/RoutinesToggle.tsx src/components/planning/PlanningHeader.tsx src/components/planning/PlanningHeader.test.tsx src/components/home/week/WeekViewV2.tsx
git commit -m "feat(planning): labeled Routines toggle on overlay + /week"
```

---

### Task 4: Overlay mount — movable events + per-day routines

**Files:**
- Modify: `src/apps/tasks/HomeViewContainer.tsx` (the `planningOpen` mount, ~line 748)

**Interfaces:**
- Consumes: `makeCanMoveEvent` from `@/lib/planning/calendarWriteAccess` (exists), `fetchCalendarList` from `useGoogleCalendar` (the hook is already in this container for `updateEvent`), `filterRoutinesForLayers` (already imported), `getRoutinesForDate` (already in scope, line 207).
- Produces: overlay `PlanningSession` receives working `canMoveEvent` and `getRoutinesForDate`.

- [ ] **Step 1: Wire calendars + canMoveEvent** (mirror of `WeekPage.tsx:112-119`)

```tsx
// near the other state hooks:
const [calendars, setCalendars] = useState<GoogleCalendarInfo[]>([])
useEffect(() => {
  if (!planningOpen) return          // fetch roles only when the overlay opens
  let cancelled = false
  fetchCalendarList().then((cals) => { if (!cancelled) setCalendars(cals) })
  return () => { cancelled = true }
}, [planningOpen, fetchCalendarList])
const canMoveEvent = useMemo(() => makeCanMoveEvent(calendars), [calendars])
```

(If `fetchCalendarList` isn't already destructured from `useGoogleCalendar` in this container, add it to the existing destructure — do NOT add a second hook call.)

- [ ] **Step 2: Per-day routines for multi-day ranges**

The overlay mount passes only `routines={planningRoutines}` (the *viewed date's* list) — every added day reuses day 1's routines. Add:

```tsx
const planningGetRoutinesForDate = useCallback(
  (date: Date) => filterRoutinesForLayers(getRoutinesForDate(date), layers),
  [getRoutinesForDate, layers],
)
```

and pass to the overlay `PlanningSession`: `getRoutinesForDate={planningGetRoutinesForDate}` and `canMoveEvent={canMoveEvent}`.

- [ ] **Step 3: Typecheck + existing suites**

Run: `npx tsc -p tsconfig.app.json --noEmit && npx vitest run src/components/planning/PlanningSession.test.tsx`
Expected: clean.

- [ ] **Step 4: Live check** (dev server in the worktree; remember worktrees need `.env` copied or the screen is blank): open Today → Plan Your Time → add a day → confirm day 2 shows its own routines; confirm an event on a writable calendar shows the drag affordance and moves.

- [ ] **Step 5: Commit**

```bash
git add src/apps/tasks/HomeViewContainer.tsx
git commit -m "fix(planning): overlay passes canMoveEvent + per-day routines"
```

---

### Task 5: "+N" overflow — draggable rows, honest lane cap, drag affordances

**Files:**
- Modify: `src/components/planning/overlapLanes.ts` (cap parameter already exists — no change expected; verify)
- Modify: `src/components/planning/PlanningColumn.tsx` (itemInfo kinds, draggable popover rows, adaptive cap, hover affordance)
- Modify: `src/components/planning/PlanningGrid.tsx` (pass `maxLanes`)
- Test: `src/components/planning/overlapLanes.test.ts` (existing), new cases in `src/components/planning/PlanningSession.test.tsx`

**Interfaces:**
- Consumes: drag-id conventions from `PlanningSession.handleDragEnd` — bare `task.id`, `event-<id>` (`PLACED_EVENT_DRAG_PREFIX`), `placed-routine-<id>` (`PLACED_ROUTINE_DRAG_PREFIX`).
- Produces: `PlanningColumn` prop `maxLanes?: number`; popover rows draggable with those exact ids.

- [ ] **Step 1: Investigate the over-eager "+2" (systematic-debugging)**

Scott's screenshot shows ONE visible block + a "+2" chip beside empty width — `layoutLanes` should only chip when a transitive-overlap group exceeds the cap (4). Reproduce first: write a failing-or-passing unit test against `layoutLanes` with the screenshot's shape (one 7:30–14:00 event + two 10:00–10:30 items → expect 3 lanes, **zero chips**). If that passes (likely), the bug is upstream — inspect what `PlanningColumn` fed the layout in prod via the browser (React devtools on the deployed overlay): prime suspects are duplicate event ids (`eventsByDate` can hold the same Google event from two calendars — duplicate `LaneInput.id` keys collide in the `lanes` Map, mis-shaping groups) and hidden-but-fed routines. Fix at the true root; add a regression unit test for whatever shape reproduces it (e.g. `layoutLanes` must tolerate duplicate ids by deduping first — if that's the cause:

```ts
// in layoutLanes, first line:
const seen = new Set<string>()
items = items.filter((it) => (seen.has(it.id) ? false : (seen.add(it.id), true)))
```
…but only if the investigation confirms duplicates are the mechanism).

- [ ] **Step 2: Adaptive lane cap**

`PlanningColumn` gets `maxLanes?: number` (default 4) and uses it in the `layoutLanes(...)` call instead of `MAX_LANES`. `PlanningGrid` passes `maxLanes={dateRange.length <= 3 ? 6 : 4}` — wide columns can afford six before chipping.

- [ ] **Step 3: Draggable popover rows**

Extend `itemInfo` (`PlanningColumn.tsx:233-239`) to carry the drag id and payload:

```ts
// task rows:   { title, time, dragId: task.id }
// event rows:  { title, time, dragId: canMoveEvent?.(event) ? `${PLACED_EVENT_DRAG_PREFIX}${event.id}` : null }
// routine rows:{ title, time, dragId: `${PLACED_ROUTINE_DRAG_PREFIX}${routine.id}` }
```

Add a tiny row component in `PlanningColumn.tsx`:

```tsx
function OverflowRow({ dragId, title, time }: { dragId: string | null; title: string; time: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId ?? `overflow-static-${title}`, disabled: !dragId,
  })
  return (
    <div ref={setNodeRef} {...attributes} {...(dragId ? listeners : {})}
      className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-neutral-50 ${
        dragId ? 'cursor-grab active:cursor-grabbing touch-none' : ''
      } ${isDragging ? 'opacity-40' : ''}`}>
      <span className="text-sm text-neutral-800 truncate">{title}</span>
      <span className="text-[10px] text-neutral-400 shrink-0">{time}</span>
    </div>
  )
}
```

Replace the popover's plain rows with `<OverflowRow …/>`. In `PlanningSession.handleDragStart`, close any open chip popover implicitly — the popover must not swallow the drag: keep the popover mounted during drag (dnd-kit needs the source node alive at drag start; the existing `DragOverlay` carries the visual). Existing `handleDragEnd` branches handle all three id shapes with **zero changes** — that's the point of reusing the prefixes.

- [ ] **Step 4: Drag affordances on placed blocks**

In `PlanningColumn.tsx`, the placed-task wrapper and placed-routine wrapper get `cursor-grab active:cursor-grabbing` (replacing bare `cursor-pointer` where the item is draggable) plus a `group` class with an opacity-on-hover `GripVertical` (lucide, `w-3 h-3`, absolute top-right) inside `PlanningTaskCard`'s grid rendering and `PlanningRoutineBlock`. Events: only when `canMoveEvent?.(event)` is true (`PlanningEventBlock` already gates drag — give the same condition the cursor+grip).

- [ ] **Step 5: Tests + commit**

Run: `npx vitest run src/components/planning/overlapLanes.test.ts src/components/planning/PlanningSession.test.tsx`
Expected: PASS, including the new regression case from Step 1.

```bash
git add src/components/planning
git commit -m "fix(planning): draggable +N overflow rows, honest lane cap, drag affordances"
```

---

### Task 6: /week pool lane

**Files:**
- Create: `src/components/home/week/WeekPoolLane.tsx`
- Modify: `src/components/home/week/WeekViewV2.tsx` (mount inside DndContext)
- Modify: `src/components/home/week/useWeekDragDrop.ts` (chip drops set `bucket: 'timed'`, undo restores bucket)
- Test: `src/components/home/week/WeekPoolLane.test.tsx` (new), `src/components/home/week/useWeekDragDrop.test.ts` (existing — extend)

**Interfaces:**
- Consumes: Task 1's `unscheduledPool/applyPoolView/orderPool/groupPool/readPoolView/writePoolView`; Task 2's `PoolViewSwitcher`; the week drag protocol — draggable `data: { kind: 'chip', taskId }` (drops then handled by `useWeekDragDrop`'s existing chip branches with undo).
- Produces: `WeekPoolLane({ tasks, weekStart, dayCount, onSelectItem }: { tasks: Task[]; weekStart: Date; dayCount: number; onSelectItem: (id: string) => void })`.

- [ ] **Step 1: Write failing tests**

```tsx
// src/components/home/week/WeekPoolLane.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { WeekPoolLane } from './WeekPoolLane'
import type { Task } from '@/types/task'

function task(over: Partial<Task>): Task {
  return { id: over.id ?? 'x', title: over.title ?? 'T', completed: false,
    createdAt: new Date(), updatedAt: new Date(), ...over } as Task
}
const weekStart = new Date(2026, 7, 31)

describe('WeekPoolLane', () => {
  it('shows unscheduled tasks for the default week view and hides scheduled ones', () => {
    render(<DndContext><WeekPoolLane weekStart={weekStart} dayCount={5} onSelectItem={() => {}}
      tasks={[
        task({ id: 'a', title: 'Call VW', bucket: 'week', weekStart }),
        task({ id: 'b', title: 'Placed', scheduledFor: new Date(2026, 8, 1, 10) }),
      ]} /></DndContext>)
    expect(screen.getByText('Call VW')).toBeInTheDocument()
    expect(screen.queryByText('Placed')).not.toBeInTheDocument()
  })
  it('collapses to a header count and expands on click', () => {
    render(<DndContext><WeekPoolLane weekStart={weekStart} dayCount={5} onSelectItem={() => {}}
      tasks={[task({ id: 'a', title: 'Call VW', bucket: 'week', weekStart })]} /></DndContext>)
    // starts expanded; collapse hides pills but keeps the count
    fireEvent.click(screen.getByRole('button', { name: /Unscheduled · 1/ }))
    expect(screen.queryByText('Call VW')).not.toBeInTheDocument()
  })
})
```

Extend `useWeekDragDrop.test.ts`: the chip-on-timed-slot drop must now write `bucket: 'timed'` (and the allDay drop `bucket: 'timed', isAllDay: true`), and its undo must restore the task's previous `bucket`.

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/components/home/week/WeekPoolLane.test.tsx src/components/home/week/useWeekDragDrop.test.ts` → FAIL.

- [ ] **Step 3: Implement `WeekPoolLane`**

```tsx
// src/components/home/week/WeekPoolLane.tsx
//
// /week's Unscheduled pool — the same official views as the overlay drawer
// (poolViews decides; this only renders). Pills speak the week grid's chip
// protocol ({kind:'chip', taskId}), so useWeekDragDrop's existing branches
// place them with undo attached — the lane adds no drop logic of its own.
import { useMemo, useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { ChevronDown, ChevronRight, CookingPot } from 'lucide-react'
import type { Task } from '@/types/task'
import {
  unscheduledPool, applyPoolView, orderPool, groupPool,
  readPoolView, writePoolView, type PoolView,
} from '@/lib/planning/poolViews'
import { PoolViewSwitcher } from '@/components/planning/PoolViewSwitcher'
import { readCadenceConfig } from '@/lib/cadence/config'

const SURFACE = 'weekbench'

function PoolPill({ task, onSelect }: { task: Task; onSelect: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `pool:${task.id}`, data: { kind: 'chip', taskId: task.id },
  })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners}
      onClick={() => onSelect(task.id)}
      className={`inline-flex max-w-full items-center rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700 touch-none cursor-grab active:cursor-grabbing hover:shadow-sm ${isDragging ? 'opacity-40' : ''}`}>
      <span className="min-w-0 break-words">{task.title}</span>
    </div>
  )
}

export function WeekPoolLane({ tasks, weekStart, dayCount, onSelectItem }: {
  tasks: Task[]; weekStart: Date; dayCount: number; onSelectItem: (id: string) => void
}) {
  const [view, setView] = useState<PoolView>(() => readPoolView(SURFACE))
  const [open, setOpen] = useState(true)
  const [mealsOpen, setMealsOpen] = useState(false)

  const pool = useMemo(() => {
    const rangeEnd = new Date(weekStart); rangeEnd.setDate(rangeEnd.getDate() + dayCount - 1)
    const ctx = { today: new Date(), rangeStart: weekStart, rangeEnd, weekStartsOn: readCadenceConfig().weekStartsOn }
    return groupPool(orderPool(applyPoolView(unscheduledPool(tasks, ctx), view, ctx), ctx))
  }, [tasks, weekStart, dayCount, view])

  const total = pool.meals.length + pool.loose.length
  return (
    <div className="mb-2 rounded-xl border border-neutral-200 bg-neutral-50/70 px-3 py-2">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 text-xs font-semibold tracking-wide uppercase text-neutral-500 hover:text-neutral-700">
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          Unscheduled · {total}
        </button>
        <div className="ml-auto w-64">
          <PoolViewSwitcher view={view} onChange={(v) => { setView(v); writePoolView(SURFACE, v) }} />
        </div>
      </div>
      {open && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {pool.meals.length > 0 && (
            <button type="button" onClick={() => setMealsOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-100 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-200">
              <CookingPot className="w-3.5 h-3.5" /> Meals · {pool.meals.length}
            </button>
          )}
          {mealsOpen && pool.meals.map((t) => <PoolPill key={t.id} task={t} onSelect={onSelectItem} />)}
          {pool.loose.map((t) => <PoolPill key={t.id} task={t} onSelect={onSelectItem} />)}
          {total === 0 && <span className="text-sm text-neutral-400">Everything is placed.</span>}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Bucket invariant in `useWeekDragDrop`**

In the chip-on-timed branch (`useWeekDragDrop.ts:96-115`): add `bucket: 'timed'` to the write; capture `const prevBucket = task?.bucket` and add `bucket: prevBucket` to the undo write. Same for the chip path of the allDay branch (`bucket: 'timed'`, undo restores). Do NOT touch the `block:` branches (already-placed items are already `timed`).

- [ ] **Step 5: Mount in `WeekViewV2`**

Inside the `<DndContext …>` (must be inside — the pills call `useDraggable`), directly above `<WeekGrid …>`:

```tsx
<WeekPoolLane tasks={tasks} weekStart={weekStart} dayCount={dayCount} onSelectItem={onSelectItem} />
```

- [ ] **Step 6: Run tests, typecheck, live check**

Run: `npx vitest run src/components/home/week/ && npx tsc -p tsconfig.app.json --noEmit`
Expected: PASS. Live: open /week, confirm the lane renders, a pill drags onto a slot, lands timed with undo toast, and disappears from the lane.

- [ ] **Step 7: Commit**

```bash
git add src/components/home/week src/components/planning/PoolViewSwitcher.tsx
git commit -m "feat(week): Unscheduled pool lane with official views on /week"
```

---

### Task 7: Domain picker on drop (both surfaces)

**Files:**
- Create: `src/components/triage/ContextMenuPanel.tsx` (extraction), `src/components/planning/PlacedContextPrompt.tsx`
- Modify: `src/components/triage/ContextPicker.tsx` (consume the extraction), `src/components/planning/PlanningSession.tsx`, `src/components/home/week/useWeekDragDrop.ts` (+ `WeekViewV2.tsx`)
- Test: `src/components/planning/PlacedContextPrompt.test.tsx` (new)

**Interfaces:**
- Produces: `ContextMenuPanel({ value, onSelect }: { value?: TaskContext | null; onSelect: (ctx: TaskContext | undefined) => void })` — the Work/Family/Personal list, extracted verbatim from `ContextPicker`'s menu body (colors, Clear row) so the pickers cannot drift. `PlacedContextPrompt({ position, onPick, onDismiss }: { position: { left: number; top: number }; onPick: (ctx: TaskContext) => void; onDismiss: () => void })` — portal, fixed-position, closes on outside click/Escape. `useWeekDragDrop` gains optional arg `onChipPlaced?: (taskId: string, position: { left: number; top: number } | null) => void`.
- Consumes: `onUpdateTask(taskId, { context })` — `updateTask` already derives `scope` via `scopeForDomain` whenever `context` is in the updates (`useSupabaseTasks.ts:1110-1127`), so privacy (work/personal = owner-only) needs nothing extra here.

- [ ] **Step 1: Write failing test**

```tsx
// src/components/planning/PlacedContextPrompt.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PlacedContextPrompt } from './PlacedContextPrompt'

describe('PlacedContextPrompt', () => {
  it('offers the three domains and reports the pick', () => {
    const onPick = vi.fn(); const onDismiss = vi.fn()
    render(<PlacedContextPrompt position={{ left: 100, top: 100 }} onPick={onPick} onDismiss={onDismiss} />)
    expect(screen.getByText('Which area is this?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Family/ }))
    expect(onPick).toHaveBeenCalledWith('family')
  })
  it('dismisses on Escape without picking', () => {
    const onPick = vi.fn(); const onDismiss = vi.fn()
    render(<PlacedContextPrompt position={{ left: 0, top: 0 }} onPick={onPick} onDismiss={onDismiss} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onDismiss).toHaveBeenCalled()
    expect(onPick).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify failure** — module not found.

- [ ] **Step 3: Extract `ContextMenuPanel`, build the prompt**

`ContextMenuPanel`: move `CONTEXTS` and the `<div className="space-y-1">…` menu body out of `ContextPicker.tsx` into the new file; `ContextPicker` renders `<ContextMenuPanel value={value} onSelect={handleSelect} />` inside its positioned portal div (behavior identical — its tests must stay green).

```tsx
// src/components/planning/PlacedContextPrompt.tsx
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { TaskContext } from '@/types/task'
import { ContextMenuPanel } from '@/components/triage/ContextMenuPanel'

/** After a context-less task lands on a grid: the same Work/Family/Personal
 *  menu used everywhere else, anchored at the drop. Dismiss = stays placed,
 *  stays untagged — exactly like skipping triage. */
export function PlacedContextPrompt({ position, onPick, onDismiss }: {
  position: { left: number; top: number }
  onPick: (ctx: TaskContext) => void
  onDismiss: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onDismiss() }
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onDismiss()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown) }
  }, [onDismiss])
  // Clamp so a drop near the right/bottom edge doesn't push the menu offscreen.
  const left = Math.min(position.left, window.innerWidth - 180)
  const top = Math.min(position.top, window.innerHeight - 220)
  return createPortal(
    <div ref={ref} style={{ left, top }}
      className="fixed z-[9999] bg-white rounded-xl border border-neutral-200 shadow-lg p-2 min-w-[150px] animate-fade-in-up">
      <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Which area is this?</p>
      <ContextMenuPanel value={null} onSelect={(ctx) => { if (ctx) onPick(ctx) }} />
    </div>,
    document.body,
  )
}
```

- [ ] **Step 4: Wire into `PlanningSession`**

State `const [contextPrompt, setContextPrompt] = useState<{ taskId: string; position: { left: number; top: number } } | null>(null)`. In `handleDragEnd`, in BOTH the `allday-` branch and the `slot-` task branch, after the `onUpdateTask` write:

```ts
const dropped = tasks.find((t) => t.id === activeId)
if (dropped && !dropped.context) {
  const r = active.rect.current.translated
  setContextPrompt({ taskId: activeId, position: r ? { left: r.left, top: r.top + r.height } : { left: window.innerWidth / 2, top: 120 } })
}
```

Render near the drop-notice block:

```tsx
{contextPrompt && (
  <PlacedContextPrompt position={contextPrompt.position}
    onPick={(ctx) => { onUpdateTask(contextPrompt.taskId, { context: ctx }); setContextPrompt(null) }}
    onDismiss={() => setContextPrompt(null)} />
)}
```

- [ ] **Step 5: Wire into /week**

`useWeekDragDrop`: after each successful **chip** write (timed and allDay branches), call `args.onChipPlaced?.(taskId, e.active.rect.current?.translated ? { left: r.left, top: r.top + r.height } : null)`. `WeekViewV2` keeps the same `contextPrompt` state pattern, passes `onChipPlaced` that checks `tasks.find(t => t.id === taskId)?.context` and opens the prompt; `onPick` calls `onUpdateTask(taskId, { context: ctx })`.

- [ ] **Step 6: Tests + commit**

Run: `npx vitest run src/components/planning/PlacedContextPrompt.test.tsx src/components/triage/ContextPicker.test.tsx src/components/home/week/useWeekDragDrop.test.ts src/components/planning/PlanningSession.test.tsx`
Expected: PASS.

```bash
git add src/components/triage src/components/planning src/components/home/week
git commit -m "feat(planning): domain picker opens after placing a context-less task"
```

---

### Task 8: `dropSmarts` — suggested open slots during drag

**Files:**
- Create: `src/lib/planning/dropSmarts.ts`
- Test: `src/lib/planning/dropSmarts.test.ts`
- Modify: `src/components/planning/PlanningSession.tsx`, `PlanningGrid.tsx`, `PlanningColumn.tsx`, `PlanningTimeSlot.tsx` (paint); `src/components/home/week/WeekViewV2.tsx`, `WeekGrid.tsx` (paint)

**Interfaces:**
- Produces:
  - `interface SlotSuggestion { dateKey: string; hour: number; minute: number }`
  - `interface BusyInterval { startMinutes: number; endMinutes: number }` (minutes from midnight)
  - `taskWindow(title: string): { startHour: number; endHour: number }` — call-ish → 9–17; cook/meal-ish → 15–18; errand-ish → 9–18; default → grid bounds
  - `suggestSlots(task: Pick<Task, 'title' | 'estimatedDuration'>, busyByDate: Map<string, BusyInterval[]>, opts: { dates: Date[]; dayStartHour: number; dayEndHour: number; slotMinutes: number; now: Date; max?: number }): SlotSuggestion[]` (default max 3; never suggests a slot in the past or colliding with a busy interval; earliest-first)
  - `busyIntervals(args: { tasks: Task[]; events: { start: Date; end: Date }[]; routineStarts: Date[] }): BusyInterval[]`
- Consumes: nothing outside `@/types/task`.

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/planning/dropSmarts.test.ts
import { describe, it, expect } from 'vitest'
import { suggestSlots, taskWindow, type BusyInterval } from './dropSmarts'

const monday = new Date(2026, 7, 31)
const opts = { dates: [monday], dayStartHour: 6, dayEndHour: 22, slotMinutes: 30, now: new Date(2026, 7, 31, 8, 0), max: 3 }
const key = '2026-08-31'

describe('taskWindow', () => {
  it('calls in business hours, cooking pre-dinner, default = full grid', () => {
    expect(taskWindow('Call VW Parkville lease turn in')).toEqual({ startHour: 9, endHour: 17 })
    expect(taskWindow('Cook Monday dinner: Sesame tofu bowl')).toEqual({ startHour: 15, endHour: 18 })
    expect(taskWindow('transfer plants')).toEqual({ startHour: 6, endHour: 22 })
  })
})

describe('suggestSlots', () => {
  it('suggests up to 3 open slots inside the window, skipping collisions and the past', () => {
    const busy = new Map<string, BusyInterval[]>([[key, [{ startMinutes: 9 * 60, endMinutes: 10 * 60 }]]])
    const out = suggestSlots({ title: 'Call the dentist' }, busy, opts)
    expect(out).toHaveLength(3)
    expect(out[0]).toEqual({ dateKey: key, hour: 10, minute: 0 }) // 9:00 busy → first open 10:00
    for (const s of out) expect(s.hour).toBeGreaterThanOrEqual(9)
  })
  it('never suggests before now', () => {
    const out = suggestSlots({ title: 'transfer plants' }, new Map(), { ...opts, now: new Date(2026, 7, 31, 19, 45) })
    expect(out[0].hour).toBeGreaterThanOrEqual(20)
  })
  it('respects estimatedDuration when checking fit', () => {
    // 10:00–10:30 busy; a 60-min task starting 9:30 would collide → 9:00 ok? no (9:00+60 crosses nothing before 10:00? 9:00–10:00 is exactly open) 
    const busy = new Map<string, BusyInterval[]>([[key, [{ startMinutes: 10 * 60, endMinutes: 10 * 60 + 30 }]]])
    const out = suggestSlots({ title: 'Call bank', estimatedDuration: 60 }, busy, opts)
    expect(out[0]).toEqual({ dateKey: key, hour: 9, minute: 0 })
    expect(out.some((s) => s.hour === 9 && s.minute === 30)).toBe(false) // 9:30+60 collides
  })
})
```

- [ ] **Step 2: Run to verify failure** — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/planning/dropSmarts.ts
//
// Rules-first drop help. Pure functions — a later AI tagging pass can replace
// taskWindow's keyword heuristics without touching any grid component.
import type { Task } from '@/types/task'

export interface SlotSuggestion { dateKey: string; hour: number; minute: number }
export interface BusyInterval { startMinutes: number; endMinutes: number }

const CALL_RE = /\b(call|phone|dial|schedule .*appointment)\b/i
const MEAL_RE = /\b(cook|dinner|lunch|breakfast|meal|recipe|dough|marinate)\b/i
const ERRAND_RE = /\b(buy|pick ?up|drop ?off|return|order|store|pharmacy|cvs)\b/i

export function taskWindow(title: string): { startHour: number; endHour: number } {
  if (CALL_RE.test(title)) return { startHour: 9, endHour: 17 }
  if (MEAL_RE.test(title)) return { startHour: 15, endHour: 18 }
  if (ERRAND_RE.test(title)) return { startHour: 9, endHour: 18 }
  return { startHour: 6, endHour: 22 }
}

export function busyIntervals(args: {
  tasks: Task[]
  events: { start: Date; end: Date }[]
  routineStarts: Date[]
}): BusyInterval[] {
  const out: BusyInterval[] = []
  for (const t of args.tasks) {
    if (!t.scheduledFor || t.isAllDay) continue
    const start = new Date(t.scheduledFor)
    const m = start.getHours() * 60 + start.getMinutes()
    out.push({ startMinutes: m, endMinutes: m + (t.estimatedDuration || 30) })
  }
  for (const e of args.events) {
    out.push({
      startMinutes: e.start.getHours() * 60 + e.start.getMinutes(),
      endMinutes: e.end.getHours() * 60 + e.end.getMinutes(),
    })
  }
  for (const r of args.routineStarts) {
    const m = r.getHours() * 60 + r.getMinutes()
    out.push({ startMinutes: m, endMinutes: m + 30 })
  }
  return out
}

export function suggestSlots(
  task: Pick<Task, 'title' | 'estimatedDuration'>,
  busyByDate: Map<string, BusyInterval[]>,
  opts: { dates: Date[]; dayStartHour: number; dayEndHour: number; slotMinutes: number; now: Date; max?: number },
): SlotSuggestion[] {
  const max = opts.max ?? 3
  const dur = task.estimatedDuration || 30
  const win = taskWindow(task.title)
  const startHour = Math.max(win.startHour, opts.dayStartHour)
  const endHour = Math.min(win.endHour, opts.dayEndHour)
  const out: SlotSuggestion[] = []

  for (const date of opts.dates) {
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    const busy = busyByDate.get(dateKey) ?? []
    const isToday = date.toDateString() === opts.now.toDateString()
    const nowMinutes = opts.now.getHours() * 60 + opts.now.getMinutes()
    for (let m = startHour * 60; m + dur <= endHour * 60; m += opts.slotMinutes) {
      if (isToday && m < nowMinutes) continue
      if (date < opts.now && !isToday) continue // past day
      const collides = busy.some((b) => m < b.endMinutes && m + dur > b.startMinutes)
      if (collides) continue
      out.push({ dateKey, hour: Math.floor(m / 60), minute: m % 60 })
      if (out.length >= max) return out
    }
  }
  return out
}
```

- [ ] **Step 4: Run lib tests** — `npx vitest run src/lib/planning/dropSmarts.test.ts` → PASS.

- [ ] **Step 5: Paint on the overlay**

`PlanningSession`: when `activeTask` is set (a TASK drag — not routines/events), compute:

```ts
const suggestedSlots = useMemo(() => {
  if (!activeTask || dayGrain) return null
  const busyByDate = new Map<string, BusyInterval[]>()
  for (const date of dateRange) {
    const dateKey = formatDateKey(date)
    busyByDate.set(dateKey, busyIntervals({
      tasks: scheduledTasksByDate.get(dateKey) ?? [],
      events: (eventsByDate.get(dateKey) ?? []).map((e) => ({
        start: new Date(e.start_time || e.startTime!),
        end: new Date(e.end_time || e.endTime || e.start_time || e.startTime!),
      })),
      routineStarts: (routinesByDate.get(dateKey) ?? [])
        .map((r) => resolveRoutineTime(r, routineInstancesByDate.get(dateKey)?.get(r.id), date))
        .filter((d): d is Date => d !== null),
    }))
  }
  const list = suggestSlots(activeTask, busyByDate, {
    dates: dateRange, dayStartHour: DAY_START_HOUR, dayEndHour: DAY_END_HOUR,
    slotMinutes: SLOT_DURATION, now: new Date(),
  })
  return new Set(list.map((s) => `slot-${s.dateKey}-${s.hour}-${s.minute}`))
}, [activeTask, dayGrain, dateRange, scheduledTasksByDate, eventsByDate, routinesByDate, routineInstancesByDate])
```

Thread `suggestedSlots: Set<string> | null` through `PlanningGrid` → `PlanningColumn` → `PlanningTimeSlot` (`suggested={suggestedSlots?.has(slotId) ?? false}`). In `PlanningTimeSlot`, when `suggested && !isOver` add `bg-primary-50/80 ring-1 ring-inset ring-primary-200` — paint only; drops land anywhere as before.

- [ ] **Step 6: Paint on /week**

`WeekGrid` gains `suggestedSlotIds?: Set<string>`; `SubSlot` tints (same classes) when its `id` is in the set. `WeekViewV2` computes suggestions only while `drag.activeDragId?.startsWith('pool:')` (a pool-pill drag), building `busyByDate` from `allItems`' start/end and formatting ids as `slot:${dayIso}:${pad(hour)}:${pad(minute)}` — note `suggestSlots` returns 30-min steps; /week sub-slots are 15-min, so mark the `minute` slot returned (0 or 30 both exist as sub-slots).

- [ ] **Step 7: Full run + commit**

Run: `npx vitest run src/lib/planning src/components/planning src/components/home/week && npx tsc -p tsconfig.app.json --noEmit`
Expected: PASS.

```bash
git add src/lib/planning src/components/planning src/components/home/week
git commit -m "feat(planning): suggested open slots while dragging (rules-based)"
```

---

### Task 9: /week routine blocks become draggable (one-day override)

**Files:**
- Modify: `src/components/home/week/WeekEventBlock.tsx` (remove routine drag disable), `src/components/home/week/useWeekDragDrop.ts` (route routine drops), `src/components/home/week/WeekViewV2.tsx` (prop), `src/components/home/HomeView.tsx` (pass through), `src/apps/tasks/HomeViewContainer.tsx` / ScheduleActions context (expose `onPushRoutine` if not already in the context value)
- Test: `src/components/home/week/useWeekDragDrop.test.ts`

**Interfaces:**
- Consumes: `scheduleActions.onPushRoutine(routineId: string, when: Date)` — the same one-day-override writer the overlay mount uses (`HomeViewContainer.tsx:775-777`). Time grain: NEVER rewrite `recurrence_pattern` from a /week drag.
- Produces: `useWeekDragDrop` arg `onPushRoutine?: (routineId: string, when: Date) => void`; `WeekViewV2` prop of the same name.

- [ ] **Step 1: Failing test** — extend `useWeekDragDrop.test.ts`: a drop of `{ kind: 'block', itemId: 'routine-r1-day2' }` on `{ kind: 'timed', dayIso: '2026-09-01', hour: 9, minute: 0 }` calls `onPushRoutine('r1', new Date(2026, 8, 1, 9, 0))` and does NOT call `onUpdateRoutine`.

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement** — in `useWeekDragDrop`'s `block` branch, before the task/event routing:

```ts
if (itemId.startsWith('routine-')) {
  // Strip the '-dayN' render suffix to recover the DB id (same rule as
  // WeekViewV2.handleSelectBlock). One-day override, never a rule rewrite —
  // one drag must not move every future occurrence.
  const routineId = itemId.slice('routine-'.length).replace(/-day\d+$/, '')
  args.onPushRoutine?.(routineId, newStart)
  return
}
```

In `WeekEventBlock.tsx`: find the guard that disables dragging for routine items and remove it (routines drag with their existing `block-routine:` id → normalize: `useWeekDragDrop.onDragEnd` reads `activeData.itemId`, which for routines is the item id `routine-<id>-dayN` — confirm the data payload carries `kind: 'block'`; if routines currently attach no drag data, give them `data: { kind: 'block', itemId: item.id }` same as tasks/events). In `WeekViewV2`: accept and forward `onPushRoutine` into `useWeekDragDrop(...)`. In `HomeView`: pass `onPushRoutine={ctx.onPushRoutine}`; if `ScheduleActionsProvider`'s value doesn't currently include `onPushRoutine`, add it in `HomeViewContainer`'s `scheduleActionsValue` from `scheduleActions.onPushRoutine`.

- [ ] **Step 4: Run + commit**

Run: `npx vitest run src/components/home/week/useWeekDragDrop.test.ts src/components/home/week/WeekViewV2.test.tsx && npx tsc -p tsconfig.app.json --noEmit`

```bash
git add src/components/home src/apps/tasks/HomeViewContainer.tsx
git commit -m "feat(week): routine blocks draggable — one-day override, never a rule rewrite"
```

---

### Task 10: Full verification + staged pushes

**Files:** none new.

- [ ] **Step 1: Full unit suite + typecheck**

Run: `npx vitest run && npx tsc -p tsconfig.app.json --noEmit`
Expected: green (memory: a red suite may be a wall-clock date rot — check `tend` tests against today's date before assuming a real break; pre-push may also trip on `connectors/` — `npm install` inside it if so).

- [ ] **Step 2: Live verification on prod data** (dev server in the worktree, browser):
  1. Overlay: open Plan Your Time → default "This week" view shows a short, ordered pool with "Meals · N" collapsed; switch to Everything → full pool; drawer is wider; toggle Routines on → routine blocks appear on every visible day.
  2. Drag: placed task/routine/event blocks show grab affordance and move; a "+N" chip's popover rows drag out onto slots; no chip appears beside empty column width.
  3. Drop smarts: dragging a "Call …" task tints open business-hour slots; dropping a context-less task opens the Work/Family/Personal prompt; picking Family sets the amber tag (verify in the task panel); Escape leaves it untagged.
  4. /week: pool lane renders with the switcher; pill → slot drop lands timed with undo; routine block drag moves ONE day only (check next week unchanged); suggested slots tint during pill drag.
  5. Privacy spot-check: place a task, tag it "personal", confirm on a second account (or via Iris's view if available) it is NOT visible — this exercises the derived scope path end-to-end.

- [ ] **Step 3: Staged pushes to main** (each auto-deploys; verify the deploy after each — `gh api repos/:owner/:repo/deployments` per the webhook-miss memory, then spot-check app.symphony-os.com):

```bash
# 1. Pool views (Tasks 1–2) … 2. Grid fixes (Tasks 3–5) … 3. /week + smarts (Tasks 6–9)
git fetch origin && git rebase origin/main && git push origin HEAD:main
```

(If work lands faster as one verified push, that's fine — the stages exist so a problem found live never strands more than its own slice.)

- [ ] **Step 4: Cleanup + memory**

Remove the worktree after merge (`git worktree remove .worktrees/planning-spruce`). Update memory: new file for the planning spruce-up (pool views vocabulary, WeekPoolLane, dropSmarts, PlacedContextPrompt, the +N root cause found in Task 5), and amend `week_bench_day_scoped_fetch_bug` / MEMORY.md pointers.
