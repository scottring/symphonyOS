// src/components/canvas/week/CompactWeekList.tsx
//
// The week beside the day, compact (approved design 2026-10-10, "Today: keep
// the page, shrink the week column"). ONE list for both Today callers — the
// classic TodayWeekColumn and the connected workspace's AlongsideDay — each
// keeping its own data and writers; this draws the rows.
//
//  - The rows are flat, in the week's own order (paper-style horizons,
//    2026-11-04): no heading for a month line, no "Unlinked", and nothing
//    on a row says what it serves. Week and Today show the same week.
//  - Titles wrap; nothing is cut to one line.
//  - "Add to today" is a small, always-visible icon button, not a pill of
//    words repeated down the column.
//  - A row already on the day stays where it is, tagged ("Today", "Today
//    2p"), without the add button — not hidden, not counted.
//  - Done rows wait behind a quiet "Show done" at the end (no count: the
//    week is not a scoreboard).
//  - A row a conversation or command just changed flashes (useArrived).
//
// Dragging is native HTML5 drag; each caller writes its own payload, so the
// drop targets that already read them keep working unchanged.

import { useState, type ComponentPropsWithRef, type DragEvent, type ReactNode } from 'react'
import { Check, Plus } from 'lucide-react'
import { useArrived } from '@/contexts/CanvasActivityContext'

export interface CompactRow<T> {
  key: string
  /** The entity id: what the arrived flash is keyed on. */
  id: string
  title: string
  item: T
  completed?: boolean
  /** One small line under the title ("Kept from last week", "Currently Oct 9"). */
  context?: string | null
  /** Already on the viewed day: the tag's words ("Today", "Today 2p"). */
  onDay?: string | null
  /** For reading only: no check, no add, no drag. */
  readOnly?: boolean
  /** A small note on the row's line ("from Fri", "2p"). */
  meta?: string | null
}

export interface CompactWeekListProps<T> {
  rows: CompactRow<T>[]
  /** The list's accessible name. */
  label: string
  /** "Add Call the bank to today". */
  addLabel?: (title: string) => string
  onAdd?: (item: T, button: HTMLButtonElement) => void
  onComplete?: (item: T) => void
  onOpen?: (item: T) => void
  /** Writes the caller's own drag payload. Absent: rows don't drag. */
  onDragStart?: (item: T, ev: DragEvent<HTMLLIElement>) => void
  /** The row whose add is saving. */
  busyKey?: string | null
  /** Every add (and drag) waits — one write at a time. */
  disabled?: boolean
  /** Shown when nothing is visible. */
  empty?: ReactNode
}

export function CompactWeekList<T>(props: CompactWeekListProps<T>) {
  const { rows, label, empty } = props
  const [showDone, setShowDone] = useState(false)
  const doneCount = rows.filter((r) => r.completed).length
  const visible = showDone ? rows : rows.filter((r) => !r.completed)

  return (
    <div className="cw-list" role="group" aria-label={label}>
      {visible.length === 0 && empty}
      {visible.length > 0 && <ul className="cw-rows">{visible.map((r) => <CompactWeekRow key={r.key} row={r} {...props} />)}</ul>}
      {doneCount > 0 && (
        <button type="button" className="canvas-link cw-done-toggle" aria-expanded={showDone} onClick={() => setShowDone((s) => !s)}>
          {showDone ? 'Hide done' : 'Show done'}
        </button>
      )}
    </div>
  )
}

export interface CompactWeekRowProps<T> {
  row: CompactRow<T>
  addLabel?: (title: string) => string
  /** The + button; it is handed the button so a caller can anchor a picker. */
  onAdd?: (item: T, button: HTMLButtonElement) => void
  /** The + button controls a picker that is open now. */
  addExpanded?: boolean
  onComplete?: (item: T) => void
  onOpen?: (item: T) => void
  onDragStart?: (item: T, ev: DragEvent<HTMLLIElement>) => void
  onDragEnd?: (item: T) => void
  busyKey?: string | null
  disabled?: boolean
  /** In place of the + button (a day's ⋯ menu). */
  trailing?: ReactNode
  /** Before the + button (a shelf row's ⋯ menu). */
  extra?: ReactNode
  /** Before the title: what kind of thing it is (Today's ink icon). */
  lead?: ReactNode
  /** Beside the title: where it came from, its done-by date (as on Today). */
  badges?: ReactNode
  /** Under the title, after its muted line (a week day's people). */
  under?: ReactNode
  /** Drawn inside the row, after it (a picker). */
  children?: ReactNode
  className?: string
  /** More for the row itself: a ref, data attributes, a touch drag's
   *  listeners (the Week page's press-and-hold reorder). */
  liProps?: ComponentPropsWithRef<'li'> & Record<`data-${string}`, string | undefined>
}

/** One compact row: check, wrapping title, small meta, and + (or a menu). */
export function CompactWeekRow<T>({ row, onAdd, addExpanded, onComplete, onOpen, onDragStart, onDragEnd, addLabel, busyKey, disabled, trailing, extra, under, lead, badges, children, className, liProps }: CompactWeekRowProps<T>) {
  const arrived = useArrived(row.id)
  const done = !!row.completed
  const movable = !!onDragStart && !row.readOnly && !row.onDay && !done && !disabled
  const busy = busyKey === row.key
  const cls = ['canvas-item', 'cw-row', row.onDay ? 'is-on-today' : '', done ? 'is-done' : '', row.readOnly ? 'is-read' : '', arrived ? 'is-arrived' : '', className ?? ''].filter(Boolean).join(' ')
  return (
    <li {...liProps} className={cls} draggable={movable} onDragStart={movable ? (ev) => onDragStart!(row.item, ev) : undefined}
      onDragEnd={movable && onDragEnd ? () => onDragEnd(row.item) : undefined}>
      {row.readOnly || !onComplete
        ? <span className="cw-dash" aria-hidden="true" />
        : (
          <button type="button" className={`cw-check${done ? ' is-on' : ''}`} onClick={() => onComplete(row.item)}
            aria-label={done ? `Mark ${row.title} not done` : `Complete ${row.title}`} title={done ? 'Mark not done' : 'Mark done'}>
            <span className="cw-check-ring" aria-hidden="true"><Check size={11} strokeWidth={3} /></span>
          </button>
        )}
      {lead}
      <span className="canvas-item-title">
        {onOpen
          ? <button type="button" className="cw-title" onClick={() => onOpen(row.item)}>{row.title}</button>
          : <span className="cw-title">{row.title}</span>}
        {badges && <span className="cw-badges">{badges}</span>}
        {/* One muted line under the title: its notes. The title gets the
            row's width; this line never wraps. */}
        {(row.meta || row.context) && (
          <span className="cw-sub" title={[row.meta, row.context].filter(Boolean).join(" · ")}>
            {row.meta && <span className="cw-meta">{row.meta}</span>}
            {row.context && <span className="cw-context">{row.context}</span>}
          </span>
        )}
        {under}
      </span>
      {extra}
      {row.onDay
        ? <span className="canvas-tag">{row.onDay}</span>
        : trailing ?? (onAdd && !row.readOnly && !done && (
          <button type="button" className="canvas-icon cw-add" onClick={(e) => onAdd(row.item, e.currentTarget)} disabled={disabled}
            aria-busy={busy || undefined} aria-expanded={addExpanded}
            aria-label={addLabel ? addLabel(row.title) : `Add ${row.title} to today`} title={busy ? 'Saving…' : 'Add to the day'}>
            <Plus size={16} strokeWidth={2.25} aria-hidden="true" />
          </button>
        ))}
      {children}
    </li>
  )
}
