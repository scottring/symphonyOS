# Horizon Cascade Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redraw all four horizon rungs so each draws the unit it places into and nothing finer, and fix the one-week event window that would otherwise render the new `/year` empty.

**Architecture:** One pure module (`lib/planning/timeAxis.ts`) supplies all proportional-time maths. Four presentational components consume it — `YearRibbon`, `GoalLedger`, `SeasonMonthStrips`, plus day-grain modes inside the existing `MonthCalendarGrid` and `PlanningGrid`. Because the wizard's `CalendarStep`, `PlaceOnWeeksStep` and `ScheduleGridStep` mount the same components as the pages, page↔wizard parity is structural.

**Tech Stack:** React 19, TypeScript strict, Tailwind v4 (Nordic Journal), Vitest + React Testing Library.

## Global Constraints

- **Lucide icons only. Never emojis.** Standing UI rule.
- `font-display` (Source Serif 4) for content mastheads; app chrome stays sans.
- Tailwind v4: unlayered CSS beats every utility — overridable defaults go in `@layer base`.
- Path alias `@/` → `src/`.
- Tests: `npx vitest run` — **never `npm test`** (watch mode).
- Node: use `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:$PATH"` if vitest misbehaves.
- Work in `/Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/horizon-design`. **Never** the main worktree.
- `/year` is read-only — no placement from the ribbon.
- Today's plan-day grid (`HomeViewContainer`, `placementGrain='time'`) must not change.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/planning/timeAxis.ts` | **New.** Pure maths: fraction-of-span, elapsed, ISO-week buckets, multi-day claim extraction, month/season boundaries. No React. |
| `src/lib/planning/timeAxis.test.ts` | **New.** Unit tests for the above. |
| `src/components/planning/horizon/YearRibbon.tsx` | **New.** The year axis: month ticks, season segments, elapsed shade, claim bars, density strip. |
| `src/components/planning/horizon/GoalLedger.tsx` | **New.** Goals grouped by area, four columns, stall summary. |
| `src/components/planning/season/SeasonMonthStrips.tsx` | **New.** Three proportional month strips. |
| `src/apps/tasks/horizons/shared.tsx` | **Modify.** `useHorizonPageData` fetches its own rung's event period. |
| `src/components/planning/horizon/MonthCalendarGrid.tsx` | **Modify.** Week rows replace the 42-cell grid; `onPlaceTask` deleted. |
| `src/components/planning/PlanningGrid.tsx` | **Modify.** Day-grain mode: no hour axis, all-day lane fills the column. |
| `src/components/planning/PlanningSession.tsx` | **Modify.** Pass `dayGrain` through to `PlanningGrid`. |
| `src/apps/tasks/horizons/YearPage.tsx` | **Modify.** Ribbon + ledger. |
| `src/apps/tasks/horizons/SeasonPage.tsx` | **Modify.** Month strips. |
| `src/components/planning/guided/stepTypes/CalendarStep.tsx` | **Modify.** Renders `YearRibbon` at year, `SeasonMonthStrips` at season. |
| `src/components/planning/horizon/YearCalendarGrid.tsx` + test | **Delete.** |

---

### Task 1: `timeAxis` — the shared maths

**Files:**
- Create: `src/lib/planning/timeAxis.ts`
- Test: `src/lib/planning/timeAxis.test.ts`

**Interfaces:**
- Consumes: `CalendarEvent` from `@/hooks/useGoogleCalendar`.
- Produces:
  - `fractionOfSpan(d: Date, start: Date, end: Date): number` — 0..1, clamped.
  - `spanPercent(d: Date, start: Date, end: Date): string` — e.g. `"56.2%"`.
  - `MultiDayClaim { id: string; title: string; start: Date; end: Date; startPct: number; widthPct: number }`
  - `multiDayClaims(events: readonly CalendarEvent[], start: Date, end: Date, minDays?: number): MultiDayClaim[]`
  - `WeekBucket { weekStart: Date; count: number }`
  - `weekBuckets(dates: readonly Date[], start: Date, end: Date): WeekBucket[]`
  - `monthTicks(year: number): { label: string; pct: number }[]`
  - `seasonSegments(year: number): { label: string; startPct: number; widthPct: number; index: number }[]`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/planning/timeAxis.test.ts
import { describe, it, expect } from 'vitest'
import { fractionOfSpan, multiDayClaims, weekBuckets, monthTicks, seasonSegments } from './timeAxis'

