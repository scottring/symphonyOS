// The sheet above, for reading (paper-style horizons, Scott 2026-11-04): the
// level above this period (Fall beside November, the year beside Fall, last
// year's open goals beside the year), drawn as the prototype's renderAbove —
// kicker, title, its open lines, how many are done, and the foot line. No
// controls of any kind: this period is written in its own words, not copied
// or tied to these. It lies inside PaperFold's scroll box.
//
// The one exception is Today (Scott, 2026-11-04: "add today with the + on the
// week sheet"): week and day share items, so the week sheet beside the day
// keeps a + on each row (onPick), its drag onto the day (onDragRow) and a
// title tap that opens the task (onOpen). Without them, nothing here is a
// control.

import type { DragEvent } from 'react'
import './sheet.css'

export interface AboveSheetProps {
  /** "Season · Sep 1 – Nov 30", "Year", "Last year". */
  kicker: string
  /** "Fall 2026", "2026", "2025". */
  title: string
  /** The open lines, titles only. */
  rows: { id: string; title: string }[]
  doneCount: number
  /** "For reading. Write November in its own words." */
  foot: string
  /** Said instead of the list when nothing is open ("Nothing left open from 2025."). */
  empty?: string
  /** Today's week sheet only: each row gets a "+" that plans it for the day. */
  onPick?: (id: string) => void
  /** The +'s name. Default "Plan {title} for today". */
  pickLabel?: (title: string) => string
  /** Today's week sheet only: a title tap opens the task. */
  onOpen?: (id: string) => void
  /** Today's week sheet only: the rows drag onto the day. */
  onDragRow?: (id: string, ev: DragEvent<HTMLLIElement>) => void
}

const defaultPickLabel = (title: string) => `Plan ${title} for today`

export function AboveSheet({ kicker, title, rows, doneCount, foot, empty, onPick, pickLabel = defaultPickLabel, onOpen, onDragRow }: AboveSheetProps) {
  return (
    <div className="above-sheet">
      <p className="above-sheet-kicker">{kicker}</p>
      <h2 className="above-sheet-title">{title}</h2>
      {rows.length > 0 ? (
        <ul className="above-sheet-list" aria-label={title}>
          {rows.map((r) => onPick || onOpen || onDragRow ? (
            <li key={r.id} className="above-sheet-row" draggable={onDragRow ? true : undefined}
              onDragStart={onDragRow ? (ev) => onDragRow(r.id, ev) : undefined}>
              {onOpen
                ? <button type="button" className="above-sheet-row-title" onClick={() => onOpen(r.id)}>{r.title}</button>
                : <span className="above-sheet-row-title">{r.title}</span>}
              {onPick && (
                <button type="button" className="above-sheet-pick" aria-label={pickLabel(r.title)} title={pickLabel(r.title)}
                  onClick={() => onPick(r.id)}>+</button>
              )}
            </li>
          ) : <li key={r.id}>{r.title}</li>)}
        </ul>
      ) : empty ? (
        <p className="above-sheet-empty">{empty}</p>
      ) : null}
      {doneCount > 0 && <p className="above-sheet-done">{doneCount} done</p>}
      <p className="above-sheet-foot">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        <span>{foot}</span>
      </p>
    </div>
  )
}
