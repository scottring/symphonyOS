import { PeriodPlanPage } from '@/components/plan/PeriodPlanPage'
import { PlanPageV2 } from '@/components/plan/v2/PlanPageV2'
import { YearPageV2 } from '@/components/plan/v2/YearPageV2'
import { planV2Enabled } from '@/lib/planning/v2/planV2'

// v2 (docs/planning/2026-09-28-planning-v2.md) is per device: `?plan=v2` turns
// it on, `?plan=v1` off.
export function MonthPlanPage() { return planV2Enabled() ? <PlanPageV2 level="month" /> : <PeriodPlanPage level="month" /> }
export function SeasonPlanPage() { return planV2Enabled() ? <PlanPageV2 level="season" /> : <PeriodPlanPage level="season" /> }
export function YearPlanPage() { return planV2Enabled() ? <YearPageV2 /> : <PeriodPlanPage level="year" /> }
