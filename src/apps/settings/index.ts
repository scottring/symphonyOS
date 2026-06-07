import type { AppDef } from '@/shell/types'
import { SettingsApp } from './SettingsApp'

export const settingsAppDef: AppDef = {
  id: 'settings',
  route: '/settings',
  Component: SettingsApp,
}
