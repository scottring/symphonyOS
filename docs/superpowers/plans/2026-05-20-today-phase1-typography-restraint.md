# Today Phase 1 — Typography & Restraint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close ~60% of the visual gap between the live Today view and the high-fidelity mockup by tightening typography and removing chrome — without adding new data sources or new feature surfaces.

**Architecture:** Six independent surface-level changes to existing components. No new components except `EndOfDayCard` (a static 40-line card). No new data fetches. No new types. Every change is reversible at the file level.

**Tech Stack:** React 19 + TypeScript strict, Tailwind v4 (Nordic Journal), Vitest + RTL for tests, existing `lucide-react` icon set, existing `formatTime` family in `src/lib/timeUtils.ts`.

---

## Context: what changes and why

The deployed app reads as a sparse database; the mockup reads as a calm day. The biggest contributors to the gap are: tiny abbreviated time labels (`5:30p`, `1p`), bare row titles with no qualifier ("Pick kids up from FFG"), a banner-style AI suggestion footer that feels like a system message, an unfinished sidebar utility row, and no chapter-ending visual at the end of the day. This phase fixes all of those without touching data flow or shipping new features.

Deferred to Phase 2 (intentionally out of scope here):
- Right-rail buildout (At-a-Glance, Family Snapshot, Active Projects panels). Requires data wiring.
- Full dinner-card upgrade (avatars, serves count, prep chips, view-recipe link). Requires passing meal entity, not just timeline item.
- Inline AI suggestions attached to specific tasks (replaces the killed banner). Requires design work.

## File Structure

**Modified:**
- `src/lib/timeUtils.ts` — add `formatTimeLong`, `formatTimeRangeLong` (long-form `5:30 PM` variants)
- `src/lib/timeUtils.test.ts` — tests for new formatters
- `src/components/schedule/ScheduleItem.tsx` — switch time render to long form, widen time column, add subtitle line, drop category chip
- `src/components/schedule/EveningMealCard.tsx` — parse title into title + sides
- `src/components/schedule/EveningMealCard.test.tsx` — assertion for split rendering
- `src/components/schedule/TodayView.tsx` — remove `<AiSuggestionBanner />` mount, add `<EndOfDayCard />` mount
- `src/components/layout/Sidebar.tsx` — hide chat icon + wall icon in compact row (keep search)

**Created:**
- `src/components/schedule/EndOfDayCard.tsx` — closing card at end of timeline
- `src/components/schedule/EndOfDayCard.test.tsx` — render assertion
- `src/lib/rowSubtitle.ts` — pure helper that derives row subtitle string from `TimelineItem`
- `src/lib/rowSubtitle.test.ts` — table-driven tests

**Deleted (file-level, after Task 4 verified):**
- `src/components/schedule/AiSuggestionBanner.tsx`
- `src/components/schedule/AiSuggestionBanner.test.tsx`

---

## Pre-flight: create the worktree

- [ ] **Step 0: Create an isolated worktree off `main`**

Invoke `superpowers:using-git-worktrees` to set up:

```bash
cd /Users/scottkaufman/Developer/Developer/symphonyOS
git fetch origin main
git worktree add .worktrees/today-phase1 -b feat/today-phase1 origin/main
cp .env .worktrees/today-phase1/.env
cd .worktrees/today-phase1
```

**Why `cp .env`:** `git worktree add` skips gitignored files; Vite needs `.env` to boot (see memory `project_worktree_env_blank_screen`).

All subsequent tasks run inside `.worktrees/today-phase1`.

---

## Task 1: Long-form time labels (`5:30 PM`)

**Files:**
- Modify: `src/lib/timeUtils.ts` (add two exports after `formatTimeRange` at line 143)
- Test: `src/lib/timeUtils.test.ts` (add to existing file)

- [ ] **Step 1.1: Write failing tests**

Add to `src/lib/timeUtils.test.ts`:

