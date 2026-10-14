// src/components/routine/WhereItShows.tsx
//
// "Where it shows" — Today, the week and the kitchen kiosk, each with a plain
// reason (lib/routines/explain.ts), as a list at the top of a routine's panel.

import { Check, Minus } from 'lucide-react'
import type { RoutineExplanation, SurfaceExplanation } from '@/lib/routines/explain'

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

