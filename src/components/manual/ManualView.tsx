// ManualView — Main manual viewer: 8 collapsible domain sections with freshness indicators
// Now with Edit + Refresh actions per domain

import { useState, useCallback } from 'react'
import { useHousehold } from '@/hooks/useHousehold'
import { useManual } from '@/hooks/useManual'
import { DomainDataView } from './DomainDataView'
import { EditableDomainView } from './EditableDomainView'
import { DomainRefreshFlow } from './DomainRefreshFlow'
import { DOMAIN_NAMES, DOMAIN_DESCRIPTIONS, DOMAIN_ORDER, getDomainAge, getDomainFreshnessLabel } from '@/types/manual'
import type { DomainId, Manual, ManualDomains, FreshnessLabel } from '@/types/manual'

function isDomainEmpty(data: Record<string, unknown>): boolean {
  return Object.values(data).every(v => {
    if (Array.isArray(v)) return v.length === 0
    if (typeof v === 'string') return !v
    if (typeof v === 'object' && v !== null) return Object.keys(v).length === 0
    return !v
  })
}

type DomainMode = 'read' | 'edit'

function DomainSection({ domainId, manual, householdId, onUpdateDomain }: {
  domainId: DomainId
  manual: Manual
  householdId: string
  onUpdateDomain: (domainId: DomainId, data: Record<string, unknown>, source: 'manual-edit' | 'refresh') => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const [mode, setMode] = useState<DomainMode>('read')
  const [showRefresh, setShowRefresh] = useState(false)

  const domainData = (manual.domains as ManualDomains)[domainId] as unknown as Record<string, unknown>
  const empty = !domainData || isDomainEmpty(domainData)

  const ageMs = getDomainAge(manual, domainId)
  const freshness: FreshnessLabel | null = ageMs > 0 ? getDomainFreshnessLabel(ageMs) : null
  const isStale = freshness === 'aging' || freshness === 'stale'

  const handleSaveEdit = useCallback(async (data: Record<string, unknown>) => {
    await onUpdateDomain(domainId, data, 'manual-edit')
    setMode('read')
  }, [domainId, onUpdateDomain])

  const handleSaveRefresh = useCallback(async (data: Record<string, unknown>) => {
    await onUpdateDomain(domainId, data, 'refresh')
    setShowRefresh(false)
  }, [domainId, onUpdateDomain])

  return (
    <>
      <div className="border border-stone-200 rounded-xl overflow-hidden">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-stone-50 transition-colors"
        >
          <div className="text-left">
            <h3 className="font-medium text-stone-800">{DOMAIN_NAMES[domainId]}</h3>
            <p className="text-xs text-stone-400 mt-0.5">{DOMAIN_DESCRIPTIONS[domainId]}</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {freshness && (
              <span className={`text-xs px-2 py-1 rounded-md ${
                freshness === 'fresh' ? 'bg-emerald-50 text-emerald-600' :
                freshness === 'aging' ? 'bg-amber-50 text-amber-600' :
                'bg-red-50 text-red-600'
              }`}>
                {freshness.charAt(0).toUpperCase() + freshness.slice(1)}
              </span>
            )}
            {empty && (
              <span className="text-xs text-stone-300">Empty</span>
            )}
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
            {/* Action buttons */}
            {!empty && mode === 'read' && (
              <div className="flex items-center gap-2 pt-3 pb-1">
                <button
                  onClick={() => setMode('edit')}
                  className="text-xs flex items-center gap-1 px-2.5 py-1.5 text-stone-500 hover:text-stone-700 hover:bg-stone-100 rounded-lg transition-colors"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                  </svg>
                  Edit
                </button>
                {isStale && (
                  <button
                    onClick={() => setShowRefresh(true)}
                    className="text-xs flex items-center gap-1 px-2.5 py-1.5 text-amber-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H4.28a.75.75 0 00-.75.75v3.955a.75.75 0 001.5 0v-2.134l.218.218a7 7 0 0011.712-3.138.75.75 0 00-1.449-.394zm.137-7.868a.75.75 0 00-1.5 0v2.134l-.217-.218A7 7 0 002.02 8.61a.75.75 0 001.45.394A5.5 5.5 0 0112.69 6.54l.311.31H10.57a.75.75 0 000 1.5h3.951a.75.75 0 00.75-.75V3.556z" clipRule="evenodd" />
                    </svg>
                    Refresh with AI
                  </button>
                )}
              </div>
            )}

            <div className="pt-3">
              {empty ? (
                <p className="text-sm text-stone-400 italic">
                  No data yet. Complete the {DOMAIN_NAMES[domainId].toLowerCase()} conversation to populate this domain.
                </p>
              ) : mode === 'edit' ? (
                <EditableDomainView
                  domainId={domainId}
                  data={domainData}
                  onSave={handleSaveEdit}
                  onCancel={() => setMode('read')}
                />
              ) : (
                <DomainDataView domainId={domainId} data={domainData} />
              )}
            </div>
          </div>
        )}
      </div>

      {showRefresh && (
        <DomainRefreshFlow
          domainId={domainId}
          householdId={householdId}
          currentData={domainData}
          onSave={handleSaveRefresh}
          onClose={() => setShowRefresh(false)}
        />
      )}
    </>
  )
}

export function ManualView() {
  const { household } = useHousehold()
  const { manuals, loading, updateDomain } = useManual(household?.id ?? null)

  const householdManual = manuals.find(m => m.type === 'household')

  const handleUpdateDomain = useCallback(async (
    domainId: DomainId,
    data: Record<string, unknown>,
    source: 'manual-edit' | 'refresh'
  ) => {
    if (!householdManual) return
    await updateDomain(householdManual.id, domainId, data, source)
  }, [householdManual, updateDomain])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-neutral-400">Loading manual...</div>
      </div>
    )
  }

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
          Your family's operating manual will appear here after completing the onboarding conversations.
        </p>
      </div>
    )
  }

  const populatedCount = DOMAIN_ORDER.filter(id => {
    const data = (householdManual.domains as ManualDomains)[id] as unknown as Record<string, unknown>
    return data && !isDomainEmpty(data)
  }).length

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-stone-900">{householdManual.title}</h1>
        {householdManual.subtitle && (
          <p className="text-stone-500 mt-1">{householdManual.subtitle}</p>
        )}
        <p className="text-xs text-stone-400 mt-2">
          {populatedCount} of 8 domains populated
        </p>
      </div>

      {/* Domain sections */}
      <div className="space-y-3">
        {DOMAIN_ORDER.map(domainId => (
          <DomainSection
            key={domainId}
            domainId={domainId}
            manual={householdManual}
            householdId={household!.id}
            onUpdateDomain={handleUpdateDomain}
          />
        ))}
      </div>
    </div>
  )
}
