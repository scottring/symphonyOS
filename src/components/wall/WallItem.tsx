import { formatTime } from '@/lib/timeUtils'
import { FAMILY_COLORS, type FamilyMember, type FamilyMemberColor } from '@/types/family'
import type { TimelineItem } from '@/types/timeline'

interface WallItemProps {
  item: TimelineItem
  familyMembers: FamilyMember[]
  size?: 'large' | 'compact'
}

export function WallItem({ item, familyMembers, size = 'compact' }: WallItemProps) {
  const assignedMember = item.assignedTo
    ? familyMembers.find(m => m.id === item.assignedTo)
    : undefined

  const colors = assignedMember
    ? FAMILY_COLORS[assignedMember.color as FamilyMemberColor]
    : null

  const isLarge = size === 'large'

  return (
    <div
      className={`
        flex items-start gap-3 rounded-xl
        ${isLarge ? 'py-2.5 px-3' : 'py-1.5 px-2'}
        ${item.completed ? 'opacity-35' : ''}
      `}
      data-item-id={item.id}
      data-item-type={item.type}
    >
      {/* Color bar for family member */}
      {colors ? (
        <div
          className={`
            rounded-full shrink-0
            ${isLarge ? 'w-3 h-3 mt-2.5' : 'w-2.5 h-2.5 mt-2'}
            ${colors.bg} ring-2 ${colors.ring}
          `}
          title={assignedMember?.name}
        />
      ) : (
        <div
          className={`
            rounded-full shrink-0 bg-neutral-200 ring-2 ring-neutral-300/60
            ${isLarge ? 'w-3 h-3 mt-2.5' : 'w-2.5 h-2.5 mt-2'}
          `}
        />
      )}

      {/* Item content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          {/* Time */}
          {item.startTime && !item.allDay && (
            <span className={`
              font-medium text-neutral-400 shrink-0
              ${isLarge ? 'text-[1.15rem]' : 'text-[0.95rem]'}
            `}>
              {formatTime(item.startTime)}
            </span>
          )}
          {/* Title */}
          <span
            className={`
              leading-snug truncate
              ${isLarge ? 'text-[1.35rem]' : 'text-[1.05rem]'}
              ${item.completed ? 'line-through text-neutral-400' : 'text-neutral-800'}
            `}
          >
            {item.title}
          </span>
        </div>
        {/* Location for events */}
        {item.location && !item.completed && (
          <div className={`
            text-neutral-400 truncate mt-0.5
            ${isLarge ? 'text-[0.95rem]' : 'text-[0.8rem]'}
          `}>
            {item.location}
          </div>
        )}
      </div>
    </div>
  )
}
