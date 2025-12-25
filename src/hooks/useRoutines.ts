import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Routine, RecurrencePattern, RoutineVisibility, PrepFollowupTemplate } from '@/types/actionable'

export interface CreateRoutineInput {
  name: string
  description?: string
  recurrence_pattern?: RecurrencePattern
  time_of_day?: string // HH:MM format
  visibility?: RoutineVisibility
  default_assignee?: string | null  // Used for generating recurring instances
  assigned_to?: string | null  // Current assignment (if null, uses defaultFallbackAssignee)
  raw_input?: string | null
  prep_task_templates?: PrepFollowupTemplate[]
  followup_task_templates?: PrepFollowupTemplate[]
  // Fallback assignee if assigned_to is undefined (not null)
  defaultFallbackAssignee?: string
}

export interface UpdateRoutineInput {
  name?: string
  description?: string | null
  recurrence_pattern?: RecurrencePattern
  time_of_day?: string | null
  visibility?: RoutineVisibility
  default_assignee?: string | null
  assigned_to?: string | null
  assigned_to_all?: string[] | null
  context?: 'work' | 'family' | 'personal' | null
  raw_input?: string | null
  show_on_timeline?: boolean
  prep_task_templates?: PrepFollowupTemplate[]
  followup_task_templates?: PrepFollowupTemplate[]
}