```typescript
describe('formatTimeLong', () => {
  it('formats whole hour as "1:00 PM"', () => {
    const d = new Date(2026, 4, 20, 13, 0)
    expect(formatTimeLong(d)).toBe('1:00 PM')
  })

  it('formats minutes with leading zero', () => {
    const d = new Date(2026, 4, 20, 17, 30)
    expect(formatTimeLong(d)).toBe('5:30 PM')
  })

  it('formats midnight as "12:00 AM"', () => {
    const d = new Date(2026, 4, 20, 0, 0)
    expect(formatTimeLong(d)).toBe('12:00 AM')
  })

  it('formats noon as "12:00 PM"', () => {
    const d = new Date(2026, 4, 20, 12, 0)
    expect(formatTimeLong(d)).toBe('12:00 PM')
  })

  it('returns empty string for invalid date', () => {
    expect(formatTimeLong(new Date('invalid'))).toBe('')
  })
})

describe('formatTimeRangeLong', () => {
  it('returns "All day" for allDay', () => {
    expect(formatTimeRangeLong(new Date(), new Date(), true)).toBe('All day')
  })

  it('joins start and end with pipe', () => {
    const start = new Date(2026, 4, 20, 13, 0)
    const end = new Date(2026, 4, 20, 14, 0)
    expect(formatTimeRangeLong(start, end)).toBe('1:00 PM|2:00 PM')
  })
})
```

Also add the import at the top of the test file (search the file; `formatTime` is already imported, append `formatTimeLong, formatTimeRangeLong` to the same import):

```typescript
import {
  // ... existing imports
  formatTimeLong,
  formatTimeRangeLong,
} from './timeUtils'
```

- [ ] **Step 1.2: Run test to verify it fails**

```bash
npx vitest src/lib/timeUtils.test.ts --run
```

Expected: FAIL with `formatTimeLong is not a function` (or similar).

- [ ] **Step 1.3: Implement the formatters**

In `src/lib/timeUtils.ts`, after the existing `formatTimeRange` function (currently ends around line 148), append:

```typescript
/**
 * Format a time for display in long form: "1:00 PM" / "5:30 PM".
 * Use for surfaces that want calm, calendar-app typography.
 * For compact lists/badges, prefer `formatTime` ("1p" / "5:30p").
 */
export function formatTimeLong(date: Date): string {
  if (!isValidDate(date)) return ''
  const hours = date.getHours()
  const minutes = date.getMinutes()
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHour = hours % 12 || 12
  return `${displayHour}:${minutes.toString().padStart(2, '0')} ${period}`
}

/**
 * Long-form range formatter. Returns "All day" / "1:00 PM|2:00 PM".
 * The pipe separator matches `formatTimeRange` so callers can `.split('|')` identically.
 */
export function formatTimeRangeLong(start: Date, end: Date, allDay?: boolean): string {
  if (allDay) return 'All day'
  if (!isValidDate(start) || !isValidDate(end)) return ''
  return `${formatTimeLong(start)}|${formatTimeLong(end)}`
}
```

- [ ] **Step 1.4: Run tests to verify pass**

```bash
npx vitest src/lib/timeUtils.test.ts --run
```

Expected: all `formatTimeLong` + `formatTimeRangeLong` tests pass; no other tests break.

- [ ] **Step 1.5: Commit**

```bash
git add src/lib/timeUtils.ts src/lib/timeUtils.test.ts
git commit -m "feat(today): formatTimeLong / formatTimeRangeLong for long-form labels"
```

---

## Task 2: Use long-form times in ScheduleItem + widen column

**Files:**
- Modify: `src/components/schedule/ScheduleItem.tsx`
  - Line 6 (import): swap `formatTime, formatTimeRange` for `formatTimeLong, formatTimeRangeLong`
  - Line 286 (`formatTime(inferredDate)`) → `formatTimeLong`
  - Line 294 (`formatTimeRange(...)`) → `formatTimeRangeLong`
  - Line 302 (`formatTime(item.startTime)`) → `formatTimeLong`
  - Line 406 (column wrapper) — widen from `w-12` to `w-16`

- [ ] **Step 2.1: Update import**

In `src/components/schedule/ScheduleItem.tsx`, change line 6:

```typescript
// BEFORE:
import { formatTime, formatTimeRange, inferMealTime } from '@/lib/timeUtils'

// AFTER:
import { formatTimeLong, formatTimeRangeLong, inferMealTime } from '@/lib/timeUtils'
```

- [ ] **Step 2.2: Update three `formatTime`/`formatTimeRange` callsites**

In the same file:

```typescript
// Line 286 — inside the inferred-meal-time branch
return { type: 'single' as const, time: formatTimeLong(inferredDate) }

// Line 294 — the range branch
const rangeStr = formatTimeRangeLong(item.startTime, item.endTime, item.allDay)

// Line 302 — the single-time fallback
return { type: 'single' as const, time: formatTimeLong(item.startTime) }
```

