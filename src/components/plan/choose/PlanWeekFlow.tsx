// "Plan this week" (spec 2026-10-19): Choose from October, then Give them a
// day, on the page's scenery. "Place them" (?place=1) opens straight on the
// days. Leave keeps everything already saved — each choice saved as it was made.

import { useState } from 'react'
import { ChoosePlan, type ChooseItemView, type ChooseLineView } from './ChoosePlan'
import { readChooseView, writeChooseView, type ChooseViewMode } from '@/lib/planning/chooseView'
import { GiveThemADay, type PlaceItem } from './GiveThemADay'
import type { StripDay } from '@/components/plan/deck/WeekStrip'

export interface WeekChoose {
  monthWord: string
  lines: ChooseLineView[]
  doneLines: ChooseLineView[]
  loose: ChooseItemView[]
  onAddLoose: (title: string) => Promise<boolean>
  placeItems: PlaceItem[]
  placedCount: number
}

export function PlanWeekFlow({ mode, choose, stripDays, loading, aged = 0, onSeeAged, onFinish, onLeave }: {
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
}) {
  const [step, setStep] = useState<'choose' | 'days'>(mode === 'place' ? 'days' : 'choose')
  const [view, setView] = useState<ChooseViewMode>(readChooseView)
  const [finishing, setFinishing] = useState(false)
  const finish = async () => {
    setFinishing(true)
    try { await onFinish() } finally { setFinishing(false) }
  }

  return <section className="deck choose-flow" aria-label="Plan this week">
    {step === 'choose'
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
