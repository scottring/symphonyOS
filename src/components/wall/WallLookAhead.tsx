import type { WallDayData } from '@/hooks/useWallData'
import type { FamilyMember } from '@/types/family'
import type { TimelineItem } from '@/types/timeline'

import { formatTime } from '@/lib/timeUtils'

interface WallLookAheadProps {
  days: WallDayData[]
  familyMembers: FamilyMember[]
  onItemTap?: (item: TimelineItem) => void
  className?: string
}

interface HighlightItem {
  title: string
  time: string | null
  sourceItem: TimelineItem | null  // null for birthdays
}

interface DayHighlight {
  dayLabel: string
  colorClass: string
  items: HighlightItem[]
}

const MAX_DAYS = 4
const MAX_ITEMS_PER_DAY = 3

// Custom colors for nodes
const COLORS = ['bg-[#6DC4A7]', 'bg-[#F26E63]', 'bg-[#F9C35C]', 'bg-[#6DC4A7]']

function getDayHighlights(days: WallDayData[], _familyMembers: FamilyMember[]): DayHighlight[] {
  const highlights: DayHighlight[] = []

  for (let i = 0; i < days.length; i++) {
    const day = days[i]
    let dayLabel = day.date.toLocaleDateString('en-US', { weekday: 'long' })
    if (day.isToday) dayLabel = 'TODAY'
    else if (i === 1) dayLabel = 'TOMORROW'

    // Collect all non-routine, non-completed items across all sections
    const items: HighlightItem[] = []
    for (const section of ['allday', 'morning', 'afternoon', 'evening'] as const) {
      const sectionItems = day.items[section] || []
      for (const item of sectionItems) {
        if (item.type !== 'routine' && !item.completed && items.length < MAX_ITEMS_PER_DAY) {
          items.push({
            title: item.title.toUpperCase(),
            time: item.startTime && !item.allDay ? formatTime(item.startTime) : null,
            sourceItem: item,
          })
        }
      }
    }

    // Add birthdays if no items or as extra
    if (day.birthdays.length > 0 && items.length < MAX_ITEMS_PER_DAY) {
      for (const bday of day.birthdays) {
        if (items.length >= MAX_ITEMS_PER_DAY) break
        items.push({
          title: `${bday.name.toUpperCase()}'S BIRTHDAY`,
          time: null,
          sourceItem: null,
        })
      }
    }

    if (items.length > 0) {
      highlights.push({
        dayLabel: dayLabel.toUpperCase(),
        colorClass: COLORS[highlights.length % COLORS.length],
        items,
      })
    }

    if (highlights.length >= MAX_DAYS) break
  }

  return highlights
}

export function WallLookAhead({ days, familyMembers, onItemTap, className = '' }: WallLookAheadProps) {
  const highlights = getDayHighlights(days, familyMembers)

  return (
    <div className={`flex flex-col ${className}`}>
      <div className="text-[1.1rem] font-black uppercase tracking-[0.25em] text-white/50 mb-6">
        Look Ahead
      </div>

      <div className="relative pl-6 flex-1 flex flex-col justify-between py-2">
        {/* Continuous vertical timeline line */}
        <div className="absolute left-[7px] top-4 bottom-4 w-1 bg-white/20 rounded-full" />

        {highlights.map((h, i) => (
          <div key={i} className="relative mb-8 last:mb-0">
            {/* Timeline Node */}
            <div className={`absolute -left-[30px] top-1.5 w-5 h-5 rounded-full ${h.colorClass} shadow-md border-[3px] border-[#1e293b]`} />

            <div className="flex flex-col">
              <span className="text-[1.3rem] font-bold text-white tracking-widest leading-none">
                {h.dayLabel}
              </span>
              {h.items.map((item, j) => (
                <span
                  key={j}
                  className={`text-[1.05rem] font-medium text-white/70 mt-1 uppercase tracking-wide ${item.sourceItem && onItemTap ? 'cursor-pointer hover:text-white/90 transition-colors' : ''}`}
                  onClick={item.sourceItem && onItemTap ? () => onItemTap(item.sourceItem!) : undefined}
                >
                  {item.time ? `${item.time}: ` : ''}{item.title}
                </span>
              ))}
            </div>

            {/* Horizontal line extending from first node - aesthetic touch */}
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
