import type { MouseEvent } from 'react'
import { Check } from 'lucide-react'
import { taskIconFor, type TaskIconInput } from '@/lib/taskIcon'

/**
 * A task's icon, which is also its check (Scott, 2026-10-07, design "B": the
 * icon tile IS the check — tap it to finish, and it turns green). One look in
 * two sizes: `card` (46px, For today and Inbox) and `row` (26px, Week and the
 * period lists). An event is not something you finish: its tile is a quiet
 * calendar mark, not a button. Styles: src/styles/cards.css.
 */
export function TaskIconCheck({ task, done, size = 'card', onToggle, disabled }: {
  task: TaskIconInput
  done: boolean
  size?: 'card' | 'row'
  /** Absent (or an event): the tile is a mark, not a control. */
  onToggle?: () => void
  disabled?: boolean
}) {
  const Icon = taskIconFor(task)
  const px = size === 'card' ? 22 : 14
  const isEvent = task.type === 'event'
  if (isEvent || !onToggle) {
    return (
      <span aria-hidden="true" className={`sym-tile sym-tile-${size}${isEvent ? ' is-event' : ''}${done ? ' is-done' : ''}`}>
        {done ? <Check size={px} strokeWidth={2.6} /> : <Icon size={px} strokeWidth={1.8} />}
      </span>
    )
  }
  return (
    <button
      type="button"
      className={`sym-tile sym-tile-${size}${done ? ' is-done' : ''}`}
      aria-label={`${done ? 'Mark not done' : 'Done'}: ${task.title}`}
      aria-pressed={done}
      disabled={disabled}
      // The row around it opens the details; the tile only finishes.
      onClick={(e: MouseEvent) => { e.stopPropagation(); onToggle() }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {done ? <Check size={px} strokeWidth={2.6} /> : <Icon size={px} strokeWidth={1.8} />}
    </button>
  )
}
