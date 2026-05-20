# Week / Planning View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Week/Planning view per the approved spec at `docs/superpowers/specs/2026-05-20-week-planning-view-design.md`. Desktop-first calendar grid with chip-strip drag source, edge resize, auto-advance cross-week navigation, three editorial summary cards, and a mobile list fallback.

**Architecture:** Replace the existing `WeekView` (mounted via `HomeView` when `currentView === 'week'`) with a new `WeekViewV2` family of components. One `DndContext` wraps the desktop variant; custom pointer-event hooks handle resize. Mobile renders `WeekViewMobile` (list view, no drag). All persistence goes through the same `onUpdateTask`/`onUpdateEvent`/`onUpdateRoutine` callbacks the existing WeekView already receives.

**Tech Stack:** React 19 + TypeScript strict, `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` (already in package.json), Tailwind v4, Vitest + RTL, existing hooks (`useMealPlan`, `useGroceryStatus`, `useFamilyMembers`, `useSupabaseTasks`).

---

## File Structure

**Created:**
- `src/lib/weekColorMap.ts` — pure: `colorFor(item) → { bg, text, ring }`
- `src/lib/weekColorMap.test.ts`
- `src/lib/weekHighlights.ts` — pure helpers: `familyDinnerSummary`, `groceriesSummary`, `prepAheadSummary`
- `src/lib/weekHighlights.test.ts`
- `src/components/home/week/WeekSummaryRow.tsx`
- `src/components/home/week/WeekSummaryRow.test.tsx`
- `src/components/home/week/UnscheduledChipStrip.tsx`
- `src/components/home/week/UnscheduledChipStrip.test.tsx`
- `src/components/home/week/WeekNavArrows.tsx`
- `src/components/home/week/WeekGrid.tsx`
- `src/components/home/week/WeekGrid.test.tsx`
- `src/components/home/week/WeekEventBlock.tsx`
- `src/components/home/week/WeekEventBlock.test.tsx`
- `src/components/home/week/useWeekDragDrop.ts`
- `src/components/home/week/useWeekDragDrop.test.ts`
- `src/components/home/week/useBlockResize.ts`
- `src/components/home/week/useBlockResize.test.ts`
- `src/components/home/week/WeekViewV2.tsx`
- `src/components/home/week/WeekViewMobile.tsx`
- `src/components/home/week/WeekViewMobile.test.tsx`

**Modified:**
- `src/components/home/HomeView.tsx` — swap `<WeekView>` for `<WeekViewV2>` (gated behind a feature flag for one cycle)

**Untouched (kept for fallback):**
- `src/components/home/WeekView.tsx` — stays as-is for one cycle in case rollback is needed

---

## Pre-flight: create worktree + baseline

- [ ] **Step 0.1: Create isolated worktree off `main`**

```bash
cd /Users/scottkaufman/Developer/Developer/symphonyOS
git fetch origin main
git worktree add .worktrees/week-planning -b feat/week-planning-view origin/main
cp .env .worktrees/week-planning/.env
cd .worktrees/week-planning
npm install
```

- [ ] **Step 0.2: Verify baseline tests pass**

```bash
npm test -- --run 2>&1 | tail -6
```

Expected: the pre-existing baseline (4 failures: 3 TodayView mobile-fix-test-drift + 1 NotesPage flake + 1 useSpaces flaky error). Phase 4 must not introduce new failures.

---

## Task 1: `weekColorMap` pure helper

Per spec, single function `colorFor(item: TimelineItem) → { bg, text, ring }`. Six event-type → color mappings + fallback.

**Files:**
- Create: `src/lib/weekColorMap.ts`
- Create: `src/lib/weekColorMap.test.ts`

- [ ] **Step 1.1: Write failing tests**

Create `src/lib/weekColorMap.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import type { TimelineItem } from '@/types/timeline'
import { colorFor } from './weekColorMap'

function mk(overrides: Partial<TimelineItem>): TimelineItem {
  return {
    id: 'x',
    type: 'task',
    title: 'X',
    completed: false,
    startTime: null,
    endTime: null,
    allDay: false,
    ...overrides,
  } as TimelineItem
}

describe('colorFor', () => {
  it('returns purple variant for calendar events', () => {
    const c = colorFor(mk({ type: 'event' }))
    expect(c.bg).toContain('271')
  })

  it('returns yellow variant for routines', () => {
    const c = colorFor(mk({ type: 'routine' }))
    expect(c.bg).toContain('45')
  })

  it('returns cream variant for errand-category tasks', () => {
    const c = colorFor(mk({ type: 'task', category: 'errand' }))
    expect(c.bg).toContain('38')
  })

  it('returns cream variant for chore-category tasks', () => {
    const c = colorFor(mk({ type: 'task', category: 'chore' }))
    expect(c.bg).toContain('38')
  })

  it('returns purple variant for activity-category tasks', () => {
    const c = colorFor(mk({ type: 'task', category: 'activity' }))
    expect(c.bg).toContain('271')
  })

  it('returns peach variant for meal items (id starts with "meal:")', () => {
    const c = colorFor(mk({ id: 'meal:abc', type: 'event' }))
    expect(c.bg).toContain('28')
  })

  it('returns green variant for plain tasks', () => {
    const c = colorFor(mk({ type: 'task' }))
    expect(c.bg).toContain('142')
  })

  it('adds rose ring class when item is overdue', () => {
    const c = colorFor(mk({ type: 'task', isOverdue: true }))
    expect(c.ring).toContain('rose')
  })

  it('returns green (fallback) for unknown shapes', () => {
    const c = colorFor(mk({ type: 'unknown' as never }))
    expect(c.bg).toContain('142')
  })
})
```

- [ ] **Step 1.2: Run test, verify it fails**

```bash
npx vitest src/lib/weekColorMap.test.ts --run
```

Expected: FAIL (module missing).

- [ ] **Step 1.3: Implement**

Create `src/lib/weekColorMap.ts`:

```typescript
import type { TimelineItem } from '@/types/timeline'

export interface BlockColor {
  bg: string
  text: string
  ring: string
}

const PURPLE: BlockColor = {
  bg: 'bg-[hsl(271_60%_92%)]',
  text: 'text-[hsl(271_50%_30%)]',
  ring: '',
}

const CREAM: BlockColor = {
  bg: 'bg-[hsl(38_60%_92%)]',
  text: 'text-[hsl(35_50%_35%)]',
  ring: '',
}

const YELLOW: BlockColor = {
  bg: 'bg-[hsl(45_75%_90%)]',
  text: 'text-[hsl(40_60%_30%)]',
  ring: '',
}

const PEACH: BlockColor = {
  bg: 'bg-[hsl(28_55%_90%)]',
  text: 'text-[hsl(14_45%_35%)]',
  ring: '',
}

const GREEN: BlockColor = {
  bg: 'bg-[hsl(142_30%_90%)]',
  text: 'text-[hsl(142_50%_25%)]',
  ring: '',
}

/**
 * Map a TimelineItem to its visual block color for the Week grid.
 * Falls back to plain-task green for unknown shapes.
 */
export function colorFor(item: TimelineItem): BlockColor {
  const base = pickBase(item)
  const ring = item.isOverdue ? 'ring-1 ring-rose-300' : ''
  return { ...base, ring }
}

function pickBase(item: TimelineItem): BlockColor {
  // Meal items take precedence over event type — id prefix is the canonical signal.
  if (typeof item.id === 'string' && item.id.startsWith('meal:')) return PEACH
  if (item.type === 'routine') return YELLOW
  if (item.type === 'event') return PURPLE
  if (item.type === 'task') {
    switch (item.category) {
      case 'errand':
      case 'chore':
        return CREAM
      case 'activity':
      case 'event':
        return PURPLE
      default:
        return GREEN
    }
  }
  return GREEN
}
```

- [ ] **Step 1.4: Verify tests pass**

```bash
npx vitest src/lib/weekColorMap.test.ts --run
```

Expected: 9/9 pass.

- [ ] **Step 1.5: Commit**

```bash
git add src/lib/weekColorMap.ts src/lib/weekColorMap.test.ts
git commit -m "feat(week): colorFor pure helper for event-block color taxonomy"
```

---

## Task 2: `weekHighlights` pure helpers (3 sub-helpers)

Per spec: three summary-card data derivations.

**Files:**
- Create: `src/lib/weekHighlights.ts`
- Create: `src/lib/weekHighlights.test.ts`

- [ ] **Step 2.1: Write failing tests**

