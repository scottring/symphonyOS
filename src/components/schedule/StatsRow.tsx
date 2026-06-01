// src/components/schedule/StatsRow.tsx
import { CheckCircle2 } from 'lucide-react'

interface StatsRowProps {
  dueToday: number
  doneToday: number
  thisWeek: number
  total?: number          // kept in interface to avoid churn at call sites; not rendered
  clarityLabel?: string   // kept in interface; not rendered (Clarity moved to sidebar)
  aiAvailable?: boolean   // kept in interface; not rendered
  weekTrigger?: React.ReactNode
  /** Glanceable "N to discuss" badge, rendered among the stats. */
  discussionTrigger?: React.ReactNode
  /** Compact weather chip, rendered among the stats. */
  weatherTrigger?: React.ReactNode
  /** Rendered at the trailing end of the bar (assignee filter + show-daily toggle) */
  endControls?: React.ReactNode
}

export function StatsRow({ dueToday, doneToday, weekTrigger, thisWeek, discussionTrigger, weatherTrigger, endControls }: StatsRowProps) {
  return (
    <div className="flex items-center flex-wrap gap-x-5 gap-y-2 text-[13px] text-neutral-500">
      {/* Done today — desktop only, demoted */}
      <span className="hidden md:inline-flex items-center gap-1.5 text-[12px] text-neutral-400">
        <CheckCircle2 className="w-3.5 h-3.5 text-neutral-300" />
        {doneToday} of {dueToday} done today
      </span>

      {/* This week — desktop only, demoted */}
      <span className="hidden md:inline-flex items-center gap-1.5 text-[12px] text-neutral-400">
        {weekTrigger ?? <>{thisWeek} {thisWeek === 1 ? 'task' : 'tasks'} this week</>}
      </span>

      {discussionTrigger && (
        <span className="hidden md:inline-flex items-center gap-1.5">
          {discussionTrigger}
        </span>
      )}

      {weatherTrigger && (
        <span className="hidden md:inline-flex items-center gap-1.5">
          {weatherTrigger}
        </span>
      )}

      {/* End controls: assignee filter + show-daily toggle */}
      {endControls && (
        <span className="inline-flex items-center gap-2 ml-auto">
          {endControls}
        </span>
      )}
    </div>
  )
}
