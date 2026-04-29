import { useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { TrackingState, MealSlot } from '@/types/meal-planner'

interface SwapInput {
  title: string
  grams?: string
}

interface AddAdHocInput {
  mealPlanId: string
  dayOfWeek: number
  slot: MealSlot
  title: string
  grams?: string
}

export function useMealTracking(onChange: () => void | Promise<void>) {
  const setTrackingState = useCallback(async (entryId: string, state: TrackingState) => {
    const { error } = await supabase
      .from('meal_plan_entries')
      .update({ tracking_state: state, tracking_updated_at: new Date().toISOString() })
      .eq('id', entryId)
    if (error) throw error
    await onChange()
  }, [onChange])

  const swapEntry = useCallback(async (entryId: string, input: SwapInput) => {
    const { error } = await supabase
      .from('meal_plan_entries')
      .update({
        tracking_state: 'swapped',
        swap_title: input.title,
        swap_grams: input.grams ?? null,
        tracking_updated_at: new Date().toISOString(),
      })
      .eq('id', entryId)
    if (error) throw error
    await onChange()
  }, [onChange])

  const skipEntry = useCallback(async (entryId: string) => {
    const { error } = await supabase
      .from('meal_plan_entries')
      .update({
        tracking_state: 'skipped',
        tracking_updated_at: new Date().toISOString(),
      })
      .eq('id', entryId)
    if (error) throw error
    await onChange()
  }, [onChange])

  const confirmAsPlanned = useCallback(async (entryId: string) => {
    const { error } = await supabase
      .from('meal_plan_entries')
      .update({
        tracking_state: 'as_planned',
        swap_title: null,
        swap_grams: null,
        tracking_updated_at: new Date().toISOString(),
      })
      .eq('id', entryId)
    if (error) throw error
    await onChange()
  }, [onChange])

  const addAdHoc = useCallback(async (input: AddAdHocInput) => {
    const { error } = await supabase
      .from('meal_plan_entries')
      .insert({
        meal_plan_id: input.mealPlanId,
        day_of_week: input.dayOfWeek,
        slot: input.slot,
        ad_hoc_title: input.title,
        actual_grams: input.grams ?? null,
        tracking_state: 'added',
        tracking_updated_at: new Date().toISOString(),
      })
    if (error) throw error
    await onChange()
  }, [onChange])

  return { setTrackingState, swapEntry, skipEntry, confirmAsPlanned, addAdHoc }
}
