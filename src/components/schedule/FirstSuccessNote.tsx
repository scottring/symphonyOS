import { Link } from 'react-router-dom'
import { CalendarDays, Check, Compass, Plus } from 'lucide-react'

/**
 * The quiet line that follows the first task (walkthrough 2026-10-08): it
 * says where the thing went and leaves a door or two open. One line, all of
 * it optional — "I'm set" retires it, and nothing here takes focus.
 */
export function FirstSuccessNote({ where, onAddAnother, onPlanStep, onDismiss }: {
  /** The end of "Your first thing is …", e.g. "on Today". */
  where: string
  onAddAnother: () => void
  /** Either planning step was taken — the line has done its job. */
  onPlanStep: () => void
  onDismiss: () => void
}) {
  // 44px tap targets on a phone; a plain inline row from the small breakpoint.
  const base = 'inline-flex min-h-[44px] items-center gap-1.5 rounded-md text-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 sm:min-h-0'
  const action = `${base} text-primary-700`
  return (
    <section aria-label="Next step" className="first-success mx-3 mb-4 border-b border-neutral-200 py-3 md:mx-0">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <p role="status" className="flex items-center gap-2 text-sm text-neutral-700">
          <Check className="h-4 w-4 shrink-0 text-primary-600" aria-hidden="true" />
          <span>Your first thing is {where}.</span>
        </p>
        <div className="flex flex-wrap items-center gap-x-4">
          <button type="button" className={action} onClick={onAddAnother}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />Add another
          </button>
          <Link to="/week" className={action} onClick={onPlanStep}>
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />Plan this week
          </Link>
          <Link to="/start" className={action} onClick={onPlanStep}>
            <Compass className="h-3.5 w-3.5" aria-hidden="true" />Plan with guidance
          </Link>
          <button type="button" className={`${base} text-neutral-500`} onClick={onDismiss}>I’m set</button>
        </div>
      </div>
    </section>
  )
}
