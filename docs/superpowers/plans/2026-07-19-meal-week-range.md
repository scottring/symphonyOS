# Meal Plan Week Range (Partial Weeks) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A meal-plan week can declare an active `starts_on`…`ends_on` range within its Sunday-anchored week; the grid, header, chat consultant, and grocery list all respect it.

**Architecture:** Two nullable date columns on `meal_plans` (null = full week). One pure helper (`activeDayRange`) converts the ISO bounds to day-of-week indexes; the grid renders only active days, a header popover and a new `set_week_range` chat tool both write the columns, and the existing `meal_plans` realtime publication keeps the grid live.

**Tech Stack:** React 19 + TS strict, Vitest + RTL, Supabase (Postgres + realtime + Deno edge function), Anthropic tool loop.

**Spec:** `docs/superpowers/specs/2026-07-19-meal-week-range-design.md`

## Global Constraints

- Work only in the worktree `/Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/meal-week-range` (branch `meal-week-range`). Never edit or commit in the main worktree.
- Tests only pass under node 22.14.0: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"` before any `npx vitest run` / push. `npm test` is watch mode — always use `npx vitest run`.
- `day_of_week` is 0=Sunday..6=Saturday; `week_start` is that week's Sunday. Never change these semantics.
- No emojis anywhere in UI — lucide icons only.
- Chat/edge-function prompt output is plain text (no markdown); avoid apostrophes in single-quoted Deno strings (template literals are fine).
- DDL goes through the Supabase Management API (local migrations are out of sync); project ref `mwadppyrqzuzgstmwpuy`.
- Edge function deploys use `--use-api`.
- `meal_plans` and `meal_plan_entries` are already in the `supabase_realtime` publication (`supabase/migrations/2026-07-18_meal_realtime_publication.sql`) — do not re-add.

---

### Task 1: Schema — `starts_on` / `ends_on` on `meal_plans`

**Files:**
- Create: `supabase/migrations/2026-07-19_meal_plan_week_range.sql`

**Interfaces:**
- Produces: columns `meal_plans.starts_on date null`, `meal_plans.ends_on date null`, check constraint `meal_plans_range_within_week`. Later tasks read/write these columns.

- [ ] **Step 1: Write the migration file**

`supabase/migrations/2026-07-19_meal_plan_week_range.sql`:

```sql
-- 2026-07-19_meal_plan_week_range.sql
-- Partial weeks: a plan can declare an active starts_on..ends_on range within
-- its Sunday-anchored week. NULL = unbounded on that side; both NULL = the
-- full Sunday..Saturday week (all pre-existing rows). Entries outside the
-- range are kept, just hidden by the client.
alter table public.meal_plans
  add column if not exists starts_on date,
  add column if not exists ends_on date;

alter table public.meal_plans drop constraint if exists meal_plans_range_within_week;
alter table public.meal_plans add constraint meal_plans_range_within_week check (
  (starts_on is null or (starts_on >= week_start and starts_on <= week_start + 6))
  and (ends_on is null or (ends_on >= week_start and ends_on <= week_start + 6))
  and (starts_on is null or ends_on is null or starts_on <= ends_on)
);
```

- [ ] **Step 2: Apply it via the Management API**

The on-disk `~/.supabase/access-token` is stale; the live token is in the keychain:

```bash
SUPABASE_ACCESS_TOKEN=$(security find-generic-password -s "Supabase CLI" -a "access-token" -w | sed 's/^go-keyring-base64://' | base64 -d)
SQL=$(cat supabase/migrations/2026-07-19_meal_plan_week_range.sql | jq -Rs .)
curl -sS -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"query\": $SQL}"
```

Expected: `[]` (DDL returns no rows). Any `{"error": ...}` or `message` payload means it failed — stop and fix.

- [ ] **Step 3: Verify the columns exist**

```bash
SQL=$(printf '%s' "select column_name, data_type from information_schema.columns where table_schema='public' and table_name='meal_plans' order by ordinal_position" | jq -Rs .)
curl -sS -X POST "https://api.supabase.com/v1/projects/mwadppyrqzuzgstmwpuy/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"query\": $SQL}"
```

