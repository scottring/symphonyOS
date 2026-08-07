import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('@/hooks/useDayLoadEvents', () => ({
  useDayLoadEvents: (enabled: boolean) => ({
    events: [],
    available: enabled,
    loading: false,
  }),
  DAY_LOAD_RANGE_DAYS: 45,
}))

import { useDayLoads } from './useDayLoads'
import { DATED_WHENS } from '@/components/schedule/SchedulePicker'
import { loadKeyFor } from '@/components/schedule/RescheduleGrid'
import { DAY_WINDOW, EVENING_WINDOW } from '@/lib/today/dayLoad'

const base = { tasks: [], enabled: true }

describe('useDayLoads', () => {
  it('returns one load per dated DAY and none for pool tiles', () => {
    const { result } = renderHook(() => useDayLoads(base))
    // Two dated tiles can land on the same calendar day — run this on a Friday
    // and `tomorrow` and `this-weekend` are both Saturday — and loadKeyFor keys
    // by date, so they share one entry. That is correct: the map is keyed by
    // day, not by tile, and both tiles want the same day's load. Asserting
    // DATED_WHENS.length instead made this test fail every Friday.
    const distinctDays = new Set(DATED_WHENS.map((t) => loadKeyFor(t.when)))
    expect(result.current.size).toBe(distinctDays.size)
    expect(result.current.has(loadKeyFor('someday'))).toBe(false)
    expect(result.current.has(loadKeyFor('this-month'))).toBe(false)
  })

  it('scopes tonight to the evening window and today to the full day', () => {
    const { result } = renderHook(() => useDayLoads(base))
    const tonight = result.current.get(loadKeyFor('tonight'))!
    const today = result.current.get(loadKeyFor('today'))!

    expect(tonight.windowMinutes).toBe((EVENING_WINDOW.endHour - EVENING_WINDOW.startHour) * 60)
    expect(today.windowMinutes).toBe((DAY_WINDOW.endHour - DAY_WINDOW.startHour) * 60)
  })

  it('keys tonight separately from today so they do not collide', () => {
    expect(loadKeyFor('tonight')).not.toBe(loadKeyFor('today'))
  })

  it('returns an empty map when disabled', () => {
    const { result } = renderHook(() => useDayLoads({ ...base, enabled: false }))
    expect(result.current.size).toBe(0)
  })
})
