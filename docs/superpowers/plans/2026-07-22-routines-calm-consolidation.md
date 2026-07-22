# Routines Calm Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn /routines into a calm read-only rhythm picture and relocate all curation into a Tend drawer opened from the masthead.

**Architecture:** Rendering-layer consolidation. `rhythmModel.ts` bucketing stays (one tweak: daypart names for all clusters). DailyArc and WeekStrip lose every maintenance affordance; a new `TendDrawer` component absorbs the relocated TendCard, a new name-this-group flow, a loose-items list, and the SeasonalShelf. RhythmPage swaps its sticky nav + body Tend/Resting sections for a masthead Tend button with a badge.

**Tech Stack:** React 19 + TypeScript strict, Tailwind v4 (Nordic Journal), Vitest + RTL. lucide-react icons only (no emoji).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-22-routines-calm-consolidation-design.md`. Read it before starting a task if anything below seems ambiguous.
- The picture is read-only except tap-to-open-panel. No inputs, no add buttons, no toggles, no prompts anywhere on the page body.
- Auto-group (cluster) cards must be visually identical to named-rhythm cards: same border (`border-neutral-100 shadow-sm`), title as plain text — NOT a button, NOT dashed, no amber.
- Cluster titles use the daypart name from the model's `suggestedName` ("Morning", "Midday", "After School", "Evening", "Bedtime") for ALL clusters (2+ members).
- Tend badge counts `findings.length + non-dismissed cluster count`. Sleepers never count.
- Group-suggestion dismissal persists in the existing localStorage list `rhythm-tend-dismissed` with key `` `g:${[...ids].sort().join('.')}` ``.
- Naming a group calls `onGroupIntoCollection(name, memberIds, { time_of_day: startTime.slice(0,5), recurrence_pattern: { type: 'daily' } })`. If the typed name case-insensitively equals an existing fold target's name, call `onAddToCollection(targetId, memberIds)` instead (no duplicate collections).
- Run tests with `npx vitest run <paths>` (plain `npm test` is watch mode). PATH fix if node is missing: `export PATH="$HOME/.nvm/versions/node/v22.14.0/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`.
- Work in `/Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/rhythm-calm` (branch `rhythm-calm`). Never touch the main worktree.

---

### Task 1: Model — daypart names for all clusters

**Files:**
- Modify: `src/components/routine/rhythm/rhythmModel.ts` (the `flush()` block, ~line 158)
- Test: `src/components/routine/rhythm/rhythmModel.test.ts` (the "suggests a name only for clusters of 3+" test, ~line 128)

**Interfaces:**
- Consumes: nothing new.
- Produces: every `RhythmCard` with `kind: 'cluster'` now has `suggestedName` set (string, one of 'Morning' | 'Midday' | 'After School' | 'Evening' | 'Bedtime'). Tasks 2 and 4 rely on this being present for all clusters.

- [ ] **Step 1: Update the existing test to expect names on 2-member clusters**

In `src/components/routine/rhythm/rhythmModel.test.ts`, replace the test `'suggests a name only for clusters of 3+'` with:

```typescript
  it('suggests a daypart name for every cluster', () => {
    const m = buildRhythmModel([
      mk({ time_of_day: '19:00:00' }),
      mk({ time_of_day: '19:05:00' }),
      mk({ time_of_day: '19:10:00' }),
    ])
    expect(m.daily.timed[0].suggestedName).toBe('Bedtime')
    const m2 = buildRhythmModel([
      mk({ time_of_day: '06:00:00' }),
      mk({ time_of_day: '06:10:00' }),
    ])
    expect(m2.daily.timed[0].suggestedName).toBe('Morning')
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/routine/rhythm/rhythmModel.test.ts`
Expected: FAIL — `expected undefined to be 'Morning'`

- [ ] **Step 3: Change the model**

In `src/components/routine/rhythm/rhythmModel.ts`, replace:

```typescript
    if (card.kind === 'cluster' && current.length >= 3) {
      card.suggestedName = suggestName(minutesOf(start) ?? 0)
    }
```

with:

```typescript
    if (card.kind === 'cluster') {
      card.suggestedName = suggestName(minutesOf(start) ?? 0)
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/routine/rhythm/rhythmModel.test.ts`
Expected: PASS (all tests in file)

- [ ] **Step 5: Commit**

```bash
git add src/components/routine/rhythm/rhythmModel.ts src/components/routine/rhythm/rhythmModel.test.ts
git commit -m "feat(rhythm): daypart names for all clusters"
```

---

### Task 2: DailyArc — calm cards, machinery removed

**Files:**
- Modify: `src/components/routine/rhythm/DailyArc.tsx` (full rewrite below)
- Test: `src/components/routine/rhythm/DailyArc.test.tsx`

**Interfaces:**
- Consumes: `RhythmCard.suggestedName` present for all clusters (Task 1).
- Produces: `DailyArcProps` WITHOUT `onNameCluster`, `onQuickAddDaily`, `foldTargets`, `onFoldInto`. Task 5's RhythmPage render relies on this exact prop set:
  `{ cards, anytime, familyMembers, matches, nowMinutes, onOpenCollection, onOpenRoutine }`.

- [ ] **Step 1: Rewrite the test file**

Replace the entire contents of `src/components/routine/rhythm/DailyArc.test.tsx` with:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DailyArc } from './DailyArc'
import type { RhythmCard } from './rhythmModel'
import type { Routine } from '@/types/actionable'

let seq = 0
function mk(over: Partial<Routine>): Routine {
  seq += 1
  return {
    id: over.id ?? `r${seq}`, user_id: 'u1', name: over.name ?? `Routine ${seq}`,
    description: null, default_assignee: null, assigned_to: null, assigned_to_all: null,
    visibility: 'active', paused_until: null, recurrence_pattern: { type: 'daily' },
    time_of_day: null, raw_input: null, show_on_timeline: true, context: null,
    created_at: '', updated_at: '', ...over,
  }
}

const base = {
  familyMembers: [],
  matches: () => true,
  nowMinutes: 12 * 60,
  onOpenCollection: vi.fn(),
  onOpenRoutine: vi.fn(),
}