Expected: rows include `starts_on` and `ends_on`, both `date`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/2026-07-19_meal_plan_week_range.sql
git commit -m "feat(meals): starts_on/ends_on columns for partial-week plans"
```

---

### Task 2: `activeDayRange` helper in weekHelpers

**Files:**
- Modify: `src/lib/weekHelpers.ts`
- Test: `src/lib/weekHelpers.test.ts`

**Interfaces:**
- Produces: `export interface ActiveDayRange { firstDay: number; lastDay: number }` and `export function activeDayRange(weekStart: Date, startsOn: string | null, endsOn: string | null): ActiveDayRange`. Every later task derives the range through this — no component computes it itself.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/weekHelpers.test.ts` (add `activeDayRange` to the existing import from `./weekHelpers`):

```ts
describe('activeDayRange', () => {
  const weekStart = new Date(2026, 6, 12) // Sunday July 12, 2026 (local midnight)

  it('defaults to the full week when both bounds are null', () => {
    expect(activeDayRange(weekStart, null, null)).toEqual({ firstDay: 0, lastDay: 6 })
  })

  it('maps a partial range to day indexes (Tue→Sat)', () => {
    expect(activeDayRange(weekStart, '2026-07-14', '2026-07-18')).toEqual({ firstDay: 2, lastDay: 6 })
  })

  it('supports one-sided ranges', () => {
    expect(activeDayRange(weekStart, '2026-07-13', null)).toEqual({ firstDay: 1, lastDay: 6 })
    expect(activeDayRange(weekStart, null, '2026-07-16')).toEqual({ firstDay: 0, lastDay: 4 })
  })

  it('clamps out-of-week dates into 0..6', () => {
    expect(activeDayRange(weekStart, '2026-07-01', '2026-07-30')).toEqual({ firstDay: 0, lastDay: 6 })
  })

  it('collapses an inverted range instead of going negative', () => {
    expect(activeDayRange(weekStart, '2026-07-16', '2026-07-14')).toEqual({ firstDay: 4, lastDay: 4 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/weekHelpers.test.ts`
Expected: FAIL — `activeDayRange` is not exported.

- [ ] **Step 3: Implement**

Append to `src/lib/weekHelpers.ts`:

```ts
export interface ActiveDayRange {
  firstDay: number
  lastDay: number
}

/** Day-of-week bounds (0=Sun..6=Sat) of a plan's active range within its week.
 *  `startsOn`/`endsOn` are ISO dates (YYYY-MM-DD) or null; null = unbounded on
 *  that side, so (null, null) is the full week. Out-of-week dates clamp into
 *  0..6 and an inverted range collapses to a single day, so a malformed row
 *  can never produce an empty or negative grid. */
export function activeDayRange(weekStart: Date, startsOn: string | null, endsOn: string | null): ActiveDayRange {
  const firstDay = startsOn ? dayIndexInWeek(weekStart, startsOn) : 0
  const lastDay = endsOn ? dayIndexInWeek(weekStart, endsOn) : 6
  return lastDay < firstDay ? { firstDay, lastDay: firstDay } : { firstDay, lastDay }
}

function dayIndexInWeek(weekStart: Date, iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const start = new Date(weekStart)
  start.setHours(0, 0, 0, 0)
  // Math.round absorbs the one-hour DST drift inside a week.
  const diff = Math.round((date.getTime() - start.getTime()) / 86400000)
  return Math.min(6, Math.max(0, diff))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/weekHelpers.test.ts`
