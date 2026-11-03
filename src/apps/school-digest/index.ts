import type { AppDef } from '@/shell/types'
import { SchoolDigestApp } from './SchoolDigestApp'

// The kept 5pm school digests (migration 20261103120000). Read-only.
export const schoolDigestAppDef: AppDef = { id: 'school-digest', route: '/school-digest', Component: SchoolDigestApp }
