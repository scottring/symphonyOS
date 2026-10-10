// src/components/canvas/week/CompactWeekList.tsx
//
// The week beside the day, compact (approved design 2026-10-10, "Today: keep
// the page, shrink the week column"). ONE list for both Today callers — the
// classic TodayWeekColumn and the connected workspace's AlongsideDay — each
// keeping its own data and writers; this draws the rows.
//
//  - Rows sit under the line they serve (the month milestone), the parent
//    written once as a group header. A parent with one row here is a muted
//    suffix on that row instead. Rows that serve nothing are the last group,
//    "Unlinked" — first-class, not a warning.
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

import { useState, type DragEvent, type ReactNode } from 'react'
import { Check, Plus } from 'lucide-react'
import { useArrived } from '@/contexts/CanvasActivityContext'
import { groupByParent, type ParentGroup, type RowParent } from './compactWeek'

export interface CompactRow<T> {
  key: string
  /** The entity id: what the arrived flash is keyed on. */
  id: string
  title: string
  item: T
  completed?: boolean
  parent?: RowParent | null
  /** One small line under the title ("Kept from last week", "Currently Oct 9"). */
  context?: string | null
  /** Already on the viewed day: the tag's words ("Today", "Today 2p"). */
  onDay?: string | null
  /** For reading only: no check, no add, no drag. */
  readOnly?: boolean
}

export interface CompactWeekListProps<T> {
  rows: CompactRow<T>[]
  /** The list's accessible name. */
  label: string
  /** "Add Call the bank to today". */
  addLabel?: (title: string) => string
  /** Group rows under their parents (default). Off: one plain list. */
  grouped?: boolean
  onAdd?: (item: T) => void
  onComplete?: (item: T) => void
  onOpen?: (item: T) => void
  onOpenParent?: (parentId: string) => void
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
  const { rows, label, grouped = true, empty } = props
  const [showDone, setShowDone] = useState(false)
  const doneCount = rows.filter((r) => r.completed).length
  const visible = showDone ? rows : rows.filter((r) => !r.completed)
  const groups = grouped ? groupByParent(visible) : [{ key: 'all', parent: null, rows: visible } as ParentGroup<CompactRow<T>>]
  // One group of nothing-in-particular has no header worth reading.
  const onlyUnlinked = groups.length === 1 && !groups[0].parent

  const blocks: ReactNode[] = []
  let loose: ReactNode[] = []
  const flush = () => {
    if (!loose.length) return
    blocks.push(<ul key={`loose-${blocks.length}`} className="cw-rows">{loose}</ul>)
    loose = []
  }
  for (const g of groups) {
    if (g.parent && g.rows.length === 1) {
      loose.push(<CompactWeekRow key={g.rows[0].key} row={g.rows[0]} suffix={g.parent.title} {...props} />)
      continue
    }
    if (!g.parent && onlyUnlinked) {
      loose.push(...g.rows.map((r) => <CompactWeekRow key={r.key} row={r} {...props} />))
      continue
    }
    flush()
    const title = g.parent?.title ?? 'Unlinked'
    blocks.push(
      <section key={g.key} className={`canvas-group cw-group${g.parent ? '' : ' is-unlinked'}`} aria-label={title}>
        <div className="canvas-group-head">
          {g.parent && props.onOpenParent
            ? <button type="button" className="canvas-group-title cw-group-title" onClick={() => props.onOpenParent?.(g.parent!.id)}>{title}</button>
            : <span className="canvas-group-title">{title}</span>}
        </div>
        <ul className="cw-rows">{g.rows.map((r) => <CompactWeekRow key={r.key} row={r} {...props} />)}</ul>
      </section>,
    )
  }
  flush()

  return (
    <div className="cw-list" role="group" aria-label={label}>
      {visible.length === 0 && empty}
      {blocks}
      {doneCount > 0 && (
        <button type="button" className="canvas-link cw-done-toggle" aria-expanded={showDone} onClick={() => setShowDone((s) => !s)}>
          {showDone ? 'Hide done' : 'Show done'}
        </button>
      )}
    </div>
  )
}

function CompactWeekRow<T>({ row, suffix, onAdd, onComplete, onOpen, onDragStart, addLabel, busyKey, disabled }: CompactWeekListProps<T> & { row: CompactRow<T>; suffix?: string }) {
  const arrived = useArrived(row.id)
  const done = !!row.completed
  const movable = !!onDragStart && !row.readOnly && !row.onDay && !done && !disabled
  const busy = busyKey === row.key
  const cls = ['canvas-item', 'cw-row', row.onDay ? 'is-on-today' : '', done ? 'is-done' : '', row.readOnly ? 'is-read' : '', arrived ? 'is-arrived' : ''].filter(Boolean).join(' ')
  return (
    <li className={cls} draggable={movable} onDragStart={movable ? (ev) => onDragStart!(row.item, ev) : undefined}>
      {row.readOnly || !onComplete
        ? <span className="cw-dash" aria-hidden="true" />
        : (
          <button type="button" className={`cw-check${done ? ' is-on' : ''}`} onClick={() => onComplete(row.item)}
            aria-label={done ? `Mark ${row.title} not done` : `Complete ${row.title}`} title={done ? 'Mark not done' : 'Mark done'}>
            <span className="cw-check-ring" aria-hidden="true"><Check size={11} strokeWidth={3} /></span>
          </button>
        )}
      <span className="canvas-item-title">
        {onOpen
          ? <button type="button" className="cw-title" onClick={() => onOpen(row.item)}>{row.title}</button>
          : <span className="cw-title">{row.title}</span>}
        {suffix && <span className="cw-parent"><span aria-hidden="true"> · </span><span className="sr-only">, for </span>{suffix}</span>}
        {row.context && <span className="cw-context">{row.context}</span>}
      </span>
      {row.onDay
        ? <span className="canvas-tag">{row.onDay}</span>
        : onAdd && !row.readOnly && !done && (
          <button type="button" className="canvas-icon cw-add" onClick={() => onAdd(row.item)} disabled={disabled}
            aria-busy={busy || undefined} aria-label={addLabel ? addLabel(row.title) : `Add ${row.title} to today`} title={busy ? 'Saving…' : 'Add to the day'}>
            <Plus size={16} strokeWidth={2.25} aria-hidden="true" />
          </button>
        )}
    </li>
  )
}

