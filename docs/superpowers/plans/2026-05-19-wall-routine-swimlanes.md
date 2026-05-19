# Wall Routines — Swimlanes + Daily Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the Morning/Bedtime card as per-child swimlanes (colored rail + avatar chip + progress), and add a wall-local toggle that hides everyday routines from the right-column TODAY list and the Day-grid Today quadrant (never the routine card).

**Architecture:** Extend the existing pure `groupRoutineStepsByOwner` to carry the member's `color`/`initials`; `WallNowCard` renders swimlane C from that (still presentational). A new `isEverydayRoutine` flag is computed in `buildTodayItems`; a pure `filterDailyRoutines` helper drops flagged items at one shared point in `WallCalendar` (`visibleTodayItems`) that feeds both list consumers. Toggle state mirrors the existing `wall-camera-enabled` localStorage pattern; the button lives in `WallRightColumn`'s TODAY header.

**Tech Stack:** React 19 + TypeScript strict, Tailwind v4, Vitest + RTL, lucide-react. Path alias `@/` → `src/`.

**Spec:** [`docs/superpowers/specs/2026-05-19-wall-routine-swimlanes-design.md`](../specs/2026-05-19-wall-routine-swimlanes-design.md)

---

## File Structure

| File | Responsibility | New/Modified |
|---|---|---|
| `src/components/wall/today/groupRoutineStepsByOwner.ts` | Add `color`/`initials` to `RoutineGroup` | Modify |
| `src/components/wall/WallNowCard.tsx` | Swimlane C render for morning/bedtime groups | Modify |
| `src/components/wall/today/todayItem.ts` | Set `isEverydayRoutine` flag on routine-step items | Modify |
| `src/components/wall/today/filterDailyRoutines.ts` | Pure filter helper | Create |
| `src/components/wall/WallRightColumn.tsx` | hideDaily toggle button in TODAY header | Modify |
| `src/components/wall/WallCalendar.tsx` | hideDaily state/persistence; `visibleTodayItems` feeding right column + day grid | Modify |

Tests live beside each source file (`*.test.ts(x)`), matching the wall convention.

Environment for all test/build commands: prefix with
`export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"; ` — run a file with `npx vitest run <path>`.

---

### Task 1: Carry `color`/`initials` on `RoutineGroup`

**Files:**
- Modify: `src/components/wall/today/groupRoutineStepsByOwner.ts`
- Test: `src/components/wall/today/groupRoutineStepsByOwner.test.ts`

- [ ] **Step 1: Add failing assertions**

In `src/components/wall/today/groupRoutineStepsByOwner.test.ts`, replace the test `it('groups two kids’ identically-named steps into one group each, labeled by member name', () => {` block body's assertions — keep the setup, change the assertion lines so the block reads exactly:

```typescript
  it('groups two kids’ identically-named steps into one group each, labeled by member name', () => {
    const steps = [
      step('k1', 'Get dressed', 'k', 6),
      step('e1', 'Get dressed', 'e', 6),
      step('k2', 'Brush teeth', 'k', 7),
      step('e2', 'Brush teeth', 'e', 7),
    ]
    const groups = groupRoutineStepsByOwner(steps, [KALEB, ELLA])
    expect(groups.map(g => g.label)).toEqual(['Kaleb', 'Ella'])
    expect(groups[0].steps.map(s => s.id)).toEqual(['k1', 'k2'])
    expect(groups[1].steps.map(s => s.id)).toEqual(['e1', 'e2'])
    expect(groups[0].color).toBe('blue')
    expect(groups[0].initials).toBe('KA')
    expect(groups[1].color).toBe('blue')
    expect(groups[1].initials).toBe('EL')
  })
```

Then update the "Anyone" test (`it('buckets unknown / null owners into a trailing "Anyone" group', ...)`) — append these two assertions just before its closing `})`:

```typescript
    expect(groups[1].color).toBeNull()
    expect(groups[1].initials).toBeNull()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/wall/today/groupRoutineStepsByOwner.test.ts`
Expected: FAIL — `color`/`initials` are `undefined` (property does not exist on `RoutineGroup`).

- [ ] **Step 3: Implement**

