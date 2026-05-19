import { describe, it, expect } from 'vitest'
import { synthesizeMealEvents } from '@/shell/providers/MealEventsProvider'
import { findDinnerEvent } from './WallDinnerWidget'
import type { MealPlan } from '@/types/meal-planner'

/** Regression lock for the wall meal-plan dinner fix.
 *
 * The wall's dinner widget finds dinner via findDinnerEvent() over a
 * CalendarEvent list. A structured ad-hoc meal-plan entry only reaches the
 * wall if synthesizeMealEvents() produces an event whose title/date
 * findDinnerEvent() will match. If either the synthesized title format or
 * DINNER_KEYWORDS drift, the wall silently stops showing planned dinners
 * (the exact bug this fixes). This test pins that contract. */
describe('wall dinner ⟵ structured meal plan', () => {
  it('an ad-hoc dinner entry is findable by findDinnerEvent', () => {
    const today = new Date()
    const plan = {
      id: 'mp1',
      entries: [
        {
          id: 'e1',
          dayOfWeek: today.getDay(), // synthesize uses viewedDate.getDay()
          slot: 'dinner',
          adHocTitle: 'Pasta e fagioli + wilted spinach + big green salad',
        },
      ],
    } as unknown as MealPlan

    const mealEvents = synthesizeMealEvents({
      viewedDate: today,
      mealPlan: plan,
      recipes: [],
      familyMembers: [],
      currentMemberId: null,
    })

    expect(mealEvents.length).toBe(1)
    const found = findDinnerEvent(mealEvents, today)
    expect(found).not.toBeNull()
    expect(found!.title).toContain('Pasta e fagioli')
  })

  it('carries the linked recipe URL onto the event description (for the recipe viewer)', () => {
    const today = new Date()
    const plan = {
      id: 'mp3',
      entries: [
        { id: 'e2', dayOfWeek: today.getDay(), slot: 'dinner', recipeId: 'r1' },
      ],
    } as unknown as MealPlan
    const recipes = [
      { id: 'r1', title: 'Skillet Lasagna', sourceUrl: 'https://www.seriouseats.com/skillet-lasagna' },
    ] as unknown as Parameters<typeof synthesizeMealEvents>[0]['recipes']

    const [evt] = synthesizeMealEvents({
      viewedDate: today, mealPlan: plan, recipes, familyMembers: [], currentMemberId: null,
    })
    expect(evt.title).toContain('Skillet Lasagna')
    expect(evt.description).toBe('https://www.seriouseats.com/skillet-lasagna')
  })

  it('returns null when there is no dinner entry that day', () => {
    const today = new Date()
    const plan = { id: 'mp2', entries: [] } as unknown as MealPlan
    const mealEvents = synthesizeMealEvents({
      viewedDate: today, mealPlan: plan, recipes: [], familyMembers: [], currentMemberId: null,
    })
    expect(findDinnerEvent(mealEvents, today)).toBeNull()
  })
})
