import type { WeeklyStats as WeeklyStatsType } from '@/hooks/useWeeklyFeedback'
import { QUICK_REACT_CONFIG } from '@/types/playbook'
import type { QuickReact } from '@/types/playbook'

interface WeeklyStatsProps {
  stats: WeeklyStatsType
}

export function WeeklyStats({ stats }: WeeklyStatsProps) {
  const pct = Math.round(stats.completionRate * 100)
  const totalReacts = stats.reactBreakdown['nailed-it'] + stats.reactBreakdown['okay'] + stats.reactBreakdown['tough']

  return (
    <div className="rounded-xl border border-neutral-200/60 bg-white p-4">
      <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">Week Summary</h3>

      <div className="grid grid-cols-3 gap-4 mb-3">
        {/* Completion */}
        <div className="text-center">
          <div className="text-2xl font-display font-bold text-neutral-800 tabular-nums">{pct}%</div>
          <div className="text-[10px] text-neutral-400 mt-0.5">Completed</div>
          <div className="text-[10px] text-neutral-400">{stats.completedInstances}/{stats.totalInstances}</div>
        </div>

        {/* React breakdown */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-1">
            {(Object.entries(stats.reactBreakdown) as [QuickReact, number][]).map(([react, count]) => (
              <div key={react} className="text-center">
                <div className="text-lg">{QUICK_REACT_CONFIG[react].emoji}</div>
                <div className="text-[10px] text-neutral-500 tabular-nums">{count}</div>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-neutral-400 mt-0.5">{totalReacts} reactions</div>
        </div>

        {/* Top tags */}
        <div>
          <div className="text-[10px] text-neutral-400 mb-1">Top Tags</div>
          {stats.topTags.length === 0 ? (
            <span className="text-[10px] text-neutral-300 italic">No tags yet</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {stats.topTags.slice(0, 3).map(({ tag, count }) => (
                <span key={tag} className="px-1.5 py-0.5 rounded bg-neutral-100 text-[9px] text-neutral-500">
                  {tag} ({count})
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
