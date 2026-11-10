import { describe, it, expect } from 'vitest'
import type { Task } from '@/types/task'
import type { FamilyMember } from '@/types/family'
import { boardWaits, boardNews, digestCards, pageOf, wallHome } from './wallBoard'
import type { KioskScreen } from './kioskScreen'
import type { SchoolDigest } from '@/lib/schoolDigest/schoolDigests'

const now = new Date(2026, 10, 10, 14, 15) // Tue Nov 10
const members = [
  { id: 'scott', name: 'Scott Kaufman', initials: 'SK', color: '#1d4ed8' },
  { id: 'iris', name: 'Iris', initials: 'IR', color: '#7e22ce' },
] as FamilyMember[]
const t = (id: string, x: Partial<Task> = {}) =>
  ({ id, title: id, completed: false, createdAt: now, context: 'family', ...x }) as Task

describe('boardWaits: what the wall says we wait for, and who waits on us', () => {
  it('a wait runs from the person it is on to whoever carries the task', () => {
    const { theirs } = boardWaits([t('dates', { title: 'Winter trip dates', isWaiting: true, waitingFor: 'Iris', assignedTo: 'scott', waitingSince: new Date(2026, 10, 8, 9) })], members, now)
    expect(theirs).toEqual([{ id: 'dates', title: 'Winter trip dates', from: { name: 'Iris', member: members[1] }, to: { name: 'Scott', member: members[0] }, when: '2 days', late: false }])
  })

  it('someone outside the household reads as their name, with no face', () => {
    const { theirs } = boardWaits([t('a', { isWaiting: true, waitingFor: 'Scherr', assignedTo: 'scott', waitingSince: new Date(2026, 10, 10, 8) })], members, now)
    expect(theirs[0].from).toEqual({ name: 'Scherr' })
    expect(theirs[0].when).toBe('Today')
  })

  it('owed to someone runs from us to them, with its due day', () => {
    const { ours } = boardWaits([t('fee', { title: 'FFG tuition', owedTo: 'FFG', assignedTo: 'iris', scheduledFor: new Date(2026, 10, 11, 9) })], members, now)
    expect(ours).toEqual([{ id: 'fee', title: 'FFG tuition', from: { name: 'Iris', member: members[1] }, to: { name: 'FFG' }, when: 'Due tomorrow', late: false }])
  })

  it('a past due day is late', () => {
    const { ours } = boardWaits([t('l', { owedTo: 'Ms. Kroger', neededOn: new Date(2026, 10, 5) })], members, now)
    expect(ours[0]).toMatchObject({ when: 'Was due Thu', late: true, from: { name: 'Us' } })
  })

  it('leaves out private, done and dismissed tasks', () => {
    const w = boardWaits([
      t('p', { isWaiting: true, waitingFor: 'Iris', context: 'personal' }),
      t('d', { isWaiting: true, waitingFor: 'Iris', completed: true }),
      t('x', { owedTo: 'FFG', dismissedAt: now }),
    ], members, now)
    expect(w).toEqual({ theirs: [], ours: [] })
  })

  it('the longest wait comes first', () => {
    const { theirs } = boardWaits([
      t('new', { isWaiting: true, waitingFor: 'Iris', waitingSince: new Date(2026, 10, 9) }),
      t('old', { isWaiting: true, waitingFor: 'Iris', waitingSince: new Date(2026, 10, 2) }),
    ], members, now)
    expect(theirs.map((w) => w.id)).toEqual(['old', 'new'])
  })
})

describe('boardNews: the newest school digest, as announcements', () => {
  const digest = (date: string, label: string): SchoolDigest => ({
    id: date, date, label, toDoCount: 1, createdAt: now,
    sections: [{ source: 'PTO', toDo: [{ title: 'Holiday Festival & Craft Fair', when: 'Thu Dec 10 – Fri Dec 11', details: 'PTO wants planning help' }], goodToKnow: ['Recess supplies for Ms. Jones are optional'], chatter: '' }],
  })

  it('takes the newest digest: what to do, then what to know', () => {
    const news = boardNews([digest('2026-11-06', 'Fri, Nov 6'), digest('2026-11-05', 'Thu, Nov 5')], now)
    expect(news?.label).toBe('Fri, Nov 6')
    expect(news?.items).toEqual([
      { title: 'Holiday Festival & Craft Fair', sub: 'Thu Dec 10 – Fri Dec 11 · PTO wants planning help' },
      { title: 'Recess supplies for Ms. Jones are optional', sub: null },
    ])
  })

  it('says Yesterday for yesterday’s', () => {
    expect(boardNews([digest('2026-11-09', 'Mon, Nov 9')], now)?.label).toBe('Yesterday')
  })

  it('a digest more than a week old is not news', () => {
    expect(boardNews([digest('2026-11-01', 'Sun, Nov 1')], now)).toBeNull()
  })
})

describe('wallHome: which of the three screens leads', () => {
  const anchors = { morning: { start: 405, end: 440 }, home: { start: 1035 }, dinner: 1080, bedtime: { start: 1170, end: 1230 } }
  const at = (h: number, m = 0) => new Date(2026, 10, 10, h, m)
  const pick = (screen: KioskScreen) => ({ screen, title: '', dark: false })
  it('the day, from the morning through after school', () => {
    for (const s of ['out-the-door', 'home', 'rest', 'weekend'] as KioskScreen[]) expect(wallHome(pick(s), anchors, at(10))).toBe('day')
  })
  it('dinner at dinner time', () => {
    expect(wallHome(pick('dinner'), anchors, at(18))).toBe('dinner')
  })
  it('tomorrow once dinner is over, and through the night', () => {
    expect(wallHome(pick('rest'), anchors, at(19, 5))).toBe('night')
    expect(wallHome(pick('bedtime'), anchors, at(19, 40))).toBe('night')
    expect(wallHome(pick('night'), anchors, at(23))).toBe('night')
  })
})

describe('digestCards: a digest as cards, one thing each', () => {
  it('each to-do, then each thing to know, with where it came from', () => {
    const cards = digestCards({ id: 'd', date: '2026-11-06', label: 'Fri, Nov 6', toDoCount: 1, createdAt: now, sections: [
      { source: 'PTO', toDo: [{ title: 'Craft fair', when: 'Dec 10', details: 'Help wanted' }], goodToKnow: ['No school Friday'], chatter: 'Nothing else.' },
    ] })
    expect(cards).toEqual([
      { source: 'PTO', title: 'Craft fair', when: 'Dec 10', details: 'Help wanted' },
      { source: 'PTO', title: 'No school Friday', when: null, details: null },
    ])
  })
})

describe('pageOf', () => {
  it('cuts a list into pages and keeps the page in range', () => {
    const items = [1, 2, 3, 4, 5]
    expect(pageOf(items, 4, 0)).toEqual({ items: [1, 2, 3, 4], page: 0, pages: 2 })
    expect(pageOf(items, 4, 1)).toEqual({ items: [5], page: 1, pages: 2 })
    expect(pageOf(items, 4, 9)).toEqual({ items: [5], page: 1, pages: 2 })
    expect(pageOf([], 4, 0)).toEqual({ items: [], page: 0, pages: 1 })
  })
})
