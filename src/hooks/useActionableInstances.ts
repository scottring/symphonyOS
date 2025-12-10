import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type {
  ActionableInstance,
  InstanceNote,
  CoverageRequest,
  EntityType,
  ActionableStatus,
} from '@/types/actionable'

// Helper to format date as YYYY-MM-DD in local timezone
function toDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function useActionableInstances() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Get or create instance for an entity on a specific date
  const getOrCreateInstance = useCallback(async (
    entityType: EntityType,
    entityId: string,
    date: Date
  ): Promise<ActionableInstance | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const dateStr = toDateString(date)

      // Try to get existing instance (RLS handles household sharing)
      const { data: existing, error: fetchError } = await supabase
        .from('actionable_instances')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .eq('date', dateStr)
        .maybeSingle()

      if (existing && !fetchError) {
        return existing as ActionableInstance
      }

      // Create new instance
      const { data: created, error: createError } = await supabase
        .from('actionable_instances')
        .insert({
          user_id: user.id,
          entity_type: entityType,
          entity_id: entityId,
          date: dateStr,
          status: 'pending',
        })
        .select()
        .single()

      if (createError) throw createError
      return created as ActionableInstance
    } catch (err) {
      console.error('Failed to get/create instance:', err)
      return null
    }
  }, [])

  // Get instance if it exists (doesn't create)
  const getInstance = useCallback(async (
    entityType: EntityType,
    entityId: string,
    date: Date
  ): Promise<ActionableInstance | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null

      // RLS handles household sharing
      const { data, error: fetchError } = await supabase
        .from('actionable_instances')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .eq('date', toDateString(date))
        .maybeSingle()

      if (fetchError || !data) return null
      return data as ActionableInstance
    } catch {
      return null
    }
  }, [])

  // Get all instances for a date (for daily view)
  // This includes both:
  // 1. Instances originally scheduled for this date
  // 2. Instances that were deferred TO this date (status='deferred', deferred_to matches this date)
  const getInstancesForDate = useCallback(async (date: Date): Promise<ActionableInstance[]> => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return []

      const dateStr = toDateString(date)

      // Query 1: Instances originally scheduled for this date
      const { data: originalInstances, error: fetchError } = await supabase
        .from('actionable_instances')
        .select('*')
        .eq('date', dateStr)

      if (fetchError) throw fetchError

      // Query 2: Instances deferred TO this date
      // These have status='deferred' and deferred_to starts with this date
      const startOfDay = new Date(date)
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date(date)
      endOfDay.setHours(23, 59, 59, 999)

      const { data: deferredInstances, error: deferredError } = await supabase
        .from('actionable_instances')
        .select('*')
        .eq('status', 'deferred')
        .gte('deferred_to', startOfDay.toISOString())
        .lte('deferred_to', endOfDay.toISOString())

      if (deferredError) throw deferredError

      // Combine results, avoiding duplicates (by instance id)
      const instanceMap = new Map<string, ActionableInstance>()
      for (const instance of (originalInstances || [])) {
        instanceMap.set(instance.id, instance as ActionableInstance)
      }
      for (const instance of (deferredInstances || [])) {
        // Only add if not already in the map (original date instances take precedence)
        if (!instanceMap.has(instance.id)) {
          instanceMap.set(instance.id, instance as ActionableInstance)
        }
      }

      return Array.from(instanceMap.values())
    } catch (err) {
      console.error('Failed to get instances for date:', err)
      return []
    }
  }, [])

  // ============================================================================
  // ACTIONS
  // ============================================================================

  // Mark as done
  const markDone = useCallback(async (
    entityType: EntityType,
    entityId: string,
    date: Date
  ): Promise<boolean> => {
    setIsLoading(true)
    setError(null)

    try {
      const instance = await getOrCreateInstance(entityType, entityId, date)
      if (!instance) throw new Error('Failed to get instance')

      const { error: updateError } = await supabase
        .from('actionable_instances')
        .update({
          status: 'completed' as ActionableStatus,
          completed_at: new Date().toISOString(),
        })
        .eq('id', instance.id)

      if (updateError) throw updateError
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to mark done'
      setError(message)
      console.error('markDone error:', err)
      return false
    } finally {
      setIsLoading(false)
    }
  }, [getOrCreateInstance])

  // Undo done (back to pending)
  const undoDone = useCallback(async (
    entityType: EntityType,
    entityId: string,
    date: Date
  ): Promise<boolean> => {
    setIsLoading(true)
    setError(null)

    try {
      const instance = await getInstance(entityType, entityId, date)
      if (!instance) return true // No instance means it's already not done

      const { error: updateError } = await supabase
        .from('actionable_instances')
        .update({
          status: 'pending' as ActionableStatus,
          completed_at: null,
        })
        .eq('id', instance.id)

      if (updateError) throw updateError
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to undo'
      setError(message)
      console.error('undoDone error:', err)
      return false
    } finally {
      setIsLoading(false)
    }
  }, [getInstance])

  // Skip (this instance only)
  const skip = useCallback(async (
    entityType: EntityType,
    entityId: string,
    date: Date
  ): Promise<boolean> => {
    setIsLoading(true)
    setError(null)

    try {
      const instance = await getOrCreateInstance(entityType, entityId, date)
      if (!instance) throw new Error('Failed to get instance')

      const { error: updateError } = await supabase
        .from('actionable_instances')
        .update({
          status: 'skipped' as ActionableStatus,
          skipped_at: new Date().toISOString(),
        })
        .eq('id', instance.id)

      if (updateError) throw updateError
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to skip'
      setError(message)
      console.error('skip error:', err)
      return false
    } finally {
      setIsLoading(false)
    }
  }, [getOrCreateInstance])

  // Defer to a new date/time
  const defer = useCallback(async (
    entityType: EntityType,
    entityId: string,
    fromDate: Date,
    toDateTime: Date
  ): Promise<boolean> => {
    setIsLoading(true)
    setError(null)

    try {
      const instance = await getOrCreateInstance(entityType, entityId, fromDate)
      if (!instance) throw new Error('Failed to get instance')

      const { error: updateError } = await supabase
        .from('actionable_instances')
        .update({
          status: 'deferred' as ActionableStatus,
          deferred_to: toDateTime.toISOString(),
        })
        .eq('id', instance.id)

      if (updateError) throw updateError
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to defer'
      setError(message)
      console.error('defer error:', err)
      return false
    } finally {
      setIsLoading(false)
    }
  }, [getOrCreateInstance])

  // Reschedule to a new date/time (smart - handles same-day vs different-day)
  const reschedule = useCallback(async (
    entityType: EntityType,
    entityId: string,
    fromDate: Date,
    toDateTime: Date
  ): Promise<boolean> => {
    setIsLoading(true)
    setError(null)

    try {
      const instance = await getOrCreateInstance(entityType, entityId, fromDate)
      if (!instance) throw new Error('Failed to get instance')

      // Check if same day (just a time change) vs different day
      const fromDateStr = toDateString(fromDate)
      const toDateStr = toDateString(toDateTime)
      const isSameDay = fromDateStr === toDateStr

      if (isSameDay) {
        // Same day - just update the override time, keep status pending
        const { error: updateError } = await supabase
          .from('actionable_instances')
          .update({
            status: 'pending' as ActionableStatus,
            deferred_to: toDateTime.toISOString(),
          })
          .eq('id', instance.id)

        if (updateError) throw updateError
      } else {
        // Different day - mark as deferred (hides from today, will show on new day)
        const { error: updateError } = await supabase
          .from('actionable_instances')
          .update({
            status: 'deferred' as ActionableStatus,
            deferred_to: toDateTime.toISOString(),
          })
          .eq('id', instance.id)

        if (updateError) throw updateError
      }

      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reschedule'
      setError(message)
      console.error('reschedule error:', err)
      return false
    } finally {
      setIsLoading(false)
    }
  }, [getOrCreateInstance])

  // ============================================================================
  // NOTES
  // ============================================================================

  // Get notes for an instance
  const getNotes = useCallback(async (instanceId: string): Promise<InstanceNote[]> => {
    try {
      const { data, error: fetchError } = await supabase
        .from('instance_notes')
        .select('*')
        .eq('instance_id', instanceId)
        .order('created_at', { ascending: true })

      if (fetchError) throw fetchError
      return (data || []) as InstanceNote[]
    } catch (err) {
      console.error('Failed to get notes:', err)
      return []
    }
  }, [])

  // Add a note
  const addNote = useCallback(async (
    entityType: EntityType,
    entityId: string,
    date: Date,
    note: string
  ): Promise<InstanceNote | null> => {
    setIsLoading(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const instance = await getOrCreateInstance(entityType, entityId, date)
      if (!instance) throw new Error('Failed to get instance')

      const { data, error: insertError } = await supabase
        .from('instance_notes')
        .insert({
          instance_id: instance.id,
          user_id: user.id,
          note: note.trim(),
        })
        .select()
        .single()

      if (insertError) throw insertError
      return data as InstanceNote
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add note'
      setError(message)
      console.error('addNote error:', err)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [getOrCreateInstance])

  // Delete a note
  const deleteNote = useCallback(async (noteId: string): Promise<boolean> => {
    try {
      const { error: deleteError } = await supabase
        .from('instance_notes')
        .delete()
        .eq('id', noteId)

      if (deleteError) throw deleteError
      return true
    } catch (err) {
      console.error('Failed to delete note:', err)
      return false
    }
  }, [])

  // ============================================================================
  // COVERAGE REQUESTS
  // ============================================================================

  // Request coverage
  const requestCoverage = useCallback(async (
    entityType: EntityType,
    entityId: string,
    date: Date
  ): Promise<CoverageRequest | null> => {
    setIsLoading(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const instance = await getOrCreateInstance(entityType, entityId, date)
      if (!instance) throw new Error('Failed to get instance')

      const { data, error: insertError } = await supabase
        .from('coverage_requests')
        .insert({
          instance_id: instance.id,
          requested_by: user.id,
          status: 'pending',
        })
        .select()
        .single()

      if (insertError) throw insertError
      return data as CoverageRequest
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to request coverage'
      setError(message)
      console.error('requestCoverage error:', err)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [getOrCreateInstance])

  // Get coverage requests for an instance
  const getCoverageRequests = useCallback(async (instanceId: string): Promise<CoverageRequest[]> => {
    try {
      const { data, error: fetchError } = await supabase
        .from('coverage_requests')
        .select('*')
        .eq('instance_id', instanceId)
        .order('requested_at', { ascending: false })

      if (fetchError) throw fetchError
      return (data || []) as CoverageRequest[]
    } catch (err) {
      console.error('Failed to get coverage requests:', err)
      return []
    }
  }, [])

  // Respond to coverage request
  const respondToCoverage = useCallback(async (
    requestId: string,
    accept: boolean
  ): Promise<boolean> => {
    setIsLoading(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { error: updateError } = await supabase
        .from('coverage_requests')
        .update({
          status: accept ? 'accepted' : 'declined',
          covered_by: accept ? user.id : null,
          responded_at: new Date().toISOString(),
        })
        .eq('id', requestId)

      if (updateError) throw updateError

      // If accepted, also update the instance assignee
      if (accept) {
        const { data: request } = await supabase
          .from('coverage_requests')
          .select('instance_id')
          .eq('id', requestId)
          .single()

        if (request) {
          await supabase
            .from('actionable_instances')
            .update({ assignee: user.id })
            .eq('id', request.instance_id)
        }
      }

      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to respond'
      setError(message)
      console.error('respondToCoverage error:', err)
      return false
    } finally {
      setIsLoading(false)
    }
  }, [])

  return {
    isLoading,
    error,
    // Instance operations
    getInstance,
    getOrCreateInstance,
    getInstancesForDate,
    // Actions
    markDone,
    undoDone,
    skip,
    defer,
    reschedule,
    // Notes
    getNotes,
    addNote,
    deleteNote,
    // Coverage
    requestCoverage,
    getCoverageRequests,
    respondToCoverage,
  }
}
