import type { AppDef } from '@/shell/types'
import { HistoryApp } from './HistoryApp'

// History (completed-tasks archive). It does not own a selection kind — opening
// an archived task delegates to the tasks app's /task/:id route (see HistoryApp).
export const historyAppDef: AppDef = {
  id: 'history',
  route: '/history',
  Component: HistoryApp,
}
