import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { logger } from '@/lib/logger'

export interface ActionQueueItem {
  id: string
  user_id: string
  action_type: 'send_email' | 'create_task' | 'schedule_meeting' | 'update_contact' | 'write_vault_note'
  summary: string
  payload: Record<string, unknown>
  source: 'email' | 'meeting' | 'transcript' | 'ai_chat' | 'system'
  source_ref: string | null
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed'
  context: Record<string, unknown>
  executed_at: string | null
  execution_result: Record<string, unknown> | null
  error_message: string | null
  created_at: string
  updated_at: string
  expires_at: string | null
}

export function useActionQueue() {
  const { user } = useAuth()
  const [actions, setActions] = useState<ActionQueueItem[]>([])
  const [loading, setLoading] = useState(true)

  // Fetch pending actions
  const fetchActions = useCallback(async () => {
    if (!user) {
      setActions([])
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('action_queue')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (error) {
      logger.error('Failed to fetch action queue:', error)
    } else {
      setActions(data as ActionQueueItem[])
    }
    setLoading(false)
  }, [user])

  // Initial fetch
  useEffect(() => {
    fetchActions()
  }, [fetchActions])

  // Realtime subscription
  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel('action_queue_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'action_queue',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const { eventType, new: newRow, old: oldRow } = payload

          if (eventType === 'INSERT') {
            const item = newRow as ActionQueueItem
            if (item.status === 'pending') {
              setActions((prev) => [item, ...prev])
            }
          } else if (eventType === 'UPDATE') {
            const item = newRow as ActionQueueItem
            if (item.status !== 'pending') {
              // Remove from pending list
              setActions((prev) => prev.filter((a) => a.id !== item.id))
            } else {
              // Update in place
              setActions((prev) =>
                prev.map((a) => (a.id === item.id ? item : a))
              )
            }
          } else if (eventType === 'DELETE') {
            const deletedId = (oldRow as { id: string }).id
            setActions((prev) => prev.filter((a) => a.id !== deletedId))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user])

  // Approve an action (optionally with modified payload)
  const approveAction = useCallback(
    async (id: string, modifiedPayload?: Record<string, unknown>) => {
      const body: Record<string, unknown> = {
        operation: 'resolve',
        id,
        status: 'approved',
      }
      if (modifiedPayload) {
        body.payload = modifiedPayload
      }

      const response = await supabase.functions.invoke('action-queue', { body })

      if (response.error) {
        logger.error('Failed to approve action:', response.error)
        throw response.error
      }

      return response.data?.action as ActionQueueItem
    },
    []
  )

  // Reject/dismiss an action
  const rejectAction = useCallback(async (id: string) => {
    const response = await supabase.functions.invoke('action-queue', {
      body: { operation: 'resolve', id, status: 'rejected' },
    })

    if (response.error) {
      logger.error('Failed to reject action:', response.error)
      throw response.error
    }

    return response.data?.action as ActionQueueItem
  }, [])

  const pendingCount = useMemo(() => actions.length, [actions])

  return {
    actions,
    loading,
    approveAction,
    rejectAction,
    pendingCount,
    refetch: fetchActions,
  }
}
