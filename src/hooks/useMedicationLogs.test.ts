import { describe, it, expect } from 'vitest'
import { dbLogToLog } from './useMedicationLogs'

describe('dbLogToLog', () => {
  it('maps a log row to MedicationLog', () => {
    const l = dbLogToLog({
      id: 'l1', user_id: 'u1', medication_id: 'm1',
      taken_at: '2026-07-01T14:30:00Z', source: 'shortcut', note: null,
      created_at: '2026-07-01T14:30:01Z',
    })
    expect(l.medicationId).toBe('m1')
    expect(l.source).toBe('shortcut')
    expect(l.takenAt).toBeInstanceOf(Date)
    expect(l.note).toBeUndefined()
  })
})
