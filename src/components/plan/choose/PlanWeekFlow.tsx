// "Plan this week" (spec 2026-10-19): Choose from October, then Give them a
// day, on the page's scenery. "Place them" (?place=1) opens straight on the
// days. Leave keeps everything already saved — each choice saved as it was made.

import { useState } from 'react'
import { ChoosePlan, type ChooseItemView, type ChooseLineView } from './ChoosePlan'
import { readChooseView, writeChooseView, type ChooseViewMode } from '@/lib/planning/chooseView'
import { GiveThemADay, type PlaceItem } from './GiveThemADay'
import { LookingBack } from './LookingBack'
import type { ReviewNotes } from '@/hooks/usePeriodReview'
import type { StripDay } from '@/components/plan/deck/WeekStrip'

export interface WeekChoose {
  monthWord: string
  lines: ChooseLineView[]
  doneLines: ChooseLineView[]
  loose: ChooseItemView[]
  onAddLoose: (title: string) => Promise<boolean>
  placeItems: PlaceItem[]
  placedCount: number
  /** Last week's still open (Looking back's count). */
  notDoneLastWeek: number
}

export function PlanWeekFlow({ mode, choose, stripDays, loading, aged = 0, onSeeAged, onFinish, onLeave, look }: {
  mode: 'full' | 'place'
  choose: WeekChoose
  stripDays: StripDay[]
  loading?: boolean
  /** Untouched things the opening sweep moved to Later, and where to see them. */
  aged?: number
  onSeeAged?: () => void
  /** Done planning: the closing writes and records. Resolves when finished. */
  onFinish: () => Promise<void>
  onLeave: () => void
  /** Looking back at last week first (its review): its count, what was said, and the save. */
  look?: { done: number; outOf?: number; alsoDone?: readonly { id: string; title: string }[]; initial?: ReviewNotes | null; reviewed?: string | null; onContinue: (notes: ReviewNotes) => Promise<boolean> }
}) {
  const [step, setStep] = useState<'look' | 'choose' | 'days'>(mode === 'place' ? 'days' : look ? 'look' : 'choose')
  const [view, setView] = useState<ChooseViewMode>(readChooseView)
  const [finishing, setFinishing] = useState(false)
  const finish = async () => {
    setFinishing(true)
    try { await onFinish() } finally { setFinishing(false) }
  }

  return <section className="deck choose-flow" aria-label="Plan this week">
    {step === 'look' && look
      ? <LookingBack kicker="Review last week · then plan this week" periodWord="Last week" done={look.done} outOf={look.outOf} alsoDone={look.alsoDone} notDone={choose.notDoneLastWeek}
          initial={look.initial} reviewed={look.reviewed} nextLabel={`On to ${choose.monthWord} goals → this week`} onLeave={onLeave}
          onContinue={async (notes) => { const ok = await look.onContinue(notes); if (ok) setStep('choose'); return ok }} />
      : step === 'choose'
      ? <ChoosePlan hereWord="this week" aboveWord={choose.monthWord} lines={choose.lines} doneLines={choose.doneLines} loose={choose.loose}
          kicker={`${choose.monthWord} goals → this week`} onLeave={onLeave}
          onAddLoose={choose.onAddLoose} loading={loading}
          planned={aged > 0 ? <>Moved {aged} untouched {aged === 1 ? 'thing' : 'things'} to Later · <button type="button" className="deck-link" onClick={onSeeAged}>See them</button></> : undefined}
          view={view} onViewChange={(v) => { setView(v); writeChooseView(v) }}
          primary={{ label: 'Give them a day', run: () => setStep('days') }} />
      : <GiveThemADay days={stripDays} items={choose.placeItems} placedCount={choose.placedCount} onLeave={onLeave}
          onBack={mode === 'full' ? () => setStep('choose') : undefined}
          primary={mode === 'full'
            ? { label: 'Done planning', run: finish, busy: finishing }
            : { label: 'Done', run: onLeave }} />}
  </section>
}
