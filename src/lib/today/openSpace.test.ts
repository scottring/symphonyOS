import { describe, it, expect } from 'vitest'
import type { TimelineItem } from '@/types/timeline'
import { computeOpenSpans, formatOpenSpan, formatSpan, MIN_OPEN_SPAN_MINUTES } from './openSpace'

const DAY = [2026, 7, 31] as const // Aug 31 2026

function at(h: number, m = 0): Date {
  return new Date(DAY[0], DAY[1], DAY[2], h, m)
}

function item(overrides: Partial<TimelineItem> & { id: string }): TimelineItem {
  return {
    type: 'task',
    title: 'X',
    completed: false,
    startTime: null,
    endTime: null,
    allDay: false,
    ...overrides,
  } as TimelineItem
}

const NOON = at(12)

describe('computeOpenSpans', () => {
  it('opens a span between two distant commitments', () => {
    const spans = computeOpenSpans(
      [
        item({ id: 'a', startTime: at(7), endTime: at(7, 30) }),
        item({ id: 'b', startTime: at(18, 45) }),
      ],
      { now: at(6), viewedDate: at(0) },
    )
    const span = spans.get('b')
    expect(span).toBeDefined()
    expect(span!.minutes).toBe(11 * 60 + 15)
    expect(span!.untilLabel).toBe('6:45 PM')
  })

  it('stays silent for gaps under the minimum', () => {
    const spans = computeOpenSpans(
      [
        item({ id: 'a', startTime: at(9), endTime: at(10) }),
        item({ id: 'b', startTime: at(11, 0) }), // 60 min
      ],
      { now: at(6), viewedDate: at(0) },
    )
    expect(spans.has('b')).toBe(false)
  })

  it('renders exactly at the minimum', () => {
    const spans = computeOpenSpans(
      [
        item({ id: 'a', startTime: at(9), endTime: at(10) }),
        item({ id: 'b', startTime: at(11, 30) }),
      ],
      { now: at(6), viewedDate: at(0) },
    )
    expect(spans.get('b')?.minutes).toBe(MIN_OPEN_SPAN_MINUTES)
  })

  it('never opens a span above the first item of the day', () => {
    const spans = computeOpenSpans(
      [item({ id: 'a', startTime: at(18) })],
      { now: at(6), viewedDate: at(0) },
    )
    expect(spans.size).toBe(0)
  })

  it('measures from now, not from the commitment that opened the gap', () => {
    // The 7 AM routine ended at 7:30; it is now noon. The honest answer is
    // "6 hr 45 min free", not "11 hr 15 min".
    const spans = computeOpenSpans(
      [
        item({ id: 'a', startTime: at(7), endTime: at(7, 30) }),
        item({ id: 'b', startTime: at(18, 45) }),
      ],
      { now: NOON, viewedDate: at(0) },
    )
    expect(spans.get('b')!.minutes).toBe(6 * 60 + 45)
    expect(spans.get('b')!.from.getHours()).toBe(12)
  })

  it('closes a span that now has already run past', () => {
    const spans = computeOpenSpans(
      [
        item({ id: 'a', startTime: at(7), endTime: at(7, 30) }),
        item({ id: 'b', startTime: at(11) }),
      ],
      { now: at(11, 30), viewedDate: at(0) },
    )
    expect(spans.has('b')).toBe(false)
  })

  it('names a meal by its meal word', () => {
    const spans = computeOpenSpans(
      [
        item({ id: 'a', startTime: at(9), endTime: at(10) }),
        item({ id: 'b', type: 'event', title: 'Dinner: bread, israeli salad', startTime: at(18) }),
      ],
      { now: at(6), viewedDate: at(0) },
    )
    expect(spans.get('b')?.untilLabel).toBe('dinner')
  })

  it('names a synthesized meal-plan entry dinner even when the title is the dish', () => {
    const spans = computeOpenSpans(
      [
        item({ id: 'a', startTime: at(9), endTime: at(10) }),
        item({ id: 'meal:x', type: 'event', title: 'Bread, israeli salad', startTime: at(18) }),
      ],
      { now: at(6), viewedDate: at(0) },
    )
    expect(spans.get('meal:x')?.untilLabel).toBe('dinner')
  })

  it('does not name a span after work that merely mentions a meal', () => {
    // "Clean kitchen after dinner" is a routine, not dinner.
    const spans = computeOpenSpans(
      [
        item({ id: 'a', startTime: at(9), endTime: at(10) }),
        item({ id: 'b', type: 'routine', title: 'Clean kitchen after dinner', startTime: at(18, 45) }),
      ],
      { now: at(6), viewedDate: at(0) },
    )
    expect(spans.get('b')?.untilLabel).toBe('6:45 PM')
  })

  it('closes the afternoon at an all-day meal event, using its inferred time', () => {
    // An all-day calendar event titled "Dinner: ..." is a real 6:30 PM
    // commitment — the free run ends there, not at bedtime.
    const spans = computeOpenSpans(
      [
        item({ id: 'school', type: 'event', title: 'School', startTime: at(7, 30), endTime: at(14, 10) }),
        item({ id: 'dinner', type: 'event', title: 'Dinner: bread, salad', allDay: true, startTime: at(8) }),
        item({ id: 'clean', type: 'routine', title: 'Clean kitchen after dinner', startTime: at(18, 45) }),
      ],
      { now: at(6), viewedDate: at(0) },
    )
    expect(spans.get('dinner')?.minutes).toBe(4 * 60 + 20) // 2:10 PM → 6:30 PM
    expect(spans.get('dinner')?.untilLabel).toBe('dinner')
    // and nothing between dinner and the 6:45 clean-up
    expect(spans.has('clean')).toBe(false)
  })

  it('ignores all-day items — they bound nothing', () => {
    const spans = computeOpenSpans(
      [
        item({ id: 'allday', type: 'event', title: 'Specials', allDay: true, startTime: at(0) }),
        item({ id: 'a', startTime: at(9), endTime: at(10) }),
        item({ id: 'b', startTime: at(18) }),
      ],
      { now: at(6), viewedDate: at(0) },
    )
    expect(spans.has('a')).toBe(false)
    expect(spans.get('b')).toBeDefined()
  })

  it('does not open a gap inside an enclosing commitment', () => {
    // A 9-5 event with a 10 AM call inside it. The 5 PM row must not read as
    // "7 hr free" just because the call was the last row rendered.
    const spans = computeOpenSpans(
      [
        item({ id: 'long', type: 'event', title: 'School', startTime: at(9), endTime: at(17) }),
        item({ id: 'call', type: 'event', title: 'Call', startTime: at(10), endTime: at(10, 30) }),
        item({ id: 'after', startTime: at(17, 30) }),
      ],
      { now: at(6), viewedDate: at(0) },
    )
    expect(spans.has('call')).toBe(false)
    expect(spans.has('after')).toBe(false)
  })

  it('returns nothing for a day already past', () => {
    const spans = computeOpenSpans(
      [
        item({ id: 'a', startTime: at(7), endTime: at(7, 30) }),
        item({ id: 'b', startTime: at(18) }),
      ],
      { now: new Date(2026, 8, 5, 9, 0), viewedDate: at(0) },
    )
    expect(spans.size).toBe(0)
  })

  it('computes a future day from its own commitments, unclamped by now', () => {
    const tomorrow = new Date(2026, 8, 1, 0, 0)
    const spans = computeOpenSpans(
      [
        item({ id: 'a', startTime: new Date(2026, 8, 1, 7, 0), endTime: new Date(2026, 8, 1, 7, 30) }),
        item({ id: 'b', startTime: new Date(2026, 8, 1, 18, 45) }),
      ],
      { now: NOON, viewedDate: tomorrow },
    )
    expect(spans.get('b')!.minutes).toBe(11 * 60 + 15)
  })
})

describe('formatSpan', () => {
  it('keeps sub-two-hour spans in minutes', () => {
    expect(formatSpan(95)).toBe('95 min')
  })
  it('drops a zero remainder', () => {
    expect(formatSpan(120)).toBe('2 hr')
  })
  it('renders hours and minutes', () => {
    expect(formatSpan(275)).toBe('4 hr 35 min')
  })
})

describe('formatOpenSpan', () => {
  it('leads with the duration and names what closes it', () => {
    expect(
      formatOpenSpan({ from: at(12), until: at(18, 45), minutes: 405, untilLabel: 'dinner' }),
    ).toBe('6 hr 45 min free until dinner')
  })
})