- [ ] **Step 2.3: Widen the time column**

In the same file, there are TWO occurrences of the time-render block. The first is wrapped in a `<SchedulePopover>` trigger (around line 380). The second is a plain `<div className="w-12 shrink-0 ...">` (around line 406).

For each `className` containing `w-12 shrink-0 text-xs font-medium tabular-nums`, replace `w-12` with `w-16`:

```typescript
// Around line 406 — BEFORE:
<div className="w-12 shrink-0 text-xs font-medium tabular-nums">

// AFTER:
<div className="w-16 shrink-0 text-xs font-medium tabular-nums">
```

Search the file for `w-12 shrink-0 text-xs` and replace both occurrences.

- [ ] **Step 2.4: Run the suite**

```bash
npm run build 2>&1 | tail -5
npx vitest src/components/schedule/ScheduleItem --run 2>&1 | tail -8
```

Expected: build passes (TS happy). ScheduleItem tests pass (if any assert specific time strings, update those tests to long form — flag in commit message).

If a snapshot or text assertion breaks because it expects `"1p"`, update the assertion to `"1:00 PM"` — that's the intended change.

- [ ] **Step 2.5: Commit**

```bash
git add src/components/schedule/ScheduleItem.tsx
git commit -m "feat(today): long-form time labels in ScheduleItem (5:30 PM, w-16 column)"
```

---

## Task 3: Row subtitle helper

**Files:**
- Create: `src/lib/rowSubtitle.ts`
- Create: `src/lib/rowSubtitle.test.ts`

- [ ] **Step 3.1: Write failing tests**

Create `src/lib/rowSubtitle.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import type { TimelineItem } from '@/types/timeline'
import { rowSubtitle } from './rowSubtitle'

function baseItem(overrides: Partial<TimelineItem>): TimelineItem {
  return {
    id: 't1',
    type: 'task',
    title: 'X',
    completed: false,
    startTime: null,
    endTime: null,
    allDay: false,
    ...overrides,
  } as TimelineItem
}

describe('rowSubtitle', () => {
  it('returns empty string for a plain task with no category', () => {
    expect(rowSubtitle(baseItem({ type: 'task' }))).toBe('')
  })

  it('returns empty string for category=task (the default, no value)', () => {
    expect(rowSubtitle(baseItem({ type: 'task', category: 'task' }))).toBe('')
  })

  it('returns "Errand" for an errand without time', () => {
    expect(rowSubtitle(baseItem({ type: 'task', category: 'errand' }))).toBe('Errand')
  })

  it('returns "Chore" for a chore', () => {
    expect(rowSubtitle(baseItem({ type: 'task', category: 'chore' }))).toBe('Chore')
  })

  it('returns "Routine" for a routine row', () => {
    expect(rowSubtitle(baseItem({ type: 'routine' }))).toBe('Routine')
  })

  it('returns "Event · 60 min" for a 1-hour event', () => {
    const start = new Date(2026, 4, 20, 13, 0)
    const end = new Date(2026, 4, 20, 14, 0)
    expect(
      rowSubtitle(baseItem({ type: 'event', startTime: start, endTime: end })),
    ).toBe('Event · 60 min')
  })

  it('returns "Errand · 20 min" combining category + duration', () => {
    const start = new Date(2026, 4, 20, 17, 30)
    const end = new Date(2026, 4, 20, 17, 50)
    expect(
      rowSubtitle(baseItem({ type: 'task', category: 'errand', startTime: start, endTime: end })),
    ).toBe('Errand · 20 min')
  })

  it('returns empty string for all-day event (no duration shown)', () => {
    expect(
      rowSubtitle(baseItem({ type: 'event', allDay: true })),
    ).toBe('Event')
  })
})
```

- [ ] **Step 3.2: Run test to verify it fails**

```bash
npx vitest src/lib/rowSubtitle.test.ts --run
```

Expected: FAIL (file does not exist).

- [ ] **Step 3.3: Implement the helper**

Create `src/lib/rowSubtitle.ts`:

