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
// title tap that opens the task (onOpen), and a check that marks it done
// (onComplete; Scott 2026-11-09). Without them, nothing here is a control.

import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { gapAt } from '@/lib/week/dayReorder'
import type { SheetStatus } from '@/lib/planning/sheetStatus'
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
  /** Today's week sheet only: a circle before the title marks the row done. */
  onComplete?: (id: string) => void
  /** Today's week sheet only: drawn on each row before the + (who it's for). */
  rowTools?: (id: string) => ReactNode
  /** Today's week sheet only: ticks a row's next step. */
  onNextStep?: (id: string) => void
  /** Today's week sheet only: a title tap opens the task. */
  onOpen?: (id: string) => void
  /** Today's week sheet only: the rows drag onto the day. */
  onDragRow?: (id: string, ev: DragEvent<HTMLLIElement>) => void
  /** Today's week sheet only: a row dropped among the rows takes that place
   *  (the shared order, Scott 2026-11-08); `toIndex` is the gap, 0 above the
   *  first row, as the list read before the move. */
  onReorder?: (id: string, toIndex: number) => void
  /** Today's week sheet only: how many rows show before the rest fold into
   *  an "N more" line (Scott, 2026-11-09). A single extra row is not folded. */
  shortList?: number
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
export interface SheetRow {
  id: string; title: string; mark?: string; anchor?: string
  /** Today's week sheet: where it stands, drawn on the row's circle. */
  status?: SheetStatus
  /** Today's week sheet: a small line under the title ("Waiting on Iris"). */
  note?: string
  /** Today's week sheet only: how full the circle is, 0–100 (its steps done). */
  fill?: number
  /** Today's week sheet only: the one step that shows, with a check of its own. */
  nextStep?: string
}

export interface SheetRowsProps {
  rows: SheetRow[]
  /** The list's accessible name. */
  label: string
  onPick?: (id: string) => void
  pickLabel?: (title: string) => string
  onComplete?: (id: string) => void
  rowTools?: (id: string) => ReactNode
  onNextStep?: (id: string) => void
  onOpen?: (id: string) => void
  onDragRow?: (id: string, ev: DragEvent<HTMLLIElement>) => void
  onReorder?: (id: string, toIndex: number) => void
}

/** The sheet's ruled lines: plain text, or (Today) a title that opens, a +
 *  and a drag onto the day. */
