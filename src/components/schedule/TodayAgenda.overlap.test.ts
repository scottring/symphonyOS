import { describe, it, expect } from 'vitest'
import { overlapsOf } from './TodayAgenda'
import type { AgendaEntry } from '@/lib/today/agenda'
import type { TimelineItem } from '@/types/timeline'

const at = (h: number, m = 0) => new Date(2026, 10, 13, h, m)
const entry = (id: string, title: string, start: Date, end: Date, extra: Partial<TimelineItem> = {}): AgendaEntry =>
  ({ item: { id, title, type: 'event', ...extra } as TimelineItem, start, end, hasEnd: true })

describe('overlapsOf (Scott, 2026-11-13)', () => {
  it('the later of two overlapping things says by how much, and with what', () => {
    const map = overlapsOf([
      entry('bath', 'KAUFMAN-LEVINER BATH PROJECT...3806 TUDOR ARMS', at(15), at(16, 30)),
      entry('gp', 'Grampappa', at(16), at(20)),
    ])
    expect(map.get('gp')).toEqual({ minutes: 30, with: 'Kaufman-Leviner Bath Project' })
    expect(map.has('bath')).toBe(false)
  })
  it('back-to-back things and routines do not count', () => {
    const map = overlapsOf([
      entry('a', 'Call', at(9), at(10)),
      entry('b', 'Meeting', at(10), at(11)),
      entry('r', 'School morning', at(10, 30), at(11, 30), { type: 'routine' }),
    ])
    expect(map.size).toBe(0)
  })
})
