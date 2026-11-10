import { describe, it, expect } from 'vitest'
import type { Task } from '@/types/task'
import type { FamilyMember } from '@/types/family'
import { boardWaits, boardNews } from './wallBoard'
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
