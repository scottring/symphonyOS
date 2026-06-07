import type { AppDef } from '@/shell/types'
import { GoalsApp } from './GoalsApp'

// Goals (areas + goals + per-goal planning chat). It does not own a selection
// kind — the planning sub-mode is provider state, not a global selection.
export const goalsAppDef: AppDef = {
  id: 'goals',
  route: '/goals',
  Component: GoalsApp,
}
