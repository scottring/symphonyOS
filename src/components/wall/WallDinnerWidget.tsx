import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { WallDayData } from '@/hooks/useWallData'
import { extractRecipeNameHint } from '@/lib/recipeDetection'

interface WallDinnerWidgetProps {
    calendarEvents: CalendarEvent[]
    days: WallDayData[]
    recipeUrl?: string | null
    onOpenRecipe?: () => void
}

const DINNER_KEYWORDS = /\b(dinner|supper|meal\s*prep)\b/i

// Food keywords — if an evening event title matches any of these, treat it as dinner
const FOOD_KEYWORDS = /\b(chicken|pasta|spaghetti|penne|linguine|fettuccine|lasagna|taco|burrito|pizza|burger|hamburger|salad|sushi|poke|soup|stew|chili|chowder|steak|beef|rib|fish|salmon|tilapia|cod|shrimp|curry|rice|sandwich|sub|waffle|pancake|bbq|grill|barbecue|pie|fry|fries|fried|noodle|ramen|pho|lobster|crab|meatball|casserole|roast|bake|stir.?fry|enchilada|quesadilla|wings|nuggets|mac.?and.?cheese|hot.?dog|pot.?roast|pulled.?pork|kabob|kebab|teriyaki|pad.?thai)\b/i

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

function toLocalDateStr(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

function isOnDate(event: CalendarEvent, dateStr: string): boolean {
    const startStr = event.start_time || event.startTime
    if (!startStr) return false
    return startStr.substring(0, 10) === dateStr
}

function isEveningEvent(event: CalendarEvent): boolean {
    const startStr = event.start_time || event.startTime
    if (!startStr || startStr.length <= 10) return false // all-day events aren't evening
    const eventDate = new Date(startStr)
    return eventDate.getHours() >= 16 // 4 PM or later
}

function findDinnerEvent(events: CalendarEvent[], date: Date): CalendarEvent | null {
    const dateStr = toLocalDateStr(date)
    const todayEvents = events.filter(e => isOnDate(e, dateStr))

    // 1. Explicit dinner/supper/meal prep event
    const explicit = todayEvents.find(e => DINNER_KEYWORDS.test(e.title))
    if (explicit) return explicit

    // 2. Any evening event whose title contains food keywords
    const eveningFood = todayEvents.find(e => isEveningEvent(e) && FOOD_KEYWORDS.test(e.title))
    if (eveningFood) return eveningFood

    return null
}

export function WallDinnerWidget({ calendarEvents, recipeUrl, onOpenRecipe }: WallDinnerWidgetProps) {
    const today = new Date()
    const tonightEvent = findDinnerEvent(calendarEvents, today)

    const tonightName = tonightEvent ? extractRecipeNameHint(tonightEvent.title) || tonightEvent.title : ''
    const icon = getMealIcon(tonightName)

    const hasRecipe = !!recipeUrl && !!tonightEvent
    const handleClick = hasRecipe ? onOpenRecipe : undefined

    return (
        <div
            className={`flex bg-[#6DC4A7]/20 rounded-3xl p-4 items-center gap-4 mt-6 border-2 border-[#6DC4A7]/30
                ${hasRecipe ? 'cursor-pointer hover:bg-[#6DC4A7]/30 transition-colors' : ''}`}
            onClick={handleClick}
            role={hasRecipe ? 'button' : undefined}
        >
            <div className="w-16 h-16 bg-[#6DC4A7] rounded-2xl flex items-center justify-center text-[2.5rem] shadow-lg shrink-0">
                {icon}
            </div>
            <div className="flex flex-col min-w-0 flex-1">
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
            {hasRecipe && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#6DC4A7]/20 border border-[#6DC4A7]/30 shrink-0">
                    <span className="text-[1rem]">📖</span>
                    <span className="text-[#6DC4A7] font-black text-[0.75rem] uppercase tracking-widest">
                        Recipe
                    </span>
                </div>
            )}
        </div>
    )
}

// Re-export helpers for use by WallCalendar
export { findDinnerEvent, getMealIcon }
