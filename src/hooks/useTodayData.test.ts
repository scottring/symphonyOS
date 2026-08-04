import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useTodayData } from './useTodayData'
import type { TodayDataInput } from '@/lib/today/types'

/** Midnight Sunday on or before `d` — a real week anchor. */
function sundayOf(d: Date): Date {
  const s = new Date(d)
  s.setHours(0, 0, 0, 0)
  s.setDate(s.getDate() - s.getDay())
  return s
}
function baseInput(over: Partial<TodayDataInput> = {}): TodayDataInput {
  const viewedDate = over.viewedDate ?? new Date()
  return {
    tasks: [], events: [], routines: [], dateInstances: [],
    viewedDate, selectedAssignee: null, hideRoutines: false,
    weekStart: sundayOf(viewedDate), ...over,
  }
}

describe('useTodayData', () => {
  it('returns computed TodayData and is referentially stable across re-render with same input', () => {
    const input = baseInput()
    const { result, rerender } = renderHook((p: TodayDataInput) => useTodayData(p), { initialProps: input })
    const first = result.current
    expect(first.sectionsOrder).toEqual(['allday', 'earlyMorning', 'morning', 'afternoon', 'evening', 'night', 'unscheduled'])
    rerender(input)
    expect(result.current).toBe(first)
  })
  it('recomputes when input changes', () => {
    const { result, rerender } = renderHook((p: TodayDataInput) => useTodayData(p), { initialProps: baseInput() })
    const first = result.current
    rerender(baseInput())
    expect(result.current).not.toBe(first)
  })
})
