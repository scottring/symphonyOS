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
 * Suggest a slot for an item. Heuristic, not a schedule — and honest:
 * - never suggests a slot that's already (mostly) over ("Morning" at 2pm reads
 *   as canned and poisons trust in every other suggestion)
 * - errands/chores lean afternoon; calls lean business hours; conversations
 *   lean evening; everything else takes the earliest slot with room left
 * - returns null late in the day when there's nothing useful to say
 */
export function suggestSlot(item: Suggestable, now: Date = new Date()): SlotSuggestion | null {
  const hour = now.getHours()
  const open: Record<TimeOfDay, boolean> = {
    morning: hour < 11,
    afternoon: hour < 16,
    evening: hour < 21,
  }

  const firstOpen = (
    prefs: TimeOfDay[],
    reasons: Partial<Record<TimeOfDay, string>>,
  ): SlotSuggestion | null => {
    for (const slot of prefs) {
      if (open[slot]) return { slot, reason: reasons[slot] ?? '' }
    }
    return null
  }

  const category = item.category ?? undefined
  const title = (item.title ?? '').toLowerCase()

  if (category === 'errand' || category === 'chore') {
    return firstOpen(['afternoon', 'evening'], {
      afternoon: 'Errands batch well in the afternoon.',
      evening: 'Fold it into an evening run.',
    })
  }
  if (/\b(call|phone|ring|book|appointment|schedule)\b/.test(title)) {
    return firstOpen(['morning', 'afternoon'], {
      morning: 'Calls connect better during business hours.',
      afternoon: 'Still business hours — a good window to call.',
    })
  }
  if (/\b(talk|discuss|ask|check in)\b/.test(title)) {
    return firstOpen(['evening'], {
      evening: 'Evenings are better for conversations at home.',
    })
  }
  return firstOpen(['morning', 'afternoon', 'evening'], {
    morning: 'Your focus is sharpest early.',
    afternoon: 'The afternoon still has room.',
    evening: 'The evening is what\u2019s left \u2014 keep it light.',
  })
}
