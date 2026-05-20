# Meals Phase 3 — Editorial Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the mockup's editorial meal-page atmosphere — hero meal card, specific pantry signals, family-calendar context — to the live `/meals` surface, splitting "this week's plan" from "today's meal" cleanly.

**Architecture:** The existing `MealPlanRitualPage` (week document) stays as the Plan tab; the Today tab gets a new hero `TodayMealCard` component. Both pages share a new right-rail (`MealsRail`) hosting `MealHighlights`, `PantryShelfRail`, and `NextUpRail` panels backed by the data hooks that already exist (`useMealPlan`, `useGroceryStatus`, `useGoogleCalendar`). The mockup's generic "AI Insight" card is dropped — same critique Scott made on Today's killed AI banner applies.

**Tech Stack:** React 19 + TS strict, Tailwind v4 (Nordic Journal), existing meal-planner hooks (`useMealPlan`, `useRecipes`, `useGroceryStatus`, `useFamilyMembers`), existing routing (`/meals/today`, `/meals/plan`), Vitest + RTL.

---

## Surface split, codified

The mockup conflates two surfaces. We split them:

| Surface | Url | Job | Hero |
|---|---|---|---|
| **Plan tab** | `/meals/plan` | Edit the week as a single document — drag/replace/clear, run grocery review, manage habits | Week-level (existing DayCards) |
| **Today tab** | `/meals/today` | "Here's tonight's meal" — one-day hero card with method, kids line, metadata triplet, avatars | Single-day (new `TodayMealCard`) |

The right-rail is shared by both surfaces. The mockup's "Plan / Today" tabs already exist (`src/components/meals/MealsTabs.tsx`); we leave them.

## Mockup decisions, codified

Carrying forward from brainstorming:

| Mockup element | Decision |
|---|---|
| Hero meal card (serif title, method callout, kids line, metadata, avatars) | **Build** as `TodayMealCard`, mount on Today tab |
| Right rail: MEAL HIGHLIGHTS / PANTRY & SHELF / NEXT UP | **Build** all three; mount on both meals tabs |
| Right rail: AI INSIGHT (generic copy) | **Drop.** Same reason we killed the Today banner — generic AI commentary is noise. Revisit when we can be specific. |
| "Generate plan" primary action when plan is drafted | **Fix.** When drafted: primary action becomes "Cook this" / "View recipe"; "Regenerate" demotes to secondary. |
| "No parameter" label in dropdown trigger | **Fix.** Trigger text reads "Standard week" when no parameter is set, not the literal "No parameter". |
| "Restart tour" in header | **Move.** Out of the persistent header into a tucked overflow menu; the tour itself stays. |
| "Shift + Enter for new line" floater (no input nearby) | **Drop.** Stray hint with no anchor. |
| "Week of May 17" kicker | **Keep.** Already present, well-placed. |
| "PLAN DRAFTED" status badge | **Keep.** Already wired via `RitualStatus`. |

---

## File Structure

**Created:**
- `src/components/meals/today/TodayMealCard.tsx` — hero card (serif title, sides, method callout, kids line, metadata triplet, avatars, action row)
- `src/components/meals/today/TodayMealCard.test.tsx`
- `src/components/meals/rail/MealsRail.tsx` — container component, stacks the panels
- `src/components/meals/rail/MealHighlights.tsx` — top digest panel (dinners planned, new recipes, veggie count)
- `src/components/meals/rail/MealHighlights.test.tsx`
- `src/components/meals/rail/PantryShelfRail.tsx` — missing-ingredient list panel
- `src/components/meals/rail/PantryShelfRail.test.tsx`
- `src/components/meals/rail/NextUpRail.tsx` — upcoming family-calendar context panel
- `src/components/meals/rail/NextUpRail.test.tsx`
- `src/lib/mealHighlights.ts` — pure helper: `summarizeWeek({plan, recipes}) → { dinnersPlanned, prepRange, balanced, newRecipesThisWeek, vegServingsApprox }`
- `src/lib/mealHighlights.test.ts`

**Modified:**
- `src/components/meals/today/TodayPage.tsx` — replace existing list-y layout with the new `TodayMealCard` + mount `MealsRail` on the right
- `src/components/meals/plan/MealPlanRitualPage.tsx` — mount `MealsRail` on the right; move "Restart tour" out of `RitualStatus` header into an overflow menu; fix Generate-plan demotion (Task 11)
- `src/components/meals/plan/ParameterDropdown.tsx` — trigger text "Standard week" when no parameter set (was implicit empty)
- `src/components/meals/plan/RitualStatus.tsx` — remove the `onRestartTour` prop from this component (gets relocated)

