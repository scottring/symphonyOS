import type { AppDef } from '@/shell/types'
import { ListsApp } from './ListsApp'

export const listsAppDef: AppDef = {
  id: 'lists',
  route: '/lists',
  Component: ListsApp,
}
