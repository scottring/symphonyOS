import { describe, it, expect } from 'vitest'
import { isoWeekId, selectWeeklyCandidates, formatWeeklyNote } from './weeklyPlanning'
import type { Task } from '@/types/task'

const t = (over: Partial<Task>): Task => ({
  id: over.id ?? 'x', title: over.title ?? 'T', completed: over.completed ?? false,
  bucket: over.bucket ?? 'inbox', context: null, createdAt: new Date(), updatedAt: new Date(),
  ...over,
}) as Task

describe('isoWeekId', () => {
  it('formats an ISO week as YYYY-Www', () => {
    expect(isoWeekId(new Date('2026-05-22T12:00:00'))).toMatch(/^2026-W\d{2}$/)
  })
  it('pads single-digit weeks', () => {
    expect(isoWeekId(new Date('2026-01-05T12:00:00'))).toBe('2026-W02')
  })
})

describe('selectWeeklyCandidates', () => {
  it('groups tasks by source bucket and excludes completed', () => {
    const tasks = [
      t({ id: 'a', bucket: 'inbox' }),
      t({ id: 'b', bucket: 'week' }),
      t({ id: 'c', bucket: 'week', completed: true }),
      t({ id: 'd', bucket: 'month' }),
      t({ id: 'e', bucket: 'quarter' }),
      t({ id: 'f', bucket: 'timed' }),
    ]
    const r = selectWeeklyCandidates(tasks)
    expect(r.inbox.map(x => x.id)).toEqual(['a'])
    expect(r.carryover.map(x => x.id)).toEqual(['b'])
    expect(r.month.map(x => x.id)).toEqual(['d'])
    expect(r.someday.map(x => x.id)).toEqual(['e'])
  })
})

describe('formatWeeklyNote', () => {
  it('produces a path and markdown with the three sections', () => {
    const note = formatWeeklyNote({
      weekId: '2026-W21',
      priorities: [t({ id: 'a', title: 'Call accountant' })],
      scheduleSummary: 'Mon: Call accountant',
      concerns: '<p>Talk about camp</p>',
    })
    expect(note.path).toBe('planning/weekly/2026-W21.md')
    expect(note.title).toContain('2026-W21')
    expect(note.content).toContain('Call accountant')
    expect(note.content).toContain('Talk about camp')
    expect(note.content).toContain('Mon: Call accountant')
  })
})
