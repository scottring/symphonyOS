import { formatTime } from '@/lib/timeUtils'
import { FAMILY_COLORS, type FamilyMember, type FamilyMemberColor } from '@/types/family'
import type { TimelineItem } from '@/types/timeline'

interface WallItemProps {
  item: TimelineItem
  familyMembers: FamilyMember[]
  onComplete?: () => void
  onPushTomorrow?: () => void
}

export function WallItem({ item, familyMembers, onComplete, onPushTomorrow }: WallItemProps) {
  const assignedMember = item.assignedTo
    ? familyMembers.find(m => m.id === item.assignedTo)
    : undefined

  const colors = assignedMember
    ? FAMILY_COLORS[assignedMember.color as FamilyMemberColor]
    : null

  return (
    <div
      className={`
        wall-item-tap flex items-center gap-4 min-h-[56px] py-3 px-3 rounded-xl
        ${item.completed ? 'opacity-30' : ''}
      `}
      data-item-id={item.id}
      data-item-type={item.type}
    >
      {/* Checkbox / color dot — enlarged for touch */}
      {onComplete ? (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onComplete()
          }}
          className="shrink-0 flex items-center justify-center cursor-pointer p-1"
          aria-label={item.completed ? 'Mark incomplete' : 'Mark complete'}
        >
          {item.completed ? (
            <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2.5 6L5 8.5L9.5 3.5" />
              </svg>
            </div>
          ) : (
            <div
              className={`w-8 h-8 rounded-full border-[2.5px] transition-colors hover:border-green-400 ${
                colors ? `${colors.ring} border-current` : 'border-neutral-300'
              }`}
            />
          )}
        </button>
      ) : colors ? (
        <div
          className={`w-5 h-5 rounded-full shrink-0 ${colors.bg} ring-2 ${colors.ring}`}
        />
      ) : (
        <div className="w-5 h-5 rounded-full shrink-0 bg-neutral-200 ring-2 ring-neutral-300/60" />
      )}

      {/* Item content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2.5">
          {/* Time */}
          {item.startTime && !item.allDay && (
            <span className="text-[1.3rem] font-medium text-neutral-400 shrink-0 tabular-nums">
              {formatTime(item.startTime)}
            </span>
          )}
          {/* Title + assigned name */}
          <span
            className={`
              text-[1.6rem] leading-snug truncate
              ${item.completed ? 'line-through text-neutral-400' : 'text-neutral-800'}
            `}
          >
            {item.title}
            {assignedMember && !item.completed && (
              <span className="text-neutral-400 font-normal text-[1.3rem]"> &middot; {assignedMember.name}</span>
            )}
          </span>
        </div>
        {/* Location for events */}
        {item.location && !item.completed && (
          <div className="text-[1.1rem] text-neutral-400 truncate mt-0.5 ml-0.5">
            {item.location}
          </div>
        )}
      </div>

      {/* Push to tomorrow button — routines only, not completed */}
      {onPushTomorrow && !item.completed && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onPushTomorrow()
          }}
          className="shrink-0 p-2 rounded-xl text-neutral-300 hover:text-neutral-500 hover:bg-neutral-100 transition-colors cursor-pointer"
          aria-label="Push to tomorrow"
          title="Push to tomorrow"
        >
          <svg className="w-7 h-7" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 10h12M12 6l4 4-4 4" />
          </svg>
        </button>
      )}
    </div>
  )
}
