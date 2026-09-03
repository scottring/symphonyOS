import { describe, it, expect } from 'vitest'
import { buildMemberDayModel, isReadingTarget } from './kidDayModel'
import type { Routine } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'
import type { TimelineItem } from '@/types/timeline'
import type { DaySection } from '@/lib/timeUtils'

const SCOTT = { id: 'scott', name: 'Scott' } as FamilyMember
const ELLA = { id: 'ella', name: 'Ella' } as FamilyMember
const KALEB = { id: 'kaleb', name: 'Kaleb' } as FamilyMember
const MEMBERS = [SCOTT, ELLA, KALEB]

const at = (h: number, m = 0) => new Date(2026, 8, 3, h, m)
const sections = (items: TimelineItem[]): Record<DaySection, TimelineItem[]> =>
  ({ allday: items.filter((i) => i.allDay), afternoon: items.filter((i) => !i.allDay) }) as unknown as Record<DaySection, TimelineItem[]>
const ev = (o: Partial<TimelineItem>): TimelineItem =>
  ({ id: `event-${Math.random()}`, type: 'event', title: '', startTime: null, endTime: null, completed: false, ...o }) as TimelineItem

const routine = (o: Partial<Routine>): Routine =>
  ({ id: 'r', user_id: 'u', name: 'Read', description: null, default_assignee: null, assigned_to: ELLA.id,
     assigned_to_all: null, visibility: 'active', paused_until: null, recurrence_pattern: { type: 'daily' },
     time_of_day: null, raw_input: null, show_on_timeline: true, scope: 'compound', context: 'family',
     created_at: '', updated_at: '', target_amount: 20, target_unit: 'minutes', ...o }) as Routine

const build = (items: TimelineItem[], now = at(9), extra: Partial<Parameters<typeof buildMemberDayModel>[0]> = {}) =>
  buildMemberDayModel({
    member: ELLA, date: now, now, routines: [], todayItems: sections(items), neededTasks: [], history: [], members: MEMBERS, ...extra,
  })

describe('isReadingTarget', () => {
  it('is a minutes target about reading', () => {
    expect(isReadingTarget(routine({}))).toBe(true)
    expect(isReadingTarget(routine({ name: 'Reading' }))).toBe(true)
    expect(isReadingTarget(routine({ name: 'Piano', target_amount: 15 }))).toBe(false)
    expect(isReadingTarget(routine({ target_amount: null, target_unit: null }))).toBe(false)
  })
})

describe('the reading card', () => {
  it('pulls the reading target out of the bands into its own slot', () => {
    const m = build([], at(9), { routines: [routine({})] })
    expect(m.reading?.title).toBe('Read')
    expect(m.reading?.target?.amount).toBe(20)
    expect(m.bands.anytime).toHaveLength(0)
  })
  it('a plain "Read" habit with no target stays a checkbox row', () => {
    const m = build([], at(9), { routines: [routine({ target_amount: null, target_unit: null })] })
    expect(m.reading).toBeNull()
    expect(m.bands.anytime).toHaveLength(1)
  })
})

describe('today at school', () => {
  const specials = ev({ title: 'Specials — Ella: PE · Kaleb: Music', allDay: true, googleDescription: 'Thursday specials. Ella has PE — sneakers.' })
  const pickup = (assignedTo?: string) => ev({ title: 'Pick up Ella & Kaleb from FFG', startTime: at(17, 30), endTime: at(17, 45), assignedTo })

  it('gives the kid THEIR special and the sentence about them', () => {
    const s = build([specials]).school!
    expect(s.special).toBe('PE')
    expect(s.hint).toBe('Ella has PE — sneakers.')
  })
  it('names who picks them up when a parent has claimed it', () => {
    expect(build([specials, pickup(SCOTT.id)]).school?.pickup).toEqual({ time: '5:30p', who: 'Scott' })
  })
  it('says so when nobody has', () => {
    expect(build([pickup()]).school?.pickup).toEqual({ time: '5:30p', who: null })
  })
  it('reads a name written into the title', () => {
    const s = build([ev({ title: 'Grampappa picks up Ella & Kaleb', startTime: at(16), endTime: at(16, 15) })]).school!
    expect(s.pickup).toEqual({ time: '4p', who: 'Grampappa' })
  })
  it('adds tomorrow\'s special in the evening, not in the morning', () => {
    const tomorrow = sections([ev({ title: 'Specials — Ella: Art · Kaleb: PE', allDay: true })])
    expect(build([specials], at(9), { tomorrowItems: tomorrow }).school?.tomorrowSpecial).toBeNull()
    expect(build([specials], at(18), { tomorrowItems: tomorrow }).school?.tomorrowSpecial).toBe('Art')
  })
  it('is null on a day with nothing school-shaped', () => {
    expect(build([ev({ title: 'Bang trim', startTime: at(18, 45), endTime: at(19, 30) })]).school).toBeNull()
  })
})
