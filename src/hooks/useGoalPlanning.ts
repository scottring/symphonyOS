import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { ConversationMessage, GoalPlanningResult } from '@/types/goal'

export function useGoalPlanning() {
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [readyToFinish, setReadyToFinish] = useState(false)
  const [planningResult, setPlanningResult] = useState<GoalPlanningResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const startPlanning = useCallback(async (goalId: string, goalName: string, goalNotes?: string, areaName?: string) => {
    setLoading(true)
    setError(null)
    setMessages([])
    setPlanningResult(null)
    setReadyToFinish(false)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const res = await supabase.functions.invoke('goal-planning-chat', {
        body: {
          action: 'start',
          goalId,
          goalName,
          goalNotes,
          areaName,
        },
      })

      if (res.error) throw new Error(res.error.message)

      const data = res.data
      setConversationId(data.conversationId)
      setMessages(data.messages)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start planning')
    } finally {
      setLoading(false)
    }
  }, [])

  const sendMessage = useCallback(async (text: string) => {
    if (!conversationId) return
    setLoading(true)
    setError(null)

    // Optimistic: add user message immediately
    const userMsg: ConversationMessage = {
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMsg])

    try {
      const res = await supabase.functions.invoke('goal-planning-chat', {
        body: {
          action: 'respond',
          conversationId,
          userMessage: text,
        },
      })

      if (res.error) throw new Error(res.error.message)

      const data = res.data
      setMessages(data.messages)
      setReadyToFinish(data.readyToFinish ?? false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message')
    } finally {
      setLoading(false)
    }
  }, [conversationId])

  const finishPlanning = useCallback(async () => {
    if (!conversationId) return
    setLoading(true)
    setError(null)

    try {
      const res = await supabase.functions.invoke('goal-planning-chat', {
        body: {
          action: 'finish',
          conversationId,
        },
      })

      if (res.error) throw new Error(res.error.message)

      const data = res.data
      setPlanningResult(data.result as GoalPlanningResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate plan')
    } finally {
      setLoading(false)
    }
  }, [conversationId])

  const reset = useCallback(() => {
    setConversationId(null)
    setMessages([])
    setLoading(false)
    setReadyToFinish(false)
    setPlanningResult(null)
    setError(null)
  }, [])

  return {
    conversationId,
    messages,
    loading,
    readyToFinish,
    planningResult,
    error,
    startPlanning,
    sendMessage,
    finishPlanning,
    reset,
  }
}
