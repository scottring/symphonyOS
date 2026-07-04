import { describe, it, expect } from 'vitest'
import { dbLogToSymptomLog } from './useSymptomLogs'

describe('dbLogToSymptomLog', () => {
  it('maps a symptom_log row to SymptomLog', () => {
    const l = dbLogToSymptomLog({
      id: 'l1', user_id: 'u1', symptom_id: 's1', severity: 2,
      logged_at: '2026-07-04T08:40:00Z', note: null, created_at: '2026-07-04T08:40:01Z',
    })
    expect(l.symptomId).toBe('s1')
    expect(l.severity).toBe(2)
    expect(l.loggedAt).toBeInstanceOf(Date)
    expect(l.note).toBeUndefined()
  })
})
