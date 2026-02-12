// useCheckin — weekly coherence check-in state + submit
// Ported from Relish, adapted for Supabase

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { CoherenceCheckin, CheckinResponse, DriftSignal } from '@/types/checkin'

function getCurrentISOWeek(): string {
  const now = new Date()
  const jan4 = new Date(now.getFullYear(), 0, 4)
  const daysSinceJan4 = Math.floor((now.getTime() - jan4.getTime()) / 86400000)
  const weekNum = Math.ceil((daysSinceJan4 + jan4.getDay() + 1) / 7)
  return `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
}

interface UseCheckinReturn {
  currentCheckin: CoherenceCheckin | null
  recentCheckins: CoherenceCheckin[]
  recentDriftSignals: DriftSignal[]
  loading: boolean
  error: string | null
  currentWeek: string
  hasCheckedInThisWeek: boolean
  submitCheckin: (responses: Record<string, CheckinResponse>) => Promise<string>
  generateObservations: (checkinId: string) => Promise<{ observations: unknown[]; driftSignals: unknown[] }>
  acknowledgeDriftSignal: (checkinId: string, signalId: string) => Promise<void>
}

export function useCheckin(householdId: string | null): UseCheckinReturn {
  const [recentCheckins, setRecentCheckins] = useState<CoherenceCheckin[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const currentWeek = getCurrentISOWeek()

  useEffect(() => {
    if (!householdId) {
      setRecentCheckins([])
      setLoading(false)
      return
    }

    let cancelled = false

    async function fetchCheckins() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || cancelled) return

      const { data, error: fetchError } = await supabase
        .from('checkins')
        .select('*')
        .eq('household_id', householdId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(12)

      if (cancelled) return

      if (fetchError) {
        console.error('Error fetching checkins:', fetchError)
        setError(fetchError.message)
      } else {
        setRecentCheckins(data || [])
      }
      setLoading(false)
    }

    fetchCheckins()

    return () => {
      cancelled = true
    }
  }, [householdId])

  const currentCheckin = recentCheckins.find(c => c.week === currentWeek) || null
  const hasCheckedInThisWeek = !!currentCheckin

  // Collect unacknowledged drift signals from recent check-ins (up to 3)
  const recentDriftSignals: DriftSignal[] = recentCheckins
    .flatMap(c => c.drift_signals ?? [])
    .filter(ds => !ds.acknowledged)
    .slice(0, 3)

  const submitCheckin = useCallback(async (
    responses: Record<string, CheckinResponse>
  ): Promise<string> => {
    if (!householdId) throw new Error('No household')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('No user')

    const { data: newCheckin, error: createError } = await supabase
      .from('checkins')
      .insert({
        household_id: householdId,
        user_id: user.id,
        week: currentWeek,
        responses,
        system_observations: [],
        drift_signals: [],
      })
      .select('id')
      .single()

    if (createError) throw createError

    // Refetch to update local state
    const { data: updatedCheckins } = await supabase
      .from('checkins')
      .select('*')
      .eq('household_id', householdId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(12)

    if (updatedCheckins) {
      setRecentCheckins(updatedCheckins)
    }

    return newCheckin.id
  }, [householdId, currentWeek])

  const generateObservations = useCallback(async (checkinId: string) => {
    if (!householdId) throw new Error('No household')

    const { data, error: fnError } = await supabase.functions.invoke('generate-coherence-observations', {
      body: { checkinId, householdId },
    })

    if (fnError) throw new Error(fnError.message || 'Failed to generate observations')

    // Refetch check-ins to get updated data
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: updatedCheckins } = await supabase
        .from('checkins')
        .select('*')
        .eq('household_id', householdId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(12)

      if (updatedCheckins) setRecentCheckins(updatedCheckins)
    }

    return data as { observations: unknown[]; driftSignals: unknown[] }
  }, [householdId])

  const acknowledgeDriftSignal = useCallback(async (checkinId: string, signalId: string) => {
    // Read current drift_signals, update the one matching signalId
    const { data: checkin, error: readError } = await supabase
      .from('checkins')
      .select('drift_signals')
      .eq('id', checkinId)
      .single()

    if (readError || !checkin) throw readError || new Error('Check-in not found')

    const updatedSignals = (checkin.drift_signals || []).map((ds: DriftSignal) =>
      ds.id === signalId ? { ...ds, acknowledged: true } : ds
    )

    const { error: updateError } = await supabase
      .from('checkins')
      .update({ drift_signals: updatedSignals })
      .eq('id', checkinId)

    if (updateError) throw updateError

    // Update local state
    setRecentCheckins(prev => prev.map(c =>
      c.id === checkinId ? { ...c, drift_signals: updatedSignals } : c
    ))
  }, [])

  return {
    currentCheckin,
    recentCheckins,
    recentDriftSignals,
    loading,
    error,
    currentWeek,
    hasCheckedInThisWeek,
    submitCheckin,
    generateObservations,
    acknowledgeDriftSignal,
  }
}
