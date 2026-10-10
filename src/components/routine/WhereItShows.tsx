// src/components/routine/WhereItShows.tsx
//
// "Where it shows" — Today, the week and the kitchen kiosk, each with a plain
// reason (lib/routines/explain.ts). Two forms: the full list at the top of a
// routine's panel, and compact chips on a Routines page row.

import { Check, Minus } from 'lucide-react'
import type { Routine } from '@/types/actionable'
import { explanationSummary, type RoutineExplanation, type SurfaceExplanation } from '@/lib/routines/explain'

function SurfaceRow({ s }: { s: SurfaceExplanation }) {
  return (
    <li className={`routine-where-row ${s.shows ? 'is-on' : 'is-off'}`}>
      <span className="routine-where-mark" aria-hidden="true">
        {s.shows ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <Minus className="h-3.5 w-3.5" strokeWidth={3} />}
      </span>
      <span className="routine-where-surface">{s.label}</span>
      <span className="routine-where-reason">
        <span className="sr-only">{s.shows ? 'Shows: ' : 'Not showing: '}</span>
        {s.reason}
      </span>
    </li>
  )
}

/** The panel's "Where it shows" list. */
export function WhereItShows({ explanation, live = false }: { explanation: RoutineExplanation; live?: boolean }) {
  return (
    <section aria-label="Where it shows" className="routine-where" aria-live={live ? 'polite' : undefined}>
      <h3 className="routine-where-title">Where it shows</h3>
      <ul>
        <SurfaceRow s={explanation.today} />
        <SurfaceRow s={explanation.kiosk} />
        <SurfaceRow s={explanation.week} />
      </ul>
    </section>
  )
}

/**
 * Compact "shows on" chips for a Routines page row: Today · Kiosk · Week,
 * dashed and struck when it doesn't show there. One button — it opens the
 * routine, whose panel says why at length.
 */
export function ShowsOnChips({ routine, explanation, onOpen }: {
  routine: Routine
  explanation: RoutineExplanation
  onOpen: (r: Routine) => void
}) {
  const surfaces = [explanation.today, explanation.kiosk, explanation.week]
  const hidden = surfaces.filter((s) => !s.shows)
  const label = hidden.length > 0
    ? `Why isn't ${routine.name} showing on ${hidden.map((s) => s.label).join(' or ')}? ${explanationSummary(explanation)}`
    : `Where ${routine.name} shows: ${explanationSummary(explanation)}`
  return (
    <button type="button" className="routine-chips" aria-label={label} title={explanationSummary(explanation)} onClick={() => onOpen(routine)}>
      {surfaces.map((s) => (
        <span key={s.surface} className={`routine-chip ${s.shows ? 'is-on' : 'is-off'}`}>{s.label}</span>
      ))}
    </button>
  )
}
