import { scoreToColor } from '@/config/layers'
import type { LayerDomainConfig } from '@/config/layers'
import type { DomainAssessment } from '@/types/layer'

interface DomainDetailProps {
  domain: LayerDomainConfig
  assessment: DomainAssessment
  accentColor: string
  onBack: () => void
  onReassess: () => void
  onGoDeeper: () => void
}

export function DomainDetail({
  domain,
  assessment,
  accentColor,
  onBack,
  onReassess,
  onGoDeeper,
}: DomainDetailProps) {
  const colors = scoreToColor(assessment.harmonyScore)
  const pct = assessment.harmonyScore

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-2xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={onBack}
            className="p-2 -ml-2 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
          </button>
          <div className="flex-1">
            <h1 className="font-display text-2xl font-semibold text-neutral-800">{domain.name}</h1>
          </div>
          <span className={`text-2xl font-bold ${colors.text}`}>{pct}/100</span>
        </div>

        {/* Score bar */}
        <div className="w-full h-3 bg-neutral-100 rounded-full overflow-hidden mb-4">
          <div
            className={`h-full rounded-full transition-all duration-500 ${accentColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Summary */}
        {assessment.summary && (
          <p className="text-neutral-600 italic text-sm leading-relaxed mb-8 px-1">
            &ldquo;{assessment.summary}&rdquo;
          </p>
        )}

        {/* Challenge note (from quick assessment) */}
        {!assessment.summary && assessment.challengeNote && (
          <div className="mb-8 px-1">
            <p className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-1">Your note</p>
            <p className="text-sm text-neutral-600">{assessment.challengeNote}</p>
          </div>
        )}

        {/* Strengths */}
        {assessment.strengths.length > 0 && (
          <section className="mb-6">
            <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Strengths</h2>
            <ul className="space-y-2">
              {assessment.strengths.map((s, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-neutral-700">
                  <svg className="w-4 h-4 text-green-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  {s}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Issues */}
        {assessment.issues.length > 0 && (
          <section className="mb-6">
            <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Needs Attention</h2>
            <ul className="space-y-2">
              {assessment.issues.map((s, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-neutral-700">
                  <svg className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01" />
                  </svg>
                  {s}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Opportunities */}
        {assessment.opportunities.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Opportunities</h2>
            <ul className="space-y-2">
              {assessment.opportunities.map((s, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-neutral-700">
                  <span className="text-primary-500 mt-0.5 shrink-0">→</span>
                  {s}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* If no detailed data yet (quick assessment only), nudge to go deeper */}
        {assessment.strengths.length === 0 && assessment.issues.length === 0 && (
          <div className="text-center py-8 px-4 bg-neutral-50 rounded-xl border border-neutral-100 mb-8">
            <p className="text-sm text-neutral-500 mb-1">
              You've rated this domain but haven't done a deep assessment yet.
            </p>
            <p className="text-sm text-neutral-400">
              Go deeper for personalized strengths, issues, and action items.
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={onReassess}
            className="flex-1 py-3 rounded-xl border border-neutral-200 text-sm font-medium text-neutral-600 hover:bg-neutral-50 transition-colors"
          >
            Re-assess
          </button>
          <button
            onClick={onGoDeeper}
            className="flex-1 py-3 rounded-xl bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors"
          >
            Go Deeper →
          </button>
        </div>
      </div>
    </div>
  )
}
