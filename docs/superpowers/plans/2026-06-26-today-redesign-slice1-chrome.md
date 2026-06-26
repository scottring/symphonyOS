# Today Redesign — Slice 1 (Chrome) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the live Today page visually close to the approved mockup without touching the timeline internals — revised stats row, new Routines & Habits overview panel (with quick mark-done), a Focus Today row (fallback selection), and masthead centering.

**Architecture:** Pure helpers in `src/lib/today/` (unit-tested), thin presentational components in `src/components/schedule/`, wired into `TodayView` which stays the composition root. No data-fetching changes. The Routines & Habits panel reuses TodayView's existing `onCompleteRoutine` handler and the computed routine status map, so completion state is shared with the timeline.

**Tech Stack:** React 19 + TypeScript (strict), Tailwind v4 (Nordic Journal), Vitest + React Testing Library, lucide-react icons.

## Global Constraints

- No emojis in UI — use `lucide-react` icons (project standing rule).
- `@/` path alias for `src/` imports.
- Handlers passed as props use `useCallback` at the source (HomeView already does).
- Routine completion goes through the existing `onCompleteRoutine(routineId, completed)` prop — never a parallel mechanism.
- Tests: `npx vitest run <file>` for one-shot (plain `npm test` is watch mode).
- Run `npm run build` before any push to `main` (Vercel runs `tsc -b`, stricter than the pre-push `tsc --noEmit`). This branch stays a preview; only merge when the slice is approved.
- Desktop-first (matches the mockup); keep mobile non-broken.

## Reference signatures (from current code)

- `TimelineItem` — `src/types/timeline.ts:21`; `type: 'task'|'event'|'routine'|'routine-collection'`, `startTime: Date|null`, `title`, `completed`, `originalRoutine?: Routine`.
- `Routine` — has `id`, `name`, `time_of_day?: string` (e.g. `"07:00:00"`), `recurrence_pattern`.
- `TodayViewProps` (`TodayView.tsx:64`) already includes: `routines?: Routine[]`, `onCompleteRoutine?: (routineId, completed) => void`, `viewedDate`, `onOpenPlanToday`, and computes `data` via `computeTodayData` (exposes `data.counts.actionableCount`, `data.counts.completedCount`, `data.weekTasks`, `data.isToday`). `useEmailActionItems()` → `{ items }`, `activeEmailCount = items.filter(i => i.status==='new').length`.
- Routine status map: `src/lib/today/statusMaps.ts` — `routineStatusMap.get(routineId)?.status === 'completed'`.
- `StatsRow` — `src/components/schedule/StatsRow.tsx`, currently composes trigger nodes + `endControls`.

---

### Task 1: `routinesByPartOfDay` helper

**Files:**
- Create: `src/lib/today/routinesByPartOfDay.ts`
- Test: `src/lib/today/routinesByPartOfDay.test.ts`

**Interfaces:**
- Produces: `type PartOfDay = 'morning' | 'afternoon' | 'evening'`; `routinesByPartOfDay(routines: Routine[]): Record<PartOfDay, Routine[]>`. Boundaries: hour < 12 → morning; 12–16 → afternoon; ≥ 17 → evening. A routine with no `time_of_day` → morning. Order within a part: by `time_of_day` ascending, nulls last.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { routinesByPartOfDay } from './routinesByPartOfDay'
import type { Routine } from '@/types/routine'

const r = (id: string, time_of_day: string | null): Routine =>
  ({ id, name: id, time_of_day, recurrence_pattern: { type: 'daily' }, is_active: true } as unknown as Routine)

