import { useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { GoalMilestone, MilestoneStatus, DbGoalMilestone } from '@/types/goal'

function dbToMilestone(db: DbGoalMilestone): GoalMilestone {
  return {
    id: db.id,
    goalId: db.goal_id,
    userId: db.user_id,
    title: db.title,
    description: db.description ?? undefined,
    targetDate: db.target_date ?? undefined,
    targetValue: db.target_value ?? undefined,
    currentValue: db.current_value ?? 0,
    unit: db.unit ?? undefined,
    status: db.status,
    sortOrder: db.sort_order,
    createdAt: new Date(db.created_at),
    updatedAt: new Date(db.updated_at),
  }
}

interface UseGoalMilestonesOpts {
  addMilestoneLocal: (m: GoalMilestone) => void
  updateMilestoneLocal: (id: string, updates: Partial<GoalMilestone>) => void
  removeMilestoneLocal: (id: string) => void
}

export function useGoalMilestones({
  addMilestoneLocal,
  updateMilestoneLocal,
  removeMilestoneLocal,
}: UseGoalMilestonesOpts) {
  const { user } = useAuth()

  const addMilestone = useCallback(async (
    goalId: string,
    title: string,
    opts?: { description?: string; targetDate?: string; targetValue?: number; unit?: string; sortOrder?: number }
  ) => {
    if (!user) return null

    const tempId = crypto.randomUUID()
    const optimistic: GoalMilestone = {
      id: tempId,
      goalId,
      userId: user.id,
      title,
      description: opts?.description,
      targetDate: opts?.targetDate,
      targetValue: opts?.targetValue,
      currentValue: 0,
      unit: opts?.unit,
      status: 'pending',
      sortOrder: opts?.sortOrder ?? 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    addMilestoneLocal(optimistic)

    const { data, error } = await supabase
      .from('goal_milestones')
      .insert({
        goal_id: goalId,
        user_id: user.id,
        title,
        description: opts?.description ?? null,
        target_date: opts?.targetDate ?? null,
        target_value: opts?.targetValue ?? null,
        unit: opts?.unit ?? null,
        sort_order: opts?.sortOrder ?? 0,
      })
      .select()
      .single()

    if (error) {
      removeMilestoneLocal(tempId)
      return null
    }

    const real = dbToMilestone(data as DbGoalMilestone)
    // Replace optimistic with real
    removeMilestoneLocal(tempId)
    addMilestoneLocal(real)
    return real
  }, [user, addMilestoneLocal, removeMilestoneLocal])

  const updateMilestone = useCallback(async (
    id: string,
    updates: Partial<Pick<GoalMilestone, 'title' | 'description' | 'targetDate' | 'targetValue' | 'currentValue' | 'unit' | 'status' | 'sortOrder'>>
  ) => {
    updateMilestoneLocal(id, updates)

    const dbUpdates: Record<string, unknown> = {}
    if (updates.title !== undefined) dbUpdates.title = updates.title
    if (updates.description !== undefined) dbUpdates.description = updates.description ?? null
    if (updates.targetDate !== undefined) dbUpdates.target_date = updates.targetDate ?? null
    if (updates.targetValue !== undefined) dbUpdates.target_value = updates.targetValue ?? null
    if (updates.currentValue !== undefined) dbUpdates.current_value = updates.currentValue
    if (updates.unit !== undefined) dbUpdates.unit = updates.unit ?? null
    if (updates.status !== undefined) dbUpdates.status = updates.status
    if (updates.sortOrder !== undefined) dbUpdates.sort_order = updates.sortOrder

    await supabase.from('goal_milestones').update(dbUpdates).eq('id', id)
  }, [updateMilestoneLocal])

  const updateProgress = useCallback(async (id: string, currentValue: number, milestoneTargetValue?: number) => {
    const updates: Partial<Pick<GoalMilestone, 'currentValue' | 'status'>> = { currentValue }

    // Auto-achieve if target met
    if (milestoneTargetValue != null && currentValue >= milestoneTargetValue) {
      updates.status = 'achieved' as MilestoneStatus
    } else if (currentValue > 0) {
      updates.status = 'in_progress' as MilestoneStatus
    }

    await updateMilestone(id, updates)
  }, [updateMilestone])

  const deleteMilestone = useCallback(async (id: string) => {
    removeMilestoneLocal(id)
    await supabase.from('goal_milestones').delete().eq('id', id)
  }, [removeMilestoneLocal])

  return {
    addMilestone,
    updateMilestone,
    updateProgress,
    deleteMilestone,
  }
}
