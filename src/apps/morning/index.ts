import type { AppDef } from '@/shell/types'
import { MorningApp } from './MorningApp'

export const morningAppDef: AppDef = {
  id: 'morning',
  route: '/morning',
  Component: MorningApp,
}
