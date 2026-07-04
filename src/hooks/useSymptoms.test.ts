import { describe, it, expect } from 'vitest'
import { dbSymptomToSymptom } from './useSymptoms'

describe('dbSymptomToSymptom', () => {
  it('maps a symptom row to the Symptom type', () => {
    const s = dbSymptomToSymptom({
      id: 's1', user_id: 'u1', name: 'Tremor', active: true, sort_order: 0,
      created_at: '2026-07-04T00:00:00Z', updated_at: '2026-07-04T00:00:00Z',
    })
    expect(s.name).toBe('Tremor')
    expect(s.active).toBe(true)
    expect(s.createdAt).toBeInstanceOf(Date)
  })
})