const YEAR_START = new Date(2026, 0, 1)
const YEAR_END = new Date(2026, 11, 31, 23, 59, 59)

describe('fractionOfSpan', () => {
  it('is 0 at the start and 1 at the end', () => {
    expect(fractionOfSpan(YEAR_START, YEAR_START, YEAR_END)).toBeCloseTo(0, 3)
    expect(fractionOfSpan(YEAR_END, YEAR_START, YEAR_END)).toBeCloseTo(1, 3)
  })
  it('puts 2026-07-25 (day 206) at ~56%', () => {
    expect(fractionOfSpan(new Date(2026, 6, 25), YEAR_START, YEAR_END)).toBeCloseTo(0.562, 2)
  })
  it('clamps outside the span', () => {
    expect(fractionOfSpan(new Date(2025, 5, 1), YEAR_START, YEAR_END)).toBe(0)
    expect(fractionOfSpan(new Date(2027, 5, 1), YEAR_START, YEAR_END)).toBe(1)
  })
})

describe('multiDayClaims', () => {
  const evs = [
    { id: 'a', title: 'Catskills trip', start_time: '2026-08-08T00:00:00Z', end_time: '2026-08-15T00:00:00Z', all_day: true },
    { id: 'b', title: 'Dentist', start_time: '2026-08-20T14:00:00Z', end_time: '2026-08-20T15:00:00Z', all_day: false },
  ] as never[]

  it('keeps spans of >= minDays and drops single-day events', () => {
    const claims = multiDayClaims(evs, YEAR_START, YEAR_END, 2)
    expect(claims).toHaveLength(1)
    expect(claims[0].title).toBe('Catskills trip')
  })
  it('positions the claim by its start and sizes it by its length', () => {
    const [c] = multiDayClaims(evs, YEAR_START, YEAR_END, 2)
    expect(c.startPct).toBeGreaterThan(59)
    expect(c.startPct).toBeLessThan(61)
    expect(c.widthPct).toBeGreaterThan(1.5)
  })
})

describe('weekBuckets', () => {
  it('returns one bucket per week of the span and counts dates into them', () => {
    const buckets = weekBuckets(
      [new Date(2026, 0, 2), new Date(2026, 0, 3), new Date(2026, 6, 25)],
      YEAR_START, YEAR_END,
    )
    expect(buckets.length).toBeGreaterThanOrEqual(52)
    expect(buckets[0].count).toBe(2)
    expect(buckets.reduce((n, b) => n + b.count, 0)).toBe(3)
  })
  it('gives a fully empty tail zero counts, not missing buckets', () => {
    const buckets = weekBuckets([new Date(2026, 0, 2)], YEAR_START, YEAR_END)
    expect(buckets.at(-1)!.count).toBe(0)
  })
})

