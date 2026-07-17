import { Suspense } from 'react'
import { Routes, Route, useNavigate, useParams, Navigate } from 'react-router-dom'
import { GoalsProvider, useGoalsContext } from '@/contexts/GoalsContext'
import { useDomain } from '@/hooks/useDomain'
import { GoalsList, GoalView } from '@/components/lazy'
import { LoadingFallback } from '@/components/layout/LoadingFallback'

/**
 * Goals surface, mounted by the Shell at /goals/*. The inner <Routes> match
 * segments relative to /goals (the parent route ends in /*):
 *   index        -> GoalsList
 *   :goalId      -> GoalView
 *
 * Mirrors the legacy ViewRouter `GoalsSection`, flattened to a simple
 * list <-> detail axis, URL-driven (/goals, /goals/:goalId). A goal is just
 * name + status + notes; actions/milestones/AI planning were removed (see
 * Task 13 — the guided horizons sessions replaced quarterly goal planning).
 *
 * Data comes from GoalsProvider/useGoalsContext (App.tsx mounted this provider
 * globally; the Shell tree doesn't, so GoalsApp mounts its own — it's
 * self-contained). The list is domain filtered/tagged via useDomain.
 */
function GoalsIndex() {
  const navigate = useNavigate()
  const { currentDomain } = useDomain()
  const {
    areas, goals, loading, getCurrentQuarter,
    addArea, updateArea, deleteArea, addGoal,
  } = useGoalsContext()

  const filteredGoals =
    currentDomain === 'universal' ? goals : goals.filter((g) => g.context === currentDomain)

  return (
    <Suspense fallback={<LoadingFallback />}>
      <GoalsList
        areas={areas}
        goals={filteredGoals}
        loading={loading}
        currentQuarter={getCurrentQuarter()}
        year={new Date().getFullYear()}
        onSelectGoal={(id) => navigate(`/goals/${id}`)}
        onAddArea={addArea}
        onRenameArea={(areaId, name) => updateArea(areaId, { name })}
        onAddGoal={(areaId, name) => addGoal(areaId, name, currentDomain !== 'universal' ? currentDomain : undefined)}
        onDeleteArea={deleteArea}
      />
    </Suspense>
  )
}

function GoalDetail() {
  const navigate = useNavigate()
  const { goalId } = useParams<{ goalId: string }>()
  const {
    areas, goals, getGoalById,
    updateGoal, deleteGoal,
  } = useGoalsContext()

  const goal = goalId ? getGoalById(goalId) : undefined

  // Goals not yet loaded — wait. If loaded and missing, bounce to the list.
  if (!goal) {
    return goals.length > 0 ? <Navigate to="/goals" replace /> : <LoadingFallback />
  }

  return (
    <Suspense fallback={<LoadingFallback />}>
      <GoalView
        goal={goal}
        area={areas.find((a) => a.id === goal.areaId)}
        onBack={() => navigate('/goals')}
        onUpdateGoal={updateGoal}
        onDeleteGoal={deleteGoal}
      />
    </Suspense>
  )
}

export function GoalsApp() {
  return (
    <GoalsProvider>
      <Routes>
        <Route index element={<GoalsIndex />} />
        <Route path=":goalId" element={<GoalDetail />} />
        <Route path="*" element={<Navigate to="/goals" replace />} />
      </Routes>
    </GoalsProvider>
  )
}
