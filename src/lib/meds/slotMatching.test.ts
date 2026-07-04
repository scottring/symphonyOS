import { describe, it, expect } from 'vitest'
import { matchLogsToSlots } from './slotMatching'
import type { MedicationLog } from '@/types/medication'

function log(id: string, iso: string): MedicationLog {
  return { id, medicationId: 'm1', takenAt: new Date(iso), source: 'manual', createdAt: new Date(iso) }
}

// Anchor date used for the schedule day (local time).
const DAY = new Date('2026-07-01T00:00:00')

describe('matchLogsToSlots', () => {
  it('matches a log to the nearest slot within the window', () => {
    const logs = [log('a', '2026-07-01T07:05:00')]
    const { slots, extras } = matchLogsToSlots(['07:00', '11:00'], logs, DAY, 90)
    expect(slots[0]).toEqual({ slot: '07:00', log: logs[0] })
    expect(slots[1]).toEqual({ slot: '11:00', log: null })
    expect(extras).toEqual([])
  })

  it('sends a log with no slot within the window to extras', () => {
    const logs = [log('a', '2026-07-01T14:30:00')]
    const { slots, extras } = matchLogsToSlots(['07:00', '11:00'], logs, DAY, 90)
    expect(slots.every((s) => s.log === null)).toBe(true)
    expect(extras).toEqual(logs)
  })

  it('gives each slot at most one log and puts the second-closest in extras', () => {
    const logs = [log('a', '2026-07-01T06:55:00'), log('b', '2026-07-01T07:10:00')]
    const { slots, extras } = matchLogsToSlots(['07:00'], logs, DAY, 90)
    expect(slots[0].log?.id).toBe('a') // closer to 07:00
    expect(extras.map((l) => l.id)).toEqual(['b'])
  })
})
