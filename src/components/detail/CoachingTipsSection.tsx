import { useState } from 'react'
import type { CoachingMatch } from '@/lib/coachingMatcher'

interface CoachingTipsSectionProps {
  matches: CoachingMatch[]
}

export function CoachingTipsSection({ matches }: CoachingTipsSectionProps) {
  if (matches.length === 0) return null

  return (
    <div className="mx-4 mt-4">
      {/* Section header */}
      <div className="flex items-center gap-2 mb-3">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-4 h-4 text-amber-500"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" />
        </svg>
        <h3 className="text-sm font-medium text-neutral-600">Coaching</h3>
      </div>

      {/* Tip cards */}
      <div className="space-y-2">
        {matches.map((match) => (
          <CoachingTipCard key={match.rule.id} match={match} />
        ))}
      </div>
    </div>
  )
}

function CoachingTipCard({ match }: { match: CoachingMatch }) {
  const [showRationale, setShowRationale] = useState(false)
  const content = match.rule.enforcementTip || match.rule.rule

  return (
    <div
      className={`rounded-xl ${match.layerColor} border bg-white overflow-hidden`}
    >
      {/* Layer + category label */}
      <div className="px-3 py-1.5 bg-neutral-50/50 border-b border-neutral-100">
        <span className="text-[11px] font-medium text-neutral-400 uppercase tracking-wide">
          {match.layerName} &middot; {match.categoryLabel}
        </span>
      </div>

      {/* Tip content */}
      <div className="px-3 py-2.5">
        <p className="text-sm text-neutral-700 leading-relaxed">{content}</p>

        {/* Rationale toggle */}
        {match.rule.rationale && (
          <button
            onClick={() => setShowRationale(!showRationale)}
            className="mt-1.5 text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
          >
            {showRationale ? 'Hide why' : 'Why?'}
          </button>
        )}

        {showRationale && match.rule.rationale && (
          <p className="mt-1 text-xs text-neutral-500 italic leading-relaxed">
            {match.rule.rationale}
          </p>
        )}
      </div>
    </div>
  )
}
