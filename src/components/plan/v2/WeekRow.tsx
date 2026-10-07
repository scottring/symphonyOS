// One row for every column on the Week page (spec 2026-10-03-week-grid-design
// §3–4). Scott, 2026-10-03: the month column had no rows you could drag, the
// list had white cards, the days dragged only some of theirs — "all very
// confusing". Now every column draws this row, and one rule decides movement:
// if it can go somewhere else, it drags (the whole row; a grip shows on
// hover). A calendar event is a dash and never moves.
//
//   [grip] lane · mark · title ↻ / meta / tools · people · trailing
//
// Marks: a task or routine wears its icon tile, which is also its check
// (the card language, design B, 2026-10-07 — row size); an event wears a quiet
// calendar tile that is not a control; a line on a list above the week keeps
// its dash. Whether a thing repeats is the routine's business, not the week's
// (Scott, 2026-10-04: no ↻ on every row).
import type { HTMLAttributes, ReactNode } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { Check, GripVertical } from 'lucide-react'
import type { FamilyMember } from '@/types/family'
import { AssigneeAvatar } from '@/components/family/AssigneeAvatar'
import { TaskIconCheck } from '@/components/common/TaskIconCheck'
import type { TaskIconInput } from '@/lib/taskIcon'

export type WeekRowMark = 'task' | 'routine' | 'event' | 'goal' | 'line'

export interface WeekRowProps {
  mark: WeekRowMark
  title: string
  /** A time ('7a'), drawn small above the title; omitted or '' = none. */
  lane?: string | null
  /** What the icon tile is chosen from (taskIconFor); defaults to the title. */
  icon?: TaskIconInput
  completed?: boolean
  /** Tasks and routines: the completion circle. */
  onToggle?: () => void
  onOpen: () => void
  /** The 12px line under the title. */
  meta?: ReactNode
  /** Controls under the title (pickers), shown on hover or focus. */
  tools?: ReactNode
  people?: FamilyMember[]
  /** Right of the row: menus, "+ This week", the timing control. */
  trailing?: ReactNode
  /** dnd-kit registration; null = this row does not move. */
  drag: { id: string; data: Record<string, unknown> } | null
  /** The grid's narrow cells: a 14.5px title. */
  dense?: boolean
  rowProps?: HTMLAttributes<HTMLLIElement> & Record<`data-${string}`, string | undefined>
}

export function WeekRow({ mark, title, lane, icon, completed = false, onToggle, onOpen, meta, tools, people, trailing, drag, dense = false, rowProps }: WeekRowProps) {
  const movable = !!drag && mark !== 'event'
  const { listeners, setNodeRef, isDragging } = useDraggable({ id: drag?.id ?? `wk-static:${title}`, data: drag?.data, disabled: !movable })
  const { className: extraClass, ...rest } = rowProps ?? {}
  return (
    <li
      ref={setNodeRef}
      {...rest}
      // Listeners only: the row stays a list item (dnd-kit's attributes would
      // make it a role="button" tab stop); the circle and menus are the
      // keyboard path. The sensor's 8px threshold keeps clicks clicks.
      {...(movable ? listeners : {})}
      data-mark={mark}
      data-movable={String(movable)}
      data-done={String(completed)}
      className={`wk-row${dense ? ' is-dense' : ''}${isDragging ? ' is-dragging' : ''}${extraClass ? ` ${extraClass}` : ''}`}
    >
      {movable && <span className="wk-grip" aria-hidden="true"><GripVertical className="h-3.5 w-3.5" /></span>}
      <span className="wk-mark">
        {mark === 'task' || mark === 'routine' || mark === 'event' ? (
          // The tile is the check (an event's is a mark, never a control).
          <TaskIconCheck size="row" done={completed}
            task={{ ...(icon ?? {}), title: icon?.title ?? title, type: mark }}
            onToggle={mark === 'event' ? undefined : onToggle} />
        ) : onToggle && mark === 'line' ? (
          <button
            type="button"
            className={`wk-check is-line${completed ? ' is-on' : ''}`}
            aria-label={completed ? `Mark ${title} not done` : `Complete ${title}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onToggle() }}
          >
            {completed && <Check className="h-2.5 w-2.5" strokeWidth={3} aria-hidden="true" />}
          </button>
        ) : <span className={`wk-glyph is-${mark}`} aria-hidden="true" />}
      </span>
      <div className="wk-body">
        {lane ? <span className="wk-time">{lane}</span> : null}
        <span className="wk-titleline">
          {/* Done stays on the page, struck, the way a paper week keeps it. */}
          <button type="button" className={`wk-title${completed ? ' line-through text-neutral-400' : ''}`} onClick={onOpen}>{title}</button>
        </span>
        {meta && <div className="wk-meta">{meta}</div>}
        {tools && <div className="wk-tools" onPointerDown={(e) => e.stopPropagation()}>{tools}</div>}
      </div>
      {people && people.length > 0 && (
        <span className="wk-people" aria-label={people.map((p) => p.name).join(', ')}>
          {people.slice(0, 3).map((p) => <AssigneeAvatar key={p.id} member={p} size="sm" />)}
        </span>
      )}
      {trailing && <span className="wk-trailing" onPointerDown={(e) => e.stopPropagation()}>{trailing}</span>}
    </li>
  )
}
