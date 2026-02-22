import type { WallDayData } from '@/hooks/useWallData'
import type { FamilyMember } from '@/types/family'
import { FAMILY_COLORS, type FamilyMemberColor } from '@/types/family'
import { formatTime } from '@/lib/timeUtils'
import type { DaySection } from '@/lib/timeUtils'

interface WallLookAheadProps {
  days: WallDayData[]
  familyMembers: FamilyMember[]
}

interface Highlight {
  date: Date
  dayLabel: string
  title: string
  time: string | null
  assignedMember: FamilyMember | null
  kind: 'event' | 'task' | 'birthday' | 'milestone'
}

const SECTION_ORDER: DaySection[] = ['allday', 'morning', 'afternoon', 'evening']
const MAX_HIGHLIGHTS = 8

function getHighlights(days: WallDayData[], familyMembers: FamilyMember[]): Highlight[] {
  const highlights: Highlight[] = []
  const futureDays = days.filter(d => !d.isToday)

  for (const day of futureDays) {
    const dayLabel = day.date.toLocaleDateString('en-US', { weekday: 'short' })

    // Collect events and tasks (skip routines — they repeat daily)
    for (const section of SECTION_ORDER) {
      const items = day.items[section] || []
      for (const item of items) {
        if (item.type === 'routine' || item.type === 'playbook') continue
        if (item.completed || item.skipped) continue

        const member = item.assignedTo
          ? familyMembers.find(m => m.id === item.assignedTo) || null
          : null

        highlights.push({
          date: day.date,
          dayLabel,
          title: item.title,
          time: item.startTime && !item.allDay ? formatTime(item.startTime) : null,
          assignedMember: member,
          kind: item.type === 'event' ? 'event' : 'task',
        })
      }
    }

    // Birthdays — always noteworthy
    for (const b of day.birthdays) {
      highlights.push({
        date: day.date,
        dayLabel,
        title: b.name,
        time: null,
        assignedMember: null,
        kind: 'birthday',
      })
    }

    // Milestones — always noteworthy
    for (const m of day.milestones) {
      highlights.push({
        date: day.date,
        dayLabel,
        title: m.title,
        time: null,
        assignedMember: null,
        kind: 'milestone',
      })
    }
  }

  // Already sorted by date (days are in order), then by appearance
  return highlights.slice(0, MAX_HIGHLIGHTS)
}

export function WallLookAhead({ days, familyMembers }: WallLookAheadProps) {
  const highlights = getHighlights(days, familyMembers)

  return (
    <div className="flex-1 px-8 py-5 min-h-0 overflow-hidden">
      <div className="text-[1rem] font-semibold uppercase tracking-[0.15em] text-neutral-400 mb-3">
        Look Ahead
      </div>

      {highlights.length === 0 ? (
        <div className="text-[1.25rem] text-neutral-300 italic mt-2">
          Clear week ahead
        </div>
      ) : (
        <div className="space-y-2">
          {highlights.map((h, i) => {
            const memberColors = h.assignedMember
              ? FAMILY_COLORS[h.assignedMember.color as FamilyMemberColor]
              : null

            return (
              <div key={i} className="flex items-center gap-3 min-w-0">
                {/* Day label */}
                <span className="text-[1.15rem] font-medium text-neutral-400 w-[3.5rem] shrink-0">
                  {h.dayLabel}
                </span>

                {/* Color dot */}
                {memberColors ? (
                  <div className={`w-3 h-3 rounded-full shrink-0 ${memberColors.bg} ring-1 ${memberColors.ring}`} />
                ) : (
                  <div className="w-3 h-3 shrink-0" />
                )}

                {/* Icon for special types */}
                {h.kind === 'birthday' && (
                  <span className="text-[1.25rem] shrink-0">&#127874;</span>
                )}
                {h.kind === 'milestone' && (
                  <span className="text-[1.25rem] shrink-0">&#127919;</span>
                )}

                {/* Title */}
                <span className="text-[1.25rem] text-neutral-700 truncate">
                  {h.title}
                </span>

                {/* Time */}
                {h.time && (
                  <span className="text-[1.15rem] text-neutral-400 shrink-0 ml-auto">
                    {h.time}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
