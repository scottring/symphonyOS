import type { AppDef } from '@/shell/types'
import { MonthPlanPage, SeasonPlanPage, YearPlanPage } from './PlanPages'

// The three planning pages — one surface at three levels. Each is its own
// route so the sidebar can say This Month / This Season / This Year plainly;
// the component is shared (PeriodPlanPage). A task opens in the detail pane
// over the period, as on Today and Week (S2-10); goals keep their own page.
const hostsSelectionKinds = ['task']
export const monthPlanAppDef: AppDef = { id: 'plan-month', route: '/month', Component: MonthPlanPage, hostsSelectionKinds }
export const seasonPlanAppDef: AppDef = { id: 'plan-season', route: '/season', Component: SeasonPlanPage, hostsSelectionKinds }
export const yearPlanAppDef: AppDef = { id: 'plan-year', route: '/year', Component: YearPlanPage, hostsSelectionKinds }
