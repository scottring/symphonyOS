import type { ChildScreenTimeSummary } from '@/hooks/useScreenTime'
import { FAMILY_COLORS, type FamilyMemberColor } from '@/types/family'

interface WallScreenTimeWidgetProps {
  summaries: ChildScreenTimeSummary[]
}

const STATUS_COLORS = {
  green: 'bg-green-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
} as const

const STATUS_TRACK = {
  green: 'bg-green-100',
  amber: 'bg-amber-100',
  red: 'bg-red-100',
} as const

export function WallScreenTimeWidget({ summaries }: WallScreenTimeWidgetProps) {
  if (summaries.length === 0) return null

  return (
    <div className="px-8 py-5 border-b border-neutral-200/40">
      <div className="text-[1rem] font-semibold uppercase tracking-[0.15em] text-neutral-400 mb-3">
        Screen Time
      </div>

      <div className="space-y-3">
        {summaries.map(child => {
          const colors = FAMILY_COLORS[child.color as FamilyMemberColor]
          const barPercent = Math.min(child.percentUsed, 100)
          const penalties = child.adjustments.filter(a => a.minutes < 0)

          return (
            <div key={child.familyMemberId}>
              {/* Name + usage */}
              <div className="flex items-center gap-3 mb-1">
                {colors && (
                  <div className={`w-4 h-4 rounded-full shrink-0 ${colors.bg} ring-2 ${colors.ring}`} />
                )}
                <span className="text-[1.25rem] font-medium text-neutral-700 truncate">
                  {child.childName}
                </span>
                <span className="text-[1.25rem] text-neutral-400 ml-auto shrink-0 tabular-nums">
                  {child.usedMinutes}/{child.effectiveBudget}m
                </span>
              </div>

              {/* Progress bar */}
              <div className={`h-3.5 rounded-full ${STATUS_TRACK[child.status]} overflow-hidden`}>
                <div
                  className={`h-full rounded-full transition-all ${STATUS_COLORS[child.status]}`}
                  style={{ width: `${barPercent}%` }}
                />
              </div>

              {/* Penalty annotations */}
              {penalties.length > 0 && (
                <div className="mt-1">
                  {penalties.map(p => (
                    <div key={p.id} className="text-[0.95rem] text-red-500 truncate">
                      {p.minutes}m: {p.reason}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
