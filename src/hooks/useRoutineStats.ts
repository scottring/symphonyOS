import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

export interface RoutineStat {
  routineId: string
  currentStreak: number
  longestStreak: number
  /** Completion rate over last 30 days (0-1) */
  adherence: number
  /** Total completions in last 30 days */
  completedLast30: number
  /** Total expected instances in last 30 days */
  expectedLast30: number
  lastCompletedDate: string | null
}

/**
 * Computes per-routine streaks and adherence rates from actionable_instances.
 * Only fetches data once on mount, then caches.
 */
export function useRoutineStats() {
  const { user } = useAuth()
  const [stats, setStats] = useState<Map<string, RoutineStat>>(new Map())
  const [loading, setLoading] = useState(true)

  const fetchStats = useCallback(async () => {
    if (!user) return

    // Fetch last 90 days of routine instances for streak calculation
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const { data, error } = await supabase
      .from('actionable_instances')
      .select('entity_id, date, status')
      .eq('user_id', user.id)
      .eq('entity_type', 'routine')
      .gte('date', ninetyDaysAgo.toISOString().split('T')[0])
      .order('date', { ascending: false })

    if (error || !data) {
      setLoading(false)
      return
    }

    // Group instances by routine
    const byRoutine = new Map<string, { date: string; status: string }[]>()
    for (const row of data) {
      const list = byRoutine.get(row.entity_id) || []
      list.push({ date: row.date, status: row.status })
      byRoutine.set(row.entity_id, list)
    }

    const _today = new Date().toISOString().split('T')[0]
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0]

    const newStats = new Map<string, RoutineStat>()

    for (const [routineId, instances] of byRoutine) {
      // Sort by date descending (most recent first)
      instances.sort((a, b) => b.date.localeCompare(a.date))

      // Current streak: consecutive completed days from today backwards
      let currentStreak = 0
      for (const inst of instances) {
        if (inst.status === 'completed') {
          currentStreak++
        } else if (inst.status === 'skipped') {
          // Skipped breaks the streak
          break
        } else {
          break
        }
      }

      // Longest streak in the data
      let longestStreak = 0
      let tempStreak = 0
      // Process chronologically for longest streak
      const chronological = [...instances].reverse()
      for (const inst of chronological) {
        if (inst.status === 'completed') {
          tempStreak++
          longestStreak = Math.max(longestStreak, tempStreak)
        } else {
          tempStreak = 0
        }
      }

      // Adherence: last 30 days
      const recent = instances.filter(i => i.date >= thirtyDaysAgoStr)
      const completedLast30 = recent.filter(i => i.status === 'completed').length
      const expectedLast30 = recent.length // All instances (completed, skipped, pending)
      const adherence = expectedLast30 > 0 ? completedLast30 / expectedLast30 : 0

      const lastCompleted = instances.find(i => i.status === 'completed')

      newStats.set(routineId, {
        routineId,
        currentStreak,
        longestStreak,
        adherence,
        completedLast30,
        expectedLast30,
        lastCompletedDate: lastCompleted?.date ?? null,
      })
    }

    setStats(newStats)
    setLoading(false)
  }, [user])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  const getStats = useCallback(
    (routineId: string): RoutineStat | undefined => stats.get(routineId),
    [stats]
  )

  return { stats, loading, getStats, refetch: fetchStats }
}
