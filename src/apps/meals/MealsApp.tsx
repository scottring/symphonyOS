import { Routes, Route, Navigate } from 'react-router-dom'
import {
  PlannerPage,
  MemoryShelfPage,
  TodayPage,
  StandingHabitsPage,
  DayDetailPage,
  CookPage,
  GramTrackingPage,
  TonightPage,
} from '@/components/meals'

// Meals surface, mounted by the Shell at /meals/*. The inner <Routes> match
// segments relative to /meals (the parent route must end in /*). Mirrors the
// legacy ViewRouter pathname checks: the index falls through to PlannerPage,
// and `brief` is a redirect to the plan page's brief anchor. The meals pages
// are self-contained (no App-only providers wrapped them in ViewRouter).
export function MealsApp() {
  return (
    <Routes>
      <Route path="shelf" element={<MemoryShelfPage />} />
      <Route path="today" element={<TodayPage />} />
      <Route path="habits" element={<StandingHabitsPage />} />
      <Route path="grams" element={<GramTrackingPage />} />
      <Route path="tonight" element={<TonightPage />} />
      <Route path="day/:date" element={<DayDetailPage />} />
      <Route path="cook/:recipeId" element={<CookPage />} />
      <Route path="brief" element={<Navigate to="/meals/plan#brief" replace />} />
      <Route path="plan" element={<PlannerPage />} />
      <Route index element={<PlannerPage />} />
      <Route path="*" element={<PlannerPage />} />
    </Routes>
  )
}
