// src/components/routine/useRoutineExplainLens.ts
import { useMemo } from 'react'
import type { RoutinePrefs } from '@/lib/routineUtils'
import { useAssigneeFilter } from '@/hooks/useAssigneeFilter'
import { LAYERS_KEY, resolveInitialLayers } from '@/hooks/useDomain'
import { ALL_LAYERS } from '@/lib/domains'

/**
 * Today's lens for an explanation: the persisted Areas layers and people
 * filter (the same keys Today reads), and no hide-daily sweep — Today's main
 * list runs with it off (computeTodayData). Read from storage so a panel
 * opened outside the domain provider still explains honestly.
 */
export function useRoutineExplainLens(): { prefs: RoutinePrefs; member: string[] } {
  const [member] = useAssigneeFilter()
  let stored: string | null = null
  try { stored = localStorage.getItem(LAYERS_KEY) } catch { /* unavailable */ }
  const layers = useMemo(() => {
    try { return resolveInitialLayers(stored) } catch { return ALL_LAYERS }
  }, [stored])
  const prefs = useMemo<RoutinePrefs>(() => ({ hideRoutines: false, layers }), [layers])
  return useMemo(() => ({ prefs, member }), [prefs, member])
}
