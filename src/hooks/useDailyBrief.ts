import { useState, useCallback, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { DailyBrief, DbDailyBrief, DailyBriefItem, DailyBriefActionType } from '@/types/action'
import { dbDailyBriefToDailyBrief } from '@/types/action'

interface UseDailyBriefReturn {
  brief: DailyBrief | null
  isLoading: boolean
  isGenerating: boolean
  error: string | null
  fetchBrief: () => Promise<void>
  generateBrief: (force?: boolean) => Promise<void>
  markViewed: () => Promise<void>
  dismissBrief: () => Promise<void>
  handleItemAction: (item: DailyBriefItem, action: DailyBriefActionType) => Promise<void>
}

export function useDailyBrief(
  onTaskAction?: (taskId: string, action: DailyBriefActionType) => void
): UseDailyBriefReturn {
  const [brief, setBrief] = useState<DailyBrief | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Fetch today's brief from the database
   */
  const fetchBrief = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const today = new Date().toISOString().split('T')[0]

      const { data, error: queryError } = await supabase
        .from('daily_briefs')
        .select('*')
        .eq('brief_date', today)
        .single()

      if (queryError && queryError.code !== 'PGRST116') {
        // PGRST116 = no rows returned, which is fine
        throw queryError
      }

      if (data) {
        setBrief(dbDailyBriefToDailyBrief(data as DbDailyBrief))
      } else {
        setBrief(null)
      }
    } catch (err) {
      console.error('Fetch brief error:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch brief')
    } finally {
      setIsLoading(false)
    }
  }, [])

  /**
   * Generate a new brief for today
   */
  const generateBrief = useCallback(async (force: boolean = false) => {
    setIsGenerating(true)
    setError(null)

    try {
      const { data, error: fnError } = await supabase.functions.invoke('generate-daily-brief', {
        body: { force }
      })

      if (fnError) {
        throw fnError
      }

      if (data) {
        setBrief(dbDailyBriefToDailyBrief(data as DbDailyBrief))
      }
    } catch (err) {
      console.error('Generate brief error:', err)
      setError(err instanceof Error ? err.message : 'Failed to generate brief')
    } finally {
      setIsGenerating(false)
    }
  }, [])

  /**
   * Mark the brief as viewed
   */
  const markViewed = useCallback(async () => {
    if (!brief) return

    try {
      const { error: updateError } = await supabase
        .from('daily_briefs')
        .update({ viewed_at: new Date().toISOString() })
        .eq('id', brief.id)

      if (updateError) {
        throw updateError
      }

      setBrief(prev => prev ? { ...prev, viewedAt: new Date() } : null)
    } catch (err) {
      console.error('Mark viewed error:', err)
    }
  }, [brief])

  /**
   * Dismiss the brief
   */
  const dismissBrief = useCallback(async () => {
    if (!brief) return

    try {
      const { error: updateError } = await supabase
        .from('daily_briefs')
        .update({ dismissed_at: new Date().toISOString() })
        .eq('id', brief.id)

      if (updateError) {
        throw updateError
      }

      setBrief(prev => prev ? { ...prev, dismissedAt: new Date() } : null)
    } catch (err) {
      console.error('Dismiss brief error:', err)
    }
  }, [brief])

  /**
   * Handle an action on a brief item
   */
  const handleItemAction = useCallback(async (
    item: DailyBriefItem,
    action: DailyBriefActionType
  ) => {
    // If it's a task-related item and we have a handler, delegate to it
    if (item.relatedEntityType === 'task' && item.relatedEntityId && onTaskAction) {
      onTaskAction(item.relatedEntityId, action)
      return
    }

    // Handle other actions here as needed
    console.log('Brief item action:', { item, action })
  }, [onTaskAction])

  // Fetch brief on mount, auto-generate if none exists
  useEffect(() => {
    let mounted = true

    const initBrief = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const today = new Date().toISOString().split('T')[0]

        const { data, error: queryError } = await supabase
          .from('daily_briefs')
          .select('*')
          .eq('brief_date', today)
          .single()

        if (queryError && queryError.code !== 'PGRST116') {
          throw queryError
        }

        if (data) {
          if (mounted) {
            setBrief(dbDailyBriefToDailyBrief(data as DbDailyBrief))
            setIsLoading(false)
          }
        } else {
          // No brief exists for today - auto-generate
          if (mounted) {
            setIsLoading(false)
            setIsGenerating(true)
          }

          const { data: newBrief, error: fnError } = await supabase.functions.invoke('generate-daily-brief')

          if (fnError) {
            throw fnError
          }

          if (mounted && newBrief) {
            setBrief(dbDailyBriefToDailyBrief(newBrief as DbDailyBrief))
          }
        }
      } catch (err) {
        console.error('Init brief error:', err)
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load brief')
        }
      } finally {
        if (mounted) {
          setIsLoading(false)
          setIsGenerating(false)
        }
      }
    }

    initBrief()

    return () => {
      mounted = false
    }
  }, [])

  return {
    brief,
    isLoading,
    isGenerating,
    error,
    fetchBrief,
    generateBrief,
    markViewed,
    dismissBrief,
    handleItemAction,
  }
}
