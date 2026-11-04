// src/components/plan/constellation/AboveStrip.tsx
//
// Month and Year's strip (Scott's wireframe, 2026-10-25): the routines that
// run at this page's pace, with when each falls in the period. The level
// above that used to be its first tab now lies folded beside the page
// (PaperFold and AboveSheet, paper-style horizons 2026-11-04), for reading.
// Season runs no routines of its own, so it has no strip.
//
// StripRoutineList is exported so Month's Maintenance and fun step shows it too.

import { HorizonStrip } from '@/components/canvas/strip/HorizonStrip'

export interface StripRoutine { id: string; title: string; when: string; onOpen?: () => void }

/** The routines at this page's pace, with when each falls in the period. */
export function StripRoutineList({ routines, empty, note, label }: {
  routines: StripRoutine[]
  empty?: string
  note?: string
  /** The list's accessible name, where it stands outside the strip's tab. */
  label?: string
}) {
  return <>
    {routines.length === 0 && <p className="hs-empty">{empty}</p>}
    <ul className="hs-list" aria-label={label}>
      {routines.map((r) => (
        <li key={r.id} className="hs-row">
          <span className="hs-row-body">
            {r.onOpen ? <button type="button" className="hs-row-title" onClick={r.onOpen}>{r.title}</button> : <span className="hs-row-title">{r.title}</span>}
            <span className="hs-row-meta">{r.when}</span>
          </span>
        </li>
      ))}
    </ul>
    {note && <p className="hs-note">{note}</p>}
  </>
}

/** The strip with its one tab, Routines. */
export function RoutinesStrip({ id, routines, empty, note }: {
  /** Remembers this page's open/closed ("month", "year"). */
  id: string
  routines: StripRoutine[]
  empty?: string
  note?: string
}) {
  return <HorizonStrip id={id} label="Routines strip" railLabel={`Routines · ${routines.length}`} tabs={[{
    id: 'routines', label: 'Routines', count: routines.length || undefined,
    content: <StripRoutineList routines={routines} empty={empty} note={note} />,
  }]} />
}
