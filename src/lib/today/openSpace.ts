import type { TimelineItem } from '@/types/timeline'
import { effectiveStartTime, formatDurationMinutes } from '@/lib/timeUtils'

/**
 * Open space — the day's holes, named.
 *
 * Today tells you what you are committed to. It has never told you what is
 * left, and the two are not the same question: a day holding a 7:00 AM routine
 * and a 6:45 PM one renders as two rows with white space between them, and the
 * white space is the part you actually plan against. "Can I take this on?" is
 * answered by the gap, not by the commitments bracketing it.
 *
 * So the gaps get a line. One quiet rule per hole, carrying the only number
 * that decides anything — how long it is — and what closes it.
 *
 * Deliberately NOT a scoreboard: this counts free time, never outstanding
 * work. It appears where there is room and says nothing anywhere else.
 */

/** Below this, a gap is just the seam between two rows — not open space. */
export const MIN_OPEN_SPAN_MINUTES = 90

export interface OpenSpan {
  /** Where the free run begins (clamped to `now` when now falls inside it). */
  from: Date
  /** Where it ends — the start of the item this span sits above. */
  until: Date
  minutes: number
  /** "dinner" when the closing item is a meal; otherwise a clock time. */
  untilLabel: string
}

const MEAL_RE = /\b(breakfast|brunch|lunch|dinner|supper)\b/i

/**
 * The word a meal row should be called, or null when it isn't one.
 *
 * Gated on type === 'event' for the same reason TodaySectionList gates its
 * meal-card branch: plenty of ordinary work merely MENTIONS a meal. The
 * routine "Clean kitchen after dinner" matches the keyword and is not a
 * meal, and a span that ended "until dinner" there would name the wrong
 * thing — worse, it would name a thing the user can see is not dinner.
 */
function mealWord(item: TimelineItem): string | null {
  // Synthesized meal-plan entries are meals by construction, whatever the
  // title leads with ("Bread, israeli salad" is Monday's dinner).
  const slot = /^meal:/.test(String(item.id)) ? MEAL_RE.exec(item.title) : null
  if (String(item.id).startsWith('meal:')) return slot ? slot[1].toLowerCase() : 'dinner'
  if (item.type !== 'event') return null
  const m = MEAL_RE.exec(item.title)
  return m ? m[1].toLowerCase() : null
}

function clockLabel(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

/** "4 hr 35 min" / "2 hr" / "95 min" */
export const formatSpan = formatDurationMinutes

/** "4 hr 35 min free until dinner" */
export function formatOpenSpan(span: OpenSpan): string {
  return `${formatSpan(span.minutes)} free until ${span.untilLabel}`
}

interface ComputeOptions {
  /** Current wall clock. A span already underway is measured from here, not
   *  from the end of the commitment that opened it — at 4 PM, "7 hr free" is
   *  a lie about a gap that started at noon. */
  now: Date
  /** The day being looked at. Past days get nothing: their space is spent. */
  viewedDate: Date
}

/**
 * Map of item id → the open span that sits immediately ABOVE that item.
 *
 * Pass every timed item the day holds in render order, including any the
 * section cap will hide — a hidden commitment still occupies its hour, and a
 * span computed as if it were absent would overstate the room by exactly that
 * much. Items the cap hides simply never anchor a line, which is correct: the
 * line has nowhere to render.
 */
export function computeOpenSpans(
  items: TimelineItem[],
  { now, viewedDate }: ComputeOptions,
): Map<string, OpenSpan> {
  const spans = new Map<string, OpenSpan>()

  // A day already behind you has no open space to offer.
  const startOfViewed = new Date(viewedDate); startOfViewed.setHours(0, 0, 0, 0)
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0)
  if (startOfViewed < startOfToday) return spans

  // effectiveStartTime, not startTime: an all-day "Dinner: ..." event is a
  // real 6:30 PM commitment — it is what closes the afternoon — and reading
  // its stored all-day start instead would both misplace it and leave the
  // evening looking free right up to bedtime.
  const timed = items
    .map((item) => ({ item, start: effectiveStartTime(item) }))
    .filter((x): x is { item: TimelineItem; start: Date } => x.start !== null)
    .sort((a, b) => a.start.getTime() - b.start.getTime())

  // Furthest point any commitment so far runs to. Tracked as a running max
  // rather than "the previous row's end" because overlapping items are
  // ordinary — a 9-to-5 event with a 10 AM call inside it must not open a gap
  // at 10:30 just because the call was the last row rendered.
  let occupiedUntil: number | null = null

  for (const { item, start: startDate } of timed) {
    const start = startDate.getTime()
    // An inferred meal time has no matching end — endTime on an all-day row
    // is the end of the DAY, which would swallow every gap after it.
    const end = !item.allDay && item.endTime ? item.endTime.getTime() : start

    if (occupiedUntil !== null) {
      const from = new Date(Math.max(occupiedUntil, now.getTime()))
      const minutes = Math.round((start - from.getTime()) / 60000)
      if (minutes >= MIN_OPEN_SPAN_MINUTES) {
        spans.set(item.id, {
          from,
          until: startDate,
          minutes,
          untilLabel: mealWord(item) ?? clockLabel(startDate),
        })
      }
    }

    occupiedUntil = occupiedUntil === null ? end : Math.max(occupiedUntil, end)
  }

  return spans
}

export interface SpineSegments {
  /** Reach up from this row's marker toward the row above. */
  above: boolean
  /** Reach down from this row's marker toward the row below. */
  below: boolean
}

/**
 * Which rows draw which half of the timeline spine.
 *
 * The spine is the day's through-line, so it runs only between rows that
 * actually sit on the clock — all-day rows and the Anytime slab are not
 * moments and get no segment. The first timed row has nothing above it and
 * the last has nothing below, or the line would dangle into whitespace at
 * both ends of the day.
 *
 * And it BREAKS across open space. A gap the size of an afternoon is the one
 * thing on Today that is genuinely discontinuous, so the line stops and the
 * open-space caption takes over — the day's shape is drawn, not just listed.
 * That is the whole reason the spine earns its pixel: it makes "you have four
 * hours" something you can see without reading.
 */
export function computeSpine(
  items: TimelineItem[],
  openSpans: Map<string, OpenSpan>,
): Map<string, SpineSegments> {
  const ordered = items
    .map((item) => ({ item, start: effectiveStartTime(item) }))
    .filter((x): x is { item: TimelineItem; start: Date } => x.start !== null)
    .sort((a, b) => a.start.getTime() - b.start.getTime())

  const out = new Map<string, SpineSegments>()
  ordered.forEach(({ item }, i) => {
    const next = ordered[i + 1]
    out.set(item.id, {
      above: i > 0 && !openSpans.has(item.id),
      below: !!next && !openSpans.has(next.item.id),
    })
  })
  return out
}
