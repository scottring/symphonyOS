// src/components/schedule/StatsRow.tsx
// Controls-only strip: the unified Today header (TodayProgress) now owns the
// numeric counts, so this row carries just the interactive triggers and
// end-controls (Clarity, discussion, email nudge, assignee filter, toggles).

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

export function StatsRow({ weekTrigger, clarityTrigger, discussionTrigger, weatherTrigger, emailTrigger, endControls }: StatsRowProps) {
  return (
    <div data-testid="today-controls" className="flex items-center flex-wrap gap-x-5 gap-y-2 text-[15px] text-neutral-600">
      {/* This week staging trigger — desktop only, demoted */}
      {weekTrigger && (
        <span className="hidden md:inline-flex items-center gap-1.5 text-[12px] text-neutral-400">
          {weekTrigger}
        </span>
      )}

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
