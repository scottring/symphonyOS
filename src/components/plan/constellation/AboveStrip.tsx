// src/components/plan/constellation/AboveStrip.tsx
//
// Month, Season and Year's strip (Scott's wireframe, 2026-10-25): the level
// above on the left — Fall beside October, 2026 beside Fall, last year beside
// the year — and, where they exist, the routines at this page's pace.
//
// A goal above can be dragged onto a line of this period to put that line
// under it, or onto the list to write something new under it; "→ Oct" does
// the same without a drag. On Year the goals beside it are last year's open
// ones, and "→ 2026" (or a drag) carries one into the year.

import { useState, type DragEvent } from 'react'
import { HorizonStrip, type StripTab } from '@/components/canvas/strip/HorizonStrip'
import { InlineComposer } from '@/components/canvas/plan/InlineComposer'
import { ABOVE_MIME } from './aboveDrag'


export interface AboveGoal {
  key: string
  title: string
  /** "2 on October", "Nothing on October", "Open from 2025". */
  meta: string
  /** This period already holds something under it. */
  here: boolean
  goLabel: string
  goAria: string
  onGo: () => void
}

export interface StripRoutine { id: string; title: string; when: string; onOpen?: () => void }

export function AboveStrip({ id, aboveLabel, goals, empty, hint, addLabel, onAddGoal, routines, routinesEmpty, routinesNote }: {
  id: string
  /** The tab: "Fall", "2026", "2025". */
  aboveLabel: string
  goals: AboveGoal[]
  empty: string
  hint: string
  /** "+ Add a Fall goal"; absent where nothing is added (last year). */
  addLabel?: string
  onAddGoal?: (title: string) => Promise<boolean>
  /** The routines at this pace; null draws no Routines tab. */
  routines: StripRoutine[] | null
  routinesEmpty?: string
  routinesNote?: string
}) {
  const [adding, setAdding] = useState(false)
  const drag = (g: AboveGoal) => (e: DragEvent) => {
    e.dataTransfer.setData(ABOVE_MIME, g.key)
    e.dataTransfer.setData('text/plain', g.title)
    e.dataTransfer.effectAllowed = 'link'
  }
  const goalsTab = (
    <>
      {goals.length === 0 ? <p className="hs-empty">{empty}</p> : <p className="hs-row-meta">{hint}</p>}
      <ul className="hs-list" aria-label={`${aboveLabel} goals`}>
        {goals.map((g) => (
          <li key={g.key} className="hs-row" draggable onDragStart={drag(g)}>
            <span className="hs-row-body">
              <span className="hs-row-title">{g.title}</span>
              <span className={`hs-row-meta${g.here ? ' is-here' : ''}`}>{g.meta}</span>
            </span>
            <button type="button" className="hs-row-go" aria-label={g.goAria} onClick={g.onGo}>{g.goLabel}</button>
          </li>
        ))}
      </ul>
      {onAddGoal && addLabel && (adding
        ? <InlineComposer label={addLabel.replace(/^\+\s*/, '')} saveLabel="Add"
          onSave={async (t) => { const ok = await onAddGoal(t); if (ok) setAdding(false); return ok }} onCancel={() => setAdding(false)} />
        : <button type="button" className="hs-add" onClick={() => setAdding(true)}>{addLabel}</button>)}
    </>
  )
  const tabs: StripTab[] = [{ id: 'above', label: aboveLabel, count: goals.length || undefined, content: goalsTab }]
  if (routines) {
    tabs.push({
      id: 'routines', label: 'Routines', count: routines.length || undefined,
      content: <>
        {routines.length === 0 && <p className="hs-empty">{routinesEmpty}</p>}
        <ul className="hs-list">
          {routines.map((r) => (
            <li key={r.id} className="hs-row">
              <span className="hs-row-body">
                {r.onOpen ? <button type="button" className="hs-row-title" onClick={r.onOpen}>{r.title}</button> : <span className="hs-row-title">{r.title}</span>}
                <span className="hs-row-meta">{r.when}</span>
              </span>
            </li>
          ))}
        </ul>
        {routinesNote && <p className="hs-note">{routinesNote}</p>}
      </>,
    })
  }
  return <HorizonStrip id={id} label={`${aboveLabel} strip`} railLabel={`${aboveLabel} · ${goals.length}`} tabs={tabs} />
}