Create `src/lib/weekHighlights.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import type { MealPlan, Recipe } from '@/types/meal-planner'
import type { FamilyMember } from '@/types/family'
import type { ConsolidatedIngredient } from '@/lib/consolidateIngredients'
import { familyDinnerSummary, groceriesSummary, prepAheadSummary } from './weekHighlights'

function mkMember(id: string, name: string, overrides: Partial<FamilyMember> = {}): FamilyMember {
  return {
    id, user_id: 'u1', name,
    initials: name.slice(0, 2).toUpperCase(),
    color: 'blue', avatar_url: null,
    is_full_user: false, display_order: 0,
    created_at: '2026-01-01',
    member_type: 'core',
    ...overrides,
  }
}

function mkRecipe(id: string, prep: number | null = 30): Recipe {
  return {
    id, title: `r-${id}`, sourceUrl: null, imageUrl: null,
    prepMinutes: prep, ingredients: [], instructions: [],
    createdAt: new Date(2026, 0, 1),
  } as Recipe
}

describe('familyDinnerSummary', () => {
  it('returns zero when plan is null', () => {
    expect(familyDinnerSummary(null, [], new Date()).nights).toBe(0)
  })

  it('counts unique day-of-week dinner entries', () => {
    const plan = {
      id: 'p1', weekStartIso: '2026-05-17', parameter: null,
      entries: [
        { id: 'e1', dayOfWeek: 0, slot: 'dinner', recipeId: 'r1', adHocTitle: null, familyMemberId: null },
        { id: 'e2', dayOfWeek: 1, slot: 'dinner', recipeId: 'r2', adHocTitle: null, familyMemberId: null },
        { id: 'e3', dayOfWeek: 2, slot: 'lunch',  recipeId: null, adHocTitle: 'X', familyMemberId: null },
      ],
    } as MealPlan
    expect(familyDinnerSummary(plan, [], new Date()).nights).toBe(2)
  })

  it('emits core-member avatars (guests excluded)', () => {
    const members = [
      mkMember('a', 'Iris'),
      mkMember('b', 'Babysitter', { member_type: 'guest' }),
    ]
    const result = familyDinnerSummary(null, members, new Date())
    expect(result.avatars).toHaveLength(1)
    expect(result.avatars[0].id).toBe('a')
  })
})

describe('groceriesSummary', () => {
  it('returns missing count from passed list', () => {
    const items: ConsolidatedIngredient[] = [
      { text: 'Snap peas', category: 'Produce', fromRecipeIds: [] },
      { text: 'Brown rice', category: 'Pantry', fromRecipeIds: [] },
    ]
    expect(groceriesSummary(items).missingCount).toBe(2)
  })

  it('returns 0 when nothing missing', () => {
    expect(groceriesSummary([]).missingCount).toBe(0)
  })
})

describe('prepAheadSummary', () => {
  it('returns null when no plan', () => {
    expect(prepAheadSummary(null, [], new Date(2026, 4, 18))).toBeNull()
  })

  it("returns null when tomorrow's dinner has no recipeId", () => {
    const plan = {
      id: 'p1', weekStartIso: '2026-05-17', parameter: null,
      entries: [
        { id: 'e1', dayOfWeek: 2, slot: 'dinner', recipeId: null, adHocTitle: 'X', familyMemberId: null },
      ],
    } as MealPlan
    expect(prepAheadSummary(plan, [], new Date(2026, 4, 18))).toBeNull()
  })

  it("returns null when tomorrow's dinner prep is ≤30 min", () => {
    const plan = {
      id: 'p1', weekStartIso: '2026-05-17', parameter: null,
      entries: [
        { id: 'e1', dayOfWeek: 2, slot: 'dinner', recipeId: 'r1', adHocTitle: null, familyMemberId: null },
      ],
    } as MealPlan
    expect(prepAheadSummary(plan, [mkRecipe('r1', 30)], new Date(2026, 4, 18))).toBeNull()
  })

  it("returns recipe name when tomorrow's dinner prep is >30 min", () => {
    const plan = {
      id: 'p1', weekStartIso: '2026-05-17', parameter: null,
      entries: [
        { id: 'e1', dayOfWeek: 2, slot: 'dinner', recipeId: 'r1', adHocTitle: null, familyMemberId: null },
      ],
    } as MealPlan
    const result = prepAheadSummary(plan, [mkRecipe('r1', 60)], new Date(2026, 4, 18))
    expect(result?.recipeName).toBe('r-r1')
  })
})
```

- [ ] **Step 2.2: Run, verify failure**

```bash
npx vitest src/lib/weekHighlights.test.ts --run
```

Expected: FAIL (module missing).

- [ ] **Step 2.3: Implement**

Create `src/lib/weekHighlights.ts`:

```typescript
import type { MealPlan, Recipe } from '@/types/meal-planner'
import type { FamilyMember } from '@/types/family'
import type { ConsolidatedIngredient } from '@/lib/consolidateIngredients'

export interface AvatarSummary {
  id: string
  initials: string
  color: string
}

export interface FamilyDinnerSummary {
  nights: number
  avatars: AvatarSummary[]
}

export function familyDinnerSummary(
  plan: MealPlan | null,
  members: FamilyMember[],
  _weekStart: Date,
): FamilyDinnerSummary {
  const nights = plan
    ? new Set(plan.entries.filter((e) => e.slot === 'dinner').map((e) => e.dayOfWeek)).size
    : 0
  const avatars = members
    .filter((m) => m.member_type === 'core')
    .slice()
    .sort((a, b) => a.display_order - b.display_order)
    .map((m) => ({ id: m.id, initials: m.initials, color: m.color }))
  return { nights, avatars }
}

export interface GroceriesSummary {
  missingCount: number
}

export function groceriesSummary(missingItems: ConsolidatedIngredient[]): GroceriesSummary {
  return { missingCount: missingItems.length }
}

export interface PrepAheadSummary {
  recipeName: string
}

/**
 * Returns the recipe to prep tonight when tomorrow's dinner has prepMinutes > 30.
 * Null when no plan, no dinner tomorrow, no linked recipe, or prep ≤30 min.
 */
export function prepAheadSummary(
  plan: MealPlan | null,
  recipes: Recipe[],
  today: Date,
): PrepAheadSummary | null {
  if (!plan) return null
  const tomorrowDow = (today.getDay() + 1) % 7
  const tomorrowDinner = plan.entries.find(
    (e) => e.dayOfWeek === tomorrowDow && e.slot === 'dinner' && !!e.recipeId,
  )
  if (!tomorrowDinner?.recipeId) return null
  const recipe = recipes.find((r) => r.id === tomorrowDinner.recipeId)
  if (!recipe?.prepMinutes || recipe.prepMinutes <= 30) return null
  return { recipeName: recipe.title }
}
```

- [ ] **Step 2.4: Verify pass**

```bash
npx vitest src/lib/weekHighlights.test.ts --run
```

Expected: 8/8 pass.

- [ ] **Step 2.5: Commit**

```bash
git add src/lib/weekHighlights.ts src/lib/weekHighlights.test.ts
git commit -m "feat(week): weekHighlights pure helpers (family dinner / groceries / prep ahead)"
```

---

## Task 3: `WeekSummaryRow` component

Three cards rendered from the helpers above. Cards self-collapse when their data is null/zero.

**Files:**
- Create: `src/components/home/week/WeekSummaryRow.tsx`
- Create: `src/components/home/week/WeekSummaryRow.test.tsx`

- [ ] **Step 3.1: Write failing tests**

Create `src/components/home/week/WeekSummaryRow.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { WeekSummaryRow } from './WeekSummaryRow'

describe('WeekSummaryRow', () => {
  const baseProps = {
    familyDinner: { nights: 0, avatars: [] },
    groceries: { missingCount: 0 },
    prepAhead: null,
  }

  it('renders the dinner card with night count when nights > 0', () => {
    render(<WeekSummaryRow {...baseProps} familyDinner={{ nights: 4, avatars: [] }} />)
    expect(screen.getByText(/4 nights this week/i)).toBeInTheDocument()
  })

  it('hides the dinner card when nights = 0', () => {
    render(<WeekSummaryRow {...baseProps} />)
    expect(screen.queryByText(/nights this week/i)).not.toBeInTheDocument()
  })

  it('renders avatars on the dinner card', () => {
    render(<WeekSummaryRow {...baseProps} familyDinner={{
      nights: 4,
      avatars: [
        { id: 'a', initials: 'SK', color: 'blue' },
        { id: 'b', initials: 'IR', color: 'purple' },
      ],
    }} />)
    expect(screen.getByText('SK')).toBeInTheDocument()
    expect(screen.getByText('IR')).toBeInTheDocument()
  })

  it('renders the groceries card when items missing', () => {
    render(<WeekSummaryRow {...baseProps} groceries={{ missingCount: 2 }} />)
    expect(screen.getByText(/2 items missing/i)).toBeInTheDocument()
  })

  it('hides the groceries card when missingCount = 0', () => {
    render(<WeekSummaryRow {...baseProps} />)
    expect(screen.queryByText(/items missing/i)).not.toBeInTheDocument()
  })

  it('renders the prep-ahead card when a recipe is suggested', () => {
    render(<WeekSummaryRow {...baseProps} prepAhead={{ recipeName: 'Lentil stew' }} />)
    expect(screen.getByText(/prep lentil stew tonight/i)).toBeInTheDocument()
  })

  it('hides the prep-ahead card when prepAhead is null', () => {
    render(<WeekSummaryRow {...baseProps} />)
    expect(screen.queryByText(/prep .* tonight/i)).not.toBeInTheDocument()
  })

  it('renders nothing visible when all cards hide', () => {
    const { container } = render(<WeekSummaryRow {...baseProps} />)
    expect(container.querySelector('section')).toBeNull()
  })
})
```

- [ ] **Step 3.2: Run, verify failure**

```bash
npx vitest src/components/home/week/WeekSummaryRow --run
```

Expected: FAIL (module missing).

- [ ] **Step 3.3: Implement**

Create `src/components/home/week/WeekSummaryRow.tsx`:

```typescript
import { Utensils, ShoppingBag, ChefHat } from 'lucide-react'
import type { FamilyDinnerSummary, GroceriesSummary, PrepAheadSummary } from '@/lib/weekHighlights'

interface WeekSummaryRowProps {
  familyDinner: FamilyDinnerSummary
  groceries: GroceriesSummary
  prepAhead: PrepAheadSummary | null
}

export function WeekSummaryRow({ familyDinner, groceries, prepAhead }: WeekSummaryRowProps) {
  const showDinner = familyDinner.nights > 0
  const showGroceries = groceries.missingCount > 0
  const showPrep = !!prepAhead
  if (!showDinner && !showGroceries && !showPrep) return null

  return (
    <section aria-label="Week summary" className="flex items-stretch gap-3 mb-4">
      {showDinner && (
        <div className="card flex items-center gap-3 px-4 py-3 bg-bg-elevated border border-neutral-200/70 flex-1 min-w-0">
          <Utensils className="w-5 h-5 text-amber-600 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-neutral-800 truncate">Family dinner</p>
            <p className="text-[11px] text-neutral-500">{familyDinner.nights} nights this week</p>
          </div>
          {familyDinner.avatars.length > 0 && (
            <div className="flex -space-x-1.5 shrink-0">
              {familyDinner.avatars.slice(0, 4).map((a) => (
                <span
                  key={a.id}
                  className="inline-flex items-center justify-center w-6 h-6 rounded-full ring-2 ring-bg-elevated text-[9px] font-medium bg-neutral-100 text-neutral-700"
                  aria-hidden
                >
                  {a.initials}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {showGroceries && (
        <div className="card flex items-center gap-3 px-4 py-3 bg-bg-elevated border border-neutral-200/70 flex-1 min-w-0">
          <ShoppingBag className="w-5 h-5 text-amber-500 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-neutral-800 truncate">Groceries</p>
            <p className="text-[11px] text-neutral-500">{groceries.missingCount} items missing</p>
          </div>
        </div>
      )}

      {showPrep && (
        <div className="card flex items-center gap-3 px-4 py-3 bg-bg-elevated border border-neutral-200/70 flex-1 min-w-0">
          <ChefHat className="w-5 h-5 text-primary-600 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-neutral-800 truncate">Prep ahead</p>
            <p className="text-[11px] text-neutral-500 truncate">Prep {prepAhead!.recipeName} tonight</p>
          </div>
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 3.4: Verify pass**

```bash
npx vitest src/components/home/week/WeekSummaryRow --run
```

Expected: 8/8 pass.

- [ ] **Step 3.5: Commit**

```bash
git add src/components/home/week/WeekSummaryRow.tsx src/components/home/week/WeekSummaryRow.test.tsx
git commit -m "feat(week): WeekSummaryRow component (dinner/groceries/prep-ahead cards)"
```

---

## Task 4: `UnscheduledChipStrip` component (drag source — no drop wiring yet)

Renders draggable chips for tasks scheduled this week without a specific time. Drag wiring is set up here; the receiving end gets wired in Task 7.

**Files:**
- Create: `src/components/home/week/UnscheduledChipStrip.tsx`
- Create: `src/components/home/week/UnscheduledChipStrip.test.tsx`

- [ ] **Step 4.1: Write failing tests**

Create `src/components/home/week/UnscheduledChipStrip.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { render } from '@/test/test-utils'
import type { Task } from '@/types/task'
import { UnscheduledChipStrip } from './UnscheduledChipStrip'

