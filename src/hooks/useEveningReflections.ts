import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { EveningReflectionData } from '@/types/coaching'

export function useEveningReflections() {
  const [todayReflection, setTodayReflection] = useState<EveningReflectionData | null>(null)

  // Fetch today's reflection on mount
  useEffect(() => {
    async function fetchToday() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const today = new Date().toISOString().split('T')[0]
      const { data, error } = await supabase
        .from('evening_reflections')
        .select('id, date, highlight, notes')
        .eq('user_id', user.id)
        .eq('date', today)
        .maybeSingle()

      if (error) {
        console.error('fetchTodayReflection:', error)
        return
      }

      if (data) {
        setTodayReflection(data as EveningReflectionData)
      }
    }

    fetchToday()
  }, [])

  // Upsert reflection for today
  const saveReflection = useCallback(async (reflection: { highlight: string; notes: string }) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const today = new Date().toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('evening_reflections')
      .upsert(
        {
          user_id: user.id,
          date: today,
          highlight: reflection.highlight || null,
          notes: reflection.notes || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,date' }
      )
      .select('id, date, highlight, notes')
      .single()

    if (error) {
      console.error('saveReflection:', error)
      return
    }

    if (data) {
      setTodayReflection(data as EveningReflectionData)
    }
  }, [])

  // Fetch reflection for a specific date
  const fetchForDate = useCallback(async (dateStr: string): Promise<EveningReflectionData | null> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await supabase
      .from('evening_reflections')
      .select('id, date, highlight, notes')
      .eq('user_id', user.id)
      .eq('date', dateStr)
      .maybeSingle()

    if (error) {
      console.error('fetchForDate:', error)
      return null
    }

    return data as EveningReflectionData | null
  }, [])

  return {
    todayReflection,
    saveReflection,
    fetchForDate,
  }
}
