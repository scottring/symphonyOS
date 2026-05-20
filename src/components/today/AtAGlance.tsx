import { CheckCircle2, Sparkles } from 'lucide-react'

interface AtAGlanceProps {
  /** Open tasks for today (scheduled, not in inbox, not completed). */
  openTaskCount: number
}

/**
 * Right-rail "At a Glance" digest. Intentionally minimal for now — one line
 * summarizing today's open work. Mockup-rich variants (events today,
 * tomorrow's first event, person presence, ingredients needed) are deferred
 * until the data sources are properly threaded; expanding the panel before
 * then would just be more text without more signal.
 */
export function AtAGlance({ openTaskCount }: AtAGlanceProps) {
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

      {openTaskCount === 0 ? (
        <p className="flex items-center gap-2 text-[13px] text-neutral-500">
          <Sparkles className="w-4 h-4 text-primary-500" aria-hidden />
          <span>All clear for today.</span>
        </p>
      ) : (
        <p className="flex items-center gap-2 text-[13px] text-neutral-700">
          <CheckCircle2 className="w-4 h-4 text-primary-500 shrink-0" aria-hidden />
          <span>
            {openTaskCount} {openTaskCount === 1 ? 'task' : 'tasks'} still open
          </span>
        </p>
      )}
    </section>
  )
}
