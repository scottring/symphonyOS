import { describe, it, expect } from 'vitest'
import { openHandoffQuestions } from './wallQuestions'
import type { WallDayData } from '@/hooks/useWallData'
import type { TimelineItem } from '@/types/timeline'
import type { FamilyMember } from '@/types/family'

const SCOTT = '4fd6259b-2246-4304-96c3-d93a12fd43ae'
const member = (id: string, name: string): FamilyMember =>
  ({ id, name, user_id: 'u', initials: name.slice(0, 2), color: 'blue', avatar_url: null,
     is_full_user: true, display_order: 0, created_at: '' }) as FamilyMember
const MEMBERS = [member(SCOTT, 'Scott'), member('iris', 'Iris'), member('ella', 'Ella')]

const on = (d: number, h: number, m = 0) => new Date(2026, 8, d, h, m)
const ev = (id: string, title: string, start: Date, assignedTo?: string): TimelineItem =>
  ({ id: `event-${id}`, type: 'event', title, startTime: start, endTime: new Date(start.getTime() + 15 * 60_000),
     completed: false, assignedTo, originalEvent: { id, google_event_id: id, title } }) as unknown as TimelineItem
const day = (d: number, items: TimelineItem[]): WallDayData =>
  ({ date: on(d, 0), isToday: d === 3, items: { morning: items.filter((i) => i.startTime!.getHours() < 12), evening: items.filter((i) => i.startTime!.getHours() >= 12) },
     birthdays: [], milestones: [] }) as unknown as WallDayData

describe('openHandoffQuestions', () => {
  const today = day(3, [
    ev('walk3', 'Walk Ella & Kaleb to school', on(3, 7, 15)),
    ev('pick3', 'Pick up Ella & Kaleb from FFG', on(3, 17, 30)),
  ])
  const tomorrow = day(4, [
    ev('walk4', 'Walk Ella & Kaleb to school', on(4, 7, 15)),
    ev('pick4', 'Pick up Ella & Kaleb from FFG', on(4, 17, 30), SCOTT),
  ])

  it('in the morning asks about today\'s handoffs still ahead, and not about tomorrow yet', () => {
    const qs = openHandoffQuestions([today, tomorrow], MEMBERS, on(3, 6, 50))
    expect(qs.map((q) => q.eventKey)).toEqual(['walk3', 'pick3'])
    expect(qs[0].prompt).toBe("Who's walking Ella & Kaleb to school?")
    expect(qs[0].when).toBe('today')
    expect(qs[0].time).toBe('7:15a')
  })

  it('once a handoff has started it is no longer a question', () => {
    const qs = openHandoffQuestions([today, tomorrow], MEMBERS, on(3, 9))
    expect(qs.map((q) => q.eventKey)).toEqual(['pick3'])
  })

  it('from the evening it adds tomorrow\'s unclaimed handoffs, and skips the claimed one', () => {
    const qs = openHandoffQuestions([today, tomorrow], MEMBERS, on(3, 18))
    expect(qs.map((q) => `${q.when}:${q.eventKey}`)).toEqual(['tomorrow:walk4'])
  })

  it('writes the answer to the INSTANCE id, never the series', () => {
    const inst = ev('series_20260904T111500Z', 'Walk Ella & Kaleb to school', on(4, 7, 15))
    ;(inst.originalEvent as { recurring_event_id?: string }).recurring_event_id = 'series'
    const qs = openHandoffQuestions([day(3, []), day(4, [inst])], MEMBERS, on(3, 20))
    expect(qs[0].eventKey).toBe('series_20260904T111500Z')
  })

  it('a non-handoff event naming the kids is never a question', () => {
    const qs = openHandoffQuestions([day(3, [ev('x', 'Ella & Kaleb to FFG', on(3, 14, 10))])], MEMBERS, on(3, 9))
    expect(qs).toEqual([])
  })
})
