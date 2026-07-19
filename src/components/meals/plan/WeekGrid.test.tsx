import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WeekGrid } from './WeekGrid'
import type { MealPlanEntry, Recipe } from '@/types/meal-planner'

// Sunday July 19, 2026 — matches the app's week_start convention
// (day_of_week 0=Sunday..6=Saturday, week_start is that Sunday).
const weekStart = new Date(2026, 6, 19)

const recipe: Recipe = {
  id: 'r1',
  userId: 'u1',
  title: 'Sheet-pan chicken',
  ingredients: [],
  instructions: [],
  tags: [],
  kidAcceptance: {},
  isPrepFriendly: true,
  timesCooked: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const entries: MealPlanEntry[] = [
  // Monday (dayOfWeek=1) dinner — recipe-backed.
  { id: 'e-mon-dinner', mealPlanId: 'plan1', dayOfWeek: 1, slot: 'dinner', recipeId: 'r1' },
  // Tuesday (dayOfWeek=2) lunch — leftovers from Monday's dinner.
  { id: 'e-tue-lunch', mealPlanId: 'plan1', dayOfWeek: 2, slot: 'lunch', leftoverFrom: 'e-mon-dinner' },
]

const recipesById = new Map([[recipe.id, recipe]])

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
      onMoveMeal={vi.fn()}
    />
  )
}

describe('WeekGrid', () => {
  it('renders all 7 days with 3 slots each', () => {
    renderGrid()
    for (const label of ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']) {
      expect(screen.getAllByText(new RegExp(label)).length).toBeGreaterThan(0)
    }
    // 21 slot rows total (7 days x 3 slots): 2 filled + 19 empty affordances.
    expect(screen.getAllByLabelText(/^Add /).length).toBe(19)
  })

  it('shows the recipe title on the filled Monday dinner slot', () => {
    renderGrid()
    expect(screen.getByText('Sheet-pan chicken')).toBeInTheDocument()
  })

  it('renders "Leftovers: <source title>" for a leftover entry', () => {
    renderGrid()
    expect(screen.getByText('Leftovers: Sheet-pan chicken')).toBeInTheDocument()
  })

  it('renders plain "Leftovers" when the source entry no longer exists', () => {
    const orphanEntries: MealPlanEntry[] = [
      { id: 'e-orphan', mealPlanId: 'plan1', dayOfWeek: 3, slot: 'lunch', leftoverFrom: 'gone' },
    ]
    renderGrid(orphanEntries)
    expect(screen.getByText('Leftovers')).toBeInTheDocument()
  })

  it('shows an add affordance on empty slots', () => {
    renderGrid()
    // Sunday breakfast is empty.
    expect(screen.getByLabelText('Add breakfast for SUN')).toBeInTheDocument()
  })

  it('does not crash when a realtime update removes an entry whose action menu is open', async () => {
    const user = userEvent.setup()
    const { rerender } = renderGrid()

    // Open the action menu on the filled Monday dinner slot.
    await user.click(screen.getByLabelText('Dinner actions for MON'))
    expect(screen.getByText('Change recipe')).toBeInTheDocument()

    // Simulate a realtime refresh where that entry has since been removed
    // (e.g. cleared from another device) while the menu was open.
    expect(() => {
      rerender(
        <WeekGrid
          weekStart={weekStart}
          entries={entries.filter(e => e.id !== 'e-mon-dinner')}
          recipesById={recipesById}
          activeRange={{ firstDay: 0, lastDay: 6 }}
          onPickRecipe={vi.fn()}
          onTypeName={vi.fn()}
          onLeftoverFromLastNight={vi.fn()}
          onChangeRecipe={vi.fn()}
          onClear={vi.fn()}
          onLeftoverTomorrow={vi.fn()}
        />
      )
    }).not.toThrow()

    // The cell falls back to its empty-slot affordance instead of crashing.
    expect(screen.getByLabelText('Add dinner for MON')).toBeInTheDocument()
  })

  it('disables "→ lunch tomorrow" on Saturday dinner', async () => {
    const user = userEvent.setup()
    const satEntries: MealPlanEntry[] = [
      { id: 'e-sat-dinner', mealPlanId: 'plan1', dayOfWeek: 6, slot: 'dinner', recipeId: 'r1' },
    ]
    renderGrid(satEntries)
    await user.click(screen.getByLabelText('Dinner actions for SAT'))
    expect(screen.getByText('→ Lunch tomorrow')).toBeDisabled()
  })

  it('renders plain "Leftovers" for a leftover-of-a-leftover (no recursive chase)', () => {
    // Monday dinner (real) -> Tuesday lunch (leftover of Monday) -> Wednesday
    // lunch (leftover of Tuesday's leftover entry, which has no own title).
    const chainEntries: MealPlanEntry[] = [
      ...entries,
      { id: 'e-wed-lunch', mealPlanId: 'plan1', dayOfWeek: 3, slot: 'lunch', leftoverFrom: 'e-tue-lunch' },
    ]
    renderGrid(chainEntries)
    // Tuesday's own cell still resolves through Monday.
    expect(screen.getByText('Leftovers: Sheet-pan chicken')).toBeInTheDocument()
    // Wednesday does NOT recurse through Tuesday to reach Monday's title,
    // and does NOT show "Leftovers: (unnamed)" — plain "Leftovers" instead.
    const leftoversOnly = screen.getAllByText('Leftovers')
    expect(leftoversOnly.length).toBe(1)
    expect(screen.queryByText('Leftovers: (unnamed)')).not.toBeInTheDocument()
  })
})

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

  it('disables move-up at the top of the active range (never onto a hidden day)', () => {
    const tueEntries: MealPlanEntry[] = [
      { id: 'e-tue-breakfast', mealPlanId: 'plan1', dayOfWeek: 2, slot: 'breakfast', recipeId: 'r1' },
    ]
    renderGrid(tueEntries, { firstDay: 2, lastDay: 6 })
    expect(screen.getByLabelText('Move Breakfast for TUE up')).toBeDisabled()
  })

  it('disables move-down at the bottom of the active range', () => {
    const friEntries: MealPlanEntry[] = [
      { id: 'e-fri-dinner', mealPlanId: 'plan1', dayOfWeek: 5, slot: 'dinner', recipeId: 'r1' },
    ]
    renderGrid(friEntries, { firstDay: 0, lastDay: 5 })
    expect(screen.getByLabelText('Move Dinner for FRI down')).toBeDisabled()
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
