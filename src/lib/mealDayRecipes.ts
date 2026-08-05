// Builds the day-by-day list the kiosk recipe viewer pages through.
//
// The wall opens tonight's dinner recipe; from there the cook can step to the
// previous / next day's recipe for the SAME slot. This module is the pure part:
// given the meal plans covering a date window plus the recipes those plans
// reference, produce one entry per day that actually has a cookable recipe.
//
// "Cookable" is the filter that makes the arrows honest — a day whose only
// entry is an ad-hoc title with no body (e.g. "Takeout") is skipped, so every
// arrow lands on a screen with ingredients or steps on it.

import { sundayOfWeek, toIsoDate } from '@/lib/weekHelpers'
import { resolveMealTitle } from '@/lib/mealTitle'
import type { MealPlanEntry, MealSlot, Recipe } from '@/types/meal-planner'

/**
 * A week's plan, keyed by the week_start string EXACTLY as stored.
 *
 * Deliberately not `MealPlan`: that type carries `weekStart` as a Date built by
 * `new Date('2026-08-02')`, which parses as UTC midnight and therefore reads
 * back as Aug 1 in every timezone west of UTC. Matching plans to days through
 * that Date silently found nothing. The stored string has no such ambiguity, so
 * it never gets converted here.
 */
export interface MealDayPlan {
  weekStartIso: string
  entries: MealPlanEntry[]
  /** Tie-break only, when two household members planned the same week. */
  createdAt: Date
}

export interface MealDayRecipe {
  /** Local YYYY-MM-DD — the stable identity used for selection. */
  dateKey: string
  date: Date
  /** Resolved display title (handles leftovers), e.g. "Leftovers: Chicken Piccata". */
  title: string
  recipeId?: string
  ingredients: string[]
  instructions: string[]
  sourceUrl?: string
}

/** How many days either side of the anchor day the viewer can page to. */
export const MEAL_DAY_RADIUS = 7

/** Local-time YYYY-MM-DD. Never use toISOString() here — it shifts the day in
 *  any timezone west of UTC, which is every timezone the kiosk runs in. */
export function localDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** The week-start (Sunday) ISO dates whose plans cover [center-radius, center+radius].
 *  At radius 7 that is always exactly the previous, current and next week. */
export function weekStartsCovering(centerDate: Date, radiusDays = MEAL_DAY_RADIUS): string[] {
  const keys = new Set<string>()
  for (let offset = -radiusDays; offset <= radiusDays; offset++) {
    const d = new Date(centerDate)
    d.setDate(d.getDate() + offset)
    keys.add(toIsoDate(sundayOfWeek(d)))
  }
  return [...keys].sort()
}

/**
 * Pick the one entry that represents the family's meal for a day + slot.
 *
 * Shared (whole-family) entries win over per-person variants — the kiosk is a
 * kitchen display, so "what are WE eating" beats "Iris's separate lunch".
 *
 * A day can legitimately hold two shared entries (a main plus a side salad);
 * the first one in `entries` wins, so callers pass them in a stable order.
 */
function pickEntry(entries: MealPlanEntry[], dayOfWeek: number, slot: MealSlot): MealPlanEntry | undefined {
  const forCell = entries.filter((e) => e.dayOfWeek === dayOfWeek && e.slot === slot)
  return forCell.find((e) => !e.forMemberId) ?? forCell[0]
}

/** A leftover shows the SOURCE meal's recipe body — "Leftovers: Chicken
 *  Piccata" should still open the chicken piccata steps. One hop only, matching
 *  resolveMealTitle's rule. */
function bodyEntryFor(entry: MealPlanEntry, entriesById: Map<string, MealPlanEntry>): MealPlanEntry | undefined {
  if (!entry.leftoverFrom) return entry
  const source = entriesById.get(entry.leftoverFrom)
  if (!source || source.leftoverFrom) return undefined
  return source
}

export function buildMealDayRecipes(params: {
  plans: MealDayPlan[]
  recipes: Recipe[]
  centerDate: Date
  slot: MealSlot
  radiusDays?: number
}): MealDayRecipe[] {
  const { plans, recipes, centerDate, slot, radiusDays = MEAL_DAY_RADIUS } = params

  const recipesById = new Map(recipes.map((r) => [r.id, r]))
  // Oldest plan per week wins, matching useMealPlan's tie-break when two
  // household members each created a plan for the same week.
  const planByWeek = new Map<string, MealDayPlan>()
  for (const plan of [...plans].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    if (!planByWeek.has(plan.weekStartIso)) planByWeek.set(plan.weekStartIso, plan)
  }
  const entriesByIdPerPlan = new Map<string, Map<string, MealPlanEntry>>()
  for (const [key, plan] of planByWeek) {
    entriesByIdPerPlan.set(key, new Map(plan.entries.map((e) => [e.id, e])))
  }

  const out: MealDayRecipe[] = []
  for (let offset = -radiusDays; offset <= radiusDays; offset++) {
    const date = new Date(centerDate)
    date.setDate(date.getDate() + offset)
    date.setHours(0, 0, 0, 0)

    const weekKey = toIsoDate(sundayOfWeek(date))
    const plan = planByWeek.get(weekKey)
    if (!plan) continue

    const entry = pickEntry(plan.entries, date.getDay(), slot)
    if (!entry) continue

    const entriesById = entriesByIdPerPlan.get(weekKey)!
    const title = resolveMealTitle(entry, entriesById, recipesById)
    const bodyEntry = bodyEntryFor(entry, entriesById)
    const recipe = bodyEntry?.recipeId ? recipesById.get(bodyEntry.recipeId) : undefined
    const ingredients = recipe?.ingredients ?? []
    const instructions = recipe?.instructions ?? []
    const sourceUrl = recipe?.sourceUrl

    // Nothing to cook from — skip, so an arrow never lands on an empty screen.
    if (ingredients.length === 0 && instructions.length === 0 && !sourceUrl) continue

    out.push({
      dateKey: localDateKey(date),
      date,
      title,
      recipeId: recipe?.id,
      ingredients,
      instructions,
      sourceUrl,
    })
  }
  return out
}

/** The day immediately before/after `dateKey` in the list. `null` at the ends —
 *  which is how the viewer knows to hide an arrow. */
export function neighborDays(
  days: MealDayRecipe[],
  dateKey: string,
): { prev: MealDayRecipe | null; next: MealDayRecipe | null } {
  const before = days.filter((d) => d.dateKey < dateKey)
  const after = days.filter((d) => d.dateKey > dateKey)
  return {
    prev: before.length > 0 ? before[before.length - 1] : null,
    next: after.length > 0 ? after[0] : null,
  }
}

/** Short label for a nav arrow / header: "Tonight" for the anchor day, else
 *  "Mon, Aug 3". Slot-aware so breakfast doesn't say "Tonight". */
export function mealDayLabel(date: Date, slot: MealSlot, todayKey: string): string {
  if (localDateKey(date) === todayKey) {
    return slot === 'dinner' ? 'Tonight' : 'Today'
  }
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