```typescript
import type { TimelineItem } from '@/types/timeline'

/**
 * Derives a one-line subtitle for a Today-row from a TimelineItem.
 * Returns "" when there's nothing worth showing (plain task with no category, no duration).
 *
 * Examples:
 *   - errand at 5:30–5:50 PM  → "Errand · 20 min"
 *   - 1h event                 → "Event · 60 min"
 *   - routine                  → "Routine"
 *   - plain task               → ""
 */
export function rowSubtitle(item: TimelineItem): string {
  const label = categoryLabel(item)
  const duration = durationLabel(item)

  if (label && duration) return `${label} · ${duration}`
  return label || duration || ''
}

function categoryLabel(item: TimelineItem): string {
  if (item.type === 'routine') return 'Routine'
  if (item.type === 'event') return 'Event'
  switch (item.category) {
    case 'errand': return 'Errand'
    case 'chore': return 'Chore'
    case 'activity': return 'Activity'
    case 'event': return 'Event'
    case 'task':
    default:
      return ''
  }
}

function durationLabel(item: TimelineItem): string {
  if (item.allDay) return ''
  if (!item.startTime || !item.endTime) return ''
  const ms = item.endTime.getTime() - item.startTime.getTime()
  const mins = Math.round(ms / 60000)
  if (mins <= 0) return ''
  return `${mins} min`
}
```

- [ ] **Step 3.4: Verify tests pass**

```bash
npx vitest src/lib/rowSubtitle.test.ts --run
```

Expected: all tests pass.

- [ ] **Step 3.5: Commit**

```bash
git add src/lib/rowSubtitle.ts src/lib/rowSubtitle.test.ts
git commit -m "feat(today): rowSubtitle pure helper (category + duration)"
```

---

## Task 4: Render subtitle in ScheduleItem, drop category chip

**Files:**
- Modify: `src/components/schedule/ScheduleItem.tsx`

- [ ] **Step 4.1: Import the helper**

Add to the top imports block of `src/components/schedule/ScheduleItem.tsx`:

```typescript
import { rowSubtitle } from '@/lib/rowSubtitle'
```

- [ ] **Step 4.2: Add subtitle line under the title span**

In `src/components/schedule/ScheduleItem.tsx`, find the block starting at the comment `{/* Title */}` (around line 463). The current structure is:

```tsx
{/* Title */}
<div className="flex-1 min-w-0">
  <div className="flex items-center gap-2">
    <span className={`flex-1 min-w-0 ...`}>
      {item.title}
      {item.isWaiting && !item.completed && (
        <span className="ml-1.5 text-xs ...">waiting</span>
      )}
    </span>
    {/* Routine streak badge */}
    ...
    {/* Category chip — desktop only (non-task categories only) */}
    {item.category && item.category !== 'task' && (
      <span className="hidden md:inline-flex shrink-0 ...">
        ...
      </span>
    )}
    ...
```

**Two changes:**

1. After the closing `</div>` of the inner `<div className="flex items-center gap-2">`, add a subtitle line:

```tsx
{/* Subtitle: category + duration. Empty for plain tasks. */}
{(() => {
  const subtitle = rowSubtitle(item)
  if (!subtitle) return null
  return (
    <div className="text-[12px] text-neutral-500 leading-tight mt-0.5">
      {subtitle}
    </div>
  )
})()}
```

2. Delete the entire `{/* Category chip — desktop only ... */}` block (it spans about 8 lines starting with `{item.category && item.category !== 'task' && (`). The subtitle now carries that signal.

- [ ] **Step 4.3: Run the related test files**

```bash
npx vitest src/components/schedule/ --run 2>&1 | tail -10
```

Expected: any test that asserts the category chip text/structure will fail. Update those assertions to look for the subtitle text instead (e.g., `screen.getByText('Errand · 20 min')`).

- [ ] **Step 4.4: Visual sanity check**

```bash
npm run dev
# Open http://localhost:5173, navigate to Today
# Verify: rows now show category + duration under the title; no chip in the title row
```

Expected: cleaner row layout, subtitle reads as muted secondary text.

- [ ] **Step 4.5: Commit**

```bash
git add src/components/schedule/ScheduleItem.tsx src/components/schedule/*.test.tsx
git commit -m "feat(today): row subtitle (category · duration); drop category chip"
```

---

## Task 5: Parse dinner-card title into title + sides