describe('routinesByPartOfDay', () => {
  it('buckets by hour boundaries (morning<12, afternoon 12-16, evening>=17)', () => {
    const out = routinesByPartOfDay([r('a', '07:00:00'), r('b', '13:30:00'), r('c', '18:00:00')])
    expect(out.morning.map(x => x.id)).toEqual(['a'])
    expect(out.afternoon.map(x => x.id)).toEqual(['b'])
    expect(out.evening.map(x => x.id)).toEqual(['c'])
  })
  it('places untimed routines in morning and sorts timed ascending', () => {
    const out = routinesByPartOfDay([r('late', '09:30:00'), r('none', null), r('early', '06:00:00')])
    expect(out.morning.map(x => x.id)).toEqual(['early', 'late', 'none'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/today/routinesByPartOfDay.test.ts`
Expected: FAIL — `routinesByPartOfDay` is not defined.

- [ ] **Step 3: Write minimal implementation**

```typescript
import type { Routine } from '@/types/routine'

export type PartOfDay = 'morning' | 'afternoon' | 'evening'

function hourOf(time_of_day?: string | null): number | null {
  if (!time_of_day) return null
  const h = parseInt(time_of_day.slice(0, 2), 10)
  return Number.isFinite(h) ? h : null
}

function partFor(hour: number | null): PartOfDay {
  if (hour === null) return 'morning'
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}

export function routinesByPartOfDay(routines: Routine[]): Record<PartOfDay, Routine[]> {
  const out: Record<PartOfDay, Routine[]> = { morning: [], afternoon: [], evening: [] }
  for (const r of routines) out[partFor(hourOf(r.time_of_day))].push(r)
  const byTime = (a: Routine, b: Routine) =>
    (a.time_of_day ?? '99').localeCompare(b.time_of_day ?? '99')
  for (const k of Object.keys(out) as PartOfDay[]) out[k].sort(byTime)
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/today/routinesByPartOfDay.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/today/routinesByPartOfDay.ts src/lib/today/routinesByPartOfDay.test.ts
git commit -m "feat(today): routinesByPartOfDay helper"
```

---

### Task 2: `RoutinesHabitsPanel` component (with quick mark-done)

**Files:**
- Create: `src/components/schedule/RoutinesHabitsPanel.tsx`
- Test: `src/components/schedule/RoutinesHabitsPanel.test.tsx`

**Interfaces:**
- Consumes: `routinesByPartOfDay` (Task 1); `Routine`.
- Produces:
```typescript
interface RoutinesHabitsPanelProps {
  routines: Routine[]
  isCompleted: (routineId: string) => boolean
  onToggle: (routineId: string, completed: boolean) => void  // wires to onCompleteRoutine
  defaultCollapsed?: boolean
}
```
Renders three columns (Morning/Afternoon/Evening) with `daySectionMeta`-style icons + a "N scheduled" count; each routine row shows name + a checkbox button that calls `onToggle(id, !isCompleted(id))`; completed rows show a checked state. A header "ROUTINES & HABITS" with a Collapse toggle (lucide `ChevronUp`/`ChevronDown`). No emojis.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RoutinesHabitsPanel } from './RoutinesHabitsPanel'
import type { Routine } from '@/types/routine'

const r = (id: string, time: string): Routine =>
  ({ id, name: id, time_of_day: time, recurrence_pattern: { type: 'daily' }, is_active: true } as unknown as Routine)

describe('RoutinesHabitsPanel', () => {
  const routines = [r('Stretch', '07:00:00'), r('Walk', '13:00:00'), r('WindDown', '21:00:00')]

  it('renders three part-of-day columns with the routines', () => {
    render(<RoutinesHabitsPanel routines={routines} isCompleted={() => false} onToggle={() => {}} />)
    expect(screen.getByText('Morning')).toBeInTheDocument()
    expect(screen.getByText('Afternoon')).toBeInTheDocument()
    expect(screen.getByText('Evening')).toBeInTheDocument()
    expect(screen.getByText('Stretch')).toBeInTheDocument()
  })

  it('calls onToggle with the inverse of current completion when a routine is checked', () => {
    const onToggle = vi.fn()
    render(<RoutinesHabitsPanel routines={routines} isCompleted={(id) => id === 'Stretch'} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button', { name: /mark stretch/i }))
    expect(onToggle).toHaveBeenCalledWith('Stretch', false)
    fireEvent.click(screen.getByRole('button', { name: /mark walk/i }))
    expect(onToggle).toHaveBeenCalledWith('Walk', true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/schedule/RoutinesHabitsPanel.test.tsx`
Expected: FAIL — cannot find `RoutinesHabitsPanel`.

- [ ] **Step 3: Write minimal implementation**

```tsx
import { useState } from 'react'
import { Sunrise, Sun, Moon, Check, Circle, ChevronUp, ChevronDown } from 'lucide-react'
import type { Routine } from '@/types/routine'
import { routinesByPartOfDay, type PartOfDay } from '@/lib/today/routinesByPartOfDay'

interface RoutinesHabitsPanelProps {
  routines: Routine[]
  isCompleted: (routineId: string) => boolean
  onToggle: (routineId: string, completed: boolean) => void
  defaultCollapsed?: boolean
}

const COLS: { part: PartOfDay; label: string; Icon: typeof Sunrise }[] = [
  { part: 'morning', label: 'Morning', Icon: Sunrise },
  { part: 'afternoon', label: 'Afternoon', Icon: Sun },
  { part: 'evening', label: 'Evening', Icon: Moon },
]

export function RoutinesHabitsPanel({ routines, isCompleted, onToggle, defaultCollapsed = false }: RoutinesHabitsPanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const grouped = routinesByPartOfDay(routines)

  return (
    <section className="card mt-6 p-4">
      <header className="flex items-center justify-between mb-3">
        <span className="text-[12px] font-medium tracking-wide text-neutral-500">ROUTINES &amp; HABITS</span>
        <button type="button" onClick={() => setCollapsed((c) => !c)}
          className="inline-flex items-center gap-1 text-[13px] text-neutral-500 hover:text-neutral-700">
          {collapsed ? 'Expand' : 'Collapse'}
          {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </header>
      {!collapsed && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {COLS.map(({ part, label, Icon }) => (
            <div key={part}>
              <div className="flex items-center gap-1.5 mb-1 text-neutral-700">
                <Icon className="w-4 h-4 text-neutral-500" />
                <span className="text-[13px] font-medium">{label}</span>
              </div>
              <div className="text-[12px] text-neutral-400 mb-2">{grouped[part].length} scheduled</div>
              <ul className="space-y-1">
                {grouped[part].map((r) => {
                  const done = isCompleted(r.id)
                  return (
                    <li key={r.id} className="flex items-center gap-2">
                      <button type="button" aria-label={`Mark ${r.name} ${done ? 'not done' : 'done'}`}
                        onClick={() => onToggle(r.id, !done)} className="shrink-0">
                        {done ? <Check className="w-4 h-4 text-primary-600" /> : <Circle className="w-4 h-4 text-neutral-300" />}
                      </button>
                      <span className={`text-[14px] ${done ? 'line-through text-neutral-400' : 'text-neutral-700'}`}>{r.name}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/schedule/RoutinesHabitsPanel.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/RoutinesHabitsPanel.tsx src/components/schedule/RoutinesHabitsPanel.test.tsx
git commit -m "feat(today): RoutinesHabitsPanel with quick mark-done"
```

---

### Task 3: Wire `RoutinesHabitsPanel` into `TodayView`

**Files:**
- Modify: `src/components/schedule/TodayView.tsx` (render the panel below the timeline; build `isCompleted` from the routine status map and `onToggle` from the existing `onCompleteRoutine`).

**Interfaces:**
- Consumes: `RoutinesHabitsPanel` (Task 2). Uses existing props `routines`, `onCompleteRoutine`, and the routine status map already computed in `data`.

- [ ] **Step 1: Add the panel render in TodayView**

Below the timeline/EndOfDayCard region, add (using the routines already in scope and the status map; if the status map isn't already destructured from `data`, read it from `data` — it is built in `computeTodayData`/`statusMaps`):

```tsx
{(routines?.length ?? 0) > 0 && (
  <RoutinesHabitsPanel
    routines={routines ?? []}
    isCompleted={(id) => routineStatusMap.get(id)?.status === 'completed'}
    onToggle={(id, completed) => onCompleteRoutine?.(id, completed)}
  />
)}
```

Add the import: `import { RoutinesHabitsPanel } from './RoutinesHabitsPanel'`. If `routineStatusMap` is not in scope, obtain it the same way the timeline does (it comes from `data` — see `computeTodayData`/`statusMaps.ts`); reuse that exact reference, do not recompute.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Run the app and verify against the mockup**

Run: `npm run dev` → open the Today page. Confirm: the panel renders three columns with the day's routines; checking a routine off in the panel also checks it in the timeline group (shared state), and vice versa; Collapse hides/shows it.

- [ ] **Step 4: Commit**

```bash
git add src/components/schedule/TodayView.tsx
git commit -m "feat(today): mount RoutinesHabitsPanel (shared completion with timeline)"
```

---

### Task 4: Revised stats row (events · focus · routines · from email)

**Files:**
- Modify: `src/components/schedule/StatsRow.tsx` (add the four-count Today layout behind new optional props, keeping existing props for back-compat)
- Modify: `src/components/schedule/TodayView.tsx` (pass the four counts)
- Test: `src/components/schedule/StatsRow.test.tsx`

**Interfaces:**
- Produces (added to `StatsRowProps`): `eventsCount?: number`, `focusCount?: number`, `routinesCount?: number`, `emailCount?: number`. When `eventsCount` is provided, render the new four-stat group (events / focus items / routines / from email) instead of the legacy tasks-remaining/week group. `endControls` (Show daily + Plan today) stays as-is.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatsRow } from './StatsRow'

describe('StatsRow four-count Today layout', () => {
  it('renders events / focus / routines / from email counts when eventsCount is provided', () => {
    render(<StatsRow dueToday={0} doneToday={0} thisWeek={0} eventsCount={11} focusCount={3} routinesCount={8} emailCount={2} />)
    expect(screen.getByText('11')).toBeInTheDocument()
    expect(screen.getByText(/events/i)).toBeInTheDocument()
    expect(screen.getByText(/focus items/i)).toBeInTheDocument()
    expect(screen.getByText(/routines/i)).toBeInTheDocument()
    expect(screen.getByText(/from email/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/schedule/StatsRow.test.tsx`
Expected: FAIL — counts not rendered.

- [ ] **Step 3: Implement the four-count group in StatsRow**

Add the props to `StatsRowProps`, and at the top of the returned row render (when `eventsCount !== undefined`) a stat group; lucide icons `CalendarDays` (events), `Star` (focus), `Repeat` (routines), `Mail` (from email):

```tsx
{eventsCount !== undefined && (
  <div className="flex items-center flex-wrap gap-x-5 gap-y-2 text-[15px] text-neutral-600">
    <span className="inline-flex items-center gap-1.5"><CalendarDays className="w-5 h-5 text-neutral-500" /><span className="tabular-nums">{eventsCount}</span> events</span>
    <span className="inline-flex items-center gap-1.5"><Star className="w-5 h-5 text-neutral-500" /><span className="tabular-nums">{focusCount ?? 0}</span> focus items</span>
    <span className="inline-flex items-center gap-1.5"><Repeat className="w-5 h-5 text-neutral-500" /><span className="tabular-nums">{routinesCount ?? 0}</span> routines</span>
    <span className="inline-flex items-center gap-1.5"><Mail className="w-5 h-5 text-neutral-500" /><span className="tabular-nums">{emailCount ?? 0}</span> from email</span>
  </div>
)}
```

Gate the legacy tasks-remaining/week block on `eventsCount === undefined` so existing callers are unaffected. Keep `endControls` rendering unchanged (it stays at `ml-auto`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/schedule/StatsRow.test.tsx`
Expected: PASS.

- [ ] **Step 5: Pass the counts from TodayView**

In the `<StatsRow .../>` invocation (TodayView.tsx ~473), add: `eventsCount={events.length}`, `routinesCount={routines?.length ?? 0}`, `emailCount={activeEmailCount}`, `focusCount={0}` (real focus count lands in slice 2). Keep existing props. (Use the same filtered collections the timeline uses if `events`/`routines` props include hidden items — prefer the computed `data` collections if available so counts match the timeline.)

- [ ] **Step 6: Typecheck + run**

Run: `npx tsc --noEmit` (no new errors), then `npm run dev` and confirm the stats row matches the mockup counts.

- [ ] **Step 7: Commit**

```bash
git add src/components/schedule/StatsRow.tsx src/components/schedule/StatsRow.test.tsx src/components/schedule/TodayView.tsx
git commit -m "feat(today): four-count stats row (events/focus/routines/from email)"
```

---

### Task 5: `selectFocusItems` helper + `FocusTodayRow` (fallback selection)

**Files:**
- Create: `src/lib/today/selectFocusItems.ts`
- Test: `src/lib/today/selectFocusItems.test.ts`
- Create: `src/components/schedule/FocusTodayRow.tsx`
- Test: `src/components/schedule/FocusTodayRow.test.tsx`
- Modify: `src/components/schedule/TodayView.tsx` (mount the row above the timeline)

**Interfaces:**
- Produces: `selectFocusItems(items: TimelineItem[], limit = 3): TimelineItem[]` — slice-1 behavior: the next `limit` timed items (`startTime != null`, not completed) in ascending `startTime` order. (Slice 2 will prefer `is_focus`-flagged items; this signature stays stable.)
- Produces: `FocusTodayRow` with `interface FocusTodayRowProps { items: TimelineItem[]; totalEvents: number; onSelectItem: (id: string) => void }`.

- [ ] **Step 1: Write the failing helper test**

```typescript
import { describe, it, expect } from 'vitest'
import { selectFocusItems } from './selectFocusItems'
import type { TimelineItem } from '@/types/timeline'

const item = (id: string, h: number | null, completed = false): TimelineItem =>
  ({ id, type: 'event', title: id, startTime: h === null ? null : new Date(2026, 5, 24, h), endTime: null, completed } as TimelineItem)

describe('selectFocusItems', () => {
  it('returns the next N timed, incomplete items in time order', () => {
    const out = selectFocusItems([item('c', 17), item('a', 9), item('done', 8, true), item('none', null), item('b', 13)], 3)
    expect(out.map(i => i.id)).toEqual(['a', 'b', 'c'])
  })
})
```

- [ ] **Step 2: Run → fail**

Run: `npx vitest run src/lib/today/selectFocusItems.test.ts` → FAIL.

- [ ] **Step 3: Implement**

```typescript
import type { TimelineItem } from '@/types/timeline'

export function selectFocusItems(items: TimelineItem[], limit = 3): TimelineItem[] {
  return items
    .filter((i) => i.startTime != null && !i.completed)
    .sort((a, b) => (a.startTime!.getTime() - b.startTime!.getTime()))
    .slice(0, limit)
}
```

- [ ] **Step 4: Run → pass**

Run: `npx vitest run src/lib/today/selectFocusItems.test.ts` → PASS.

- [ ] **Step 5: Write FocusTodayRow + test**

Test (`FocusTodayRow.test.tsx`):

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FocusTodayRow } from './FocusTodayRow'
import type { TimelineItem } from '@/types/timeline'

const item = (id: string): TimelineItem =>
  ({ id, type: 'event', title: id, startTime: new Date(2026,5,24,9), endTime: new Date(2026,5,24,10), completed: false } as TimelineItem)

describe('FocusTodayRow', () => {
  it('renders a card per item and calls onSelectItem on click', () => {
    const onSelect = vi.fn()
    render(<FocusTodayRow items={[item('A'), item('B')]} totalEvents={11} onSelectItem={onSelect} />)
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText(/2 focus items/i)).toBeInTheDocument()
    fireEvent.click(screen.getByText('A'))
    expect(onSelect).toHaveBeenCalledWith('A')
  })
})
```

Implementation (`FocusTodayRow.tsx`) — three-up grid of cards with time range, title, and a meta line; expander text "N focus items · M total events". Use existing time-format util if present (`formatTimeRange`); otherwise format inline. No emojis; lucide `Star` for the header.

```tsx
import { Star } from 'lucide-react'
import type { TimelineItem } from '@/types/timeline'

interface FocusTodayRowProps { items: TimelineItem[]; totalEvents: number; onSelectItem: (id: string) => void }

function timeLabel(i: TimelineItem): string {
  if (!i.startTime) return ''
  const f = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return i.endTime ? `${f(i.startTime)} – ${f(i.endTime)}` : f(i.startTime)
}

export function FocusTodayRow({ items, totalEvents, onSelectItem }: FocusTodayRowProps) {
  if (items.length === 0) return null
  return (
    <section className="mt-4">
      <div className="flex items-center gap-1.5 mb-2 text-neutral-600">
        <Star className="w-4 h-4 text-amber-500" />
        <span className="text-[12px] font-medium tracking-wide text-neutral-500">FOCUS TODAY</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {items.map((i) => (
          <button key={i.id} type="button" onClick={() => onSelectItem(i.id)}
            className="card text-left p-4 border-l-4 border-l-primary-400 hover:shadow-md transition">
            <div className="text-[12px] text-neutral-400">{timeLabel(i)}</div>
            <div className="text-[15px] font-medium text-neutral-800 mt-1">{i.title}</div>
            {i.location && <div className="text-[12px] text-neutral-500 mt-1">{i.location}</div>}
            {i.meetingUrl && <div className="text-[12px] text-neutral-500 mt-1">Video call</div>}
          </button>
        ))}
      </div>
      <div className="text-[12px] text-neutral-400 mt-2">{items.length} focus items · {totalEvents} total events</div>
    </section>
  )
}
```

- [ ] **Step 6: Run both component/helper tests → pass**

Run: `npx vitest run src/components/schedule/FocusTodayRow.test.tsx src/lib/today/selectFocusItems.test.ts`
Expected: PASS.

- [ ] **Step 7: Mount in TodayView (above the timeline)**

Build the focus items from the timeline items already computed for the day and render above the schedule:

```tsx
<FocusTodayRow
  items={selectFocusItems(timelineItems)}
  totalEvents={events.length}
  onSelectItem={onSelectItem}
/>
```

Use the same timeline-item array the schedule renders from (find its variable in TodayView; do not recompute). Add imports for `FocusTodayRow` and `selectFocusItems`. Update the stats row `focusCount` to `selectFocusItems(timelineItems).length`.

- [ ] **Step 8: Typecheck + run + commit**

Run: `npx tsc --noEmit`; `npm run dev` (confirm 3 focus cards match the mockup). Then:

```bash
git add src/lib/today/selectFocusItems.ts src/lib/today/selectFocusItems.test.ts src/components/schedule/FocusTodayRow.tsx src/components/schedule/FocusTodayRow.test.tsx src/components/schedule/TodayView.tsx
git commit -m "feat(today): Focus Today row (fallback = next timed items)"
```

---

### Task 6: Masthead centering (Today variant)

**Files:**
- Modify: `src/components/home/HomeHeader.tsx` (center the Today date block with the weekday eyebrow above the date, matching the mockup).

**Interfaces:** No new props. Today branch already delegates to `DayNavCluster`; wrap/justify it centered and ensure a weekday eyebrow ("WEDNESDAY") renders above the date.

- [ ] **Step 1: Adjust the Today branch layout**

In the `currentView === 'today'` branch, center the cluster (e.g. wrap in `flex flex-col items-center`) and render an uppercase weekday eyebrow above the date if not already present:

```tsx
<div className="flex flex-col items-center">
  <span className="text-[12px] font-medium tracking-wide text-neutral-400">
    {viewedDate.toLocaleDateString([], { weekday: 'long' }).toUpperCase()}
  </span>
  <DayNavCluster viewedDate={viewedDate} onDateChange={onDateChange} />
</div>
```

(If `DayNavCluster` already renders the weekday, skip the eyebrow to avoid duplication — verify by reading the component first.)

- [ ] **Step 2: Typecheck + run + visual check**

Run: `npx tsc --noEmit`; `npm run dev` — confirm the masthead matches the mockup (centered, weekday over date, D/W/M toggle to the right).

- [ ] **Step 3: Commit**

```bash
git add src/components/home/HomeHeader.tsx
git commit -m "feat(today): center Today masthead with weekday eyebrow"
```

---

### Task 7: Slice verification

- [ ] **Step 1: Full unit suite**

Run: `npx vitest run`
Expected: all green (new tests included).

- [ ] **Step 2: Build (Vercel parity)**

Run: `npm run build`
Expected: `tsc -b` + Vite build succeed (no type errors).

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: clean (CI gates on lint).

- [ ] **Step 4: Visual diff against the mockup**

`npm run dev` → Today page. Confirm against the mockup: centered masthead; four-count stats row + Show daily/Plan today; Focus Today 3-card row + expander; existing timeline unchanged; Routines & Habits overview panel with working quick mark-done that stays in sync with the timeline. Note any visual gaps for a polish pass.

- [ ] **Step 5: Push preview (no merge to main yet)**

```bash
git push origin feat/today-redesign
```

Slice 1 is preview-only until Scott approves; do not merge to `main`.

## Self-review notes

- Spec coverage: §1 masthead → Task 6; §2 stats → Task 4; §3 Focus (shell/fallback) → Task 5 (the `is_focus` star is slice 2, out of scope here, as specified); §4 hour-rail → **slice 3, not this plan** (the timeline is intentionally untouched in slice 1); §5 Routines & Habits + quick mark-done → Tasks 1–3.
- Shared completion state (spec §5) is satisfied by reusing `onCompleteRoutine` + the existing `routineStatusMap` in Task 3.
- Type consistency: `routinesByPartOfDay`/`PartOfDay`, `selectFocusItems`, and the new StatsRow props are referenced consistently across tasks.
- Known soft spot to resolve at execution time (not a placeholder): the exact in-scope variable names in `TodayView` for the timeline items array and the routine status map — read them at Task 3/Task 5 and reuse the existing references rather than recomputing.
