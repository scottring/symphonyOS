import { describe, it, expect } from 'vitest'
import { splitTodayJournal } from './journalSplit'
import { emptySections } from './types'
import type { TimelineItem } from '@/types/timeline'

const item = (id: string, over: Partial<TimelineItem> = {}): TimelineItem =>
  ({ id: `task-${id}`, type: 'task', title: id, completed: false, ...over } as TimelineItem)

// Focus orders and highlights; it never gates visibility (Scott, 2026-09-21).
describe('My focus — chosen rows lead, dated rows stay', () => {
  it('puts focused rows first and keeps the rest in their order', () => {
    const grouped = emptySections<TimelineItem>()
    grouped.allday = [item('a'), item('b', { focused: true }), item('c'), item('d', { focused: true })]
    const journal = splitTodayJournal(grouped, { isToday: true, now: new Date(2026, 8, 21, 10) })
    expect(journal.focus.allday.map((i) => i.title)).toEqual(['b', 'd', 'a', 'c'])
    expect(journal.focusCount).toBe(4)
  })
})