In `src/components/wall/today/groupRoutineStepsByOwner.ts`, change the `RoutineGroup` interface to:

```typescript
export interface RoutineGroup {
  /** The matched family member's id, or null for the catch-all group. */
  ownerId: string | null
  /** Display label — the member's name, or "Anyone" for unowned/unknown. */
  label: string
  /** The member's color; null for the "Anyone" group. */
  color: string | null
  /** The member's initials; null for the "Anyone" group. */
  initials: string | null
  steps: TodayItem[]
}
```

Change the owned-groups `.map(...)` to include color/initials:

```typescript
  const groups: RoutineGroup[] = [...owned.values()]
    .sort((a, b) => a.member.display_order - b.member.display_order)
    .map(({ member, steps }) => ({
      ownerId: member.id,
      label: member.name,
      color: member.color,
      initials: member.initials,
      steps: [...steps].sort(byStartTime),
    }))
```

And the unowned push to:

```typescript
  if (unowned.length > 0) {
    groups.push({
      ownerId: null,
      label: UNOWNED_LABEL,
      color: null,
      initials: null,
      steps: [...unowned].sort(byStartTime),
    })
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/wall/today/groupRoutineStepsByOwner.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/wall/today/groupRoutineStepsByOwner.ts src/components/wall/today/groupRoutineStepsByOwner.test.ts
git -c commit.gpgsign=false commit -m "feat(wall): carry member color/initials on RoutineGroup"
```

---

### Task 2: Swimlane C render in `WallNowCard`

**Files:**
- Modify: `src/components/wall/WallNowCard.tsx`
- Test: `src/components/wall/WallNowCard.test.tsx`

- [ ] **Step 1: Update fixtures + add failing assertions**

The three existing `routineGroups` test objects in `src/components/wall/WallNowCard.test.tsx` omit `color`/`initials`, which is now required and will not compile. In that file, every object literal of shape `{ ownerId: 'k', label: 'Kaleb', steps: [...] }` (and the `'e'`/Ella one) must gain `color` + `initials`. Concretely, replace each `{ ownerId: 'k', label: 'Kaleb', steps: [` with `{ ownerId: 'k', label: 'Kaleb', color: '#F59E0B', initials: 'KA', steps: [` and each `{ ownerId: 'e', label: 'Ella', steps: [` with `{ ownerId: 'e', label: 'Ella', color: '#10B981', initials: 'EL', steps: [`.

Then add this test inside the `describe('WallNowCard', ...)` block, after the existing `it('checking a grouped routine step calls onCheckItem with that step id', ...)`:

```typescript
  it('renders a swimlane per child with avatar initials and done/total progress', () => {
    render(
      <WallNowCard
        focus={{ kind: 'mode-default', mode: 'morning' }}
        pinned={false}
        onPinToggle={() => {}}
        familyPrompt={null}
        routineGroups={[
          { ownerId: 'k', label: 'Kaleb', color: '#F59E0B', initials: 'KA', steps: [
            { id: 'k1', kind: 'routine-step', title: 'K dressed', completed: true, ownerId: 'k', startTime: new Date(), sourceId: 'k1' },
            { id: 'k2', kind: 'routine-step', title: 'K teeth', completed: false, ownerId: 'k', startTime: new Date(), sourceId: 'k2' },
          ] },
        ]}
      />
    )
    expect(screen.getByText('KA')).toBeInTheDocument()
    expect(screen.getByText('Kaleb')).toBeInTheDocument()
    expect(screen.getByText('1/2')).toBeInTheDocument()
  })

  it('renders the "Anyone" group without an avatar/initials chip', () => {
    render(
      <WallNowCard
        focus={{ kind: 'mode-default', mode: 'bedtime' }}
        pinned={false}
        onPinToggle={() => {}}
        familyPrompt={null}
        routineGroups={[
          { ownerId: null, label: 'Anyone', color: null, initials: null, steps: [
            { id: 'a1', kind: 'routine-step', title: 'Lock door', completed: false, ownerId: null, startTime: new Date(), sourceId: 'a1' },
          ] },
        ]}
      />
    )
    expect(screen.getByText('Anyone')).toBeInTheDocument()
    expect(screen.getByText('Lock door')).toBeInTheDocument()
    expect(screen.getByText('0/1')).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/wall/WallNowCard.test.tsx`