function mkTask(id: string, title: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title,
    completed: false,
    scheduledFor: new Date(2026, 4, 20),
    isAllDay: true,
    context: null,
    projectId: null,
    contactId: null,
    assignedTo: null,
    bucket: 'timed',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Task
}

const renderWithDnd = (ui: React.ReactElement) => render(<DndContext>{ui}</DndContext>)

describe('UnscheduledChipStrip', () => {
  it('renders a chip per task title', () => {
    renderWithDnd(
      <UnscheduledChipStrip tasks={[
        mkTask('t1', 'Order shoes'),
        mkTask('t2', 'Call dentist'),
      ]} />,
    )
    expect(screen.getByText('Order shoes')).toBeInTheDocument()
    expect(screen.getByText('Call dentist')).toBeInTheDocument()
  })

  it('renders the empty-state copy when no tasks', () => {
    renderWithDnd(<UnscheduledChipStrip tasks={[]} />)
    expect(screen.getByText(/all scheduled tasks have a time/i)).toBeInTheDocument()
  })

  it('marks each chip with the chip:<taskId> draggable id', () => {
    renderWithDnd(
      <UnscheduledChipStrip tasks={[mkTask('t1', 'Order shoes')]} />,
    )
    const chip = screen.getByText('Order shoes').closest('[data-chip-id]')
    expect(chip).toHaveAttribute('data-chip-id', 'chip:t1')
  })
})
```

- [ ] **Step 4.2: Run, verify failure**

```bash
npx vitest src/components/home/week/UnscheduledChipStrip --run
```

Expected: FAIL.

- [ ] **Step 4.3: Implement**

Create `src/components/home/week/UnscheduledChipStrip.tsx`:

```typescript
import { useDraggable } from '@dnd-kit/core'
import type { Task } from '@/types/task'

interface UnscheduledChipStripProps {
  tasks: Task[]
}

export function UnscheduledChipStrip({ tasks }: UnscheduledChipStripProps) {
  if (tasks.length === 0) {
    return (
      <div className="mb-3 px-1 text-[11px] text-neutral-400">
        All scheduled tasks have a time.
      </div>
    )
  }

  return (
    <div
      role="list"
      aria-label="Unscheduled this week"
      className="mb-3 flex items-center gap-2 overflow-x-auto pb-1"
    >
      {tasks.map((task) => (
        <DraggableChip key={task.id} task={task} />
      ))}
    </div>
  )
}

function DraggableChip({ task }: { task: Task }) {
  const dragId = `chip:${task.id}`
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId,
    data: { kind: 'chip', taskId: task.id },
  })

  return (
    <div
      ref={setNodeRef}
      data-chip-id={dragId}
      role="listitem"
      {...attributes}
      {...listeners}
      className={`
        shrink-0 inline-flex items-center px-3 py-1.5 rounded-full
        bg-bg-elevated border border-neutral-200 text-[12px] text-neutral-700
        cursor-grab active:cursor-grabbing select-none
        transition-opacity ${isDragging ? 'opacity-40' : ''}
      `}
    >
      {task.title}
    </div>
  )
}
```

- [ ] **Step 4.4: Verify pass**

```bash
npx vitest src/components/home/week/UnscheduledChipStrip --run
```

Expected: 3/3 pass.

- [ ] **Step 4.5: Commit**

```bash
git add src/components/home/week/UnscheduledChipStrip.tsx src/components/home/week/UnscheduledChipStrip.test.tsx
git commit -m "feat(week): UnscheduledChipStrip drag source"
```

---

## Task 5: `WeekGrid` static render (7 columns × 13 hours)

The static grid: column headers, all-day row, hourly rows, 15-min sub-slots. Each sub-slot is a drop target (id `slot:<dayISO>:<HH>:<MM>`). Wiring drop handlers to actual mutations happens in Task 7.

**Files:**
- Create: `src/components/home/week/WeekGrid.tsx`
- Create: `src/components/home/week/WeekGrid.test.tsx`

- [ ] **Step 5.1: Write failing tests**

Create `src/components/home/week/WeekGrid.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { render } from '@/test/test-utils'
import { WeekGrid } from './WeekGrid'

const renderWithDnd = (ui: React.ReactElement) => render(<DndContext>{ui}</DndContext>)

describe('WeekGrid', () => {
  const weekStart = new Date(2026, 4, 17) // Sun May 17

  it('renders 7 day-column headers with weekday + date', () => {
    renderWithDnd(<WeekGrid weekStart={weekStart} children={null} />)
    expect(screen.getByText(/SUN/i)).toBeInTheDocument()
    expect(screen.getByText(/SAT/i)).toBeInTheDocument()
    expect(screen.getByText(/17/)).toBeInTheDocument()
    expect(screen.getByText(/23/)).toBeInTheDocument()
  })

  it('renders hour labels from 8 AM to 9 PM', () => {
    renderWithDnd(<WeekGrid weekStart={weekStart} children={null} />)
    expect(screen.getByText(/8 AM/)).toBeInTheDocument()
    expect(screen.getByText(/9 PM/)).toBeInTheDocument()
  })

  it('renders 13 hour rows total', () => {
    const { container } = renderWithDnd(<WeekGrid weekStart={weekStart} children={null} />)
    const hourLabels = container.querySelectorAll('[data-hour-label]')
    expect(hourLabels).toHaveLength(13)
  })

  it('exposes an all-day events row labeled "all-day"', () => {
    renderWithDnd(<WeekGrid weekStart={weekStart} children={null} />)
    expect(screen.getByText(/all-day/i)).toBeInTheDocument()
  })

  it('renders provided children (positioned event blocks)', () => {
    renderWithDnd(
      <WeekGrid weekStart={weekStart}>
        <div data-testid="positioned-block">block</div>
      </WeekGrid>,
    )
    expect(screen.getByTestId('positioned-block')).toBeInTheDocument()
  })
})
```

- [ ] **Step 5.2: Run, verify failure**

```bash
npx vitest src/components/home/week/WeekGrid --run
```

Expected: FAIL.

- [ ] **Step 5.3: Implement**

Create `src/components/home/week/WeekGrid.tsx`:

```typescript
import { useDroppable } from '@dnd-kit/core'
import type { ReactNode } from 'react'

const FIRST_HOUR = 8
const LAST_HOUR = 21        // 9 PM
const SLOTS_PER_HOUR = 4    // 15-min increments
const HOUR_ROW_HEIGHT = 60  // px

interface WeekGridProps {
  weekStart: Date  // Sunday of the displayed week, 00:00 local
  children?: ReactNode  // Positioned <WeekEventBlock>s rendered absolutely on top
}

