import { describe, it, expect } from 'vitest'
import { dbMedicationToMedication } from './useMedications'

describe('dbMedicationToMedication', () => {
  it('maps snake_case row + jsonb schedule to the Medication type', () => {
    const med = dbMedicationToMedication({
      id: 'm1', user_id: 'u1', name: 'Levodopa', strength: '25/100 mg',
      schedule_times: ['07:00', '11:00'], active: true, notes: null, sort_order: 0,
      created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
    })
    expect(med.name).toBe('Levodopa')
    expect(med.scheduleTimes).toEqual(['07:00', '11:00'])
    expect(med.strength).toBe('25/100 mg')
    expect(med.notes).toBeUndefined()
    expect(med.createdAt).toBeInstanceOf(Date)
  })
}
)
