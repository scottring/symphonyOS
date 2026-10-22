import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { listChoicesForGoal, loadChoice, createChoice, type ChoiceRow, type ChoiceDetail } from '@/lib/choices/db'
import type { Choice, GoalRef } from '@/types/choice'

import { CHOICES_UPDATED } from '@/lib/choices/events'

export { CHOICES_UPDATED }

function useRefetchEvents(refetch: () => Promise<void>) {
  useEffect(() => {
    const handler = () => { void refetch() }
    window.addEventListener(CHOICES_UPDATED, handler)
    window.addEventListener('symphony-plan-updated', handler)
    return () => {
      window.removeEventListener(CHOICES_UPDATED, handler)
      window.removeEventListener('symphony-plan-updated', handler)
    }
  }, [refetch])
}

export function useGoalChoices(goal: GoalRef | null) {
  const { user } = useAuth()
  const [rows, setRows] = useState<ChoiceRow[]>([])
  const [loading, setLoading] = useState(true)
  const goalKind = goal?.kind
  const goalId = goal?.id

  const refetch = useCallback(async () => {
    if (!user || !goalKind || !goalId) { setRows([]); setLoading(false); return }
    const next = await listChoicesForGoal(supabase, { kind: goalKind, id: goalId })
    if (next) setRows(next) // a failed read keeps the rows already shown
    setLoading(false)
  }, [user, goalKind, goalId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / goal change
    void refetch()
  }, [refetch])
  useRefetchEvents(refetch)

  const create = useCallback(async (title: string): Promise<Choice | null> => {
    if (!user || !goalKind || !goalId) return null
    const c = await createChoice(supabase, user.id, { kind: goalKind, id: goalId }, title)
    if (c) window.dispatchEvent(new Event(CHOICES_UPDATED))
    return c
  }, [user, goalKind, goalId])

  return { rows, loading, refetch, create }
}

export function useChoice(id: string | undefined) {
  const { user } = useAuth()
  const [detail, setDetail] = useState<ChoiceDetail | null>(null)
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    if (!user || !id) { setDetail(null); setLoading(false); return }
    const next = await loadChoice(supabase, id)
    setDetail((prev) => next ?? (prev?.choice.id === id ? prev : null)) // a failed refetch keeps the current detail
    setLoading(false)
  }, [user, id])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / id change
    void refetch()
  }, [refetch])
  useRefetchEvents(refetch)

  return { detail, loading, refetch }
}