export function WeekGrid({ weekStart, children }: WeekGridProps) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })

  return (
    <div className="relative border border-neutral-200 rounded-xl overflow-hidden bg-white">
      {/* Day-column headers */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-neutral-200 bg-neutral-50/40">
        <div className="px-2 py-2 text-[10px] uppercase tracking-wide text-neutral-400">Time</div>
        {days.map((d, i) => (
          <div key={i} className="px-2 py-2 text-center border-l border-neutral-200/60">
            <div className="text-[10px] uppercase tracking-wide text-neutral-500">
              {d.toLocaleDateString('en-US', { weekday: 'short' })}
            </div>
            <div className="text-[13px] font-medium text-neutral-800">{d.getDate()}</div>
          </div>
        ))}
      </div>

      {/* All-day row */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-neutral-200 bg-neutral-50/20 min-h-[36px]">
        <div className="px-2 py-2 text-[10px] uppercase tracking-wide text-neutral-400">all-day</div>
        {days.map((d, i) => (
          <AllDaySlot key={i} day={d} />
        ))}
      </div>

      {/* Hour rows */}
      <div className="relative">
        {Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, hourIdx) => {
          const hour = FIRST_HOUR + hourIdx
          return (
            <div
              key={hour}
              className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-neutral-100"
              style={{ height: HOUR_ROW_HEIGHT }}
            >
              <div data-hour-label className="px-2 py-1 text-[10px] text-neutral-400">
                {hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`}
              </div>
              {days.map((d, i) => (
                <HourCell key={i} day={d} hour={hour} />
              ))}
            </div>
          )
        })}
        {/* Absolutely-positioned event blocks layer */}
        <div className="absolute inset-0 pointer-events-none">
          {children}
        </div>
      </div>
    </div>
  )
}

function AllDaySlot({ day }: { day: Date }) {
  const id = `slot:${dayKey(day)}:all-day`
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { kind: 'allDay', dayIso: dayKey(day) },
  })
  return (
    <div
      ref={setNodeRef}
      className={`border-l border-neutral-200/60 ${isOver ? 'bg-primary-50/60' : ''}`}
    />
  )
}

function HourCell({ day, hour }: { day: Date; hour: number }) {
  // Four droppable sub-slots inside one hour cell.
  return (
    <div className="border-l border-neutral-200/60 grid grid-rows-4">
      {Array.from({ length: SLOTS_PER_HOUR }, (_, i) => (
        <SubSlot key={i} day={day} hour={hour} minute={i * 15} />
      ))}
    </div>
  )
}

function SubSlot({ day, hour, minute }: { day: Date; hour: number; minute: number }) {
  const id = `slot:${dayKey(day)}:${pad(hour)}:${pad(minute)}`
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { kind: 'timed', dayIso: dayKey(day), hour, minute },
  })
  return (
    <div
      ref={setNodeRef}
      className={`${isOver ? 'bg-primary-50/60' : 'hover:bg-neutral-50/40'}`}
    />
  )
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}
```

- [ ] **Step 5.4: Verify tests pass**

```bash
npx vitest src/components/home/week/WeekGrid --run
```

Expected: 5/5 pass.

- [ ] **Step 5.5: Commit**

```bash
git add src/components/home/week/WeekGrid.tsx src/components/home/week/WeekGrid.test.tsx
git commit -m "feat(week): WeekGrid static render (7 cols × hours, 15-min sub-slot drop targets)"
```

---

## Task 6: `WeekEventBlock` (click + render only — drag/resize wired in Tasks 7-9)

The positioned block. Renders absolutely at the right `top`/`left`/`height` per its `startTime`/`endTime` and the displayed day. Click opens detail panel.

**Files:**
- Create: `src/components/home/week/WeekEventBlock.tsx`
- Create: `src/components/home/week/WeekEventBlock.test.tsx`

- [ ] **Step 6.1: Write failing tests**

Create `src/components/home/week/WeekEventBlock.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { render } from '@/test/test-utils'
import { WeekEventBlock } from './WeekEventBlock'
import type { TimelineItem } from '@/types/timeline'

const renderWithDnd = (ui: React.ReactElement) => render(<DndContext>{ui}</DndContext>)

function mkItem(overrides: Partial<TimelineItem>): TimelineItem {
  const start = new Date(2026, 4, 20, 13, 0)
  const end = new Date(2026, 4, 20, 14, 0)
  return {
    id: 't1',
    type: 'task',
    title: 'Therapy appt',
    completed: false,
    startTime: start,
    endTime: end,
    allDay: false,
    ...overrides,
  } as TimelineItem
}

describe('WeekEventBlock', () => {
  const weekStart = new Date(2026, 4, 17) // Sun May 17

  it('renders the title', () => {
    renderWithDnd(
      <WeekEventBlock item={mkItem({})} weekStart={weekStart} onSelect={vi.fn()} />,
    )
    expect(screen.getByText('Therapy appt')).toBeInTheDocument()
  })

  it('renders a "Routine — view only" hint when item is a routine', () => {
    renderWithDnd(
      <WeekEventBlock
        item={mkItem({ type: 'routine', title: 'Brush teeth' })}
        weekStart={weekStart}
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByLabelText(/routine.*view only/i)).toBeInTheDocument()
  })

  it('calls onSelect with item.id when clicked', async () => {
    const onSelect = vi.fn()
    const { user } = render(
      <DndContext>
        <WeekEventBlock item={mkItem({})} weekStart={weekStart} onSelect={onSelect} />
      </DndContext>,
    )
    await user.click(screen.getByText('Therapy appt'))
    expect(onSelect).toHaveBeenCalledWith('t1')
  })
})
```

- [ ] **Step 6.2: Run, verify failure**

```bash
npx vitest src/components/home/week/WeekEventBlock --run
```

Expected: FAIL.

- [ ] **Step 6.3: Implement**

Create `src/components/home/week/WeekEventBlock.tsx`:

```typescript
import { useDraggable } from '@dnd-kit/core'
import type { TimelineItem } from '@/types/timeline'
import { colorFor } from '@/lib/weekColorMap'

const FIRST_HOUR = 8
const HOUR_ROW_HEIGHT = 60 // px (must match WeekGrid)
const COL_HEADER_HEIGHT = 36 + 36 // header + all-day row (matches WeekGrid)
const TIME_COL_WIDTH = 60 // px

interface WeekEventBlockProps {
  item: TimelineItem
  weekStart: Date
  onSelect: (id: string) => void
}

export function WeekEventBlock({ item, weekStart, onSelect }: WeekEventBlockProps) {
  const placement = computePlacement(item, weekStart)
  if (!placement) return null

  const { dayIdx, top, height } = placement
  const color = colorFor(item)
  const isRoutine = item.type === 'routine'

  // Routines render-only in Phase 4 (no drag).
  const dragId = isRoutine ? `block-routine:${item.id}` : `block:${item.id}`
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId,
    disabled: isRoutine,
    data: { kind: 'block', itemId: item.id, originStartIso: item.startTime?.toISOString() },
  })

  return (
    <div
      ref={setNodeRef}
      {...(isRoutine ? {} : { ...attributes, ...listeners })}
      aria-label={isRoutine ? `Routine — view only: ${item.title}` : item.title}
      onClick={(e) => { e.stopPropagation(); onSelect(item.id) }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(item.id) } }}
      tabIndex={0}
      role="button"
      className={`
        absolute pointer-events-auto
        rounded-md ${color.bg} ${color.text} ${color.ring}
        px-2 py-1 text-[12px] leading-tight overflow-hidden cursor-pointer
        ${isDragging ? 'opacity-40' : ''}
        ${isRoutine ? 'cursor-default' : ''}
      `}
      style={{
        top,
        left: `calc(${TIME_COL_WIDTH}px + (100% - ${TIME_COL_WIDTH}px) * ${dayIdx} / 7)`,
        width: `calc((100% - ${TIME_COL_WIDTH}px) / 7 - 4px)`,
        height,
      }}
    >
      <div className="truncate font-medium">{item.title}</div>
    </div>
  )
}

interface Placement {
  dayIdx: number
  top: number
  height: number
}

function computePlacement(item: TimelineItem, weekStart: Date): Placement | null {
  if (!item.startTime) return null
  const start = item.startTime
  const end = item.endTime ?? new Date(start.getTime() + 30 * 60 * 1000) // 30-min default

  const dayIdx = daysBetween(weekStart, start)
  if (dayIdx < 0 || dayIdx > 6) return null

  const startMins = start.getHours() * 60 + start.getMinutes()
  const endMins = end.getHours() * 60 + end.getMinutes()
  const firstMinute = FIRST_HOUR * 60
  const pxPerMin = HOUR_ROW_HEIGHT / 60

  // Top is relative to the top of the hour-rows region (NOT counting header/all-day).
  // The parent positions this layer accordingly via WeekGrid's absolute inset.
  const top = Math.max(0, (startMins - firstMinute) * pxPerMin) + COL_HEADER_HEIGHT
  const height = Math.max(HOUR_ROW_HEIGHT / 4, (endMins - startMins) * pxPerMin) // min 15-min

  return { dayIdx, top, height }
}

function daysBetween(from: Date, to: Date): number {
  const a = new Date(from); a.setHours(0, 0, 0, 0)
  const b = new Date(to);   b.setHours(0, 0, 0, 0)
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}
```

- [ ] **Step 6.4: Verify tests pass**

```bash
npx vitest src/components/home/week/WeekEventBlock --run
```

Expected: 3/3 pass.

- [ ] **Step 6.5: Commit**

```bash
git add src/components/home/week/WeekEventBlock.tsx src/components/home/week/WeekEventBlock.test.tsx
git commit -m "feat(week): WeekEventBlock — positioned, draggable, click→detail"
```

---

## Task 7: `useWeekDragDrop` hook + chip-to-grid + block-to-block move

Wire `DndContext` handlers. Two drag flows: chip→slot (assigns time + 30-min duration), block→slot (reschedules).

**Files:**
- Create: `src/components/home/week/useWeekDragDrop.ts`
- Create: `src/components/home/week/useWeekDragDrop.test.ts`

- [ ] **Step 7.1: Write failing tests**

Create `src/components/home/week/useWeekDragDrop.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWeekDragDrop } from './useWeekDragDrop'

const mkOver = (slotId: string) => ({
  active: { id: 'chip:t1', data: { current: { kind: 'chip', taskId: 't1' } } },
  over: { id: slotId, data: { current: { kind: 'timed', dayIso: '2026-05-20', hour: 13, minute: 30 } } },
})

const mkBlockOver = (slotId: string) => ({
  active: { id: 'block:t1', data: { current: { kind: 'block', itemId: 't1', originStartIso: '2026-05-20T10:00:00' } } },
  over: { id: slotId, data: { current: { kind: 'timed', dayIso: '2026-05-21', hour: 14, minute: 0 } } },
})

describe('useWeekDragDrop', () => {
  it('chip drop on timed slot calls onUpdateTask with the new start + 30-min duration', async () => {
    const onUpdateTask = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useWeekDragDrop({
      weekStart: new Date(2026, 4, 17),
      onWeekChange: vi.fn(),
      onUpdateTask,
      onUpdateEvent: vi.fn(),
      onUpdateRoutine: vi.fn(),
      tasks: [{ id: 't1', title: 'X' } as never],
      events: [], routines: [],
    }))

    await act(async () => {
      result.current.dndHandlers.onDragEnd(mkOver('slot:2026-05-20:13:30') as never)
    })

    expect(onUpdateTask).toHaveBeenCalledTimes(1)
    const [taskId, updates] = onUpdateTask.mock.calls[0]
    expect(taskId).toBe('t1')
    expect(updates.isAllDay).toBe(false)
    expect(updates.scheduledFor).toBeInstanceOf(Date)
    expect((updates.scheduledFor as Date).getHours()).toBe(13)
    expect((updates.scheduledFor as Date).getMinutes()).toBe(30)
    // 30-min duration default
    expect((updates.endTime as Date).getTime() - (updates.scheduledFor as Date).getTime()).toBe(30 * 60 * 1000)
  })

  it('block drop preserves the dragged item duration when moving to a new slot', async () => {
    const onUpdateTask = vi.fn().mockResolvedValue(undefined)
    const startIso = '2026-05-20T10:00:00'
    const endIso = '2026-05-20T11:30:00'  // 90-min duration
    const { result } = renderHook(() => useWeekDragDrop({
      weekStart: new Date(2026, 4, 17),
      onWeekChange: vi.fn(),
      onUpdateTask,
      onUpdateEvent: vi.fn(),
      onUpdateRoutine: vi.fn(),
      tasks: [{
        id: 't1', title: 'X',
        scheduledFor: new Date(startIso), endTime: new Date(endIso),
      } as never],
      events: [], routines: [],
    }))

    await act(async () => {
      result.current.dndHandlers.onDragEnd(mkBlockOver('slot:2026-05-21:14:00') as never)
    })

    expect(onUpdateTask).toHaveBeenCalledTimes(1)
    const updates = onUpdateTask.mock.calls[0][1]
    const dur = (updates.endTime as Date).getTime() - (updates.scheduledFor as Date).getTime()
    expect(dur).toBe(90 * 60 * 1000)
    expect((updates.scheduledFor as Date).getHours()).toBe(14)
  })

  it('onDragCancel produces no mutation', async () => {
    const onUpdateTask = vi.fn()
    const { result } = renderHook(() => useWeekDragDrop({
      weekStart: new Date(2026, 4, 17),
      onWeekChange: vi.fn(),
      onUpdateTask,
      onUpdateEvent: vi.fn(),
      onUpdateRoutine: vi.fn(),
      tasks: [], events: [], routines: [],
    }))

    await act(async () => {
      result.current.dndHandlers.onDragCancel()
    })
    expect(onUpdateTask).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 7.2: Run, verify failure**

```bash
npx vitest src/components/home/week/useWeekDragDrop --run
```

Expected: FAIL.

- [ ] **Step 7.3: Implement**

Create `src/components/home/week/useWeekDragDrop.ts`:

```typescript
import { useCallback, useState } from 'react'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine } from '@/types/actionable'

interface UseWeekDragDropArgs {
  weekStart: Date
  onWeekChange: (newWeekStart: Date) => void
  onUpdateTask: (taskId: string, updates: Partial<Task>) => Promise<void> | void
  onUpdateEvent: (eventId: string, updates: Partial<CalendarEvent>) => Promise<void> | void
  onUpdateRoutine: (routineId: string, updates: Partial<Routine>) => Promise<void> | void
  tasks: Task[]
  events: CalendarEvent[]
  routines: Routine[]
}

interface UseWeekDragDropResult {
  dndHandlers: {
    onDragStart: (e: DragStartEvent) => void
    onDragEnd: (e: DragEndEvent) => void
    onDragCancel: () => void
  }
  activeDragId: string | null
}

const DEFAULT_DURATION_MS = 30 * 60 * 1000

export function useWeekDragDrop(args: UseWeekDragDropArgs): UseWeekDragDropResult {
  const { tasks, onUpdateTask } = args
  const [activeDragId, setActiveDragId] = useState<string | null>(null)

  const onDragStart = useCallback((e: DragStartEvent) => {
    setActiveDragId(String(e.active.id))
  }, [])

  const onDragCancel = useCallback(() => {
    setActiveDragId(null)
  }, [])

  const onDragEnd = useCallback((e: DragEndEvent) => {
    setActiveDragId(null)
    if (!e.over) return

    const activeData = e.active.data.current as { kind?: string; taskId?: string; itemId?: string } | undefined
    const overData = e.over.data.current as { kind?: string; dayIso?: string; hour?: number; minute?: number } | undefined
    if (!activeData || !overData) return
    if (overData.kind !== 'timed' || !overData.dayIso) return // ignore all-day for now (Phase 4 scope)

    const newStart = parseSlotTime(overData.dayIso, overData.hour ?? 0, overData.minute ?? 0)

    if (activeData.kind === 'chip' && activeData.taskId) {
      // Chip drop: assign time + 30-min default duration
      void onUpdateTask(activeData.taskId, {
        isAllDay: false,
        scheduledFor: newStart,
        endTime: new Date(newStart.getTime() + DEFAULT_DURATION_MS),
      })
      return
    }

    if (activeData.kind === 'block' && activeData.itemId) {
      // Block move: preserve duration
      const task = tasks.find((t) => t.id === activeData.itemId)
      if (!task?.scheduledFor) return
      const oldStart = task.scheduledFor
      const oldEnd = task.endTime ?? new Date(oldStart.getTime() + DEFAULT_DURATION_MS)
      const duration = oldEnd.getTime() - oldStart.getTime()
      void onUpdateTask(activeData.itemId, {
        scheduledFor: newStart,
        endTime: new Date(newStart.getTime() + duration),
      })
      return
    }
  }, [tasks, onUpdateTask])

  return {
    dndHandlers: { onDragStart, onDragEnd, onDragCancel },
    activeDragId,
  }
}

function parseSlotTime(dayIso: string, hour: number, minute: number): Date {
  const [y, m, d] = dayIso.split('-').map(Number)
  return new Date(y, m - 1, d, hour, minute, 0, 0)
}
```

- [ ] **Step 7.4: Verify tests pass**

```bash
npx vitest src/components/home/week/useWeekDragDrop --run
```

Expected: 3/3 pass.

- [ ] **Step 7.5: Commit**

```bash
git add src/components/home/week/useWeekDragDrop.ts src/components/home/week/useWeekDragDrop.test.ts
git commit -m "feat(week): useWeekDragDrop — chip→slot + block→slot drop handlers"
```

---

## Task 8: `useBlockResize` hook + wire into `WeekEventBlock`

Custom pointer-event resize handles. Top + bottom edges. 15-min snap, 15-min minimum duration.

**Files:**
- Create: `src/components/home/week/useBlockResize.ts`
- Create: `src/components/home/week/useBlockResize.test.ts`
- Modify: `src/components/home/week/WeekEventBlock.tsx` (add resize handles)

- [ ] **Step 8.1: Write failing tests**

Create `src/components/home/week/useBlockResize.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBlockResize } from './useBlockResize'

const SLOT_PX = 15 // pixels per 15-min slot (= HOUR_ROW_HEIGHT / 4 = 60/4)

describe('useBlockResize', () => {
  it('bottom-edge drag down by 4 slots adds 60 min to endTime', () => {
    const onCommit = vi.fn()
    const start = new Date(2026, 4, 20, 13, 0)
    const end = new Date(2026, 4, 20, 14, 0)

    const { result } = renderHook(() => useBlockResize({
      startTime: start, endTime: end, pxPerMin: 60 / 60, onCommit,
    }))

    act(() => result.current.handlers.onPointerDownBottom({
      pointerId: 1, clientY: 200, currentTarget: { setPointerCapture: vi.fn() },
      preventDefault: () => {},
    } as never))

    act(() => result.current.handlers.onPointerMove({
      pointerId: 1, clientY: 200 + SLOT_PX * 4,
    } as never))

    act(() => result.current.handlers.onPointerUp({ pointerId: 1 } as never))

    expect(onCommit).toHaveBeenCalledTimes(1)
    const updates = onCommit.mock.calls[0][0]
    expect(updates.endTime.getHours()).toBe(15)
    expect(updates.endTime.getMinutes()).toBe(0)
  })

  it('top-edge drag down by 2 slots adds 30 min to startTime', () => {
    const onCommit = vi.fn()
    const start = new Date(2026, 4, 20, 13, 0)
    const end = new Date(2026, 4, 20, 14, 0)

    const { result } = renderHook(() => useBlockResize({
      startTime: start, endTime: end, pxPerMin: 60 / 60, onCommit,
    }))

    act(() => result.current.handlers.onPointerDownTop({
      pointerId: 1, clientY: 100, currentTarget: { setPointerCapture: vi.fn() },
      preventDefault: () => {},
    } as never))

    act(() => result.current.handlers.onPointerMove({
      pointerId: 1, clientY: 100 + SLOT_PX * 2,
    } as never))

    act(() => result.current.handlers.onPointerUp({ pointerId: 1 } as never))

    const updates = onCommit.mock.calls[0][0]
    expect(updates.scheduledFor.getHours()).toBe(13)
    expect(updates.scheduledFor.getMinutes()).toBe(30)
  })

  it('refuses to commit below 15-min minimum duration', () => {
    const onCommit = vi.fn()
    const start = new Date(2026, 4, 20, 13, 0)
    const end = new Date(2026, 4, 20, 14, 0)

    const { result } = renderHook(() => useBlockResize({
      startTime: start, endTime: end, pxPerMin: 60 / 60, onCommit,
    }))

    act(() => result.current.handlers.onPointerDownBottom({
      pointerId: 1, clientY: 200, currentTarget: { setPointerCapture: vi.fn() },
      preventDefault: () => {},
    } as never))

    // Drag UP by enough slots to shrink below 15 min
    act(() => result.current.handlers.onPointerMove({
      pointerId: 1, clientY: 200 - SLOT_PX * 5,
    } as never))

    act(() => result.current.handlers.onPointerUp({ pointerId: 1 } as never))

    // Should commit with min 15-min duration enforced
    const updates = onCommit.mock.calls[0][0]
    const dur = updates.endTime.getTime() - start.getTime()
    expect(dur).toBeGreaterThanOrEqual(15 * 60 * 1000)
  })
})
```

- [ ] **Step 8.2: Run, verify failure**

```bash
npx vitest src/components/home/week/useBlockResize --run
```

Expected: FAIL.

- [ ] **Step 8.3: Implement**

Create `src/components/home/week/useBlockResize.ts`:

```typescript
import { useCallback, useRef, useState } from 'react'

interface UseBlockResizeArgs {
  startTime: Date
  endTime: Date
  pxPerMin: number  // 1.0 when HOUR_ROW_HEIGHT=60
  onCommit: (updates: { scheduledFor: Date; endTime: Date }) => void
}

interface UseBlockResizeResult {
  handlers: {
    onPointerDownTop: (e: React.PointerEvent) => void
    onPointerDownBottom: (e: React.PointerEvent) => void
    onPointerMove: (e: React.PointerEvent) => void
    onPointerUp: (e: React.PointerEvent) => void
  }
  /** When >0, the in-progress visual delta in pixels (positive = grow). Use to render the
   * block at start + topDelta and bottom + bottomDelta during the drag. */
  preview: { topDelta: number; bottomDelta: number } | null
}

const MIN_DURATION_MS = 15 * 60 * 1000
const SLOT_MIN = 15

export function useBlockResize({ startTime, endTime, pxPerMin, onCommit }: UseBlockResizeArgs): UseBlockResizeResult {
  const [preview, setPreview] = useState<{ topDelta: number; bottomDelta: number } | null>(null)
  const draggingRef = useRef<{ edge: 'top' | 'bottom'; startClientY: number } | null>(null)

  const onPointerDownTop = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    draggingRef.current = { edge: 'top', startClientY: e.clientY }
    setPreview({ topDelta: 0, bottomDelta: 0 })
  }, [])

  const onPointerDownBottom = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    draggingRef.current = { edge: 'bottom', startClientY: e.clientY }
    setPreview({ topDelta: 0, bottomDelta: 0 })
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = draggingRef.current
    if (!drag) return
    const deltaPx = e.clientY - drag.startClientY
    const deltaMins = snap(deltaPx / pxPerMin)
    if (drag.edge === 'top') {
      setPreview({ topDelta: deltaMins, bottomDelta: 0 })
    } else {
      setPreview({ topDelta: 0, bottomDelta: deltaMins })
    }
  }, [pxPerMin])

  const onPointerUp = useCallback((_e: React.PointerEvent) => {
    const drag = draggingRef.current
    draggingRef.current = null
    if (!drag) {
      setPreview(null)
      return
    }
    const p = preview ?? { topDelta: 0, bottomDelta: 0 }
    let newStart = startTime
    let newEnd = endTime
    if (drag.edge === 'top') {
      newStart = new Date(startTime.getTime() + p.topDelta * 60 * 1000)
    } else {
      newEnd = new Date(endTime.getTime() + p.bottomDelta * 60 * 1000)
    }
    // Enforce 15-min minimum
    if (newEnd.getTime() - newStart.getTime() < MIN_DURATION_MS) {
      if (drag.edge === 'top') {
        newStart = new Date(newEnd.getTime() - MIN_DURATION_MS)
      } else {
        newEnd = new Date(newStart.getTime() + MIN_DURATION_MS)
      }
    }
    setPreview(null)
    onCommit({ scheduledFor: newStart, endTime: newEnd })
  }, [preview, startTime, endTime, onCommit])

  return {
    handlers: { onPointerDownTop, onPointerDownBottom, onPointerMove, onPointerUp },
    preview,
  }
}

