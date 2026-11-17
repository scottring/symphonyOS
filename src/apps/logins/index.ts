import type { AppDef } from '@/shell/types'
import { LoginsApp } from './LoginsApp'

// Logins: site, username and a password hint. Owner-only — never on the wall,
// never shared with the household. No selection kind.
export const loginsAppDef: AppDef = {
  id: 'logins',
  route: '/logins',
  Component: LoginsApp,
}
