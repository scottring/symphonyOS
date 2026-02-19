import { useState, useCallback } from 'react'
import type { LayerHubConfig, LayerDomainConfig } from '@/config/layers'
import type { DomainAssessment, QuickAssessmentInput } from '@/types/layer'

interface QuickAssessmentProps {
  config: LayerHubConfig
  existingAssessments: DomainAssessment[]
  onSave: (ratings: QuickAssessmentInput[]) => Promise<boolean>
  onBack: () => void
  onGoDeeper?: (domainSlug: string) => void
}

export function QuickAssessment({
  config,
  existingAssessments,
  onSave,
  onBack,
  onGoDeeper,
}: QuickAssessmentProps) {
  // Initialize from existing assessments
  const [ratings, setRatings] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {}
    for (const a of existingAssessments) {
      map[a.domainSlug] = Math.round(a.harmonyScore / 20) // score → 1-5 rating
    }
    return map
  })

  const [notes, setNotes] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    for (const a of existingAssessments) {
      if (a.challengeNote) map[a.domainSlug] = a.challengeNote
    }
    return map
  })

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleRating = useCallback((domainSlug: string, rating: number) => {
    setRatings(prev => ({ ...prev, [domainSlug]: rating }))
  }, [])

  const handleNote = useCallback((domainSlug: string, note: string) => {
    setNotes(prev => ({ ...prev, [domainSlug]: note }))
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    const inputs: QuickAssessmentInput[] = config.domains
      .filter(d => ratings[d.slug] && ratings[d.slug] > 0)
      .map(d => ({
        domainSlug: d.slug,
        rating: ratings[d.slug],
        challengeNote: notes[d.slug] || undefined,
      }))

    const success = await onSave(inputs)
    setSaving(false)
    if (success) {
      setSaved(true)
      setTimeout(() => onBack(), 1200)
    }
  }, [config.domains, ratings, notes, onSave, onBack])

  const ratedCount = Object.values(ratings).filter(r => r > 0).length

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-2xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <button
            onClick={onBack}
            className="p-2 -ml-2 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
          </button>
          <div>
            <h1 className="font-display text-2xl font-semibold text-neutral-800">
              {config.name} Baseline
            </h1>
            <p className="text-sm text-neutral-500">Rate where you are today</p>
          </div>
        </div>

        {/* Domain cards */}
        <div className="mt-8 space-y-4">
          {config.domains.map(domain => (
            <DomainRatingCard
              key={domain.slug}
              domain={domain}
              rating={ratings[domain.slug] || 0}
              note={notes[domain.slug] || ''}
              onRate={(r) => handleRating(domain.slug, r)}
              onNote={(n) => handleNote(domain.slug, n)}
              onGoDeeper={onGoDeeper ? () => onGoDeeper(domain.slug) : undefined}
            />
          ))}
        </div>

        {/* Save button */}
        <div className="sticky bottom-0 bg-gradient-to-t from-bg-base via-bg-base to-transparent pt-8 pb-6 mt-6">
          <button
            onClick={handleSave}
            disabled={ratedCount === 0 || saving || saved}
            className={`
              w-full py-3.5 rounded-xl text-white font-semibold text-sm transition-all
              ${saved
                ? 'bg-green-500'
                : 'bg-primary-600 hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed'
              }
            `}
          >
            {saved ? 'Saved!' : saving ? 'Saving...' : `Save Baseline (${ratedCount}/${config.domains.length})`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Domain Rating Card ──────────────────────────────────────────────

function DomainRatingCard({ domain, rating, note, onRate, onNote, onGoDeeper }: {
  domain: LayerDomainConfig
  rating: number
  note: string
  onRate: (rating: number) => void
  onNote: (note: string) => void
  onGoDeeper?: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-white rounded-xl border border-neutral-150 p-5">
      <div className="flex items-start justify-between mb-1">
        <div>
          <h3 className="font-semibold text-neutral-800">{domain.name}</h3>
          <p className="text-sm text-neutral-500">{domain.subtitle}</p>
        </div>
      </div>

      {/* Rating scale */}
      <div className="mt-4">
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4, 5].map(value => (
            <button
              key={value}
              onClick={() => onRate(value)}
              className={`
                w-11 h-11 rounded-full border-2 text-sm font-bold transition-all
                ${rating === value
                  ? 'border-primary-500 bg-primary-500 text-white scale-110'
                  : 'border-neutral-200 text-neutral-400 hover:border-primary-300 hover:text-primary-500'
                }
              `}
            >
              {value}
            </button>
          ))}
        </div>
        <div className="flex justify-between mt-1.5 px-1">
          <span className="text-[10px] text-neutral-400">Struggling</span>
          <span className="text-[10px] text-neutral-400">Thriving</span>
        </div>
      </div>

      {/* Note area (shows when rated) */}
      {rating > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-neutral-500 hover:text-neutral-700 transition-colors"
          >
            {expanded ? 'Hide details' : domain.promptQuestion}
          </button>

          {expanded && (
            <div className="mt-2 space-y-3">
              <textarea
                value={note}
                onChange={(e) => onNote(e.target.value)}
                placeholder="Optional — a sentence or two..."
                className="w-full text-sm border border-neutral-200 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-300"
                rows={2}
              />
              {onGoDeeper && (
                <button
                  onClick={onGoDeeper}
                  className="text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
                >
                  Go Deeper →
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
