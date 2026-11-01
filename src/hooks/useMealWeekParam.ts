// The Meals page opened on a given week (`/meals/plan?week=YYYY-MM-DD`, as
// Planning the week's "Open the meal plan" links it): the starting week
// offset, read once, then `week` is taken out of the address (replace), so
// moving between weeks and reloading do not snap back to it.

import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { weekOffsetFor } from '@/lib/mealWeek'
import type { WeekStart } from '@/lib/cadence/config'

export function useMealWeekParam(weekStartsOn: WeekStart): number {
  const [params, setParams] = useSearchParams()
  const [initial] = useState(() => weekOffsetFor(params.get('week'), new Date(), weekStartsOn))
  const asked = params.has('week')
  useEffect(() => {
    if (!asked) return
    setParams((prev) => { const p = new URLSearchParams(prev); p.delete('week'); return p }, { replace: true })
  }, [asked, setParams])
  return initial
}
