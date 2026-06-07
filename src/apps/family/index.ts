import type { AppDef } from '@/shell/types'
import { FamilyApp } from './FamilyApp'

// Family member detail (opened from family avatars via /family/:memberId). It
// does not own a selection kind — opening a task delegates to the tasks app's
// /task/:id route (see FamilyApp).
export const familyAppDef: AppDef = {
  id: 'family',
  route: '/family',
  Component: FamilyApp,
}
