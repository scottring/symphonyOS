import { createContext, useContext, useState, type ReactNode } from 'react'
import { useGoals } from '@/hooks/useGoals'
import { useGoalMilestones } from '@/hooks/useGoalMilestones'
import { useGoalPlanning } from '@/hooks/useGoalPlanning'
import type { GoalArea, Goal, GoalAction, GoalMilestone, Quarter, ConversationMessage, GoalPlanningResult } from '@/types/goal'

export interface GoalsContextValue {
  areas: GoalArea[]
  goals: Goal[]
  addArea: (name: string) => Promise<GoalArea | null>
  updateArea: (id: string, updates: { name?: string; sortOrder?: number }) => Promise<void>
  deleteArea: (id: string) => Promise<void>
  addGoal: (areaId: string, name: string, context?: 'work' | 'family' | 'personal') => Promise<Goal | null>
  updateGoal: (id: string, updates: Partial<Pick<Goal, 'name' | 'notes' | 'status' | 'areaId' | 'sortOrder' | 'strategy' | 'domainSlug' | 'layerId' | 'context'>>) => Promise<void>
  deleteGoal: (id: string) => Promise<void>
  addAction: (goalId: string, description: string, quarter: Quarter) => Promise<GoalAction | null>
  updateAction: (id: string, updates: Partial<Pick<GoalAction, 'description' | 'completed' | 'notes' | 'sortOrder'>>) => Promise<void>
  toggleAction: (id: string) => Promise<void>
  deleteAction: (id: string) => Promise<void>
  getGoalById: (id: string) => Goal | undefined
  getCurrentQuarter: () => Quarter
  // Milestones
  addMilestone: (goalId: string, title: string, opts?: { description?: string; targetDate?: string; targetValue?: number; unit?: string; sortOrder?: number }) => Promise<GoalMilestone | null>
  updateMilestone: (id: string, updates: Partial<Pick<GoalMilestone, 'title' | 'description' | 'targetDate' | 'targetValue' | 'currentValue' | 'unit' | 'status' | 'sortOrder'>>) => Promise<void>
  updateMilestoneProgress: (id: string, currentValue: number, targetValue?: number) => Promise<void>
  deleteMilestone: (id: string) => Promise<void>
  // Planning
  planningGoalId: string | null
  setPlanningGoalId: (id: string | null) => void
  goalPlanning: {
    messages: ConversationMessage[]
    loading: boolean
    readyToFinish: boolean
    planningResult: GoalPlanningResult | null
    error: string | null
    startPlanning: (goalId: string, goalName: string, goalNotes?: string, areaName?: string) => Promise<void>
    sendMessage: (message: string) => Promise<void>
    finishPlanning: () => Promise<void>
    reset: () => void
  }
}

const GoalsContext = createContext<GoalsContextValue | null>(null)

export function GoalsProvider({ children }: { children: ReactNode }) {
  const {
    areas,
    goals,
    addArea,
    updateArea,
    deleteArea,
    addGoal,
    updateGoal,
    deleteGoal,
    addAction,
    updateAction,
    toggleAction,
    deleteAction,
    getGoalById,
    getCurrentQuarter,
    addMilestoneLocal,
    updateMilestoneLocal,
    removeMilestoneLocal,
  } = useGoals()

  const { addMilestone, updateMilestone, updateProgress: updateMilestoneProgress, deleteMilestone } = useGoalMilestones({
    addMilestoneLocal,
    updateMilestoneLocal,
    removeMilestoneLocal,
  })

  const goalPlanning = useGoalPlanning()
  const [planningGoalId, setPlanningGoalId] = useState<string | null>(null)

  return (
    <GoalsContext.Provider
      value={{
        areas,
        goals,
        addArea,
        updateArea,
        deleteArea,
        addGoal,
        updateGoal,
        deleteGoal,
        addAction,
        updateAction,
        toggleAction,
        deleteAction,
        getGoalById,
        getCurrentQuarter,
        addMilestone,
        updateMilestone,
        updateMilestoneProgress,
        deleteMilestone,
        planningGoalId,
        setPlanningGoalId,
        goalPlanning,
      }}
    >
      {children}
    </GoalsContext.Provider>
  )
}

export function useGoalsContext(): GoalsContextValue {
  const ctx = useContext(GoalsContext)
  if (!ctx) throw new Error('useGoalsContext must be used within GoalsProvider')
  return ctx
}
