import type { PlaybookBlock, PlaybookItem, DayType } from '@/types/playbook'

/**
 * Fallback playbook blocks for the Kaufman family.
 * Used when no weekly template exists yet. Seeded on first load.
 *
 * Family: Scott (parent), Iris (partner), Kaleb (son), Ella (daughter) — twins
 *
 * Kid equity: Ella and Kaleb get equal representation in every kid-relevant block.
 */

// Helper to create items without DB ids (ids assigned on insert)
function item(who: string, action: string, context?: string, coaching?: string): Omit<PlaybookItem, 'id'> {
  return { who, action, ...(context && { context }), ...(coaching && { coaching }) }
}

type FallbackBlock = Omit<PlaybookBlock, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'items'> & {
  items: Omit<PlaybookItem, 'id'>[]
}

// ────────────────────────────────────────────────────
// SCHOOL DAY BLOCKS
// ────────────────────────────────────────────────────

const schoolDayBlocks: FallbackBlock[] = [
  {
    timeSlot: '5:30-6:45',
    label: 'Solo Morning',
    blockType: 'solo',
    narrative: 'This is your time. Coffee, work, thinking — whatever fuels you before the house wakes up. Protect it. The morning sets the tone for how you show up when the kids emerge.',
    coachingNote: 'If you skip this block, you tend to start reactive instead of proactive. Even 30 minutes matters.',
    items: [
      item('self', 'Coffee + quiet focus time', 'Sets your emotional baseline for the day'),
    ],
    dayTypes: ['school-day'] as DayType[],
    sortOrder: 0,
    templateId: null,
  },
  {
    timeSlot: '6:50',
    label: 'Wake Up the Twins',
    blockType: 'transition',
    narrative: 'Walk in with energy but not chaos. Start with physical touch — a high five for Kaleb, a hug for Ella. Make the first interaction warm. They\'re waking up to you, and that sets their tone too.',
    coachingNote: 'Kaleb responds better to "You\'ve got this, buddy" than "Get up." Ella appreciates a moment of quiet connection before the rush starts.',
    items: [
      item('kaleb', 'High five + "Ready to crush it today?"', 'Physical touch is his love language in the morning'),
      item('ella', 'Morning hug + "What are you looking forward to?"', 'She needs a beat of calm before the rush'),
    ],
    dayTypes: ['school-day'] as DayType[],
    sortOrder: 1,
    templateId: null,
  },
  {
    timeSlot: '7:00',
    label: 'Get Ready Relay',
    blockType: 'routine',
    narrative: 'This is the assembly line. Breakfast, teeth, clothes, bags. Your job is traffic controller, not drill sergeant. Use "what\'s next?" instead of "hurry up." The pace should feel steady, not panicked.',
    coachingNote: 'When you say "hurry up," both kids hear "I\'m failing." Try: "You\'re on track, what\'s your next step?" It puts them in control.',
    items: [
      item('kaleb', 'Breakfast → teeth → dressed → backpack check', 'He moves faster with a clear sequence'),
      item('ella', 'Breakfast → teeth → dressed → backpack check', 'She sometimes stalls at clothes — lay them out the night before'),
      item('self', 'Pack lunches + fill water bottles', 'Do this while they eat — parallel tracks'),
    ],
    dayTypes: ['school-day'] as DayType[],
    sortOrder: 2,
    templateId: null,
  },
  {
    timeSlot: '7:30',
    label: 'Pack Up + Launch',
    blockType: 'departure',
    narrative: 'Final check: shoes, bags, jackets. This is the moment that either spirals or stays smooth. The secret: have everything staged by the door the night before. When mornings are smooth, everyone leaves feeling capable.',
    coachingNote: 'If you feel tension rising, take one breath before speaking. The kids mirror your energy at departure more than any other moment.',
    items: [
      item('kaleb', 'Shoes on + grab bag', 'Let him do it himself — he\'s proud of being independent'),
      item('ella', 'Shoes on + grab bag', 'She might need a gentle redirect if she\'s distracted'),
      item('both', 'High fives at the door — "Go be awesome"'),
    ],
    dayTypes: ['school-day'] as DayType[],
    sortOrder: 3,
    templateId: null,
  },
  {
    timeSlot: '15:30',
    label: 'Reunite & Reconnect',
    blockType: 'connection',
    narrative: 'When the kids get home, resist jumping straight to "How was school?" That question often gets "fine." Instead, start with presence. Snack time is reconnection time. Sit with them. Let them decompress. The stories will come.',
    coachingNote: 'Try: "Tell me one thing that made you laugh today" or "What was the hardest part?" These open more doors than "How was school?"',
    items: [
      item('kaleb', 'Snack + open-ended question', 'He opens up more after 10 minutes of decompression'),
      item('ella', 'Snack + open-ended question', 'She often shares more when you\'re doing something side-by-side'),
    ],
    dayTypes: ['school-day'] as DayType[],
    sortOrder: 4,
    templateId: null,
  },
  {
    timeSlot: '19:00',
    label: 'Evening Wind-Down',
    blockType: 'together',
    narrative: 'Screens off. The transition from activity to calm is the bridge to good sleep. Reading, drawing, a board game — whatever lowers the energy. This is also when you can have the best conversations, because the pressure of the day is off.',
    coachingNote: 'If screens are still on after 7pm, use the "earned language": "Once your stuff is done, you\'ve earned your wind-down time." Don\'t frame it as punishment.',
    items: [
      item('kaleb', 'Choose a wind-down activity', 'He tends toward reading or building — both are great'),
      item('ella', 'Choose a wind-down activity', 'She likes drawing or being read to'),
      item('self', 'Be present — phone away', 'Your presence during wind-down is the most powerful signal'),
    ],
    dayTypes: ['school-day'] as DayType[],
    sortOrder: 5,
    templateId: null,
  },
  {
    timeSlot: '20:00',
    label: 'Bedtime Script',
    blockType: 'connection',
    narrative: 'Bedtime is the bookend to the morning wake-up. Make it warm, predictable, and individual. Each kid gets their own moment — this is where you deposit into their emotional bank account for tomorrow.',
    coachingNote: 'Kaleb needs a clear sequence (brush, book, lights). Ella sometimes wants to talk — give her 5 minutes but hold the boundary on lights-out.',
    items: [
      item('kaleb', 'Brush teeth → one chapter → "What are you proud of today?" → lights out', 'The pride question builds his self-worth'),
      item('ella', 'Brush teeth → one chapter → "What made you feel loved today?" → lights out', 'The love question strengthens her attachment security'),
    ],
    dayTypes: ['school-day'] as DayType[],
    sortOrder: 6,
    templateId: null,
  },
]

