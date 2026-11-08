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

import { useRef, useState, type DragEvent, type ReactNode } from 'react'
import { gapAt } from '@/lib/week/dayReorder'
import './sheet.css'

export interface AboveSheetProps {
  /** "Season · Sep 1 – Nov 30", "Year", "Last year". */
  kicker: string
  /** "Fall 2026", "2026", "2025". */
  title: string
  /** The open lines, titles only. */
  rows: SheetRow[]
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
  /** Today's week sheet only: a row dropped among the rows takes that place
   *  (the shared order, Scott 2026-11-08); `toIndex` is the gap, 0 above the
   *  first row, as the list read before the move. */
  onReorder?: (id: string, toIndex: number) => void
  /** More of the sheet, under the list and above the foot (Today's
   *  "Routines today", drawn with SheetRows). */
  children?: ReactNode  /** A heading over the rows (Today's week sheet: "Sometime this week"). */
  rowsHeading?: string
  /** Extra classes: the sheet's name as it slides from one level's page to
   *  the next (vt-sheet-month, levelStep). */
  className?: string
}

const defaultPickLabel = (title: string) => `Plan ${title} for today`

/** A line on the sheet. Today's week sheet only: `mark`, a faint word beside
 *  it (an earlier day of the week, "Tue"), and `anchor`, a planning step's
 *  home (`data-guide-anchor`). */
export interface SheetRow { id: string; title: string; mark?: string; anchor?: string }

export interface SheetRowsProps {
  rows: SheetRow[]
  /** The list's accessible name. */
  label: string
  onPick?: (id: string) => void
  pickLabel?: (title: string) => string
  onOpen?: (id: string) => void
  onDragRow?: (id: string, ev: DragEvent<HTMLLIElement>) => void
  onReorder?: (id: string, toIndex: number) => void
}

/** The sheet's ruled lines: plain text, or (Today) a title that opens, a +
 *  and a drag onto the day. */
export function SheetRows({ rows, label, onPick, pickLabel = defaultPickLabel, onOpen, onDragRow, onReorder }: SheetRowsProps) {
  // A row dragged within its own list: the gap it would land in, as a rule.
  // Dropped on the day instead, the day's own drop places it (onDragRow).
  const listRef = useRef<HTMLUListElement>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [gap, setGap] = useState<number | null>(null)
  const gapIn = (y: number) => gapAt(y, [...(listRef.current?.querySelectorAll<HTMLElement>(':scope > li') ?? [])].map((li) => li.getBoundingClientRect()))
  const ordering = onReorder ? {
    onDragOver: (e: DragEvent<HTMLUListElement>) => {
      if (!dragId) return
      e.preventDefault(); e.dataTransfer.dropEffect = 'move'
      const g = gapIn(e.clientY)
      if (g !== gap) setGap(g)
    },
    onDragLeave: (e: DragEvent<HTMLUListElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setGap(null)
    },
    onDrop: (e: DragEvent<HTMLUListElement>) => {
      if (!dragId) return
      e.preventDefault(); e.stopPropagation()
      const id = dragId
      setDragId(null); setGap(null)
      onReorder(id, gapIn(e.clientY))
    },
  } : {}
  const gapCls = (i: number) => gap === null ? '' : gap === i ? ' is-gap-above' : gap === rows.length && i === rows.length - 1 ? ' is-gap-below' : ''
  return (
    <ul ref={listRef} className="above-sheet-list" aria-label={label} {...ordering}>
      {rows.map((r, i) => onPick || onOpen || onDragRow ? (
        <li key={r.id} className={`above-sheet-row${gapCls(i)}${dragId === r.id ? ' is-lifted' : ''}`} draggable={onDragRow || onReorder ? true : undefined}
          onDragStart={onDragRow || onReorder ? (ev) => {
            onDragRow?.(r.id, ev)
            if (onReorder) { setDragId(r.id); if (!onDragRow) { ev.dataTransfer.setData('text/plain', r.title); ev.dataTransfer.effectAllowed = 'move' } }
          } : undefined}
          onDragEnd={onReorder ? () => { setDragId(null); setGap(null) } : undefined} data-guide-anchor={r.anchor}>
          {onOpen
            ? <button type="button" className="above-sheet-row-title" onClick={() => onOpen(r.id)}>{r.title}</button>
            : <span className="above-sheet-row-title">{r.title}</span>}
          {r.mark && <span className="above-sheet-row-mark">{r.mark}</span>}
          {onPick && (
            <button type="button" className="above-sheet-pick" aria-label={pickLabel(r.title)} title={pickLabel(r.title)}
              onClick={() => onPick(r.id)}>+</button>
          )}
        </li>
      ) : <li key={r.id} data-guide-anchor={r.anchor}>{r.title}{r.mark && <span className="above-sheet-row-mark"> {r.mark}</span>}</li>)}
    </ul>
  )
}

export function AboveSheet({ kicker, title, rows, doneCount, foot, empty, onPick, pickLabel, onOpen, onDragRow, onReorder, children, className, rowsHeading }: AboveSheetProps) {
  return (
    <div className={className ? `above-sheet ${className}` : 'above-sheet'}>
      <p className="above-sheet-kicker">{kicker}</p>
      <h2 className="above-sheet-title">{title}</h2>
      {rowsHeading && <h3 className="above-sheet-sub above-sheet-rows-h">{rowsHeading}</h3>}
      {rows.length > 0 ? (
        <SheetRows rows={rows} label={title} onPick={onPick} pickLabel={pickLabel} onOpen={onOpen} onDragRow={onDragRow} onReorder={onReorder} />
      ) : empty ? (
        <p className="above-sheet-empty">{empty}</p>
      ) : null}
      {doneCount > 0 && <p className="above-sheet-done">{doneCount} done</p>}
      {children}
      <SheetFoot>{foot}</SheetFoot>
    </div>
  )
}

/** A sheet's foot line, with the eye: "For reading. …". */
export function SheetFoot({ children }: { children: ReactNode }) {
  return (
    <p className="above-sheet-foot">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      <span>{children}</span>
    </p>
  )
}

/** The sheet above, turned to the period before while a session looks back
 *  on it (the planning ribbon, 2026-11-04): the only time the sheet beside
 *  you takes a choice. To and Someday act on that period only; Let go takes
 *  the item off every list. What each call means is said by the step's
 *  tooltip, not a foot line (Scott, 2026-11-05). */
export function LookSheet({ children }: { children: ReactNode }) {
  return (
    <div className="above-sheet look-sheet">
      {/* The look back names its period itself ("Looking back at October"). */}
      <p className="above-sheet-kicker">Looking back</p>
      {children}
    </div>
  )
}
