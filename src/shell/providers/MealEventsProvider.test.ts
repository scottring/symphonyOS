import { describe, it, expect } from 'vitest'
import { synthesizeMealEvents } from './MealEventsProvider'
import type { MealPlan, Recipe } from '@/types/meal-planner'

/** synthesizeMealEvents feeds the Today/Week timeline AND the wall's dinner
 *  widget (via findDinnerEvent — see components/wall/wallDinnerMealPlan.test.ts).
 *  Leftover title resolution must match WeekGrid's (shared via
 *  lib/mealTitle.ts's resolveMealTitle) so a leftover entry never surfaces
 *  as "Lunch · (unnamed)" or "Dinner · (unnamed)". */
describe('synthesizeMealEvents — leftover title resolution', () => {
  const recipe: Recipe = {
    id: 'r1', userId: 'u1', title: 'Sheet-pan chicken',
    ingredients: [], instructions: [], tags: [], kidAcceptance: {},
    isPrepFriendly: true, timesCooked: 0, createdAt: new Date(), updatedAt: new Date(),
  }

  it('resolves a leftover lunch with a resolvable source to "Lunch · Leftovers: <source title>"', () => {
    const monday = new Date(2026, 6, 20) // Monday, same week as the Sunday-anchored fixtures elsewhere
    const tuesday = new Date(2026, 6, 21)
    const plan: MealPlan = {
      id: 'plan1', userId: 'u1', weekStart: new Date(2026, 6, 19),
      entries: [
        { id: 'e-mon-dinner', mealPlanId: 'plan1', dayOfWeek: monday.getDay(), slot: 'dinner', recipeId: 'r1' },
        { id: 'e-tue-lunch', mealPlanId: 'plan1', dayOfWeek: tuesday.getDay(), slot: 'lunch', leftoverFrom: 'e-mon-dinner' },
      ],
      createdAt: new Date(), updatedAt: new Date(),
    }

    const [evt] = synthesizeMealEvents({
      viewedDate: tuesday, mealPlan: plan, recipes: [recipe], familyMembers: [], currentMemberId: null,
    })
    expect(evt.title).toBe('Lunch · Leftovers: Sheet-pan chicken')
  })

  it('renders plain "Leftovers" (not "(unnamed)") when the source entry was deleted', () => {
    const tuesday = new Date(2026, 6, 21)
    const plan: MealPlan = {
      id: 'plan1', userId: 'u1', weekStart: new Date(2026, 6, 19),
      entries: [
        { id: 'e-tue-lunch', mealPlanId: 'plan1', dayOfWeek: tuesday.getDay(), slot: 'lunch', leftoverFrom: 'gone' },
      ],
      createdAt: new Date(), updatedAt: new Date(),
    }

    const [evt] = synthesizeMealEvents({
      viewedDate: tuesday, mealPlan: plan, recipes: [], familyMembers: [], currentMemberId: null,
    })
    expect(evt.title).toBe('Lunch · Leftovers')
    expect(evt.title).not.toContain('(unnamed)')
  })

  it('renders plain "Leftovers" for a leftover-of-a-leftover, without recursing', () => {
    const monday = new Date(2026, 6, 20)
    const tuesday = new Date(2026, 6, 21)
    const wednesday = new Date(2026, 6, 22)
    const plan: MealPlan = {
      id: 'plan1', userId: 'u1', weekStart: new Date(2026, 6, 19),
      entries: [
        { id: 'e-mon-dinner', mealPlanId: 'plan1', dayOfWeek: monday.getDay(), slot: 'dinner', recipeId: 'r1' },
        { id: 'e-tue-lunch', mealPlanId: 'plan1', dayOfWeek: tuesday.getDay(), slot: 'lunch', leftoverFrom: 'e-mon-dinner' },
        { id: 'e-wed-lunch', mealPlanId: 'plan1', dayOfWeek: wednesday.getDay(), slot: 'lunch', leftoverFrom: 'e-tue-lunch' },
      ],
      createdAt: new Date(), updatedAt: new Date(),
    }

    const [evt] = synthesizeMealEvents({
      viewedDate: wednesday, mealPlan: plan, recipes: [recipe], familyMembers: [], currentMemberId: null,
    })
    expect(evt.title).toBe('Lunch · Leftovers')
  })

  it('a leftover DINNER also resolves correctly (the wall dinner-card regression case)', () => {
    const monday = new Date(2026, 6, 20)
    const tuesday = new Date(2026, 6, 21)
    const plan: MealPlan = {
      id: 'plan1', userId: 'u1', weekStart: new Date(2026, 6, 19),
      entries: [
        { id: 'e-mon-dinner', mealPlanId: 'plan1', dayOfWeek: monday.getDay(), slot: 'dinner', recipeId: 'r1' },
        { id: 'e-tue-dinner', mealPlanId: 'plan1', dayOfWeek: tuesday.getDay(), slot: 'dinner', leftoverFrom: 'e-mon-dinner' },
      ],
      createdAt: new Date(), updatedAt: new Date(),
    }

    const [evt] = synthesizeMealEvents({
      viewedDate: tuesday, mealPlan: plan, recipes: [recipe], familyMembers: [], currentMemberId: null,
    })
    expect(evt.title).toBe('Dinner · Leftovers: Sheet-pan chicken')
    expect(evt.title).not.toContain('(unnamed)')
  })
})
