# Wall Now Card — Day-Mode 2×2 Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the empty-feeling single list in the wall's Day-mode Now Card with a 4-quadrant grid (Up Next / Today / Pending / Family Question) that never reads as blank and is tap-to-expand.

**Architecture:** A pure builder (`buildDayGrid`) maps already-fetched wall data into four quadrant content objects (testable with zero mocks). A presentational shell (`WallNowQuadrant`) enforces the 3-item cap. `WallNowGrid` composes the 2×2. `WallNowCard` renders the grid only when `focus.kind === 'mode-default' && focus.mode === 'day'` and a `dayGrid` prop is supplied — no change to `nowFocus.ts`. A single `WallQuadrantExpand` overlay satisfies "tap to expand" uniformly for all four quadrants. A cross-fade wrapper softens focus transitions, gated by `prefers-reduced-motion`.

**Tech Stack:** React 19 + TypeScript strict, Tailwind v4, Vitest + React Testing Library. Path alias `@/` → `src/`.

**Spec:** [`docs/superpowers/specs/2026-05-18-wall-now-grid-design.md`](../specs/2026-05-18-wall-now-grid-design.md)

**Deviation from spec (intentional, flagged):** The spec's Refinement 5 says tapping Pending "opens the existing triage overlay." No wall triage overlay exists in the codebase to route to. V1 routes all four quadrant taps to one uniform full-screen `WallQuadrantExpand` overlay (Pending shows its full list). Routing Pending into a real triage flow is deferred to a follow-up.

---

## File Structure

| File | Responsibility | New/Modified |
|---|---|---|
| `src/hooks/usePrefersReducedMotion.ts` | Reactive `prefers-reduced-motion` boolean | Create |
| `src/components/wall/now/buildDayGrid.ts` | Pure: wall data → 4 quadrant content objects + types | Create |
| `src/components/wall/now/WallNowQuadrant.tsx` | Presentational quadrant shell, enforces 3-line cap | Create |
| `src/components/wall/now/WallNowGrid.tsx` | 2×2 layout composing 4 quadrants | Create |
| `src/components/wall/now/WallQuadrantExpand.tsx` | Full-screen overlay showing one quadrant enlarged | Create |
| `src/components/wall/WallNowCard.tsx` | Render grid in Day branch; cross-fade wrapper | Modify |
| `src/components/wall/WallCalendar.tsx` | Assemble `dayGrid`, wire tap → expand overlay | Modify |

Tests live beside each source file (`*.test.ts(x)`), matching the existing wall convention (`WallNowCard.test.tsx`, `nowFocus.test.ts`).

---

### Task 1: `usePrefersReducedMotion` hook

**Files:**
- Create: `src/hooks/usePrefersReducedMotion.ts`
- Test: `src/hooks/usePrefersReducedMotion.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/hooks/usePrefersReducedMotion.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

describe('usePrefersReducedMotion', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns false when the user has no reduced-motion preference', () => {
    mockMatchMedia(false)
    const { result } = renderHook(() => usePrefersReducedMotion())
    expect(result.current).toBe(false)
  })

  it('returns true when the user prefers reduced motion', () => {
    mockMatchMedia(true)
    const { result } = renderHook(() => usePrefersReducedMotion())
    expect(result.current).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/usePrefersReducedMotion.test.ts`
Expected: FAIL — `usePrefersReducedMotion` is not defined / module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/hooks/usePrefersReducedMotion.ts
import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

