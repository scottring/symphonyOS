import type { AppDef } from '@/shell/types'
import { MedsApp } from './MedsApp'

// Medications tracker (Today / Timing / Manage). Owner-only private health data.
export const medsAppDef: AppDef = {
  id: 'meds',
  route: '/meds',
  Component: MedsApp,
}
