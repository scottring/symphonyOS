import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Routine, RecurrencePattern, RoutineVisibility, PrepFollowupTemplate } from '@/types/actionable'
import { matchesRecurrenceForDate } from '@/lib/routineUtils'

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
  context?: 'work' | 'family' | 'personal'
  // Fallback assignee if assigned_to is undefined (not null)
  defaultFallbackAssignee?: string
}

export interface UpdateRoutineInput {
  name?: string
  description?: string | null
  recurrence_pattern?: RecurrencePattern
  time_of_day?: string | null
  visibility?: RoutineVisibility
  paused_until?: string | null
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

      const routines = (data || []) as Routine[]

      // Auto-resume routines whose pause period has expired
      const now = new Date()
      const routinesToResume = routines.filter(
        r => r.paused_until && new Date(r.paused_until) <= now && r.visibility === 'reference'
      )

      if (routinesToResume.length > 0) {
        // Resume all expired routines
        for (const routine of routinesToResume) {
          await supabase
            .from('routines')
            .update({ visibility: 'active', paused_until: null })
            .eq('id', routine.id)

          // Update local state
          routine.visibility = 'active'
          routine.paused_until = null
        }
      }

      setRoutines(routines)
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
          context: input.context || null,
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
    return activeRoutines.filter(routine => matchesRecurrenceForDate(routine, date))
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