**Files:**
- Modify: `src/components/schedule/EveningMealCard.tsx`
- Modify: `src/components/schedule/EveningMealCard.test.tsx`
- Modify: `src/components/schedule/TodayView.tsx` (pass parsed parts to the card)

**Context:** Live data has titles like `"Dinner · Crispy tofu stir fry + brown rice + broccoli + edamame + snap peas"`. The `EveningMealCard` already accepts `title` + `sides` as separate props, but TodayView only passes `title=item.title`. This task parses the string at the call site and passes both.

- [ ] **Step 5.1: Write a parser test**

Create `src/lib/mealTitle.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { parseMealTitle } from './mealTitle'

describe('parseMealTitle', () => {
  it('returns the whole string as title when no separator', () => {
    expect(parseMealTitle('Tacos')).toEqual({ title: 'Tacos', sides: undefined })
  })

  it('strips a leading meal-type prefix ("Dinner · ")', () => {
    expect(parseMealTitle('Dinner · Tacos')).toEqual({ title: 'Tacos', sides: undefined })
  })

  it('splits the first " + " into title and sides', () => {
    expect(parseMealTitle('Crispy tofu stir fry + brown rice + broccoli')).toEqual({
      title: 'Crispy tofu stir fry',
      sides: 'brown rice + broccoli',
    })
  })

  it('combines prefix-strip and sides-split', () => {
    expect(
      parseMealTitle('Dinner · Crispy tofu stir fry + brown rice + broccoli + edamame + snap peas'),
    ).toEqual({
      title: 'Crispy tofu stir fry',
      sides: 'brown rice + broccoli + edamame + snap peas',
    })
  })

  it('handles "Lunch · " and "Breakfast · " prefixes too', () => {
    expect(parseMealTitle('Lunch · Caesar salad')).toEqual({ title: 'Caesar salad', sides: undefined })
    expect(parseMealTitle('Breakfast · Oatmeal')).toEqual({ title: 'Oatmeal', sides: undefined })
  })
})
```

- [ ] **Step 5.2: Run test to verify it fails**

```bash
npx vitest src/lib/mealTitle.test.ts --run
```

Expected: FAIL (file does not exist).

- [ ] **Step 5.3: Implement the parser**

Create `src/lib/mealTitle.ts`:

```typescript
const MEAL_PREFIXES = ['Dinner', 'Lunch', 'Breakfast', 'Snack']

/**
 * Parses a meal title into display parts.
 *
 *   "Dinner · Crispy tofu stir fry + brown rice + broccoli"
 *     → { title: "Crispy tofu stir fry", sides: "brown rice + broccoli" }
 *
 * Live meal data stores the entire string in one field; this is a UI-side split
 * so the card can render two rows (main + sides) without changing data shape.
 */
export function parseMealTitle(raw: string): { title: string; sides?: string } {
  let s = raw.trim()
  for (const p of MEAL_PREFIXES) {
    if (s.startsWith(`${p} · `)) {
      s = s.slice(p.length + 3) // strip "Dinner · "
      break
    }
  }
  const idx = s.indexOf(' + ')
  if (idx === -1) return { title: s, sides: undefined }
  return { title: s.slice(0, idx), sides: s.slice(idx + 3) }
}
```

- [ ] **Step 5.4: Verify parser tests pass**

```bash
npx vitest src/lib/mealTitle.test.ts --run
```

Expected: all parser tests pass.

- [ ] **Step 5.5: Wire parser into TodayView call site**

In `src/components/schedule/TodayView.tsx`, find the `<EveningMealCard ... />` call (around line 565). Currently:

```tsx
<EveningMealCard
  title={item.title}
  timeLabel={timeLabel}
  onSelect={() => onSelectItem(item.id)}
/>
```

Change to:

```tsx
{(() => {
  const parsed = parseMealTitle(item.title)
  return (
    <EveningMealCard
      title={parsed.title}
      sides={parsed.sides}
      timeLabel={timeLabel}
      onSelect={() => onSelectItem(item.id)}
    />
  )
})()}
```

Add the import at the top of TodayView (alongside the other `@/lib/...` imports):

```typescript
import { parseMealTitle } from '@/lib/mealTitle'
```

- [ ] **Step 5.6: Add a test for the rendered card**

In `src/components/schedule/EveningMealCard.test.tsx`, add:

