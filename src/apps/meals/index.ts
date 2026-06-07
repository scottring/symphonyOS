import type { AppDef } from '@/shell/types'
import { MealsApp } from './MealsApp'

export const mealsAppDef: AppDef = {
  id: 'meals',
  route: '/meals',
  Component: MealsApp,
}
