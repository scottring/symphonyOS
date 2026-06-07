import type { AppDef } from '@/shell/types'
import { BedtimeApp } from './BedtimeApp'

export const bedtimeAppDef: AppDef = {
  id: 'bedtime',
  route: '/bedtime',
  Component: BedtimeApp,
}
