// src/apps/home/index.ts
import type { AppDef } from '@/shell/types'
import { HomeApp } from './HomeApp'

export { HomeApp } from './HomeApp'

// House (rooms/assets) surface. HomeApp owns its internal <Routes>; the Shell
// mounts it at /home/* so those relative segments (space/:id, asset/:id, …)
// resolve. No App-only providers wrapped it in the legacy ViewRouter, so it
// needs no extra wrapping here.
export const homeAppDef: AppDef = {
  id: 'home',
  route: '/home',
  Component: HomeApp,
}
