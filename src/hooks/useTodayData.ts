import { useMemo } from 'react'
import type { TodayDataInput, TodayData } from '@/lib/today/types'
import { computeTodayData } from '@/lib/today/computeTodayData'

/** Thin memoized wrapper over the pure computeTodayData. */
export function useTodayData(input: TodayDataInput): TodayData {
  return useMemo(() => computeTodayData(input), [input])
}
