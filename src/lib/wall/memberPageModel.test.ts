import { describe, it, expect } from 'vitest'
import { memberShape, appointmentsFor, nextLine, choresFor, kidsFor } from './memberPageModel'
import type { FamilyMember } from '@/types/family'
import type { TimelineItem } from '@/types/timeline'
import type { DaySection } from '@/lib/timeUtils'
import type { MemberDayModel, KidRow } from './kidDayModel'
import { emptySections } from '@/lib/today/types'

const m = (o: Partial<FamilyMember>): FamilyMember =>
  ({ id: 'x', name: 'X', user_id: 'u', initials: 'X', color: 'blue', avatar_url: null, is_full_user: false, display_order: 0, created_at: '', member_type: 'core', ...o }) as FamilyMember
const scott = m({ id: 's', name: 'Scott', role_label: 'parent', is_full_user: true })
const iris = m({ id: 'i', name: 'Iris', role_label: 'parent', is_full_user: true })
const ella = m({ id: 'e', name: 'Ella', role_label: 'family' })
const kaleb = m({ id: 'k', name: 'Kaleb', role_label: 'family' })
const members = [scott, iris, ella, kaleb]
const at = (h: number, mi = 0) => new Date(2026, 8, 7, h, mi)
const item = (o: Partial<TimelineItem>): TimelineItem =>
  ({ id: Math.random().toString(36).slice(2), type: 'event', title: 't', startTime: null, endTime: null, completed: false, ...o }) as TimelineItem
const sections = (items: TimelineItem[]): Record<DaySection, TimelineItem[]> => {
  const s = emptySections<TimelineItem>()
  for (const it of items) (it.allDay ? s.allday : s.afternoon).push(it)
  return s
}

describe('memberShape', () => {
  it('a parent or full user is an adult; a kid (role_label family) is a kid', () => {
    expect(memberShape(scott)).toBe('adult')
    expect(memberShape(m({ is_full_user: true }))).toBe('adult')
    expect(memberShape(ella)).toBe('kid')
  })
})

describe("appointmentsFor — timed things on this person's day", () => {
  it('lists timed events attributed to the member and timed tasks assigned to them, in clock order', () => {
    const items = [
      item({ title: 'Ella & Kaleb to FFG', startTime: at(18, 30), endTime: at(18, 45), assignedTo: 's' }),
      item({ title: 'Dentist', startTime: at(16), endTime: at(17), assignedTo: 's', location: 'Main St' }),
      item({ type: 'task', title: 'Call plumber', startTime: at(10), endTime: at(10, 30), assignedTo: 's' }),
      item({ title: 'Iris yoga', startTime: at(9), endTime: at(10), assignedTo: 'i' }),
    ]
    const rows = appointmentsFor(scott, members, sections(items), at(12))
    expect(rows.map((r) => [r.time, r.title, r.detail, r.past])).toEqual([
      ['10:00', 'Call plumber', null, true],
      ['4:00', 'Dentist', 'Main St', false],
      ['6:30', 'Ella & Kaleb to FFG', null, false],
    ])
  })
  it('skips all-day, completed and everyday-routine items', () => {
    const items = [
      item({ title: 'Labor Day', allDay: true }),
      item({ title: 'Done thing', startTime: at(9), endTime: at(10), assignedTo: 's', completed: true }),
      item({ type: 'routine', title: 'Brush teeth', startTime: at(7), endTime: at(7, 5), assignedTo: 's', recurrencePattern: { type: 'daily' } } as Partial<TimelineItem>),
      item({ type: 'routine', title: 'Farmers market', startTime: at(9), endTime: at(10), assignedTo: 's', recurrencePattern: { type: 'weekly', days: ['sat'] } } as Partial<TimelineItem>),
    ]
    expect(appointmentsFor(scott, members, sections(items), at(8)).map((r) => r.title)).toEqual(['Farmers market'])
  })
  it('an event on the shared calendar that names the member is theirs', () => {
    const items = [item({ title: 'Scott playing at Wheelies', startTime: at(19), endTime: at(21) })]
    expect(appointmentsFor(scott, members, sections(items), at(8)).map((r) => r.title)).toEqual(['Scott playing at Wheelies'])
    expect(appointmentsFor(iris, members, sections(items), at(8))).toEqual([])
  })
})

describe('nextLine', () => {
  it('names the next thing and the one after, and nothing when the day is done', () => {
    const rows = [
      { id: 'a', time: '10:00', title: 'Call plumber', detail: null, past: true, free: false },
      { id: 'b', time: '4:00', title: 'Dentist', detail: null, past: false, free: false },
      { id: 'c', time: '6:30', title: 'FFG', detail: null, past: false, free: false },
    ]
    expect(nextLine(rows)).toBe('Next: Dentist 4:00 · then FFG 6:30')
    expect(nextLine(rows.slice(0, 1))).toBeNull()
    expect(nextLine(rows.slice(0, 2))).toBe('Next: Dentist 4:00')
  })
})

describe("choresFor — an adult's list", () => {
  const row = (o: Partial<KidRow>): KidRow => ({ entityType: 'routine', id: 'r', title: 'r', done: false, timeOfDay: null, target: null, ...o })
  it('keeps untimed tasks and drops timed ones (they are appointments)', () => {
    const model = { bands: { morning: [row({ entityType: 'task', id: 't1', title: 'Buy rug' })], afternoon: [row({ entityType: 'task', id: 't2', title: 'Call plumber', timeOfDay: '10:00' })], evening: [], anytime: [] }, collections: [] } as unknown as MemberDayModel
    expect(choresFor(model).map((r) => r.title)).toEqual(['Buy rug'])
  })
  it('keeps routine rows the model already resolved, in band order', () => {
    const model = { bands: { morning: [], afternoon: [], evening: [row({ id: 'r2', title: 'Bins out' })], anytime: [row({ id: 'r1', title: 'Laundry' })] }, collections: [] } as unknown as MemberDayModel
    expect(choresFor(model).map((r) => r.title)).toEqual(['Bins out', 'Laundry'])
  })
})

describe('kidsFor — what an adult wants to know about each child', () => {
  it('gives each kid their special and the handoff this adult is driving', () => {
    const items = [
      item({ title: 'Specials — Ella: Visual Art · Kaleb: PE', allDay: true }),
      item({ title: 'Drop off Ella & Kaleb at FFG', startTime: at(18, 30), endTime: at(18, 45), assignedTo: 's' }),
    ]
    expect(kidsFor(scott, members, sections(items))).toEqual([
      { id: 'e', name: 'Ella', special: 'Visual Art', handoff: '6:30 Drop off Ella & Kaleb at FFG' },
      { id: 'k', name: 'Kaleb', special: 'PE', handoff: '6:30 Drop off Ella & Kaleb at FFG' },
    ])
  })
  it('a handoff someone else is driving, or nobody has claimed, is not mine', () => {
    const items = [
      item({ title: 'Pick up Ella from FFG', startTime: at(17), endTime: at(17, 15), assignedTo: 'i' }),
      item({ title: 'Walk Kaleb to school', startTime: at(7, 30), endTime: at(7, 45) }),
    ]
    const lines = kidsFor(scott, members, sections(items))
    expect(lines.map((l) => l.handoff)).toEqual([null, null])
  })
})
