import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { consolidateIngredients, type ConsolidatedIngredient } from '@/lib/consolidateIngredients'
import { activeDayRange } from '@/lib/weekHelpers'
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
}

const APPLE_REMINDERS_LIST_NAME = 'Groceries'

export function useGroceryStatus(plan: MealPlan | null, recipes: Recipe[]): UseGroceryStatusResult {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [groceriesListId, setGroceriesListId] = useState<string | null>(null)
  const [currentItems, setCurrentItems] = useState<string[]>([])
  const [stores, setStores] = useState<{ id: string; title: string }[]>([])

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
    if (!list) { setGroceriesListId(null); setCurrentItems([]); setLoading(false); return }

    setGroceriesListId(list.id)
    const { data: items, error: itemsErr } = await supabase
      .from('list_items')
      .select('text')
      .eq('list_id', list.id)
    if (itemsErr) { setError(itemsErr.message); setLoading(false); return }
    setCurrentItems((items ?? []).map((i: any) => i.text.toLowerCase()))

    const { data: storeRows } = await supabase
      .from('lists').select('id,title')
      .eq('external_source', 'apple_reminders')
      .order('title', { ascending: true })
    setStores((storeRows ?? []) as { id: string; title: string }[])

    setLoading(false)
  }, [])

  const missingItems = useMemo(() => {
    return consolidated.filter(c => {
      const key = c.text.toLowerCase()
      return !currentItems.some(it => it.includes(key) || key.includes(it))
    })
  }, [consolidated, currentItems])

  const stockedPercent = useMemo(() => {
    if (consolidated.length === 0) return 100
    const stocked = consolidated.length - missingItems.length
    return Math.round((stocked / consolidated.length) * 100)
  }, [consolidated, missingItems])

  useEffect(() => { refresh() }, [refresh])

  return { loading, error, stockedPercent, missingItems, consolidated, groceriesListId, stores, refresh }
}
