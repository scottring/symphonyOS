// src/components/schedule/StatsRow.tsx
import { ListChecks } from 'lucide-react'

interface StatsRowProps {
  dueToday: number
  doneToday: number
  thisWeek: number
  total?: number          // kept in interface to avoid churn at call sites; not rendered
  clarityLabel?: string   // kept in interface; not rendered (clarityTrigger used instead)
  aiAvailable?: boolean   // kept in interface; not rendered
  /** Interactive Clarity ring + remediation popover, rendered among the stats. */
  clarityTrigger?: React.ReactNode
  weekTrigger?: React.ReactNode
  /** Glanceable "N to discuss" badge, rendered among the stats. */
  discussionTrigger?: React.ReactNode
  /** Compact weather chip, rendered among the stats. */
  weatherTrigger?: React.ReactNode
  /** Glanceable "N from email" nudge, navigates to Inbox when clicked. */
  emailTrigger?: React.ReactNode
  /** Rendered at the trailing end of the bar (assignee filter + show-daily toggle) */
  endControls?: React.ReactNode
}

export function StatsRow({ dueToday, doneToday, weekTrigger, thisWeek, clarityTrigger, discussionTrigger, weatherTrigger, emailTrigger, endControls }: StatsRowProps) {
  const remainingToday = Math.max(0, dueToday - doneToday)
  return (
    <div className="flex items-center flex-wrap gap-x-5 gap-y-2 text-[13px] text-neutral-500">
      {/* Tasks remaining today — checklist icon + count (desktop only, demoted) */}
      <span
        className="hidden md:inline-flex items-center gap-1.5 text-[12px] text-neutral-400"
        title={`${remainingToday} task${remainingToday === 1 ? '' : 's'} remaining today (${doneToday} of ${dueToday} done)`}
      >
        <ListChecks className="w-3.5 h-3.5 text-neutral-300" />
        <span className="tabular-nums">{remainingToday}</span>
      </span>

      {/* This week — desktop only, demoted */}
      <span className="hidden md:inline-flex items-center gap-1.5 text-[12px] text-neutral-400">
        {weekTrigger ?? <>{thisWeek} {thisWeek === 1 ? 'task' : 'tasks'} this week</>}
      </span>

      {/* Clarity — interactive ring + remediation popover (desktop only) */}
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

      {emailTrigger && (
        <span className="hidden md:inline-flex items-center gap-1.5">
          {emailTrigger}
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
