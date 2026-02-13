// ManualView — Living assessment engine: domain cards with harmony scores, findings, actions
// Replaces old constellation + collapsible raw data view

import { useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useHousehold } from '@/hooks/useHousehold'
import { useManual } from '@/hooks/useManual'
import { useConversation } from '@/hooks/useConversation'
import { useRelishOnboarding } from '@/hooks/useRelishOnboarding'
import { useActionSynthesis } from '@/hooks/useActionSynthesis'
import { DomainCard } from './DomainCard'
import { AssessmentResults } from './AssessmentResults'
import { HarmonyBadge } from './HarmonyBadge'
import { HarmonyMap } from './HarmonyMap'
import { AssessmentDepthMeter } from './AssessmentDepthMeter'
import { ConversationBubble } from '@/components/onboarding/relish/ConversationBubble'
import { ResponseInput } from '@/components/onboarding/relish/ResponseInput'
import {
  DOMAIN_ORDER, DOMAIN_NAMES, isDomainAssessed, getHarmonyStatus,
} from '@/types/manual'
import type { DomainId, ManualDomains, DomainAssessment, ActionItem } from '@/types/manual'

type ActiveFlow = {
  type: 'assessment'
  domainId: DomainId
  step: 'conversation' | 'results'
  synthesisData?: DomainAssessment
}

