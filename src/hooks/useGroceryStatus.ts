import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase, getAuthUser } from '@/lib/supabase'
import { consolidateIngredients, type ConsolidatedIngredient } from '@/lib/consolidateIngredients'
import { activeDayRange, toIsoDate } from '@/lib/weekHelpers'
import {
  alreadyListed, buildSteps, syncSteps,
  type GroceryListItem, type MealGroceryLine, type MealGroceryStep,
} from '@/lib/mealGroceries'
import type { MealPlan, Recipe } from '@/types/meal-planner'

interface UseGroceryStatusResult {
  loading: boolean
  error: string | null
  stockedPercent: number
  missingItems: ConsolidatedIngredient[]
  consolidated: ConsolidatedIngredient[]
  groceriesListId: string | null
  stores: { id: string; title: string }[]
  refresh: () => Promise<void>
  /** Put the ticked items on Groceries and remember the week's ingredients,
   *  so later meal changes keep the list in step. Resolves to an error message
   *  or null. */
  build: (chosen: ConsolidatedIngredient[]) => Promise<string | null>
}

const APPLE_REMINDERS_LIST_NAME = 'Groceries'
/** Meal edits come in bursts (swap a dinner, move a lunch); wait for a pause. */
const SYNC_DELAY_MS = 800

interface LineRow {
  id: string; ingredient_key: string; recipe_ids: string[] | null; text: string
  list_item_id: string | null; skipped: boolean
}

const toLine = (r: LineRow): MealGroceryLine => ({
  id: r.id, ingredientKey: r.ingredient_key, recipeIds: r.recipe_ids ?? [], text: r.text,
  listItemId: r.list_item_id, skipped: r.skipped,
})

/** Every recipe-backed meal has its recipe loaded. Until then the week's
 *  ingredients are incomplete, and syncing would check off the missing ones. */
function recipesResolved(plan: MealPlan, recipes: Recipe[]): boolean {
  const ids = new Set(recipes.map(r => r.id))
  return plan.entries.every(e => e.leftoverFrom || !e.recipeId || e.recipe || ids.has(e.recipeId))
}

/** The list's open items and the week's lines, read fresh. */
async function loadWeek(listId: string, weekStart: string): Promise<{ items: GroceryListItem[]; lines: MealGroceryLine[] | null; error: string | null }> {
  const { data: items, error: itemsErr } = await supabase
    .from('list_items')
    .select('id,text,completed')
    .eq('list_id', listId)
    .eq('completed', false)
  if (itemsErr) return { items: [], lines: null, error: itemsErr.message }
  const { data: lineRows, error: linesErr } = await supabase
    .from('meal_grocery_lines')
    .select('id,ingredient_key,recipe_ids,text,list_item_id,skipped')
    .eq('list_id', listId)
    .eq('week_start', weekStart)
  return {
    items: ((items ?? []) as GroceryListItem[]).map(i => ({ id: i.id, text: i.text, completed: false })),
    // Lines are an addition: without them the page still works, unsynced.
    lines: linesErr ? null : ((lineRows ?? []) as LineRow[]).map(toLine),
    error: null,
  }
}

interface ApplyContext { listId: string; weekStart: string; userId: string }

/** Carry out sync or build steps. A line is claimed before its item is made
 *  (unique per list, week and ingredient), so two open tabs can't both add it. */