describe('monthTicks / seasonSegments', () => {
  it('gives twelve ascending ticks starting at 0', () => {
    const ticks = monthTicks(2026)
    expect(ticks).toHaveLength(12)
    expect(ticks[0]).toMatchObject({ label: 'JAN', pct: 0 })
    expect(ticks[6].pct).toBeGreaterThan(ticks[5].pct)
  })
  it('gives four season segments covering the whole year', () => {
    const segs = seasonSegments(2026)
    expect(segs).toHaveLength(4)
    const total = segs.reduce((n, s) => n + s.widthPct, 0)
    expect(total).toBeCloseTo(100, 1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/planning/timeAxis.test.ts`
Expected: FAIL — `Failed to resolve import "./timeAxis"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/planning/timeAxis.ts
//
// Proportional-time maths shared by every horizon rung. Pure — no React, no
// clock reads except through the `now` arguments callers pass. The whole
// cascade draws its span left-to-right on one axis, so every rung needs the
// same four answers: where does a date sit, which claims span more than a day,
// how full is each week, and where do the month/season boundaries fall.
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

const DAY_MS = 86_400_000

export function fractionOfSpan(d: Date, start: Date, end: Date): number {
  const total = end.getTime() - start.getTime()
  if (total <= 0) return 0
  const f = (d.getTime() - start.getTime()) / total
  return f < 0 ? 0 : f > 1 ? 1 : f
}

export function spanPercent(d: Date, start: Date, end: Date): string {
  return `${(fractionOfSpan(d, start, end) * 100).toFixed(1)}%`
}

export interface MultiDayClaim {
  id: string
  title: string
  start: Date
  end: Date
  startPct: number
  widthPct: number
}

function eventStart(e: CalendarEvent): Date | null {
  const raw = e.startTime ?? e.start_time
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

function eventEnd(e: CalendarEvent): Date | null {
  const raw = e.endTime ?? e.end_time
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

// A "claim" is a calendar event that eats >= minDays of the span — a trip, a
// camp, an on-call week. Single appointments are noise at this altitude; they
// are counted by weekBuckets instead.
export function multiDayClaims(
  events: readonly CalendarEvent[],
  start: Date,
  end: Date,
  minDays = 2,
): MultiDayClaim[] {
  const out: MultiDayClaim[] = []
  for (const e of events) {
    const s = eventStart(e)
    const en = eventEnd(e)
    if (!s || !en) continue
    const days = Math.round((en.getTime() - s.getTime()) / DAY_MS)
    if (days < minDays) continue
    if (en < start || s > end) continue
    const startPct = fractionOfSpan(s, start, end) * 100
    const endPct = fractionOfSpan(en, start, end) * 100
    out.push({
      id: e.id,
      title: e.title ?? 'Untitled',
      start: s,
      end: en,
      startPct,
      widthPct: Math.max(0.4, endPct - startPct),
    })
  }
  return out.sort((a, b) => a.startPct - b.startPct)
}

export interface WeekBucket {
  weekStart: Date
  count: number
}

// One bucket per week of the span, always contiguous — an empty tail must be
// zeroes, not absent buckets, or the density strip silently shortens and the
// unwritten end of the year stops reading as runway.
export function weekBuckets(dates: readonly Date[], start: Date, end: Date): WeekBucket[] {
  const first = new Date(start)
  first.setHours(0, 0, 0, 0)
  first.setDate(first.getDate() - first.getDay())
  const buckets: WeekBucket[] = []
  for (let t = new Date(first); t <= end; t.setDate(t.getDate() + 7)) {
    buckets.push({ weekStart: new Date(t), count: 0 })
  }
  for (const d of dates) {
    const idx = Math.floor((d.getTime() - first.getTime()) / (7 * DAY_MS))
    if (idx >= 0 && idx < buckets.length) buckets[idx].count += 1
  }
  return buckets
}

const MONTH_TICK_LABELS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

export function monthTicks(year: number): { label: string; pct: number }[] {
  const start = new Date(year, 0, 1)
  const end = new Date(year, 11, 31, 23, 59, 59)
  return MONTH_TICK_LABELS.map((label, m) => ({
    label,
    pct: fractionOfSpan(new Date(year, m, 1), start, end) * 100,
  }))
}

const SEASON_LABELS = ['Winter', 'Spring', 'Summer', 'Autumn']

export function seasonSegments(year: number): { label: string; startPct: number; widthPct: number; index: number }[] {
  const start = new Date(year, 0, 1)
  const end = new Date(year, 11, 31, 23, 59, 59)
  return SEASON_LABELS.map((label, i) => {
    const segStart = fractionOfSpan(new Date(year, i * 3, 1), start, end) * 100
    const segEnd = i === 3 ? 100 : fractionOfSpan(new Date(year, (i + 1) * 3, 1), start, end) * 100
    return { label, index: i, startPct: segStart, widthPct: segEnd - segStart }
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/planning/timeAxis.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/planning/timeAxis.ts src/lib/planning/timeAxis.test.ts
git commit -m "feat(planning): one axis maths for every rung"
```

---

### Task 2: Each rung fetches its own events

The blocking bug. `useGoogleCalendar.fetchEvents` **replaces** the events array, and the only page-side caller is `useShellChrome.ts:136` with a 7-day window. Every horizon page has been drawing its span out of one week.

**Files:**
- Modify: `src/apps/tasks/horizons/shared.tsx` (`useHorizonPageData`, near the `useGoogleCalendar()` call at line 130)

**Interfaces:**
- Consumes: `guidedPeriod(horizon)` from `@/components/planning/guided/periods` → `{ start: Date; end: Date; token: string }`. Horizon ids map: `year→annual`, `season→seasonal`, `month→monthly`, `week→weekly`.
- Produces: no signature change to `useHorizonPageData`; `domainEvents` simply now covers the rung's period.

- [ ] **Step 1: Add the fetch effect**

In `shared.tsx`, immediately after `const { events } = useGoogleCalendar();` change to pull `fetchEvents` too, then add:

```tsx
  const { events, fetchEvents } = useGoogleCalendar();

  // Every horizon page reads the SAME events array, and fetchEvents replaces it
  // wholesale. The shell only ever loads today→+7d, so before this effect the
  // year page drew twelve months out of one week of calendar (and the ribbon
  // would have shipped empty). Each rung now loads its own span on mount, the
  // way the wizard's CalendarStep/PlaceOnWeeksStep already do — which is why
  // the wizard has always looked richer than the page.
  const guidedHorizon = horizon === 'year' ? 'annual'
    : horizon === 'season' ? 'seasonal'
    : horizon === 'month' ? 'monthly'
    : horizon === 'week' ? 'weekly' : null;
  useEffect(() => {
    if (!guidedHorizon) return;
    const { start, end } = guidedPeriod(guidedHorizon);
    void fetchEvents(start, end);
  }, [guidedHorizon, fetchEvents]);
```

`guidedPeriod` is already imported at line 52. Add `useEffect` to the React import if absent.

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc -b`
Expected: no errors. If `fetchEvents` is not on the hook's return, confirm against `useGoogleCalendar.tsx:651` — it is exported there.

- [ ] **Step 3: Commit**

```bash
git add src/apps/tasks/horizons/shared.tsx
git commit -m "fix(horizons): a rung loads its own span of calendar, not the shell's week"
```

---

### Task 3: `YearRibbon`

**Files:**
- Create: `src/components/planning/horizon/YearRibbon.tsx`
- Test: `src/components/planning/horizon/YearRibbon.test.tsx`

**Interfaces:**
- Consumes: `timeAxis` (Task 1); `Task` from `@/types/task`; `CalendarEvent`.
- Produces: `<YearRibbon year={number} tasks={Task[]} events={CalendarEvent[]} now?={Date} />`

**Design requirements (from the spec):** month tick labels; four season segments with the current one in primary; elapsed shading to `now` with a today rule; multi-day claim bars staggered so labels don't collide; a density strip of `weekBuckets` over events + scheduled tasks, past muted / current primary / future pale; read-only throughout — no drop handlers, no click-to-place.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/planning/horizon/YearRibbon.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { YearRibbon } from './YearRibbon'
import type { Task } from '@/types/task'

const NOW = new Date(2026, 6, 25)
const events = [
  { id: 'e1', title: 'Catskills trip', start_time: '2026-08-08T12:00:00Z', end_time: '2026-08-15T12:00:00Z', all_day: true },
] as never[]
const tasks = [
  { id: 't1', title: 'Ride', completed: false, scheduledFor: new Date(2026, 0, 5) },
] as unknown as Task[]

describe('YearRibbon', () => {
  it('labels all twelve months and the four seasons', () => {
    render(<YearRibbon year={2026} tasks={tasks} events={events} now={NOW} />)
    expect(screen.getByText('JAN')).toBeInTheDocument()
    expect(screen.getByText('DEC')).toBeInTheDocument()
    expect(screen.getByText('Summer')).toBeInTheDocument()
  })

  it('plots a multi-day claim by name', () => {
    render(<YearRibbon year={2026} tasks={tasks} events={events} now={NOW} />)
    expect(screen.getByText(/Catskills/)).toBeInTheDocument()
  })

  it('shades elapsed time up to today', () => {
    const { container } = render(<YearRibbon year={2026} tasks={tasks} events={events} now={NOW} />)
    const shade = container.querySelector('[data-testid="elapsed-shade"]') as HTMLElement
    expect(shade).toBeTruthy()
    expect(parseFloat(shade.style.width)).toBeCloseTo(56.2, 0)
  })

  it('renders one density bar per week of the year', () => {
    const { container } = render(<YearRibbon year={2026} tasks={tasks} events={events} now={NOW} />)
    expect(container.querySelectorAll('[data-testid="density-bar"]').length).toBeGreaterThanOrEqual(52)
  })

  it('places nothing — no drop handlers anywhere', () => {
    const { container } = render(<YearRibbon year={2026} tasks={tasks} events={events} now={NOW} />)
    expect(container.querySelectorAll('[draggable="true"]')).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/planning/horizon/YearRibbon.test.tsx`
Expected: FAIL — cannot resolve `./YearRibbon`.

- [ ] **Step 3: Implement `YearRibbon`**

Build it to satisfy the tests and the visual spec. Required hooks for the tests: `data-testid="elapsed-shade"` on the shading element with an inline `width` percentage; `data-testid="density-bar"` on each week bar. Use `monthTicks`, `seasonSegments`, `multiDayClaims`, `weekBuckets` from Task 1. Nordic Journal tones: `text-neutral-*` for chrome, `bg-primary-*` for the current season / today rule / current week. Stagger claim labels by alternating `top` offsets when two claims are within 4% of each other.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/planning/horizon/YearRibbon.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/planning/horizon/YearRibbon.tsx src/components/planning/horizon/YearRibbon.test.tsx
git commit -m "feat(year): the year as one axis — seasons, claims, elapsed, density"
```

---

### Task 4: `GoalLedger`

**Files:**
- Create: `src/components/planning/horizon/GoalLedger.tsx`
- Test: `src/components/planning/horizon/GoalLedger.test.tsx`

**Interfaces:**
- Consumes: `goalRollup` from `@/lib/planning/lineage`; `Goal` from `@/types/goal`; `Task`.
- Produces: `<GoalLedger goals={Goal[]} areas={{id,name}[]} tasks={Task[]} domainTasks={Task[]} onOpenGoal={(id:string)=>void} />`

**Columns:** Picked (`bucket==='quarter' && picked_at && goalId` match, from `domainTasks`), Moves (`bucket==='month'`), On a week (`weekStart != null`), Done (`goalRollup(...).done`). Untouched goals dim and show em-dashes. **Moves > 0 with On a week === 0 renders in the warning tone** — that is the stall.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/planning/horizon/GoalLedger.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GoalLedger } from './GoalLedger'

const areas = [{ id: 'a1', name: 'Home' }]
const goals = [
  { id: 'g1', name: 'Every room set up', areaId: 'a1', status: 'active' },
  { id: 'g2', name: 'Untouched goal', areaId: 'a1', status: 'active' },
] as never[]
const tasks = [
  { id: 'p1', goalId: 'g1', bucket: 'quarter', pickedAt: '2026-07-24T00:00:00Z', completed: false },
  { id: 'm1', goalId: 'g1', bucket: 'month', completed: false },
  { id: 'm2', goalId: 'g1', bucket: 'month', completed: false },
] as never[]

describe('GoalLedger', () => {
  it('groups goals under their area', () => {
    render(<GoalLedger goals={goals} areas={areas} tasks={tasks} domainTasks={tasks} onOpenGoal={vi.fn()} />)
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByText('Every room set up')).toBeInTheDocument()
  })

  it('counts picks and moves for a worked goal', () => {
    render(<GoalLedger goals={goals} areas={areas} tasks={tasks} domainTasks={tasks} onOpenGoal={vi.fn()} />)
    const row = screen.getByTestId('ledger-row-g1')
    expect(row).toHaveTextContent('1')
    expect(row).toHaveTextContent('2')
  })

  it('flags the stall when moves exist but none has a week', () => {
    render(<GoalLedger goals={goals} areas={areas} tasks={tasks} domainTasks={tasks} onOpenGoal={vi.fn()} />)
    expect(screen.getByTestId('ledger-row-g1').querySelector('[data-stall="true"]')).toBeTruthy()
  })

  it('dims a goal with nothing under it rather than hiding it', () => {
    render(<GoalLedger goals={goals} areas={areas} tasks={tasks} domainTasks={tasks} onOpenGoal={vi.fn()} />)
    const row = screen.getByTestId('ledger-row-g2')
    expect(row).toBeInTheDocument()
    expect(row.getAttribute('data-untouched')).toBe('true')
  })

  it('opens a goal when its row is clicked', async () => {
    const onOpenGoal = vi.fn()
    render(<GoalLedger goals={goals} areas={areas} tasks={tasks} domainTasks={tasks} onOpenGoal={onOpenGoal} />)
    await userEvent.click(screen.getByText('Every room set up'))
    expect(onOpenGoal).toHaveBeenCalledWith('g1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/planning/horizon/GoalLedger.test.tsx`
Expected: FAIL — cannot resolve `./GoalLedger`.

- [ ] **Step 3: Implement `GoalLedger`**

Required test hooks: `data-testid="ledger-row-<goalId>"`, `data-untouched="true|false"`, `data-stall="true"` on the *On a week* cell when `moves > 0 && onWeek === 0`. Orphan goals (no matching area) group under a final "Goals" heading. Below the rows, a summary strip: total moves, how many have a week, and the untouched-goal count.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/planning/horizon/GoalLedger.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/planning/horizon/GoalLedger.tsx src/components/planning/horizon/GoalLedger.test.tsx
git commit -m "feat(year): a goal ledger that names the stall"
```

---

### Task 5: Wire `/year` and retire `YearCalendarGrid`

**Files:**
- Modify: `src/apps/tasks/horizons/YearPage.tsx`
- Modify: `src/components/planning/guided/stepTypes/CalendarStep.tsx:10,115`
- Delete: `src/components/planning/horizon/YearCalendarGrid.tsx`, `YearCalendarGrid.test.tsx`

**Interfaces:**
- Consumes: `YearRibbon` (Task 3), `GoalLedger` (Task 4).

- [ ] **Step 1: Replace the grid on the page**

In `YearPage.tsx`, swap the `<YearCalendarGrid …/>` block for `<YearRibbon year={new Date().getFullYear()} tasks={domainTasks} events={domainEvents} />`, and replace the `goalsByArea` / `orphanGoals` sections and `YearGoalRow` with a single `<GoalLedger …/>`. Delete the now-unused `YearGoalRow`, `partitionSeason`/`goalRollup` imports that move into the ledger, and the `onGoToMonth` prop. Keep the empty state, the masthead, `CascadeRail`, "Plan the year", and `HorizonExplainer` exactly as they are.

- [ ] **Step 2: Point the wizard at the same component**

In `CalendarStep.tsx`, change the import on line 10 to `YearRibbon` and the render at line 115 to `<YearRibbon year={landscapeYear} tasks={[]} events={events} />`. The step is read-only, which the ribbon already is.

- [ ] **Step 3: Delete the old grid**

```bash
git rm src/components/planning/horizon/YearCalendarGrid.tsx src/components/planning/horizon/YearCalendarGrid.test.tsx
```

- [ ] **Step 4: Verify**

Run: `npx tsc -b && npx vitest run src/apps/tasks/horizons src/components/planning/guided/stepTypes/CalendarStep.test.tsx`
Expected: PASS. Any `pages.smoke.test.tsx` assertion naming the old grid must be updated to the ribbon.

- [ ] **Step 5: Commit**

```bash
git add -A src/apps/tasks/horizons src/components/planning
git commit -m "feat(year): page and mountain-ranges step share one ribbon"
```

---

### Task 6: `SeasonMonthStrips` — closing the season parity gap

**Files:**
- Create: `src/components/planning/season/SeasonMonthStrips.tsx`
- Test: `src/components/planning/season/SeasonMonthStrips.test.tsx`
- Modify: `src/apps/tasks/horizons/SeasonPage.tsx` (replace `MonthStrip`)
- Modify: `src/components/planning/guided/stepTypes/CalendarStep.tsx` (render it when `horizon === 'seasonal'`)

**Interfaces:**
- Produces: `<SeasonMonthStrips seasonStart={Date} tasks={Task[]} events={CalendarEvent[]} now?={Date} onOpenMonth?={(d:Date)=>void} />`

Three strips, `flex` weighted by days in month, elapsed shaded across the row. Each: month name, count already claimed, chips for multi-day claims falling inside it, count of moves placed into it. A month holding ≤2 claimed items reads *wide open* on a dashed border.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/planning/season/SeasonMonthStrips.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SeasonMonthStrips } from './SeasonMonthStrips'

const events = [
  { id: 'e1', title: 'Catskills trip', start_time: '2026-08-08T12:00:00Z', end_time: '2026-08-15T12:00:00Z', all_day: true },
] as never[]

describe('SeasonMonthStrips', () => {
  it('names the season’s three months', () => {
    render(<SeasonMonthStrips seasonStart={new Date(2026, 6, 1)} tasks={[]} events={events} now={new Date(2026, 6, 25)} />)
    expect(screen.getByText('July')).toBeInTheDocument()
    expect(screen.getByText('August')).toBeInTheDocument()
    expect(screen.getByText('September')).toBeInTheDocument()
  })

  it('chips a multi-day claim into the month it falls in', () => {
    render(<SeasonMonthStrips seasonStart={new Date(2026, 6, 1)} tasks={[]} events={events} now={new Date(2026, 6, 25)} />)
    expect(screen.getByTestId('strip-7')).toHaveTextContent(/Catskills/)
  })

  it('marks a nearly empty month wide open', () => {
    render(<SeasonMonthStrips seasonStart={new Date(2026, 6, 1)} tasks={[]} events={events} now={new Date(2026, 6, 25)} />)
    expect(screen.getByTestId('strip-8')).toHaveTextContent(/wide open/i)
  })
})
```

Note `strip-<monthIndex>` is zero-based: July = `strip-6`, August = `strip-7`, September = `strip-8`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/planning/season/SeasonMonthStrips.test.tsx`
Expected: FAIL — cannot resolve `./SeasonMonthStrips`.

- [ ] **Step 3: Implement, then wire both surfaces**

Implement the component with `data-testid="strip-<monthIndex>"`. In `SeasonPage.tsx` replace `<MonthStrip …/>` with it. In `CalendarStep.tsx`, when the step's horizon is seasonal, render `<SeasonMonthStrips seasonStart={periodStart} …/>` instead of the generic per-month counts. Leave `BetsGrid` and `OverflowTray` untouched.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/components/planning/season src/apps/tasks/horizons`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A src/components/planning src/apps/tasks/horizons
git commit -m "feat(season): three month strips, shared by page and session"
```

---

### Task 7: `/month` draws weeks, not days

**Files:**
- Modify: `src/components/planning/horizon/MonthCalendarGrid.tsx`
- Test: `src/components/planning/horizon/MonthCalendarGrid.test.tsx` (existing — week-placement and seam tests must survive)

The 42-cell grid, the `WEEKDAY_LABELS` header, and the `onPlaceTask` prop all go. Each week becomes one full-width row: left rail with the date range and a `past` / `this week` / `ahead` label, body with the claimed count, multi-day claim chips, and the lane of moves already placed on that week (`isPlacedOnWeek`, unchanged). **The row keeps being the drop target** — `onPlaceTaskInWeek` behavior is unchanged; only the drawing changes.

- [ ] **Step 1: Add the failing tests to the existing file**

```tsx
describe('MonthCalendarGrid draws weeks, not days', () => {
  it('renders no weekday header', () => {
    render(<MonthCalendarGrid month={new Date(2026, 6, 1)} tasks={[]} events={[]} weekStartsOn={0} />)
    expect(screen.queryByText('Tue')).not.toBeInTheDocument()
  })

  it('renders one row per week of the month', () => {
    const { container } = render(
      <MonthCalendarGrid month={new Date(2026, 6, 1)} tasks={[]} events={[]} weekStartsOn={0} />,
    )
    const rows = container.querySelectorAll('[data-testid^="week-row-"]')
    expect(rows.length).toBeGreaterThanOrEqual(5)
    expect(rows.length).toBeLessThanOrEqual(6)
  })

  it('marks the current week', () => {
    const { container } = render(
      <MonthCalendarGrid month={new Date(2026, 6, 1)} tasks={[]} events={[]} weekStartsOn={0} now={new Date(2026, 6, 25)} />,
    )
    expect(container.querySelector('[data-current-week="true"]')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run to verify the new tests fail and the old ones pass**

Run: `npx vitest run src/components/planning/horizon/MonthCalendarGrid.test.tsx`
Expected: the three new tests FAIL; existing week-placement and "Open week chip" tests PASS.

- [ ] **Step 3: Rewrite the grid body as week rows**

Keep `rows` (already computed as six slices of seven), drop `cells` rendering. Add `data-testid="week-row-<index>"` and `data-current-week`. Trim trailing rows that contain no day of the target month. Preserve: `onPlaceTaskInWeek` drop handling on the row, `onOpenWeek` seam chip, `placedOnWeek` lane, `hideRail`, `readOnly`, `weekStartsOn`. Delete `onPlaceTask`, `WEEKDAY_LABELS`, `weekdayLabels`, `dragOverKey`, and the per-cell handlers.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/components/planning/horizon/MonthCalendarGrid.test.tsx src/components/planning/guided/stepTypes/PlaceOnWeeksStep.test.tsx`
Expected: PASS — the wizard's place-on-weeks step gets the new drawing for free.

- [ ] **Step 5: Commit**

```bash
git add src/components/planning/horizon/MonthCalendarGrid.tsx src/components/planning/horizon/MonthCalendarGrid.test.tsx
git commit -m "feat(month): the month draws weeks, because a week is what it places"
```

---

### Task 8: `/week` draws days, not hours

**Files:**
- Modify: `src/components/planning/PlanningGrid.tsx`
- Modify: `src/components/planning/PlanningSession.tsx:685-711` (pass the flag)
- Test: `src/components/planning/PlanningSession.test.tsx` (existing `placementGrain="day"` describe block at line 650)

**Interfaces:**
- Consumes: nothing new.
- Produces: `PlanningGridProps` gains `dayGrain?: boolean`. When true: no time-label column, no hour rows; each day column renders only its all-day items, filling the column.

In day-grain mode every write already sets `isAllDay: true`, so `allDayTasksByDate` already holds everything — this is a rendering change, not a data change.

- [ ] **Step 1: Add the failing tests**

```tsx
describe('placementGrain="day" draws days, not hours', () => {
  it('renders no hour labels', () => {
    render(<PlanningSession {...baseProps} placementGrain="day" />)
    expect(screen.queryByText('6 AM')).not.toBeInTheDocument()
    expect(screen.queryByText('10 PM')).not.toBeInTheDocument()
  })

  it('still renders one column per day of the range', () => {
    const { container } = render(<PlanningSession {...baseProps} placementGrain="day" />)
    expect(container.querySelectorAll('[data-testid^="day-column-"]')).toHaveLength(7)
  })

  it('keeps the hour grid when placementGrain is time', () => {
    render(<PlanningSession {...baseProps} placementGrain="time" />)
    expect(screen.getByText('6 AM')).toBeInTheDocument()
  })
})
```

Reuse the existing `baseProps` from the file's `placementGrain="day"` block; give it a 7-day `dateRange` if it doesn't already have one.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/components/planning/PlanningSession.test.tsx`
Expected: the first two FAIL (hour labels present, no `day-column-*` testids); the third PASSES.

- [ ] **Step 3: Implement day-grain rendering**

In `PlanningGrid.tsx` add `dayGrain?: boolean` to the props and destructure it. When `dayGrain`:
- skip the `timeLabels` column entirely (the `w-16` left rail);
- pass `timeLabels={[]}` and `dayStartHour`/`slotHeight` through unchanged so `PlanningColumn` renders no slots;
- give the column its all-day items with `laneHeight` unset so the lane grows naturally.

Add `data-testid={\`day-column-${dateKey}\`}` to each column wrapper. In `PlanningSession.tsx`, pass `dayGrain={dayGrain}` to both `<PlanningGrid>` call sites (lines ~685 and ~701). If `PlanningColumn` hard-codes slot rendering, guard it with the same flag.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/components/planning/PlanningSession.test.tsx src/components/planning/guided/stepTypes/ScheduleGridStep.test.tsx`
Expected: PASS. Both `/week` and the wizard's `place-rocks` now draw days.

- [ ] **Step 5: Commit**

```bash
git add src/components/planning/PlanningGrid.tsx src/components/planning/PlanningSession.tsx src/components/planning/PlanningSession.test.tsx
git commit -m "feat(week): the week draws days, and stops discarding the hour it drew"
```

---

### Task 9: Full verification — including with your eyes

- [ ] **Step 1: The whole suite**

```bash
npx tsc -b && npx vitest run && npm run build && npm run lint
```

Expected: all green. `npm run build` is not implied by `tsc -b` — pre-push tsc and the Vercel build differ.

- [ ] **Step 2: Look at the screen**

```bash
npm run dev   # MUST be port 5173 — other ports hit the sign-in wall
```

Open and confirm by eye, not by type-check:
- `/year` — five remaining claims on the ribbon (Iris on call, Beech, Catskills, Iris call week, Federico); density flatlines around week 36; ledger *On a week* column reads 0 against 14 moves; **no errand titles anywhere**.
- `/season` — September reads *wide open*.
- `/month` — 5 week rows, **no `Sun Mon Tue…` header anywhere**, Jul 19–25 ringed.
- `/week` — 7 day columns, **no hour axis**, Saturday 25 ringed.
- Wizard: `mountain-ranges`, `season-ahead`, `place-on-weeks`, `place-rocks` show the same four artifacts.
- Drag one move onto a week row on `/month`; confirm it lands in that row's lane and `week_start` is written.

- [ ] **Step 3: Push (this deploys to production)**

```bash
git fetch origin && git rebase origin/main
npx tsc -b && npx vitest run && npm run build
git push origin HEAD:main
```

Then verify the deploy landed — a push to `main` has silently failed to deploy before:

```bash
gh api repos/:owner/:repo/deployments --jq '.[0] | {sha,created_at,environment}'
```

Confirm `app.symphony-os.com` serves the new `/year`.
