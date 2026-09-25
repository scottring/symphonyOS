import type { AppDef } from '@/shell/types'
import { PlanningGuide } from '@/components/plan/PlanningGuide'

// The planning guide — a permanent page, not an onboarding step. It has its
// own route so it can be linked to, bookmarked and printed from anywhere.
export const guideAppDef: AppDef = { id: 'planning-guide', route: '/guide', Component: PlanningGuide }
