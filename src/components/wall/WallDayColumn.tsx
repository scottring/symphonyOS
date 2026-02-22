import type { WallDayData } from '@/hooks/useWallData'
import type { FamilyMember } from '@/types/family'
import type { DaySection } from '@/lib/timeUtils'
import { WallItem } from './WallItem'

interface WallDayColumnProps {
  day: WallDayData
  familyMembers: FamilyMember[]
}

const SECTION_ORDER: DaySection[] = ['allday', 'morning', 'afternoon', 'evening']

export function WallDayColumn({ day, familyMembers }: WallDayColumnProps) {
  const weekday = day.date.toLocaleDateString('en-US', { weekday: 'short' })
  const dayNum = day.date.getDate()

  // Flatten all items for this day (compact view — no section dividers needed)
  const allItems = SECTION_ORDER.flatMap(s => day.items[s] || [])
  const hasContent = allItems.length > 0 || day.birthdays.length > 0 || day.milestones.length > 0

  return (
    <div className="flex flex-col overflow-hidden border-r border-neutral-200/30 last:border-r-0">
      {/* Day header */}
      <div className="px-3 py-3 text-center border-b border-neutral-100/60 shrink-0">
        <div className="text-[0.75rem] font-semibold uppercase tracking-[0.15em] text-neutral-400">
          {weekday}
        </div>
        <div className="text-[1.8rem] font-display leading-tight text-neutral-700">
          {dayNum}
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto px-1 py-1">
        {!hasContent && (
          <div className="text-center text-neutral-300 text-[0.85rem] mt-6 italic">
            Clear
          </div>
        )}

        {allItems.map(item => (
          <WallItem
            key={item.id}
            item={item}
            familyMembers={familyMembers}
            size="compact"
          />
        ))}

        {/* Birthdays */}
        {day.birthdays.map((b, i) => (
          <div key={`bday-${i}`} className="flex items-center gap-2 py-1.5 px-2">
            <span className="text-[1.1rem]">&#127874;</span>
            <span className="text-[0.95rem] font-medium text-accent-500 truncate">{b.name}</span>
          </div>
        ))}

        {/* Milestones */}
        {day.milestones.map((m, i) => (
          <div key={`ms-${i}`} className="flex items-center gap-2 py-1.5 px-2">
            <span className="text-[1.1rem]">&#127919;</span>
            <span className="text-[0.95rem] text-sage-600 truncate">{m.title}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
