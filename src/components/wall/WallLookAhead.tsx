import type { WallDayData } from '@/hooks/useWallData'
import type { FamilyMember } from '@/types/family'

import { formatTime } from '@/lib/timeUtils'

interface WallLookAheadProps {
  days: WallDayData[]
  familyMembers: FamilyMember[]
  className?: string
}

interface Highlight {
  date: Date
  dayLabel: string
  title: string
  time: string | null
  colorClass: string
}

const MAX_HIGHLIGHTS = 4

function getHighlights(days: WallDayData[], _familyMembers: FamilyMember[]): Highlight[] {
  const highlights: Highlight[] = []

  // Custom colors for nodes
  const COLORS = ['bg-[#6DC4A7]', 'bg-[#F26E63]', 'bg-[#F9C35C]', 'bg-[#6DC4A7]']

  for (let i = 0; i < days.length; i++) {
    const day = days[i]
    let dayLabel = day.date.toLocaleDateString('en-US', { weekday: 'long' })
    if (day.isToday) dayLabel = 'TODAY'
    else if (i === 1) dayLabel = 'TOMORROW'

    // Find the first interesting event/task for the day
    let bestItem = null
    for (const section of ['morning', 'afternoon', 'evening', 'allday'] as const) {
      if (bestItem) break
      const items = day.items[section] || []
      bestItem = items.find(item => item.type !== 'routine' && !item.completed) || null
    }

    if (bestItem) {
      highlights.push({
        date: day.date,
        dayLabel: dayLabel.toUpperCase(),
        title: bestItem.title.toUpperCase(),
        time: bestItem.startTime && !bestItem.allDay ? formatTime(bestItem.startTime) : null,
        colorClass: COLORS[highlights.length % COLORS.length]
      })
    } else if (day.birthdays.length > 0) {
      highlights.push({
        date: day.date,
        dayLabel: dayLabel.toUpperCase(),
        title: `${day.birthdays[0].name.toUpperCase()}'S BIRTHDAY`,
        time: null,
        colorClass: COLORS[highlights.length % COLORS.length]
      })
    }

    if (highlights.length >= MAX_HIGHLIGHTS) break
  }

  return highlights
}

export function WallLookAhead({ days, familyMembers, className = '' }: WallLookAheadProps) {
  const highlights = getHighlights(days, familyMembers)

  return (
    <div className={`flex flex-col pl-8 ${className}`}>
      <div className="text-[1.3rem] font-bold uppercase tracking-[0.2em] text-white mb-8 mt-2">
        Look Ahead
      </div>

      <div className="relative pl-6 flex-1 flex flex-col justify-between py-2">
        {/* Continuous vertical timeline line */}
        <div className="absolute left-[7px] top-4 bottom-4 w-1 bg-white/20 rounded-full" />

        {highlights.map((h, i) => (
          <div key={i} className="relative mb-10 last:mb-0">
            {/* Timeline Node */}
            <div className={`absolute -left-[30px] top-1.5 w-5 h-5 rounded-full ${h.colorClass} shadow-md border-[3px] border-[#1e293b]`} />

            <div className="flex flex-col">
              <span className="text-[1.3rem] font-bold text-white tracking-widest leading-none">
                {h.dayLabel}
              </span>
              <span className="text-[1.1rem] font-medium text-white/70 mt-1 uppercase tracking-wide">
                {h.time ? `${h.time}: ` : ''}{h.title}
              </span>
            </div>

            {/* Horizontal line extending from yesterday/today - aesthetic touch mimicking the mock */}
            {i === 0 && (
              <div className="absolute top-2 left-6 right-[-20px] h-1 bg-[#2e3e57] rounded-full -z-10" />
            )}
          </div>
        ))}

        {/* Placeholder if empty */}
        {highlights.length === 0 && (
          <div className="text-white/50 italic text-[1.2rem]">Nothing scheduled</div>
        )}
      </div>
    </div>
  )
}
