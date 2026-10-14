// src/hooks/usePlannedDinners.ts
//
// Each day's planned dinner for a span of days, for Today and Week (Scott,
// 2026-10-14: "we need dinners to show on the Today and Week pages"). The
// same meal plan the kitchen wall reads, read-only (never creating a plan,
// unlike useMealPlan), refreshed when a plan changes elsewhere in the app or
// the tab comes back.
//
// Planned meals stay off the day's timeline (SHOW_PLANNED_MEALS_ON_TIMELINE);
// this feeds a separate dinner line.

import { useEffect, useMemo, useState } from 'react'
import { buildPlannedMeals, weekStartsForRange, type MealDayPlan, type PlannedMeal } from '@/lib/mealDayRecipes'
import { localYmd, parseLocalYmd } from '@/lib/cadence/config'
import type { Recipe } from '@/types/meal-planner'
import { useRefreshOnVisible } from '@/hooks/useRefreshOnVisible'
import { fetchMealPlans } from './useMealDayRecipes'

export function usePlannedDinners(start: Date, days: number): Map<string, PlannedMeal> {
  const [plans, setPlans] = useState<MealDayPlan[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [version, setVersion] = useState(0)
  // Strings, so a new Date for the same day doesn't refetch.
  const startKey = localYmd(start)
  const weeksKey = weekStartsForRange(parseLocalYmd(startKey), days).join(',')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const r = await fetchMealPlans(weeksKey.split(','))
      if (cancelled || 'error' in r) return
      setPlans(r.plans)
      setRecipes(r.recipes)
    }
    void load()
    return () => { cancelled = true }
  }, [weeksKey, version])

  useEffect(() => {
    const again = () => setVersion((v) => v + 1)
    window.addEventListener('symphony-plan-updated', again)
    return () => window.removeEventListener('symphony-plan-updated', again)
  }, [])
  useRefreshOnVisible(() => setVersion((v) => v + 1))

  return useMemo(
    () => buildPlannedMeals({ plans, recipes, start: parseLocalYmd(startKey), days, slot: 'dinner' }),
    [plans, recipes, startKey, days],
  )
}
