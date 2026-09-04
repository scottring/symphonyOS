import { describe, it, expect } from 'vitest'
import {
  buildMealDayRecipes,
  localDateKey,
  mealDayLabel,
  neighborDays,
  weekStartsCovering,
} from './mealDayRecipes'
import type { MealDayPlan } from './mealDayRecipes'
import type { MealPlanEntry, Recipe } from '@/types/meal-planner'

// Wed 2026-08-05 — the anchor day for most cases below.
const WED = new Date(2026, 7, 5)
// Week keys are the raw `meal_plans.week_start` strings, exactly as Postgres
// returns them — NOT Dates. Building these as Dates is what hid the bug that
// shipped on 2026-08-04: `new Date('2026-08-02')` is UTC midnight, which is
// Aug 1 in local time, so no plan ever matched and the day rails never drew.
const THIS_WEEK = '2026-08-02' // Sun Aug 2
const NEXT_WEEK = '2026-08-09' // Sun Aug 9
const PREV_WEEK = '2026-07-26' // Sun Jul 26

function recipe(id: string, title: string, over: Partial<Recipe> = {}): Recipe {
  return {
    id, userId: 'u1', title,
    ingredients: ['1 lb chicken', '2 lemons'],
    instructions: ['Sear the chicken.', 'Add lemon.'],
    tags: [], kidAcceptance: {}, isPrepFriendly: false, timesCooked: 0,
    createdAt: new Date(2026, 0, 1), updatedAt: new Date(2026, 0, 1),
    ...over,
  }
}

function entry(over: Partial<MealPlanEntry> & { id: string; dayOfWeek: number }): MealPlanEntry {
  return { mealPlanId: 'p1', slot: 'dinner', ...over }
}

function plan(over: Partial<MealDayPlan> & { weekStartIso: string; entries: MealPlanEntry[] }): MealDayPlan {
  return { createdAt: new Date(2026, 0, 1), ...over }
}

describe('weekStartsCovering', () => {
  it('covers exactly the previous, current and next week at radius 7', () => {
    expect(weekStartsCovering(WED)).toEqual(['2026-07-26', '2026-08-02', '2026-08-09'])
  })

  it('covers the neighbouring weeks from a week edge too', () => {
    // Saturday Aug 8: -7 lands in the prior week, +7 in the next.
    expect(weekStartsCovering(new Date(2026, 7, 8))).toEqual(['2026-07-26', '2026-08-02', '2026-08-09'])
  })
})

