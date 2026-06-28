// Slot suggestion + slot→time mapping for the Daily Plan.
//
// The AI here is deliberately humble: it *suggests* a time-of-day slot and gives
// a one-line reason, but the user's tap is what commits (the /roast council was
// emphatic — human owns the sequence, never a locked auto-plan). Kept as a pure
// function so it's trivially testable and can later be swapped for the proactive
// engine without touching the UI.

import type { TimeOfDay } from '@/lib/timeUtils'

/** Representative hour for each slot when we materialize a scheduled time. */
const SLOT_HOUR: Record<TimeOfDay, number> = { morning: 9, afternoon: 14, evening: 19 }

/** A concrete time on `date` for the given slot (e.g. afternoon → 2:00 PM). */
export function slotTime(date: Date, slot: TimeOfDay): Date {
  const d = new Date(date)
  d.setHours(SLOT_HOUR[slot], 0, 0, 0)
  return d
}

/** The slot's representative time as a routine `time_of_day` string ("HH:MM:SS"). */
export function slotTimeOfDay(slot: TimeOfDay): string {
  return `${String(SLOT_HOUR[slot]).padStart(2, '0')}:00:00`
}

/** Map an "HH:MM[:SS]" time-of-day to its slot. */
export function timeOfDayToSlot(timeOfDay: string): TimeOfDay {
  const hour = Number(timeOfDay.split(':')[0])
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'evening'
}

export interface SlotSuggestion {
  slot: TimeOfDay
  reason: string
}

/** Loose shape — we only read what we need, so both Task and TimelineItem fit. */
interface Suggestable {
  category?: string | null
  title?: string
}

/**
 * Suggest a slot for an item. Heuristic, not a schedule:
 * - errands/chores lean afternoon (batch them when you're already up and out)
 * - everything else defaults to morning (focus is sharpest early)
 */
export function suggestSlot(item: Suggestable): SlotSuggestion {
  const category = item.category ?? undefined
  if (category === 'errand' || category === 'chore') {
    return { slot: 'afternoon', reason: 'Errands batch well in the afternoon.' }
  }
  return { slot: 'morning', reason: 'Your focus is sharpest early.' }
}
