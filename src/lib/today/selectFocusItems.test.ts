import { describe, it, expect } from 'vitest'
import { selectFocusItems } from './selectFocusItems'
import type { TimelineItem } from '@/types/timeline'

const item = (id: string, h: number | null, completed = false): TimelineItem =>
  ({ id, type: 'event', title: id, startTime: h === null ? null : new Date(2026, 5, 24, h), endTime: null, completed } as TimelineItem)

describe('selectFocusItems', () => {
  it('returns the next N timed, incomplete items in time order', () => {
    const out = selectFocusItems([item('c', 17), item('a', 9), item('done', 8, true), item('none', null), item('b', 13)], 3)
    expect(out.map(i => i.id)).toEqual(['a', 'b', 'c'])
  })
})
