import type { PlaybookBlock, PlaybookItem, DayType } from '@/types/playbook'

/**
 * Fallback playbook blocks for new users.
 * Used when no weekly template exists yet. Seeded on first load.
 *
 * Generic parenting template — works for any family structure.
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
    label: 'Wake Up the Kids',
    blockType: 'transition',
    narrative: 'Walk in with energy but not chaos. Start with physical touch — a high five, a hug, a gentle shoulder squeeze. Make the first interaction warm. They\'re waking up to you, and that sets their tone too.',
    coachingNote: 'Try "You\'ve got this today!" instead of "Get up." A moment of quiet connection before the rush starts goes a long way.',
    items: [
      item('children', 'Warm greeting + physical connection', 'Physical touch sets a positive tone for the morning'),
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
    coachingNote: 'When you say "hurry up," kids hear "I\'m failing." Try: "You\'re on track, what\'s your next step?" It puts them in control.',
    items: [
      item('children', 'Breakfast \u2192 teeth \u2192 dressed \u2192 backpack check', 'A clear sequence helps kids move faster'),
      item('self', 'Pack lunches + fill water bottles', 'Do this while they eat \u2014 parallel tracks'),
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
      item('children', 'Shoes on + grab bag', 'Let them do it themselves \u2014 builds independence'),
      item('children', 'High fives at the door \u2014 "Go be awesome"'),
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
      item('children', 'Snack + open-ended question', 'Give them 10 minutes of decompression before asking about the day'),
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
    coachingNote: 'If screens are still on after 7pm, use earned language: "Once your stuff is done, you\'ve earned your wind-down time." Don\'t frame it as punishment.',
    items: [
      item('children', 'Choose a wind-down activity', 'Reading, drawing, building \u2014 whatever lowers the energy'),
      item('self', 'Be present \u2014 phone away', 'Your presence during wind-down is the most powerful signal'),
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
    coachingNote: 'A clear sequence (brush, book, lights) helps kids feel safe. Give each child a moment of individual connection before lights out.',
    items: [
      item('children', 'Brush teeth \u2192 one chapter \u2192 reflection question \u2192 lights out', 'Try "What are you proud of today?" or "What made you feel loved today?"'),
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
      item('children', 'Let them wake up naturally \u2014 no agenda'),
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
    narrative: 'Pick ONE thing. A bike ride, a cooking project, a trip to the park. The magic is in the shared experience, not the scale. Let the kids have input on what it is — alternate who picks each weekend.',
    coachingNote: 'Take turns choosing the activity. Write it down so it\'s fair.',
    items: [
      item('children', 'Input on today\'s activity (take turns picking)'),
      item('self', 'Participate fully \u2014 this is connection time, not supervision'),
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
      item('children', 'Independent play, reading, or creative time'),
      item('self', 'Recharge \u2014 guilt-free'),
    ],
    dayTypes: ['weekend'] as DayType[],
    sortOrder: 2,
    templateId: null,
  },
  {
    timeSlot: '17:00',
    label: 'Family Dinner Prep',
    blockType: 'routine',
    narrative: 'Cooking together is an underrated connection activity. Give each kid a job — measuring, stirring, setting the table. The conversation flows when hands are busy.',
    coachingNote: 'It will take longer and be messier than cooking alone. That\'s the point.',
    items: [
      item('children', 'Help with meal prep \u2014 real tasks they can own', 'Kids feel useful with age-appropriate responsibility'),
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
      item('children', 'Best part of today \u2014 everyone shares'),
      item('children', 'Same bedtime ritual, 30 min later'),
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
