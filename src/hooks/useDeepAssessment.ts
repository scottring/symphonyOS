import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { ConversationMessage, DomainAssessment } from '@/types/layer'

interface DeepAssessmentState {
  conversationId: string | null
  messages: ConversationMessage[]
  loading: boolean
  readyToFinish: boolean
  result: Pick<DomainAssessment, 'summary' | 'strengths' | 'issues' | 'opportunities'> | null
  error: string | null
}

export function useDeepAssessment() {
  const [state, setState] = useState<DeepAssessmentState>({
    conversationId: null,
    messages: [],
    loading: false,
    readyToFinish: false,
    result: null,
    error: null,
  })

  const start = useCallback(async (params: {
    layerId: string
    layerName: string
    domainSlug: string
    domainName: string
    domainSubtitle: string
    quickAssessment?: Partial<DomainAssessment>
  }) => {
    setState(prev => ({ ...prev, loading: true, error: null, result: null, messages: [], conversationId: null, readyToFinish: false }))

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not authenticated')

      const response = await supabase.functions.invoke('deep-assessment', {
        body: {
          action: 'start',
          ...params,
        },
      })

      if (response.error) throw new Error(response.error.message)

      const data = response.data
      setState(prev => ({
        ...prev,
        loading: false,
        conversationId: data.conversationId,
        messages: data.messages || [],
      }))
    } catch (err) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to start assessment',
      }))
    }
  }, [])

  const respond = useCallback(async (userMessage: string) => {
    if (!state.conversationId) return

    const now = new Date().toISOString()
    // Optimistically add user message
    setState(prev => ({
      ...prev,
      loading: true,
      error: null,
      messages: [...prev.messages, { role: 'user' as const, content: userMessage, timestamp: now }],
    }))

    try {
      const response = await supabase.functions.invoke('deep-assessment', {
        body: {
          action: 'respond',
          conversationId: state.conversationId,
          userMessage,
          layerName: '', // Not strictly needed for respond
          domainName: '',
          domainSubtitle: '',
        },
      })

      if (response.error) throw new Error(response.error.message)

      const data = response.data
      setState(prev => ({
        ...prev,
        loading: false,
        messages: data.messages || prev.messages,
        readyToFinish: data.readyToFinish || false,
      }))
    } catch (err) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to send message',
      }))
    }
  }, [state.conversationId])

  const finish = useCallback(async () => {
    if (!state.conversationId) return

    setState(prev => ({ ...prev, loading: true, error: null }))

    try {
      const response = await supabase.functions.invoke('deep-assessment', {
        body: {
          action: 'finish',
          conversationId: state.conversationId,
        },
      })

      if (response.error) throw new Error(response.error.message)

      const data = response.data
      setState(prev => ({
        ...prev,
        loading: false,
        result: data.result,
      }))
    } catch (err) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to generate assessment',
      }))
    }
  }, [state.conversationId])

  const reset = useCallback(() => {
    setState({
      conversationId: null,
      messages: [],
      loading: false,
      readyToFinish: false,
      result: null,
      error: null,
    })
  }, [])

  return {
    ...state,
    start,
    respond,
    finish,
    reset,
  }
}