Expected: FAIL — no `KA`/`1/2`/`0/1` text (current render shows only `group.label` in a grey div).

- [ ] **Step 3: Implement the swimlane**

In `src/components/wall/WallNowCard.tsx`, replace the grouped `<div className={`grid gap-x-10 gap-y-5 ...`}>…</div>` block (the `groups.map(group => ( <div key={group.ownerId ?? 'anyone'}> … </div> ))` wrapper) with exactly:

```tsx
            <div
              className={`grid gap-x-8 gap-y-5 ${groups.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}
            >
              {groups.map(group => {
                const done = group.steps.filter(s => s.completed).length
                return (
                  <div key={group.ownerId ?? 'anyone'} className="flex gap-3 min-w-0">
                    <div
                      className="w-1 rounded-full shrink-0"
                      style={{ background: group.color ?? 'rgba(255,255,255,0.2)' }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        {group.initials && (
                          <span
                            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                            style={{ background: group.color ?? 'rgba(255,255,255,0.25)' }}
                          >
                            {group.initials}
                          </span>
                        )}
                        <span className="text-sm font-semibold tracking-wide text-white/90 truncate">
                          {group.label}
                        </span>
                        <span className="ml-auto text-[11px] font-semibold tracking-widest text-white/45 shrink-0">
                          {done}/{group.steps.length}
                        </span>
                      </div>
                      <ul className="space-y-2">
                        {group.steps.map(step => (
                          <RoutineStepRow key={step.id} step={step} onCheckItem={props.onCheckItem} />
                        ))}
                      </ul>
                    </div>
                  </div>
                )
              })}
            </div>
```

Leave everything else in the morning/bedtime branch unchanged (eyebrow label, "N steps left" headline, the no-groups flat fallback).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/wall/WallNowCard.test.tsx`
Expected: PASS (all, including the 2 new ones and the prior grouped/tap tests with updated fixtures).

- [ ] **Step 5: Commit**

```bash
git add src/components/wall/WallNowCard.tsx src/components/wall/WallNowCard.test.tsx
git -c commit.gpgsign=false commit -m "feat(wall): swimlane C render for per-child Morning/Bedtime card"
```

---

### Task 3: `isEverydayRoutine` flag on `TodayItem`

**Files:**
- Modify: `src/components/wall/today/todayItem.ts`
- Test: `src/components/wall/today/todayItem.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

Create `src/components/wall/today/todayItem.test.ts` with exactly:

```typescript
import { describe, it, expect } from 'vitest'
import { buildTodayItems } from './todayItem'
import type { TimelineItem } from '@/types/timeline'
import type { DaySection } from '@/lib/timeUtils'

function sections(items: TimelineItem[]): Record<DaySection, TimelineItem[]> {
  return { allday: [], morning: items, afternoon: [], evening: [], unscheduled: [] }
}

function tl(over: Partial<TimelineItem>): TimelineItem {
  return {
    id: 'x', title: 'x', type: 'routine', completed: false,
    startTime: new Date('2026-05-19T06:00:00'), ...over,
  } as unknown as TimelineItem
}

describe('buildTodayItems isEverydayRoutine flag', () => {
  it('flags a daily routine step as everyday', () => {
    const items = buildTodayItems(sections([
      tl({ id: 'r1', title: 'Brush teeth', type: 'routine', recurrencePattern: { type: 'daily' } as never }),
    ]))
    expect(items[0].kind).toBe('routine-step')
    expect(items[0].isEverydayRoutine).toBe(true)
  })

  it('does not flag a weekly Tue/Thu routine as everyday', () => {
    const items = buildTodayItems(sections([
      tl({ id: 'r2', title: 'Soccer', type: 'routine', recurrencePattern: { type: 'weekly', days: ['tue', 'thu'] } as never }),
    ]))
    expect(items[0].isEverydayRoutine).toBe(false)
  })

  it('leaves non-routine items undefined', () => {
    const items = buildTodayItems(sections([
      tl({ id: 't1', title: 'Pay bill', type: 'task', recurrencePattern: undefined }),
    ]))
    expect(items[0].kind).toBe('task')
    expect(items[0].isEverydayRoutine).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/wall/today/todayItem.test.ts`
Expected: FAIL — `isEverydayRoutine` is `undefined` for the daily routine (property not set / not on type).

- [ ] **Step 3: Implement**

In `src/components/wall/today/todayItem.ts`:

Add import at the top (after the existing imports):

```typescript
import { isEverydayRoutine } from '@/lib/routineUtils'
```

Add the field to the `TodayItem` interface (after `discussionNote?: string`):

```typescript
  /** True when this is a routine-step whose routine recurs every weekday. */
  isEverydayRoutine?: boolean
```

In the loop body, replace the single `all.push({ ... })` call with a version that computes `kind` once and sets the flag:

```typescript
      const kind = kindFor(item)
      all.push({
        id: item.id,
        kind,
        title: item.title,
        completed: item.completed,
        ownerId: owner,
        startTime: item.startTime,
        sourceId: item.id,
        needsDiscussion: item.needsDiscussion,
        discussionNote: item.discussionNote,
        isEverydayRoutine:
          kind === 'routine-step'
            ? isEverydayRoutine(item.recurrencePattern)
            : undefined,
      })
```

(Remove the now-unused inline `kind: kindFor(item),` — it is replaced by `kind,` above.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/wall/today/todayItem.test.ts`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add src/components/wall/today/todayItem.ts src/components/wall/today/todayItem.test.ts
git -c commit.gpgsign=false commit -m "feat(wall): flag everyday routines on TodayItem"
```

---

### Task 4: `filterDailyRoutines` pure helper

**Files:**
- Create: `src/components/wall/today/filterDailyRoutines.ts`
- Test: `src/components/wall/today/filterDailyRoutines.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/components/wall/today/filterDailyRoutines.test.ts` with exactly:

```typescript
import { describe, it, expect } from 'vitest'
import { filterDailyRoutines } from './filterDailyRoutines'
import type { TodayItem } from './todayItem'

function item(id: string, kind: TodayItem['kind'], everyday?: boolean): TodayItem {
  return {
    id, kind, title: id, completed: false, ownerId: null,
    startTime: null, sourceId: id, isEverydayRoutine: everyday,
  }
}

describe('filterDailyRoutines', () => {
  const items = [
    item('daily', 'routine-step', true),
    item('weekly', 'routine-step', false),
    item('task', 'task'),
    item('event', 'event'),
  ]

  it('returns the same array reference when hideDaily is false', () => {
    expect(filterDailyRoutines(items, false)).toBe(items)
  })

  it('drops only everyday-routine items when hideDaily is true', () => {
    const out = filterDailyRoutines(items, true)
    expect(out.map(i => i.id)).toEqual(['weekly', 'task', 'event'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/wall/today/filterDailyRoutines.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/components/wall/today/filterDailyRoutines.ts` with exactly:

```typescript
import type { TodayItem } from './todayItem'

/**
 * When `hideDaily` is on, drop items that are everyday-recurring routine
 * steps (the low-value "brush teeth / get dressed" clutter). Tasks, events,
 * and non-everyday routines are always kept. Returns the original array
 * reference unchanged when the toggle is off (stable identity for memo deps).
 */
export function filterDailyRoutines(
  items: TodayItem[],
  hideDaily: boolean,
): TodayItem[] {
  if (!hideDaily) return items
  return items.filter(i => !i.isEverydayRoutine)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/wall/today/filterDailyRoutines.test.ts`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add src/components/wall/today/filterDailyRoutines.ts src/components/wall/today/filterDailyRoutines.test.ts
git -c commit.gpgsign=false commit -m "feat(wall): add filterDailyRoutines pure helper"
```

---

### Task 5: hideDaily toggle in `WallRightColumn` TODAY header

**Files:**
- Modify: `src/components/wall/WallRightColumn.tsx`
- Test: `src/components/wall/WallRightColumn.test.tsx` (create if absent)

- [ ] **Step 1: Write the failing test**

Create `src/components/wall/WallRightColumn.test.tsx` with exactly:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WallRightColumn } from './WallRightColumn'

const base = {
  todayItems: [],
  discussItems: [],
  upcomingDays: [],
  members: [],
  selectedOwnerId: null,
  onSelectOwner: () => {},
  onCheckItem: () => {},
  onTapEvent: () => {},
  onResolveDiscussion: () => {},
}

describe('WallRightColumn hideDaily toggle', () => {
  it('renders the toggle and calls onToggleHideDaily when tapped', () => {
    const onToggleHideDaily = vi.fn()
    render(<WallRightColumn {...base} hideDaily={false} onToggleHideDaily={onToggleHideDaily} />)
    fireEvent.click(screen.getByRole('button', { name: /hide daily routines/i }))
    expect(onToggleHideDaily).toHaveBeenCalledTimes(1)
  })

  it('labels the control "Show daily routines" when already hiding', () => {
    render(<WallRightColumn {...base} hideDaily={true} onToggleHideDaily={() => {}} />)
    expect(screen.getByRole('button', { name: /show daily routines/i })).toBeInTheDocument()
  })

  it('renders no toggle when onToggleHideDaily is omitted', () => {
    render(<WallRightColumn {...base} />)
    expect(screen.queryByRole('button', { name: /daily routines/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/wall/WallRightColumn.test.tsx`
Expected: FAIL — props don't exist; no such button.

- [ ] **Step 3: Implement**

In `src/components/wall/WallRightColumn.tsx`:

Add to the imports block:

```typescript
import { Eye, EyeOff } from 'lucide-react'
```

Add two optional props to `WallRightColumnProps` (before its closing `}`):

```typescript
  hideDaily?: boolean
  onToggleHideDaily?: () => void
```

Add them to the destructured params (after `onTapUpcoming,`):

```typescript
  hideDaily, onToggleHideDaily,
```

Replace the line:

```tsx
      <div className="text-[10px] uppercase tracking-widest text-white/50 px-1">Today</div>
```

with:

```tsx
      <div className="flex items-center justify-between px-1">
        <div className="text-[10px] uppercase tracking-widest text-white/50">Today</div>
        {onToggleHideDaily && (
          <button
            type="button"
            onClick={onToggleHideDaily}
            aria-label={hideDaily ? 'Show daily routines' : 'Hide daily routines'}
            title={hideDaily ? 'Show daily routines' : 'Hide daily routines'}
            className={`w-11 h-11 -my-2 flex items-center justify-center rounded-md transition-colors ${
              hideDaily ? 'text-white/70' : 'text-white/35 hover:text-white/60'
            }`}
          >
            {hideDaily ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/wall/WallRightColumn.test.tsx`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add src/components/wall/WallRightColumn.tsx src/components/wall/WallRightColumn.test.tsx
git -c commit.gpgsign=false commit -m "feat(wall): hideDaily toggle button in right-column TODAY header"
```

---

### Task 6: Wire hideDaily into `WallCalendar`

**Files:**
- Modify: `src/components/wall/WallCalendar.tsx`

- [ ] **Step 1: Add import + state + filtered list**

Add to the wall imports (next to the other `./today/...` imports):

```tsx
import { filterDailyRoutines } from './today/filterDailyRoutines'
```

Add state next to the existing `cameraEnabled` state (right after the `const [cameraEnabled, setCameraEnabled] = useState(() => …)` declaration):

```tsx
  const [hideDaily, setHideDaily] = useState(() =>
    localStorage.getItem('wall-hide-daily') === 'true'
  )
  const toggleHideDaily = useCallback(() => {
    setHideDaily(prev => {
      const next = !prev
      localStorage.setItem('wall-hide-daily', String(next))
      return next
    })
  }, [])
```

Add a `visibleTodayItems` memo immediately AFTER the `discussItems` memo (the `const discussItems = useMemo(...)` line):

```tsx
  const visibleTodayItems = useMemo(
    () => filterDailyRoutines(todayItemsForList, hideDaily),
    [todayItemsForList, hideDaily],
  )
```

- [ ] **Step 2: Feed the filtered list to both consumers**

In the `dayGrid` `useMemo`, change `todayItems: todayItemsForList,` to `todayItems: visibleTodayItems,` and replace `todayItemsForList` with `visibleTodayItems` in that memo's dependency array.

In the `<WallRightColumn ... />` JSX, change `todayItems={todayItemsForList}` to `todayItems={visibleTodayItems}` and add two props alongside the others:

```tsx
          hideDaily={hideDaily}
          onToggleHideDaily={toggleHideDaily}
```

Leave `discussItems={discussItems}` as-is — it must keep deriving from the unfiltered `todayItemsForList`.

- [ ] **Step 3: Build + lint + full wall suite**

Run: `npm run build`
Expected: TypeScript + Vite build succeed, zero type errors.

Run: `npx eslint src/components/wall/WallCalendar.tsx src/components/wall/WallNowCard.tsx src/components/wall/WallRightColumn.tsx src/components/wall/today/groupRoutineStepsByOwner.ts src/components/wall/today/todayItem.ts src/components/wall/today/filterDailyRoutines.ts`
Expected: 0 errors; no NEW warnings vs. the file's prior state (WallCalendar has 6 pre-existing warnings — those are fine).

Run: `npx vitest run src/components/wall/`
Expected: all wall tests green (existing + new from Tasks 1–5).

- [ ] **Step 4: Manual verification (record in commit body; do NOT fabricate)**

The agentic worker cannot visually verify an 8-ft TV. Confirm only the automated portion (`npm run build` compiles the whole app). State explicitly that on-wall visual verification (swimlane look, toggle, filter effect) is deferred to a human. Do NOT claim it was performed.

- [ ] **Step 5: Commit**

```bash
git add src/components/wall/WallCalendar.tsx
git -c commit.gpgsign=false commit -m "feat(wall): wire hideDaily toggle + filtered list into WallCalendar

Right column TODAY list and Day-grid Today quadrant honor a
wall-local 'wall-hide-daily' toggle (everyday routines hidden);
discussItems and the Morning/Bedtime swimlane card are unaffected.
Automated gates green; on-wall visual check pending human."
```

---

## Self-Review

**Spec coverage:**
- Swimlane C (rail + avatar chip + name + done/total + checklist) → Task 1 (color/initials data) + Task 2 (render).
- "Anyone" group neutral (no initials chip, neutral rail) → Task 2 (`group.initials &&` guard, `?? 'rgba(255,255,255,0.2)'` rail).
- Layout 2-col/1-col, headline unchanged, flat fallback intact → Task 2 (wrapper kept; only inner column markup replaced; fallback untouched).
- `isEverydayRoutine` flag on `TodayItem` via `recurrencePattern` → Task 3.
- Single filter point feeding right column + Day quadrant → Task 4 (helper) + Task 6 (`visibleTodayItems` → both `WallRightColumn` and `buildDayGrid`).
- `discussItems` stays unfiltered → Task 6 Step 2 (explicitly left on `todayItemsForList`).
- Morning/Bedtime card never filtered → unaffected by construction: it uses `routineSteps`/`routineGroups`, a path Task 6 does not touch.
- Wall-local toggle, `wall-hide-daily`, default off, camera-pattern persistence → Task 6 Step 1.
- Toggle UI in right-column TODAY header, ≥44px, active state, aria/title → Task 5.
- No shared key with Today view's `hideRoutines` → Task 6 uses a distinct `wall-hide-daily` key only.
- Tests for each unit → Tasks 1–5 each ship tests; Task 6 runs the full suite.

**Placeholder scan:** No TBD/TODO; every code step has complete code; commands have expected output. Clean.

**Type consistency:** `RoutineGroup.color: string | null` / `initials: string | null` defined in Task 1, consumed in Task 2 (`group.color ?? …`, `group.initials &&`) and in updated fixtures. `TodayItem.isEverydayRoutine?: boolean` defined Task 3, consumed by `filterDailyRoutines` (Task 4) and asserted in Task 4 test fixtures. `filterDailyRoutines(items, hideDaily)` signature consistent Task 4 → Task 6. `WallRightColumn` new props `hideDaily?`/`onToggleHideDaily?` defined Task 5, passed in Task 6. `visibleTodayItems` introduced once (Task 6) and used in both consumers.