// ────────────────────────────────────────────────────
// WEEKEND BLOCKS
// ────────────────────────────────────────────────────

const weekendBlocks: FallbackBlock[] = [
  {
    timeSlot: '7:00-8:30',
    label: 'Lazy Morning',
    blockType: 'together',
    narrative: 'Weekends don\'t have alarms. Let everyone wake up naturally. Pancakes, cartoons, slow coffee — this is the family breathing together. The lack of schedule IS the point.',
    coachingNote: 'Resist the urge to plan the whole day before 9am. Let the morning unfold.',
    items: [
      item('both', 'Let them wake up naturally — no agenda'),
      item('self', 'Coffee + be present (not on your phone)'),
    ],
    dayTypes: ['weekend'] as DayType[],
    sortOrder: 0,
    templateId: null,
  },
  {
    timeSlot: '10:00',
    label: 'Family Adventure or Project',
    blockType: 'together',
    narrative: 'Pick ONE thing. A bike ride, a cooking project, a trip to the park. The magic is in the shared experience, not the scale. Both kids should have input on what it is — alternate who picks each weekend.',
    coachingNote: 'This week: let Kaleb pick. Next week: Ella. Write it down so it\'s fair.',
    items: [
      item('kaleb', 'Input on today\'s activity (if it\'s his pick week)'),
      item('ella', 'Input on today\'s activity (if it\'s her pick week)'),
      item('self', 'Participate fully — this is connection time, not supervision'),
    ],
    dayTypes: ['weekend'] as DayType[],
    sortOrder: 1,
    templateId: null,
  },
  {
    timeSlot: '14:00',
    label: 'Independent Time',
    blockType: 'buffer',
    narrative: 'After the shared activity, everyone gets downtime. Kids play independently, adults recharge. This teaches the kids that alone time is healthy and that they don\'t need constant entertainment.',
    coachingNote: 'If they say "I\'m bored," that\'s okay. Boredom breeds creativity. Don\'t rush to fill it.',
    items: [
      item('kaleb', 'Independent play or reading'),
      item('ella', 'Independent play or creative time'),
      item('self', 'Recharge — guilt-free'),
    ],
    dayTypes: ['weekend'] as DayType[],
    sortOrder: 2,
    templateId: null,
  },
  {
    timeSlot: '17:00',
    label: 'Family Dinner Prep',
    blockType: 'routine',
    narrative: 'Cooking together is an underrated connection activity. Give each kid a job. Kaleb can measure, Ella can stir. The conversation flows when hands are busy.',
    coachingNote: 'It will take longer and be messier than cooking alone. That\'s the point.',
    items: [
      item('kaleb', 'Help with meal prep — measuring, chopping (supervised)', 'He feels useful with real tasks'),
      item('ella', 'Help with meal prep — stirring, setting table', 'She loves being part of the team'),
    ],
    dayTypes: ['weekend'] as DayType[],
    sortOrder: 3,
    templateId: null,
  },
  {
    timeSlot: '19:30',
    label: 'Weekend Bedtime',
    blockType: 'connection',
    narrative: 'Weekend bedtime is 30 minutes later but follows the same emotional arc. The ritual stays the same — predictability is safety. Add one weekend-only element: "best part of today" round-robin.',
    coachingNote: 'The "best part of today" round-robin gives you signal about what the kids value. Listen for patterns across weeks.',
    items: [
      item('both', 'Best part of today — everyone shares'),
      item('kaleb', 'Same bedtime ritual, 30 min later'),
      item('ella', 'Same bedtime ritual, 30 min later'),
    ],
    dayTypes: ['weekend'] as DayType[],
    sortOrder: 4,
    templateId: null,
  },
]

/**
 * All fallback blocks, keyed by day type.
 */
export const FALLBACK_BLOCKS: Record<DayType, FallbackBlock[]> = {
  'school-day': schoolDayBlocks,
  'weekend': weekendBlocks,
  'holiday': weekendBlocks, // Holidays use weekend schedule
  'half-day': schoolDayBlocks, // Half-days use school-day schedule (can be refined later)
}

/**
 * Get fallback blocks for a specific day type.
 */
export function getFallbackBlocksForDay(dayType: DayType): FallbackBlock[] {
  return FALLBACK_BLOCKS[dayType] || FALLBACK_BLOCKS['school-day']
}

/**
 * Get all unique fallback blocks (for initial seeding).
 */
export function getAllFallbackBlocks(): FallbackBlock[] {
  return [...schoolDayBlocks, ...weekendBlocks]
}
