import type { AppDef } from '@/shell/types'
import { GettingStartedPage } from '@/components/plan/GettingStartedPage'

// Getting Started is its OWN destination, not a panel on a planning page.
export const gettingStartedAppDef: AppDef = { id: 'getting-started', route: '/start', Component: GettingStartedPage }
