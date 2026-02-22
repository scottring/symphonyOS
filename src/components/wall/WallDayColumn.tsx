import type { WallDayData } from '@/hooks/useWallData'
import type { FamilyMember } from '@/types/family'
import type { DaySection } from '@/lib/timeUtils'
import { WallItem } from './WallItem'

interface WallDayColumnProps {
  day: WallDayData
  familyMembers: FamilyMember[]
}

const SECTION_ORDER: DaySection[] = ['allday', 'morning', 'afternoon', 'evening']

const SECTION_LABELS: Record<string, string> = {
  allday: 'All Day',
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
}

export function WallDayColumn({ day, familyMembers }: WallDayColumnProps) {
  const weekday = day.date.toLocaleDateString('en-US', { weekday: 'short' })
  const dayNum = day.date.getDate()

  // Check if there are any items
  const hasItems = SECTION_ORDER.some(s => day.items[s]?.length > 0)

  return (
    <div
      className={`
        flex flex-col overflow-hidden border-r border-neutral-200/40 last:border-r-0
        ${day.isToday
          ? 'bg-primary-50/30 ring-2 ring-primary-300/40 ring-inset'
          : 'bg-bg-elevated'
        }
      `}
    >
      {/* Day header */}
      <div
        className={`
          px-3 py-2.5 text-center border-b shrink-0
          ${day.isToday ? 'border-primary-200/60 bg-primary-50/50' : 'border-neutral-100'}
        `}
      >
        <div
          className={`
            text-[0.7rem] font-semibold uppercase tracking-widest
            ${day.isToday ? 'text-primary-600' : 'text-neutral-400'}
          `}
        >
          {day.isToday ? 'Today' : weekday}
        </div>
        <div
          className={`
            text-2xl font-display leading-tight
            ${day.isToday ? 'text-primary-700' : 'text-neutral-700'}
          `}
        >
          {dayNum}
        </div>
      </div>

      {/* Scrollable items area */}
      <div className="flex-1 overflow-y-auto px-1.5 py-1">
        {!hasItems && (
          <div className="text-center text-neutral-300 text-sm mt-4 italic">
            Nothing scheduled
          </div>
        )}

        {SECTION_ORDER.map(section => {
          const items = day.items[section]
          if (!items || items.length === 0) return null

          return (
            <div key={section} className="mb-1">
              {/* Section divider — only show if there are multiple sections with content */}
              {section !== 'allday' && (
                <div className="flex items-center gap-1.5 px-2 pt-1.5 pb-0.5">
                  <div className="h-px flex-1 bg-neutral-200/60" />
                  <span className="text-[0.6rem] font-medium uppercase tracking-wider text-neutral-300">
                    {SECTION_LABELS[section]}
                  </span>
                  <div className="h-px flex-1 bg-neutral-200/60" />
                </div>
              )}

              {/* Items */}
              {items.map(item => (
                <WallItem
                  key={item.id}
                  item={item}
                  familyMembers={familyMembers}
                />
              ))}
            </div>
          )
        })}

        {/* Birthday indicators */}
        {day.birthdays.length > 0 && (
          <div className="mt-2 px-2">
            {day.birthdays.map((b, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 py-1 text-sm text-accent-600"
              >
                <span className="text-base">🎂</span>
                <span className="truncate font-medium">{b.name}</span>
              </div>
            ))}
          </div>
        )}

        {/* Milestone indicators */}
        {day.milestones.length > 0 && (
          <div className="mt-1 px-2">
            {day.milestones.map((m, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 py-1 text-sm text-sage-600"
              >
                <span className="text-base">🎯</span>
                <span className="truncate">{m.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
