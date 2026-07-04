import { describe, it, expect } from 'vitest'
import { mergeTimeline, localDayKey } from './timelineMerge'
import type { MedicationLog } from '@/types/medication'
import type { SymptomLog } from '@/types/symptom'

function dose(id: string, iso: string): MedicationLog {
  return { id, medicationId: 'm1', takenAt: new Date(iso), source: 'web', createdAt: new Date(iso) }
}
function symptom(id: string, iso: string): SymptomLog {
  return { id, symptomId: 's1', severity: 2, loggedAt: new Date(iso), createdAt: new Date(iso) }
}

describe('mergeTimeline', () => {
  it('interleaves doses and symptoms within a day, ascending by time', () => {
    const days = mergeTimeline(
      [dose('d1', '2026-07-04T07:00:00'), dose('d2', '2026-07-04T11:00:00')],
      [symptom('s1', '2026-07-04T08:40:00')],
    )
    expect(days).toHaveLength(1)
    expect(days[0].rows.map((r) => `${r.kind}:${r.log.id}`)).toEqual(['dose:d1', 'symptom:s1', 'dose:d2'])
  })

  it('groups by local day, newest day first', () => {
    const days = mergeTimeline(
      [dose('d1', '2026-07-03T09:00:00'), dose('d2', '2026-07-04T09:00:00')],
      [],
    )
    expect(days.map((d) => d.key)).toEqual(['2026-07-04', '2026-07-03'])
  })

  it('returns empty when there are no logs', () => {
    expect(mergeTimeline([], [])).toEqual([])
  })
})

describe('localDayKey', () => {
  it('formats local YYYY-MM-DD', () => {
    expect(localDayKey(new Date(2026, 6, 4, 23, 30))).toBe('2026-07-04')
  })
})
