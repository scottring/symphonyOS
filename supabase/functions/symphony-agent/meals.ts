// Symphony's meal tools (Scott, 2026-10-14: "Change tonight's dinner from
// butternut squash soup to Wednesday Wheelie's Pizza" ended up as an Inbox
// task — the agent had no way to touch the meal plan).
//
// The meal plan is the household's: one plan per week (the oldest, when two
// members each made one — the same tie-break the app and the kitchen wall
// use), entries by day and slot. A day's meal is its first whole-family entry
// (a main beside a side); setting a meal replaces that entry in place, so
// Today, Week and the wall all show the change.

//
// Slots and dates come from _shared/mealDays.ts, the same rules the Meals
// page's chat (meal-planner-chat) uses.

import { STORED_MEAL_SLOTS, isStoredMealSlot, addDays, resolveDate, weekOf } from '../_shared/mealDays.ts'

export { STORED_MEAL_SLOTS, addDays, resolveDate, weekOf }

/** The slot words the symphony_set_meal schema in index.ts still offers.
 *  Only STORED_MEAL_SLOTS can be written: the table's CHECK refuses snack and
 *  prep, so setMeal turns them away with a plain reason. Kept here, not
 *  narrowed, because index.ts defaults an unknown slot to dinner, and a
 *  narrowed list would quietly turn "snack" into replacing dinner. */
export const MEAL_SLOTS = ['breakfast', 'lunch', 'snack', 'dinner', 'prep'] as const
export type MealSlot = typeof MEAL_SLOTS[number]

/** Why a slot can't be written, or null when it can. */
export function unstoredSlotReason(slot: string): string | null {
  return isStoredMealSlot(slot) ? null
    : `The meal plan holds ${STORED_MEAL_SLOTS.join(', ')} only; there is no ${slot} slot. Nothing was changed.`
}

// deno-lint-ignore no-explicit-any
type Db = any

export interface EntryRow {
  id: string
  meal_plan_id: string
  day_of_week: number
  slot: string
  recipe_id: string | null
  ad_hoc_title: string | null
  leftover_from: string | null
  for_member_id: string | null
  created_at: string
  recipes?: { title?: string | null } | null
}

/** What an entry is called: its recipe, its own words, or the meal it reheats. */
export function entryTitle(e: EntryRow, byId: Map<string, EntryRow>): string {
  if (e.leftover_from) {
    const src = byId.get(e.leftover_from)
    const srcTitle = src && !src.leftover_from ? (src.recipes?.title ?? src.ad_hoc_title ?? '') : ''
    return srcTitle ? `Leftovers: ${srcTitle}` : 'Leftovers'
  }
  return (e.recipes?.title ?? e.ad_hoc_title ?? '').trim()
}

/** The day's meal for a slot: the first whole-family entry, else the first. */
export function primaryEntry(entries: EntryRow[], dayOfWeek: number, slot: string): EntryRow | undefined {
  const cell = entries
    .filter((e) => e.day_of_week === dayOfWeek && e.slot === slot)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
  return cell.find((e) => !e.for_member_id) ?? cell[0]
}

/** The household's plan for each week (oldest wins), by week_start. */
async function plansFor(db: Db, weeks: string[]): Promise<Map<string, string>> {
  const { data, error } = await db.from('meal_plans').select('id, week_start, created_at')
    .in('week_start', weeks).order('created_at', { ascending: true })
  if (error) throw error
  const out = new Map<string, string>()
  for (const p of (data ?? []) as { id: string; week_start: string }[]) {
    const key = String(p.week_start).slice(0, 10)
    if (!out.has(key)) out.set(key, p.id)
  }
  return out
}

async function entriesFor(db: Db, planIds: string[]): Promise<EntryRow[]> {
  if (!planIds.length) return []
  const { data, error } = await db.from('meal_plan_entries')
    .select('id, meal_plan_id, day_of_week, slot, recipe_id, ad_hoc_title, leftover_from, for_member_id, created_at, recipes(title)')
    .in('meal_plan_id', planIds).order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as EntryRow[]
}

/** What's planned, day by day, for `days` days from `start`. */
export async function getMeals(db: Db, start: string, days: number) {
  const n = Math.min(14, Math.max(1, Math.round(days) || 7))
  const dates = Array.from({ length: n }, (_, i) => addDays(start, i))
  const plans = await plansFor(db, [...new Set(dates.map((d) => weekOf(d).weekStart))])
  const entries = await entriesFor(db, [...plans.values()])
  const byId = new Map(entries.map((e) => [e.id, e]))
  return dates.map((date) => {
    const { weekStart, dayOfWeek } = weekOf(date)
    const planId = plans.get(weekStart)
    const meals = STORED_MEAL_SLOTS.flatMap((slot) => {
      const e = planId ? primaryEntry(entries.filter((x) => x.meal_plan_id === planId), dayOfWeek, slot) : undefined
      return e ? [{ slot, title: entryTitle(e, byId), entry_id: e.id, recipe_id: e.recipe_id }] : []
    })
    return { date, meals }
  })
}

/** Set a day's meal for a slot, replacing what was there. */
export async function setMeal(db: Db, userId: string, input: { date: string; slot: MealSlot; title: string; recipe_id?: string | null }) {
  const refused = unstoredSlotReason(input.slot)
  if (refused) throw new Error(refused)
  const title = input.title.trim().slice(0, 200)
  const { weekStart, dayOfWeek } = weekOf(input.date)

  let planId = (await plansFor(db, [weekStart])).get(weekStart)
  if (!planId) {
    const { data, error } = await db.from('meal_plans').insert({ user_id: userId, week_start: weekStart }).select('id').single()
    if (error) throw error
    planId = data.id as string
  }

  // A title that is a recipe on the shelf links to it ("make Thursday the chili").
  let recipeId = typeof input.recipe_id === 'string' && input.recipe_id ? input.recipe_id : null
  if (!recipeId) {
    // ilike without wildcards is a case-blind match; the person's own % and _ are literal.
    const { data } = await db.from('recipes').select('id, title').ilike('title', title.replace(/[\\%_]/g, (c) => `\\${c}`)).limit(1)
    recipeId = (data?.[0]?.id as string | undefined) ?? null
  }

  const entries = await entriesFor(db, [planId])
  const byId = new Map(entries.map((e) => [e.id, e]))
  const current = primaryEntry(entries, dayOfWeek, input.slot)
  const previous = current ? entryTitle(current, byId) || null : null
  const fields = { recipe_id: recipeId, ad_hoc_title: recipeId ? null : title, leftover_from: null }

  const { data, error } = current && !current.for_member_id
    ? await db.from('meal_plan_entries').update(fields).eq('id', current.id).select('id').single()
    : await db.from('meal_plan_entries').insert({ ...fields, meal_plan_id: planId, day_of_week: dayOfWeek, slot: input.slot }).select('id').single()
  if (error) throw error
  return { id: data.id as string, date: input.date, slot: input.slot, title, recipe_id: recipeId, previous }
}