function snap(mins: number): number {
  return Math.round(mins / SLOT_MIN) * SLOT_MIN
}
```

- [ ] **Step 8.4: Verify tests pass**

```bash
npx vitest src/components/home/week/useBlockResize --run
```

Expected: 3/3 pass.

- [ ] **Step 8.5: Wire resize handles into `WeekEventBlock`**

Modify `src/components/home/week/WeekEventBlock.tsx`:

After the existing imports, add:

```typescript
import { useBlockResize } from './useBlockResize'
```

Inside the component, BEFORE the existing draggable logic, add the resize hook:

```typescript
const resize = useBlockResize({
  startTime: item.startTime!,
  endTime: item.endTime ?? new Date(item.startTime!.getTime() + 30 * 60 * 1000),
  pxPerMin: HOUR_ROW_HEIGHT / 60,
  onCommit: (updates) => {
    onResizeCommit?.(item.id, updates)
  },
})

const isResizing = !!resize.preview
```

Update the `useDraggable` call to disable while resizing:

```typescript
const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
  id: dragId,
  disabled: isRoutine || isResizing,
  data: { kind: 'block', itemId: item.id, originStartIso: item.startTime?.toISOString() },
})
```

Update the component's props interface to add `onResizeCommit`:

```typescript
interface WeekEventBlockProps {
  item: TimelineItem
  weekStart: Date
  onSelect: (id: string) => void
  onResizeCommit?: (itemId: string, updates: { scheduledFor: Date; endTime: Date }) => void
}
```

And destructure it:

```typescript
export function WeekEventBlock({ item, weekStart, onSelect, onResizeCommit }: WeekEventBlockProps) {
```

In the rendered JSX, BEFORE the closing `</div>` of the block, add the two resize handles:

```tsx
{!isRoutine && (
  <>
    <div
      onPointerDown={resize.handlers.onPointerDownTop}
      onPointerMove={resize.handlers.onPointerMove}
      onPointerUp={resize.handlers.onPointerUp}
      onClick={(e) => e.stopPropagation()}
      className="absolute top-0 left-0 right-0 h-1.5 cursor-ns-resize hover:bg-black/10"
      aria-label="Resize start time"
    />
    <div
      onPointerDown={resize.handlers.onPointerDownBottom}
      onPointerMove={resize.handlers.onPointerMove}
      onPointerUp={resize.handlers.onPointerUp}
      onClick={(e) => e.stopPropagation()}
      className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize hover:bg-black/10"
      aria-label="Resize end time"
    />
  </>
)}
```

Adjust the rendered `style` block to honor `resize.preview` for in-flight visual feedback:

```typescript
const previewTopOffset = (resize.preview?.topDelta ?? 0) * (HOUR_ROW_HEIGHT / 60)
const previewBottomOffset = (resize.preview?.bottomDelta ?? 0) * (HOUR_ROW_HEIGHT / 60)
// ... then in style:
style={{
  top: top + previewTopOffset,
  left: `calc(${TIME_COL_WIDTH}px + (100% - ${TIME_COL_WIDTH}px) * ${dayIdx} / 7)`,
  width: `calc((100% - ${TIME_COL_WIDTH}px) / 7 - 4px)`,
  height: Math.max(HOUR_ROW_HEIGHT / 4, height - previewTopOffset + previewBottomOffset),
}}
```

- [ ] **Step 8.6: Verify all tests still pass**

```bash
npx vitest src/components/home/week --run 2>&1 | tail -6
```

Expected: all current tests pass.

- [ ] **Step 8.7: Commit**

```bash
git add src/components/home/week/useBlockResize.ts src/components/home/week/useBlockResize.test.ts src/components/home/week/WeekEventBlock.tsx
git commit -m "feat(week): useBlockResize hook + top/bottom edge resize handles on blocks"
```

---

## Task 9: Cross-week auto-advance

Add edge-hover detection to `useWeekDragDrop`. When pointer enters the rightmost/leftmost 40px during a drag and stays for 500ms, advance the week. 300ms cooldown after each advance.

**Files:**
- Modify: `src/components/home/week/useWeekDragDrop.ts`
- Modify: `src/components/home/week/useWeekDragDrop.test.ts` (add tests)

- [ ] **Step 9.1: Add failing tests for auto-advance**

Append to `src/components/home/week/useWeekDragDrop.test.ts`:

```typescript
describe('useWeekDragDrop — cross-week auto-advance', () => {
  it('fires onWeekChange forward when right-edge hover persists ≥500ms', () => {
    vi.useFakeTimers()
    const onWeekChange = vi.fn()
    const { result } = renderHook(() => useWeekDragDrop({
      weekStart: new Date(2026, 4, 17),
      onWeekChange,
      onUpdateTask: vi.fn(), onUpdateEvent: vi.fn(), onUpdateRoutine: vi.fn(),
      tasks: [], events: [], routines: [],
    }))

    act(() => result.current.notifyEdge('right'))
    act(() => { vi.advanceTimersByTime(500) })

    expect(onWeekChange).toHaveBeenCalledTimes(1)
    const newStart = onWeekChange.mock.calls[0][0]
    expect(newStart.getDate()).toBe(24)
    vi.useRealTimers()
  })

  it('fires onWeekChange backward when left-edge hover persists ≥500ms', () => {
    vi.useFakeTimers()
    const onWeekChange = vi.fn()
    const { result } = renderHook(() => useWeekDragDrop({
      weekStart: new Date(2026, 4, 17),
      onWeekChange,
      onUpdateTask: vi.fn(), onUpdateEvent: vi.fn(), onUpdateRoutine: vi.fn(),
      tasks: [], events: [], routines: [],
    }))

    act(() => result.current.notifyEdge('left'))
    act(() => { vi.advanceTimersByTime(500) })

    expect(onWeekChange).toHaveBeenCalledTimes(1)
    expect(onWeekChange.mock.calls[0][0].getDate()).toBe(10)
    vi.useRealTimers()
  })

  it('cancels auto-advance when edge state clears before 500ms', () => {
    vi.useFakeTimers()
    const onWeekChange = vi.fn()
    const { result } = renderHook(() => useWeekDragDrop({
      weekStart: new Date(2026, 4, 17),
      onWeekChange,
      onUpdateTask: vi.fn(), onUpdateEvent: vi.fn(), onUpdateRoutine: vi.fn(),
      tasks: [], events: [], routines: [],
    }))

    act(() => result.current.notifyEdge('right'))
    act(() => { vi.advanceTimersByTime(300) })
    act(() => result.current.notifyEdge(null))
    act(() => { vi.advanceTimersByTime(300) })

    expect(onWeekChange).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})
```

- [ ] **Step 9.2: Run, verify the new tests fail (older tests still pass)**

```bash
npx vitest src/components/home/week/useWeekDragDrop --run
```

Expected: 3 new tests FAIL with `result.current.notifyEdge is not a function`.

- [ ] **Step 9.3: Extend `useWeekDragDrop`**

In `src/components/home/week/useWeekDragDrop.ts`, add to the result interface:

```typescript
interface UseWeekDragDropResult {
  dndHandlers: {
    onDragStart: (e: DragStartEvent) => void
    onDragEnd: (e: DragEndEvent) => void
    onDragCancel: () => void
  }
  activeDragId: string | null
  /** Call when the dragged pointer enters/leaves an edge zone. Null clears. */
  notifyEdge: (edge: 'left' | 'right' | null) => void
}
```

Inside the hook body, before the `return`, add:

```typescript
const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
const cooldownRef = useRef<boolean>(false)

const notifyEdge = useCallback((edge: 'left' | 'right' | null) => {
  if (edge === null) {
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current)
      advanceTimerRef.current = null
    }
    return
  }
  if (cooldownRef.current) return
  if (advanceTimerRef.current) return // already armed
  advanceTimerRef.current = setTimeout(() => {
    const direction = edge === 'right' ? 7 : -7
    const newStart = new Date(args.weekStart)
    newStart.setDate(newStart.getDate() + direction)
    args.onWeekChange(newStart)
    advanceTimerRef.current = null
    cooldownRef.current = true
    setTimeout(() => { cooldownRef.current = false }, 300)
  }, 500)
}, [args])
```

Update the return:

```typescript
return {
  dndHandlers: { onDragStart, onDragEnd, onDragCancel },
  activeDragId,
  notifyEdge,
}
```

Also add `useRef` to the React import at top of file:

```typescript
import { useCallback, useRef, useState } from 'react'
```

- [ ] **Step 9.4: Verify tests pass**

```bash
npx vitest src/components/home/week/useWeekDragDrop --run
```

Expected: 6/6 pass (3 original + 3 new).

- [ ] **Step 9.5: Commit**

```bash
git add src/components/home/week/useWeekDragDrop.ts src/components/home/week/useWeekDragDrop.test.ts
git commit -m "feat(week): cross-week auto-advance on edge hover (500ms threshold, 300ms cooldown)"
```

---

## Task 10: `WeekViewV2` orchestrator (assembly + edge detection wiring)

The desktop orchestrator. Composes everything from Tasks 3-9. Reads tasks/events/routines, splits scheduled vs unscheduled, wires the DndContext, attaches edge-hover detection via `onDragMove`.

**Files:**
- Create: `src/components/home/week/WeekViewV2.tsx`

(No separate test file for the orchestrator — its sub-components are individually tested. Integration is covered by manual smoke + the existing HomeView test once WeekViewV2 is mounted.)

- [ ] **Step 10.1: Implement**

Create `src/components/home/week/WeekViewV2.tsx`:

```typescript
import { useMemo, useState } from 'react'
import { DndContext, DragOverlay, type DragMoveEvent } from '@dnd-kit/core'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine, ActionableInstance } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'
import { useMealPlan } from '@/hooks/useMealPlan'
import { useRecipes } from '@/hooks/useRecipes'
import { useGroceryStatus } from '@/hooks/useGroceryStatus'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { sundayOfWeek } from '@/lib/weekHelpers'
import { taskToTimelineItem, eventToTimelineItem, routineToTimelineItem } from '@/types/timeline'
import { familyDinnerSummary, groceriesSummary, prepAheadSummary } from '@/lib/weekHighlights'
import { WeekSummaryRow } from './WeekSummaryRow'
import { UnscheduledChipStrip } from './UnscheduledChipStrip'
import { WeekGrid } from './WeekGrid'
import { WeekEventBlock } from './WeekEventBlock'
import { useWeekDragDrop } from './useWeekDragDrop'

