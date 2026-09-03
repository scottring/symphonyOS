import type { AppDef } from '@/shell/types'
import { DiscussionsApp } from './DiscussionsApp'

// The Discussions inbox. No selection kind of its own — a row opens the item
// through the global ?detail= selection with ?discuss=1 alongside it.
export const discussionsAppDef: AppDef = {
  id: 'discussions',
  route: '/discussions',
  Component: DiscussionsApp,
}
