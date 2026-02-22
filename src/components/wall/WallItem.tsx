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
        flex items-start gap-3.5 py-2 px-2 rounded-xl
        ${item.completed ? 'opacity-30' : ''}
      `}
      data-item-id={item.id}
      data-item-type={item.type}
    >
      {/* Color dot for family member */}
      {colors ? (
        <div
          className={`w-4 h-4 rounded-full mt-2 shrink-0 ${colors.bg} ring-2 ${colors.ring}`}
        />
      ) : (
        <div className="w-4 h-4 rounded-full mt-2 shrink-0 bg-neutral-200 ring-2 ring-neutral-300/60" />
      )}

      {/* Item content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2.5">
          {/* Time */}
          {item.startTime && !item.allDay && (
            <span className="text-[1.4rem] font-medium text-neutral-400 shrink-0">
              {formatTime(item.startTime)}
            </span>
          )}
          {/* Title + assigned name */}
          <span
            className={`
              text-[1.75rem] leading-snug truncate
              ${item.completed ? 'line-through text-neutral-400' : 'text-neutral-800'}
            `}
          >
            {item.title}
            {assignedMember && !item.completed && (
              <span className="text-neutral-400 font-normal"> · {assignedMember.name}</span>
            )}
          </span>
        </div>
        {/* Location for events */}
        {item.location && !item.completed && (
          <div className="text-[1.15rem] text-neutral-400 truncate mt-0.5 ml-0.5">
            {item.location}
          </div>
        )}
      </div>
    </div>
  )
}
