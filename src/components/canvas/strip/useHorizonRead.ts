// src/components/canvas/strip/useHorizonRead.ts
//
// How a typed sentence reads ("Dentist for K Nov 23 at 9am"), and where it
// lands against the page's period: a date in the words puts it on that day.
// Shared by TypedAdd and the sheets' write line (WriteLine).

import { useMemo } from 'react'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { parseHorizonInput, landingFor, type HorizonLanding, type HorizonParse } from '@/lib/planning/horizonInput'

export interface HorizonRead { parse: HorizonParse; landing: HorizonLanding }

/** Null while nothing is typed. */
export function useHorizonRead(draft: string, period: { start: Date; end: Date }, fallbackDay?: Date): HorizonRead | null {
  const { members: familyMembers } = useFamilyMembers()
  return useMemo(() => {
    if (!draft.trim()) return null
    const parse = parseHorizonInput(draft, familyMembers)
    return { parse, landing: landingFor(parse, period, fallbackDay) }
  }, [draft, familyMembers, period, fallbackDay])
}
