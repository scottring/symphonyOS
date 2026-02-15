// useConversation — manages AI conversation state for onboarding & domain refresh
// Ported from Relish, adapted for Supabase Edge Functions

import { useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { OnboardingPhaseId, DomainId } from '@/types/manual'
import type { ConversationTurn } from '@/types/conversation'

interface ConversationResponse {
  conversationId: string
  type: 'question' | 'synthesis'
  message: string
  structuredData: Record<string, unknown> | null
  turnCount: number
  minTurns: number
  maxTurns: number
}

type ConversationParams =
  | { mode: 'onboarding'; phaseId: OnboardingPhaseId; householdId: string; previousDomains?: Record<string, unknown> }
  | { mode: 'domain-assessment'; domainId: DomainId; householdId: string; previousDomains?: Record<string, unknown> }
  | { mode: 'refresh'; domainId: DomainId; householdId: string; currentDomainData: Record<string, unknown> }
  | { mode: 'individual-profile'; householdId: string; personName: string; personId?: string; previousDomains?: Record<string, unknown> }
  | { mode: 'joint-review'; householdId: string; person1Name: string; person2Name: string; domainIds: DomainId[]; domainAssessments: Record<string, unknown> }

interface UseConversationReturn {
  turns: ConversationTurn[]
  conversationId: string | null
  isLoading: boolean
  error: string | null
  lastResponse: ConversationResponse | null
  startConversation: (phaseId: OnboardingPhaseId, householdId: string, previousDomains?: Record<string, unknown>) => Promise<void>
  startDomainAssessment: (domainId: DomainId, householdId: string, previousDomains?: Record<string, unknown>) => Promise<void>
  startRefreshConversation: (domainId: DomainId, householdId: string, currentDomainData: Record<string, unknown>) => Promise<void>
  startIndividualProfile: (householdId: string, personName: string, personId?: string, previousDomains?: Record<string, unknown>) => Promise<void>
  startJointReview: (householdId: string, person1Name: string, person2Name: string, domainIds: DomainId[], domainAssessments: Record<string, unknown>) => Promise<void>
  sendMessage: (message: string) => Promise<ConversationResponse>
  requestSynthesis: () => Promise<ConversationResponse>
  restoreState: (savedTurns: ConversationTurn[], savedConversationId: string, savedLastResponse: ConversationResponse | null, params?: ConversationParams) => void
  reset: () => void
}

export function useConversation(): UseConversationReturn {
  const [turns, setTurns] = useState<ConversationTurn[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastResponse, setLastResponse] = useState<ConversationResponse | null>(null)

  const paramsRef = useRef<ConversationParams | null>(null)

  const invokeEdgeFunction = useCallback(async (body: Record<string, unknown>): Promise<ConversationResponse> => {
    const { data, error: fnError } = await supabase.functions.invoke('conduct-onboarding-conversation', {
      body,
    })

    if (fnError) {
      throw new Error(fnError.message || 'Edge function call failed')
    }

    return data as ConversationResponse
  }, [])

  const startWithParams = useCallback(async (params: ConversationParams) => {
    paramsRef.current = params
    setTurns([])
    setConversationId(null)
    setError(null)
    setIsLoading(true)

    try {
      const body: Record<string, unknown> = { householdId: params.householdId }
      if (params.mode === 'onboarding') {
        body.phaseId = params.phaseId
        body.previousDomains = params.previousDomains
      } else if (params.mode === 'domain-assessment') {
        body.mode = 'domain-assessment'
        body.domainId = params.domainId
        body.previousDomains = params.previousDomains
      } else if (params.mode === 'individual-profile') {
        body.mode = 'individual-profile'
        body.personName = params.personName
        body.personId = params.personId
        body.previousDomains = params.previousDomains
      } else if (params.mode === 'joint-review') {
        body.mode = 'joint-review'
        body.person1Name = params.person1Name
        body.person2Name = params.person2Name
        body.domainIds = params.domainIds
        body.domainAssessments = params.domainAssessments
      } else {
        body.mode = 'refresh'
        body.domainId = params.domainId
        body.currentDomainData = params.currentDomainData
      }

      const response = await invokeEdgeFunction(body)
      setConversationId(response.conversationId)
      setLastResponse(response)

      setTurns([{
        role: 'assistant',
        content: response.message,
        timestamp: new Date().toISOString(),
      }])
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to start conversation'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [invokeEdgeFunction])

  const startConversation = useCallback(async (
    phaseId: OnboardingPhaseId,
    householdId: string,
    previousDomains?: Record<string, unknown>
  ) => {
    await startWithParams({ mode: 'onboarding', phaseId, householdId, previousDomains })
  }, [startWithParams])

  const startDomainAssessment = useCallback(async (
    domainId: DomainId,
    householdId: string,
    previousDomains?: Record<string, unknown>
  ) => {
    await startWithParams({ mode: 'domain-assessment', domainId, householdId, previousDomains })
  }, [startWithParams])

  const startRefreshConversation = useCallback(async (
    domainId: DomainId,
    householdId: string,
    currentDomainData: Record<string, unknown>
  ) => {
    await startWithParams({ mode: 'refresh', domainId, householdId, currentDomainData })
  }, [startWithParams])

  const startIndividualProfile = useCallback(async (
    householdId: string,
    personName: string,
    personId?: string,
    previousDomains?: Record<string, unknown>
  ) => {
    await startWithParams({ mode: 'individual-profile', householdId, personName, personId, previousDomains })
  }, [startWithParams])

  const startJointReview = useCallback(async (
    householdId: string,
    person1Name: string,
    person2Name: string,
    domainIds: DomainId[],
    domainAssessments: Record<string, unknown>
  ) => {
    await startWithParams({ mode: 'joint-review', householdId, person1Name, person2Name, domainIds, domainAssessments })
  }, [startWithParams])

  const sendMessage = useCallback(async (message: string): Promise<ConversationResponse> => {
    const params = paramsRef.current
    if (!params) {
      throw new Error('Conversation not started')
    }

    setError(null)
    setIsLoading(true)

    const userTurn: ConversationTurn = {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    }
    setTurns(prev => [...prev, userTurn])

    try {
      const body: Record<string, unknown> = {
        householdId: params.householdId,
        conversationId,
        message,
      }
      if (params.mode === 'onboarding') {
        body.phaseId = params.phaseId
        body.previousDomains = params.previousDomains
      } else if (params.mode === 'domain-assessment') {
        body.mode = 'domain-assessment'
        body.domainId = params.domainId
        body.previousDomains = params.previousDomains
      } else if (params.mode === 'individual-profile') {
        body.mode = 'individual-profile'
        body.personName = params.personName
        body.personId = params.personId
        body.previousDomains = params.previousDomains
      } else if (params.mode === 'joint-review') {
        body.mode = 'joint-review'
        body.person1Name = params.person1Name
        body.person2Name = params.person2Name
        body.domainIds = params.domainIds
        body.domainAssessments = params.domainAssessments
      } else {
        body.mode = 'refresh'
        body.domainId = params.domainId
        body.currentDomainData = params.currentDomainData
      }

      const response = await invokeEdgeFunction(body)
      setConversationId(response.conversationId)
      setLastResponse(response)

      const aiTurn: ConversationTurn = {
        role: 'assistant',
        content: response.message,
        timestamp: new Date().toISOString(),
        ...(response.structuredData ? { extractedData: response.structuredData } : {}),
      }
      setTurns(prev => [...prev, aiTurn])

      return response
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to send message'
      setError(message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [conversationId, invokeEdgeFunction])

  const requestSynthesis = useCallback(async (): Promise<ConversationResponse> => {
    return sendMessage('Please synthesize what we discussed.')
  }, [sendMessage])

  const restoreState = useCallback((
    savedTurns: ConversationTurn[],
    savedConversationId: string,
    savedLastResponse: ConversationResponse | null,
    params?: ConversationParams,
  ) => {
    setTurns(savedTurns)
    setConversationId(savedConversationId)
    setLastResponse(savedLastResponse)
    setError(null)
    setIsLoading(false)
    if (params) paramsRef.current = params
  }, [])

  const reset = useCallback(() => {
    setTurns([])
    setConversationId(null)
    setLastResponse(null)
    setError(null)
    setIsLoading(false)
    paramsRef.current = null
  }, [])

  return {
    turns,
    conversationId,
    isLoading,
    error,
    lastResponse,
    startConversation,
    startDomainAssessment,
    startRefreshConversation,
    startIndividualProfile,
    startJointReview,
    sendMessage,
    requestSynthesis,
    restoreState,
    reset,
  }
}
