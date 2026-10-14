// src/hooks/useGuidedPlan.tsx
//
// Guided planning is retired (Horizons talk-first, 2026-10-14): the guide bar
// and the path chooser that started a run are gone, so no run is ever on. A
// run saved before the retirement is not read back — with no bar there would
// be no way to leave it, and it would keep pinning the planning rail and
// Today's week column. The provider and hook stay so the shell and Today
// still compile against them.
import type { ReactNode } from 'react'
import type { GuideState } from '@/lib/guide/guidedPlan'

export function GuideProvider({ children }: { children: ReactNode }) {
  return <>{children}</>
}

/** No guided run is ever active. */
export function useGuidedPlan(): { state: GuideState | null } {
  return { state: null }
}
