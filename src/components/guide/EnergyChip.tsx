// The Energy chip in a page header (Today, Season): "Energy: —", and a tap
// moves it on, low → medium → high → low (planning as tooltips, Task 2; the
// prototype's energy chip). It is the Energy step's home: it writes the same
// note that step wrote (notes.energy), keeping any words already said with
// it. It shows what was last sent while that saves, and says so when a save
// did not land.

import type { GuideNotes } from '@/hooks/usePlanningNotes'
import { useNoteSave } from '@/components/plan/guided/season/useNoteSave'
import './guide.css'

type Energy = NonNullable<GuideNotes['energy']>
const NEXT: Record<Energy['level'] | 'none', Energy['level']> = { none: 'low', low: 'medium', medium: 'high', high: 'low' }

export function EnergyChip({ value, save }: {
  value?: GuideNotes['energy']
  /** Saves the note; false when it did not. */
  save: (energy: Energy) => Promise<boolean>
}) {
  const note = useNoteSave<Energy | undefined>(value, (e) => (e ? save(e) : Promise.resolve(true)))
  const shown = note.value
  const cycle = () => {
    const level = NEXT[shown?.level ?? 'none']
    note.set(shown?.words ? { level, words: shown.words } : { level })
  }
  return (
    <span className="energy-chip-wrap">
      <button type="button" className="energy-chip" data-guide-anchor="energy" onClick={cycle}
        title={shown ? 'Tap to change' : 'How is your energy? Tap to say'}>
        Energy: <b>{shown?.level ?? '—'}</b>
      </button>
      {note.failed && <span className="energy-chip-failed" role="alert">Didn’t save. <button type="button" className="canvas-link" onClick={note.retry}>Try again</button></span>}
    </span>
  )
}
