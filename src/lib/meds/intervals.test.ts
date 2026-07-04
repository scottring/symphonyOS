import { describe, it, expect } from 'vitest'
import { computeIntervals } from './intervals'
import type { MedicationLog } from '@/types/medication'

function log(id: string, iso: string): MedicationLog {
  return { id, medicationId: 'm1', takenAt: new Date(iso), source: 'manual', createdAt: new Date(iso) }
}

describe('computeIntervals', () => {
  it('returns empty for fewer than two logs', () => {
    expect(computeIntervals([])).toEqual([])
    expect(computeIntervals([log('a', '2026-07-01T07:00:00')])).toEqual([])
  })

  it('computes minutes between consecutive doses in chronological order', () => {
    const logs = [log('b', '2026-07-01T11:30:00'), log('a', '2026-07-01T07:00:00')]
    const res = computeIntervals(logs)
    expect(res).toHaveLength(1)
    expect(res[0].minutes).toBe(270) // 4h30m
    expect(res[0].from.toISOString()).toBe(new Date('2026-07-01T07:00:00').toISOString())
  })
})