Expected: PASS (all, including the 4 pre-existing tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/weekHelpers.ts src/lib/weekHelpers.test.ts
git commit -m "feat(meals): activeDayRange helper for partial weeks"
```

---

### Task 3: Types + `useMealPlan` — range fields and `setWeekRange`

**Files:**
- Modify: `src/types/meal-planner.ts`
- Modify: `src/hooks/useMealPlan.ts`

**Interfaces:**
- Consumes: columns from Task 1.
- Produces: `DbMealPlan.starts_on/ends_on: string | null`; `MealPlan.startsOn/endsOn: string | null` (ISO strings, NOT Dates — they feed `activeDayRange` directly); `UseMealPlanResult.setWeekRange(startsOn: string | null, endsOn: string | null): Promise<void>`. Realtime: the hook's channel also listens to `meal_plans` UPDATEs so chat-set ranges refresh the grid.

- [ ] **Step 1: Extend the DB + app types and mapper**

In `src/types/meal-planner.ts`, `DbMealPlan` becomes:

```ts
export interface DbMealPlan {
  id: string
  user_id: string
  week_start: string  // YYYY-MM-DD
  starts_on: string | null  // YYYY-MM-DD within the week; null = week start
  ends_on: string | null    // YYYY-MM-DD within the week; null = week end
  created_at: string
  updated_at: string
}
```

`MealPlan` gains two fields:

```ts
export interface MealPlan {
  id: string
  userId: string
  weekStart: Date
  /** ISO YYYY-MM-DD bounds of the active (planned) range; null = week edge. */
  startsOn: string | null
  endsOn: string | null
  entries: MealPlanEntry[]
  createdAt: Date
  updatedAt: Date
}
```

`dbMealPlanToMealPlan` maps them:

```ts
export function dbMealPlanToMealPlan(
  row: DbMealPlan,
  entries: DbMealPlanEntry[],
): MealPlan {
  return {
    id: row.id,
    userId: row.user_id,
    weekStart: new Date(row.week_start),
    startsOn: row.starts_on ?? null,
    endsOn: row.ends_on ?? null,
    entries: entries.map(dbMealPlanEntryToMealPlanEntry),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}
```

- [ ] **Step 2: Add `setWeekRange` to `useMealPlan`**

In `src/hooks/useMealPlan.ts`, extend the result interface:

```ts
interface UseMealPlanResult {
  plan: MealPlan | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  addMeal: (input: AddMealInput) => Promise<void>
  removeMeal: (entryId: string) => Promise<void>
  setWeekRange: (startsOn: string | null, endsOn: string | null) => Promise<void>
}
```

Add the callback after `removeMeal` (optimistic update + rollback, same pattern as `removeMeal`):

```ts
const setWeekRange = useCallback(async (startsOn: string | null, endsOn: string | null) => {
  if (!plan) return
  const prev = { startsOn: plan.startsOn, endsOn: plan.endsOn }
  setPlan(p => p ? { ...p, startsOn, endsOn } : p)
  const { error: updErr } = await supabase.from('meal_plans')
    .update({ starts_on: startsOn, ends_on: endsOn })
    .eq('id', plan.id)
  if (updErr) {
    setPlan(p => p ? { ...p, ...prev } : p)
    setError(updErr.message)
  }
}, [plan])
```

Return it: `return { plan, loading, error, refresh, addMeal, removeMeal, setWeekRange }`.

- [ ] **Step 3: Listen for `meal_plans` updates on the existing channel**

In the realtime `useEffect`, add a second `.on` before `.subscribe()` so a chat-set range refreshes the open grid (`meal_plans` is already in the publication):

```ts
const channel = supabase
  .channel(`meal-plan-changes-${++mealPlanChannelSeq}`)
  .on('postgres_changes',
    { event: '*', schema: 'public', table: 'meal_plan_entries' },
    () => { void refreshRef.current() })
  .on('postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'meal_plans' },
    () => { void refreshRef.current() })
  .subscribe()
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. (No dedicated hook test: `setWeekRange` is a single guarded update; the mapper and range math are covered by Task 2's tests and Task 4/5's component tests, and the end-to-end write is verified in Task 8.)

- [ ] **Step 5: Commit**

```bash
git add src/types/meal-planner.ts src/hooks/useMealPlan.ts
git commit -m "feat(meals): plan range fields + setWeekRange in useMealPlan"
```

---

### Task 4: WeekGrid renders only active days

**Files:**
- Modify: `src/components/meals/plan/WeekGrid.tsx`
- Test: `src/components/meals/plan/WeekGrid.test.tsx`

**Interfaces:**
- Consumes: `ActiveDayRange` from Task 2.
- Produces: `WeekGridProps.activeRange: ActiveDayRange` (required prop). Skipped-day note text pattern: `SUN – MON · not planned`. `canLeftoverTomorrow` is now `slot === 'dinner' && d < activeRange.lastDay`.

- [ ] **Step 1: Write the failing tests**

In `src/components/meals/plan/WeekGrid.test.tsx`, add `activeRange` to `renderGrid` (and to the inline `rerender` in the realtime test) with a default of the full week:

```tsx
function renderGrid(overrideEntries: MealPlanEntry[] = entries, activeRange = { firstDay: 0, lastDay: 6 }) {
  return render(
    <WeekGrid
      weekStart={weekStart}
      entries={overrideEntries}
      recipesById={recipesById}
      activeRange={activeRange}
      onPickRecipe={vi.fn()}
      onTypeName={vi.fn()}
      onLeftoverFromLastNight={vi.fn()}
      onChangeRecipe={vi.fn()}
      onClear={vi.fn()}
      onLeftoverTomorrow={vi.fn()}
    />
  )
}
```

Append new tests:

```tsx
describe('WeekGrid partial weeks', () => {
  it('renders only the active days for a Tue→Sat range', () => {
    renderGrid(entries, { firstDay: 2, lastDay: 6 })
    expect(screen.queryByLabelText('Add breakfast for SUN')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Add breakfast for MON')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Add breakfast for TUE')).toBeInTheDocument()
    expect(screen.getByLabelText('Add breakfast for SAT')).toBeInTheDocument()
  })

  it('notes the skipped leading days', () => {
    renderGrid(entries, { firstDay: 2, lastDay: 6 })
    expect(screen.getByText('SUN – MON · not planned')).toBeInTheDocument()
  })

  it('notes a single skipped trailing day without a range dash', () => {
    renderGrid(entries, { firstDay: 0, lastDay: 5 })
    expect(screen.getByText('SAT · not planned')).toBeInTheDocument()
  })

  it('hides entries that fall outside the active range', () => {
    // Monday dinner entry exists but Monday is outside Tue→Sat.
    renderGrid(entries, { firstDay: 2, lastDay: 6 })
    expect(screen.queryByText('Sheet-pan chicken')).not.toBeInTheDocument()
  })

  it('disables "→ lunch tomorrow" on the last ACTIVE day, not just Saturday', async () => {
    const user = userEvent.setup()
    const friEntries: MealPlanEntry[] = [
      { id: 'e-fri-dinner', mealPlanId: 'plan1', dayOfWeek: 5, slot: 'dinner', recipeId: 'r1' },
    ]
    renderGrid(friEntries, { firstDay: 0, lastDay: 5 })
    await user.click(screen.getByLabelText('Dinner actions for FRI'))
    expect(screen.getByText('→ Lunch tomorrow')).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/meals/plan/WeekGrid.test.tsx`
Expected: FAIL — TS error on the new `activeRange` prop / missing rendering behavior.

- [ ] **Step 3: Implement**

In `src/components/meals/plan/WeekGrid.tsx`:

Import the type: `import type { ActiveDayRange } from '@/lib/weekHelpers'` and add to props:

```ts
export interface WeekGridProps {
  /** The Sunday that starts this week (matches `meal_plans.week_start`). */
  weekStart: Date
  /** Day-of-week bounds of the plan's active range (0=Sun..6=Sat). Days
   *  outside render nothing; their entries stay in the DB untouched. */
  activeRange: ActiveDayRange
  entries: MealPlanEntry[]
  // ...rest unchanged
}
```

Add a label helper above the component:

```ts
function skippedLabel(from: number, to: number): string {
  return from === to ? dayLabelFor(from) : `${dayLabelFor(from)} – ${dayLabelFor(to)}`
}
```

In the component body (destructure `activeRange` too), replace the hardcoded day list `[0, 1, 2, 3, 4, 5, 6].map(...)` with a derived list, and wrap with the skipped-day notes:

```tsx
const days = useMemo(
  () => Array.from(
    { length: activeRange.lastDay - activeRange.firstDay + 1 },
    (_, i) => activeRange.firstDay + i,
  ),
  [activeRange.firstDay, activeRange.lastDay],
)

return (
  <div className="flex-1 min-w-0 space-y-3">
    {activeRange.firstDay > 0 && (
      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-neutral-400 px-1">
        {skippedLabel(0, activeRange.firstDay - 1)} · not planned
      </div>
    )}
    {days.map(d => {
      /* ...existing per-day card body, unchanged except the SlotCell prop below... */
    })}
    {activeRange.lastDay < 6 && (
      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-neutral-400 px-1">
        {skippedLabel(activeRange.lastDay + 1, 6)} · not planned
      </div>
    )}
  </div>
)
```

Inside the per-day card, one prop changes on `SlotCell`:

```tsx
canLeftoverTomorrow={slot === 'dinner' && d < activeRange.lastDay}
```

Everything else in the card (date, today ring, prevDinner lookup) stays exactly as it was.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/meals/plan/WeekGrid.test.tsx`
Expected: PASS — all pre-existing tests (full-week default) plus the 5 new ones. Note: `PlanPage.tsx` will have a TS error until Task 5 wires the prop; that's expected at this commit boundary only if you run a full `tsc`. To keep every commit green, make the minimal PlanPage edit now: pass `activeRange={{ firstDay: 0, lastDay: 6 }}` to `<WeekGrid>` (Task 5 replaces it with the real value).

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit` — expected clean.

```bash
git add src/components/meals/plan/WeekGrid.tsx src/components/meals/plan/WeekGrid.test.tsx src/components/meals/plan/PlanPage.tsx
git commit -m "feat(meals): WeekGrid renders only the active day range"
```

---

### Task 5: Header range display + WeekRangePopover, wired in PlanPage

**Files:**
- Create: `src/components/meals/plan/WeekRangePopover.tsx`
- Test: `src/components/meals/plan/WeekRangePopover.test.tsx`
- Modify: `src/components/meals/plan/PlanPage.tsx`

**Interfaces:**
- Consumes: `activeDayRange`, `ActiveDayRange`, `dateForDayOfWeek`, `toIsoDate`, `dayLabelFor`, `formatDateMonthDay` (Task 2 / existing weekHelpers); `setWeekRange` (Task 3); `WeekGridProps.activeRange` (Task 4).
- Produces: `WeekRangePopover({ weekStart, activeRange, onChange })` where `onChange(startsOn: string | null, endsOn: string | null)` receives ISO dates, nulls for week edges.

- [ ] **Step 1: Write the failing tests**

`src/components/meals/plan/WeekRangePopover.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WeekRangePopover } from './WeekRangePopover'

const weekStart = new Date(2026, 6, 12) // Sunday July 12, 2026

describe('WeekRangePopover', () => {
  it('emits an ISO start date and null end for a Tue start', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<WeekRangePopover weekStart={weekStart} activeRange={{ firstDay: 0, lastDay: 6 }} onChange={onChange} />)
    await user.click(screen.getByLabelText('Edit week days'))
    await user.selectOptions(screen.getByLabelText(/First day/), '2')
    expect(onChange).toHaveBeenCalledWith('2026-07-14', null)
  })

  it('emits an ISO end date and null start for an early end', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<WeekRangePopover weekStart={weekStart} activeRange={{ firstDay: 0, lastDay: 6 }} onChange={onChange} />)
    await user.click(screen.getByLabelText('Edit week days'))
    await user.selectOptions(screen.getByLabelText(/Last day/), '4')
    expect(onChange).toHaveBeenCalledWith(null, '2026-07-16')
  })

  it('emits nulls on reset to full week', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<WeekRangePopover weekStart={weekStart} activeRange={{ firstDay: 2, lastDay: 5 }} onChange={onChange} />)
    await user.click(screen.getByLabelText('Edit week days'))
    await user.click(screen.getByText('Reset to full week'))
    expect(onChange).toHaveBeenCalledWith(null, null)
  })

  it('clamps the last day up when the first day passes it', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<WeekRangePopover weekStart={weekStart} activeRange={{ firstDay: 0, lastDay: 2 }} onChange={onChange} />)
    await user.click(screen.getByLabelText('Edit week days'))
    await user.selectOptions(screen.getByLabelText(/First day/), '4')
    expect(onChange).toHaveBeenCalledWith('2026-07-16', '2026-07-16')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/meals/plan/WeekRangePopover.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the popover**

`src/components/meals/plan/WeekRangePopover.tsx`:

```tsx
import { useState, useRef, useEffect } from 'react'
import { CalendarRange } from 'lucide-react'
import {
  dateForDayOfWeek, dayLabelFor, formatDateMonthDay, toIsoDate,
  type ActiveDayRange,
} from '@/lib/weekHelpers'

export interface WeekRangePopoverProps {
  weekStart: Date
  activeRange: ActiveDayRange
  onChange: (startsOn: string | null, endsOn: string | null) => void
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]

/** Header control for a week's active range: pick the first and last planned
 *  day of the Sunday-anchored week. Week edges (0 / 6) write null so a full
 *  week stores no bounds at all. */
export function WeekRangePopover({ weekStart, activeRange, onChange }: WeekRangePopoverProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const commit = (firstDay: number, lastDay: number) => {
    const clampedLast = Math.max(firstDay, lastDay)
    onChange(
      firstDay === 0 ? null : toIsoDate(dateForDayOfWeek(weekStart, firstDay)),
      clampedLast === 6 ? null : toIsoDate(dateForDayOfWeek(weekStart, clampedLast)),
    )
  }

  const dayOption = (d: number) => `${dayLabelFor(d)} ${formatDateMonthDay(dateForDayOfWeek(weekStart, d))}`

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Edit week days"
        className="p-2 rounded-full hover:bg-neutral-100 text-neutral-500"
      >
        <CalendarRange className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-2 z-40 card p-4 w-64 space-y-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-neutral-400">
            Planned days
          </div>
          <label className="block text-[13px] text-neutral-600">
            First day
            <select
              className="input-base mt-1 w-full"
              value={activeRange.firstDay}
              onChange={e => commit(Number(e.target.value), activeRange.lastDay)}
            >
              {ALL_DAYS.map(d => <option key={d} value={d}>{dayOption(d)}</option>)}
            </select>
          </label>
          <label className="block text-[13px] text-neutral-600">
            Last day
            <select
              className="input-base mt-1 w-full"
              value={activeRange.lastDay}
              onChange={e => commit(activeRange.firstDay, Number(e.target.value))}
            >
              {ALL_DAYS.filter(d => d >= activeRange.firstDay).map(d => (
                <option key={d} value={d}>{dayOption(d)}</option>
              ))}
            </select>
          </label>
          {(activeRange.firstDay > 0 || activeRange.lastDay < 6) && (
            <button
              onClick={() => { commit(0, 6); setOpen(false) }}
              className="text-[13px] text-primary-600 hover:underline"
            >
              Reset to full week
            </button>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/meals/plan/WeekRangePopover.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire PlanPage**

In `src/components/meals/plan/PlanPage.tsx`:

1. Imports — extend the weekHelpers import and add the popover:

```tsx
import { sundayOfWeek, formatDateMonthDay, dayLabelFor, dateForDayOfWeek, activeDayRange } from '@/lib/weekHelpers'
import { WeekRangePopover } from './WeekRangePopover'
```

2. Destructure the new hook method:

```tsx
const { plan, loading, error, addMeal, removeMeal, setWeekRange } = useMealPlan(weekStart)
```

3. Derive the range once, below the hook calls:

```tsx
const activeRange = useMemo(
  () => activeDayRange(weekStart, plan?.startsOn ?? null, plan?.endsOn ?? null),
  [weekStart, plan?.startsOn, plan?.endsOn],
)
const isPartial = activeRange.firstDay > 0 || activeRange.lastDay < 6
```

4. Update the leftover-tomorrow guard (the range replaces the hardcoded Saturday):

```tsx
const handleLeftoverTomorrow = useCallback((dayOfWeek: number, entry: MealPlanEntry) => {
  if (dayOfWeek >= activeRange.lastDay) return // no "tomorrow" inside the active range
  void addMeal({ dayOfWeek: dayOfWeek + 1, slot: 'lunch', leftoverFromId: entry.id })
}, [addMeal, activeRange.lastDay])
```

5. Header — replace the `<h1>` and add the popover right after it (before the next-week chevron):

```tsx
<h1 className="font-display text-[1.75rem] text-neutral-800 px-1">
  {isPartial ? (
    <span className="italic text-primary-500">
      {formatDateMonthDay(dateForDayOfWeek(weekStart, activeRange.firstDay))}
      {' – '}
      {formatDateMonthDay(dateForDayOfWeek(weekStart, activeRange.lastDay))}
    </span>
  ) : (
    <>Week of <span className="italic text-primary-500">{weekLabel}</span></>
  )}
</h1>
<WeekRangePopover weekStart={weekStart} activeRange={activeRange} onChange={setWeekRange} />
```

6. Pass the real range to the grid (replacing Task 4's placeholder):

```tsx
<WeekGrid
  weekStart={weekStart}
  activeRange={activeRange}
  ...
/>
```

- [ ] **Step 6: Typecheck + full meals tests**

Run: `npx tsc --noEmit && npx vitest run src/components/meals src/lib/weekHelpers.test.ts`
Expected: clean + all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/meals/plan/WeekRangePopover.tsx src/components/meals/plan/WeekRangePopover.test.tsx src/components/meals/plan/PlanPage.tsx
git commit -m "feat(meals): week-range header control + partial-week wiring in PlanPage"
```

---

### Task 6: Grocery consolidation skips hidden days

**Files:**
- Modify: `src/hooks/useGroceryStatus.ts`

**Interfaces:**
- Consumes: `activeDayRange` (Task 2), `MealPlan.startsOn/endsOn` (Task 3). Public signature of `useGroceryStatus` unchanged.

- [ ] **Step 1: Filter entries to the active range before consolidating**

In `src/hooks/useGroceryStatus.ts`, add the import:

```ts
import { activeDayRange } from '@/lib/weekHelpers'
```

Replace the `consolidated` memo:

```ts
const consolidated = useMemo(() => {
  if (!plan) return []
  // Hidden days keep their entries in the DB, but they must not feed the
  // shopping list — filter to the plan's active range first.
  const { firstDay, lastDay } = activeDayRange(plan.weekStart, plan.startsOn, plan.endsOn)
  const activePlan = {
    ...plan,
    entries: plan.entries.filter(e => e.dayOfWeek >= firstDay && e.dayOfWeek <= lastDay),
  }
  return consolidateIngredients(activePlan, recipes)
}, [plan, recipes])
```

- [ ] **Step 2: Typecheck and run the meals suite**

Run: `npx tsc --noEmit && npx vitest run src/components/meals src/hooks src/lib`
Expected: clean + PASS (behavior is a pure filter over already-tested pieces).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useGroceryStatus.ts
git commit -m "feat(meals): grocery consolidation respects the active week range"
```

---

### Task 7: Chat — `set_week_range` tool + range-aware consultant

**Files:**
- Modify: `supabase/functions/meal-planner-chat/index.ts`

**Interfaces:**
- Consumes: columns from Task 1; `resolvePlanId`, `asNonEmptyString`, `PlanContext`, `buildSystemPrompt`, `runTool` (all existing in this file).
- Produces: tool `set_week_range({ starts_on?, ends_on? })`; `PlanContext.startsOn/endsOn: string | null`; a range line + rules in the system prompt. The client needs no changes — realtime (Task 3 Step 3) picks up the row update.

- [ ] **Step 1: Add an ISO date-add helper**

Below `seasonalGroundingLine` in `supabase/functions/meal-planner-chat/index.ts`:

```ts
/** Add days to a YYYY-MM-DD string in UTC (no timezone drift). */
function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}
```

- [ ] **Step 2: Load the range into PlanContext**

`PlanContext` gains two fields:

```ts
interface PlanContext {
  planId: string | null
  startsOn: string | null
  endsOn: string | null
  entries: Array<{ id: string; day_of_week: number; slot: string; recipe_id: string | null; ad_hoc_title: string | null; leftover_from: string | null }>
  recipes: Array<{ id: string; title: string; tags: string[] | null; prep_minutes: number | null }>
  preferences: string | null
}
```

In `loadContext`, select the columns and thread them through:

```ts
const { data: planRows, error: planErr } = await db
  .from('meal_plans').select('id, starts_on, ends_on')
  .eq('week_start', weekStart)
  .order('created_at', { ascending: true })
  .limit(1)
if (planErr) throw planErr
const planRow = planRows?.[0] ?? null
const planId: string | null = planRow?.id ?? null
```

and in the return:

```ts
return {
  planId,
  startsOn: planRow?.starts_on ?? null,
  endsOn: planRow?.ends_on ?? null,
  entries,
  recipes: recipes ?? [],
  preferences: prefRows?.[0]?.content ?? null,
}
```

- [ ] **Step 3: Add the tool schema**

Append to the `TOOLS` array (after `update_preferences`; note: no apostrophes in these single-quoted strings):

```ts
{
  name: 'set_week_range',
  description: 'Set which days of this week are actively planned, e.g. when the household is away for part of the week. Pass starts_on and/or ends_on as YYYY-MM-DD dates inside this week. Omit a bound to leave that side at the week edge; omit both to reset to the full week. Never propose or set meals on days outside the active range.',
  input_schema: {
    type: 'object',
    properties: {
      starts_on: { type: 'string', description: 'First planned day, YYYY-MM-DD, within this week. Omit for the week start (Sunday).' },
      ends_on: { type: 'string', description: 'Last planned day, YYYY-MM-DD, within this week. Omit for the week end (Saturday).' },
    },
  },
},
```

- [ ] **Step 4: Implement the tool in `runTool`**

Add a case before `default:`:

```ts
case 'set_week_range': {
  const weekEnd = addDaysIso(weekStart, 6)
  const parseBound = (v: unknown, label: string): { value: string | null } | { err: string } => {
    const s = asNonEmptyString(v)
    if (!s) return { value: null }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { err: `Error: ${label} must be YYYY-MM-DD.` }
    if (s < weekStart || s > weekEnd) return { err: `Error: ${label} must be within ${weekStart}..${weekEnd} (this week).` }
    return { value: s }
  }
  const start = parseBound(input.starts_on, 'starts_on')
  if ('err' in start) return start.err
  const end = parseBound(input.ends_on, 'ends_on')
  if ('err' in end) return end.err
  if (start.value && end.value && start.value > end.value) {
    return 'Error: starts_on must not be after ends_on.'
  }

  const planId = await resolvePlanId(db, userId, weekStart, planCache)
  const { error } = await db.from('meal_plans')
    .update({ starts_on: start.value, ends_on: end.value })
    .eq('id', planId)
  if (error) throw error
  return `Active range set: ${start.value ?? weekStart} through ${end.value ?? weekEnd}.`
}
```

- [ ] **Step 5: Make the system prompt range-aware**

In `buildSystemPrompt`, compute a range line next to `seasonLine`:

```ts
const weekEnd = addDaysIso(weekStart, 6)
const rangeLine = (ctx.startsOn || ctx.endsOn)
  ? `ACTIVE RANGE: this week is PARTIAL. Only ${ctx.startsOn ?? weekStart} through ${ctx.endsOn ?? weekEnd} is being planned. Never propose meals, call set_slot, or suggest groceries for days outside this range.`
  : ''
```

Render it right after `${seasonLine}` in the returned template:

```
${seasonLine}
${rangeLine}
```

Add one rule to the `Day/slot model:` section (after the set_slot/clear_slot line):

```
- The week can be PARTIAL. If the user says they are away or unavailable for part of the week ("we get back Tuesday", "we leave Friday morning"), call set_week_range with the first and/or last planned date, then plan only the days inside the range. Days outside the active range never get proposals, set_slot calls, or grocery items.
```

And in the consultation flow, change the line

`- Default to proposing all 7 dinner nights.` (start of the existing bullet)

to

`- Default to proposing a dinner for every night in the active range (all 7 when the week is full).` (rest of the bullet unchanged).

- [ ] **Step 6: Deploy and commit**

```bash
npx supabase functions deploy meal-planner-chat --project-ref mwadppyrqzuzgstmwpuy --use-api
```

Expected: deploy success output naming `meal-planner-chat`.

```bash
git add supabase/functions/meal-planner-chat/index.ts
git commit -m "feat(meals): set_week_range chat tool + range-aware consultant prompt"
```

---

### Task 8: Verify end-to-end and ship

**Files:** none new — verification + push.

- [ ] **Step 1: Full local gates**

```bash
export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
npx tsc --noEmit && npm run build && npm run lint && npx vitest run
```

Expected: all clean/PASS. (CI runs lint but the pre-push hook doesn't — lint before pushing.)

- [ ] **Step 2: Drive the real flow**

Start the dev server in the worktree (`npm run dev`) and verify in the browser on `/meals`:
1. Open the range popover (calendar-range icon in the header), set First day = Tue → grid drops Sun/Mon, header shows the date range, "SUN – MON · not planned" note appears.
2. Reload the page → the range persists (row was written).
3. Reset to full week → all 7 days return, header shows "Week of …".
4. In the chat rail: "we are away until Monday night, plan our dinners" → consultant proposes Tue–Sat only; on acceptance the grid fills Tue–Sat and the range chip/header update via realtime (set_week_range tool ran).
5. Build shopping list with a partial range → items only from active-day meals.

- [ ] **Step 3: Rebase and push to main**

```bash
git fetch origin && git rebase origin/main
git push origin HEAD:main
```

Expected: pre-push hook runs tsc + tests, push succeeds, Vercel auto-deploys. Verify the deployment actually triggered (`gh api repos/{owner}/{repo}/deployments --jq '.[0]'` or Vercel dashboard — pushes have silently missed the webhook before).

- [ ] **Step 4: Clean up**

```bash
git worktree remove /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/meal-week-range
```

(Only after the push is confirmed on origin/main.)