export function useRoutines() {
  const [routines, setRoutines] = useState<Routine[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch all routines for the user
  const fetchRoutines = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setRoutines([])
        setLoading(false)
        return
      }

      // RLS policies handle household sharing - no need to filter by user_id
      const { data, error: fetchError } = await supabase
        .from('routines')
        .select('*')
        .order('name', { ascending: true })

      if (fetchError) throw fetchError
      setRoutines((data || []) as Routine[])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch routines'
      setError(message)
      console.error('fetchRoutines error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial fetch
  useEffect(() => {
    fetchRoutines()
  }, [fetchRoutines])

  // Create a new routine
  const addRoutine = useCallback(async (input: CreateRoutineInput): Promise<Routine | null> => {
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Determine effective assigned_to: explicit value takes precedence, then fallback
      const effectiveAssignedTo = input.assigned_to !== undefined
        ? input.assigned_to
        : input.defaultFallbackAssignee ?? null

      const { data, error: insertError } = await supabase
        .from('routines')
        .insert({
          user_id: user.id,
          name: input.name.trim(),
          description: input.description?.trim() || null,
          recurrence_pattern: input.recurrence_pattern || { type: 'daily' },
          time_of_day: input.time_of_day || null,
          visibility: input.visibility || 'active',
          default_assignee: input.default_assignee || null,
          assigned_to: effectiveAssignedTo,
          raw_input: input.raw_input || null,
          prep_task_templates: input.prep_task_templates || [],
          followup_task_templates: input.followup_task_templates || [],
        })
        .select()
        .single()

      if (insertError) throw insertError

      const routine = data as Routine
      setRoutines(prev => [...prev, routine].sort((a, b) => a.name.localeCompare(b.name)))
      return routine
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create routine'
      setError(message)
      console.error('addRoutine error:', err)
      return null
    }
  }, [])

  // Update an existing routine
  const updateRoutine = useCallback(async (id: string, input: UpdateRoutineInput): Promise<boolean> => {
    setError(null)

    try {
      const updates: Record<string, unknown> = {}
      if (input.name !== undefined) updates.name = input.name.trim()
      if (input.description !== undefined) updates.description = input.description?.trim() || null
      if (input.recurrence_pattern !== undefined) updates.recurrence_pattern = input.recurrence_pattern
      if (input.time_of_day !== undefined) updates.time_of_day = input.time_of_day
      if (input.visibility !== undefined) updates.visibility = input.visibility
      if (input.default_assignee !== undefined) updates.default_assignee = input.default_assignee
      if (input.assigned_to !== undefined) updates.assigned_to = input.assigned_to
      if (input.assigned_to_all !== undefined) updates.assigned_to_all = input.assigned_to_all
      if (input.context !== undefined) updates.context = input.context
      if (input.raw_input !== undefined) updates.raw_input = input.raw_input
      if (input.show_on_timeline !== undefined) updates.show_on_timeline = input.show_on_timeline
      if (input.prep_task_templates !== undefined) updates.prep_task_templates = input.prep_task_templates
      if (input.followup_task_templates !== undefined) updates.followup_task_templates = input.followup_task_templates

      const { error: updateError } = await supabase
        .from('routines')
        .update(updates)
        .eq('id', id)

      if (updateError) throw updateError

      setRoutines(prev =>
        prev
          .map(r => (r.id === id ? { ...r, ...updates } as Routine : r))
          .sort((a, b) => a.name.localeCompare(b.name))
      )
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update routine'
      setError(message)
      console.error('updateRoutine error:', err)
      return false
    }
  }, [])

  // Delete a routine
  const deleteRoutine = useCallback(async (id: string): Promise<boolean> => {
    setError(null)

    try {
      const { error: deleteError } = await supabase
        .from('routines')
        .delete()
        .eq('id', id)

      if (deleteError) throw deleteError

      setRoutines(prev => prev.filter(r => r.id !== id))
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete routine'
      setError(message)
      console.error('deleteRoutine error:', err)
      return false
    }
  }, [])

  // Toggle visibility (active <-> reference)
  const toggleVisibility = useCallback(async (id: string): Promise<boolean> => {
    const routine = routines.find(r => r.id === id)
    if (!routine) return false

    const newVisibility: RoutineVisibility = routine.visibility === 'active' ? 'reference' : 'active'
    return updateRoutine(id, { visibility: newVisibility })
  }, [routines, updateRoutine])

  // Get active routines only
  const activeRoutines = routines.filter(r => r.visibility === 'active')

  // Get reference routines only
  const referenceRoutines = routines.filter(r => r.visibility === 'reference')

  // Get routines scheduled for a specific date
  const getRoutinesForDate = useCallback((date: Date): Routine[] => {
    const dayOfWeek = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][date.getDay()]
    const dayOfMonth = date.getDate()
    const month = date.getMonth() + 1 // 1-12
    const dateStr = formatDateString(date)

    return activeRoutines.filter(routine => {
      const pattern = routine.recurrence_pattern

      switch (pattern.type) {
        case 'daily': {
          // Handle interval (e.g., every other day)
          if (pattern.interval && pattern.interval > 1 && pattern.start_date) {
            const startDate = new Date(pattern.start_date)
            const diffTime = date.getTime() - startDate.getTime()
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
            return diffDays >= 0 && diffDays % pattern.interval === 0
          }
          return true
        }
        case 'weekly': {
          // Handle interval (e.g., biweekly)
          if (pattern.interval && pattern.interval > 1 && pattern.start_date) {
            const startDate = new Date(pattern.start_date)
            const diffTime = date.getTime() - startDate.getTime()
            const diffWeeks = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 7))
            if (diffWeeks < 0 || diffWeeks % pattern.interval !== 0) {
              return false
            }
          }
          // Check day of week
          return pattern.days?.includes(dayOfWeek) ?? false
        }
        case 'monthly':
          return pattern.day_of_month === dayOfMonth
        case 'quarterly': {
          // Quarterly: check if we're in a quarter month (Jan, Apr, Jul, Oct by default)
          // and on the right day of month
          const quarterMonths = [1, 4, 7, 10]
          if (!quarterMonths.includes(month)) return false
          // If day_of_month is specified, check it; otherwise, use the 1st
          const targetDay = pattern.day_of_month || 1
          return dayOfMonth === targetDay
        }
        case 'yearly': {
          // Yearly: check month and day
          const targetMonth = pattern.month_of_year || 1
          const targetDay = pattern.day_of_month || 1
          return month === targetMonth && dayOfMonth === targetDay
        }
        case 'specific_days':
          return pattern.dates?.includes(dateStr) ?? false
        default:
          return false
      }
    })
  }, [activeRoutines])

  return {
    routines,
    activeRoutines,
    referenceRoutines,
    loading,
    error,
    addRoutine,
    updateRoutine,
    deleteRoutine,
    toggleVisibility,
    getRoutinesForDate,
    refetch: fetchRoutines,
  }
}

// Helper to format date as YYYY-MM-DD
function formatDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