export function SheetRows({ rows, label, onPick, pickLabel = defaultPickLabel, onComplete, rowTools, onNextStep, onOpen, onDragRow, onReorder }: SheetRowsProps) {
  // A row dragged within its own list: the gap it would land in, as a rule.
  // Dropped on the day instead, the day's own drop places it (onDragRow).
  const listRef = useRef<HTMLUListElement>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [gap, setGap] = useState<number | null>(null)
  // While a row is being moved, the whole sheet takes the drop (Scott,
  // 2026-11-09: aiming for the very top lands on the heading, not a row).
  // Above the first row is the top; below the last row is the end.
  useEffect(() => {
    const list = listRef.current
    if (!dragId || !onReorder || !list) return
    const zone = list.closest<HTMLElement>('.above-sheet') ?? list
    const gapIn = (y: number) => gapAt(y, [...list.querySelectorAll<HTMLElement>(':scope > li')].map((li) => li.getBoundingClientRect()))
    const over = (e: globalThis.DragEvent) => {
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
      setGap(gapIn(e.clientY))
    }
    const leave = (e: globalThis.DragEvent) => { if (!zone.contains(e.relatedTarget as Node | null)) setGap(null) }
    const drop = (e: globalThis.DragEvent) => {
      e.preventDefault(); e.stopPropagation()
      setDragId(null); setGap(null)
      onReorder(dragId, gapIn(e.clientY))
    }
    zone.addEventListener('dragover', over)
    zone.addEventListener('dragleave', leave)
    zone.addEventListener('drop', drop)
    return () => {
      zone.removeEventListener('dragover', over)
      zone.removeEventListener('dragleave', leave)
      zone.removeEventListener('drop', drop)
    }
  }, [dragId, onReorder])
  const gapCls = (i: number) => gap === null ? '' : gap === i ? ' is-gap-above' : gap === rows.length && i === rows.length - 1 ? ' is-gap-below' : ''
  return (
    <ul ref={listRef} className="above-sheet-list" aria-label={label}>
      {rows.map((r, i) => onPick || onOpen || onDragRow ? (
        <li key={r.id} className={`above-sheet-row${gapCls(i)}${dragId === r.id ? ' is-lifted' : ''}`} draggable={onDragRow || onReorder ? true : undefined}
          onDragStart={onDragRow || onReorder ? (ev) => {
            onDragRow?.(r.id, ev)
            if (onReorder) { setDragId(r.id); if (!onDragRow) { ev.dataTransfer.setData('text/plain', r.title); ev.dataTransfer.effectAllowed = 'move' } }
          } : undefined}
          onDragEnd={onReorder ? () => { setDragId(null); setGap(null) } : undefined} data-guide-anchor={r.anchor}>
          {onComplete && <button type="button" className={`above-sheet-check${r.status ? ` is-${r.status}` : ''}`} style={r.fill === undefined ? undefined : { ['--fill' as string]: `${r.fill}%` }} aria-label={`Mark ${r.title} complete`} title="Mark complete" onClick={() => onComplete(r.id)} />}
          <span className="above-sheet-row-main">
            {r.status === 'started' && <span className="sr-only">In progress</span>}
            {onOpen
              ? <button type="button" className="above-sheet-row-title" onClick={() => onOpen(r.id)}>{r.title}</button>
              : <span className="above-sheet-row-title">{r.title}</span>}
            {r.note && <span className="above-sheet-row-note" title={r.note}>{r.note}</span>}
            {r.nextStep && (
              <span className="above-sheet-step" key={r.nextStep}>
                <button type="button" className="above-sheet-step-check" aria-label={`Mark ${r.nextStep} done`} title="Done" onClick={() => onNextStep?.(r.id)} />
                <span className="above-sheet-step-title" title={r.nextStep}>{r.nextStep}</span>
              </span>
            )}
          </span>
          {r.mark && <span className="above-sheet-row-mark">{r.mark}</span>}
          <span className="above-sheet-tools">
            {rowTools?.(r.id)}
            {onPick && (
              <button type="button" className="above-sheet-pick" aria-label={pickLabel(r.title)} title={pickLabel(r.title)}
                onClick={() => onPick(r.id)}>+</button>
            )}
          </span>
        </li>
      ) : <li key={r.id} data-guide-anchor={r.anchor}>{r.title}{r.mark && <span className="above-sheet-row-mark"> {r.mark}</span>}</li>)}
    </ul>
  )
}

export function AboveSheet({ kicker, title, rows, doneCount, foot, empty, onPick, pickLabel, onComplete, rowTools, onNextStep, onOpen, onDragRow, onReorder, shortList, children, className, rowsHeading }: AboveSheetProps) {
  const [showAll, setShowAll] = useState(false)
  const canFold = shortList !== undefined && rows.length > shortList + 1
  const shown = canFold && !showAll ? rows.slice(0, shortList) : rows
  return (
    <div className={className ? `above-sheet ${className}` : 'above-sheet'}>
      <p className="above-sheet-kicker">{kicker}</p>
      <h2 className="above-sheet-title">{title}</h2>
      {rowsHeading && <h3 className="above-sheet-sub above-sheet-rows-h">{rowsHeading}</h3>}
      {rows.length > 0 ? (
        <SheetRows rows={shown} label={title} onPick={onPick} pickLabel={pickLabel} onComplete={onComplete} rowTools={rowTools} onNextStep={onNextStep} onOpen={onOpen} onDragRow={onDragRow} onReorder={onReorder} />
      ) : empty ? (
        <p className="above-sheet-empty">{empty}</p>
      ) : null}
      {canFold && (
        <button type="button" className="above-sheet-more" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Show fewer' : `${rows.length - shortList} more`}
        </button>
      )}
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