```typescript
it('renders title and sides on separate lines', () => {
  render(
    <EveningMealCard
      title="Crispy tofu stir fry"
      sides="brown rice + broccoli + edamame + snap peas"
      timeLabel="6:30 PM"
      onSelect={() => {}}
    />,
  )
  expect(screen.getByText('Crispy tofu stir fry')).toBeInTheDocument()
  expect(screen.getByText('brown rice + broccoli + edamame + snap peas')).toBeInTheDocument()
})
```

If the existing test file doesn't import `render` / `screen`, add the import line from one of the other `*.test.tsx` files in this directory (typically `import { render, screen } from '@/test/test-utils'`).

- [ ] **Step 5.7: Verify all tests pass**

```bash
npx vitest src/components/schedule/EveningMealCard --run src/lib/mealTitle --run 2>&1 | tail -8
```

Expected: all pass. Build also still passes.

- [ ] **Step 5.8: Commit**

```bash
git add src/lib/mealTitle.ts src/lib/mealTitle.test.ts \
        src/components/schedule/EveningMealCard.test.tsx \
        src/components/schedule/TodayView.tsx
git commit -m "feat(today): split dinner-card title into main + sides via parseMealTitle"
```

---

## Task 6: Remove the AI suggestion banner

**Files:**
- Modify: `src/components/schedule/TodayView.tsx` (delete mount, delete import)
- Delete: `src/components/schedule/AiSuggestionBanner.tsx`
- Delete: `src/components/schedule/AiSuggestionBanner.test.tsx`

**Why outright deletion:** the mockup removes the banner entirely. A future inline-suggestion design (Phase 3) will replace it; keeping the banner as dead code in the meantime is clutter. Tests can verify it's gone, and the component is restorable from git history if needed.

- [ ] **Step 6.1: Delete the mount in TodayView**

In `src/components/schedule/TodayView.tsx` around line 728-731, delete the entire AI banner block:

```tsx
{/* DELETE THESE LINES: */}
{/* AI banner — desktop-only; mobile keeps a tighter schedule-focused view */}
<div className="mt-5 hidden md:block">
  <AiSuggestionBanner />
</div>
```

- [ ] **Step 6.2: Delete the import line**

Same file, line 42:

```tsx
// DELETE:
import { AiSuggestionBanner } from './AiSuggestionBanner'
```

Also update the file's top JSDoc comment (line 6) if it lists `AiSuggestionBanner` as a child component — remove the reference.

- [ ] **Step 6.3: Delete the component files**

```bash
git rm src/components/schedule/AiSuggestionBanner.tsx \
       src/components/schedule/AiSuggestionBanner.test.tsx
```

- [ ] **Step 6.4: Run build + relevant tests**

```bash
npm run build 2>&1 | tail -5
npx vitest src/components/schedule/TodayView --run 2>&1 | tail -8
```

Expected: build passes (no stale references). TodayView tests pass.

- [ ] **Step 6.5: Commit**

```bash
git add src/components/schedule/TodayView.tsx
git commit -m "refactor(today): remove AiSuggestionBanner mount; defer inline suggestions to Phase 3"
```

---

## Task 7: End-of-day review card

**Files:**
- Create: `src/components/schedule/EndOfDayCard.tsx`
- Create: `src/components/schedule/EndOfDayCard.test.tsx`
- Modify: `src/components/schedule/TodayView.tsx` (mount at the end of the timeline)

- [ ] **Step 7.1: Write a render test**

Create `src/components/schedule/EndOfDayCard.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { EndOfDayCard } from './EndOfDayCard'

describe('EndOfDayCard', () => {
  it('renders the title and supporting text', () => {
    render(<EndOfDayCard onOpenReview={() => {}} />)
    expect(screen.getByText('End of day review')).toBeInTheDocument()
    expect(screen.getByText(/reflect, prep for tomorrow/i)).toBeInTheDocument()
  })

  it('calls onOpenReview when clicked', async () => {
    const onOpenReview = vi.fn()
    const { user } = render(<EndOfDayCard onOpenReview={onOpenReview} />)
    await user.click(screen.getByRole('button', { name: /end of day review/i }))
    expect(onOpenReview).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 7.2: Run test to verify it fails**

```bash
npx vitest src/components/schedule/EndOfDayCard --run
```

Expected: FAIL (module not found).

- [ ] **Step 7.3: Implement the component**

Create `src/components/schedule/EndOfDayCard.tsx`:

```typescript
import { Sparkles, ChevronRight } from 'lucide-react'

