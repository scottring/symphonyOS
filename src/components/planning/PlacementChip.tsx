// src/components/planning/PlacementChip.tsx
//
// The shared rhythm-language card for placed items — used in Month grid cells
// and pool rows (DenseInboxRow) so both surfaces visibly rhyme with the
// routines page's chip anatomy (see WeekStrip's Chip in
// src/components/routine/rhythm/WeekStrip.tsx: grip glyph, name, avatars,
// tokens).
import { GripVertical } from 'lucide-react'
import { AssigneeAvatar } from '@/components/family/AssigneeAvatar'
import type { FamilyMember } from '@/types/family'

export interface PlacementChipMember {
  id: string
  name: string
  initials?: string
  color?: string
}

export interface PlacementChipProps {
  id: string
  name: string
  kind?: 'task' | 'event' // event -> purple tint
  time?: string | null // 'HH:MM' badge, optional
  members?: PlacementChipMember[]
  draggable?: boolean // sets dataTransfer 'text/task-id' = id on dragStart
  onClick?: () => void
  className?: string
  /** Tooltip on the root element. Defaults to `name` so hover-title text
   *  (e.g. full task/event title on a truncated chip) isn't lost. */
  title?: string
}

export function PlacementChip({
  id,
  name,
  kind = 'task',
  time,
  members,
  draggable = false,
  onClick,
  className = '',
  title,
}: PlacementChipProps) {
  const isEvent = kind === 'event'

  return (
    <div
      draggable={draggable}
      onDragStart={
        draggable
          ? (e) => e.dataTransfer.setData('text/task-id', id)
          : undefined
      }
      title={title ?? name}
      className={`
        flex items-center gap-1 rounded-lg border px-2 py-1 text-xs shadow-sm transition-colors
        ${isEvent ? 'bg-[#f4effc] border-[#e2d8f2]' : 'bg-white border-neutral-100'}
        ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}
        ${className}
      `}
    >
      {draggable && <GripVertical className="w-3 h-3 text-neutral-300 shrink-0" />}
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="flex-1 min-w-0 text-left line-clamp-2 truncate text-neutral-700"
        >
          {name}
        </button>
      ) : (
        // No onClick (e.g. calendar events, which aren't selectable from the
        // month grid) — a plain div, not a button, so it isn't a focusable,
        // seemingly-clickable no-op tab stop.
        <div className="flex-1 min-w-0 text-left line-clamp-2 truncate text-neutral-700">
          {name}
        </div>
      )}
      {members && members.length > 0 && (
        <span className="flex -space-x-1.5 shrink-0">
          {members.map((m) => (
            <AssigneeAvatar
              key={m.id}
              member={m as FamilyMember}
              size="sm"
              className="ring-1 ring-white"
            />
          ))}
        </span>
      )}
      {time && (
        <span className="text-[10px] text-neutral-400 shrink-0">{time}</span>
      )}
    </div>
  )
}
