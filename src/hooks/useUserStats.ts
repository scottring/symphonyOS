import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'

/**
 * Achievement definition
 */
export interface Achievement {
  id: string
  name: string
  description: string
  emoji: string
  unlockedAt?: string
}

/**
 * User stats from the database
 */
export interface UserStats {
  id: string
  userId: string
  inboxZeroStreak: number
  lastInboxZeroDate: string | null
  longestInboxZeroStreak: number
  weeklyReviewStreak: number
  lastWeeklyReviewDate: string | null
  longestWeeklyReviewStreak: number
  totalTasksProcessed: number
  totalTasksCompleted: number
  achievements: Achievement[]
  createdAt: string
  updatedAt: string
}

/**
 * Health snapshot for trend tracking
 */
export interface HealthSnapshot {
  id: string
  userId: string
  snapshotDate: string
  healthScore: number
  inboxCount: number
  scheduledCount: number
  deferredCount: number
  somedayCount: number
  agingCount: number
  staleCount: number
  inboxZeroAchieved: boolean
  createdAt: string
}

// All possible achievements
export const ACHIEVEMENTS: Record<string, Omit<Achievement, 'unlockedAt'>> = {
  quick_processor: {
    id: 'quick_processor',
    name: 'Quick Processor',
    description: 'Triaged 10 items within 24 hours',
    emoji: '⚡',
  },
  inbox_zero: {
    id: 'inbox_zero',
    name: 'Inbox Zero',
    description: 'Achieved an empty inbox',
    emoji: '🎯',
  },
  hot_streak: {
    id: 'hot_streak',
    name: 'Hot Streak',
    description: 'Inbox zero for 7 consecutive days',
    emoji: '🔥',
  },
  system_master: {
    id: 'system_master',
    name: 'System Master',
    description: 'Inbox zero for 30 consecutive days',
    emoji: '🌟',
  },
  weekly_warrior: {
    id: 'weekly_warrior',
    name: 'Weekly Warrior',
    description: 'Completed 4 weekly reviews',
    emoji: '📋',
  },
  clean_slate: {
    id: 'clean_slate',
    name: 'Clean Slate',
    description: 'Completed 12 weekly reviews',
    emoji: '🏆',
  },
}

interface UseUserStatsResult {
  stats: UserStats | null
  loading: boolean
  error: string | null
  /** Record an inbox zero achievement for today */
  recordInboxZero: () => Promise<void>
  /** Record completion of weekly review */
  recordWeeklyReview: () => Promise<void>
  /** Increment tasks processed count */
  incrementTasksProcessed: (count?: number) => Promise<void>
  /** Increment tasks completed count */
  incrementTasksCompleted: (count?: number) => Promise<void>
  /** Save a health snapshot for the current day */
  saveHealthSnapshot: (snapshot: Omit<HealthSnapshot, 'id' | 'userId' | 'createdAt'>) => Promise<void>
  /** Get recent health snapshots for trend analysis */
  getRecentSnapshots: (days?: number) => Promise<HealthSnapshot[]>
  /** Refetch stats from database */
  refetch: () => Promise<void>
}

