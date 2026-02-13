// useAssessmentActions — CRUD + real-time for assessment-generated action items
// These are actions surfaced by domain assessments that can be pushed to Symphony

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { DomainId, ActionItemEffort, ActionItemType, ActionItemPriority, ActionItemStatus } from '@/types/manual'

export interface AssessmentAction {
  id: string
  household_id: string
  user_id: string
  domain_id: DomainId
  title: string
  description: string | null
  effort: ActionItemEffort | null
  estimated_time: string | null
  action_type: ActionItemType
  priority: ActionItemPriority
  status: ActionItemStatus
  symphony_item_id: string | null
  symphony_item_type: ActionItemType | null
  source_conversation_id: string | null
  created_at: string
  updated_at: string
}

interface CreateActionInput {
  domain_id: DomainId
  title: string
  description?: string
  effort?: ActionItemEffort
  estimated_time?: string
  action_type: ActionItemType
  priority?: ActionItemPriority
  source_conversation_id?: string
}

interface UseAssessmentActionsReturn {
  actions: AssessmentAction[]
  loading: boolean
  error: string | null
  getActions: (domainId?: DomainId) => AssessmentAction[]
  createAction: (input: CreateActionInput) => Promise<string>
  acceptAction: (id: string) => Promise<void>
  dismissAction: (id: string) => Promise<void>
  updateStatus: (id: string, status: ActionItemStatus) => Promise<void>
  linkToSymphony: (actionId: string, symphonyItemId: string, type: ActionItemType) => Promise<void>
  deleteAction: (id: string) => Promise<void>
}

export function useAssessmentActions(householdId: string | null): UseAssessmentActionsReturn {
  const [actions, setActions] = useState<AssessmentAction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch actions and subscribe to real-time updates
  useEffect(() => {
    if (!householdId) {
      setActions([])
      setLoading(false)
      return
    }

    let cancelled = false

    async function fetchActions() {
      const { data, error: fetchError } = await supabase
        .from('assessment_actions')
        .select('*')
        .eq('household_id', householdId)
        .order('created_at', { ascending: false })

      if (cancelled) return

      if (fetchError) {
        console.error('Error fetching assessment actions:', fetchError)
        setError(fetchError.message)
      } else {
        setActions((data || []) as AssessmentAction[])
      }
      setLoading(false)
    }

    fetchActions()

    // Real-time subscription
    const channel = supabase
      .channel(`assessment_actions:${householdId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'assessment_actions',
          filter: `household_id=eq.${householdId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setActions(prev => [payload.new as AssessmentAction, ...prev])
          } else if (payload.eventType === 'UPDATE') {
            setActions(prev => prev.map(a =>
              a.id === (payload.new as AssessmentAction).id ? (payload.new as AssessmentAction) : a
            ))
          } else if (payload.eventType === 'DELETE') {
            setActions(prev => prev.filter(a => a.id !== (payload.old as { id: string }).id))
          }
        }
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [householdId])

  const getActions = useCallback((domainId?: DomainId) => {
    if (!domainId) return actions
    return actions.filter(a => a.domain_id === domainId)
  }, [actions])

  const createAction = useCallback(async (input: CreateActionInput): Promise<string> => {
    if (!householdId) throw new Error('No household')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('No user')

    const { data, error: createError } = await supabase
      .from('assessment_actions')
      .insert({
        household_id: householdId,
        user_id: user.id,
        domain_id: input.domain_id,
        title: input.title,
        description: input.description || null,
        effort: input.effort || null,
        estimated_time: input.estimated_time || null,
        action_type: input.action_type,
        priority: input.priority || 'soon',
        status: 'suggested',
        source_conversation_id: input.source_conversation_id || null,
      })
      .select('id')
      .single()

    if (createError) throw createError
    return data.id
  }, [householdId])

  const acceptAction = useCallback(async (id: string) => {
    const { error: updateError } = await supabase
      .from('assessment_actions')
      .update({ status: 'accepted' })
      .eq('id', id)

    if (updateError) throw updateError
  }, [])

  const dismissAction = useCallback(async (id: string) => {
    const { error: updateError } = await supabase
      .from('assessment_actions')
      .update({ status: 'dismissed' })
      .eq('id', id)

    if (updateError) throw updateError
  }, [])

  const updateStatus = useCallback(async (id: string, status: ActionItemStatus) => {
    const { error: updateError } = await supabase
      .from('assessment_actions')
      .update({ status })
      .eq('id', id)

    if (updateError) throw updateError
  }, [])

  const linkToSymphony = useCallback(async (actionId: string, symphonyItemId: string, type: ActionItemType) => {
    const { error: updateError } = await supabase
      .from('assessment_actions')
      .update({
        symphony_item_id: symphonyItemId,
        symphony_item_type: type,
        status: 'in_progress',
      })
      .eq('id', actionId)

    if (updateError) throw updateError
  }, [])

  const deleteAction = useCallback(async (id: string) => {
    const { error: deleteError } = await supabase
      .from('assessment_actions')
      .delete()
      .eq('id', id)

    if (deleteError) throw deleteError
  }, [])

  return {
    actions,
    loading,
    error,
    getActions,
    createAction,
    acceptAction,
    dismissAction,
    updateStatus,
    linkToSymphony,
    deleteAction,
  }
}
