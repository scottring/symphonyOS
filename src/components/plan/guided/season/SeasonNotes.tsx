// The season's own notes, each a step body: energy (step 4), the ideal week
// (step 6) and the wild cards (step 7). Each saves into this person's notes
// for the season (usePlanningNotes' patch) on an explicit change, and says so
// when a save did not land.

import type { GuideNotes, NotesPatch } from '@/hooks/usePlanningNotes'
import type { IdealWeek } from '@/lib/guide/idealWeek'
import { EnergyNote } from '@/components/guide/EnergyNote'
import { IdealWeekEditor } from '@/components/guide/IdealWeekEditor'
import type { IdealWeekGoal } from '@/components/guide/IdealWeekSection'
import { WildCards } from './WildCards'
import { useNoteSave } from './useNoteSave'

type Patch = (p: NotesPatch) => Promise<boolean>
const EMPTY_WEEK: IdealWeek = { blocks: [] }
const NO_CARDS: string[] = []
/** A note's save that did not land, with the way to send it again (the Year's notes too). */
export function SaveFailed({ on, retry }: { on: boolean; retry: () => void }) {
  return on
    ? <p className="choose-status is-failed" role="alert">Didn’t save. <button type="button" className="canvas-link" onClick={retry}>Try again</button></p>
    : null
}

export function SeasonEnergy({ value, patch }: { value?: GuideNotes['energy']; patch: Patch }) {
  const note = useNoteSave(value, (energy) => patch({ energy }))
  return <div className="gw-body">
    <EnergyNote value={note.value} onChange={note.set} />
    <SaveFailed on={note.failed} retry={note.retry} />
  </div>
}

/** `goals`: the season's open goals, the ones a block can be for. */
export function SeasonIdealWeek({ value, goals, patch }: { value?: IdealWeek; goals: IdealWeekGoal[]; patch: Patch }) {
  const note = useNoteSave(value ?? EMPTY_WEEK, (idealWeek) => patch({ idealWeek }))
  return <div className="gw-body">
    <IdealWeekEditor value={note.value} goals={goals} onChange={note.set} />
    <SaveFailed on={note.failed} retry={note.retry} />
  </div>
}

export function SeasonWildCards({ value, patch }: { value?: string[]; patch: Patch }) {
  const note = useNoteSave(value ?? NO_CARDS, (wildCards) => patch({ wildCards }))
  return <div className="gw-body">
    <WildCards value={note.value} onChange={note.set} />
    <SaveFailed on={note.failed} retry={note.retry} />
  </div>
}
