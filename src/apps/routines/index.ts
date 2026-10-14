import type { AppDef } from '@/shell/types'
import { RoutinesApp } from './RoutinesApp'

// Routines (the picture + create + edit). Tapping a routine opens it in the
// shared detail pane (the tasks app owns the 'routine' kind), with the day it
// was tapped on (SelectionRef.date).
export const routinesAppDef: AppDef = {
  id: 'routines',
  route: '/routines',
  Component: RoutinesApp,
  hostsSelectionKinds: ['routine'],
}
