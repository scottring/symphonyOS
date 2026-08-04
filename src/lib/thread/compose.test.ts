import { describe, it, expect } from 'vitest'
import { composeThread, formatGap } from './compose'
import { emptySections, EMPTY_TODAY_DATA } from '@/lib/today/types'
import type { TodayData } from '@/lib/today/types'
import type { TimelineItem } from '@/types/timeline'
import type { Task } from '@/types/task'
import type { DaySection } from '@/lib/timeUtils'

const DAY = new Date('2026-08-04T00:00:00')
function at(h: number, m = 0): Date {
  const d = new Date(DAY)
  d.setHours(h, m, 0, 0)
  return d
}

function item(p: Partial<TimelineItem> & { id: string }): TimelineItem {
  return {
    type: 'task',
    title: p.id,
    startTime: null,
    endTime: null,
    completed: false,
    ...p,
  } as TimelineItem
}

function task(p: Partial<Task> & { id: string }): Task {
  return {
    title: p.id,
    completed: false,
    bucket: 'timed',
    scheduledFor: null,
    assignedTo: null,
    updatedAt: new Date(),
    ...p,
  } as Task
}

function data(grouped: Partial<Record<DaySection, TimelineItem[]>>, rest: Partial<TodayData> = {}): TodayData {
  return {
    ...EMPTY_TODAY_DATA,
    ...rest,
    grouped: { ...emptySections<TimelineItem>(), ...grouped },
  }
}

/** 10am — comfortably outside the callable window so it doesn't perturb tests. */
const TEN_AM = at(10)

describe('formatGap', () => {
  it('reads as minutes under an hour and hours above', () => {
    expect(formatGap(12 * 60_000)).toBe('12 min')
    expect(formatGap(65 * 60_000)).toBe('1 hr 5 min')
    expect(formatGap(120 * 60_000)).toBe('2 hr')
  })
})

describe('composeThread — banding by the clock', () => {
  it('puts an item whose window contains now in Now', () => {
    const out = composeThread({
      data: data({ morning: [item({ id: 'a', startTime: at(9, 30), endTime: at(10, 30) })] }),
      now: TEN_AM,
    })
    expect(out.now.map((m) => m.id)).toEqual(['a'])
    expect(out.now[0].reason).toBe('happening now')
  })

  it('pulls an item starting inside the approach window into Now', () => {
    const out = composeThread({
      data: data({ morning: [item({ id: 'a', startTime: at(10, 20) })] }),
      now: TEN_AM,
    })
    expect(out.now[0].reason).toBe('starts in 20 min')
  })

  it('leaves an item beyond the approach window in Next', () => {
    const out = composeThread({
      data: data({ afternoon: [item({ id: 'a', startTime: at(13) })] }),
      now: TEN_AM,
    })
    expect(out.now).toHaveLength(0)
    expect(out.next.map((m) => m.id)).toEqual(['a'])
  })

  it('keeps a recently-missed item in Now as past due', () => {
    const out = composeThread({
      data: data({ morning: [item({ id: 'a', startTime: at(9, 30) })] }),
      now: TEN_AM,
    })
    expect(out.now[0].reason).toBe('30 min past due')
  })

  it('drops an item past the late grace window to Loose', () => {
    const out = composeThread({
      data: data({ earlyMorning: [item({ id: 'a', startTime: at(6) })] }),
      now: TEN_AM,
    })
    expect(out.now).toHaveLength(0)
    expect(out.loose.map((m) => m.id)).toEqual(['a'])
    expect(out.loose[0].reason).toMatch(/^missed at /)
  })
})

describe('composeThread — sections that bypass the clock', () => {
  it('sends unscheduled items to Loose', () => {
    const out = composeThread({
      data: data({ unscheduled: [item({ id: 'a' })] }),
      now: TEN_AM,
    })
    expect(out.loose.map((m) => m.id)).toEqual(['a'])
    expect(out.loose[0].reason).toBe('no time set')
  })

  it('sends all-day items to Next, never Now', () => {
    const out = composeThread({
      data: data({ allday: [item({ id: 'a', allDay: true, startTime: at(10) })] }),
      now: TEN_AM,
    })
    expect(out.now).toHaveLength(0)
    expect(out.next[0].reason).toBe('all day')
  })
})

describe('composeThread — the decaying pile', () => {
  it('adds carried-over tasks to Loose, naming the day they came from', () => {
    const out = composeThread({
      data: data({}, { overdueTasks: [task({ id: 'o', scheduledFor: new Date('2026-07-30T09:00:00') })] }),
      now: TEN_AM,
    })
    expect(out.loose[0].reason).toBe('carried over from Thursday')
  })

  it('adds inbox tasks to Loose as unsorted', () => {
    const out = composeThread({
      data: data({}, { inboxTasks: [task({ id: 'i', bucket: 'inbox' })] }),
      now: TEN_AM,
    })
    expect(out.loose[0].reason).toBe('unsorted')
  })

  it('excludes completed and skipped items from every band', () => {
    const out = composeThread({
      data: data(
        {
          morning: [
            item({ id: 'done', startTime: at(10), completed: true }),
            item({ id: 'skipped', startTime: at(10), skipped: true }),
          ],
        },
        { overdueTasks: [task({ id: 'o', completed: true })], inboxTasks: [task({ id: 'i', completed: true })] },
      ),
      now: TEN_AM,
    })
    expect([...out.now, ...out.next, ...out.loose]).toHaveLength(0)
  })
})

describe('composeThread — the Now cap', () => {
  it('moves overflow into Next and reports how many, rather than truncating', () => {
    const live = Array.from({ length: 8 }, (_, i) =>
      item({ id: `a${i}`, startTime: at(10, i) }),
    )
    const out = composeThread({ data: data({ morning: live }), now: TEN_AM, nowCap: 5 })

    expect(out.now).toHaveLength(5)
    expect(out.nowOverflow).toBe(3)
    // Nothing vanished — the three overflow moments are accounted for in Next.
    expect(out.now.length + out.next.length).toBe(8)
  })

  it('keeps the soonest moments when it caps', () => {
    const live = [
      item({ id: 'late', startTime: at(10, 40) }),
      item({ id: 'soon', startTime: at(10, 5) }),
    ]
    const out = composeThread({ data: data({ morning: live }), now: TEN_AM, nowCap: 1 })
    expect(out.now.map((m) => m.id)).toEqual(['soon'])
  })
})

describe('composeThread — the callable window', () => {
  it('lifts a carried-over phone task into Now during the last hour of business', () => {
    const out = composeThread({
      data: data({}, { overdueTasks: [task({ id: 'call', phoneNumber: '555-0100' })] }),
      now: at(16, 15),
    })
    expect(out.now.map((m) => m.id)).toEqual(['task-call'])
    expect(out.now[0].reason).toBe('phones close at 5')
    expect(out.loose).toHaveLength(0)
  })

  it('leaves the same task in Loose outside the window', () => {
    const out = composeThread({
      data: data({}, { overdueTasks: [task({ id: 'call', phoneNumber: '555-0100' })] }),
      now: TEN_AM,
    })
    expect(out.now).toHaveLength(0)
    expect(out.loose.map((m) => m.id)).toEqual(['task-call'])
  })

  it('does not relabel an item that is already live on its own merits', () => {
    const out = composeThread({
      data: data({ afternoon: [item({ id: 'a', startTime: at(16, 20), phoneNumber: '555-0100' })] }),
      now: at(16, 15),
    })
    expect(out.now[0].reason).toBe('starts in 5 min')
  })
})
