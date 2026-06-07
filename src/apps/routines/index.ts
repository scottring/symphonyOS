import type { AppDef } from '@/shell/types'
import { RoutinesApp } from './RoutinesApp'

// Routines (list + create + edit). Does not own a selection kind.
export const routinesAppDef: AppDef = {
  id: 'routines',
  route: '/routines',
  Component: RoutinesApp,
}
