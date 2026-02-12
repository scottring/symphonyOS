// CheckinFlow — Weekly coherence check-in wizard
// Rate each domain 1-5, add reflections, get AI observations, browse history

import { useState, useCallback } from 'react'
import { useHousehold } from '@/hooks/useHousehold'
import { useCheckin } from '@/hooks/useCheckin'
import { useManual } from '@/hooks/useManual'
import { DOMAIN_NAMES, DOMAIN_ORDER } from '@/types/manual'
import type { DomainId } from '@/types/manual'
import type { CheckinResponse, SystemObservation, DriftSignal } from '@/types/checkin'
import { CheckinHistory } from './CheckinHistory'
import { DriftSignalCard } from './DriftSignalCard'

interface DomainRating {
  alignmentRating: number
  reflectionText: string
  driftNotes: string
}

type CheckinTab = 'checkin' | 'history'

export function CheckinFlow() {
  const { household } = useHousehold()
  const householdId = household?.id ?? null
  const { hasCheckedInThisWeek, currentWeek, currentCheckin, recentCheckins, submitCheckin, generateObservations, acknowledgeDriftSignal } = useCheckin(householdId)
  const { manuals } = useManual(householdId)

  const householdManual = manuals.find(m => m.type === 'household')
  const manualId = householdManual?.id ?? ''

  const [tab, setTab] = useState<CheckinTab>('checkin')
  const [ratings, setRatings] = useState<Record<DomainId, DomainRating>>(() => {
    const initial: Record<string, DomainRating> = {}
    for (const id of DOMAIN_ORDER) {
      initial[id] = { alignmentRating: 3, reflectionText: '', driftNotes: '' }
    }
    return initial as Record<DomainId, DomainRating>
  })

  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [observations, setObservations] = useState<SystemObservation[]>([])
  const [driftSignals, setDriftSignals] = useState<DriftSignal[]>([])

  const handleRatingChange = (domainId: DomainId, rating: number) => {
    setRatings(prev => ({
      ...prev,
      [domainId]: { ...prev[domainId], alignmentRating: rating },
    }))
  }

  const handleReflectionChange = (domainId: DomainId, text: string) => {
    setRatings(prev => ({
      ...prev,
      [domainId]: { ...prev[domainId], reflectionText: text },
    }))
  }

  const handleSubmit = useCallback(async () => {
    if (!manualId) return
    setSubmitting(true)

    try {
      const responses: Record<string, CheckinResponse> = {}
      for (const domainId of DOMAIN_ORDER) {
        const r = ratings[domainId]
        responses[domainId] = {
          manualId,
          reflectionText: r.reflectionText,
          alignmentRating: r.alignmentRating,
          driftNotes: r.driftNotes || undefined,
        }
      }

      const checkinId = await submitCheckin(responses)
      setSubmitted(true)

      // Generate AI observations
      setGenerating(true)
      try {
        const result = await generateObservations(checkinId)
        setObservations(result.observations as SystemObservation[])
        setDriftSignals(result.driftSignals as DriftSignal[])
      } catch (err) {
        console.error('Failed to generate observations:', err)
      } finally {
        setGenerating(false)
      }
    } catch (err) {
      console.error('Failed to submit check-in:', err)
    } finally {
      setSubmitting(false)
    }
  }, [ratings, manualId, submitCheckin, generateObservations])

  const handleAcknowledge = useCallback(async (signalId: string) => {
    const checkinId = currentCheckin?.id
    if (!checkinId) return
    try {
      await acknowledgeDriftSignal(checkinId, signalId)
      setDriftSignals(prev => prev.map(ds =>
        ds.id === signalId ? { ...ds, acknowledged: true } : ds
      ))
    } catch (err) {
      console.error('Failed to acknowledge:', err)
    }
  }, [currentCheckin, acknowledgeDriftSignal])

  if (!householdManual) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-stone-400">Complete onboarding first to enable check-ins.</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-stone-900">Check-in</h1>
        <p className="text-stone-500 mt-1">Weekly coherence reflection</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-stone-100 rounded-lg p-1">
        <button
          onClick={() => setTab('checkin')}
          className={`flex-1 text-sm py-2 rounded-md font-medium transition-colors ${
            tab === 'checkin' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'
          }`}
        >
          This Week
        </button>
        <button
          onClick={() => setTab('history')}
          className={`flex-1 text-sm py-2 rounded-md font-medium transition-colors ${
            tab === 'history' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'
          }`}
        >
          History
        </button>
      </div>

      {/* History tab */}
      {tab === 'history' && (
        <CheckinHistory checkins={recentCheckins} />
      )}

      {/* Checkin tab — already submitted */}
      {tab === 'checkin' && (hasCheckedInThisWeek || submitted) && (
        <div>
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-stone-800 mb-2">
              Checked in for {currentWeek}
            </h2>
          </div>

          {/* AI observations loading */}
          {generating && (
            <div className="bg-stone-50 rounded-xl border border-stone-200 p-6 mb-4 text-center">
              <div className="flex items-center justify-center gap-2 text-stone-500">
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="text-sm">Analyzing your check-in...</span>
              </div>
            </div>
          )}

          {/* AI observations */}
          {observations.length > 0 && (
            <div className="bg-white rounded-xl border border-stone-200 p-5 mb-4">
              <h3 className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-3">Observations</h3>
              <div className="space-y-2">
                {observations.map((obs, i) => (
                  <p key={i} className="text-sm text-stone-600">{obs.text}</p>
                ))}
              </div>
            </div>
          )}

          {/* Drift signals */}
          {driftSignals.filter(ds => !ds.acknowledged).length > 0 && (
            <div className="space-y-2 mb-4">
              <h3 className="text-xs font-medium text-stone-400 uppercase tracking-wider">Drift Signals</h3>
              {driftSignals.filter(ds => !ds.acknowledged).map(signal => (
                <DriftSignalCard
                  key={signal.id}
                  signal={signal}
                  onAcknowledge={handleAcknowledge}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Checkin tab — form */}
      {tab === 'checkin' && !hasCheckedInThisWeek && !submitted && (
        <>
          <p className="text-xs text-stone-400 mb-6">{currentWeek}</p>

          <div className="space-y-6">
            {DOMAIN_ORDER.map(domainId => (
              <div key={domainId} className="bg-white rounded-xl border border-stone-200 p-5">
                <h3 className="font-medium text-stone-800 mb-3">{DOMAIN_NAMES[domainId]}</h3>

                {/* Rating */}
                <div className="flex gap-2 mb-3">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      onClick={() => handleRatingChange(domainId, n)}
                      className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${
                        ratings[domainId].alignmentRating === n
                          ? 'bg-stone-900 text-white'
                          : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>

                {/* Reflection */}
                <textarea
                  value={ratings[domainId].reflectionText}
                  onChange={(e) => handleReflectionChange(domainId, e.target.value)}
                  placeholder="Any reflection? (optional)"
                  rows={2}
                  className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-transparent"
                />
              </div>
            ))}
          </div>

          <div className="mt-8 text-center">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-8 py-3 bg-stone-900 text-white rounded-xl hover:bg-stone-800 disabled:opacity-50 font-medium"
            >
              {submitting ? 'Saving...' : 'Submit check-in'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
