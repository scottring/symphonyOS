// CheckinFlow — Weekly coherence check-in wizard
// Rate each domain 1-5 and add optional reflections

import { useState, useCallback } from 'react'
import { useHousehold } from '@/hooks/useHousehold'
import { useCheckin } from '@/hooks/useCheckin'
import { useManual } from '@/hooks/useManual'
import { DOMAIN_NAMES, DOMAIN_ORDER } from '@/types/manual'
import type { DomainId } from '@/types/manual'
import type { CheckinResponse } from '@/types/checkin'

interface DomainRating {
  alignmentRating: number
  reflectionText: string
  driftNotes: string
}

export function CheckinFlow() {
  const { household } = useHousehold()
  const householdId = household?.id ?? null
  const { hasCheckedInThisWeek, currentWeek, submitCheckin } = useCheckin(householdId)
  const { manuals } = useManual(householdId)

  const householdManual = manuals.find(m => m.type === 'household')
  const manualId = householdManual?.id ?? ''

  const [ratings, setRatings] = useState<Record<DomainId, DomainRating>>(() => {
    const initial: Record<string, DomainRating> = {}
    for (const id of DOMAIN_ORDER) {
      initial[id] = { alignmentRating: 3, reflectionText: '', driftNotes: '' }
    }
    return initial as Record<DomainId, DomainRating>
  })

  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

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

      await submitCheckin(responses)
      setSubmitted(true)
    } catch (err) {
      console.error('Failed to submit check-in:', err)
    } finally {
      setSubmitting(false)
    }
  }, [ratings, manualId, submitCheckin])

  if (hasCheckedInThisWeek || submitted) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-stone-800 mb-2">
          Checked in for {currentWeek}
        </h2>
        <p className="text-stone-500">
          Your weekly coherence reflection is saved. Check back next week.
        </p>
      </div>
    )
  }

  if (!householdManual) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-stone-400">Complete onboarding first to enable check-ins.</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-stone-900">Weekly Check-in</h1>
        <p className="text-stone-500 mt-1">
          How aligned is your family this week? Rate each domain 1-5.
        </p>
        <p className="text-xs text-stone-400 mt-1">{currentWeek}</p>
      </div>

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
    </div>
  )
}