async function applySteps(steps: MealGroceryStep[], ctx: ApplyContext): Promise<string | null> {
  let firstError: string | null = null
  const note = (e: { message: string } | null) => { if (e && !firstError) firstError = e.message }
  const lineRow = (item: ConsolidatedIngredient, skipped: boolean) => ({
    user_id: ctx.userId, list_id: ctx.listId, week_start: ctx.weekStart,
    ingredient_key: item.key, recipe_ids: item.fromRecipeIds, text: item.text, skipped,
  })
  const newItem = async (text: string, sortOrder: number) => {
    const { data, error } = await supabase.from('list_items')
      .insert({ list_id: ctx.listId, user_id: ctx.userId, text, sort_order: sortOrder, completed: false })
      .select('id').single()
    note(error)
    return (data as { id: string } | null)?.id ?? null
  }

  for (const [index, step] of steps.entries()) {
    switch (step.kind) {
      case 'add': {
        let lineId = step.lineId ?? null
        if (!lineId) {
          const { data, error } = await supabase.from('meal_grocery_lines')
            .upsert(lineRow(step.item, false), { onConflict: 'list_id,week_start,ingredient_key', ignoreDuplicates: true })
            .select('id')
          note(error)
          lineId = (data as { id: string }[] | null)?.[0]?.id ?? null
          if (!lineId) break // another tab got there first
        }
        const itemId = await newItem(step.item.text, index)
        if (!itemId) break
        const { error } = await supabase.from('meal_grocery_lines')
          .update({ list_item_id: itemId, skipped: false, text: step.item.text, recipe_ids: step.item.fromRecipeIds })
          .eq('id', lineId)
        note(error)
        break
      }
      case 'link': {
        const { error } = await supabase.from('meal_grocery_lines')
          .upsert({ ...lineRow(step.item, false), list_item_id: step.listItemId }, { onConflict: 'list_id,week_start,ingredient_key', ignoreDuplicates: true })
        note(error)
        break
      }
      case 'skip': {
        const { error } = await supabase.from('meal_grocery_lines')
          .upsert(lineRow(step.item, true), { onConflict: 'list_id,week_start,ingredient_key', ignoreDuplicates: true })
        note(error)
        break
      }
      case 'drop': {
        if (step.checkOffItemId) {
          const { error } = await supabase.from('list_items')
            .update({ completed: true, completed_at: new Date().toISOString() })
            .eq('id', step.checkOffItemId).eq('completed', false)
          note(error)
        }
        const { error } = await supabase.from('meal_grocery_lines').delete().eq('id', step.line.id)
        note(error)
        break
      }
      case 'update': {
        if (step.rewriteItemId) {
          // Only while the words are still the ones Symphony wrote.
          const { error } = await supabase.from('list_items')
            .update({ text: step.item.text })
            .eq('id', step.rewriteItemId).eq('text', step.line.text).eq('completed', false)
          note(error)
        }
        const { error } = await supabase.from('meal_grocery_lines')
          .update({ text: step.item.text, recipe_ids: step.item.fromRecipeIds })
          .eq('id', step.line.id)
        note(error)
        break
      }
    }
  }
  return firstError
}

/**
 * The week's ingredients against the Groceries list. `ready` says the plan and
 * the recipe library have both finished loading; until then nothing is synced.
 */
