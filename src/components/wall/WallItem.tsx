import { formatTime } from '@/lib/timeUtils'
import { FAMILY_COLORS, type FamilyMember, type FamilyMemberColor } from '@/types/family'
import type { TimelineItem } from '@/types/timeline'

interface WallItemProps {
  item: TimelineItem
  familyMembers: FamilyMember[]
}

export function WallItem({ item, familyMembers }: WallItemProps) {
  const assignedMember = item.assignedTo
    ? familyMembers.find(m => m.id === item.assignedTo)
    : undefined

  const colors = assignedMember
    ? FAMILY_COLORS[assignedMember.color as FamilyMemberColor]
    : null

  return (
    <div
      className={`
        flex items-start gap-2 py-1.5 px-2 rounded-lg
        ${item.completed ? 'opacity-40' : ''}
      `}
      data-item-id={item.id}
      data-item-type={item.type}
    >
      {/* Color dot for family member */}
      {colors ? (
        <div
          className={`w-3 h-3 rounded-full mt-1 shrink-0 ${colors.bg} ring-1 ${colors.ring}`}
          title={assignedMember?.name}
        />
      ) : (
        <div className="w-3 h-3 rounded-full mt-1 shrink-0 bg-neutral-200 ring-1 ring-neutral-300" />
      )}

      {/* Item content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          {/* Time */}
          {item.startTime && !item.allDay && (
            <span className="text-[0.8rem] font-medium text-neutral-400 shrink-0">
              {formatTime(item.startTime)}
            </span>
          )}
          {/* Title */}
          <span
            className={`
              text-[1.05rem] leading-snug truncate
              ${item.completed ? 'line-through text-neutral-400' : 'text-neutral-800'}
            `}
          >
            {item.title}
          </span>
        </div>
        {/* Location for events */}
        {item.location && !item.completed && (
          <div className="text-[0.75rem] text-neutral-400 truncate mt-0.5">
            {item.location}
          </div>
        )}
      </div>
    </div>
  )
}