export function useUserStats(): UseUserStatsResult {
  const { user } = useAuth()
  const [stats, setStats] = useState<UserStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch user stats
  const fetchStats = useCallback(async () => {
    if (!user?.id) {
      setStats(null)
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)

      // Call the get_or_create function
      const { data, error: fetchError } = await supabase
        .rpc('get_or_create_user_stats', { p_user_id: user.id })

      if (fetchError) throw fetchError

      if (data) {
        setStats(transformDbStats(data))
      }
    } catch (err) {
      console.error('Error fetching user stats:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch stats')
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  // Initial fetch
  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  // Record inbox zero for today
  const recordInboxZero = useCallback(async () => {
    if (!user?.id || !stats) return

    const today = new Date().toISOString().split('T')[0]
    const lastDate = stats.lastInboxZeroDate

    // Check if we already recorded today
    if (lastDate === today) return

    // Calculate new streak
    let newStreak = 1
    if (lastDate) {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const yesterdayStr = yesterday.toISOString().split('T')[0]

      if (lastDate === yesterdayStr) {
        // Continuing streak
        newStreak = stats.inboxZeroStreak + 1
      }
    }

    // Update database
    const { error: updateError } = await supabase
      .from('user_stats')
      .update({
        inbox_zero_streak: newStreak,
        last_inbox_zero_date: today,
        longest_inbox_zero_streak: Math.max(stats.longestInboxZeroStreak, newStreak),
      })
      .eq('user_id', user.id)

    if (updateError) {
      console.error('Error recording inbox zero:', updateError)
      return
    }

    // Check for achievements
    const newAchievements = [...stats.achievements]
    const now = new Date().toISOString()

    // First inbox zero
    if (!newAchievements.find(a => a.id === 'inbox_zero')) {
      newAchievements.push({ ...ACHIEVEMENTS.inbox_zero, unlockedAt: now })
    }

    // Hot streak (7 days)
    if (newStreak >= 7 && !newAchievements.find(a => a.id === 'hot_streak')) {
      newAchievements.push({ ...ACHIEVEMENTS.hot_streak, unlockedAt: now })
    }

    // System master (30 days)
    if (newStreak >= 30 && !newAchievements.find(a => a.id === 'system_master')) {
      newAchievements.push({ ...ACHIEVEMENTS.system_master, unlockedAt: now })
    }

    // Update achievements if new ones were added
    if (newAchievements.length > stats.achievements.length) {
      await supabase
        .from('user_stats')
        .update({ achievements: newAchievements })
        .eq('user_id', user.id)
    }

    // Update local state
    setStats(prev => prev ? {
      ...prev,
      inboxZeroStreak: newStreak,
      lastInboxZeroDate: today,
      longestInboxZeroStreak: Math.max(prev.longestInboxZeroStreak, newStreak),
      achievements: newAchievements,
    } : null)
  }, [user?.id, stats])

  // Record weekly review completion
  const recordWeeklyReview = useCallback(async () => {
    if (!user?.id || !stats) return

    const today = new Date().toISOString().split('T')[0]
    const lastDate = stats.lastWeeklyReviewDate

    // Check if we already recorded this week
    if (lastDate) {
      const lastReviewDate = new Date(lastDate)
      const daysSince = Math.floor((Date.now() - lastReviewDate.getTime()) / (1000 * 60 * 60 * 24))
      if (daysSince < 5) return // Too soon for another weekly review
    }

    // Calculate new streak
    let newStreak = 1
    if (lastDate) {
      const lastReviewDate = new Date(lastDate)
      const daysSince = Math.floor((Date.now() - lastReviewDate.getTime()) / (1000 * 60 * 60 * 24))

      if (daysSince <= 10) {
        // Within expected window for weekly review
        newStreak = stats.weeklyReviewStreak + 1
      }
    }

    // Update database
    const { error: updateError } = await supabase
      .from('user_stats')
      .update({
        weekly_review_streak: newStreak,
        last_weekly_review_date: today,
        longest_weekly_review_streak: Math.max(stats.longestWeeklyReviewStreak, newStreak),
      })
      .eq('user_id', user.id)

    if (updateError) {
      console.error('Error recording weekly review:', updateError)
      return
    }

    // Check for achievements
    const newAchievements = [...stats.achievements]
    const now = new Date().toISOString()

    // Weekly warrior (4 reviews)
    if (newStreak >= 4 && !newAchievements.find(a => a.id === 'weekly_warrior')) {
      newAchievements.push({ ...ACHIEVEMENTS.weekly_warrior, unlockedAt: now })
    }

    // Clean slate (12 reviews)
    if (newStreak >= 12 && !newAchievements.find(a => a.id === 'clean_slate')) {
      newAchievements.push({ ...ACHIEVEMENTS.clean_slate, unlockedAt: now })
    }

    // Update achievements if new ones were added
    if (newAchievements.length > stats.achievements.length) {
      await supabase
        .from('user_stats')
        .update({ achievements: newAchievements })
        .eq('user_id', user.id)
    }

    // Update local state
    setStats(prev => prev ? {
      ...prev,
      weeklyReviewStreak: newStreak,
      lastWeeklyReviewDate: today,
      longestWeeklyReviewStreak: Math.max(prev.longestWeeklyReviewStreak, newStreak),
      achievements: newAchievements,
    } : null)
  }, [user?.id, stats])

  // Increment tasks processed
  const incrementTasksProcessed = useCallback(async (count = 1) => {
    if (!user?.id || !stats) return

    const newTotal = stats.totalTasksProcessed + count

    await supabase
      .from('user_stats')
      .update({ total_tasks_processed: newTotal })
      .eq('user_id', user.id)

    setStats(prev => prev ? {
      ...prev,
      totalTasksProcessed: newTotal,
    } : null)
  }, [user?.id, stats])

  // Increment tasks completed
  const incrementTasksCompleted = useCallback(async (count = 1) => {
    if (!user?.id || !stats) return

    const newTotal = stats.totalTasksCompleted + count

    await supabase
      .from('user_stats')
      .update({ total_tasks_completed: newTotal })
      .eq('user_id', user.id)

    setStats(prev => prev ? {
      ...prev,
      totalTasksCompleted: newTotal,
    } : null)
  }, [user?.id, stats])

  // Save health snapshot
  const saveHealthSnapshot = useCallback(async (
    snapshot: Omit<HealthSnapshot, 'id' | 'userId' | 'createdAt'>
  ) => {
    if (!user?.id) return

    const { error: upsertError } = await supabase
      .from('health_snapshots')
      .upsert({
        user_id: user.id,
        snapshot_date: snapshot.snapshotDate,
        health_score: snapshot.healthScore,
        inbox_count: snapshot.inboxCount,
        scheduled_count: snapshot.scheduledCount,
        deferred_count: snapshot.deferredCount,
        someday_count: snapshot.somedayCount,
        aging_count: snapshot.agingCount,
        stale_count: snapshot.staleCount,
        inbox_zero_achieved: snapshot.inboxZeroAchieved,
      }, {
        onConflict: 'user_id,snapshot_date',
      })

    if (upsertError) {
      console.error('Error saving health snapshot:', upsertError)
    }
  }, [user?.id])

  // Get recent snapshots for trend analysis
  const getRecentSnapshots = useCallback(async (days = 7): Promise<HealthSnapshot[]> => {
    if (!user?.id) return []

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)
    const startDateStr = startDate.toISOString().split('T')[0]

    const { data, error: fetchError } = await supabase
      .from('health_snapshots')
      .select('*')
      .eq('user_id', user.id)
      .gte('snapshot_date', startDateStr)
      .order('snapshot_date', { ascending: true })

    if (fetchError) {
      console.error('Error fetching health snapshots:', fetchError)
      return []
    }

    return (data || []).map(transformDbSnapshot)
  }, [user?.id])

  return {
    stats,
    loading,
    error,
    recordInboxZero,
    recordWeeklyReview,
    incrementTasksProcessed,
    incrementTasksCompleted,
    saveHealthSnapshot,
    getRecentSnapshots,
    refetch: fetchStats,
  }
}

// Transform database row to TypeScript interface
function transformDbStats(row: Record<string, unknown>): UserStats {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    inboxZeroStreak: row.inbox_zero_streak as number,
    lastInboxZeroDate: row.last_inbox_zero_date as string | null,
    longestInboxZeroStreak: row.longest_inbox_zero_streak as number,
    weeklyReviewStreak: row.weekly_review_streak as number,
    lastWeeklyReviewDate: row.last_weekly_review_date as string | null,
    longestWeeklyReviewStreak: row.longest_weekly_review_streak as number,
    totalTasksProcessed: row.total_tasks_processed as number,
    totalTasksCompleted: row.total_tasks_completed as number,
    achievements: (row.achievements as Achievement[]) || [],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

function transformDbSnapshot(row: Record<string, unknown>): HealthSnapshot {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    snapshotDate: row.snapshot_date as string,
    healthScore: row.health_score as number,
    inboxCount: row.inbox_count as number,
    scheduledCount: row.scheduled_count as number,
    deferredCount: row.deferred_count as number,
    somedayCount: row.someday_count as number,
    agingCount: row.aging_count as number,
    staleCount: row.stale_count as number,
    inboxZeroAchieved: row.inbox_zero_achieved as boolean,
    createdAt: row.created_at as string,
  }
}