const EDGE_PX = 40

interface WeekViewV2Props {
  tasks: Task[]
  events: CalendarEvent[]
  routines: Routine[]
  dateInstances: ActionableInstance[]
  weekStart: Date
  onWeekChange: (d: Date) => void
  selectedAssignee?: string | null
  onSelectItem: (id: string | null) => void
  onUpdateTask: (taskId: string, updates: Partial<Task>) => Promise<void> | void
  onUpdateEvent: (eventId: string, updates: Partial<CalendarEvent>) => Promise<void> | void
  onUpdateRoutine: (routineId: string, updates: Partial<Routine>) => Promise<void> | void
}

export function WeekViewV2(props: WeekViewV2Props) {
  const { tasks, events, routines, weekStart, onWeekChange, onSelectItem,
          onUpdateTask, onUpdateEvent, onUpdateRoutine } = props

  // Data for summary cards
  const { plan } = useMealPlan(sundayOfWeek(weekStart))
  const { recipes } = useRecipes()
  const { missingItems } = useGroceryStatus(plan, recipes)
  const { members } = useFamilyMembers()

  const familyDinner = useMemo(() => familyDinnerSummary(plan, members, weekStart), [plan, members, weekStart])
  const groceries = useMemo(() => groceriesSummary(missingItems), [missingItems])
  const prepAhead = useMemo(() => prepAheadSummary(plan, recipes, new Date()), [plan, recipes])

  // Drag-drop wiring
  const drag = useWeekDragDrop({
    weekStart, onWeekChange,
    onUpdateTask, onUpdateEvent, onUpdateRoutine,
    tasks, events, routines,
  })

  // Edge-hover detection via onDragMove
  const [edgeHover, setEdgeHover] = useState<'left' | 'right' | null>(null)
  const handleDragMove = (e: DragMoveEvent) => {
    if (!e.activatorEvent) return
    const rect = (e.activatorEvent.target as Element)?.closest('[data-week-bounds]')?.getBoundingClientRect()
    if (!rect) return
    const x = (e.activatorEvent as PointerEvent).clientX + (e.delta?.x ?? 0)
    if (x > rect.right - EDGE_PX) {
      if (edgeHover !== 'right') { setEdgeHover('right'); drag.notifyEdge('right') }
    } else if (x < rect.left + EDGE_PX) {
      if (edgeHover !== 'left') { setEdgeHover('left'); drag.notifyEdge('left') }
    } else if (edgeHover !== null) {
      setEdgeHover(null); drag.notifyEdge(null)
    }
  }

  // Split tasks: scheduled-with-time vs unscheduled (in-week)
  const weekEnd = useMemo(() => {
    const e = new Date(weekStart); e.setDate(e.getDate() + 7); return e
  }, [weekStart])

  const inWeek = (d: Date) => d >= weekStart && d < weekEnd

  const scheduledTasks = useMemo(() =>
    tasks.filter(t => t.scheduledFor && inWeek(t.scheduledFor) && !t.isAllDay),
    [tasks, weekStart])

  const unscheduledTasks = useMemo(() =>
    tasks.filter(t => t.scheduledFor && inWeek(t.scheduledFor) && t.isAllDay),
    [tasks, weekStart])

  const weekEvents = useMemo(() =>
    events.filter(e => inWeek(new Date(e.start_time ?? (e as { startTime?: string }).startTime ?? ''))),
    [events, weekStart])

  // Convert to TimelineItems for the grid
  const allBlocks = useMemo(() => {
    const tasksAsItems = scheduledTasks.map(taskToTimelineItem)
    const eventsAsItems = weekEvents.map(eventToTimelineItem)
    const routinesAsItems = routines.flatMap(r => {
      // Expand the routine into 7 instances for the displayed week (one per day).
      // Per spec, routines are render-only — visible but not draggable.
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart); d.setDate(d.getDate() + i)
        return routineToTimelineItem(r, d)
      })
    })
    return [...tasksAsItems, ...eventsAsItems, ...routinesAsItems]
  }, [scheduledTasks, weekEvents, routines, weekStart])

  return (
    <div data-week-bounds className="hidden lg:block">
      <WeekSummaryRow familyDinner={familyDinner} groceries={groceries} prepAhead={prepAhead} />

      <DndContext
        onDragStart={drag.dndHandlers.onDragStart}
        onDragEnd={drag.dndHandlers.onDragEnd}
        onDragCancel={drag.dndHandlers.onDragCancel}
        onDragMove={handleDragMove}
      >
        <UnscheduledChipStrip tasks={unscheduledTasks} />

        <WeekGrid weekStart={weekStart}>
          {allBlocks.map(item => (
            <WeekEventBlock
              key={item.id}
              item={item}
              weekStart={weekStart}
              onSelect={onSelectItem}
              onResizeCommit={(taskId, updates) => { void onUpdateTask(taskId, updates) }}
            />
          ))}
        </WeekGrid>

        <DragOverlay>{drag.activeDragId ? <div className="opacity-80">·</div> : null}</DragOverlay>
      </DndContext>
    </div>
  )
}
```

- [ ] **Step 10.2: Build to verify TypeScript happy**

```bash
npm run build 2>&1 | tail -3
```

Expected: build passes.

- [ ] **Step 10.3: Run all week-related tests**

```bash
npx vitest src/components/home/week src/lib/weekColorMap src/lib/weekHighlights --run 2>&1 | tail -6
```

Expected: all existing passes still green; no new failures.

- [ ] **Step 10.4: Commit**

```bash
git add src/components/home/week/WeekViewV2.tsx
git commit -m "feat(week): WeekViewV2 orchestrator (assembly + onDragMove edge detection)"
```

---

## Task 11: `WeekViewMobile` — mobile list variant

Mobile renders a vertical list. Summary cards stacked, "Unscheduled this week" as tap-rows, then day-grouped events. No drag, no resize. Tap → detail panel.

**Files:**
- Create: `src/components/home/week/WeekViewMobile.tsx`
- Create: `src/components/home/week/WeekViewMobile.test.tsx`

- [ ] **Step 11.1: Write failing tests**

Create `src/components/home/week/WeekViewMobile.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { WeekViewMobile } from './WeekViewMobile'

