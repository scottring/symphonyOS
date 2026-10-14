import { ConstellationPage } from '@/components/plan/constellation/ConstellationPage'

// Month, Season and Year are one page: the constellation (lists side by side,
// planned by talking). The older per-level pages are retired.
export function MonthPlanPage() { return <ConstellationPage /> }
export function SeasonPlanPage() { return <ConstellationPage /> }
export function YearPlanPage() { return <ConstellationPage /> }
