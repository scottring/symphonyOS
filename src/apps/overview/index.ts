import type { AppDef } from '@/shell/types'
import { HomePage } from '@/components/overview/HomePage'
import { HOME_ROUTE } from './route'

export { HOME_ROUTE }

// Home: where you come back to for your bearings (2026-10-11). Its own route,
// because /home is the House app; the Symphony mark and the phone dock's Home
// come here. The app still opens on Today.
export const overviewAppDef: AppDef = { id: 'overview', route: HOME_ROUTE, Component: HomePage }