describe('DailyArc', () => {
  it('renders cluster cards with time range and members', () => {
    const card: RhythmCard = {
      kind: 'cluster', id: 'cluster-1', name: null,
      startTime: '06:30:00', endTime: '07:00:00', suggestedName: 'Morning',
      routines: [mk({ name: 'Walk Jax', time_of_day: '06:30:00' }), mk({ name: 'Feed Jax', time_of_day: '07:00:00' })],
    }
    render(<DailyArc {...base} cards={[card]} anytime={[]} />)
    expect(screen.getByText('Walk Jax')).toBeInTheDocument()
    expect(screen.getByText('6:30 – 7')).toBeInTheDocument()
  })

  it('titles auto-groups with the daypart as plain text — no rename affordance', () => {
    const card: RhythmCard = {
      kind: 'cluster', id: 'cluster-1', name: null,
      startTime: '19:00:00', endTime: '19:10:00', suggestedName: 'Bedtime',
      routines: [mk({}), mk({}), mk({})],
    }
    render(<DailyArc {...base} cards={[card]} anytime={[]} />)
    const title = screen.getByText('Bedtime')
    expect(title.closest('button')).toBeNull()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByText(/name this rhythm/i)).not.toBeInTheDocument()
  })

  it('styles auto-groups exactly like named cards (no dashed amber border)', () => {
    const card: RhythmCard = {
      kind: 'cluster', id: 'c1', name: null,
      startTime: '19:00:00', endTime: '19:10:00', suggestedName: 'Bedtime',
      routines: [mk({}), mk({})],
    }
    render(<DailyArc {...base} cards={[card]} anytime={[]} />)
    const el = screen.getByTestId('arc-card-c1')
    expect(el.className).not.toContain('border-dashed')
    expect(el.className).toContain('border-neutral-100')
  })

  it('opens the collection panel from a collection card title', () => {
    const onOpenCollection = vi.fn()
    const parent = mk({ id: 'coll', name: 'Camp Mornings' })
    const card: RhythmCard = {
      kind: 'collection', id: 'coll', name: 'Camp Mornings',
      startTime: '07:00:00', endTime: '07:00:00',
      routines: [mk({ name: 'Eat breakfast' })], routine: parent,
    }
    render(<DailyArc {...base} onOpenCollection={onOpenCollection} cards={[card]} anytime={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Camp Mornings' }))
    expect(onOpenCollection).toHaveBeenCalledWith('coll')
  })

  it('renders anytime pills and opens the routine on click — no quick-add', () => {
    const onOpenRoutine = vi.fn()
    const pt = mk({ name: 'PT Exercises' })
    render(<DailyArc {...base} onOpenRoutine={onOpenRoutine} cards={[]} anytime={[pt]} />)
    fireEvent.click(screen.getByText('PT Exercises'))
    expect(onOpenRoutine).toHaveBeenCalledWith(pt)
    expect(screen.queryByLabelText(/add an every-day routine/i)).not.toBeInTheDocument()
  })

  it('dims non-matching routines when searching', () => {
    const card: RhythmCard = {
      kind: 'single', id: 'a', name: 'Walk Jax', startTime: '06:30:00', endTime: '06:30:00',
      routines: [mk({ id: 'a', name: 'Walk Jax' })],
    }
    render(<DailyArc {...base} matches={() => false} cards={[card]} anytime={[]} />)
    expect(screen.getByTestId('arc-card-a').className).toContain('opacity-30')
  })
})
```

- [ ] **Step 2: Run to verify the new tests fail against current code**

Run: `npx vitest run src/components/routine/rhythm/DailyArc.test.tsx`
Expected: FAIL — current code renders the cluster title inside a button and props require `onNameCluster` (TS error) — either failure mode is fine.

- [ ] **Step 3: Rewrite DailyArc**

Replace the entire contents of `src/components/routine/rhythm/DailyArc.tsx` with:

```tsx
import type { Routine } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'
import { AssigneeAvatar } from '@/components/family/AssigneeAvatar'
import { minutesOf, resolveMembers, type RhythmCard } from './rhythmModel'
import { formatRange, formatClock } from './format'

export interface DailyArcProps {
  cards: RhythmCard[]
  anytime: Routine[]
  familyMembers: FamilyMember[]
  matches: (r: Routine) => boolean
  nowMinutes: number
  onOpenCollection: (id: string) => void
  onOpenRoutine: (r: Routine) => void
}

const ARC_START = 6 * 60   // 6:00
const ARC_END = 21.5 * 60  // 21:30

function pct(minutes: number): number {
  const clamped = Math.min(Math.max(minutes, ARC_START), ARC_END)
  return ((clamped - ARC_START) / (ARC_END - ARC_START)) * 100
}

const RULER_MARKS: { label: string; minutes: number }[] = [
  { label: '6 am', minutes: 6 * 60 },
  { label: '9 am', minutes: 9 * 60 },
  { label: 'noon', minutes: 12 * 60 },
  { label: '4 pm', minutes: 16 * 60 },
  { label: '7 pm', minutes: 19 * 60 },
  { label: '9 pm', minutes: 21 * 60 },
]

function ArcCard({ card, familyMembers, matches, onOpenCollection, onOpenRoutine }: {
  card: RhythmCard
  familyMembers: FamilyMember[]
  matches: (r: Routine) => boolean
  onOpenCollection: (id: string) => void
  onOpenRoutine: (r: Routine) => void
}) {
  const membersOf = (r: Routine): FamilyMember[] => resolveMembers(r, familyMembers)
  const cardMatches =
    card.routines.some(matches) || (card.name != null && matches({ name: card.name } as Routine))

  return (
    <div
      data-testid={`arc-card-${card.id}`}
      className={`min-w-0 rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm transition-all
                  ${cardMatches ? '' : 'opacity-30'}`}
    >
      <div className="flex items-baseline justify-between gap-2 mb-2">
        {card.kind === 'collection' ? (
          <button
            onClick={() => onOpenCollection(card.id)}
            className="font-display font-semibold text-neutral-800 hover:text-amber-700 transition-colors text-left min-w-0 break-words"
          >
            {card.name}
          </button>
        ) : (
          <span className="font-display font-semibold text-neutral-600 min-w-0 break-words">
            {card.name ?? card.suggestedName ?? formatRange(card.startTime, card.endTime)}
          </span>
        )}
        <span className="flex items-center gap-1.5 flex-shrink-0">
          {card.routine && (
            <span className="flex -space-x-1.5">
              {membersOf(card.routine).map(m => (
                <AssigneeAvatar key={m.id} member={m} size="sm" className="ring-1 ring-white" />
              ))}
            </span>
          )}
          <span className="text-[11px] text-neutral-400">{formatRange(card.startTime, card.endTime)}</span>
        </span>
      </div>

      <ul className="flex flex-col gap-1">
        {card.routines.map(r => (
          <li key={r.id}>
            <button
              onClick={() => onOpenRoutine(r)}
              className={`w-full flex items-center justify-between gap-2 text-left text-sm rounded-lg px-2 py-1
                          hover:bg-neutral-50 transition-colors ${matches(r) ? 'text-neutral-700' : 'opacity-30'}`}
            >
              <span className="flex-1 min-w-0 break-words">{r.name}</span>
              <span className="flex items-center gap-1 flex-shrink-0">
                {r.time_of_day && card.kind !== 'single' && (
                  <span className="text-[10px] text-neutral-400">{formatClock(r.time_of_day)}</span>
                )}
                <span className="flex -space-x-1.5">
                  {membersOf(r).map(m => (
                    <AssigneeAvatar key={m.id} member={m} size="sm" className="ring-1 ring-white" />
                  ))}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function DailyArc({ cards, anytime, familyMembers, matches, nowMinutes, onOpenCollection, onOpenRoutine }: DailyArcProps) {
  if (cards.length === 0 && anytime.length === 0) return null

  return (
    <section className="mb-10">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3">Every day</h2>

      {/* Center timeline with staggered cards: the thick dawn→dusk ruler runs
          through the middle; cards alternate above/below and each card starts
          at the horizontal midpoint of the one before it (2-col spans on an
          N+1 column grid). Stems/dots anchor at each card's true start time. */}
      {cards.length > 0 && (
        <div className="overflow-x-auto pt-6 pb-2">
          <div
            className="grid gap-x-3 grid-rows-[auto_4rem_auto]"
            style={{ gridTemplateColumns: `repeat(${cards.length + 1}, 165px)` }}
          >
            {/* The day ruler, spanning all columns */}
            <div className="col-span-full row-start-2 self-center relative h-8 rounded-full border border-[var(--color-border,#eadfcc)]
                            bg-gradient-to-r from-amber-100 via-emerald-50 to-stone-300/60">
              {RULER_MARKS.map(m => (
                <span key={m.label} className="absolute top-1.5 text-[11px] text-neutral-500 -translate-x-1/2"
                      style={{ left: `${pct(m.minutes)}%` }}>
                  {m.label}
                </span>
              ))}
              <div className="absolute -top-1.5 -bottom-1.5 w-0.5 bg-orange-600" style={{ left: `${pct(nowMinutes)}%` }} />
              <span className="absolute -top-6 text-[10px] font-bold text-orange-600 -translate-x-1/2"
                    style={{ left: `${pct(nowMinutes)}%` }}>
                NOW
              </span>
              {/* Stems + dots anchored at each card's true start time — the
                  pointer may sit off-center from its card, and that's fine. */}
              {cards.map((card, i) => {
                const start = minutesOf(card.startTime)
                if (start == null) return null
                const above = i % 2 === 0
                return (
                  <div
                    key={card.id}
                    className={`absolute flex flex-col items-center pointer-events-none -translate-x-1/2
                                ${above ? '-top-4' : '-bottom-4'}`}
                    style={{ left: `${pct(start)}%` }}
                  >
                    {above ? (
                      <>
                        <span className="w-px h-4 bg-amber-400" />
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-white" />
                      </>
                    ) : (
                      <>
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-white" />
                        <span className="w-px h-4 bg-amber-400" />
                      </>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Card cells — each spans 2 columns starting at column i+1, so a
                card's left edge sits at the midpoint of the previous one */}
            {cards.map((card, i) => (
              <div
                key={card.id}
                className={i % 2 === 0 ? 'self-end row-start-1 min-w-0' : 'self-start row-start-3 min-w-0'}
                style={{ gridColumn: `${i + 1} / span 2` }}
              >
                <ArcCard
                  card={card}
                  familyMembers={familyMembers}
                  matches={matches}
                  onOpenCollection={onOpenCollection}
                  onOpenRoutine={onOpenRoutine}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Anytime row */}
      {anytime.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mt-4">
          <span className="text-xs italic text-neutral-400">anytime today —</span>
          {anytime.map(r => (
            <button
              key={r.id}
              onClick={() => onOpenRoutine(r)}
              className={`rounded-full border border-neutral-200 bg-white px-3 py-1 text-sm text-neutral-600
                          hover:border-amber-300 transition-colors ${matches(r) ? '' : 'opacity-30'}`}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/components/routine/rhythm/DailyArc.test.tsx`
Expected: PASS (6 tests). RhythmPage tests will be broken until Task 5 — do NOT run the whole suite here.

- [ ] **Step 5: Commit**

```bash
git add src/components/routine/rhythm/DailyArc.tsx src/components/routine/rhythm/DailyArc.test.tsx
git commit -m "feat(rhythm): calm arc cards — naming/fold/quick-add machinery removed"
```

---

### Task 3: WeekStrip — week-cadence only

**Files:**
- Modify: `src/components/routine/rhythm/WeekStrip.tsx` (full rewrite below)
- Test: `src/components/routine/rhythm/WeekStrip.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `WeekStripProps` = `{ days, sometime, stepCounts, matches, todayKey, onOpenRoutine, familyMembers?, collectionSteps? }`. Props `dailyItems`, `restingDays`, `onWake`, `onQuickAdd`, `onAddStep` are GONE. Task 5 relies on this prop set.

- [ ] **Step 1: Rewrite the test file**

Replace the entire contents of `src/components/routine/rhythm/WeekStrip.test.tsx` with:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WeekStrip } from './WeekStrip'
import type { DayKey } from './rhythmModel'
import type { Routine } from '@/types/actionable'

let seq = 0
function mk(over: Partial<Routine>): Routine {
  seq += 1
  return {
    id: over.id ?? `r${seq}`, user_id: 'u1', name: over.name ?? `Routine ${seq}`,
    description: null, default_assignee: null, assigned_to: null, assigned_to_all: null,
    visibility: 'active', paused_until: null, recurrence_pattern: { type: 'weekly', days: ['sat'] },
    time_of_day: null, raw_input: null, show_on_timeline: true, context: null,
    created_at: '', updated_at: '', ...over,
  }
}

const empty: Record<DayKey, Routine[]> = { sun: [], mon: [], tue: [], wed: [], thu: [], fri: [], sat: [] }
const base = { stepCounts: {}, matches: () => true, todayKey: 'mon' as DayKey, onOpenRoutine: vi.fn(), sometime: [] }

describe('WeekStrip', () => {
  it('marks quiet days, full days, and today', () => {
    const sat = [mk({}), mk({}), mk({}), mk({})]
    render(<WeekStrip {...base} days={{ ...empty, sat }} />)
    expect(screen.getAllByText('quiet').length).toBeGreaterThan(0)
    expect(screen.getByText(/full/)).toBeInTheDocument()
    expect(screen.getByTestId('day-mon').className).toContain('border-')
  })

  it('labels biweekly routines and opens on click', () => {
    const onOpenRoutine = vi.fn()
    const lib = mk({ name: 'Library trip', recurrence_pattern: { type: 'weekly', days: ['thu'], interval: 2 } })
    render(<WeekStrip {...base} onOpenRoutine={onOpenRoutine} days={{ ...empty, thu: [lib] }} />)
    expect(screen.getByText(/every 2 wks/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Library trip'))
    expect(onOpenRoutine).toHaveBeenCalledWith(lib)
  })

  it('expands a collection chip to show its steps read-only', () => {
    const bedtime = mk({ id: 'bed', name: 'Kids Bedtime Routine' })
    const steps = [mk({ name: 'Brush teeth', parent_routine_id: 'bed' })]
    render(<WeekStrip {...base} days={{ ...empty, thu: [bedtime] }} stepCounts={{ bed: 1 }}
                      collectionSteps={{ bed: steps }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Show steps' }))
    expect(screen.getByText('Brush teeth')).toBeInTheDocument()
    expect(screen.queryByLabelText(/add step/i)).not.toBeInTheDocument()
  })

  it('renders the sometime-this-week pocket', () => {
    render(<WeekStrip {...base} days={empty} sometime={[mk({ name: 'Clara nails', recurrence_pattern: { type: 'weekly' } })]} />)
    expect(screen.getByText(/sometime this week/i)).toBeInTheDocument()
    expect(screen.getByText('Clara nails')).toBeInTheDocument()
  })

  it('has no toggles, mirrors, ghosts, or quick-adds', () => {
    render(<WeekStrip {...base} days={{ ...empty, sat: [mk({})] }} />)
    expect(screen.queryByText(/every-day items/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/resting items/i)).not.toBeInTheDocument()
    expect(screen.queryByText('asleep')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/add a routine on/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/routine/rhythm/WeekStrip.test.tsx`
Expected: FAIL (current component renders toggles when props provided; the no-toggles test may pass but the suite must be run to completion — proceed regardless once you've seen the file execute).

- [ ] **Step 3: Rewrite WeekStrip**

Replace the entire contents of `src/components/routine/rhythm/WeekStrip.tsx` with:

```tsx
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { Routine } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'
import { AssigneeAvatar } from '@/components/family/AssigneeAvatar'
import type { DayKey } from './rhythmModel'
import { DAY_ORDER, resolveMembers } from './rhythmModel'

export interface WeekStripProps {
  days: Record<DayKey, Routine[]>
  sometime: Routine[]
  stepCounts: Record<string, number>
  matches: (r: Routine) => boolean
  todayKey: DayKey
  onOpenRoutine: (r: Routine) => void
  familyMembers?: FamilyMember[]
  /** Steps per collection id — enables the expand chevron on collection chips. */
  collectionSteps?: Record<string, Routine[]>
}

const DAY_LABEL: Record<DayKey, string> = {
  sun: 'SUN', mon: 'MON', tue: 'TUE', wed: 'WED', thu: 'THU', fri: 'FRI', sat: 'SAT',
}

const FULL_THRESHOLD = 4

function Chip({ r, stepCounts, matches, onOpen, familyMembers, steps }: {
  r: Routine; stepCounts: Record<string, number>; matches: (r: Routine) => boolean; onOpen: (r: Routine) => void
  familyMembers: FamilyMember[]; steps: Routine[]
}) {
  const [expanded, setExpanded] = useState(false)
  const stepCount = stepCounts[r.id]
  const biweekly = r.recurrence_pattern.type === 'weekly' && r.recurrence_pattern.interval === 2
  const members = resolveMembers(r, familyMembers)
  return (
    <div
      className={`w-full rounded-lg bg-emerald-50/60 px-2 py-1.5 text-xs text-neutral-700
                  transition-colors ${matches(r) ? '' : 'opacity-30'}`}
    >
      <div className="flex items-start gap-1">
        <button onClick={() => onOpen(r)} className="flex-1 min-w-0 text-left hover:text-emerald-900">
          <span className="line-clamp-2">{r.name}</span>
        </button>
        {steps.length > 0 && (
          <button
            onClick={() => setExpanded(v => !v)}
            aria-label={expanded ? 'Hide steps' : 'Show steps'}
            className="flex-shrink-0 rounded p-0.5 text-neutral-400 hover:bg-emerald-100 hover:text-neutral-600 transition-colors"
          >
            <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>
      {(stepCount || biweekly || members.length > 0) && (
        <span className="mt-0.5 flex items-center justify-between gap-1">
          <span className="text-[10px] text-neutral-400">
            {stepCount ? `${stepCount} steps` : ''}{stepCount && biweekly ? ' · ' : ''}{biweekly ? 'every 2 wks' : ''}
          </span>
          {members.length > 0 && (
            <span className="flex -space-x-1.5">
              {members.map(m => (
                <AssigneeAvatar key={m.id} member={m} size="sm" className="ring-1 ring-white" />
              ))}
            </span>
          )}
        </span>
      )}
      {expanded && (
        <ul className="mt-1.5 border-l-2 border-emerald-200 pl-2 flex flex-col gap-0.5">
          {steps.map(s => (
            <li key={s.id} className="text-[10px] leading-snug text-neutral-500">{s.name}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function WeekStrip({ days, sometime, stepCounts, matches, todayKey, onOpenRoutine, familyMembers = [], collectionSteps = {} }: WeekStripProps) {
  const total = DAY_ORDER.reduce((n, d) => n + days[d].length, 0)
  if (total === 0 && sometime.length === 0) return null

  return (
    <section className="mb-10">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">Through the week</h2>
      <div className="grid grid-cols-[repeat(7,minmax(92px,1fr))] gap-2 overflow-x-auto min-w-0">
        {DAY_ORDER.map(day => {
          const items = days[day]
          const isToday = day === todayKey
          return (
            <div
              key={day}
              data-testid={`day-${day}`}
              className={`rounded-xl p-2 ${
                isToday
                  ? 'border-2 border-[var(--color-primary-500,#3d5a44)] bg-emerald-50/40'
                  : 'border border-neutral-100 bg-white'
              }`}
            >
              <div className={`text-[10px] font-bold mb-1.5 ${isToday ? 'text-emerald-800' : 'text-neutral-400'}`}>
                {DAY_LABEL[day]}
                {isToday && ' · today'}
                {items.length >= FULL_THRESHOLD && <span className="text-orange-600"> · full</span>}
              </div>
              {items.length === 0 ? (
                <div className="text-[11px] italic text-neutral-300">quiet</div>
              ) : (
                <div className="flex flex-col gap-1">
                  {items.map(r => (
                    <Chip key={`${day}-${r.id}`} r={r} stepCounts={stepCounts} matches={matches}
                          onOpen={onOpenRoutine} familyMembers={familyMembers}
                          steps={collectionSteps[r.id] ?? []} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {sometime.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mt-2">
          <span className="text-xs italic text-neutral-400">sometime this week —</span>
          {sometime.map(r => (
            <button
              key={r.id}
              onClick={() => onOpenRoutine(r)}
              className={`rounded-full border border-neutral-200 bg-white px-3 py-1 text-sm text-neutral-600
                          hover:border-amber-300 transition-colors ${matches(r) ? '' : 'opacity-30'}`}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/components/routine/rhythm/WeekStrip.test.tsx`
Expected: PASS (5 tests). RhythmPage tests remain broken until Task 5.

- [ ] **Step 5: Commit**

```bash
git add src/components/routine/rhythm/WeekStrip.tsx src/components/routine/rhythm/WeekStrip.test.tsx
git commit -m "feat(rhythm): week strip shows week-cadence only — mirrors/ghosts/toggles/quick-adds removed"
```

---

### Task 4: TendDrawer

**Files:**
- Create: `src/components/routine/rhythm/TendDrawer.tsx`
- Test: `src/components/routine/rhythm/TendDrawer.test.tsx`

**Interfaces:**
- Consumes: `TendCard` (existing, props `{ findings, routines, onMerge, onStampDomain, onRename, onLetGo, onDismiss }`), `SeasonalShelf` (existing, props `{ routines, onWakeAll, onOpenRoutine }`), `RhythmCard` type, `tendFindingKey`-style dismissal keys.
- Produces (Task 5 relies on these exact names/types):

```typescript
export function groupSuggestionKey(card: RhythmCard): string  // `g:${sorted routine ids joined '.'}`

export interface TendDrawerProps {
  open: boolean
  onClose: () => void
  clusters: RhythmCard[]                 // arc cards with kind 'cluster', already filtered of dismissed
  findings: TendFinding[]
  routines: Routine[]
  looseItems: Routine[]                  // standalone active top-level routines
  sleepers: Routine[]                    // model.seasonal
  foldTargets: { id: string; name: string }[]
  familyMembers: FamilyMember[]
  onNameGroup: (card: RhythmCard, name: string) => void
  onFoldInto: (targetId: string, routineIds: string[]) => void
  onDismiss: (key: string) => void
  onMerge: (survivorId: string, loserIds: string[]) => void
  onStampDomain: (id: string, context: 'work' | 'family' | 'personal') => void
  onRename: (id: string, name: string) => void
  onLetGo: (id: string) => void
  onWakeAll: () => void
  onOpenRoutine: (r: Routine) => void
}
```

- [ ] **Step 1: Write the test file**

Create `src/components/routine/rhythm/TendDrawer.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TendDrawer, groupSuggestionKey } from './TendDrawer'
import type { RhythmCard } from './rhythmModel'
import type { Routine } from '@/types/actionable'

let seq = 0
function mk(over: Partial<Routine>): Routine {
  seq += 1
  return {
    id: over.id ?? `r${seq}`, user_id: 'u1', name: over.name ?? `Routine ${seq}`,
    description: null, default_assignee: null, assigned_to: null, assigned_to_all: null,
    visibility: 'active', paused_until: null, recurrence_pattern: { type: 'daily' },
    time_of_day: null, raw_input: null, show_on_timeline: true, context: null,
    created_at: '', updated_at: '', ...over,
  }
}

const cluster: RhythmCard = {
  kind: 'cluster', id: 'cluster-a', name: null,
  startTime: '19:01:00', endTime: '19:06:00', suggestedName: 'Bedtime',
  routines: [mk({ id: 'a', name: 'Hamper' }), mk({ id: 'b', name: 'Reading' })],
}

const base = {
  open: true,
  onClose: vi.fn(),
  clusters: [] as RhythmCard[],
  findings: [],
  routines: [] as Routine[],
  looseItems: [] as Routine[],
  sleepers: [] as Routine[],
  foldTargets: [] as { id: string; name: string }[],
  familyMembers: [],
  onNameGroup: vi.fn(),
  onFoldInto: vi.fn(),
  onDismiss: vi.fn(),
  onMerge: vi.fn(),
  onStampDomain: vi.fn(),
  onRename: vi.fn(),
  onLetGo: vi.fn(),
  onWakeAll: vi.fn(),
  onOpenRoutine: vi.fn(),
}

describe('groupSuggestionKey', () => {
  it('is order-independent over member ids', () => {
    expect(groupSuggestionKey(cluster)).toBe('g:a.b')
  })
})

describe('TendDrawer', () => {
  it('renders nothing when closed', () => {
    render(<TendDrawer {...base} open={false} clusters={[cluster]} />)
    expect(screen.queryByText(/tend/i)).not.toBeInTheDocument()
  })

  it('shows the empty state when there is nothing to tend', () => {
    render(<TendDrawer {...base} />)
    expect(screen.getByText(/nothing to tend/i)).toBeInTheDocument()
  })

  it('names a group: submits via onNameGroup with the typed name', () => {
    const onNameGroup = vi.fn()
    render(<TendDrawer {...base} clusters={[cluster]} onNameGroup={onNameGroup} />)
    const input = screen.getByPlaceholderText('Name this rhythm')
    fireEvent.change(input, { target: { value: 'Evening reset' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onNameGroup).toHaveBeenCalledWith(cluster, 'Evening reset')
  })

  it('folds into an existing routine when the typed name matches exactly', () => {
    const onNameGroup = vi.fn()
    const onFoldInto = vi.fn()
    render(<TendDrawer {...base} clusters={[cluster]} onNameGroup={onNameGroup} onFoldInto={onFoldInto}
      foldTargets={[{ id: 'bed', name: 'Kids Bedtime Routine' }]} />)
    const input = screen.getByPlaceholderText('Name this rhythm')
    fireEvent.change(input, { target: { value: 'kids bedtime routine' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onFoldInto).toHaveBeenCalledWith('bed', ['a', 'b'])
    expect(onNameGroup).not.toHaveBeenCalled()
  })

  it('folds via a suggestion button filtered by typed text', () => {
    const onFoldInto = vi.fn()
    render(<TendDrawer {...base} clusters={[cluster]} onFoldInto={onFoldInto}
      foldTargets={[{ id: 'bed', name: 'Kids Bedtime Routine' }, { id: 'x', name: 'Camp Mornings' }]} />)
    fireEvent.change(screen.getByPlaceholderText('Name this rhythm'), { target: { value: 'bedtime' } })
    expect(screen.queryByRole('button', { name: 'Camp Mornings' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Kids Bedtime Routine' }))
    expect(onFoldInto).toHaveBeenCalledWith('bed', ['a', 'b'])
  })

  it('dismisses a group suggestion with its g: key', () => {
    const onDismiss = vi.fn()
    render(<TendDrawer {...base} clusters={[cluster]} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: /dismiss.*bedtime/i }))
    expect(onDismiss).toHaveBeenCalledWith('g:a.b')
  })

  it('moves a loose item into a chosen routine', () => {
    const onFoldInto = vi.fn()
    const walk = mk({ id: 'walk', name: 'Walk Jax' })
    render(<TendDrawer {...base} looseItems={[walk]} onFoldInto={onFoldInto}
      foldTargets={[{ id: 'walk', name: 'Walk Jax' }, { id: 'bed', name: 'Kids Bedtime Routine' }]} />)
    fireEvent.change(screen.getByLabelText(/move walk jax into/i), { target: { value: 'bed' } })
    expect(onFoldInto).toHaveBeenCalledWith('bed', ['walk'])
    // the routine itself must not be offered as its own target
    expect(screen.queryByRole('option', { name: 'Walk Jax' })).not.toBeInTheDocument()
  })

  it('renders the sleeping section with wake-all', () => {
    const onWakeAll = vi.fn()
    render(<TendDrawer {...base} sleepers={[mk({ name: 'Walk kids to school', visibility: 'reference' })]}
      onWakeAll={onWakeAll} />)
    expect(screen.getByText(/walk kids to school/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /wake all/i }))
    expect(onWakeAll).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/routine/rhythm/TendDrawer.test.tsx`
Expected: FAIL — module `./TendDrawer` not found.

- [ ] **Step 3: Implement TendDrawer**

Create `src/components/routine/rhythm/TendDrawer.tsx`:

```tsx
import { useState } from 'react'
import { X } from 'lucide-react'
import type { Routine } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'
import type { RhythmCard } from './rhythmModel'
import type { TendFinding } from './tendHeuristics'
import { formatRange } from './format'
import { TendCard } from './TendCard'
import { SeasonalShelf } from './SeasonalShelf'

/** Dismissal key for a name-this-group suggestion (order-independent). */
export function groupSuggestionKey(card: RhythmCard): string {
  return `g:${card.routines.map(r => r.id).sort().join('.')}`
}

export interface TendDrawerProps {
  open: boolean
  onClose: () => void
  /** Arc cards with kind 'cluster', already filtered of dismissed keys. */
  clusters: RhythmCard[]
  findings: TendFinding[]
  routines: Routine[]
  /** Standalone active top-level routines (no steps, not a collection). */
  looseItems: Routine[]
  /** model.seasonal — resting routines. */
  sleepers: Routine[]
  foldTargets: { id: string; name: string }[]
  familyMembers: FamilyMember[]
  onNameGroup: (card: RhythmCard, name: string) => void
  onFoldInto: (targetId: string, routineIds: string[]) => void
  onDismiss: (key: string) => void
  onMerge: (survivorId: string, loserIds: string[]) => void
  onStampDomain: (id: string, context: 'work' | 'family' | 'personal') => void
  onRename: (id: string, name: string) => void
  onLetGo: (id: string) => void
  onWakeAll: () => void
  onOpenRoutine: (r: Routine) => void
}

function GroupRow({ card, foldTargets, onNameGroup, onFoldInto, onDismiss }: {
  card: RhythmCard
  foldTargets: { id: string; name: string }[]
  onNameGroup: TendDrawerProps['onNameGroup']
  onFoldInto: TendDrawerProps['onFoldInto']
  onDismiss: TendDrawerProps['onDismiss']
}) {
  const [name, setName] = useState('')
  const memberIds = card.routines.map(r => r.id)
  const targets = foldTargets.filter(t => !memberIds.includes(t.id))
  const typed = name.trim().toLowerCase()
  const suggestions = targets.filter(t => !typed || t.name.toLowerCase().includes(typed)).slice(0, 4)

  const submit = () => {
    if (!name.trim()) return
    const exact = targets.find(t => t.name.toLowerCase() === typed)
    if (exact) onFoldInto(exact.id, memberIds)
    else onNameGroup(card, name.trim())
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-neutral-700">
          These travel together ({formatRange(card.startTime, card.endTime)}):{' '}
          <span className="text-neutral-500">{card.routines.map(r => r.name).join(', ')}</span>
        </p>
        <button
          onClick={() => onDismiss(groupSuggestionKey(card))}
          aria-label={`Dismiss ${card.suggestedName ?? 'group'} suggestion`}
          className="flex-shrink-0 rounded p-1 text-neutral-300 hover:bg-neutral-100 hover:text-neutral-500 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit() }}
        placeholder="Name this rhythm"
        className="mt-2 w-full rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm focus:outline-none
                   focus:ring-2 focus:ring-amber-400"
      />
      {suggestions.length > 0 && (
        <div className="mt-1.5 flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-neutral-400">or add these into</span>
          {suggestions.map(t => (
            <button
              key={t.id}
              onClick={() => onFoldInto(t.id, memberIds)}
              className="text-left text-xs rounded-lg bg-emerald-50 px-2 py-1 text-emerald-900
                         hover:bg-emerald-100 transition-colors"
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function scheduleSummary(r: Routine): string {
  const p = r.recurrence_pattern
  const time = r.time_of_day ? ` · ${r.time_of_day.slice(0, 5)}` : ''
  if (p.type === 'weekly' && p.days?.length) return `Weekly · ${p.days.join(', ')}${time}`
  if (p.type === 'daily') return `Daily${time}`
  return `${p.type}${time}`
}

function LooseRow({ r, foldTargets, onFoldInto, onOpenRoutine }: {
  r: Routine
  foldTargets: { id: string; name: string }[]
  onFoldInto: TendDrawerProps['onFoldInto']
  onOpenRoutine: TendDrawerProps['onOpenRoutine']
}) {
  const targets = foldTargets.filter(t => t.id !== r.id)
  return (
    <div className="flex items-center gap-2 rounded-lg bg-white border border-neutral-200 px-2.5 py-2">
      <button onClick={() => onOpenRoutine(r)} className="flex-1 min-w-0 text-left">
        <span className="block text-sm text-neutral-700 truncate">{r.name}</span>
        <span className="block text-[10px] text-neutral-400">{scheduleSummary(r)}</span>
      </button>
      {targets.length > 0 && (
        <select
          value=""
          aria-label={`Move ${r.name} into`}
          onChange={e => { if (e.target.value) onFoldInto(e.target.value, [r.id]) }}
          className="max-w-[45%] rounded-lg border border-neutral-200 bg-white px-1.5 py-1 text-xs text-neutral-600"
        >
          <option value="">Move into…</option>
          {targets.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      )}
    </div>
  )
}

export function TendDrawer(props: TendDrawerProps) {
  const { open, onClose, clusters, findings, routines, looseItems, sleepers, foldTargets } = props
  if (!open) return null

  const empty = clusters.length === 0 && findings.length === 0 && looseItems.length === 0 && sleepers.length === 0

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className="h-full w-full max-w-md overflow-y-auto bg-[var(--color-bg-base)] p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold text-neutral-800">Tend</h2>
          <button onClick={onClose} aria-label="Close tend drawer"
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {empty && (
          <p className="py-10 text-center text-sm text-neutral-400">Nothing to tend — the rhythm is clean.</p>
        )}

        {clusters.length > 0 && (
          <section className="mb-6">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">Name your rhythms</h3>
            <div className="flex flex-col gap-2">
              {clusters.map(c => (
                <GroupRow key={c.id} card={c} foldTargets={foldTargets}
                  onNameGroup={props.onNameGroup} onFoldInto={props.onFoldInto} onDismiss={props.onDismiss} />
              ))}
            </div>
          </section>
        )}

        {findings.length > 0 && (
          <TendCard
            findings={findings}
            routines={routines}
            onMerge={props.onMerge}
            onStampDomain={props.onStampDomain}
            onRename={props.onRename}
            onLetGo={props.onLetGo}
            onDismiss={props.onDismiss}
          />
        )}

        {looseItems.length > 0 && (
          <section className="mb-6">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">On their own</h3>
            <div className="flex flex-col gap-1.5">
              {looseItems.map(r => (
                <LooseRow key={r.id} r={r} foldTargets={foldTargets}
                  onFoldInto={props.onFoldInto} onOpenRoutine={props.onOpenRoutine} />
              ))}
            </div>
          </section>
        )}

        {sleepers.length > 0 && (
          <SeasonalShelf routines={sleepers} onWakeAll={props.onWakeAll} onOpenRoutine={props.onOpenRoutine} />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/components/routine/rhythm/TendDrawer.test.tsx`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/routine/rhythm/TendDrawer.tsx src/components/routine/rhythm/TendDrawer.test.tsx
git commit -m "feat(rhythm): Tend drawer — group naming, loose items, sleepers in one doorway"
```

---

### Task 5: RhythmPage rewire + deletions + full suite

**Files:**
- Modify: `src/components/routine/RhythmPage.tsx`
- Modify: `src/apps/routines/RoutinesApp.tsx` (remove quick-create)
- Delete: `src/components/routine/rhythm/QuickAddInput.tsx`, `src/components/routine/PauseRoutineModal.tsx`
- Test: `src/components/routine/RhythmPage.test.tsx`

**Interfaces:**
- Consumes: Task 2's DailyArcProps, Task 3's WeekStripProps, Task 4's TendDrawer + groupSuggestionKey.
- Produces: `RhythmPageProps` loses `onQuickCreate`. Everything else keeps its current name and signature (`onGroupIntoCollection(name, ids, opts?)`, `onAddToCollection(collectionId, ids)`, etc.).

- [ ] **Step 1: Update RhythmPage**

In `src/components/routine/RhythmPage.tsx`:

a. Imports: remove `useRef`; add `TendDrawer, groupSuggestionKey`; add `Wrench` to the lucide import (keep `Plus, Search, Sparkles, RefreshCw`).

```tsx
import { Plus, Search, Sparkles, RefreshCw, Wrench } from 'lucide-react'
import { TendDrawer, groupSuggestionKey } from './rhythm/TendDrawer'
```

b. Remove from props and destructuring: `onQuickCreate`. Keep `onAddToCollection` and `onGroupIntoCollection`.

c. Add state: `const [tendOpen, setTendOpen] = useState(false)`.

d. After the `findings` memo, add:

```tsx
  // Arc clusters whose name-this-group suggestion hasn't been dismissed.
  const activeClusters = useMemo(
    () => model.daily.timed.filter(c => c.kind === 'cluster' && !dismissedTend.includes(groupSuggestionKey(c))),
    [model, dismissedTend],
  )
  const tendCount = findings.length + activeClusters.length
  const looseItems = useMemo(
    () => routines.filter(r => !r.parent_routine_id && r.visibility === 'active' && !model.stepCounts[r.id]),
    [routines, model],
  )
```

e. Replace `handleNameCluster` body reference: keep it, it is now passed to the drawer as `onNameGroup` (same signature `(card, name)`).

f. Delete the sticky-nav machinery entirely: the `scrollRef` on the outer div (keep the plain `<div className="h-full overflow-auto …">` without ref), `zoneRefs`, `weekCount`, `zones`, `activeZone`, `zoneKeys`, the scroll-spy `useEffect`, `jumpTo`, `setZoneRef`, and the `<nav>` block. Replace each `<div ref={setZoneRef('…')} className="scroll-mt-16">` wrapper with a plain `<div>`.

g. Masthead: after the Build with AI button and before New routine, add:

```tsx
            <button
              onClick={() => setTendOpen(true)}
              className="relative flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2.5
                         font-medium text-neutral-700 shadow-sm hover:border-emerald-400 transition-colors"
            >
              <Wrench className="w-4 h-4 text-emerald-700" />
              Tend
              {tendCount > 0 && (
                <span className="ml-0.5 rounded-full bg-emerald-700 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {tendCount}
                </span>
              )}
            </button>
```

h. DailyArc render — new prop set only:

```tsx
          <DailyArc
            cards={model.daily.timed}
            anytime={model.daily.anytime}
            familyMembers={familyMembers}
            matches={matches}
            nowMinutes={nowMinutes}
            onOpenCollection={id => setOpen({ kind: 'routine', id })}
            onOpenRoutine={openRoutine}
          />
```

i. WeekStrip render — new prop set only:

```tsx
          <WeekStrip
            days={model.week.days}
            sometime={model.week.sometime}
            stepCounts={model.stepCounts}
            matches={matches}
            todayKey={todayKey}
            onOpenRoutine={openRoutine}
            familyMembers={familyMembers}
            collectionSteps={collectionSteps}
          />
```

j. Remove the body `<SeasonalShelf …>` and `<TendCard …>` sections (and their imports if now unused — `SeasonalShelf` and `TendCard` are consumed by the drawer, so REMOVE their imports from RhythmPage).

k. Before the panel overlay, render the drawer:

```tsx
      <TendDrawer
        open={tendOpen}
        onClose={() => setTendOpen(false)}
        clusters={activeClusters}
        findings={findings}
        routines={routines}
        looseItems={looseItems}
        sleepers={model.seasonal}
        foldTargets={foldTargets}
        familyMembers={familyMembers}
        onNameGroup={handleNameCluster}
        onFoldInto={(targetId, ids) => onAddToCollection?.(targetId, ids)}
        onDismiss={dismissTend}
        onMerge={handleMerge}
        onStampDomain={(id, context) => onUpdateRoutine(id, { context })}
        onRename={(id, name) => onUpdateRoutine(id, { name })}
        onLetGo={id => onDelete?.(id)}
        onWakeAll={handleWakeAll}
        onOpenRoutine={r => { setTendOpen(false); openRoutine(r) }}
      />
```

l. Type-anywhere search guard: the `if (open) return` check must also return when `tendOpen` is true — change to `if (open || tendOpen) return` and add `tendOpen` to the effect deps.

- [ ] **Step 2: Update RoutinesApp**

In `src/apps/routines/RoutinesApp.tsx`: delete `handleQuickCreate` and the `onQuickCreate={handleQuickCreate}` prop line. Everything else stays.

- [ ] **Step 3: Delete dead files**

```bash
git rm src/components/routine/rhythm/QuickAddInput.tsx src/components/routine/PauseRoutineModal.tsx
```

Then verify no imports remain: `grep -rn "QuickAddInput\|PauseRoutineModal" src --include="*.ts" --include="*.tsx"` → expected: no output.

- [ ] **Step 4: Update RhythmPage tests**

In `src/components/routine/RhythmPage.test.tsx`:

- The zone test currently asserts nav pills / headings via `getByRole('heading', …)` — headings still exist for Every day / Through the week / Sometimes; remove any assertions for a 'Resting' or 'Tend' heading in the page body.
- Replace the test `'naming a cluster calls onGroupIntoCollection with member ids'` with a drawer-driven version:

```tsx
  it('naming a group in the Tend drawer calls onGroupIntoCollection with time opts', () => {
    const onGroupIntoCollection = vi.fn()
    render(
      <RhythmPage {...noop} onUpdateRoutine={vi.fn()} onGroupIntoCollection={onGroupIntoCollection}
        routines={[
          mk('Hamper', { id: 'a', time_of_day: '19:01:00' }),
          mk('Pajamas', { id: 'b', time_of_day: '19:02:00' }),
          mk('Reading', { id: 'c', time_of_day: '19:06:00' }),
        ]} />
    )
    fireEvent.click(screen.getByRole('button', { name: /tend/i }))
    const input = screen.getByPlaceholderText('Name this rhythm')
    fireEvent.change(input, { target: { value: 'Bedtime' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onGroupIntoCollection).toHaveBeenCalledWith('Bedtime', ['a', 'b', 'c'],
      { time_of_day: '19:01', recurrence_pattern: { type: 'daily' } })
  })
```

- Replace the fold test `'folding a cluster into an existing routine calls onAddToCollection'` with a drawer-driven version:

```tsx
  it('folding a group into an existing routine via the drawer calls onAddToCollection', () => {
    const onAddToCollection = vi.fn()
    render(
      <RhythmPage {...noop} onUpdateRoutine={vi.fn()} onAddToCollection={onAddToCollection}
        routines={[
          mk('Hamper', { id: 'a', time_of_day: '19:01:00' }),
          mk('Pajamas', { id: 'b', time_of_day: '19:02:00' }),
          mk('Kids Bedtime Routine', { id: 'bed', recurrence_pattern: { type: 'weekly', days: ['sun', 'tue'] }, time_of_day: '19:15:00' }),
        ]} />
    )
    fireEvent.click(screen.getByRole('button', { name: /tend/i }))
    fireEvent.change(screen.getByPlaceholderText('Name this rhythm'), { target: { value: 'Kids Bedtime' } })
    fireEvent.click(screen.getByRole('button', { name: 'Kids Bedtime Routine' }))
    expect(onAddToCollection).toHaveBeenCalledWith('bed', ['a', 'b'])
  })
```

- Add a badge test:

```tsx
  it('shows a Tend badge counting findings plus nameable groups', () => {
    render(
      <RhythmPage {...noop} onUpdateRoutine={vi.fn()}
        routines={[
          mk('Hamper', { id: 'a', time_of_day: '19:01:00' }),
          mk('Pajamas', { id: 'b', time_of_day: '19:02:00' }),
        ]} />
    )
    // one cluster, no findings → badge shows 1
    expect(screen.getByRole('button', { name: /tend/i })).toHaveTextContent('1')
  })
```

- The existing dismiss-persistence test targets TendCard rows in the page body; it must now open the drawer first (`fireEvent.click(screen.getByRole('button', { name: /tend/i }))`) before interacting. Adjust it accordingly (keep its assertions about localStorage `rhythm-tend-dismissed`).
- Any test referencing quick-add, toggles, mirrors, ghosts, sticky-nav pills, or arc-card naming inputs must be updated to assert absence or be removed.

- [ ] **Step 5: Typecheck + affected tests**

Run: `npx tsc --noEmit`
Expected: no output.

Run: `npx vitest run src/components/routine src/apps src/components/surface/TapRoutinePanel.test.tsx`
Expected: PASS.

- [ ] **Step 6: Full suite**

Run: `npx vitest run`
Expected: all files pass (~390 files). Fix any straggler that imports the deleted files or old props.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(routines): calm consolidation — read-only picture + Tend drawer"
```

---

## Final verification (controller, after all tasks)

- `npm run build` succeeds.
- `npx eslint` on all touched files: no errors.
- Push `rhythm-calm` to origin as a branch first if a preview check is wanted; otherwise rebase on origin/main and `git push origin HEAD:main` (pre-push hook runs tsc + suite).
