import { createContext, useContext, type ReactNode } from 'react'
import { useGoals } from '@/hooks/useGoals'
import type { GoalArea, Goal, Quarter } from '@/types/goal'

export interface GoalsContextValue {
  areas: GoalArea[]
  goals: Goal[]
  addArea: (name: string) => Promise<GoalArea | null>
  updateArea: (id: string, updates: { name?: string; sortOrder?: number }) => Promise<void>
  deleteArea: (id: string) => Promise<void>
  addGoal: (areaId: string, name: string, context?: 'work' | 'family' | 'personal') => Promise<Goal | null>
  updateGoal: (id: string, updates: Partial<Pick<Goal, 'name' | 'notes' | 'status' | 'areaId' | 'sortOrder' | 'strategy' | 'domainSlug' | 'layerId' | 'context' | 'year'>>) => Promise<void>
  deleteGoal: (id: string) => Promise<void>
  getGoalById: (id: string) => Goal | undefined
  getCurrentQuarter: () => Quarter
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
    getGoalById,
    getCurrentQuarter,
  } = useGoals()

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
        getGoalById,
        getCurrentQuarter,
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
