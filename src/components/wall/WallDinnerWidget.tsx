import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { WallDayData } from '@/hooks/useWallData'
import { extractRecipeNameHint } from '@/lib/recipeDetection'

interface WallDinnerWidgetProps {
    calendarEvents: CalendarEvent[]
    days: WallDayData[]
}

const DINNER_KEYWORDS = /\b(dinner|supper|meal\s*prep)\b/i

// Map meal keywords → emoji for visual flair
const MEAL_ICONS: [RegExp, string][] = [
    [/\bchicken\b/i, '🍗'],
    [/\bpasta|spaghetti|penne|linguine|lasagna\b/i, '🍝'],
    [/\btaco/i, '🌮'],
    [/\bburrito/i, '🌯'],
    [/\bpizza/i, '🍕'],
    [/\bburger|hamburger/i, '🍔'],
    [/\bsalad/i, '🥗'],
    [/\bsushi|poke/i, '🍣'],
    [/\bsoup|stew|chili|chowder/i, '🍲'],
    [/\bsteak|beef|rib/i, '🥩'],
    [/\bfish|salmon|shrimp/i, '🐟'],
    [/\bcurry/i, '🍛'],
    [/\brice\b/i, '🍚'],
    [/\bsandwich|sub\b/i, '🥪'],
    [/\bpie\b/i, '🥧'],
    [/\bnoodle|ramen|pho/i, '🍜'],
]

const DEFAULT_MEAL_ICON = '🍽️'

function getMealIcon(name: string): string {
    for (const [pattern, emoji] of MEAL_ICONS) {
        if (pattern.test(name)) return emoji
    }
    return DEFAULT_MEAL_ICON
}

function findDinnerEvent(events: CalendarEvent[], date: Date): CalendarEvent | null {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const dateStr = `${year}-${month}-${day}`

    return events.find(event => {
        if (!DINNER_KEYWORDS.test(event.title)) return false
        const startStr = event.start_time || event.startTime
        if (!startStr) return false

        // Ensure we parse the event start in local bounds too if it has a time, 
        // or just substring the first 10 characters for full day events.
        const eventDateStr = startStr.substring(0, 10)
        return eventDateStr === dateStr
    }) || null
}

export function WallDinnerWidget({ calendarEvents }: WallDinnerWidgetProps) {
    const today = new Date()
    const tonightEvent = findDinnerEvent(calendarEvents, today)

    const tonightName = tonightEvent ? extractRecipeNameHint(tonightEvent.title) || tonightEvent.title : ''
    const icon = getMealIcon(tonightName)

    return (
        <div className="flex bg-[#6DC4A7]/20 rounded-3xl p-4 items-center gap-4 mt-6 border-2 border-[#6DC4A7]/30">
            <div className="w-16 h-16 bg-[#6DC4A7] rounded-2xl flex items-center justify-center text-[2.5rem] shadow-lg shrink-0">
                {icon}
            </div>
            <div className="flex flex-col min-w-0">
                <span className="text-[#6DC4A7] font-black uppercase tracking-widest text-[0.9rem] mb-0.5">
                    Tonight's Dinner
                </span>
                {tonightEvent ? (
                    <span className="text-white font-bold text-[1.4rem] truncate leading-tight">
                        {tonightName}
                    </span>
                ) : (
                    <span className="text-white/50 font-medium text-[1.2rem] italic">
                        No dinner planned
                    </span>
                )}
            </div>
        </div>
    )
}
