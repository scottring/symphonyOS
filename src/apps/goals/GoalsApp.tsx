import { Suspense } from 'react'
import { Routes, Route, useNavigate, useParams, Navigate } from 'react-router-dom'
import { GoalsProvider, useGoalsContext } from '@/contexts/GoalsContext'
import { useDomain } from '@/hooks/useDomain'
import { GoalsList, GoalView, GoalPlanningChat } from '@/components/lazy'
import { LoadingFallback } from '@/components/layout/LoadingFallback'

/**
 * Goals surface, mounted by the Shell at /goals/*. The inner <Routes> match
 * segments relative to /goals (the parent route ends in /*):
 *   index        -> GoalsList
 *   :goalId      -> GoalView, or GoalPlanningChat when a planning sub-mode is active
 *
 * Mirrors the legacy ViewRouter `GoalsSection`. It's a 3-way state machine:
 *   GoalsList (index) <-> GoalView (a goal selected) <-> GoalPlanningChat (planning).
 * The list <-> detail axis is URL-driven (/goals, /goals/:goalId). The planning
 * sub-mode is provider state (`planningGoalId`) layered on the detail route —
 * exactly as the legacy section did, so we keep it provider-state rather than a
 * separate URL segment.
 *
 * Data comes from GoalsProvider/useGoalsContext (App.tsx mounted this provider
 * globally; the Shell tree doesn't, so GoalsApp mounts its own — it's
 * self-contained). The list is domain filtered/tagged via useDomain.
 */
function GoalsIndex() {
  const navigate = useNavigate()
  const { currentDomain } = useDomain()
  const {
    areas, goals, getCurrentQuarter,
    addArea, deleteArea, addGoal, toggleAction,
  } = useGoalsContext()

  const filteredGoals =
    currentDomain === 'universal' ? goals : goals.filter((g) => g.context === currentDomain)

  return (
    <Suspense fallback={<LoadingFallback />}>
      <GoalsList
        areas={areas}
        goals={filteredGoals}
        currentQuarter={getCurrentQuarter()}
        year={new Date().getFullYear()}
        onSelectGoal={(id) => navigate(`/goals/${id}`)}
        onAddArea={addArea}
        onAddGoal={(areaId, name) => addGoal(areaId, name, currentDomain !== 'universal' ? currentDomain : undefined)}
        onToggleAction={toggleAction}
        onDeleteArea={deleteArea}
      />
    </Suspense>
  )
}

function GoalDetail() {
  const navigate = useNavigate()
  const { goalId } = useParams<{ goalId: string }>()
  const {
    areas, goals, getCurrentQuarter, getGoalById,
    updateGoal, deleteGoal,
    addAction, updateAction, toggleAction, deleteAction,
    addMilestone, updateMilestone, updateMilestoneProgress, deleteMilestone,
    planningGoalId, setPlanningGoalId, goalPlanning,
  } = useGoalsContext()

  const goal = goalId ? getGoalById(goalId) : undefined

  // Goals not yet loaded — wait. If loaded and missing, bounce to the list.
  if (!goal) {
    return goals.length > 0 ? <Navigate to="/goals" replace /> : <LoadingFallback />
  }

  // Planning sub-mode (provider state) layers over the detail route.
  if (planningGoalId) {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <GoalPlanningChat
          goalName={getGoalById(planningGoalId)?.name ?? 'Goal'}
          messages={goalPlanning.messages}
          loading={goalPlanning.loading}
          readyToFinish={goalPlanning.readyToFinish}
          planningResult={goalPlanning.planningResult}
          error={goalPlanning.error}
          onStart={() => {
            const g = getGoalById(planningGoalId)
            if (g) {
              const areaName = areas.find((a) => a.id === g.areaId)?.name
              goalPlanning.startPlanning(g.id, g.name, g.notes, areaName)
            }
          }}
          onSend={goalPlanning.sendMessage}
          onFinish={goalPlanning.finishPlanning}
          onBack={() => { setPlanningGoalId(null); goalPlanning.reset() }}
          onDone={() => { setPlanningGoalId(null); goalPlanning.reset() }}
        />
      </Suspense>
    )
  }

  return (
    <Suspense fallback={<LoadingFallback />}>
      <GoalView
        goal={goal}
        area={areas.find((a) => a.id === goal.areaId)}
        currentQuarter={getCurrentQuarter()}
        onBack={() => navigate('/goals')}
        onUpdateGoal={updateGoal}
        onDeleteGoal={deleteGoal}
        onAddAction={addAction}
        onUpdateAction={updateAction}
        onToggleAction={toggleAction}
        onDeleteAction={deleteAction}
        onStartPlanning={() => {
          setPlanningGoalId(goal.id)
          const areaName = areas.find((a) => a.id === goal.areaId)?.name
          goalPlanning.startPlanning(goal.id, goal.name, goal.notes, areaName)
        }}
        onAddMilestone={addMilestone}
        onUpdateMilestone={updateMilestone}
        onUpdateMilestoneProgress={updateMilestoneProgress}
        onDeleteMilestone={deleteMilestone}
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
