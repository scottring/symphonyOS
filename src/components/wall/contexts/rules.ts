import type { ContextRule, ContextEvalData } from './types'

// ============================================================================
// CONDITION HELPERS
// ============================================================================

const DINNER_KEYWORDS = /\b(dinner|supper|meal\s*prep)\b/i
const FOOD_KEYWORDS = /\b(chicken|pasta|spaghetti|penne|linguine|fettuccine|lasagna|taco|burrito|pizza|burger|hamburger|salad|sushi|poke|soup|stew|chili|chowder|steak|beef|rib|fish|salmon|tilapia|cod|shrimp|curry|rice|sandwich|sub|waffle|pancake|bbq|grill|barbecue|pie|fry|fries|fried|noodle|ramen|pho|lobster|crab|meatball|casserole|roast|bake|stir.?fry|enchilada|quesadilla|wings|nuggets|mac.?and.?cheese|hot.?dog|pot.?roast|pulled.?pork|kabob|kebab|teriyaki|pad.?thai)\b/i

function hasDinnerEvent(data: ContextEvalData): boolean {
  const todayStr = toLocalDateStr(data.now)

  return data.calendarEvents.some(event => {
    const startStr = event.start_time || event.startTime
    if (!startStr) return false
    if (!startStr.startsWith(todayStr)) return false

    // Explicit dinner keyword
    if (DINNER_KEYWORDS.test(event.title)) return true

    // Evening event with food keyword
    if (startStr.length > 10) {
      const eventDate = new Date(startStr)
      if (eventDate.getHours() >= 16 && FOOD_KEYWORDS.test(event.title)) return true
    }

    return false
  })
}

function hasIncompleteChores(data: ContextEvalData): boolean {
  return data.todayChores.some(c => !c.completed && !c.skipped)
}

function hasIncompleteTasks(data: ContextEvalData): boolean {
  return data.todayTasks.some(t => !t.completed)
}

function toLocalDateStr(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isWeekend(data: ContextEvalData): boolean {
  const dow = data.now.getDay()
  return dow === 0 || dow === 6
}

// ============================================================================
// DEFAULT RULES
// ============================================================================

export const DEFAULT_CONTEXT_RULES: ContextRule[] = [
  {
    id: 'dinner-flow',
    label: 'Start Dinner',
    icon: '🍽️',
    timeWindow: { startHour: 16, startMinute: 30, endHour: 19, endMinute: 0 },
    condition: hasDinnerEvent,
    viewId: 'dinner-flow',
    priority: 80,
    ttlMinutes: 0, // stays until window ends
    color: '#6DC4A7',
  },
  {
    id: 'morning-launch',
    label: 'Morning Launch',
    icon: '🚀',
    timeWindow: { startHour: 6, startMinute: 30, endHour: 8, endMinute: 30 },
    condition: (data) => !isWeekend(data),
    viewId: 'morning-launch',
    priority: 90,
    ttlMinutes: 0,
    color: '#F9C35C',
    alwaysAvailable: true,
  },
  {
    id: 'after-school',
    label: 'After School',
    icon: '🎒',
    timeWindow: { startHour: 15, startMinute: 0, endHour: 17, endMinute: 0 },
    condition: (data) => !isWeekend(data) && (hasIncompleteTasks(data) || hasIncompleteChores(data)),
    viewId: 'after-school',
    priority: 60,
    ttlMinutes: 0,
    color: '#60A5FA',
  },
  {
    id: 'bedtime',
    label: 'Bedtime',
    icon: '🌙',
    timeWindow: { startHour: 19, startMinute: 0, endHour: 21, endMinute: 0 },
    viewId: 'bedtime',
    priority: 70,
    ttlMinutes: 0,
    color: '#A78BFA',
    alwaysAvailable: true,
  },
  {
    id: 'weekend-morning',
    label: 'Weekend Plan',
    icon: '☀️',
    timeWindow: { startHour: 8, startMinute: 0, endHour: 11, endMinute: 0 },
    condition: isWeekend,
    viewId: 'weekend-morning',
    priority: 50,
    ttlMinutes: 0,
    color: '#F9C35C',
  },
]