export function ManualView() {
  const navigate = useNavigate()
  const { household } = useHousehold()
  const { manuals, loading, refetch: refetchManuals } = useManual(household?.id ?? null)
  const { saveDomainAssessment } = useRelishOnboarding(household?.id ?? null)
  const { pushToSymphony, pushing } = useActionSynthesis(household?.id ?? null)
  const conversation = useConversation()
  const [activeFlow, setActiveFlow] = useState<ActiveFlow | null>(null)
  const [saving, setSaving] = useState(false)

  const householdManual = manuals.find(m => m.type === 'household')

  // Compute overall harmony stats
  const harmonyStats = useMemo(() => {
    if (!householdManual) return { assessed: 0, avgScore: 0 }
    const domains = householdManual.domains as ManualDomains
    let total = 0
    let count = 0
    for (const id of DOMAIN_ORDER) {
      if (isDomainAssessed(householdManual, id)) {
        const score = domains[id]?.harmonyScore
        if (Number.isFinite(score)) {
          total += score
          count++
        }
      }
    }
    return { assessed: count, avgScore: count > 0 ? Math.round(total / count) : 0 }
  }, [householdManual])

  // Start or resume domain assessment conversation
  const handleStartAssessment = useCallback(async (domainId: DomainId) => {
    if (!household?.id || !householdManual) return
    setActiveFlow({ type: 'assessment', domainId, step: 'conversation' })

    // Check for an existing active conversation for this domain
    const { data: existing } = await supabase
      .from('conversations')
      .select('id, turns')
      .eq('household_id', household.id)
      .eq('purpose', 'domain-assessment')
      .eq('domain_id', domainId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (existing && existing.turns && existing.turns.length > 0) {
      // Resume existing conversation
      const turns = existing.turns as Array<{ role: string; content: string; timestamp: string; extractedData?: unknown }>
      const userTurns = turns.filter(t => t.role === 'user').length
      conversation.restoreState(
        turns.map(t => ({ role: t.role as 'user' | 'assistant', content: t.content, timestamp: t.timestamp })),
        existing.id,
        { conversationId: existing.id, type: 'question', message: turns[turns.length - 1]?.content ?? '', structuredData: null, turnCount: userTurns, minTurns: 6, maxTurns: 10 }
      )
      return
    }

    // Gather previously assessed domains for context
    const domains = householdManual.domains as ManualDomains
    const previousDomains: Record<string, unknown> = {}
    for (const id of DOMAIN_ORDER) {
      if (isDomainAssessed(householdManual, id)) {
        previousDomains[id] = domains[id]
      }
    }

    conversation.reset()
    await conversation.startDomainAssessment(domainId, household.id, previousDomains)
  }, [household?.id, householdManual, conversation])

  // Send message during assessment
  const handleSendMessage = useCallback(async (message: string) => {
    const response = await conversation.sendMessage(message)

    // Check if synthesis came back
    if (response.type === 'synthesis' && response.structuredData && activeFlow) {
      // Extract the domain assessment from structured data
      const domainId = activeFlow.domainId
      const rawData = response.structuredData as Record<string, unknown>
      const assessmentData = (rawData[domainId] || rawData) as DomainAssessment

      setActiveFlow({
        ...activeFlow,
        step: 'results',
        synthesisData: assessmentData,
      })
    }
  }, [conversation, activeFlow])

  // Request synthesis
  const handleRequestSynthesis = useCallback(async () => {
    const response = await conversation.requestSynthesis()
    if (response.structuredData && activeFlow) {
      const domainId = activeFlow.domainId
      const rawData = response.structuredData as Record<string, unknown>
      const assessmentData = (rawData[domainId] || rawData) as DomainAssessment

      setActiveFlow({
        ...activeFlow,
        step: 'results',
        synthesisData: assessmentData,
      })
    }
  }, [conversation, activeFlow])

  // Save assessment results
  const handleSaveAssessment = useCallback(async () => {
    if (!activeFlow?.synthesisData || !activeFlow.domainId) return
    setSaving(true)
    try {
      await saveDomainAssessment(activeFlow.domainId, activeFlow.synthesisData as unknown as Record<string, unknown>)

      // Mark the conversation as completed so it doesn't get resumed
      if (conversation.conversationId) {
        await supabase
          .from('conversations')
          .update({ status: 'completed' })
          .eq('id', conversation.conversationId)
      }

      // Refetch manuals to ensure UI shows updated data
      await refetchManuals()

      setActiveFlow(null)
      conversation.reset()
    } catch (err) {
      console.error('Save assessment error:', err)
    } finally {
      setSaving(false)
    }
  }, [activeFlow, saveDomainAssessment, conversation, refetchManuals])

  // Push action to Symphony
  const handleAddToSymphony = useCallback(async (action: ActionItem, domainId: DomainId) => {
    await pushToSymphony(action, domainId)
  }, [pushToSymphony])

  // Navigate to linked Symphony item
  const handleNavigateToItem = useCallback((symphonyItemId: string, type: ActionItem['type']) => {
    const routes: Record<string, string> = {
      task: '/',
      project: `/projects/${symphonyItemId}`,
      routine: `/routines/${symphonyItemId}`,
      goal: `/goals/${symphonyItemId}`,
    }
    navigate(routes[type] || '/')
  }, [navigate])

  // Close assessment flow
  const handleCloseFlow = useCallback(() => {
    setActiveFlow(null)
    conversation.reset()
  }, [conversation])

  // Progress info from last response
  const turnCount = conversation.lastResponse?.turnCount ?? 0
  const minTurns = conversation.lastResponse?.minTurns ?? 6
  const maxTurns = conversation.lastResponse?.maxTurns ?? 10

  // Can synthesize once minimum turns reached
  const canSynthesize = turnCount >= minTurns && !conversation.isLoading && conversation.lastResponse?.type !== 'synthesis'

  // Loading
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-neutral-400">Loading manual...</div>
      </div>
    )
  }

  // No manual
  if (!householdManual) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-stone-100 flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-stone-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-stone-800 mb-2">No manual yet</h2>
        <p className="text-sm text-stone-500 max-w-sm">
          Your family's operating manual will appear here after completing assessments.
        </p>
      </div>
    )
  }

  const domains = householdManual.domains as ManualDomains

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header with overall harmony */}
      <div className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-stone-900">{householdManual.title}</h1>
            {householdManual.subtitle && (
              <p className="text-stone-500 mt-1">{householdManual.subtitle}</p>
            )}
          </div>
          {harmonyStats.assessed > 0 && (
            <HarmonyBadge score={harmonyStats.avgScore} className="mt-1" />
          )}
        </div>
        <p className="text-xs text-stone-400 mt-2">
          {harmonyStats.assessed} of 8 domains assessed
        </p>

        {/* Mini harmony bar */}
        {harmonyStats.assessed > 0 && (
          <div className="flex gap-1 mt-3">
            {DOMAIN_ORDER.map(id => {
              const assessed = isDomainAssessed(householdManual, id)
              const score = assessed ? domains[id].harmonyScore : 0
              const status = getHarmonyStatus(score)
              const bg = status === 'resonating' ? 'bg-emerald-400'
                : status === 'adjusting' ? 'bg-amber-400'
                : status === 'discordant' ? 'bg-red-400'
                : 'bg-stone-200'
              return (
                <div
                  key={id}
                  className={`flex-1 h-1.5 rounded-full ${bg}`}
                  title={`${DOMAIN_NAMES[id]}: ${assessed ? score : 'Uncharted'}`}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* Harmony Map — domain visual overview */}
      {harmonyStats.assessed > 0 && (
        <div className="mb-8">
          <HarmonyMap
            manual={householdManual}
            onAssessDomain={handleStartAssessment}
          />
        </div>
      )}

      {/* Domain cards */}
      <div className="space-y-3">
        {DOMAIN_ORDER.map(domainId => (
          <DomainCard
            key={domainId}
            domainId={domainId}
            assessment={domains[domainId]}
            onAssess={() => handleStartAssessment(domainId)}
            onAddToSymphony={(action) => handleAddToSymphony(action, domainId)}
            onNavigateToItem={handleNavigateToItem}
            pushing={pushing}
          />
        ))}
      </div>

      {/* Assessment conversation overlay */}
      {activeFlow?.step === 'conversation' && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full h-[80vh] flex flex-col">
            {/* Conversation header with depth meter */}
            <div className="px-6 py-4 border-b border-stone-100">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-stone-900">
                    Assessing {DOMAIN_NAMES[activeFlow.domainId]}
                  </h2>
                  <p className="text-xs text-stone-400 mt-0.5">
                    Share openly — the more detail, the better your assessment
                  </p>
                </div>
                <button onClick={handleCloseFlow} className="text-stone-400 hover:text-stone-600 shrink-0 ml-4">
                  <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
              <AssessmentDepthMeter
                turnCount={turnCount}
                minTurns={minTurns}
                maxTurns={maxTurns}
              />
            </div>

            {/* Conversation messages */}
            <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
              {conversation.turns.map((turn, i) => (
                <ConversationBubble key={i} turn={turn} />
              ))}

              {conversation.isLoading && (
                <div className="flex justify-start animate-fade-in">
                  <div className="bg-white border border-stone-200 rounded-2xl rounded-bl-md px-4 py-3">
                    <div className="flex gap-1.5">
                      <div className="w-2 h-2 bg-stone-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-stone-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-stone-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}

              {conversation.error && (
                <div className="bg-red-50 border border-red-100 rounded-lg p-3">
                  <p className="text-sm text-red-600">{conversation.error}</p>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="border-t border-stone-200 bg-stone-50 px-4 py-3">
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <ResponseInput
                    onSend={handleSendMessage}
                    disabled={conversation.isLoading}
                    placeholder="Share your thoughts..."
                  />
                </div>
                {canSynthesize && (
                  <button
                    onClick={handleRequestSynthesis}
                    disabled={conversation.isLoading}
                    className="text-xs px-3 py-3 bg-emerald-50 text-emerald-700 rounded-xl hover:bg-emerald-100 disabled:opacity-50 shrink-0"
                  >
                    Synthesize
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assessment results overlay */}
      {activeFlow?.step === 'results' && activeFlow.synthesisData && (
        <AssessmentResults
          domainId={activeFlow.domainId}
          assessment={activeFlow.synthesisData}
          onSave={handleSaveAssessment}
          onBack={() => setActiveFlow({ ...activeFlow, step: 'conversation' })}
          saving={saving}
        />
      )}
    </div>
  )
}