export function useGroceryStatus(plan: MealPlan | null, recipes: Recipe[], ready = true): UseGroceryStatusResult {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [groceriesListId, setGroceriesListId] = useState<string | null>(null)
  const [openItems, setOpenItems] = useState<GroceryListItem[]>([])
  const [lines, setLines] = useState<MealGroceryLine[] | null>(null)
  const [stores, setStores] = useState<{ id: string; title: string }[]>([])

  const weekStart = plan ? toIsoDate(plan.weekStart) : null

  const consolidated = useMemo(() => {
    if (!plan) return []
    // Hidden days keep their entries in the DB, but they must not feed the
    // shopping list — filter to the plan's active range first.
    const { firstDay, lastDay } = activeDayRange(plan.weekStart, plan.startsOn, plan.endsOn)
    const activePlan = {
      ...plan,
      entries: plan.entries.filter(e => e.dayOfWeek >= firstDay && e.dayOfWeek <= lastDay),
    }
    return consolidateIngredients(activePlan, recipes)
  }, [plan, recipes])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data: list, error: listErr } = await supabase
      .from('lists')
      .select('id')
      .eq('external_source', 'apple_reminders')
      .eq('external_id', APPLE_REMINDERS_LIST_NAME)
      .maybeSingle()
    if (listErr) { setError(listErr.message); setLoading(false); return }
    if (!list) { setGroceriesListId(null); setOpenItems([]); setLines(null); setLoading(false); return }

    setGroceriesListId(list.id)
    // Only items still to buy: the list keeps every checked-off item from past
    // trips, and those must not hide this week's ingredients.
    if (weekStart) {
      const week = await loadWeek(list.id, weekStart)
      if (week.error) { setError(week.error); setLoading(false); return }
      setOpenItems(week.items)
      setLines(week.lines)
    } else {
      const { data: items, error: itemsErr } = await supabase
        .from('list_items').select('id,text,completed').eq('list_id', list.id).eq('completed', false)
      if (itemsErr) { setError(itemsErr.message); setLoading(false); return }
      setOpenItems(((items ?? []) as GroceryListItem[]).map(i => ({ id: i.id, text: i.text, completed: false })))
      setLines(null)
    }

    const { data: storeRows } = await supabase
      .from('lists').select('id,title')
      .eq('external_source', 'apple_reminders')
      .order('title', { ascending: true })
    setStores((storeRows ?? []) as { id: string; title: string }[])

    setLoading(false)
  }, [weekStart])

  const missingItems = useMemo(() => {
    const openTexts = openItems.map(i => i.text)
    return consolidated.filter(c => !alreadyListed(c, openTexts))
  }, [consolidated, openItems])

  const stockedPercent = useMemo(() => {
    if (consolidated.length === 0) return 100
    const stocked = consolidated.length - missingItems.length
    return Math.round((stocked / consolidated.length) * 100)
  }, [consolidated, missingItems])

  useEffect(() => { refresh() }, [refresh])

  const context = useCallback(async (): Promise<ApplyContext | null> => {
    if (!groceriesListId || !weekStart) return null
    const { data } = await getAuthUser()
    return data.user ? { listId: groceriesListId, weekStart, userId: data.user.id } : null
  }, [groceriesListId, weekStart])

  const build = useCallback(async (chosen: ConsolidatedIngredient[]) => {
    const ctx = await context()
    if (!ctx) return 'not authenticated'
    const err = await applySteps(buildSteps(consolidated, chosen, lines ?? [], openItems), ctx)
    await refresh()
    return err
  }, [context, consolidated, lines, openItems, refresh])

  // Keep a built week's list in step with its meals. The same steps are never
  // tried twice in a row, so a failing write can't loop.
  const lastTried = useRef<string | null>(null)
  const syncing = useRef(false)
  const pending = useMemo(() => {
    if (!ready || loading || !plan || !lines || lines.length === 0) return []
    if (!recipesResolved(plan, recipes)) return []
    return syncSteps(consolidated, lines, openItems)
  }, [ready, loading, plan, recipes, lines, consolidated, openItems])

  useEffect(() => {
    if (pending.length === 0) return
    const signature = JSON.stringify(pending)
    if (signature === lastTried.current) return
    const timer = setTimeout(async () => {
      if (syncing.current) return
      syncing.current = true
      lastTried.current = signature
      try {
        const ctx = await context()
        if (!ctx) return
        // Decide from the list as it is now, not as this page last saw it:
        // an item may have been bought or edited in Reminders since.
        const week = await loadWeek(ctx.listId, ctx.weekStart)
        if (!week.error && week.lines) {
          const err = await applySteps(syncSteps(consolidated, week.lines, week.items), ctx)
          if (err) setError(err)
        }
        await refresh()
      } finally {
        syncing.current = false
      }
    }, SYNC_DELAY_MS)
    return () => clearTimeout(timer)
  }, [pending, context, refresh, consolidated])

  return { loading, error, stockedPercent, missingItems, consolidated, groceriesListId, stores, refresh, build }
}
