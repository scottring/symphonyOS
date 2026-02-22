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
    <div className="flex-1 px-6 py-3 min-w-0">
      <div className="text-[0.65rem] font-semibold uppercase tracking-widest text-neutral-400 mb-2">
        Screen Time
      </div>

      <div className="space-y-2">
        {summaries.map(child => {
          const colors = FAMILY_COLORS[child.color as FamilyMemberColor]
          const barPercent = Math.min(child.percentUsed, 100)
          const penalties = child.adjustments.filter(a => a.minutes < 0)

          return (
            <div key={child.familyMemberId}>
              {/* Name + usage */}
              <div className="flex items-center gap-2 mb-0.5">
                {colors && (
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${colors.bg} ring-1 ${colors.ring}`} />
                )}
                <span className="text-sm font-medium text-neutral-700 truncate">
                  {child.childName}
                </span>
                <span className="text-sm text-neutral-400 ml-auto shrink-0">
                  {child.usedMinutes} / {child.effectiveBudget} min
                </span>
              </div>

              {/* Progress bar */}
              <div className={`h-2 rounded-full ${STATUS_TRACK[child.status]} overflow-hidden`}>
                <div
                  className={`h-full rounded-full transition-all ${STATUS_COLORS[child.status]}`}
                  style={{ width: `${barPercent}%` }}
                />
              </div>

              {/* Penalty annotations */}
              {penalties.length > 0 && (
                <div className="mt-0.5">
                  {penalties.map(p => (
                    <div key={p.id} className="text-[0.65rem] text-red-500 truncate">
                      {p.minutes} min: {p.reason}
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
