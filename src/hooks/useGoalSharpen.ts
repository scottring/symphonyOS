import { useCallback, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

export interface GoalSharpenSuggestion {
  suggestion: string
  why: string
}

export interface GoalSharpenState {
  loading: boolean
  suggestion: GoalSharpenSuggestion | null
  error: string | null
}

export interface SharpenTarget {
  id: string
  name: string
  areaName?: string
  context?: string | null
}

const EMPTY: GoalSharpenState = { loading: false, suggestion: null, error: null }

/**
 * On-demand goal "sharpen" — calls the sharpen-goal edge function only when the
 * user taps ✨ (never on render), and holds per-goal state so many rows can each
 * show their own suggestion. Session-cached by goal id + current name so
 * re-opening doesn't re-bill, while editing the goal re-fetches. Mirrors
 * useNoteSuggestion's cache/dedup discipline. AI proposes; the caller writes only
 * on "Use this".
 */
export function useGoalSharpen() {
  const [byGoal, setByGoal] = useState<Record<string, GoalSharpenState>>({})
  const cache = useRef<Map<string, GoalSharpenSuggestion>>(new Map())

  const set = useCallback((id: string, next: GoalSharpenState) => {
    setByGoal((s) => ({ ...s, [id]: next }))
  }, [])

  const sharpen = useCallback(async (goal: SharpenTarget) => {
    const key = `${goal.id}:${goal.name.trim()}`
    const cached = cache.current.get(key)
    if (cached) {
      set(goal.id, { loading: false, suggestion: cached, error: null })
      return
    }
    set(goal.id, { loading: true, suggestion: null, error: null })
    try {
      const { data, error } = await supabase.functions.invoke('sharpen-goal', {
        body: { name: goal.name, areaName: goal.areaName, context: goal.context ?? undefined },
      })
      if (error) throw error
      const result = data as GoalSharpenSuggestion
      if (!result?.suggestion) throw new Error('No suggestion returned')
      cache.current.set(key, result)
      set(goal.id, { loading: false, suggestion: result, error: null })
    } catch (e) {
      set(goal.id, { loading: false, suggestion: null, error: e instanceof Error ? e.message : 'Sharpen failed' })
    }
  }, [set])

  const dismiss = useCallback((goalId: string) => {
    setByGoal((s) => {
      const next = { ...s }
      delete next[goalId]
      return next
    })
  }, [])

  const stateFor = useCallback((goalId: string): GoalSharpenState => byGoal[goalId] ?? EMPTY, [byGoal])

  return { sharpen, dismiss, stateFor }
}
