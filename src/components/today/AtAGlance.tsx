import { CheckCircle2, CalendarDays, Sunrise, Sparkles } from 'lucide-react'

export interface TomorrowEventBrief {
  title: string
  timeLabel: string
}

interface AtAGlanceProps {
  /** Open tasks for today (timed + overdue, not yet complete). */
  openTaskCount: number
  /** Total events on today's calendar (any state). */
  eventsTodayCount: number
  /** Brief for tomorrow's first event, or null if none. */
  tomorrowFirstEvent: TomorrowEventBrief | null
  /** CTA — opens a fuller plan view (this week, day detail). */
  onViewFullPlan: () => void
}

/**
 * Right-rail "At a Glance" digest. Three or fewer lines summarizing what
 * matters now: today's open work, today's event volume, and tomorrow's
 * leading event. Falls back to "All clear" when nothing meaningful surfaces.
 *
 * Person-presence and meal-readiness lines (from the mockup) come from
 * dedicated panels (FamilySnapshot, future meal-status panel) where the
 * data wiring lives.
 */
export function AtAGlance({
  openTaskCount,
  eventsTodayCount,
  tomorrowFirstEvent,
  onViewFullPlan,
}: AtAGlanceProps) {
  const hasAny = openTaskCount > 0 || eventsTodayCount > 0 || !!tomorrowFirstEvent

  return (
    <section
      aria-labelledby="rail-at-a-glance"
      className="card px-5 py-4 bg-bg-elevated border border-neutral-200/60"
    >
      <h2
        id="rail-at-a-glance"
        className="text-[11px] font-medium uppercase tracking-wide text-neutral-400 mb-3"
      >
        At a glance
      </h2>

      {!hasAny && (
        <p className="flex items-center gap-2 text-[13px] text-neutral-500">
          <Sparkles className="w-4 h-4 text-primary-500" aria-hidden />
          <span>All clear for today.</span>
        </p>
      )}

      {hasAny && (
        <ul className="space-y-2">
          {openTaskCount > 0 && (
            <li className="flex items-center gap-2 text-[13px] text-neutral-700">
              <CheckCircle2 className="w-4 h-4 text-primary-500 shrink-0" aria-hidden />
              <span>
                {openTaskCount} {openTaskCount === 1 ? 'task' : 'tasks'} still open
              </span>
            </li>
          )}
          {eventsTodayCount > 0 && (
            <li className="flex items-center gap-2 text-[13px] text-neutral-700">
              <CalendarDays className="w-4 h-4 text-amber-500 shrink-0" aria-hidden />
              <span>
                {eventsTodayCount} {eventsTodayCount === 1 ? 'event' : 'events'} today
              </span>
            </li>
          )}
          {tomorrowFirstEvent && (
            <li className="flex items-center gap-2 text-[13px] text-neutral-700">
              <Sunrise className="w-4 h-4 text-amber-600 shrink-0" aria-hidden />
              <span className="truncate">
                {tomorrowFirstEvent.title} tomorrow {tomorrowFirstEvent.timeLabel}
              </span>
            </li>
          )}
        </ul>
      )}

      <button
        type="button"
        onClick={onViewFullPlan}
        className="
          mt-4 w-full text-center text-[13px] font-medium
          text-primary-700 hover:text-primary-800
          py-1.5 rounded-md hover:bg-primary-50 transition-colors
        "
      >
        View full plan
      </button>
    </section>
  )
}
