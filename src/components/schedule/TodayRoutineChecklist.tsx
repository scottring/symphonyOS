import { Pin } from 'lucide-react'
import type { TimelineItem } from '@/types/timeline'
import type { FamilyMember, FamilyMemberColor } from '@/types/family'
import { FAMILY_COLORS } from '@/types/family'
import { formatTimeLong } from '@/lib/timeUtils'
import { timedRoutineRows } from '@/lib/today/dayRoutines'
import { TaskCheckbox } from './TaskCheckbox'

/** One routine: its check, time, name (opens it), people and pin. The
 *  checklist and the grid's quiet bands draw the same row. */
export function RoutineRow({ item, start, peopleOf, onSelect, onToggleDone, onPin }: {
  item: TimelineItem
  start: Date
  peopleOf: (item: TimelineItem) => FamilyMember[]
  onSelect: (id: string) => void
  onToggleDone: (item: TimelineItem) => void
  /** Unset: no pin on the row. */
  onPin?: (item: TimelineItem) => void
}) {
  const time = formatTimeLong(start)
  const done = item.completed || !!item.skipped
  return (
    <li className={`today-routine-row${done ? ' is-done' : ''}`}>
      {item.type === 'routine' && (
        <span className="today-scale-check">
          <TaskCheckbox
            shape="circle"
            completed={item.completed}
            onToggleComplete={() => onToggleDone(item)}
            onToggleWaiting={() => {}}
            label={item.completed ? `Mark ${item.title} incomplete` : `Mark ${item.title} complete`}
          />
        </span>
      )}
      <span className="today-routine-time tabular-nums">{time}</span>
      <button type="button" className="today-routine-open" aria-label={`${item.title}, ${time}`} onClick={() => onSelect(item.id)}>
        {item.title}
      </button>
      <span className="today-scale-people">
        {peopleOf(item).slice(0, 3).map((m) => {
          const c = FAMILY_COLORS[m.color as FamilyMemberColor] ?? FAMILY_COLORS.blue
          return <span key={m.id} className={`today-scale-avatar ${c.bg} ${c.text}`} title={m.name} aria-hidden="true">{m.initials || m.name.slice(0, 1)}</span>
        })}
      </span>
      {onPin && (
        <button type="button" className="today-routine-pin" aria-label={`Keep ${item.title} on the grid`} title="Keep on the grid" onClick={() => onPin(item)}>
          <Pin aria-hidden="true" />
        </button>
      )}
    </li>
  )
}

/**
 * The day's set routines, in time order, under "For today" (Scott,
 * 2026-11-09). They are off the grid unless pinned; a row checks off, opens
 * its routine, and can be pinned to the grid.
 */
export function TodayRoutineChecklist({ items, heading, peopleOf, onSelect, onToggleDone, onPin }: {
  items: readonly TimelineItem[]
  heading: string
  peopleOf: (item: TimelineItem) => FamilyMember[]
  onSelect: (id: string) => void
  onToggleDone: (item: TimelineItem) => void
  /** Unset: no pin on the row. */
  onPin?: (item: TimelineItem) => void
}) {
  const rows = timedRoutineRows(items)
  if (rows.length === 0) return null
  return (
    <div className="today-routines">
      <div className="daybook-journal-heading"><h2>{heading}</h2></div>
      <ul className="today-routines-list" aria-label={heading}>
        {rows.map(({ item, start }) => (
          <RoutineRow key={item.id} item={item} start={start} peopleOf={peopleOf} onSelect={onSelect} onToggleDone={onToggleDone} onPin={onPin} />
        ))}
      </ul>
    </div>
  )
}
