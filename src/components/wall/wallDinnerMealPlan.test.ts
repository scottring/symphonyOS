import { describe, it, expect } from 'vitest'
import { synthesizeMealEvents } from '@/shell/providers/MealEventsProvider'
import { findDinnerEvent, findBreakfastEvent } from './WallDinnerWidget'
import { extractRecipeNameHint, resolveRecipeUrl } from '@/lib/recipeDetection'
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

/** Same contract as above, for the wall's breakfast card. */
describe('wall breakfast ⟵ structured meal plan', () => {
  it('a recipe-backed breakfast entry is findable by findBreakfastEvent', () => {
    const today = new Date()
    const plan = {
      id: 'mp4',
      entries: [
        { id: 'e3', dayOfWeek: today.getDay(), slot: 'breakfast', recipeId: 'r2' },
      ],
    } as unknown as MealPlan
    const recipes = [
      { id: 'r2', title: 'Perfect Buttermilk Pancakes' },
    ] as unknown as Parameters<typeof synthesizeMealEvents>[0]['recipes']

    const mealEvents = synthesizeMealEvents({
      viewedDate: today, mealPlan: plan, recipes, familyMembers: [], currentMemberId: null,
    })

    const found = findBreakfastEvent(mealEvents, today)
    expect(found).not.toBeNull()
    expect(found!.title).toContain('Buttermilk Pancakes')
    expect(found!.recipeId).toBe('r2')
  })

  it('does not cross-match: dinner is not breakfast and breakfast is not dinner', () => {
    const today = new Date()
    const plan = {
      id: 'mp5',
      entries: [
        { id: 'e4', dayOfWeek: today.getDay(), slot: 'dinner', adHocTitle: 'Stir-fry' },
        { id: 'e5', dayOfWeek: today.getDay(), slot: 'breakfast', adHocTitle: 'Oatmeal' },
      ],
    } as unknown as MealPlan
    const mealEvents = synthesizeMealEvents({
      viewedDate: today, mealPlan: plan, recipes: [], familyMembers: [], currentMemberId: null,
    })

    expect(findBreakfastEvent(mealEvents, today)!.title).toContain('Oatmeal')
    expect(findDinnerEvent(mealEvents, today)!.title).toContain('Stir-fry')
  })

  it('returns null when there is no breakfast entry that day', () => {
    const today = new Date()
    const plan = { id: 'mp6', entries: [] } as unknown as MealPlan
    const mealEvents = synthesizeMealEvents({
      viewedDate: today, mealPlan: plan, recipes: [], familyMembers: [], currentMemberId: null,
    })
    expect(findBreakfastEvent(mealEvents, today)).toBeNull()
  })
})

/** End-to-end lock on the row that broke the Tonight card (Scott, 2026-09-15).
 *
 * The wall composes the card exactly this way: findDinnerEvent over the
 * synthesized events, then `extractRecipeNameHint(title) || title` for the name
 * and `resolveRecipeUrl(description)` for the tap (WallV2Shell.useMealCardData,
 * whose tap handler opens the viewer only when a URL or stored body exists).
 * Every link in that chain is asserted here, so a regression in any one of them
 * fails rather than silently printing a URL across the kitchen wall. */
describe('a dinner whose recipe link was pasted into the title', () => {
  const REAL_TITLE = 'Golden tofu noodle bowl https://cooking.nytimes.com/recipes/786478904-golden-tofu-noodle-bowl)'
  const REAL_URL = 'https://cooking.nytimes.com/recipes/786478904-golden-tofu-noodle-bowl'

  function cardFor(adHocTitle: string) {
    const today = new Date()
    const plan = {
      id: 'mp1',
      entries: [{ id: 'e1', dayOfWeek: today.getDay(), slot: 'dinner', adHocTitle }],
    } as unknown as MealPlan
    const events = synthesizeMealEvents({
      viewedDate: today, mealPlan: plan, recipes: [], familyMembers: [], currentMemberId: null,
    })
    const dinner = findDinnerEvent(events, today)!
    expect(dinner).toBeTruthy()
    return {
      mealName: extractRecipeNameHint(dinner.title) || dinner.title,
      recipeUrl: resolveRecipeUrl(dinner.description),
    }
  }

  it('shows the dish name with no URL in it, and the tap has a recipe to open', () => {
    const card = cardFor(REAL_TITLE)
    expect(card.mealName).toBe('Golden tofu noodle bowl')
    expect(card.mealName).not.toMatch(/https?:/)
    expect(card.recipeUrl).toBe(REAL_URL)
  })

  it('an ordinary planned dinner still reads plainly and simply has nothing to open', () => {
    const card = cardFor('Salmon, broccoli and sweet potatoes')
    expect(card.mealName).toBe('Salmon, broccoli and sweet potatoes')
    expect(card.recipeUrl).toBeNull()
  })
})
