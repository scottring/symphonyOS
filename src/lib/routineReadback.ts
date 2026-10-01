//
// The routine's rule read back in plain words, with the next day it will
// actually come up: "Every 3 months on the 1st (Jan, Apr, Jul, Oct) · next:
// Thu, Jan 1". Shown wherever a rule is edited, so a wrong setting is obvious
// at a glance — "Wash comforters" sat on Quarterly when Scott meant monthly
// on the first weekend, and nothing on screen said so (2026-10-01).
//
// The next date is found by asking matchesRecurrenceForDate — the same
// function Today uses — day by day, so the readback can never promise a day
// the app won't honour.
//

import type { RecurrencePattern, Routine } from '@/types/actionable'
import { matchesRecurrenceForDate } from '@/lib/routineUtils'
import { describeRecurrence } from '@/lib/quickRecurrence'
import { weekendWindowFor } from '@/lib/cadence/weekendWindow'
import { hasMonthlyPosition, describeMonthlyPosition, leavesMonthDayOpen, monthlyPositionWindowFor } from '@/lib/cadence/monthlyPosition'

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

/** The rule in words — more literal than describeRecurrence, which is a chip label. */
export function ruleSentence(p: RecurrencePattern): string {
  switch (p.type) {
    case 'monthly': {
      const every = p.interval && p.interval > 1 ? `Every ${p.interval} months` : 'Monthly'
      if (hasMonthlyPosition(p)) {
        const pos = describeMonthlyPosition(p)
        return p.day_of_week === 'weekend' ? `${every}, ${pos} (either day)` : `${every}, ${pos}`
      }
      if (!p.day_of_month) return 'Once a month, on a day you choose'
      const tail = p.day_of_month > 28 ? ' (or the last day, in shorter months)' : ''
      return `${every} on the ${ordinal(p.day_of_month)}${tail}`
    }
    // Matches matchesRecurrenceForDate: calendar quarters, day_of_month or the 1st.
    case 'quarterly':
      return `Every 3 months on the ${ordinal(p.day_of_month || 1)} (Jan, Apr, Jul, Oct)`
    case 'weekend':
      return 'Every weekend, either day'
    case 'weekly':
      if (!p.days?.length) return p.interval && p.interval > 1 ? `Every ${p.interval} weeks, on a day you choose` : 'Once a week, on a day you choose'
      return describeRecurrence(p)
    default:
      return describeRecurrence(p)
  }
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function dayLabel(d: Date, now: Date): string {
  const label = `${DAY_ABBR[d.getDay()]}, ${MONTH_ABBR[d.getMonth()]} ${d.getDate()}`
  return d.getFullYear() === now.getFullYear() ? label : `${label}, ${d.getFullYear()}`
}

/** "Sat–Sun, Nov 7–8" / "Sat–Sun, Oct 31–Nov 1" / "Sat–Mon, Sep 5–7". */
function windowLabel(days: Date[], now: Date): string {
  const a = days[0]
  const b = days[days.length - 1]
  const weekdays = `${DAY_ABBR[a.getDay()]}–${DAY_ABBR[b.getDay()]}`
  const dates = a.getMonth() === b.getMonth()
    ? `${MONTH_ABBR[a.getMonth()]} ${a.getDate()}–${b.getDate()}`
    : `${MONTH_ABBR[a.getMonth()]} ${a.getDate()}–${MONTH_ABBR[b.getMonth()]} ${b.getDate()}`
  return b.getFullYear() === now.getFullYear() ? `${weekdays}, ${dates}` : `${weekdays}, ${dates}, ${b.getFullYear()}`
}

function timeLabel(time: string | null | undefined): string {
  if (!time) return ''
  const [h, m] = time.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return ''
  const h12 = h % 12 || 12
  return ` at ${h12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

/**
 * The next occurrence in words, or null when the rule leaves the day open
 * (since-last, a flexible week or month) — there is no date to promise.
 * Looks from today, ignoring completions: "when does the rule land next".
 */
export function nextOccurrenceLabel(p: RecurrencePattern, timeOfDay: string | null | undefined, now: Date = new Date()): string | null {
  if (p.type === 'since_last') return null
  if (p.type === 'weekly' && !p.days?.length) return null
  // A quarterly rule with no day is still due on the 1st as far as Today is
  // concerned (matchesRecurrenceForDate), so only an open MONTH has no date.
  if (p.type === 'monthly' && leavesMonthDayOpen(p)) return null
  const probe = { recurrence_pattern: p } as Routine
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  for (let i = 0; i < 800; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i)
    if (!matchesRecurrenceForDate(probe, d, null)) continue
    const window = p.type === 'weekend' ? weekendWindowFor(d)?.days
      : hasMonthlyPosition(p) && p.day_of_week === 'weekend' ? monthlyPositionWindowFor(d, p)
      : null
    if (window && window.length > 1) return windowLabel(window, now)
    if (sameDay(d, today)) return `today${timeLabel(timeOfDay)}`
    if (i === 1) return `tomorrow${timeLabel(timeOfDay)}`
    return `${dayLabel(d, now)}${timeLabel(timeOfDay)}`
  }
  return null
}

/** One line: the rule, then the next day it comes up. */
export function scheduleReadback(p: RecurrencePattern, timeOfDay: string | null | undefined, now: Date = new Date()): string {
  const next = nextOccurrenceLabel(p, timeOfDay, now)
  return next ? `${ruleSentence(p)} · next: ${next}` : ruleSentence(p)
}
