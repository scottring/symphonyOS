// IndividualManualView — Per-person manual viewer with 6 individual domains
// Mirrors ManualView structure but for individual (per-person) manuals

import { useState, useCallback } from 'react'
import { useHousehold } from '@/hooks/useHousehold'
import { useManual } from '@/hooks/useManual'
import { useConversation } from '@/hooks/useConversation'
import { ConversationBubble } from '@/components/onboarding/relish/ConversationBubble'
import { ResponseInput } from '@/components/onboarding/relish/ResponseInput'
import { IndividualConstellationMap } from '@/components/onboarding/relish/ConstellationMap'
import {
  INDIVIDUAL_DOMAIN_NAMES,
  INDIVIDUAL_DOMAIN_DESCRIPTIONS,
  INDIVIDUAL_DOMAIN_ORDER,
} from '@/types/manual'
import type { IndividualDomainId, Manual, IndividualManualDomains } from '@/types/manual'

function isDomainEmpty(data: unknown): boolean {
  if (!data || typeof data !== 'object') return true
  return Object.values(data as Record<string, unknown>).every(v => {
    if (Array.isArray(v)) return v.length === 0
    if (typeof v === 'string') return !v
    return !v
  })
}

// ==================== Individual Domain Section ====================

function IndividualDomainSection({ domainId, manual, onRefresh }: {
  domainId: IndividualDomainId
  manual: Manual
  onRefresh: (domainId: IndividualDomainId) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const domains = (manual.individual_domains ?? {}) as IndividualManualDomains
  const domainData = domains[domainId] as unknown as Record<string, unknown> | undefined
  const empty = !domainData || isDomainEmpty(domainData)

  return (
    <div className="border border-stone-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-stone-50 transition-colors"
      >
        <div className="text-left">
          <h3 className="font-medium text-stone-800">{INDIVIDUAL_DOMAIN_NAMES[domainId]}</h3>
          <p className="text-xs text-stone-400 mt-0.5">{INDIVIDUAL_DOMAIN_DESCRIPTIONS[domainId]}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {empty && <span className="text-xs text-stone-300">Empty</span>}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`w-5 h-5 text-stone-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-stone-100">
          <div className="pt-3">
            {empty ? (
              <div className="space-y-3">
                <p className="text-sm text-stone-400 italic">
                  Not yet explored. Start a conversation to fill in {INDIVIDUAL_DOMAIN_NAMES[domainId].toLowerCase()}.
                </p>
                <button
                  onClick={() => onRefresh(domainId)}
                  className="text-sm font-medium px-4 py-2 bg-stone-100 text-stone-600 rounded-lg hover:bg-stone-200 transition-colors"
                >
                  Explore this area
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {Object.entries(domainData!).map(([key, value]) => {
                  if (!value) return null
                  if (Array.isArray(value) && value.length === 0) return null

                  return (
                    <div key={key}>
                      <h4 className="text-xs font-medium text-stone-400 mb-1">
                        {key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
                      </h4>
                      {Array.isArray(value) ? (
                        <ul className="text-sm text-stone-700 space-y-0.5">
                          {value.map((item, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <span className="text-stone-300 mt-1 shrink-0">&#8226;</span>
                              <span>{typeof item === 'string' ? item : JSON.stringify(item)}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-stone-700">{String(value)}</p>
                      )}
                    </div>
                  )
                })}
                <button
                  onClick={() => onRefresh(domainId)}
                  className="mt-2 text-xs flex items-center gap-1 px-2.5 py-1.5 text-stone-500 hover:text-stone-700 hover:bg-stone-100 rounded-lg transition-colors"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H4.28a.75.75 0 00-.75.75v3.955a.75.75 0 001.5 0v-2.134l.218.218a7 7 0 0011.712-3.138.75.75 0 00-1.449-.394zm.137-7.868a.75.75 0 00-1.5 0v2.134l-.217-.218A7 7 0 002.02 8.61a.75.75 0 001.45.394A5.5 5.5 0 0112.69 6.54l.311.31H10.57a.75.75 0 000 1.5h3.951a.75.75 0 00.75-.75V3.556z" clipRule="evenodd" />
                  </svg>
                  Deepen with a conversation
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ==================== Refresh Flow (inline conversation overlay) ====================

function IndividualRefreshFlow({
  domainId,
  personName,
  householdId,
  onSave,
  onClose,
}: {
  domainId: IndividualDomainId
  personName: string
  householdId: string
  onSave: (data: Record<string, unknown>) => Promise<void>
  onClose: () => void
}) {
  const { turns, isLoading, error, lastResponse, startIndividualProfile, sendMessage, requestSynthesis } = useConversation()
  const [started, setStarted] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleStart = useCallback(async () => {
    setStarted(true)
    await startIndividualProfile(householdId, personName)
  }, [householdId, personName, startIndividualProfile])

  const handleSend = useCallback(async (message: string) => {
    const response = await sendMessage(message)
    if (response.type === 'synthesis' && response.structuredData) {
      setSaving(true)
      try {
        await onSave(response.structuredData)
        onClose()
      } finally {
        setSaving(false)
      }
    }
  }, [sendMessage, onSave, onClose])

  const handleRequestSynthesis = useCallback(async () => {
    const response = await requestSynthesis()
    if (response.structuredData) {
      setSaving(true)
      try {
        await onSave(response.structuredData)
        onClose()
      } finally {
        setSaving(false)
      }
    }
  }, [requestSynthesis, onSave, onClose])

  const canSynthesize = turns.length >= 4 && !isLoading && lastResponse?.type !== 'synthesis'

  if (!started) {
    return (
      <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4">
          <h2 className="text-lg font-semibold text-stone-900">
            Explore {personName}'s {INDIVIDUAL_DOMAIN_NAMES[domainId]}
          </h2>
          <p className="text-sm text-stone-500">
            Have a quick conversation to capture insights about {personName}'s {INDIVIDUAL_DOMAIN_NAMES[domainId].toLowerCase()}.
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={onClose} className="text-sm px-4 py-2 text-stone-500 hover:text-stone-700">Cancel</button>
            <button onClick={handleStart} className="text-sm px-4 py-2 bg-stone-900 text-white rounded-lg hover:bg-stone-800">Start conversation</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full h-[80vh] flex flex-col">
        <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-stone-900">{personName} &mdash; {INDIVIDUAL_DOMAIN_NAMES[domainId]}</h2>
            <p className="text-xs text-stone-400 mt-0.5">
              {turns.length < 4 ? 'Share your observations' : 'Continue or synthesize when ready'}
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
              <ResponseInput onSend={handleSend} disabled={isLoading || saving} placeholder={`About ${personName}...`} />
            </div>
            {canSynthesize && (
              <button
                onClick={handleRequestSynthesis}
                disabled={isLoading || saving}
                className="text-xs px-3 py-3 bg-emerald-50 text-emerald-700 rounded-xl hover:bg-emerald-100 disabled:opacity-50 shrink-0"
              >
                {saving ? 'Saving...' : 'Synthesize'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ==================== Main Component ====================

interface IndividualManualViewProps {
  manualId: string
  onBack?: () => void
}

export function IndividualManualView({ manualId, onBack }: IndividualManualViewProps) {
  const { household } = useHousehold()
  const { manuals, loading, updateIndividualDomain } = useManual(household?.id ?? null)
  const [refreshDomain, setRefreshDomain] = useState<IndividualDomainId | null>(null)

  const manual = manuals.find(m => m.id === manualId)

  const handleSaveRefresh = useCallback(async (data: Record<string, unknown>) => {
    if (!manual || !refreshDomain) return
    // data comes back as full individual_domains object from synthesis
    // If it has the specific domain key, save just that domain
    const domainData = data[refreshDomain] ?? data
    await updateIndividualDomain(manual.id, refreshDomain, domainData as Record<string, unknown>, 'refresh')
  }, [manual, refreshDomain, updateIndividualDomain])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-neutral-400">Loading...</div>
      </div>
    )
  }

  if (!manual) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <p className="text-sm text-stone-500">Manual not found.</p>
        {onBack && (
          <button onClick={onBack} className="mt-4 text-sm text-stone-600 hover:text-stone-800">Go back</button>
        )}
      </div>
    )
  }

  const domains = (manual.individual_domains ?? {}) as IndividualManualDomains
  const completedDomains = INDIVIDUAL_DOMAIN_ORDER.filter(
    id => !isDomainEmpty((domains[id] as unknown) as Record<string, unknown> | undefined)
  )

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        {onBack && (
          <button onClick={onBack} className="text-sm text-stone-400 hover:text-stone-600 mb-3 flex items-center gap-1">
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Back
          </button>
        )}
        <h1 className="text-2xl font-bold text-stone-900">{manual.title}</h1>
        {manual.subtitle && <p className="text-stone-500 mt-1">{manual.subtitle}</p>}
        <p className="text-xs text-stone-400 mt-2">
          {completedDomains.length} of 6 areas explored
        </p>
      </div>

      {/* Constellation */}
      <div className="mb-8">
        <IndividualConstellationMap
          completedDomains={completedDomains}
          personName={manual.title}
          className="max-w-[200px] mx-auto"
        />
      </div>

      {/* Domain sections */}
      <div className="space-y-3">
        {INDIVIDUAL_DOMAIN_ORDER.map(domainId => (
          <IndividualDomainSection
            key={domainId}
            domainId={domainId}
            manual={manual}
            onRefresh={setRefreshDomain}
          />
        ))}
      </div>

      {/* Refresh conversation overlay */}
      {refreshDomain && household && (
        <IndividualRefreshFlow
          domainId={refreshDomain}
          personName={manual.title}
          householdId={household.id}
          onSave={handleSaveRefresh}
          onClose={() => setRefreshDomain(null)}
        />
      )}
    </div>
  )
}
