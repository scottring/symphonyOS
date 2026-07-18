import { Routes, Route } from 'react-router-dom'
import { PlannerPage, MemoryShelfPage, CookPage } from '@/components/meals'

// Meals surface, mounted by the Shell at /meals/*. Two tabs (Plan, Recipes)
// plus the cook-mode route opened from recipe detail and the wall.
export function MealsApp() {
  return (
    <Routes>
      <Route path="shelf" element={<MemoryShelfPage />} />
      <Route path="cook/:recipeId" element={<CookPage />} />
      <Route path="plan" element={<PlannerPage />} />
      <Route index element={<PlannerPage />} />
      <Route path="*" element={<PlannerPage />} />
    </Routes>
  )
}