**Untouched (named here so engineers don't get confused):**
- `src/components/meals/plan/DayCard.tsx` — week-document day rendering. Stays as the Plan-tab visual unit. The Today tab uses a different component (`TodayMealCard`) by design.
- `src/components/meals/MealsTabs.tsx` — already correct; tab keys are `plan / today / recipes / habits`.
- `src/hooks/useMealPlan.ts`, `useGroceryStatus.ts`, `useRecipes.ts`, `useFamilyMembers.ts` — all already provide the data we need.

---

## Pre-flight: create the worktree

- [ ] **Step 0: Isolated worktree off `main`**

```bash
cd /Users/scottkaufman/Developer/Developer/symphonyOS
git fetch origin main
git worktree add .worktrees/meals-phase3 -b feat/meals-phase3 origin/main
cp .env .worktrees/meals-phase3/.env
cd .worktrees/meals-phase3
npm install
```

All subsequent tasks run inside `.worktrees/meals-phase3`.

---

## Phase 3a — Today tab hero card

The biggest visible change. New component, new layout for `TodayPage`.

### Task 1: `TodayMealCard` component (visual shell)

**Files:**
- Create: `src/components/meals/today/TodayMealCard.tsx`
- Create: `src/components/meals/today/TodayMealCard.test.tsx`

- [ ] **Step 1.1: Write the failing test**

Create `src/components/meals/today/TodayMealCard.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { TodayMealCard } from './TodayMealCard'

describe('TodayMealCard', () => {
  const baseProps = {
    dayLabel: 'Monday',
    title: 'Dutch Oven Barley Risotto',
    sides: 'Asparagus + Parmesan',
    methodLabel: 'HANDS-OFF OVEN METHOD',
    methodBody: 'Toast barley on stovetop → add hot stock → cover and bake.',
    kidsLine: 'Plain barley + parmesan, asparagus on the side.',
    servesCount: 4,
    prepLabel: 'Medium prep' as const,
    nutritionLabel: 'Nutritious & satisfying',
    diners: [
      { id: 'a', initials: 'SK', color: 'blue' as const },
      { id: 'b', initials: 'IR', color: 'purple' as const },
    ],
    state: 'drafted' as const,
    onPrimaryAction: vi.fn(),
    onRegenerate: vi.fn(),
    onViewRecipe: vi.fn(),
  }

  it('renders title, sides, day label, method body, kids line, metadata triplet', () => {
    render(<TodayMealCard {...baseProps} />)
    expect(screen.getByText('Monday')).toBeInTheDocument()
    expect(screen.getByText('Dutch Oven Barley Risotto')).toBeInTheDocument()
    expect(screen.getByText(/Asparagus \+ Parmesan/)).toBeInTheDocument()
    expect(screen.getByText('HANDS-OFF OVEN METHOD')).toBeInTheDocument()
    expect(screen.getByText(/Toast barley on stovetop/)).toBeInTheDocument()
    expect(screen.getByText(/Plain barley \+ parmesan/)).toBeInTheDocument()
    expect(screen.getByText(/Serves 4/i)).toBeInTheDocument()
    expect(screen.getByText(/Medium prep/i)).toBeInTheDocument()
    expect(screen.getByText(/Nutritious & satisfying/i)).toBeInTheDocument()
  })

  it('renders one avatar per diner using initials', () => {
    render(<TodayMealCard {...baseProps} />)
    expect(screen.getByText('SK')).toBeInTheDocument()
    expect(screen.getByText('IR')).toBeInTheDocument()
  })

  it('primary action is "View recipe" when state is "drafted"', () => {
    render(<TodayMealCard {...baseProps} />)
    expect(screen.getByRole('button', { name: /view recipe/i })).toBeInTheDocument()
    // Regenerate is still present but secondary
    expect(screen.getByRole('button', { name: /regenerate/i })).toBeInTheDocument()
  })

  it('primary action is "Generate plan" when state is "empty"', () => {
    render(<TodayMealCard {...baseProps} state="empty" />)
    expect(screen.getByRole('button', { name: /generate plan/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /view recipe/i })).not.toBeInTheDocument()
  })

  it('calls onViewRecipe when View recipe is clicked', async () => {
    const onViewRecipe = vi.fn()
    const { user } = render(<TodayMealCard {...baseProps} onViewRecipe={onViewRecipe} />)
    await user.click(screen.getByRole('button', { name: /view recipe/i }))
    expect(onViewRecipe).toHaveBeenCalledTimes(1)
  })

  it('calls onRegenerate when Regenerate is clicked', async () => {
    const onRegenerate = vi.fn()
    const { user } = render(<TodayMealCard {...baseProps} onRegenerate={onRegenerate} />)
    await user.click(screen.getByRole('button', { name: /regenerate/i }))
    expect(onRegenerate).toHaveBeenCalledTimes(1)
  })

  it('does NOT render "Shift + Enter for new line" hint (the floater is dropped)', () => {
    render(<TodayMealCard {...baseProps} />)
    expect(screen.queryByText(/shift \+ enter/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 1.2: Run test, verify it fails**

```bash
npx vitest src/components/meals/today/TodayMealCard.test.tsx --run
```

Expected: FAIL (`TodayMealCard` module missing).

- [ ] **Step 1.3: Implement the component**

Create `src/components/meals/today/TodayMealCard.tsx`:

```typescript
import { Sun, Utensils, Flame, Leaf, Users } from 'lucide-react'

export type MealCardState = 'empty' | 'drafted' | 'cooked'
export type MealPrepLabel = 'Quick prep' | 'Medium prep' | 'Long prep'

export interface MealCardAvatar {
  id: string
  initials: string
  color: 'blue' | 'purple' | 'green' | 'orange' | 'pink' | 'teal'
}

interface TodayMealCardProps {
  dayLabel: string           // "Monday"
  title: string              // "Dutch Oven Barley Risotto"
  sides?: string             // "Asparagus + Parmesan"
  methodLabel?: string       // "HANDS-OFF OVEN METHOD"
  methodBody?: string        // free text — instructions/highlights
  kidsLine?: string          // "Plain barley + parmesan, asparagus on the side."
  servesCount?: number       // 4
  prepLabel?: MealPrepLabel
  nutritionLabel?: string    // "Nutritious & satisfying"
  diners?: MealCardAvatar[]
  state: MealCardState
  /** Click handler for the primary CTA (state-dependent). */
  onPrimaryAction: () => void
  /** Demoted CTA: regenerate this meal (visible when state !== 'empty'). */
  onRegenerate: () => void
  /** View the underlying recipe (visible when state !== 'empty'). */
  onViewRecipe: () => void
}

/**
 * Hero card for the Today meals tab. One meal at a time, presented as an
 * editorial unit — serif title, method-named callout, kids adaptation, the
 * "Serves / Prep / Nutrition" metadata triplet, and an avatar stack of who's
 * eating. CTA stack adapts to plan state: 'empty' surfaces "Generate plan"
 * as primary; 'drafted' and 'cooked' surface "View recipe" instead.
 */
export function TodayMealCard({
  dayLabel,
  title,
  sides,
  methodLabel,
  methodBody,
  kidsLine,
  servesCount,
  prepLabel,
  nutritionLabel,
  diners,
  state,
  onPrimaryAction,
  onRegenerate,
  onViewRecipe,
}: TodayMealCardProps) {
  const primaryIsGenerate = state === 'empty'

  return (
    <section
      aria-label="Today's meal"
      className="rounded-2xl border border-neutral-200/70 bg-bg-elevated p-6 shadow-sm"
    >
      {/* Day label */}
      <div className="flex items-start justify-between gap-4 mb-2">
        <p className="flex items-center gap-1.5 text-[13px] font-medium text-neutral-600">
          <Sun className="w-4 h-4 text-amber-500" aria-hidden />
          {dayLabel}
        </p>
        {diners && diners.length > 0 && (
          <div className="flex -space-x-1.5" aria-label="Diners">
            {diners.slice(0, 5).map((d) => (
              <span
                key={d.id}
                className="inline-flex items-center justify-center w-7 h-7 rounded-full ring-2 ring-bg-elevated text-[10px] font-medium"
                style={{
                  backgroundColor: avatarBg(d.color),
                  color: avatarFg(d.color),
                }}
                aria-hidden
              >
                {d.initials}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Title + sides */}
      <h2 className="font-display text-2xl text-neutral-800 leading-tight">{title}</h2>
      {sides && (
        <p className="font-display italic text-lg text-primary-600 mt-1">
          with {sides}
        </p>
      )}

      {/* Method body */}
      {methodLabel && (
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-wider text-primary-700">
          {methodLabel}
        </p>
      )}
      {methodBody && (
        <p className="mt-2 text-[14px] text-neutral-700 leading-relaxed whitespace-pre-wrap">
          {methodBody}
        </p>
      )}

      {/* Kids line */}
      {kidsLine && (
        <div className="mt-4 flex items-start gap-2 text-[13px]">
          <Users className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" aria-hidden />
          <p className="text-neutral-700">
            <span className="font-medium text-neutral-800">Kids:</span> {kidsLine}
          </p>
        </div>
      )}

      {/* Metadata triplet */}
      {(servesCount != null || prepLabel || nutritionLabel) && (
        <div className="mt-5 flex items-center gap-4 text-[12px] text-neutral-500 flex-wrap">
          {servesCount != null && (
            <span className="flex items-center gap-1.5">
              <Utensils className="w-3.5 h-3.5" aria-hidden />
              Serves {servesCount}
            </span>
          )}
          {prepLabel && (
            <span className="flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5" aria-hidden />
              {prepLabel}
            </span>
          )}
          {nutritionLabel && (
            <span className="flex items-center gap-1.5">
              <Leaf className="w-3.5 h-3.5" aria-hidden />
              {nutritionLabel}
            </span>
          )}
        </div>
      )}

      {/* Action row */}
      <div className="mt-6 flex items-center gap-2">
        {primaryIsGenerate ? (
          <button
            type="button"
            onClick={onPrimaryAction}
            className="px-4 py-2 rounded-lg text-[13px] font-medium bg-primary-500 text-white hover:bg-primary-600 transition-colors"
          >
            Generate plan
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onViewRecipe}
              className="px-4 py-2 rounded-lg text-[13px] font-medium bg-primary-500 text-white hover:bg-primary-600 transition-colors"
            >
              View recipe
            </button>
            <button
              type="button"
              onClick={onRegenerate}
              className="px-4 py-2 rounded-lg text-[13px] font-medium text-neutral-600 hover:bg-neutral-100 transition-colors"
            >
              Regenerate
            </button>
          </>
        )}
      </div>
    </section>
  )
}

function avatarBg(color: MealCardAvatar['color']): string {
  switch (color) {
    case 'blue':   return 'color-mix(in srgb, hsl(217 91% 60%) 18%, white)'
    case 'purple': return 'color-mix(in srgb, hsl(271 81% 56%) 18%, white)'
    case 'green':  return 'color-mix(in srgb, hsl(142 71% 45%) 18%, white)'
    case 'orange': return 'color-mix(in srgb, hsl(25 95% 53%) 18%, white)'
    case 'pink':   return 'color-mix(in srgb, hsl(330 81% 60%) 18%, white)'
    case 'teal':   return 'color-mix(in srgb, hsl(168 76% 42%) 18%, white)'
  }
}
function avatarFg(color: MealCardAvatar['color']): string {
  switch (color) {
    case 'blue':   return 'hsl(217 91% 40%)'
    case 'purple': return 'hsl(271 81% 36%)'
    case 'green':  return 'hsl(142 71% 30%)'
    case 'orange': return 'hsl(25 95% 38%)'
    case 'pink':   return 'hsl(330 81% 40%)'
    case 'teal':   return 'hsl(168 76% 28%)'
  }
}
```

- [ ] **Step 1.4: Run tests, verify all pass**

```bash
npx vitest src/components/meals/today/TodayMealCard.test.tsx --run
```

Expected: 7 tests pass.

- [ ] **Step 1.5: Commit**

```bash
git add src/components/meals/today/TodayMealCard.tsx src/components/meals/today/TodayMealCard.test.tsx
git commit -m "feat(meals): TodayMealCard hero component (Phase 3a)"
```

### Task 2: Wire `TodayMealCard` into `TodayPage`

**Files:**
- Modify: `src/components/meals/today/TodayPage.tsx`

- [ ] **Step 2.1: Read the current `TodayPage`**

```bash
sed -n '1,40p' src/components/meals/today/TodayPage.tsx
```

The file pulls `useMealPlan` and renders today's meals via `MealStateRow`. We keep all existing data wiring; we only swap the dinner-row presentation for `TodayMealCard`.

- [ ] **Step 2.2: Compute today's dinner entry + map to TodayMealCard props**

Add to `TodayPage.tsx`, after the existing data hooks (search for the existing `const today = ...` block and append below it):

```typescript
import { TodayMealCard } from './TodayMealCard'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'

// ... inside the component, after existing hooks:
const { members: familyMembers } = useFamilyMembers()

const todayDinner = useMemo(() => {
  if (!plan) return null
  const dow = new Date().getDay() // 0=Sun..6=Sat
  return plan.entries.find(
    (e) => e.dayOfWeek === dow && (e.slot === 'dinner' || e.slot === 'kid_alternate'),
  ) ?? null
}, [plan])

const todayRecipe = useMemo(() => {
  if (!todayDinner?.recipeId) return null
  return recipes.find((r) => r.id === todayDinner.recipeId) ?? null
}, [todayDinner, recipes])

const cardState: 'empty' | 'drafted' | 'cooked' = todayDinner ? 'drafted' : 'empty'

const cardDiners = useMemo(() =>
  familyMembers
    .filter((m) => m.member_type === 'core')
    .slice(0, 5)
    .map((m) => ({
      id: m.id,
      initials: m.initials,
      color: (m.color as 'blue' | 'purple' | 'green' | 'orange' | 'pink' | 'teal') ?? 'teal',
    })),
  [familyMembers],
)

const prepLabel = (() => {
  const mins = todayRecipe?.prepMinutes ?? null
  if (mins == null) return undefined
  if (mins <= 20) return 'Quick prep' as const
  if (mins <= 45) return 'Medium prep' as const
  return 'Long prep' as const
})()
```

- [ ] **Step 2.3: Render the card**

Replace the current dinner-row block in `TodayPage` with:

```typescript
<TodayMealCard
  dayLabel={new Date().toLocaleDateString('en-US', { weekday: 'long' })}
  title={todayRecipe?.title ?? todayDinner?.adHocTitle ?? 'No meal planned'}
  sides={undefined /* MVP: no separate sides field; future iteration */}
  methodLabel={undefined /* MVP: not derived yet — Phase 3a stops here */}
  methodBody={todayRecipe?.instructions?.[0] ?? undefined}
  kidsLine={undefined /* MVP: no kids-line in data model yet */}
  servesCount={cardDiners.length > 0 ? cardDiners.length : undefined}
  prepLabel={prepLabel}
  nutritionLabel={undefined}
  diners={cardDiners}
  state={cardState}
  onPrimaryAction={() => navigate('/meals/plan')}
  onRegenerate={() => navigate('/meals/plan')}
  onViewRecipe={() => {
    if (todayRecipe?.sourceUrl) window.open(todayRecipe.sourceUrl, '_blank')
  }}
/>
```

**Scope-cut explanation:** `methodLabel`, `kidsLine`, `nutritionLabel` are not in the meal-plan data model. Showing them requires schema additions (or LLM-derived inference) outside this phase. The card renders fine without them — the props are all optional.

- [ ] **Step 2.4: Verify build + smoke**

```bash
npm run build 2>&1 | tail -3
npm run dev
# Visit http://localhost:5173/meals/today
# Expected: hero card replaces the old row layout
```

- [ ] **Step 2.5: Commit**

```bash
git add src/components/meals/today/TodayPage.tsx
git commit -m "feat(meals/today): mount TodayMealCard with live meal-plan data"
```

---

## Phase 3b — Right rail panels

Three panels stacked in a `MealsRail` container. Each ships independently.

### Task 3: `mealHighlights` helper (pure)

**Files:**
- Create: `src/lib/mealHighlights.ts`
- Create: `src/lib/mealHighlights.test.ts`

- [ ] **Step 3.1: Write the failing test**

Create `src/lib/mealHighlights.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import type { MealPlan, Recipe } from '@/types/meal-planner'
import { summarizeWeek } from './mealHighlights'

function mkRecipe(id: string, prep: number | null = 30, createdAt = new Date(2026, 0, 1)): Recipe {
  return {
    id,
    title: `r-${id}`,
    sourceUrl: null,
    imageUrl: null,
    prepMinutes: prep,
    ingredients: [],
    instructions: [],
    createdAt,
  } as Recipe
}

describe('summarizeWeek', () => {
  it('returns zero dinners when plan is null', () => {
    const result = summarizeWeek({ plan: null, recipes: [], weekStart: new Date() })
    expect(result.dinnersPlanned).toBe(0)
  })

  it('counts unique dinner entries per day-of-week', () => {
    const plan: MealPlan = {
      id: 'p1',
      weekStartIso: '2026-05-17',
      parameter: null,
      entries: [
        { id: 'e1', dayOfWeek: 0, slot: 'dinner', recipeId: 'r1', adHocTitle: null, familyMemberId: null },
        { id: 'e2', dayOfWeek: 1, slot: 'dinner', recipeId: 'r2', adHocTitle: null, familyMemberId: null },
        { id: 'e3', dayOfWeek: 2, slot: 'lunch', recipeId: 'r3', adHocTitle: null, familyMemberId: null },
      ],
    } as MealPlan
    const result = summarizeWeek({ plan, recipes: [], weekStart: new Date() })
    expect(result.dinnersPlanned).toBe(2)
  })

  it('reports prep range as e.g. "30–45 min" when recipes provide minutes', () => {
    const plan: MealPlan = {
      id: 'p1',
      weekStartIso: '2026-05-17',
      parameter: null,
      entries: [
        { id: 'e1', dayOfWeek: 0, slot: 'dinner', recipeId: 'r1', adHocTitle: null, familyMemberId: null },
        { id: 'e2', dayOfWeek: 1, slot: 'dinner', recipeId: 'r2', adHocTitle: null, familyMemberId: null },
      ],
    } as MealPlan
    const result = summarizeWeek({
      plan,
      recipes: [mkRecipe('r1', 30), mkRecipe('r2', 45)],
      weekStart: new Date(),
    })
    expect(result.prepRange).toBe('30–45 min')
  })

  it('returns null prep range when no recipe has prepMinutes', () => {
    const plan: MealPlan = {
      id: 'p1',
      weekStartIso: '2026-05-17',
      parameter: null,
      entries: [
        { id: 'e1', dayOfWeek: 0, slot: 'dinner', recipeId: 'r1', adHocTitle: null, familyMemberId: null },
      ],
    } as MealPlan
    const result = summarizeWeek({
      plan,
      recipes: [mkRecipe('r1', null)],
      weekStart: new Date(),
    })
    expect(result.prepRange).toBeNull()
  })

  it('counts recipes added within the current week as new', () => {
    const weekStart = new Date(2026, 4, 17) // May 17
    const justBefore = new Date(2026, 4, 16)
    const insideWeek = new Date(2026, 4, 19)
    const plan: MealPlan = {
      id: 'p1',
      weekStartIso: '2026-05-17',
      parameter: null,
      entries: [
        { id: 'e1', dayOfWeek: 0, slot: 'dinner', recipeId: 'r-old', adHocTitle: null, familyMemberId: null },
        { id: 'e2', dayOfWeek: 1, slot: 'dinner', recipeId: 'r-new', adHocTitle: null, familyMemberId: null },
      ],
    } as MealPlan
    const result = summarizeWeek({
      plan,
      recipes: [
        mkRecipe('r-old', 30, justBefore),
        mkRecipe('r-new', 30, insideWeek),
      ],
      weekStart,
    })
    expect(result.newRecipesThisWeek).toBe(1)
  })
})
```

- [ ] **Step 3.2: Run test, verify it fails**

```bash
npx vitest src/lib/mealHighlights.test.ts --run
```

Expected: FAIL (module missing).

- [ ] **Step 3.3: Implement**

Create `src/lib/mealHighlights.ts`:

```typescript
import type { MealPlan, Recipe } from '@/types/meal-planner'

export interface WeekSummary {
  dinnersPlanned: number
  /** e.g. "30–45 min", or null when no dinner recipe has prepMinutes set. */
  prepRange: string | null
  /** Recipes whose createdAt falls within the week-start..week-end span. */
  newRecipesThisWeek: number
}

/**
 * Aggregates a week's meal-plan + recipes into the summary numbers shown on
 * the MEAL HIGHLIGHTS panel. Pure — no React, no fetches.
 */
export function summarizeWeek(args: {
  plan: MealPlan | null
  recipes: Recipe[]
  weekStart: Date
}): WeekSummary {
  const { plan, recipes, weekStart } = args
  if (!plan) {
    return { dinnersPlanned: 0, prepRange: null, newRecipesThisWeek: 0 }
  }

  const dinnerEntries = plan.entries.filter((e) => e.slot === 'dinner')
  const dinnerDows = new Set(dinnerEntries.map((e) => e.dayOfWeek))
  const dinnersPlanned = dinnerDows.size

  const dinnerPreps: number[] = []
  for (const e of dinnerEntries) {
    if (!e.recipeId) continue
    const r = recipes.find((x) => x.id === e.recipeId)
    if (r?.prepMinutes != null) dinnerPreps.push(r.prepMinutes)
  }
  const prepRange = dinnerPreps.length === 0
    ? null
    : `${Math.min(...dinnerPreps)}–${Math.max(...dinnerPreps)} min`

  const weekStartMs = weekStart.getTime()
  const weekEndMs = weekStartMs + 7 * 24 * 60 * 60 * 1000
  const newRecipesThisWeek = recipes.filter((r) => {
    const t = r.createdAt instanceof Date ? r.createdAt.getTime() : new Date(r.createdAt).getTime()
    return t >= weekStartMs && t < weekEndMs
  }).length

  return { dinnersPlanned, prepRange, newRecipesThisWeek }
}
```

- [ ] **Step 3.4: Run tests, verify pass**

```bash
npx vitest src/lib/mealHighlights.test.ts --run
```

Expected: 5 tests pass.

- [ ] **Step 3.5: Commit**

```bash
git add src/lib/mealHighlights.ts src/lib/mealHighlights.test.ts
git commit -m "feat(meals): summarizeWeek helper (dinners, prep range, new recipes)"
```

### Task 4: `MealHighlights` panel

**Files:**
- Create: `src/components/meals/rail/MealHighlights.tsx`
- Create: `src/components/meals/rail/MealHighlights.test.tsx`

- [ ] **Step 4.1: Write the failing test**

Create `src/components/meals/rail/MealHighlights.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { MealHighlights } from './MealHighlights'

describe('MealHighlights', () => {
  it('renders dinners-planned with prep range', () => {
    render(
      <MealHighlights
        summary={{ dinnersPlanned: 5, prepRange: '30–45 min', newRecipesThisWeek: 2 }}
      />,
    )
    expect(screen.getByText(/5 dinners planned/i)).toBeInTheDocument()
    expect(screen.getByText(/30–45 min/)).toBeInTheDocument()
  })

  it('uses singular wording for one dinner', () => {
    render(
      <MealHighlights
        summary={{ dinnersPlanned: 1, prepRange: null, newRecipesThisWeek: 0 }}
      />,
    )
    expect(screen.getByText(/1 dinner planned/i)).toBeInTheDocument()
  })

  it('shows new-recipes line when > 0', () => {
    render(
      <MealHighlights
        summary={{ dinnersPlanned: 1, prepRange: null, newRecipesThisWeek: 2 }}
      />,
    )
    expect(screen.getByText(/2 new recipes/i)).toBeInTheDocument()
  })

  it('omits new-recipes line when 0', () => {
    render(
      <MealHighlights
        summary={{ dinnersPlanned: 1, prepRange: null, newRecipesThisWeek: 0 }}
      />,
    )
    expect(screen.queryByText(/new recipes/i)).not.toBeInTheDocument()
  })

  it('renders empty state when no dinners planned', () => {
    render(
      <MealHighlights
        summary={{ dinnersPlanned: 0, prepRange: null, newRecipesThisWeek: 0 }}
      />,
    )
    expect(screen.getByText(/no dinners planned yet/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 4.2: Run test, verify it fails**

```bash
npx vitest src/components/meals/rail/MealHighlights.test.tsx --run
```

Expected: FAIL.

- [ ] **Step 4.3: Implement**

Create `src/components/meals/rail/MealHighlights.tsx`:

```typescript
import type { WeekSummary } from '@/lib/mealHighlights'
import { Utensils, Sparkles } from 'lucide-react'

interface MealHighlightsProps {
  summary: WeekSummary
}

/**
 * Right-rail "Meal highlights" panel. Aggregates the week's dinner plan into
 * a digest: count of dinners, prep range, and recipes added this week.
 */
export function MealHighlights({ summary }: MealHighlightsProps) {
  const { dinnersPlanned, prepRange, newRecipesThisWeek } = summary
  const isEmpty = dinnersPlanned === 0

  return (
    <section
      aria-labelledby="rail-meal-highlights"
      className="card px-5 py-4 bg-bg-elevated border border-neutral-200/60"
    >
      <h2
        id="rail-meal-highlights"
        className="text-[11px] font-medium uppercase tracking-wide text-neutral-400 mb-3"
      >
        Meal highlights
      </h2>

      {isEmpty ? (
        <p className="flex items-center gap-2 text-[13px] text-neutral-500">
          <Utensils className="w-4 h-4 text-neutral-300 shrink-0" aria-hidden />
          <span>No dinners planned yet.</span>
        </p>
      ) : (
        <ul className="space-y-2">
          <li className="flex items-center gap-2 text-[13px] text-neutral-700">
            <Utensils className="w-4 h-4 text-primary-500 shrink-0" aria-hidden />
            <span>
              {dinnersPlanned} {dinnersPlanned === 1 ? 'dinner' : 'dinners'} planned
              {prepRange && <span className="text-neutral-500"> · {prepRange}</span>}
            </span>
          </li>
          {newRecipesThisWeek > 0 && (
            <li className="flex items-center gap-2 text-[13px] text-neutral-700">
              <Sparkles className="w-4 h-4 text-amber-500 shrink-0" aria-hidden />
              <span>
                {newRecipesThisWeek} new {newRecipesThisWeek === 1 ? 'recipe' : 'recipes'} this week
              </span>
            </li>
          )}
        </ul>
      )}
    </section>
  )
}
```

- [ ] **Step 4.4: Run tests, verify pass**

```bash
npx vitest src/components/meals/rail/MealHighlights.test.tsx --run
```

Expected: 5 tests pass.

- [ ] **Step 4.5: Commit**

```bash
git add src/components/meals/rail/MealHighlights.tsx src/components/meals/rail/MealHighlights.test.tsx
git commit -m "feat(meals/rail): MealHighlights panel — dinners + prep range + new recipes"
```

### Task 5: `PantryShelfRail` panel

**Files:**
- Create: `src/components/meals/rail/PantryShelfRail.tsx`
- Create: `src/components/meals/rail/PantryShelfRail.test.tsx`

- [ ] **Step 5.1: Write the failing test**

Create `src/components/meals/rail/PantryShelfRail.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { PantryShelfRail } from './PantryShelfRail'

describe('PantryShelfRail', () => {
  it('renders the count and first few missing item names', () => {
    render(
      <PantryShelfRail
        missingItems={[
          { text: 'Snap peas', category: 'Produce', fromRecipeIds: [] },
          { text: 'Brown rice', category: 'Pantry', fromRecipeIds: [] },
        ]}
        onReview={vi.fn()}
      />,
    )
    expect(screen.getByText(/2 ingredients missing/i)).toBeInTheDocument()
    expect(screen.getByText('Snap peas')).toBeInTheDocument()
    expect(screen.getByText('Brown rice')).toBeInTheDocument()
  })

  it('caps the shown items at 4 and surfaces a "+N more" hint', () => {
    render(
      <PantryShelfRail
        missingItems={[
          { text: 'Item 1', category: 'Pantry', fromRecipeIds: [] },
          { text: 'Item 2', category: 'Pantry', fromRecipeIds: [] },
          { text: 'Item 3', category: 'Pantry', fromRecipeIds: [] },
          { text: 'Item 4', category: 'Pantry', fromRecipeIds: [] },
          { text: 'Item 5', category: 'Pantry', fromRecipeIds: [] },
          { text: 'Item 6', category: 'Pantry', fromRecipeIds: [] },
        ]}
        onReview={vi.fn()}
      />,
    )
    expect(screen.getByText('Item 1')).toBeInTheDocument()
    expect(screen.getByText('Item 4')).toBeInTheDocument()
    expect(screen.queryByText('Item 5')).not.toBeInTheDocument()
    expect(screen.getByText(/\+2 more/i)).toBeInTheDocument()
  })

  it('renders empty state when nothing is missing', () => {
    render(<PantryShelfRail missingItems={[]} onReview={vi.fn()} />)
    expect(screen.getByText(/pantry is stocked/i)).toBeInTheDocument()
  })

  it('calls onReview when the row is clicked', async () => {
    const onReview = vi.fn()
    const { user } = render(
      <PantryShelfRail
        missingItems={[{ text: 'Snap peas', category: 'Produce', fromRecipeIds: [] }]}
        onReview={onReview}
      />,
    )
    await user.click(screen.getByRole('button', { name: /review groceries/i }))
    expect(onReview).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 5.2: Run test, verify fails**

```bash
npx vitest src/components/meals/rail/PantryShelfRail.test.tsx --run
```

Expected: FAIL.

- [ ] **Step 5.3: Implement**

Create `src/components/meals/rail/PantryShelfRail.tsx`:

```typescript
import type { ConsolidatedIngredient } from '@/lib/consolidateIngredients'
import { ShoppingBag, ChevronRight } from 'lucide-react'

interface PantryShelfRailProps {
  missingItems: ConsolidatedIngredient[]
  /** Opens the grocery review flow (existing surface on the Plan page). */
  onReview: () => void
}

const MAX_VISIBLE = 4

/**
 * Right-rail "Pantry & shelf" panel. Surfaces missing ingredients for the
 * current week's plan, with a click-through into the grocery review flow.
 */
export function PantryShelfRail({ missingItems, onReview }: PantryShelfRailProps) {
  const total = missingItems.length
  const visible = missingItems.slice(0, MAX_VISIBLE)
  const overflow = Math.max(0, total - MAX_VISIBLE)
  const isEmpty = total === 0

  return (
    <section
      aria-labelledby="rail-pantry-shelf"
      className="card px-5 py-4 bg-bg-elevated border border-neutral-200/60"
    >
      <h2
        id="rail-pantry-shelf"
        className="text-[11px] font-medium uppercase tracking-wide text-neutral-400 mb-3"
      >
        Pantry & shelf
      </h2>

      {isEmpty ? (
        <p className="flex items-center gap-2 text-[13px] text-neutral-500">
          <ShoppingBag className="w-4 h-4 text-neutral-300 shrink-0" aria-hidden />
          <span>Pantry is stocked for this week.</span>
        </p>
      ) : (
        <button
          type="button"
          onClick={onReview}
          aria-label="Review groceries"
          className="w-full text-left group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 rounded-md"
        >
          <div className="flex items-start gap-2">
            <ShoppingBag className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-neutral-700">
                {total} {total === 1 ? 'ingredient' : 'ingredients'} missing
              </p>
              <ul className="mt-1 space-y-0.5">
                {visible.map((item, i) => (
                  <li key={`${item.text}-${i}`} className="text-[12px] text-neutral-500 truncate">
                    · {item.text}
                  </li>
                ))}
                {overflow > 0 && (
                  <li className="text-[12px] text-neutral-400">+{overflow} more</li>
                )}
              </ul>
            </div>
            <ChevronRight className="w-4 h-4 text-neutral-300 shrink-0 mt-0.5 group-hover:text-neutral-500 transition-colors" aria-hidden />
          </div>
        </button>
      )}
    </section>
  )
}
```

- [ ] **Step 5.4: Run tests, verify pass**

```bash
npx vitest src/components/meals/rail/PantryShelfRail.test.tsx --run
```

Expected: 4 tests pass.

- [ ] **Step 5.5: Commit**

```bash
git add src/components/meals/rail/PantryShelfRail.tsx src/components/meals/rail/PantryShelfRail.test.tsx
git commit -m "feat(meals/rail): PantryShelfRail panel — specific missing ingredients"
```

### Task 6: `NextUpRail` panel

**Files:**
- Create: `src/components/meals/rail/NextUpRail.tsx`
- Create: `src/components/meals/rail/NextUpRail.test.tsx`

- [ ] **Step 6.1: Write the failing test**

Create `src/components/meals/rail/NextUpRail.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { NextUpRail } from './NextUpRail'

describe('NextUpRail', () => {
  it('renders nothing when there are no upcoming events', () => {
    const { container } = render(
      <NextUpRail events={[]} onViewCalendar={vi.fn()} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders each event title with its day label', () => {
    render(
      <NextUpRail
        events={[
          { id: 'e1', dayLabel: 'Tomorrow', title: 'Early release 1:15 PM' },
          { id: 'e2', dayLabel: 'Friday',   title: "Ella's field trip" },
        ]}
        onViewCalendar={vi.fn()}
      />,
    )
    expect(screen.getByText('Tomorrow')).toBeInTheDocument()
    expect(screen.getByText('Early release 1:15 PM')).toBeInTheDocument()
    expect(screen.getByText('Friday')).toBeInTheDocument()
    expect(screen.getByText("Ella's field trip")).toBeInTheDocument()
  })

  it('calls onViewCalendar when the CTA is clicked', async () => {
    const onViewCalendar = vi.fn()
    const { user } = render(
      <NextUpRail
        events={[{ id: 'e1', dayLabel: 'Tomorrow', title: 'Foo' }]}
        onViewCalendar={onViewCalendar}
      />,
    )
    await user.click(screen.getByRole('button', { name: /view calendar/i }))
    expect(onViewCalendar).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 6.2: Run test, verify fails**

```bash
npx vitest src/components/meals/rail/NextUpRail.test.tsx --run
```

Expected: FAIL.

- [ ] **Step 6.3: Implement**

Create `src/components/meals/rail/NextUpRail.tsx`:

```typescript
import { Calendar } from 'lucide-react'

export interface NextUpEvent {
  id: string
  dayLabel: string  // "Tomorrow" / "Friday" / "May 24"
  title: string
}

interface NextUpRailProps {
  events: NextUpEvent[]
  /** Open the full calendar view. */
  onViewCalendar: () => void
}

/**
 * Right-rail "Next up" panel. Surfaces upcoming family-calendar events that
 * affect meal-planning context (early releases, trips, sports, etc.). The
 * caller selects + formats events; this component just renders.
 *
 * Hides entirely when no events are passed — empty isn't useful, the
 * scratchpad/below panels carry their weight.
 */
export function NextUpRail({ events, onViewCalendar }: NextUpRailProps) {
  if (events.length === 0) return null

  return (
    <section
      aria-labelledby="rail-next-up"
      className="card px-5 py-4 bg-bg-elevated border border-neutral-200/60"
    >
      <h2
        id="rail-next-up"
        className="text-[11px] font-medium uppercase tracking-wide text-neutral-400 mb-3"
      >
        Next up
      </h2>

      <ul className="space-y-2.5">
        {events.map((e) => (
          <li key={e.id} className="flex items-start gap-2">
            <Calendar className="w-4 h-4 text-primary-500 shrink-0 mt-0.5" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-neutral-800 truncate leading-tight">{e.title}</p>
              <p className="text-[11px] text-neutral-500 leading-tight">{e.dayLabel}</p>
            </div>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onViewCalendar}
        className="
          mt-4 w-full text-center text-[13px] font-medium
          text-primary-700 hover:text-primary-800
          py-1.5 rounded-md hover:bg-primary-50 transition-colors
        "
      >
        View calendar
      </button>
    </section>
  )
}
```

- [ ] **Step 6.4: Run tests, verify pass**

```bash
npx vitest src/components/meals/rail/NextUpRail.test.tsx --run
```

Expected: 3 tests pass.

- [ ] **Step 6.5: Commit**

```bash
git add src/components/meals/rail/NextUpRail.tsx src/components/meals/rail/NextUpRail.test.tsx
git commit -m "feat(meals/rail): NextUpRail panel — upcoming family-calendar context"
```

### Task 7: `MealsRail` container + mount on Today tab

**Files:**
- Create: `src/components/meals/rail/MealsRail.tsx`
- Modify: `src/components/meals/today/TodayPage.tsx`

- [ ] **Step 7.1: Implement the container (no separate test — direct composition)**

Create `src/components/meals/rail/MealsRail.tsx`:

```typescript
import { useMemo } from 'react'
import type { MealPlan, Recipe } from '@/types/meal-planner'
import type { ConsolidatedIngredient } from '@/lib/consolidateIngredients'
import { summarizeWeek } from '@/lib/mealHighlights'
import { MealHighlights } from './MealHighlights'
import { PantryShelfRail } from './PantryShelfRail'
import { NextUpRail, type NextUpEvent } from './NextUpRail'

interface MealsRailProps {
  plan: MealPlan | null
  recipes: Recipe[]
  weekStart: Date
  missingItems: ConsolidatedIngredient[]
  nextUpEvents: NextUpEvent[]
  onReviewGroceries: () => void
  onViewCalendar: () => void
}

/**
 * Right-rail container used by both the Plan and Today meals tabs. Stacks
 * Meal highlights, Pantry & shelf, and Next up — each independently empty-
 * stated so the rail handles "no data yet" cases gracefully.
 */
export function MealsRail({
  plan,
  recipes,
  weekStart,
  missingItems,
  nextUpEvents,
  onReviewGroceries,
  onViewCalendar,
}: MealsRailProps) {
  const summary = useMemo(
    () => summarizeWeek({ plan, recipes, weekStart }),
    [plan, recipes, weekStart],
  )

  return (
    <div className="h-full flex flex-col gap-4 overflow-y-auto pr-1">
      <MealHighlights summary={summary} />
      <PantryShelfRail missingItems={missingItems} onReview={onReviewGroceries} />
      <NextUpRail events={nextUpEvents} onViewCalendar={onViewCalendar} />
    </div>
  )
}
```

- [ ] **Step 7.2: Mount on `TodayPage`**

Modify `src/components/meals/today/TodayPage.tsx`:

Add imports:

```typescript
import { MealsRail } from '../rail/MealsRail'
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar'
import { useGroceryStatus } from '@/hooks/useGroceryStatus'
```

Inside the component body, derive the rail data (place these alongside the existing hooks):

```typescript
const { events: calendarEvents } = useGoogleCalendar()
const status = useGroceryStatus(plan, recipes)

const nextUpEvents = useMemo(() => {
  // Show the next 3 family-calendar events strictly after today.
  const startOfTomorrow = new Date()
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1)
  startOfTomorrow.setHours(0, 0, 0, 0)
  return (calendarEvents ?? [])
    .filter((e) => new Date(e.start_time) >= startOfTomorrow)
    .slice(0, 3)
    .map((e) => ({
      id: e.id,
      dayLabel: dayLabel(new Date(e.start_time)),
      title: e.title,
    }))
}, [calendarEvents])

function dayLabel(d: Date): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(d)
  target.setHours(0, 0, 0, 0)
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000)
  if (diffDays === 1) return 'Tomorrow'
  if (diffDays >= 2 && diffDays <= 6) return d.toLocaleDateString('en-US', { weekday: 'long' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
```

Wrap the existing page-body markup so the rail mounts on the right. Use a two-column flex; the rail gets a fixed width and the main content fills the rest:

```tsx
return (
  <div className="px-12 py-12 mx-auto max-w-[1280px] flex gap-8">
    <div className="flex-1 min-w-0">
      <MealsTabs />
      {/* existing body — TodayMealCard mount from Task 2 — stays here */}
    </div>
    <aside className="w-[340px] shrink-0 hidden lg:block">
      <MealsRail
        plan={plan}
        recipes={recipes}
        weekStart={weekStart}
        missingItems={status.missingItems}
        nextUpEvents={nextUpEvents}
        onReviewGroceries={() => navigate('/meals/plan#groceries')}
        onViewCalendar={() => navigate('/calendar')}
      />
    </aside>
  </div>
)
```

- [ ] **Step 7.3: Verify build + smoke**

```bash
npm run build 2>&1 | tail -3
npm run dev
# Visit http://localhost:5173/meals/today
# Expected: hero card on the left; rail with three panels on the right
```

- [ ] **Step 7.4: Commit**

```bash
git add src/components/meals/rail/MealsRail.tsx src/components/meals/today/TodayPage.tsx
git commit -m "feat(meals/today): mount MealsRail with highlights, pantry, next-up"
```

### Task 8: Mount `MealsRail` on Plan tab

**Files:**
- Modify: `src/components/meals/plan/MealPlanRitualPage.tsx`

- [ ] **Step 8.1: Add the rail to the Plan layout**

In `MealPlanRitualPage.tsx`:

Add imports (alongside existing imports):

```typescript
import { MealsRail } from '../rail/MealsRail'
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar'
```

Inside the component body, just after `const { applySuggestion } = useApplyMealSuggestion(...)` add:

```typescript
const { events: calendarEvents } = useGoogleCalendar()

const nextUpEvents = useMemo(() => {
  const startOfTomorrow = new Date()
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1)
  startOfTomorrow.setHours(0, 0, 0, 0)
  return (calendarEvents ?? [])
    .filter((e) => new Date(e.start_time) >= startOfTomorrow)
    .slice(0, 3)
    .map((e) => {
      const d = new Date(e.start_time)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      d.setHours(0, 0, 0, 0)
      const diffDays = Math.round((d.getTime() - today.getTime()) / 86400000)
      let dayLabel: string
      if (diffDays === 1) dayLabel = 'Tomorrow'
      else if (diffDays <= 6) dayLabel = d.toLocaleDateString('en-US', { weekday: 'long' })
      else dayLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      return { id: e.id, dayLabel, title: e.title }
    })
}, [calendarEvents])
```

Find the top-level wrapper `<div className="px-12 py-12 max-w-3xl mx-auto">` (around line 282). Restructure to two-column:

```tsx
return (
  <div className="px-12 py-12 mx-auto max-w-[1280px] flex gap-8">
    <div className="flex-1 min-w-0 max-w-3xl">
      <UndoToast />
      <MealsTabs />
      {/* ... existing body unchanged ... */}
    </div>
    <aside className="w-[340px] shrink-0 hidden lg:block">
      <MealsRail
        plan={plan}
        recipes={recipes}
        weekStart={weekStart}
        missingItems={status.missingItems}
        nextUpEvents={nextUpEvents}
        onReviewGroceries={() => {
          const el = document.getElementById('groceries')
          if (el) el.scrollIntoView({ behavior: 'smooth' })
        }}
        onViewCalendar={() => navigate('/calendar')}
      />
    </aside>
  </div>
)
```

(The existing body stays inside the new left column. Take care not to move the existing `<AskSymphonyRail ... />` mount — leave it where it is, as it's a modal-style chat surface, not a permanent rail.)

- [ ] **Step 8.2: Verify build + smoke**

```bash
npm run build 2>&1 | tail -3
# Smoke at http://localhost:5173/meals/plan
```

- [ ] **Step 8.3: Commit**

```bash
git add src/components/meals/plan/MealPlanRitualPage.tsx
git commit -m "feat(meals/plan): mount MealsRail alongside week document"
```

---

## Phase 3c — Plan-tab polish

Small but visible cleanups Scott called out.

### Task 9: Move "Restart tour" out of header chrome

**Files:**
- Modify: `src/components/meals/plan/RitualStatus.tsx`
- Modify: `src/components/meals/plan/MealPlanRitualPage.tsx`

- [ ] **Step 9.1: Remove `onRestartTour` from `RitualStatus`**

In `src/components/meals/plan/RitualStatus.tsx`, remove the prop from the props interface and remove the rendered button. (If unsure where, search the file for `onRestartTour`.)

- [ ] **Step 9.2: Move the affordance to an overflow menu in the Plan header**

In `MealPlanRitualPage.tsx`, the header's button cluster currently contains: `<ClearWeekButton />`, `<ParameterDropdown />`, "Ask Symphony" button. Add an overflow menu after them:

```tsx
import { MoreHorizontal } from 'lucide-react'

// inside the component:
const [showOverflow, setShowOverflow] = useState(false)

// inside the header button cluster, append:
<div className="relative">
  <button
    type="button"
    onClick={() => setShowOverflow((v) => !v)}
    aria-label="More options"
    className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
  >
    <MoreHorizontal className="w-4 h-4" />
  </button>
  {showOverflow && (
    <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-neutral-200 rounded-lg shadow-lg py-1 min-w-[160px]">
      <button
        type="button"
        onClick={() => {
          localStorage.removeItem('symphony_meal_tour_v1_completed')
          setTourMounted(true)
          setShowOverflow(false)
        }}
        className="block w-full text-left px-3 py-1.5 text-sm hover:bg-neutral-50"
      >
        Restart tour
      </button>
    </div>
  )}
</div>
```

- [ ] **Step 9.3: Update the `<RitualStatus />` call site to drop `onRestartTour`**

In `MealPlanRitualPage.tsx`, find the `<RitualStatus ...>` invocation (around line 317) and remove the `onRestartTour={...}` prop line.

- [ ] **Step 9.4: Verify build**

```bash
npm run build 2>&1 | tail -3
```

- [ ] **Step 9.5: Commit**

```bash
git add src/components/meals/plan/RitualStatus.tsx src/components/meals/plan/MealPlanRitualPage.tsx
git commit -m "refactor(meals/plan): move Restart tour into overflow menu"
```

### Task 10: Fix ParameterDropdown trigger text

**Files:**
- Modify: `src/components/meals/plan/ParameterDropdown.tsx`

- [ ] **Step 10.1: Replace the empty-state "No parameter" wording**

In `ParameterDropdown.tsx`, the `<select>`'s default empty option currently reads `<option value="">No parameter</option>`. Replace with:

```tsx
<option value="">Standard week</option>
```

Also update the visible-trigger styling so the placeholder isn't perceived as user-set state. Search for any other "No parameter" string in the file and replace it with "Standard week".

- [ ] **Step 10.2: Verify build**

```bash
npm run build 2>&1 | tail -3
```

- [ ] **Step 10.3: Commit**

```bash
git add src/components/meals/plan/ParameterDropdown.tsx
git commit -m "fix(meals/plan): ParameterDropdown reads 'Standard week' (was 'No parameter')"
```

### Task 11: Verify Generate-plan demotion already correct

This task is satisfied by Task 1 (TodayMealCard's state-conditional CTA logic). No additional code; we list it explicitly so the checklist reader sees the resolution.

- [ ] **Step 11.1: Confirm `TodayMealCard` test covers the demotion**

The test in Task 1 includes:
- `primary action is "View recipe" when state is "drafted"`
- `primary action is "Generate plan" when state is "empty"`

These guarantee the mockup's "Generate plan reads as primary even when drafted" bug doesn't recur. Run:

```bash
npx vitest src/components/meals/today/TodayMealCard.test.tsx --run
```

Expected: PASS.

---

## Phase 3d — Drop the generic AI Insight

The mockup's AI Insight reads "This week has a good balance of whole grains and veggies. Consider adding a breakfast plan." That's the generic AI commentary Scott killed on the Today banner; same critique applies. We do not build it.

If/when this returns, it should:
1. Reference specific entries ("Wednesday's risotto is the lightest dinner — pair with a heartier breakfast")
2. Have a concrete action ("Add breakfast for Wed" → wire to plan add-meal)
3. Earn its placement, not occupy the rail by default

For now, this phase intentionally ships without an AI Insight panel.

---

## Verification — full check before shipping

- [ ] **Step V.1: Full test suite**

```bash
npm test -- --run 2>&1 | tail -8
```

Expected: the 4-failure baseline is unchanged (TodayView pre-existing failures + NotesPage flake + useSpaces flake). Phase 3 adds ~25 new passing tests (TodayMealCard 7 + MealHighlights 5 + PantryShelfRail 4 + NextUpRail 3 + mealHighlights helper 5 + iterations). Zero new failures.

- [ ] **Step V.2: Lint**

```bash
npm run lint 2>&1 | grep -E "^✖"
```

Expected: same 8-error baseline. Zero new errors.

- [ ] **Step V.3: Build**

```bash
npm run build 2>&1 | tail -3
```

Expected: passes.

- [ ] **Step V.4: Manual smoke on dev server**

```bash
npm run dev
```

Open in a browser:
- `/meals/today` — hero card on the left; right rail with three panels
- `/meals/plan` — week document on the left; right rail mirrored
- Confirm the Plan header no longer shows "Restart tour"; the overflow `⋯` menu does
- Confirm `ParameterDropdown` trigger reads "Standard week" when nothing is selected

- [ ] **Step V.5: Finish via `superpowers:finishing-a-development-branch`**

Standard sequence: rebase onto `origin/main`, race-safe push from worktree, deploy via `vercel --prod`, clean up worktree + branch.

---

## Self-review checklist

- [x] **Spec coverage:** Every brainstorm decision maps to a task:
  - Hero card → Tasks 1, 2
  - MEAL HIGHLIGHTS → Tasks 3, 4
  - PANTRY & SHELF → Task 5
  - NEXT UP → Task 6
  - Right-rail container + mount on both tabs → Tasks 7, 8
  - Restart-tour relocation → Task 9
  - ParameterDropdown text fix → Task 10
  - Generate-plan demotion → Task 11 (verified by Task 1 tests)
  - Generic AI Insight intentionally dropped → Phase 3d note (no code task)

- [x] **Placeholder scan:** Two `undefined` placeholders in Task 2.3 (`methodLabel`, `kidsLine`, `nutritionLabel`) are flagged inline as **scope cuts** — the data model doesn't carry those fields yet, and the card renders fine without them. Not a "TODO" in the bad sense; it's an explicit decision with a comment.

- [x] **Type consistency:** `MealCardAvatar.color` literal union matches `FamilyMember.color`'s vocabulary. `WeekSummary` shape used identically in Task 3 + Task 4. `NextUpEvent` shape exported from `NextUpRail.tsx` and consumed in `MealsRail.tsx` (Task 7).

---

## Why this scope, not more

Deliberate scope-cuts:

- **`methodLabel` + `methodBody` semantic source.** The mockup shows "HANDS-OFF OVEN METHOD" — a per-meal classification we don't store. MVP uses `recipe.instructions[0]` as the method body and omits the label. Future: add a `meal.methodTag` field or LLM-derive it.
- **`kidsLine`.** Same — no field exists for "what the kids eat instead." Future: a `mealPlanEntry.kidsAdaptation` text column or per-member meal variants.
- **`sides` parsing.** MVP omits sides (passes undefined). Future: split the recipe title at `"with"` or pull from a dedicated `sides` field.
- **AI Insight panel** — explicitly dropped (see Phase 3d).
- **Avatar selection per meal** — MVP uses all core family members as default diners. Future: per-entry `mealPlanEntry.dinerIds` to support meals only some people eat.