interface EndOfDayCardProps {
  onOpenReview: () => void
}

/**
 * Closing card at the bottom of the Today timeline. Provides a quiet
 * chapter ending — "the day is wrapping up here" — and a single CTA into
 * a reflection/handoff flow (wired in Phase 2).
 */
export function EndOfDayCard({ onOpenReview }: EndOfDayCardProps) {
  return (
    <button
      type="button"
      onClick={onOpenReview}
      aria-label="End of day review"
      className="
        w-full flex items-center gap-4 px-4 py-3 mt-4 rounded-xl
        bg-bg-elevated border border-neutral-200/60
        hover:border-neutral-300 hover:bg-neutral-50/60
        transition-colors text-left
      "
    >
      <span className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-lg bg-primary-50 text-primary-600">
        <Sparkles className="w-5 h-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-base text-neutral-800 leading-tight">End of day review</p>
        <p className="text-[12px] text-neutral-500 leading-snug">Reflect, prep for tomorrow, and close the day.</p>
      </div>
      <ChevronRight className="w-5 h-5 text-neutral-300 shrink-0" />
    </button>
  )
}
```

- [ ] **Step 7.4: Verify tests pass**

```bash
npx vitest src/components/schedule/EndOfDayCard --run
```

Expected: both tests pass.

- [ ] **Step 7.5: Mount in TodayView**

In `src/components/schedule/TodayView.tsx`, add the import near the other schedule-component imports:

```typescript
import { EndOfDayCard } from './EndOfDayCard'
```

Then, where the AI banner used to live (the position vacated in Task 6, after the timeline rendering closes and before the TimelineNoteComposer), mount the card. The expected position is right after the closing `</div>` of the timeline grid and before `{insert.noteComposer && (...)}`:

```tsx
{/* End of day — closing chapter for the timeline */}
<div className="mt-5 hidden md:block">
  <EndOfDayCard onOpenReview={() => {
    // Phase 2 will wire this to a review flow; for now, a no-op.
    // Leaving an inline TODO is intentional: this is the explicit
    // handoff to Phase 2, not a placeholder we forgot.
  }} />
</div>
```

(The inline arrow no-op is acceptable here because the wiring is the deliverable of Phase 2, documented in this plan's "Deferred" section. Reviewers should leave it alone.)

- [ ] **Step 7.6: Build + verify**

```bash
npm run build 2>&1 | tail -5
npx vitest src/components/schedule/EndOfDayCard --run 2>&1 | tail -6
```

Expected: build passes, EndOfDayCard tests pass.

- [ ] **Step 7.7: Commit**

```bash
git add src/components/schedule/EndOfDayCard.tsx \
        src/components/schedule/EndOfDayCard.test.tsx \
        src/components/schedule/TodayView.tsx