describe('buildMealDayRecipes', () => {
  const piccata = recipe('r1', 'Chicken Piccata')
  const tacos = recipe('r2', 'Fish Tacos')

  it('returns one entry per day that has a cookable recipe, in date order', () => {
    const days = buildMealDayRecipes({
      plans: [plan({ weekStartIso: THIS_WEEK, entries: [
          entry({ id: 'e1', dayOfWeek: 2, recipeId: 'r1' }), // Tue Aug 4
          entry({ id: 'e2', dayOfWeek: 4, recipeId: 'r2' }), // Thu Aug 6
        ],
      })],
      recipes: [piccata, tacos],
      centerDate: WED,
      slot: 'dinner',
    })
    expect(days.map((d) => [d.dateKey, d.title])).toEqual([
      ['2026-08-04', 'Chicken Piccata'],
      ['2026-08-06', 'Fish Tacos'],
    ])
    expect(days[0].instructions).toEqual(['Sear the chicken.', 'Add lemon.'])
  })

  it('crosses the week boundary using the neighbouring plans', () => {
    const days = buildMealDayRecipes({
      plans: [
        plan({ weekStartIso: PREV_WEEK, entries: [entry({ id: 'e0', mealPlanId: 'p0', dayOfWeek: 5, recipeId: 'r1' })] }), // Fri Jul 31
        plan({ weekStartIso: NEXT_WEEK, entries: [entry({ id: 'e3', mealPlanId: 'p2', dayOfWeek: 1, recipeId: 'r2' })] }), // Mon Aug 10
      ],
      recipes: [piccata, tacos],
      centerDate: WED,
      slot: 'dinner',
    })
    expect(days.map((d) => d.dateKey)).toEqual(['2026-07-31', '2026-08-10'])
  })

  // Regression, 2026-08-05: the wall shipped with no day rails at all because
  // plans were keyed by `new Date(week_start)` — UTC midnight, which is the
  // PREVIOUS day in any timezone west of UTC, so the lookup never matched.
  // Feeding the stored string straight through is what fixes it, so this test
  // asserts the exact value Postgres returns still resolves a day.
  it('matches a plan by its stored week_start string, not a timezone-shifted Date', () => {
    const days = buildMealDayRecipes({
      plans: [plan({ weekStartIso: THIS_WEEK, entries: [entry({ id: 'e1', dayOfWeek: 3, recipeId: 'r1' })] })],
      recipes: [piccata],
      centerDate: WED,
      slot: 'dinner',
    })
    expect(days.map((d) => d.dateKey)).toEqual(['2026-08-05'])
  })

  it('only returns the requested slot', () => {
    const days = buildMealDayRecipes({
      plans: [plan({ weekStartIso: THIS_WEEK, entries: [
          entry({ id: 'e1', dayOfWeek: 2, slot: 'breakfast', recipeId: 'r1' }),
          entry({ id: 'e2', dayOfWeek: 2, slot: 'dinner', recipeId: 'r2' }),
        ],
      })],
      recipes: [piccata, tacos],
      centerDate: WED,
      slot: 'dinner',
    })
    expect(days.map((d) => d.title)).toEqual(['Fish Tacos'])
  })

  it('skips days whose meal has no recipe body — an arrow never lands on nothing', () => {
    const days = buildMealDayRecipes({
      plans: [plan({ weekStartIso: THIS_WEEK, entries: [
          entry({ id: 'e1', dayOfWeek: 2, adHocTitle: 'Takeout' }),
          entry({ id: 'e2', dayOfWeek: 4, recipeId: 'r1' }),
        ],
      })],
      recipes: [piccata],
      centerDate: WED,
      slot: 'dinner',
    })
    expect(days.map((d) => d.dateKey)).toEqual(['2026-08-06'])
  })

  it('keeps a body-less meal that still has a source URL to fetch', () => {
    const linkOnly = recipe('r3', 'Web Recipe', {
      ingredients: [], instructions: [], sourceUrl: 'https://example.com/r',
    })
    const days = buildMealDayRecipes({
      plans: [plan({ weekStartIso: THIS_WEEK, entries: [entry({ id: 'e1', dayOfWeek: 2, recipeId: 'r3' })] })],
      recipes: [linkOnly],
      centerDate: WED,
      slot: 'dinner',
    })
    expect(days).toHaveLength(1)
    expect(days[0].sourceUrl).toBe('https://example.com/r')
  })

  it('shows a leftover under its own title but with the source recipe body', () => {
    const days = buildMealDayRecipes({
      plans: [plan({ weekStartIso: THIS_WEEK, entries: [
          entry({ id: 'src', dayOfWeek: 2, recipeId: 'r1' }),
          entry({ id: 'lo', dayOfWeek: 3, leftoverFrom: 'src' }),
        ],
      })],
      recipes: [piccata],
      centerDate: WED,
      slot: 'dinner',
    })
    const leftover = days.find((d) => d.dateKey === '2026-08-05')!
    expect(leftover.title).toBe('Leftovers: Chicken Piccata')
    expect(leftover.instructions).toEqual(['Sear the chicken.', 'Add lemon.'])
  })

  it('prefers the shared family meal over a per-person variant in the same cell', () => {
    const days = buildMealDayRecipes({
      plans: [plan({ weekStartIso: THIS_WEEK, entries: [
          entry({ id: 'e1', dayOfWeek: 2, recipeId: 'r2', forMemberId: 'iris' }),
          entry({ id: 'e2', dayOfWeek: 2, recipeId: 'r1' }),
        ],
      })],
      recipes: [piccata, tacos],
      centerDate: WED,
      slot: 'dinner',
    })
    expect(days.map((d) => d.title)).toEqual(['Chicken Piccata'])
  })

  it('breaks a duplicate-week tie the same way useMealPlan does — oldest plan wins', () => {
    const days = buildMealDayRecipes({
      plans: [
        plan({ weekStartIso: THIS_WEEK, createdAt: new Date(2026, 5, 2),
          entries: [entry({ id: 'e1', mealPlanId: 'newer', dayOfWeek: 2, recipeId: 'r2' })],
        }),
        plan({ weekStartIso: THIS_WEEK, createdAt: new Date(2026, 5, 1),
          entries: [entry({ id: 'e2', mealPlanId: 'older', dayOfWeek: 2, recipeId: 'r1' })],
        }),
      ],
      recipes: [piccata, tacos],
      centerDate: WED,
      slot: 'dinner',
    })
    expect(days.map((d) => d.title)).toEqual(['Chicken Piccata'])
  })

  it('stays inside the radius', () => {
    const days = buildMealDayRecipes({
      plans: [plan({ weekStartIso: THIS_WEEK, entries: [entry({ id: 'e1', dayOfWeek: 2, recipeId: 'r1' })] })],
      recipes: [piccata],
      centerDate: WED,
      slot: 'dinner',
      radiusDays: 0,
    })
    expect(days).toEqual([])
  })
})

describe('neighborDays', () => {
  const days = [
    { dateKey: '2026-08-03' }, { dateKey: '2026-08-05' }, { dateKey: '2026-08-06' },
  ] as Parameters<typeof neighborDays>[0]

  it('finds the day either side of the selected one', () => {
    const { prev, next } = neighborDays(days, '2026-08-05')
    expect(prev?.dateKey).toBe('2026-08-03')
    expect(next?.dateKey).toBe('2026-08-06')
  })

  it('returns null at the ends', () => {
    expect(neighborDays(days, '2026-08-03').prev).toBeNull()
    expect(neighborDays(days, '2026-08-06').next).toBeNull()
  })

  it('works when the selected day is not itself in the list', () => {
    const { prev, next } = neighborDays(days, '2026-08-04')
    expect(prev?.dateKey).toBe('2026-08-03')
    expect(next?.dateKey).toBe('2026-08-05')
  })
})

describe('mealDayLabel', () => {
  it('names the anchor day by its meal, not its date', () => {
    expect(mealDayLabel(WED, 'dinner', localDateKey(WED))).toBe('Tonight')
    expect(mealDayLabel(WED, 'breakfast', localDateKey(WED))).toBe('Today')
  })

  it('names any other day', () => {
    expect(mealDayLabel(new Date(2026, 7, 6), 'dinner', localDateKey(WED))).toBe('Thu, Aug 6')
  })
})

describe('localDateKey', () => {
  it('uses local time, not UTC — a late-evening date must not roll forward', () => {
    expect(localDateKey(new Date(2026, 7, 5, 23, 30))).toBe('2026-08-05')
  })
})
