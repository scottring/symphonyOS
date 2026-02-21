import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { CoachingBlockSuggestion } from '@/types/playbook'
import type { ConversationMessage } from '@/types/coaching'
import type { CoachingMatch } from '@/lib/coachingMatcher'
import type { TimelineItem } from '@/types/timeline'

type InjectionMode = 'idle' | 'auto-loading' | 'auto-preview' | 'chat' | 'chat-finishing'

interface CoachingInjectionState {
  mode: InjectionMode
  suggestion: CoachingBlockSuggestion | null
  conversationId: string | null
  messages: ConversationMessage[]
  loading: boolean
  readyToFinish: boolean
  error: string | null
}

const initialState: CoachingInjectionState = {
  mode: 'idle',
  suggestion: null,
  conversationId: null,
  messages: [],
  loading: false,
  readyToFinish: false,
  error: null,
}

function buildItemPayload(item: TimelineItem) {
  return {
    type: item.type,
    title: item.title,
    startTime: item.startTime?.toISOString() ?? null,
    endTime: item.endTime?.toISOString() ?? null,
    context: item.context ?? null,
    notes: item.notes ?? null,
    category: item.category ?? null,
  }
}

function getItemSourceId(item: TimelineItem): string {
  // Strip "task-", "event-", "routine-" prefix
  const dashIndex = item.id.indexOf('-')
  return dashIndex >= 0 ? item.id.slice(dashIndex + 1) : item.id
}

function buildMatchedRulesPayload(matches: CoachingMatch[]) {
  return matches.map(m => ({
    id: m.rule.id,
    rule: m.rule.rule,
    category: m.rule.category || '',
    enforcementTip: m.rule.enforcementTip || undefined,
  }))
}

async function invokeEdgeFunction(payload: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('coaching-block-generate', {
    body: payload,
  })
  if (error) throw error
  return data
}

export function useCoachingInjection() {
  const [state, setState] = useState<CoachingInjectionState>(initialState)

  const autoGenerate = useCallback(async (
    item: TimelineItem,
    matches: CoachingMatch[],
    existingBlock?: { id: string; label: string; narrative: string; items: unknown[] } | null,
  ) => {
    setState(prev => ({ ...prev, mode: 'auto-loading', loading: true, error: null }))

    try {
      const data = await invokeEdgeFunction({
        action: 'auto',
        item: buildItemPayload(item),
        itemId: getItemSourceId(item),
        matchedRules: buildMatchedRulesPayload(matches),
        existingBlock: existingBlock || null,
      })

      setState(prev => ({
        ...prev,
        mode: 'auto-preview',
        suggestion: data.suggestion,
        loading: false,
      }))
    } catch (err) {
      setState(prev => ({
        ...prev,
        mode: 'idle',
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to generate coaching',
      }))
    }
  }, [])

  const chatStart = useCallback(async (
    item: TimelineItem,
    matches: CoachingMatch[],
  ) => {
    setState(prev => ({ ...prev, mode: 'chat', loading: true, error: null, messages: [] }))

    try {
      const data = await invokeEdgeFunction({
        action: 'chat-start',
        item: buildItemPayload(item),
        itemId: getItemSourceId(item),
        matchedRules: buildMatchedRulesPayload(matches),
      })

      setState(prev => ({
        ...prev,
        loading: false,
        conversationId: data.conversationId,
        messages: data.messages,
      }))
    } catch (err) {
      setState(prev => ({
        ...prev,
        mode: 'idle',
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to start conversation',
      }))
    }
  }, [])

  const chatRespond = useCallback(async (
    message: string,
    item: TimelineItem,
    matches: CoachingMatch[],
  ) => {
    if (!state.conversationId) return

    // Optimistically add user message
    const userMsg: ConversationMessage = {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    }
    setState(prev => ({
      ...prev,
      loading: true,
      error: null,
      messages: [...prev.messages, userMsg],
    }))

    try {
      const data = await invokeEdgeFunction({
        action: 'chat-respond',
        item: buildItemPayload(item),
        itemId: getItemSourceId(item),
        matchedRules: buildMatchedRulesPayload(matches),
        conversationId: state.conversationId,
        userMessage: message,
      })

      setState(prev => ({
        ...prev,
        loading: false,
        messages: data.messages,
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

  const chatFinish = useCallback(async (
    item: TimelineItem,
    matches: CoachingMatch[],
  ) => {
    if (!state.conversationId) return

    setState(prev => ({ ...prev, mode: 'chat-finishing', loading: true, error: null }))

    try {
      const data = await invokeEdgeFunction({
        action: 'chat-finish',
        item: buildItemPayload(item),
        itemId: getItemSourceId(item),
        matchedRules: buildMatchedRulesPayload(matches),
        conversationId: state.conversationId,
      })

      setState(prev => ({
        ...prev,
        mode: 'auto-preview',
        suggestion: data.suggestion,
        loading: false,
      }))
    } catch (err) {
      setState(prev => ({
        ...prev,
        mode: 'chat',
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to generate block',
      }))
    }
  }, [state.conversationId])

  const refineSuggestion = useCallback(async (
    item: TimelineItem,
    matches: CoachingMatch[],
  ) => {
    if (!state.suggestion) return

    setState(prev => ({ ...prev, mode: 'chat', loading: true, error: null, messages: [] }))

    try {
      const data = await invokeEdgeFunction({
        action: 'refine-start',
        item: buildItemPayload(item),
        itemId: getItemSourceId(item),
        matchedRules: buildMatchedRulesPayload(matches),
        currentSuggestion: state.suggestion,
      })

      setState(prev => ({
        ...prev,
        loading: false,
        conversationId: data.conversationId,
        messages: data.messages,
        readyToFinish: true, // Already have a suggestion, so can finish anytime
      }))
    } catch (err) {
      // Fall back to preview if refine fails
      setState(prev => ({
        ...prev,
        mode: 'auto-preview',
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to start refinement',
      }))
    }
  }, [state.suggestion])

  const confirmSuggestion = useCallback((): CoachingBlockSuggestion | null => {
    return state.suggestion
  }, [state.suggestion])

  const reset = useCallback(() => {
    setState(initialState)
  }, [])

  return {
    ...state,
    autoGenerate,
    chatStart,
    chatRespond,
    chatFinish,
    refineSuggestion,
    confirmSuggestion,
    reset,
  }
}
