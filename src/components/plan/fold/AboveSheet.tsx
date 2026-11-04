// The sheet above, for reading (paper-style horizons, Scott 2026-11-04): the
// level above this period (Fall beside November, the year beside Fall, last
// year's open goals beside the year), drawn as the prototype's renderAbove —
// kicker, title, its open lines, how many are done, and the foot line. No
// controls of any kind: this period is written in its own words, not copied
// or tied to these. It lies inside PaperFold's scroll box.

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
}

export function AboveSheet({ kicker, title, rows, doneCount, foot, empty }: AboveSheetProps) {
  return (
    <div className="above-sheet">
      <p className="above-sheet-kicker">{kicker}</p>
      <h2 className="above-sheet-title">{title}</h2>
      {rows.length > 0 ? (
        <ul className="above-sheet-list" aria-label={title}>
          {rows.map((r) => <li key={r.id}>{r.title}</li>)}
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