const baseProps = {
  tasks: [],
  events: [],
  routines: [],
  weekStart: new Date(2026, 4, 17),
  onSelectItem: vi.fn(),
}

describe('WeekViewMobile', () => {
  it('renders the 7 day headers (Sun..Sat) when no data', () => {
    render(<WeekViewMobile {...baseProps} />)
    expect(screen.getByText(/Sunday/i)).toBeInTheDocument()
    expect(screen.getByText(/Saturday/i)).toBeInTheDocument()
  })

  it('renders an unscheduled-tasks section when isAllDay tasks exist for the week', () => {
    const t = {
      id: 't1', title: 'Order shoes', completed: false,
      scheduledFor: new Date(2026, 4, 20), isAllDay: true,
    } as never
    render(<WeekViewMobile {...baseProps} tasks={[t]} />)
    expect(screen.getByText('Order shoes')).toBeInTheDocument()
    expect(screen.getByText(/unscheduled this week/i)).toBeInTheDocument()
  })

  it('does not render the unscheduled section when nothing is unscheduled', () => {
    render(<WeekViewMobile {...baseProps} />)
    expect(screen.queryByText(/unscheduled this week/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 11.2: Run, verify failure**

```bash
npx vitest src/components/home/week/WeekViewMobile --run
```

- [ ] **Step 11.3: Implement**

Create `src/components/home/week/WeekViewMobile.tsx`:

```typescript
import { useMemo } from 'react'
import type { Task } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Routine } from '@/types/actionable'

interface WeekViewMobileProps {
  tasks: Task[]
  events: CalendarEvent[]
  routines: Routine[]
  weekStart: Date
  onSelectItem: (id: string) => void
}

export function WeekViewMobile({ tasks, weekStart, onSelectItem }: WeekViewMobileProps) {
  const weekEnd = useMemo(() => {
    const e = new Date(weekStart); e.setDate(e.getDate() + 7); return e
  }, [weekStart])

  const inWeek = (d: Date) => d >= weekStart && d < weekEnd

  const unscheduled = useMemo(() =>
    tasks.filter(t => t.scheduledFor && inWeek(t.scheduledFor) && t.isAllDay),
    [tasks, weekStart])

  const tasksByDay = useMemo(() => {
    const buckets: Record<number, Task[]> = {}
    for (let i = 0; i < 7; i++) buckets[i] = []
    for (const t of tasks) {
      if (!t.scheduledFor || !inWeek(t.scheduledFor) || t.isAllDay) continue
      const dow = Math.round((new Date(t.scheduledFor).setHours(0,0,0,0) - weekStart.setHours(0,0,0,0)) / 86400000)
      if (dow >= 0 && dow <= 6) buckets[dow].push(t)
    }
    return buckets
  }, [tasks, weekStart])

  const dayName = (i: number) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i)
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
  }

  return (
    <div className="lg:hidden space-y-4">
      {unscheduled.length > 0 && (
        <section aria-label="Unscheduled this week">
          <h3 className="text-[11px] uppercase tracking-wide text-neutral-500 mb-2">Unscheduled this week</h3>
          <ul className="space-y-1">
            {unscheduled.map(t => (
              <li key={t.id}>
                <button
                  onClick={() => onSelectItem(t.id)}
                  className="w-full text-left px-3 py-2 rounded-lg bg-bg-elevated border border-neutral-200/70 text-[14px]"
                >
                  {t.title}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {Array.from({ length: 7 }, (_, i) => (
        <section key={i} aria-label={dayName(i)}>
          <h3 className="text-[13px] font-medium text-neutral-700 mb-1">{dayName(i)}</h3>
          {tasksByDay[i].length === 0 ? (
            <p className="text-[12px] text-neutral-400">No items.</p>
          ) : (
            <ul className="space-y-1">
              {tasksByDay[i].map(t => (
                <li key={t.id}>
                  <button
                    onClick={() => onSelectItem(t.id)}
                    className="w-full text-left px-3 py-2 rounded-lg bg-bg-elevated border border-neutral-200/70 text-[13px]"
                  >
                    {t.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  )
}
```

- [ ] **Step 11.4: Verify pass**

```bash
npx vitest src/components/home/week/WeekViewMobile --run
```

Expected: 3/3 pass.

- [ ] **Step 11.5: Commit**

```bash
git add src/components/home/week/WeekViewMobile.tsx src/components/home/week/WeekViewMobile.test.tsx
git commit -m "feat(week): WeekViewMobile — mobile list variant (no drag)"
```

---

## Task 12: Wire `WeekViewV2` / `WeekViewMobile` into `HomeView` (feature-flagged)

Replace the existing `<WeekView>` mount with a conditional render between the new components and the old one. Gate via a `localStorage` feature flag default-on for this cycle.

**Files:**
- Modify: `src/components/home/HomeView.tsx`

- [ ] **Step 12.1: Locate the existing WeekView mount**

```bash
grep -n "WeekView" src/components/home/HomeView.tsx
```

Expected: shows the import + the `currentView === 'week'` branch.

- [ ] **Step 12.2: Add imports + feature flag**

In `src/components/home/HomeView.tsx`, near the existing `WeekView` import, add:

```typescript
import { WeekViewV2 } from './week/WeekViewV2'
import { WeekViewMobile } from './week/WeekViewMobile'

const WEEK_V2_FLAG = 'symphony-week-v2'
function isWeekV2Enabled(): boolean {
  if (typeof window === 'undefined') return false
  // Default: on (feature flag exists for explicit off, not for ramp).
  return localStorage.getItem(WEEK_V2_FLAG) !== 'off'
}
```

- [ ] **Step 12.3: Swap the render branch**

Find the existing `if (currentView === 'week') return ...` block. Replace its body with:

```typescript
if (currentView === 'week') {
  const useV2 = isWeekV2Enabled()
  if (!useV2) {
    return (
      <WeekView
        tasks={filteredTasks}
        events={filteredEvents}
        routines={filteredRoutines}
        dateInstances={dateInstances}
        weekStart={weekStart}
        onWeekChange={setWeekStart}
        onSelectDay={handleSelectDay}
        selectedAssignee={selectedAssigneeForSchedule}
        eventNotesMap={ctx.eventNotesMap}
      />
    )
  }
  return (
    <>
      <WeekViewV2
        tasks={filteredTasks}
        events={filteredEvents}
        routines={filteredRoutines}
        dateInstances={dateInstances}
        weekStart={weekStart}
        onWeekChange={setWeekStart}
        selectedAssignee={selectedAssigneeForSchedule}
        onSelectItem={onSelectItem}
        onUpdateTask={ctx.onUpdateTask ?? (() => {})}
        onUpdateEvent={ctx.onUpdateEvent ?? (() => {})}
        onUpdateRoutine={ctx.onUpdateRoutine ?? (() => {})}
      />
      <WeekViewMobile
        tasks={filteredTasks}
        events={filteredEvents}
        routines={filteredRoutines}
        weekStart={weekStart}
        onSelectItem={onSelectItem}
      />
    </>
  )
}
```

- [ ] **Step 12.4: Build**

```bash
npm run build 2>&1 | tail -5
```

If any callbacks (e.g., `ctx.onUpdateEvent`, `ctx.onUpdateRoutine`) don't exist in the ScheduleActions context, replace the `??` fallbacks with the actual names used by the codebase. If a needed callback is genuinely missing, stub it with a no-op and add an inline TODO commenting that wiring the persistence end is a follow-up; the orchestrator's behavior is preserved.

- [ ] **Step 12.5: Run full test suite**

```bash
npm test -- --run 2>&1 | tail -6
```

Expected: baseline pre-existing failures only (3 TodayView + 1 NotesPage + 1 useSpaces).

- [ ] **Step 12.6: Smoke**

```bash
npm run dev
# Visit http://localhost:5173/today and click 'Week' on the D/W/M toggle
# Visit http://localhost:5173/today and click 'This Week' in the sidebar
# Drag a chip onto a slot → expect the toast + the chip to disappear
# Drag a block to a new slot → expect the position to change
# Drag the bottom edge of a block → expect the duration to grow
# Hold the dragged block near the right edge ~1 second → expect week to advance
```

To toggle the feature flag off (rollback in browser):
```javascript
localStorage.setItem('symphony-week-v2', 'off'); location.reload()
```

- [ ] **Step 12.7: Commit**

```bash
git add src/components/home/HomeView.tsx
git commit -m "feat(home): mount WeekViewV2 + WeekViewMobile (feature-flagged with off-switch)"
```

---

## Verification — full check before shipping

- [ ] **Step V.1: Full test suite**

```bash
npm test -- --run 2>&1 | tail -8
```

Expected: baseline pre-existing failures (4 + 1 error). Phase 4 adds ~50 new passing tests.

- [ ] **Step V.2: Lint**

```bash
npm run lint 2>&1 | grep -E "^✖"
```

Expected: baseline 8-9 errors. No new errors in `src/components/home/week/*` or `src/lib/weekColorMap.*` / `weekHighlights.*`.

- [ ] **Step V.3: Build**

```bash
npm run build 2>&1 | tail -3
```

Expected: passes.

- [ ] **Step V.4: Use `superpowers:finishing-a-development-branch` to land**

Standard finish: rebase onto `origin/main`, race-safe push from worktree, deploy via `vercel --prod`, verify, clean up.

---

## Self-review checklist

- [x] **Spec coverage:** Every spec section maps to a task.
  - weekColorMap → Task 1
  - weekHighlights → Task 2
  - WeekSummaryRow → Task 3
  - UnscheduledChipStrip → Task 4
  - WeekGrid → Task 5
  - WeekEventBlock → Task 6
  - useWeekDragDrop (drag-drop) → Task 7
  - useBlockResize → Task 8
  - useWeekDragDrop (cross-week) → Task 9
  - WeekViewV2 → Task 10
  - WeekViewMobile → Task 11
  - HomeView wiring → Task 12

- [x] **Placeholder scan:** All steps have concrete code or commands. The two inline TODOs in Task 12 are explicit scope-handoffs (callback names that depend on the codebase's current shape — implementer fills with real callbacks during integration). Not "TODO: implement later" placeholders.

- [x] **Type consistency:** `BlockColor` from Task 1 used in Task 6. `FamilyDinnerSummary`/`GroceriesSummary`/`PrepAheadSummary` from Task 2 used in Task 3 and Task 10. `notifyEdge` signature in Task 9 matches the call site in Task 10. `onResizeCommit` prop added in Task 8 matches usage in Task 10.

---

## Why this scope, not more

Deliberate scope-cuts (per spec):
- All-day drop slots: the all-day row renders but drops on it are deferred (Task 7 ignores `kind: 'allDay'`). Phase 4 closes when timed-slot drops work; all-day reschedule needs its own design.
- Touch / mobile drag: explicit out-of-scope. Mobile is list-only.
- Conflict resolution: visual overlap only. No auto-shift, no prompts.
- Multi-block drag: one at a time.
- Drag-to-create on empty slots: not in scope.
- Hour-range expansion: blocks outside 8–9 PM are clipped (with an indicator); user can't expand the visible range without a future settings phase.
