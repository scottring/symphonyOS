// DomainRefreshFlow — AI conversation overlay for refreshing stale domain data
// Reuses ConversationView/ConversationBubble/ResponseInput from onboarding

import { useState, useCallback } from 'react'
import { useConversation } from '@/hooks/useConversation'
import { ConversationBubble } from '@/components/onboarding/relish/ConversationBubble'
import { ResponseInput } from '@/components/onboarding/relish/ResponseInput'
import { DomainDataView } from './DomainDataView'
import { DOMAIN_NAMES } from '@/types/manual'
import type { DomainId } from '@/types/manual'

type RefreshStep = 'conversation' | 'preview' | 'done'

interface DomainRefreshFlowProps {
  domainId: DomainId
  householdId: string
  currentData: Record<string, unknown>
  onSave: (data: Record<string, unknown>) => Promise<void>
  onClose: () => void
}

export function DomainRefreshFlow({ domainId, householdId, currentData, onSave, onClose }: DomainRefreshFlowProps) {
  const { turns, isLoading, error, lastResponse, startRefreshConversation, sendMessage, requestSynthesis } = useConversation()
  const [step, setStep] = useState<RefreshStep>('conversation')
  const [started, setStarted] = useState(false)
  const [synthesisData, setSynthesisData] = useState<Record<string, unknown> | null>(null)
  const [saving, setSaving] = useState(false)

  const handleStart = useCallback(async () => {
    setStarted(true)
    await startRefreshConversation(domainId, householdId, currentData)
  }, [domainId, householdId, currentData, startRefreshConversation])

  const handleSend = useCallback(async (message: string) => {
    const response = await sendMessage(message)
    if (response.type === 'synthesis' && response.structuredData) {
      setSynthesisData(response.structuredData)
      setStep('preview')
    }
  }, [sendMessage])

  const handleRequestSynthesis = useCallback(async () => {
    const response = await requestSynthesis()
    if (response.structuredData) {
      setSynthesisData(response.structuredData)
      setStep('preview')
    }
  }, [requestSynthesis])

  const handleApprove = useCallback(async () => {
    if (!synthesisData) return
    setSaving(true)
    try {
      await onSave(synthesisData)
      setStep('done')
    } catch {
      // error is visible from the hook
    } finally {
      setSaving(false)
    }
  }, [synthesisData, onSave])

  const canSynthesize = turns.length >= 4 && !isLoading && lastResponse?.type !== 'synthesis'

  // ==================== Not Started ====================

  if (!started) {
    return (
      <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4">
          <h2 className="text-lg font-semibold text-stone-900">
            Refresh {DOMAIN_NAMES[domainId]}
          </h2>
          <p className="text-sm text-stone-500">
            Have a quick conversation with your Relish coach to update this domain.
            We'll review your current data and explore what's changed.
          </p>
          <div className="bg-stone-50 rounded-xl p-4 max-h-48 overflow-y-auto">
            <p className="text-xs font-medium text-stone-400 mb-2">Current data</p>
            <DomainDataView domainId={domainId} data={currentData} />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={onClose} className="text-sm px-4 py-2 text-stone-500 hover:text-stone-700">
              Cancel
            </button>
            <button onClick={handleStart} className="text-sm px-4 py-2 bg-stone-900 text-white rounded-lg hover:bg-stone-800">
              Start conversation
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ==================== Done ====================

  if (step === 'done') {
    return (
      <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl max-w-lg w-full p-6 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
            <svg className="w-7 h-7 text-emerald-600" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-stone-900">Domain refreshed</h2>
          <p className="text-sm text-stone-500">
            {DOMAIN_NAMES[domainId]} has been updated with fresh insights from your conversation.
          </p>
          <button onClick={onClose} className="text-sm px-6 py-2 bg-stone-900 text-white rounded-lg hover:bg-stone-800">
            Done
          </button>
        </div>
      </div>
    )
  }

  // ==================== Preview ====================

  if (step === 'preview' && synthesisData) {
    return (
      <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
          <div className="px-6 py-4 border-b border-stone-100">
            <h2 className="text-lg font-semibold text-stone-900">Review updated {DOMAIN_NAMES[domainId]}</h2>
            <p className="text-xs text-stone-400 mt-0.5">This will replace your current domain data</p>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <DomainDataView domainId={domainId} data={synthesisData} />
          </div>
          <div className="px-6 py-4 border-t border-stone-100 flex justify-between">
            <button
              onClick={() => setStep('conversation')}
              className="text-sm px-4 py-2 text-stone-500 hover:text-stone-700"
            >
              Back to conversation
            </button>
            <div className="flex gap-3">
              <button onClick={onClose} className="text-sm px-4 py-2 text-stone-500 hover:text-stone-700">
                Discard
              </button>
              <button
                onClick={handleApprove}
                disabled={saving}
                className="text-sm px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Approve & save'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ==================== Conversation ====================

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full h-[80vh] flex flex-col">
        <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-stone-900">Refreshing {DOMAIN_NAMES[domainId]}</h2>
            <p className="text-xs text-stone-400 mt-0.5">
              {turns.length < 4
                ? 'Share what has changed since your last update'
                : 'Continue the conversation or synthesize when ready'}
            </p>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600">
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
          {turns.map((turn, i) => (
            <ConversationBubble key={i} turn={turn} />
          ))}

          {isLoading && (
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

          {error && (
            <div className="bg-red-50 border border-red-100 rounded-lg p-3">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
        </div>

        <div className="border-t border-stone-200 bg-stone-50 px-4 py-3">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <ResponseInput
                onSend={handleSend}
                disabled={isLoading}
                placeholder="Share what's changed..."
              />
            </div>
            {canSynthesize && (
              <button
                onClick={handleRequestSynthesis}
                disabled={isLoading}
                className="text-xs px-3 py-3 bg-emerald-50 text-emerald-700 rounded-xl hover:bg-emerald-100 disabled:opacity-50 shrink-0"
              >
                Synthesize
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
