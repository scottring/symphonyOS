import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { WallDayData } from '@/hooks/useWallData'
import { extractRecipeNameHint } from '@/lib/recipeDetection'

interface WallDinnerWidgetProps {
  calendarEvents: CalendarEvent[]
  days: WallDayData[]
}

const DINNER_KEYWORDS = /\b(dinner|supper|meal\s*prep)\b/i

function findDinnerEvent(events: CalendarEvent[], date: Date): CalendarEvent | null {
  const dateStr = date.toISOString().split('T')[0]

  return events.find(event => {
    if (!DINNER_KEYWORDS.test(event.title)) return false

    const startStr = event.start_time || event.startTime
    if (!startStr) return false
    const eventDateStr = new Date(startStr).toISOString().split('T')[0]
    return eventDateStr === dateStr
  }) || null
}

function getDinnerDisplayName(event: CalendarEvent): string {
  const title = event.title
  const hint = extractRecipeNameHint(title)
  return hint || title
}

export function WallDinnerWidget({ calendarEvents, days }: WallDinnerWidgetProps) {
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const tonightEvent = findDinnerEvent(calendarEvents, today)
  const tomorrowEvent = findDinnerEvent(calendarEvents, tomorrow)

  const hasTomorrow = days.length > 1

  return (
    <div className="px-8 py-5 border-b border-neutral-200/40">
      <div className="text-[1rem] font-semibold uppercase tracking-[0.15em] text-neutral-400 mb-2">
        Tonight's Dinner
      </div>

      {tonightEvent ? (
        <div className="font-display text-[2.1rem] text-neutral-800 truncate leading-tight">
          {getDinnerDisplayName(tonightEvent)}
        </div>
      ) : (
        <div className="text-[1.5rem] text-neutral-300 italic">
          No dinner planned
        </div>
      )}

      {hasTomorrow && tomorrowEvent && (
        <div className="mt-2 flex items-baseline gap-2.5">
          <span className="text-[0.9rem] font-semibold uppercase tracking-[0.12em] text-neutral-300">
            Tomorrow
          </span>
          <span className="text-[1.25rem] text-neutral-500 truncate">
            {getDinnerDisplayName(tomorrowEvent)}
          </span>
        </div>
      )}
    </div>
  )
}
