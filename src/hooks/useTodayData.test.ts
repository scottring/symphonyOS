import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useTodayData } from './useTodayData'
import type { TodayDataInput } from '@/lib/today/types'

function baseInput(over: Partial<TodayDataInput> = {}): TodayDataInput {
  return {
    tasks: [], events: [], routines: [], dateInstances: [],
    viewedDate: new Date(), selectedAssignee: null, hideRoutines: false, ...over,
  }
}

describe('useTodayData', () => {
  it('returns computed TodayData and is referentially stable across re-render with same input', () => {
    const input = baseInput()
    const { result, rerender } = renderHook((p: TodayDataInput) => useTodayData(p), { initialProps: input })
    const first = result.current
    expect(first.sectionsOrder).toEqual(['allday', 'morning', 'afternoon', 'evening', 'unscheduled'])
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
