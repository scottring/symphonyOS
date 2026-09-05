import type { AppDef } from '@/shell/types'
import { MonthPlanPage, SeasonPlanPage, YearPlanPage } from './PlanPages'

// The three planning pages — one surface at three levels. Each is its own
// route so the sidebar can say This Month / This Season / This Year plainly;
// the component is shared (PeriodPlanPage).
export const monthPlanAppDef: AppDef = { id: 'plan-month', route: '/month', Component: MonthPlanPage }
export const seasonPlanAppDef: AppDef = { id: 'plan-season', route: '/season', Component: SeasonPlanPage }
export const yearPlanAppDef: AppDef = { id: 'plan-year', route: '/year', Component: YearPlanPage }
