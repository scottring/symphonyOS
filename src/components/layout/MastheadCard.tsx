// The one masthead every planning page wears (Scott, 2026-09-06: "the day bar
// is a nice visual anchor" — bring the SHAPE everywhere, not the day's
// content). Today grew this card first; Week and the Month/Season/Year pages
// now share it, each filling the slots with its own period:
//
//   eyebrow   the period nav — "‹ SUNDAY · SEPTEMBER 6 ⌄ ›", "‹ WEEK ›"
//   title     the serif headline — a greeting on Today, the dates on Week,
//             "This Month" on the period pages
//   subline   one quiet line — Next: …, the range presets, a look-back cue
//   controls  page chrome in the corner (domain chooser, assistant toggle)
//   footer    the page's own controls along the foot (Today's dropdowns)
//
// It wears the user's Place (PlaceWash) the way Today's card did, so the
// anchor reads the same on every page. Library pages keep PageMasthead —
// they are lists, not periods.
import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PlaceWash } from '@/components/place/PlaceWash'

export function MastheadCard({ eyebrow, title, subline, controls, footer, className = '' }: {
  eyebrow?: ReactNode
  title: ReactNode
  subline?: ReactNode
  controls?: ReactNode
  footer?: ReactNode
  className?: string
}) {
  return (
    <section
      data-testid="masthead-card"
      className={`relative mx-3 mb-4 rounded-2xl border border-neutral-200/80 bg-bg-elevated shadow-sm md:mx-0 ${className}`}
    >
      <PlaceWash />
      <div className="relative px-4 py-4 md:px-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {eyebrow && <div data-testid="masthead-eyebrow" className="mb-1 -ml-1.5">{eyebrow}</div>}
            <h1 className="font-display text-[28px] font-semibold leading-tight text-neutral-950 md:text-[34px]">
              {title}
            </h1>
            {subline && <div className="mt-1 max-w-2xl text-sm text-neutral-500 md:text-[15px]">{subline}</div>}
          </div>
          {controls && <div className="hidden shrink-0 md:block">{controls}</div>}
        </div>
        {footer && <div className="mt-4 flex flex-wrap items-end justify-end gap-3">{footer}</div>}
      </div>
    </section>
  )
}

/** The eyebrow nav for a period that isn't a single day: prev/next carets
 *  around an uppercase label, in DayNavCluster's inline grammar so Week and
 *  Month read like Today's date line. `trailing` takes a small chip ("Last
 *  month", "Back to this week"). */
export function PeriodNavEyebrow({ label, onPrev, onNext, prevLabel, nextLabel, trailing }: {
  label: ReactNode
  onPrev: () => void
  onNext: () => void
  prevLabel: string
  nextLabel: string
  trailing?: ReactNode
}) {
  return (
    <div className="relative inline-flex min-w-0 items-center gap-0.5">
      <button
        type="button"
        aria-label={prevLabel}
        onClick={onPrev}
        className="rounded-lg p-1.5 text-neutral-300 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="truncate px-1.5 py-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
        {label}
      </span>
      <button
        type="button"
        aria-label={nextLabel}
        onClick={onNext}
        className="rounded-lg p-1.5 text-neutral-300 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
      {trailing}
    </div>
  )
}
