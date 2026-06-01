// src/components/schedule/StatsRow.tsx
import { CheckCircle2 } from 'lucide-react'

interface StatsRowProps {
  dueToday: number
  doneToday: number
  thisWeek: number
  total?: number          // kept in interface to avoid churn at call sites; not rendered
  clarityLabel?: string   // kept in interface; not rendered (clarityTrigger used instead)
  aiAvailable?: boolean   // kept in interface; not rendered
  clarityTrigger?: React.ReactNode
  weekTrigger?: React.ReactNode
  /** Glanceable "N to discuss" badge, rendered among the stats. */
  discussionTrigger?: React.ReactNode
  /** Compact weather chip, rendered among the stats. */
  weatherTrigger?: React.ReactNode
  /** Rendered at the trailing end of the bar (assignee filter + show-daily toggle) */
  endControls?: React.ReactNode
}

export function StatsRow({ dueToday, doneToday, weekTrigger, thisWeek, clarityTrigger, discussionTrigger, weatherTrigger, endControls }: StatsRowProps) {
  return (
    <div className="flex items-center flex-wrap gap-x-5 gap-y-2 text-[13px] text-neutral-500">
      {/* Done today — desktop only on mobile we just want the filters */}
      <span className="hidden md:inline-flex items-center gap-1.5">
        <CheckCircle2 className="w-4 h-4 text-primary-500" />
        {doneToday} of {dueToday} done today
      </span>

      {/* This week — desktop only */}
      <span className="hidden md:inline-flex items-center gap-1.5">
        {weekTrigger ?? <>{thisWeek} {thisWeek === 1 ? 'task' : 'tasks'} this week</>}
      </span>

      {/* Clarity — desktop only */}
      {clarityTrigger && (
        <span className="hidden md:inline-flex items-center gap-1.5">
          {clarityTrigger}
        </span>
      )}

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
