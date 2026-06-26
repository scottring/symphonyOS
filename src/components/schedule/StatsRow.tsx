// src/components/schedule/StatsRow.tsx
import { ListChecks, CalendarDays, Star, Repeat, Mail } from 'lucide-react'

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
  // ── Four-count Today layout ───────────────────────────────────────────────
  /** When provided, switches to the redesigned four-stat group (events / focus
   *  items / routines / from email) instead of the legacy tasks-remaining/week
   *  block. Existing callers that omit this prop are unaffected. */
  eventsCount?: number
  focusCount?: number
  routinesCount?: number
  emailCount?: number
}

export function StatsRow({ dueToday, doneToday, weekTrigger, thisWeek, clarityTrigger, discussionTrigger, weatherTrigger, emailTrigger, endControls, eventsCount, focusCount, routinesCount, emailCount }: StatsRowProps) {
  const remainingToday = Math.max(0, dueToday - doneToday)
  return (
    <div className="flex items-center flex-wrap gap-x-5 gap-y-2 text-[15px] text-neutral-600">
      {eventsCount !== undefined ? (
        /* ── Four-count Today layout (redesign) ── */
        <div className="flex items-center flex-wrap gap-x-5 gap-y-2 text-[15px] text-neutral-600">
          <span className="inline-flex items-center gap-1.5"><CalendarDays className="w-5 h-5 text-neutral-500" /><span className="tabular-nums">{eventsCount}</span> events</span>
          <span className="inline-flex items-center gap-1.5"><Star className="w-5 h-5 text-neutral-500" /><span className="tabular-nums">{focusCount ?? 0}</span> focus items</span>
          <span className="inline-flex items-center gap-1.5"><Repeat className="w-5 h-5 text-neutral-500" /><span className="tabular-nums">{routinesCount ?? 0}</span> routines</span>
          <span className="inline-flex items-center gap-1.5"><Mail className="w-5 h-5 text-neutral-500" /><span className="tabular-nums">{emailCount ?? 0}</span> from email</span>
        </div>
      ) : (
        /* ── Legacy tasks-remaining / week block ── */
        <>
          {/* Tasks remaining today — checklist icon + count (desktop only, demoted) */}
          <span
            className="hidden md:inline-flex items-center gap-1.5 text-[15px] text-neutral-600"
            title={`${remainingToday} task${remainingToday === 1 ? '' : 's'} remaining today (${doneToday} of ${dueToday} done)`}
          >
            <ListChecks className="w-5 h-5 text-neutral-500" />
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
        </>
      )}

      {/* End controls: assignee filter + show-daily toggle — always rendered */}
      {endControls && (
        <span className="inline-flex items-center gap-2 ml-auto">
          {endControls}
        </span>
      )}
    </div>
  )
}
