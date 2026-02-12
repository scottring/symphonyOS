// CheckinHistory — List of past check-ins with expandable details and trend chart

import { useState } from 'react'
import type { CoherenceCheckin } from '@/types/checkin'
import { DOMAIN_NAMES, DOMAIN_ORDER } from '@/types/manual'
import type { DomainId } from '@/types/manual'

interface CheckinHistoryProps {
  checkins: CoherenceCheckin[]
}

function DomainTrendChart({ checkins }: { checkins: CoherenceCheckin[] }) {
  // Simple SVG sparkline per domain (last 8 weeks, most recent on right)
  const sorted = [...checkins].reverse().slice(-8)
  if (sorted.length < 2) return null

  const width = 200
  const height = 40
  const padding = 4

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5 mb-6">
      <h3 className="text-sm font-medium text-stone-500 mb-4">Trends (last {sorted.length} weeks)</h3>
      <div className="grid grid-cols-2 gap-4">
        {DOMAIN_ORDER.map(domainId => {
          const points = sorted.map((c, i) => {
            const resp = c.responses[domainId]
            const rating = resp?.alignmentRating ?? 3
            const x = padding + (i / (sorted.length - 1)) * (width - 2 * padding)
            const y = height - padding - ((rating - 1) / 4) * (height - 2 * padding)
            return { x, y, rating }
          })

          const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
          const lastRating = points[points.length - 1]?.rating ?? 3
          const color = lastRating >= 4 ? '#059669' : lastRating >= 3 ? '#d97706' : '#dc2626'

          return (
            <div key={domainId} className="flex items-center gap-2">
              <span className="text-[10px] text-stone-400 w-20 truncate">{DOMAIN_NAMES[domainId]}</span>
              <svg width={width} height={height} className="shrink-0">
                <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                {points.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r="2" fill={color} />
                ))}
              </svg>
              <span className="text-xs font-medium" style={{ color }}>{lastRating}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function CheckinHistory({ checkins }: CheckinHistoryProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (checkins.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-stone-400">No check-in history yet.</p>
      </div>
    )
  }

  return (
    <div>
      <DomainTrendChart checkins={checkins} />

      <div className="space-y-2">
        {checkins.map(checkin => {
          const expanded = expandedId === checkin.id
          const responses = Object.entries(checkin.responses || {})
          const avgRating = responses.length > 0
            ? (responses.reduce((sum, [, r]) => sum + (r?.alignmentRating || 0), 0) / responses.length).toFixed(1)
            : '--'

          return (
            <div key={checkin.id} className="bg-white rounded-xl border border-stone-200 overflow-hidden">
              <button
                onClick={() => setExpandedId(expanded ? null : checkin.id)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-stone-50 transition-colors"
              >
                <div className="text-left">
                  <span className="text-sm font-medium text-stone-800">{checkin.week}</span>
                  <span className="text-xs text-stone-400 ml-2">
                    {new Date(checkin.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-medium ${
                    Number(avgRating) >= 4 ? 'text-emerald-600' :
                    Number(avgRating) >= 3 ? 'text-amber-600' :
                    'text-red-600'
                  }`}>
                    Avg: {avgRating}
                  </span>
                  <svg
                    className={`w-4 h-4 text-stone-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </div>
              </button>

              {expanded && (
                <div className="px-5 pb-5 border-t border-stone-100 pt-4 space-y-3">
                  {DOMAIN_ORDER.map(domainId => {
                    const resp = checkin.responses[domainId]
                    if (!resp) return null
                    return (
                      <div key={domainId} className="flex items-start gap-3">
                        <div className="flex gap-0.5 shrink-0 mt-0.5">
                          {[1, 2, 3, 4, 5].map(n => (
                            <div
                              key={n}
                              className={`w-2 h-2 rounded-full ${
                                n <= resp.alignmentRating
                                  ? resp.alignmentRating >= 4 ? 'bg-emerald-400' :
                                    resp.alignmentRating >= 3 ? 'bg-amber-400' : 'bg-red-400'
                                  : 'bg-stone-200'
                              }`}
                            />
                          ))}
                        </div>
                        <div className="min-w-0">
                          <span className="text-xs font-medium text-stone-500">{DOMAIN_NAMES[domainId as DomainId]}</span>
                          {resp.reflectionText && (
                            <p className="text-sm text-stone-600 mt-0.5">{resp.reflectionText}</p>
                          )}
                        </div>
                      </div>
                    )
                  })}

                  {checkin.system_observations?.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-stone-100">
                      <p className="text-xs font-medium text-stone-400 mb-2">AI Observations</p>
                      {checkin.system_observations.map((obs, i) => (
                        <p key={i} className="text-sm text-stone-600 mb-1">{obs.text}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
