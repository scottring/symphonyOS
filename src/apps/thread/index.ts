import type { AppDef } from '@/shell/types'
import { ThreadApp } from './ThreadApp'

// The Thread mock. Chromeless on purpose: the whole premise is that there is
// no sidebar to route yourself with. No `sidebar` entry either — it is reached
// by typing /thread, so it can't quietly become destination number 26.
export const threadAppDef: AppDef = {
  id: 'thread',
  route: '/thread',
  Component: ThreadApp,
  chromeless: true,
}