git commit -m "feat(today): EndOfDayCard — chapter-closing card at end of timeline"
```

---

## Task 8: Sidebar restraint (hide chat + wall icons)

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

**Why only chat + wall, not the search bar:** the mockup shows the cleanest possible sidebar, but real users need search. Removing search would be a usability regression. The chat icon launches the AI chat (rarely-used from sidebar — has its own surfaces), and the wall icon opens a separate browser tab (one-off action that doesn't belong in nav chrome). Both can be re-introduced later if we miss them.

- [ ] **Step 8.1: Remove chat-icon and wall-icon buttons from the compact row**

In `src/components/layout/Sidebar.tsx`, locate the block starting around line 201 (`{/* Search + AI/Wall launcher — compact row */}`).

Delete the two buttons (chat + wall) — everything from `{onOpenChat && (` through the closing `</button>` of the wall-icon block (the `onClick={() => window.open('/wall', '_blank')}` button). Leave the search button alone.

After the change, the block should be:

```tsx
{/* Search row */}
<div className={`px-3 mt-1 flex items-center gap-1 ${collapsed ? 'flex-col' : ''}`}>
  {onOpenSearch && (
    <button
      onClick={onOpenSearch}
      className={`
        flex-1 flex items-center gap-2 px-3 py-2 rounded-lg
        text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100/70
        transition-all duration-200 text-[13px]
        ${collapsed ? 'justify-center flex-none' : ''}
      `}
      aria-label="Search"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
      </svg>
      {!collapsed && <span className="flex-1 text-left">Search</span>}
    </button>
  )}
</div>
```

- [ ] **Step 8.2: Build + sanity check**

```bash
npm run build 2>&1 | tail -5
```

Expected: build passes. (No tests assert on these two icons today; no test updates needed.)

- [ ] **Step 8.3: Visual sanity check**

```bash
# Dev server should still be running from earlier task. If not:
npm run dev
# Verify: sidebar shows the Search row only; chat + wall icons gone.
# Search still works.
```

- [ ] **Step 8.4: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "refactor(sidebar): hide chat + wall icons from nav chrome (keep search)"
```

---

## Verification — full check before shipping

- [ ] **Step V.1: Full test suite**

```bash
npm test -- --run 2>&1 | tail -8
```

Expected: same failure count as `origin/main` baseline (3 pre-existing TodayView failures unrelated to this work, 1 NotesPage flake, 1 useSpaces flake). Zero new failures introduced.

- [ ] **Step V.2: Lint**

```bash
npm run lint 2>&1 | grep -E "error" | head -10
```

Expected: same 8 pre-existing errors. No new errors.

- [ ] **Step V.3: Build**

```bash
npm run build 2>&1 | tail -5
```

Expected: passes.

- [ ] **Step V.4: Manual smoke on dev server**

```bash
npm run dev
# Open http://localhost:5173/today
# Verify each change:
#  1. Time labels read "1:00 PM" not "1p" (Task 2)
#  2. Rows show subtitle "Errand · 20 min" etc. under titles (Task 4)
#  3. Dinner card shows main + sides on two lines (Task 5)
#  4. No AI banner at bottom of timeline (Task 6)
#  5. End of day card appears at bottom of timeline (Task 7)
#  6. Sidebar shows only Search in the compact row (Task 8)
```

- [ ] **Step V.5: Use `superpowers:finishing-a-development-branch` to land**

Standard finishing flow:
- Rebase onto `origin/main` (we just did this for today-polish; same pattern)
- Push `feat/today-phase1:main` (race-safe push from the worktree)
- `git pull --ff-only` in main worktree, `vercel --prod`, verify the deployment serves the new bundle
- Remove the worktree, delete the local branch

---

## Self-review checklist

- [x] **Spec coverage:** Each of the six Phase-1 items from the brainstorm is mapped to a task:
  1. Long-form time labels → Tasks 1, 2
  2. Row subtitles → Tasks 3, 4
  3. Dinner card title parsing → Task 5
  4. Remove AI banner → Task 6
  5. End-of-day card → Task 7
  6. Sidebar restraint → Task 8

- [x] **Placeholder scan:** The only intentional inline-noop is in Task 7.5 (the `onOpenReview` no-op) — flagged in-place as a Phase 2 handoff, not a forgotten TODO. No "TBD"/"implement later"/"handle edge cases" placeholders.

- [x] **Type consistency:** `formatTimeLong` / `formatTimeRangeLong` signatures match `formatTime` / `formatTimeRange` (same arg shapes, same `|`-joined range return). `rowSubtitle(item: TimelineItem): string` is referenced consistently. `parseMealTitle(raw: string): { title: string; sides?: string }` matches `EveningMealCard`'s existing prop names.

- [x] **No new data sources:** Confirmed — every task derives from `TimelineItem`, the existing `Meal` title string, or local state. No new hooks, no new Supabase queries, no new types.

---

## Why this scope, not more

Deliberate scope-cuts in this plan:

- **Right-rail panels** (At-a-Glance / Family Snapshot / Active Projects). Each requires data wiring (counts derivation, family-member ordering, project-progress calc). Phase 2.
- **Dinner-card avatars / serves count / prep chips / view-recipe**. Requires the actual meal entity (not just the timeline item) to be threaded through. Phase 2.
- **Weather "rain chance"**. Requires checking the weather hook's data shape; small but unverified. Skip.
- **"View details" CTA on Today's Focus card**. Adds a button without adding value; the card already communicates state.
- **Inline AI suggestions** (the killed banner's replacement). Needs design. Phase 3.
- **"Semantic clusters" HOME · IRIS · OUTDOOR badges**. From the external critique. Rejected: more labels ≠ more calm.
- **Predictive AI** (therapy → cognitive fatigue inference). Year-3 fantasy; explicitly out of scope.