/** Reactive boolean: does the user prefer reduced motion? */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(QUERY).matches
      : false
  )

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(QUERY)
    const onChange = () => setReduced(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return reduced
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/usePrefersReducedMotion.test.ts`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/usePrefersReducedMotion.ts src/hooks/usePrefersReducedMotion.test.ts
git commit -m "feat(wall): add usePrefersReducedMotion hook"
```

---

### Task 2: `buildDayGrid` pure builder + types

This is the core logic. It takes already-fetched data (no hooks) and produces the four quadrants. Each quadrant always has a non-empty headline (never blank), caps lines at 3, and tags overdue lines.

**Files:**
- Create: `src/components/wall/now/buildDayGrid.ts`
- Test: `src/components/wall/now/buildDayGrid.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/wall/now/buildDayGrid.test.ts
import { describe, it, expect } from 'vitest'
import { buildDayGrid, type BuildDayGridInput } from './buildDayGrid'
import type { WallDayData } from '@/hooks/useWallData'
import type { TimelineItem } from '@/types/timeline'
import type { TodayItem } from '../today/todayItem'

const NOW = new Date('2026-05-18T13:00:00')

function timeline(id: string, title: string, hh: number, dayOffset = 0): TimelineItem {
  const d = new Date(NOW)
  d.setDate(d.getDate() + dayOffset)
  d.setHours(hh, 0, 0, 0)
  return { id, title, startTime: d } as unknown as TimelineItem
}

function emptyDay(dayOffset: number): WallDayData {
  const date = new Date(NOW)
  date.setDate(date.getDate() + dayOffset)
  date.setHours(0, 0, 0, 0)
  return {
    date,
    isToday: dayOffset === 0,
    items: { allday: [], morning: [], afternoon: [], evening: [], unscheduled: [] },
    birthdays: [],
    milestones: [],
  } as unknown as WallDayData
}

function todayItem(id: string, title: string, hh: number | null, completed = false): TodayItem {
  let startTime: Date | null = null
  if (hh !== null) { startTime = new Date(NOW); startTime.setHours(hh, 0, 0, 0) }
  return { id, kind: 'task', title, completed, ownerId: null, startTime, sourceId: id }
}

function baseInput(overrides: Partial<BuildDayGridInput> = {}): BuildDayGridInput {
  return {
    days: [emptyDay(0), emptyDay(1)],
    now: NOW,
    todayItems: [],
    overdueTasks: [],
    inboxCount: 0,
    emailCount: 0,
    familyPrompt: 'What was the best part of today?',
    ...overrides,
  }
}

describe('buildDayGrid', () => {
  it('Up Next surfaces the next future timed item across the week', () => {
    const day0 = emptyDay(0)
    day0.items.afternoon = [timeline('e1', 'Soccer practice', 17)]
    const grid = buildDayGrid(baseInput({ days: [day0, emptyDay(1)] }))
    expect(grid.upNext.headline).toBe('Soccer practice')
    expect(grid.upNext.tap).toEqual({ quadrant: 'upNext', itemId: 'e1' })
  })

  it('Up Next falls back to a later day when nothing is left today', () => {
    const day1 = emptyDay(1)
    day1.items.morning = [timeline('e2', 'Dentist', 8, 1)]
    const grid = buildDayGrid(baseInput({ days: [emptyDay(0), day1] }))
    expect(grid.upNext.headline).toBe('Dentist')
  })

  it('Up Next never reads as empty', () => {
    const grid = buildDayGrid(baseInput())
    expect(grid.upNext.headline).toBe('Nothing scheduled')
    expect(grid.upNext.tap).toEqual({ quadrant: 'upNext', itemId: null })
  })

  it('Today returns all remaining timed items (visual cap applied downstream)', () => {
    const grid = buildDayGrid(baseInput({
      todayItems: [
        todayItem('t1', 'A', 14), todayItem('t2', 'B', 15),
        todayItem('t3', 'C', 16), todayItem('t4', 'D', 17),
        todayItem('done', 'E', 18, true),
      ],
    }))
    expect(grid.today.headline).toBe('A quiet afternoon')
    expect(grid.today.lines).toHaveLength(4)
    expect(grid.today.lines.map(l => l.text)).toEqual(['A', 'B', 'C', 'D'])
  })

  it('Pending returns all overflow items so the expand view can show them', () => {
    const grid = buildDayGrid(baseInput({
      overdueTasks: [
        timeline('o1', 'One', 9, -1), timeline('o2', 'Two', 9, -1),
        timeline('o3', 'Three', 9, -1), timeline('o4', 'Four', 9, -1),
        timeline('o5', 'Five', 9, -1),
      ],
    }))
    expect(grid.pending.headline).toBe('5 things waiting')
    expect(grid.pending.lines).toHaveLength(5)
    expect(grid.pending.lines.every(l => l.tag === 'overdue')).toBe(true)
  })

  it('Pending is neutral by default and tags only overdue lines', () => {
    const grid = buildDayGrid(baseInput({
      overdueTasks: [timeline('o1', 'Pay water bill', 9, -1)],
      inboxCount: 2,
      emailCount: 8,
    }))
    expect(grid.pending.headline).toBe('3 things waiting')
    expect(grid.pending.lines).toHaveLength(3)
    expect(grid.pending.lines[0]).toEqual({ text: 'Pay water bill', tag: 'overdue' })
    expect(grid.pending.lines[1].tag).toBeUndefined()
    expect(grid.pending.lines[2].tag).toBeUndefined()
  })

  it('Pending shows a calm caught-up state with no lines when nothing waits', () => {
    const grid = buildDayGrid(baseInput())
    expect(grid.pending.headline).toBe('All caught up')
    expect(grid.pending.lines).toHaveLength(0)
  })

  it('Family Question carries the prompt and falls back when absent', () => {
    expect(buildDayGrid(baseInput()).familyQuestion.headline)
      .toBe('"What was the best part of today?"')
    expect(buildDayGrid(baseInput({ familyPrompt: null })).familyQuestion.headline)
      .toBe('No question today')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/wall/now/buildDayGrid.test.ts`
Expected: FAIL — module `./buildDayGrid` not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/components/wall/now/buildDayGrid.ts
import type { WallDayData } from '@/hooks/useWallData'
import type { TimelineItem } from '@/types/timeline'
import type { DaySection } from '@/lib/timeUtils'
import type { TodayItem } from '../today/todayItem'

export type QuadrantId = 'upNext' | 'today' | 'pending' | 'familyQuestion'

export interface QuadrantLine {
  text: string
  /** Color is applied to the LINE only, never the quadrant container. */
  tag?: 'overdue' | 'urgent'
}

export interface DayGridTapTarget {
  quadrant: QuadrantId
  /** Set for Up Next when it points at a concrete item; null otherwise. */
  itemId?: string | null
}

export interface QuadrantContent {
  eyebrow: string
  headline: string
  lines: QuadrantLine[]
  footer?: string
  tap: DayGridTapTarget
}

export interface DayGridData {
  upNext: QuadrantContent
  today: QuadrantContent
  pending: QuadrantContent
  familyQuestion: QuadrantContent
}

export interface BuildDayGridInput {
  days: WallDayData[]
  now: Date
  todayItems: TodayItem[]
  overdueTasks: TimelineItem[]
  inboxCount: number
  emailCount: number
  familyPrompt: string | null
}

// The builder returns the FULL (bounded) list. The visual 3-line cap is
// applied by WallNowQuadrant; the tap-to-expand overlay shows all of these.
const MAX_DATA_LINES = 8
const SECTION_ORDER: DaySection[] = ['allday', 'morning', 'afternoon', 'evening', 'unscheduled']

function nextFutureItem(days: WallDayData[], now: Date): TimelineItem | null {
  const sorted = [...days].sort((a, b) => a.date.getTime() - b.date.getTime())
  for (const day of sorted) {
    for (const section of SECTION_ORDER) {
      for (const item of day.items[section] ?? []) {
        if (item.startTime && item.startTime.getTime() > now.getTime()) return item
      }
    }
  }
  return null
}

function buildUpNext(input: BuildDayGridInput): QuadrantContent {
  const item = nextFutureItem(input.days, input.now)
  if (!item) {
    return {
      eyebrow: 'UP NEXT',
      headline: 'Nothing scheduled',
      lines: [],
      tap: { quadrant: 'upNext', itemId: null },
    }
  }
  return {
    eyebrow: 'UP NEXT',
    headline: item.title,
    lines: [],
    tap: { quadrant: 'upNext', itemId: item.id },
  }
}

function buildToday(input: BuildDayGridInput): QuadrantContent {
  const remaining = input.todayItems
    .filter(i => !i.completed && i.startTime !== null)
    .slice(0, MAX_DATA_LINES)
  return {
    eyebrow: 'TODAY',
    headline: remaining.length === 0 ? 'All clear today' : 'A quiet afternoon',
    lines: remaining.map(i => ({ text: i.title })),
    tap: { quadrant: 'today' },
  }
}

function buildPending(input: BuildDayGridInput): QuadrantContent {
  const lines: QuadrantLine[] = []
  for (const t of input.overdueTasks) {
    if (lines.length >= MAX_DATA_LINES) break
    lines.push({ text: t.title, tag: 'overdue' })
  }
  if (lines.length < MAX_DATA_LINES && input.inboxCount > 0) {
    lines.push({ text: `${input.inboxCount} inbox item${input.inboxCount === 1 ? '' : 's'}` })
  }
  if (lines.length < MAX_DATA_LINES && input.emailCount > 0) {
    lines.push({ text: `${input.emailCount} email${input.emailCount === 1 ? '' : 's'} waiting` })
  }
  const total = input.overdueTasks.length + (input.inboxCount > 0 ? 1 : 0) + (input.emailCount > 0 ? 1 : 0)
  return {
    eyebrow: "WHILE IT'S QUIET",
    headline: lines.length === 0 ? 'All caught up' : `${total} thing${total === 1 ? '' : 's'} waiting`,
    lines,
    tap: { quadrant: 'pending' },
  }
}

function buildFamilyQuestion(input: BuildDayGridInput): QuadrantContent {
  return {
    eyebrow: "TONIGHT'S QUESTION",
    headline: input.familyPrompt ? `"${input.familyPrompt}"` : 'No question today',
    lines: [],
    tap: { quadrant: 'familyQuestion' },
  }
}

export function buildDayGrid(input: BuildDayGridInput): DayGridData {
  return {
    upNext: buildUpNext(input),
    today: buildToday(input),
    pending: buildPending(input),
    familyQuestion: buildFamilyQuestion(input),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/wall/now/buildDayGrid.test.ts`
Expected: PASS (7 passed).

- [ ] **Step 5: Commit**

```bash
git add src/components/wall/now/buildDayGrid.ts src/components/wall/now/buildDayGrid.test.ts
git commit -m "feat(wall): add buildDayGrid pure builder for Day-mode 2x2 grid"
```

---

### Task 3: `WallNowQuadrant` presentational shell

Renders one quadrant. Hard-caps lines at 3 (defense in depth — builder already caps). Whole quadrant is one tap target (≥48px is trivially met at wall scale). Color appears only on tagged lines.

**Files:**
- Create: `src/components/wall/now/WallNowQuadrant.tsx`
- Test: `src/components/wall/now/WallNowQuadrant.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/wall/now/WallNowQuadrant.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WallNowQuadrant } from './WallNowQuadrant'
import type { QuadrantContent } from './buildDayGrid'

const base: QuadrantContent = {
  eyebrow: 'TODAY',
  headline: 'A quiet afternoon',
  lines: [{ text: 'A' }, { text: 'B' }, { text: 'C' }, { text: 'D' }],
  tap: { quadrant: 'today' },
}

describe('WallNowQuadrant', () => {
  it('renders eyebrow and headline', () => {
    render(<WallNowQuadrant content={base} onTap={() => {}} variant="neutral" />)
    expect(screen.getByText('TODAY')).toBeInTheDocument()
    expect(screen.getByText('A quiet afternoon')).toBeInTheDocument()
  })

  it('never renders more than 3 lines', () => {
    render(<WallNowQuadrant content={base} onTap={() => {}} variant="neutral" />)
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('C')).toBeInTheDocument()
    expect(screen.queryByText('D')).not.toBeInTheDocument()
  })

  it('shows the OVERDUE tag on a tagged line only', () => {
    const content: QuadrantContent = {
      ...base,
      lines: [{ text: 'Pay bill', tag: 'overdue' }, { text: 'Plain' }],
    }
    render(<WallNowQuadrant content={content} onTap={() => {}} variant="neutral" />)
    expect(screen.getByText('Overdue')).toBeInTheDocument()
  })

  it('fires onTap when the quadrant is tapped', () => {
    const onTap = vi.fn()
    render(<WallNowQuadrant content={base} onTap={onTap} variant="neutral" />)
    fireEvent.click(screen.getByRole('button', { name: /today/i }))
    expect(onTap).toHaveBeenCalledTimes(1)
  })

  it('renders the "Soon" tag for an urgent line', () => {
    const content: QuadrantContent = {
      ...base,
      lines: [{ text: 'Leave soon', tag: 'urgent' }],
    }
    render(<WallNowQuadrant content={content} onTap={() => {}} variant="event" />)
    expect(screen.getByText('Soon')).toBeInTheDocument()
  })

  it('renders no list when there are no lines', () => {
    render(
      <WallNowQuadrant
        content={{ ...base, lines: [] }}
        onTap={() => {}}
        variant="family"
      />
    )
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/wall/now/WallNowQuadrant.test.tsx`
Expected: FAIL — module `./WallNowQuadrant` not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/wall/now/WallNowQuadrant.tsx
import type { QuadrantContent } from './buildDayGrid'

export type QuadrantVariant = 'event' | 'neutral' | 'family'

const VARIANT_BG: Record<QuadrantVariant, string> = {
  event: 'bg-gradient-to-br from-emerald-900 to-teal-800',
  neutral: 'bg-white/5 border border-white/10',
  family: 'bg-gradient-to-br from-sky-900 to-cyan-900',
}

interface WallNowQuadrantProps {
  content: QuadrantContent
  onTap: () => void
  variant: QuadrantVariant
}

export function WallNowQuadrant({ content, onTap, variant }: WallNowQuadrantProps) {
  const lines = content.lines.slice(0, 3)
  return (
    <button
      type="button"
      aria-label={`${content.eyebrow}: ${content.headline}`}
      onClick={onTap}
      className={`text-left rounded-2xl p-6 flex flex-col h-full min-h-0 ${VARIANT_BG[variant]}`}
    >
      <div className="text-[11px] uppercase tracking-[0.2em] text-white/55 mb-2">
        {content.eyebrow}
      </div>
      <h3 className="font-display text-3xl font-semibold leading-tight text-white line-clamp-2">
        {content.headline}
      </h3>
      {lines.length > 0 && (
        <div role="list" className="mt-4 space-y-1.5 text-white/75 text-base">
          {lines.map((line, i) => (
            <div role="listitem" key={i} className="truncate">
              {line.text}
              {line.tag === 'overdue' && (
                <span className="ml-2 text-[10px] uppercase tracking-[0.1em] text-red-400 border border-red-400/40 rounded px-1.5 py-0.5">
                  Overdue
                </span>
              )}
              {line.tag === 'urgent' && (
                <span className="ml-2 text-[10px] uppercase tracking-[0.1em] text-amber-400 border border-amber-400/40 rounded px-1.5 py-0.5">
                  Soon
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {content.footer && (
        <div className="mt-auto pt-3 text-xs text-white/45">{content.footer}</div>
      )}
    </button>
  )
}
```

> Note: `line-clamp-2` is a Tailwind v4 core utility — no plugin needed.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/wall/now/WallNowQuadrant.test.tsx`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add src/components/wall/now/WallNowQuadrant.tsx src/components/wall/now/WallNowQuadrant.test.tsx
git commit -m "feat(wall): add WallNowQuadrant shell"
```

---

### Task 4: `WallNowGrid` 2×2 composition

**Files:**
- Create: `src/components/wall/now/WallNowGrid.tsx`
- Test: `src/components/wall/now/WallNowGrid.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/wall/now/WallNowGrid.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WallNowGrid } from './WallNowGrid'
import type { DayGridData } from './buildDayGrid'

const grid: DayGridData = {
  upNext: { eyebrow: 'UP NEXT', headline: 'Soccer practice', lines: [], tap: { quadrant: 'upNext', itemId: 'e1' } },
  today: { eyebrow: 'TODAY', headline: 'A quiet afternoon', lines: [{ text: 'Clean kitchen' }], tap: { quadrant: 'today' } },
  pending: { eyebrow: "WHILE IT'S QUIET", headline: '3 things waiting', lines: [{ text: 'Pay bill', tag: 'overdue' }], tap: { quadrant: 'pending' } },
  familyQuestion: { eyebrow: "TONIGHT'S QUESTION", headline: '"Best part of today?"', lines: [], tap: { quadrant: 'familyQuestion' } },
}

describe('WallNowGrid', () => {
  it('renders all four quadrants', () => {
    render(<WallNowGrid grid={grid} onQuadrantTap={() => {}} />)
    expect(screen.getByText('Soccer practice')).toBeInTheDocument()
    expect(screen.getByText('A quiet afternoon')).toBeInTheDocument()
    expect(screen.getByText('3 things waiting')).toBeInTheDocument()
    expect(screen.getByText('"Best part of today?"')).toBeInTheDocument()
  })

  it('forwards the Up Next tap target', () => {
    const onQuadrantTap = vi.fn()
    render(<WallNowGrid grid={grid} onQuadrantTap={onQuadrantTap} />)
    fireEvent.click(screen.getByRole('button', { name: /^UP NEXT:/i }))
    expect(onQuadrantTap).toHaveBeenCalledWith({ quadrant: 'upNext', itemId: 'e1' })
  })

  it('forwards the Today tap target', () => {
    const onQuadrantTap = vi.fn()
    render(<WallNowGrid grid={grid} onQuadrantTap={onQuadrantTap} />)
    fireEvent.click(screen.getByRole('button', { name: /^TODAY:/i }))
    expect(onQuadrantTap).toHaveBeenCalledWith({ quadrant: 'today' })
  })

  it('forwards the Pending tap target', () => {
    const onQuadrantTap = vi.fn()
    render(<WallNowGrid grid={grid} onQuadrantTap={onQuadrantTap} />)
    fireEvent.click(screen.getByRole('button', { name: /^WHILE IT'S QUIET:/i }))
    expect(onQuadrantTap).toHaveBeenCalledWith({ quadrant: 'pending' })
  })

  it('forwards the Family Question tap target', () => {
    const onQuadrantTap = vi.fn()
    render(<WallNowGrid grid={grid} onQuadrantTap={onQuadrantTap} />)
    fireEvent.click(screen.getByRole('button', { name: /^TONIGHT'S QUESTION:/i }))
    expect(onQuadrantTap).toHaveBeenCalledWith({ quadrant: 'familyQuestion' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/wall/now/WallNowGrid.test.tsx`
Expected: FAIL — module `./WallNowGrid` not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/wall/now/WallNowGrid.tsx
import { WallNowQuadrant } from './WallNowQuadrant'
import type { DayGridData, DayGridTapTarget } from './buildDayGrid'

interface WallNowGridProps {
  grid: DayGridData
  onQuadrantTap: (target: DayGridTapTarget) => void
}

export function WallNowGrid({ grid, onQuadrantTap }: WallNowGridProps) {
  return (
    <div className="grid grid-cols-2 grid-rows-2 gap-4 h-full min-h-0">
      <WallNowQuadrant content={grid.upNext} variant="event" onTap={() => onQuadrantTap(grid.upNext.tap)} />
      <WallNowQuadrant content={grid.today} variant="neutral" onTap={() => onQuadrantTap(grid.today.tap)} />
      <WallNowQuadrant content={grid.pending} variant="neutral" onTap={() => onQuadrantTap(grid.pending.tap)} />
      <WallNowQuadrant content={grid.familyQuestion} variant="family" onTap={() => onQuadrantTap(grid.familyQuestion.tap)} />
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/wall/now/WallNowGrid.test.tsx`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add src/components/wall/now/WallNowGrid.tsx src/components/wall/now/WallNowGrid.test.tsx
git commit -m "feat(wall): add WallNowGrid 2x2 composition"
```

---

### Task 5: `WallQuadrantExpand` overlay

Full-screen overlay showing one quadrant enlarged. Tap anywhere (or the close affordance) to dismiss. Uniform for all four quadrants (see plan header deviation note).

**Files:**
- Create: `src/components/wall/now/WallQuadrantExpand.tsx`
- Test: `src/components/wall/now/WallQuadrantExpand.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/wall/now/WallQuadrantExpand.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WallQuadrantExpand } from './WallQuadrantExpand'
import type { QuadrantContent } from './buildDayGrid'

const content: QuadrantContent = {
  eyebrow: "WHILE IT'S QUIET",
  headline: '3 things waiting',
  lines: [{ text: 'Reply to Caitlin' }, { text: 'Pay water bill', tag: 'overdue' }],
  tap: { quadrant: 'pending' },
}

describe('WallQuadrantExpand', () => {
  it('renders the enlarged quadrant content', () => {
    render(<WallQuadrantExpand content={content} onClose={() => {}} />)
    expect(screen.getByText('3 things waiting')).toBeInTheDocument()
    expect(screen.getByText('Reply to Caitlin')).toBeInTheDocument()
    expect(screen.getByText('Pay water bill')).toBeInTheDocument()
  })

  it('calls onClose when the overlay is tapped', () => {
    const onClose = vi.fn()
    render(<WallQuadrantExpand content={content} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/wall/now/WallQuadrantExpand.test.tsx`
Expected: FAIL — module `./WallQuadrantExpand` not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/wall/now/WallQuadrantExpand.tsx
import type { QuadrantContent } from './buildDayGrid'

interface WallQuadrantExpandProps {
  content: QuadrantContent
  onClose: () => void
}

export function WallQuadrantExpand({ content, onClose }: WallQuadrantExpandProps) {
  return (
    <button
      type="button"
      aria-label="Close"
      onClick={onClose}
      className="fixed inset-0 z-50 bg-neutral-950/95 flex flex-col items-center justify-center p-16 text-center"
    >
      <div className="text-sm uppercase tracking-[0.25em] text-white/50 mb-4">
        {content.eyebrow}
      </div>
      <h2 className="font-display text-6xl font-semibold text-white max-w-4xl leading-tight">
        {content.headline}
      </h2>
      {content.lines.length > 0 && (
        <div role="list" className="mt-10 space-y-4 text-2xl text-white/80">
          {content.lines.map((line, i) => (
            <div role="listitem" key={i}>
              {line.text}
              {line.tag === 'overdue' && (
                <span className="ml-3 text-base uppercase tracking-[0.1em] text-red-400">Overdue</span>
              )}
              {line.tag === 'urgent' && (
                <span className="ml-3 text-base uppercase tracking-[0.1em] text-amber-400">Soon</span>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="mt-12 text-white/40 text-sm">Tap anywhere to close</div>
    </button>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/wall/now/WallQuadrantExpand.test.tsx`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add src/components/wall/now/WallQuadrantExpand.tsx src/components/wall/now/WallQuadrantExpand.test.tsx
git commit -m "feat(wall): add WallQuadrantExpand overlay"
```

---

### Task 6: Render the grid in `WallNowCard` (Day branch) + cross-fade

`WallNowCard` gains an optional `dayGrid` + `onQuadrantTap` prop pair. When focus resolves to `mode-default` with `mode === 'day'` AND `dayGrid` is supplied, render `<WallNowGrid>` instead of the single list. All other branches unchanged. Wrap the rendered content in a cross-fade keyed by focus, gated by `usePrefersReducedMotion`.

**Files:**
- Modify: `src/components/wall/WallNowCard.tsx`
- Modify (add test): `src/components/wall/WallNowCard.test.tsx`

- [ ] **Step 1: Write the failing test (append to existing describe block)**

Add these two `it` blocks inside the existing `describe('WallNowCard', ...)` in `src/components/wall/WallNowCard.test.tsx`. Also add the import at the top of the file: `import type { DayGridData } from './now/buildDayGrid'`.

```typescript
  const sampleGrid: DayGridData = {
    upNext: { eyebrow: 'UP NEXT', headline: 'Soccer practice', lines: [], tap: { quadrant: 'upNext', itemId: 'e1' } },
    today: { eyebrow: 'TODAY', headline: 'A quiet afternoon', lines: [], tap: { quadrant: 'today' } },
    pending: { eyebrow: "WHILE IT'S QUIET", headline: 'All caught up', lines: [], tap: { quadrant: 'pending' } },
    familyQuestion: { eyebrow: "TONIGHT'S QUESTION", headline: '"Best part?"', lines: [], tap: { quadrant: 'familyQuestion' } },
  }

  it('renders the 2x2 grid for Day mode-default when dayGrid is supplied', () => {
    render(
      <WallNowCard
        focus={{ kind: 'mode-default', mode: 'day' }}
        pinned={false}
        onPinToggle={() => {}}
        familyPrompt={null}
        dayGrid={sampleGrid}
        onQuadrantTap={() => {}}
      />
    )
    expect(screen.getByText('Soccer practice')).toBeInTheDocument()
    expect(screen.getByText('"Best part?"')).toBeInTheDocument()
  })

  it('still renders the single list for Day mode when no dayGrid supplied', () => {
    render(
      <WallNowCard
        focus={{ kind: 'mode-default', mode: 'day' }}
        pinned={false}
        onPinToggle={() => {}}
        familyPrompt={null}
        todayItems={[]}
      />
    )
    expect(screen.getByText('All clear')).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/wall/WallNowCard.test.tsx`
Expected: FAIL — `dayGrid`/`onQuadrantTap` props don't exist; grid not rendered.

- [ ] **Step 3: Implement — edit `WallNowCard.tsx`**

3a. Add imports after line 4 (`import type { TodayItem } ...`):

```tsx
import { useEffect, useRef, useState } from 'react'
import { WallNowGrid } from './now/WallNowGrid'
import type { DayGridData, DayGridTapTarget } from './now/buildDayGrid'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
```

3b. Extend `WallNowCardProps` (the interface ending at line 148) — add two optional props before the closing brace:

```tsx
  dayGrid?: DayGridData
  onQuadrantTap?: (target: DayGridTapTarget) => void
```

3c. Update the destructure in `export function WallNowCard({ ... })` to include `dayGrid` and `onQuadrantTap`.

3d. In `renderContent()`, immediately before the line `// Pinned mode, override mode, or default — all render mode content`, insert the Day-grid short-circuit:

```tsx
    // Day mode-default with assembled grid → 2x2 grid instead of single list
    if (focus.kind === 'mode-default' && focus.mode === 'day' && dayGrid) {
      return <WallNowGrid grid={dayGrid} onQuadrantTap={(t) => onQuadrantTap?.(t)} />
    }
```

3e. Add the cross-fade wrapper. Replace the component's final `return (...)` block (lines 213–228) with:

```tsx
  const reducedMotion = usePrefersReducedMotion()
  const focusKey =
    focus.kind === 'mode-default' || focus.kind === 'pinned-mode' || focus.kind === 'override-mode'
      ? `${focus.kind}:${focus.mode}`
      : focus.kind === 'override-item'
        ? `override-item:${focus.itemId}`
        : 'imminent'

  const [fadeKey, setFadeKey] = useState(focusKey)
  const [visible, setVisible] = useState(true)
  const prev = useRef(focusKey)

  useEffect(() => {
    if (prev.current === focusKey) return
    prev.current = focusKey
    if (reducedMotion) { setFadeKey(focusKey); return }
    setVisible(false)
    const t = setTimeout(() => { setFadeKey(focusKey); setVisible(true) }, 220)
    return () => clearTimeout(t)
  }, [focusKey, reducedMotion])

  return (
    <div className="rounded-2xl bg-gradient-to-br from-emerald-900 to-teal-900 p-7 text-white flex flex-col gap-3 h-full shadow-lg overflow-hidden">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0" />
        <button
          type="button"
          aria-label="Pin"
          onClick={onPinToggle}
          className={`p-2 rounded-md transition-colors ${pinned ? 'text-amber-300 bg-amber-900/30' : 'text-white/40 hover:text-white/80'}`}
        >
          <Pin className="w-5 h-5" />
        </button>
      </div>
      <div
        key={fadeKey}
        className="flex-1 min-h-0 flex flex-col transition-opacity duration-200"
        style={{ opacity: visible || reducedMotion ? 1 : 0 }}
      >
        {renderContent()}
      </div>
    </div>
  )
```

> The 220ms fade-out + 200ms fade-in ≈ the spec's 400–500ms total. `reducedMotion` makes the swap instant (opacity stays 1, key flips immediately).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/wall/WallNowCard.test.tsx`
Expected: PASS — all original tests + the 2 new ones (7 passed). (The cross-fade renders content synchronously on first mount, so existing assertions still find their text.)

- [ ] **Step 5: Commit**

```bash
git add src/components/wall/WallNowCard.tsx src/components/wall/WallNowCard.test.tsx
git commit -m "feat(wall): render Day-mode 2x2 grid in WallNowCard with cross-fade"
```

---

### Task 7: Wire `buildDayGrid` + tap-to-expand into `WallCalendar`

Assemble the grid from existing memos, add the email count source, pass it down, and route quadrant taps to the expand overlay.

**Files:**
- Modify: `src/components/wall/WallCalendar.tsx`

- [ ] **Step 1: Add imports** (alongside the existing wall imports near lines 25–33)

```tsx
import { buildDayGrid, type DayGridTapTarget, type QuadrantContent } from './now/buildDayGrid'
import { WallQuadrantExpand } from './now/WallQuadrantExpand'
import { useEmailActionItems } from '@/hooks/useEmailActionItems'
```

- [ ] **Step 2: Add the email count + grid memo + expand state**

Add near the other hook calls (after `const wallData = useWallData()` ~line 59):

```tsx
  const { items: emailActionItems } = useEmailActionItems()
```

Add after the `tomorrowPreview` memo (ends ~line 188):

```tsx
  const dayGrid = useMemo(() => buildDayGrid({
    days: wallData.days,
    now: currentTime,
    todayItems: todayItemsForList,
    overdueTasks: wallData.overdueTasks,
    inboxCount: wallData.inboxCount,
    emailCount: emailActionItems.length,
    familyPrompt: promptDismissed ? null : prompt,
  }), [wallData.days, wallData.overdueTasks, wallData.inboxCount, currentTime, todayItemsForList, emailActionItems.length, promptDismissed, prompt])

  const [expandedQuadrant, setExpandedQuadrant] = useState<QuadrantContent | null>(null)

  const handleQuadrantTap = useCallback((target: DayGridTapTarget) => {
    const map: Record<DayGridTapTarget['quadrant'], QuadrantContent> = {
      upNext: dayGrid.upNext,
      today: dayGrid.today,
      pending: dayGrid.pending,
      familyQuestion: dayGrid.familyQuestion,
    }
    setExpandedQuadrant(map[target.quadrant])
  }, [dayGrid])
```

> `useState`/`useCallback`/`useMemo` are already imported in WallCalendar — verify the import line at the top includes them; if `useState` is missing, add it.

- [ ] **Step 3: Pass grid props to `WallNowCard`**

In the `<WallNowCard ... />` JSX (~line 454), add two props alongside the existing ones:

```tsx
          dayGrid={dayGrid}
          onQuadrantTap={handleQuadrantTap}
```

- [ ] **Step 4: Render the expand overlay**

Immediately after the closing `</div>` of the `grid grid-cols-[1.85fr_1fr]` block and before `<WallRhythmBar`, add:

```tsx
      {expandedQuadrant && (
        <WallQuadrantExpand
          content={expandedQuadrant}
          onClose={() => setExpandedQuadrant(null)}
        />
      )}
```

- [ ] **Step 5: Typecheck + lint + full wall test run**

Run: `npm run build`
Expected: TypeScript passes, Vite build succeeds (no type errors in `wall/`).

Run: `npm run lint`
Expected: no new lint errors in changed files.

Run: `npx vitest run src/components/wall/`
Expected: all wall tests pass (existing + new from Tasks 2–6).

- [ ] **Step 6: Manual verification (record result in the commit body)**

Run: `npm run dev`, open the wall route, and confirm with the system clock in the 9am–3pm window (or tap the "Day" rhythm-bar segment to override):

1. Day mode shows the 2×2 grid, not the single list.
2. No quadrant is blank — Up Next, Today, Pending, Family Question each show a headline even with an empty data day.
3. Pending is neutral grey; an overdue task shows a red `Overdue` tag on that line only.
4. Tapping any quadrant opens the full-screen expand; tapping it closes.
5. Tapping the "Dinner" rhythm segment cross-fades to the single dinner hero (no abrupt jump); the right column and rhythm bar do not shift.
6. With OS "Reduce motion" on, the mode swap is instant.

- [ ] **Step 7: Commit**

```bash
git add src/components/wall/WallCalendar.tsx
git commit -m "feat(wall): wire Day-mode 2x2 grid + tap-to-expand into WallCalendar

Manual verification: grid renders in Day mode, no blank quadrants,
neutral Pending with per-line Overdue tag, tap-to-expand works,
cross-fade smooth on mode change, reduced-motion instant."
```

---

## Self-Review

**Spec coverage:**
- 2×2 grid in Day-mode default only → Tasks 2, 6 (focus.kind/mode guard).
- Four fixed quadrants Up Next / Today / Pending / Family Question → Task 2 (`buildDayGrid`), Task 4 (layout order).
- No quadrant ever blank (wider-window fallbacks) → Task 2 tests (`Nothing scheduled`, `All clear today`, `All caught up`, `No question today`).
- Refinement 1 (visual 3-line cap + no scroll) → Task 3 ('slice(0,3)'); builder returns full bounded list (MAX_DATA_LINES) so the expand overlay (Task 5) shows everything.
- Refinement 2 (Family = prompt only, no Jax/photo footer) → Task 2 `buildFamilyQuestion` emits no footer/lines.
- Refinement 3 (Pending neutral, color on line only) → Task 2 (`tag` per line, headline neutral), Task 3 (`neutral` variant bg, tag styling on `<li>` only).
- Refinement 4 (400–500ms cross-fade, reduced-motion instant, no surrounding shift) → Task 1 + Task 6 (keyed fade wrapper inside the card; chrome/right column untouched).
- Refinement 5 (quadrants tappable, expand) → Tasks 3/4 (`onTap`), Task 5 (`WallQuadrantExpand`), Task 7 (wiring). **Deviation:** Pending → uniform expand, not triage overlay — flagged in header.
- Active modes unchanged → Task 6 guard returns grid ONLY for `mode-default` + `day` + `dayGrid`; every other branch falls through to existing renderers.
- Out-of-scope items (no resolver change, no right column/rhythm bar change, fixed quadrants) → respected; no task touches `nowFocus.ts`, `WallRightColumn`, or `WallRhythmBar`.

**Placeholder scan:** No TBD/TODO; every code step has complete code; commands have expected output. Clean.

**Type consistency:** `QuadrantContent`, `DayGridData`, `DayGridTapTarget`, `QuadrantId` defined in Task 2 and used unchanged in Tasks 3–7. `usePrefersReducedMotion` signature (Task 1) matches its use (Task 6). `WallNowGrid` prop names (`grid`, `onQuadrantTap`) consistent Task 4 → Task 6. `buildDayGrid` input keys match WallCalendar's available memos (`wallData.days`, `wallData.overdueTasks`, `wallData.inboxCount`, `todayItemsForList`, `prompt`, `promptDismissed`) verified against the actual file.
