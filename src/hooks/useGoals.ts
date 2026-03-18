import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type {
  Goal, GoalAction, GoalArea, GoalMilestone, Quarter,
  DbGoal, DbGoalAction, DbGoalArea, DbGoalMilestone,
} from '@/types/goal'

// ============================================================================
// DB → Frontend mappers
// ============================================================================

function dbAreaToArea(db: DbGoalArea): GoalArea {
  return {
    id: db.id,
    name: db.name,
    sortOrder: db.sort_order,
    createdAt: new Date(db.created_at),
  }
}

function dbMilestoneToMilestone(db: DbGoalMilestone): GoalMilestone {
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

function dbGoalToGoal(db: DbGoal, actions: GoalAction[], milestones: GoalMilestone[]): Goal {
  return {
    id: db.id,
    areaId: db.area_id,
    name: db.name,
    year: db.year,
    notes: db.notes ?? undefined,
    strategy: db.strategy ?? undefined,
    domainSlug: db.domain_slug ?? undefined,
    layerId: db.layer_id ?? undefined,
    context: db.context as Goal['context'] ?? undefined,
    status: db.status,
    sortOrder: db.sort_order,
    actions: actions.filter(a => a.goalId === db.id),
    milestones: milestones.filter(m => m.goalId === db.id),
    createdAt: new Date(db.created_at),
    updatedAt: new Date(db.updated_at),
  }
}

function dbActionToAction(db: DbGoalAction): GoalAction {
  return {
    id: db.id,
    goalId: db.goal_id,
    description: db.description,
    quarter: db.quarter,
    completed: db.completed,
    notes: db.notes ?? undefined,
    projectId: db.project_id ?? undefined,
    sortOrder: db.sort_order,
    createdAt: new Date(db.created_at),
  }
}

// ============================================================================
// Hook
// ============================================================================

export function useGoals(year?: number) {
  const { user } = useAuth()
  const currentYear = year ?? new Date().getFullYear()

  const [areas, setAreas] = useState<GoalArea[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [allActions, setAllActions] = useState<GoalAction[]>([])
  const [allMilestones, setAllMilestones] = useState<GoalMilestone[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch all data on mount
  useEffect(() => {
    if (!user) {
      setAreas([])
      setGoals([])
      setAllActions([])
      setAllMilestones([])
      setLoading(false)
      return
    }

    async function fetchAll() {
      if (!user) return
      setLoading(true)
      setError(null)

      try {
        // Fetch areas, goals, actions, and milestones in parallel
        const [areasRes, goalsRes, actionsRes, milestonesRes] = await Promise.all([
          supabase.from('goal_areas').select('*').order('sort_order'),
          supabase.from('goals').select('*').eq('year', currentYear).order('sort_order'),
          supabase.from('goal_actions').select('*').order('sort_order'),
          supabase.from('goal_milestones').select('*').order('sort_order'),
        ])

        if (areasRes.error) throw areasRes.error
        if (goalsRes.error) throw goalsRes.error
        if (actionsRes.error) throw actionsRes.error
        if (milestonesRes.error) throw milestonesRes.error

        const mappedAreas = (areasRes.data as DbGoalArea[]).map(dbAreaToArea)
        const mappedActions = (actionsRes.data as DbGoalAction[]).map(dbActionToAction)
        const mappedMilestones = (milestonesRes.data as DbGoalMilestone[]).map(dbMilestoneToMilestone)

        // Filter actions/milestones to only include those belonging to fetched goals
        const goalIds = new Set((goalsRes.data as DbGoal[]).map(g => g.id))
        const relevantActions = mappedActions.filter(a => goalIds.has(a.goalId))
        const relevantMilestones = mappedMilestones.filter(m => goalIds.has(m.goalId))

        const mappedGoals = (goalsRes.data as DbGoal[]).map(db =>
          dbGoalToGoal(db, relevantActions, relevantMilestones)
        )

        setAreas(mappedAreas)
        setGoals(mappedGoals)
        setAllActions(relevantActions)
        setAllMilestones(relevantMilestones)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch goals')
      } finally {
        setLoading(false)
      }
    }

    fetchAll()
  }, [user, currentYear])

  // Rebuild goals when allActions/allMilestones changes (to keep in sync)
  const goalsWithData = useMemo(() => {
    return goals.map(g => ({
      ...g,
      actions: allActions.filter(a => a.goalId === g.id),
      milestones: allMilestones.filter(m => m.goalId === g.id),
    }))
  }, [goals, allActions, allMilestones])

  // ============================================================================
  // AREA CRUD
  // ============================================================================

  const addArea = useCallback(async (name: string) => {
    if (!user) return null

    const tempId = crypto.randomUUID()
    const optimistic: GoalArea = {
      id: tempId,
      name,
      sortOrder: areas.length,
      createdAt: new Date(),
    }
    setAreas(prev => [...prev, optimistic])

    const { data, error: insertError } = await supabase
      .from('goal_areas')
      .insert({ user_id: user.id, name, sort_order: areas.length })
      .select()
      .single()

    if (insertError) {
      setAreas(prev => prev.filter(a => a.id !== tempId))
      setError(insertError.message)
      return null
    }

    const real = dbAreaToArea(data as DbGoalArea)
    setAreas(prev => prev.map(a => a.id === tempId ? real : a))
    return real
  }, [user, areas.length])

  const updateArea = useCallback(async (id: string, updates: { name?: string; sortOrder?: number }) => {
    const area = areas.find(a => a.id === id)
    if (!area) return

    setAreas(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a))

    const dbUpdates: Record<string, unknown> = {}
    if (updates.name !== undefined) dbUpdates.name = updates.name
    if (updates.sortOrder !== undefined) dbUpdates.sort_order = updates.sortOrder

    const { error: updateError } = await supabase
      .from('goal_areas')
      .update(dbUpdates)
      .eq('id', id)

    if (updateError) {
      setAreas(prev => prev.map(a => a.id === id ? area : a))
      setError(updateError.message)
    }
  }, [areas])

  const deleteArea = useCallback(async (id: string) => {
    const areaToDelete = areas.find(a => a.id === id)
    if (!areaToDelete) return

    // Also remove goals in this area
    const goalsInArea = goals.filter(g => g.areaId === id)
    const goalIdsInArea = new Set(goalsInArea.map(g => g.id))

    setAreas(prev => prev.filter(a => a.id !== id))
    setGoals(prev => prev.filter(g => g.areaId !== id))
    setAllActions(prev => prev.filter(a => !goalIdsInArea.has(a.goalId)))

    const { error: deleteError } = await supabase
      .from('goal_areas')
      .delete()
      .eq('id', id)

    if (deleteError) {
      setAreas(prev => [...prev, areaToDelete])
      setGoals(prev => [...prev, ...goalsInArea])
      setError(deleteError.message)
    }
  }, [areas, goals])

  // ============================================================================
  // GOAL CRUD
  // ============================================================================

  const addGoal = useCallback(async (areaId: string, name: string, context?: 'work' | 'family' | 'personal') => {
    if (!user) return null

    const tempId = crypto.randomUUID()
    const optimistic: Goal = {
      id: tempId,
      areaId,
      name,
      year: currentYear,
      context: context ?? undefined,
      status: 'active',
      sortOrder: goals.filter(g => g.areaId === areaId).length,
      actions: [],
      milestones: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    setGoals(prev => [...prev, optimistic])

    const { data, error: insertError } = await supabase
      .from('goals')
      .insert({
        user_id: user.id,
        area_id: areaId,
        name,
        year: currentYear,
        sort_order: optimistic.sortOrder,
        context: context ?? null,
      })
      .select()
      .single()

    if (insertError) {
      setGoals(prev => prev.filter(g => g.id !== tempId))
      setError(insertError.message)
      return null
    }

    const real = dbGoalToGoal(data as DbGoal, [], [])
    setGoals(prev => prev.map(g => g.id === tempId ? real : g))
    return real
  }, [user, currentYear, goals])

  const updateGoal = useCallback(async (id: string, updates: Partial<Pick<Goal, 'name' | 'notes' | 'status' | 'areaId' | 'sortOrder' | 'strategy' | 'domainSlug' | 'layerId' | 'context'>>) => {
    const goal = goals.find(g => g.id === id)
    if (!goal) return

    setGoals(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g))

    const dbUpdates: Record<string, unknown> = {}
    if (updates.name !== undefined) dbUpdates.name = updates.name
    if (updates.notes !== undefined) dbUpdates.notes = updates.notes ?? null
    if (updates.status !== undefined) dbUpdates.status = updates.status
    if (updates.areaId !== undefined) dbUpdates.area_id = updates.areaId
    if (updates.sortOrder !== undefined) dbUpdates.sort_order = updates.sortOrder
    if (updates.strategy !== undefined) dbUpdates.strategy = updates.strategy ?? null
    if (updates.domainSlug !== undefined) dbUpdates.domain_slug = updates.domainSlug ?? null
    if (updates.layerId !== undefined) dbUpdates.layer_id = updates.layerId ?? null
    if (updates.context !== undefined) dbUpdates.context = updates.context ?? null

    const { error: updateError } = await supabase
      .from('goals')
      .update(dbUpdates)
      .eq('id', id)

    if (updateError) {
      setGoals(prev => prev.map(g => g.id === id ? goal : g))
      setError(updateError.message)
    }
  }, [goals])

  const deleteGoal = useCallback(async (id: string) => {
    const goalToDelete = goals.find(g => g.id === id)
    if (!goalToDelete) return

    const actionsToDelete = allActions.filter(a => a.goalId === id)

    setGoals(prev => prev.filter(g => g.id !== id))
    setAllActions(prev => prev.filter(a => a.goalId !== id))

    const { error: deleteError } = await supabase
      .from('goals')
      .delete()
      .eq('id', id)

    if (deleteError) {
      setGoals(prev => [...prev, goalToDelete])
      setAllActions(prev => [...prev, ...actionsToDelete])
      setError(deleteError.message)
    }
  }, [goals, allActions])

  // ============================================================================
  // ACTION CRUD
  // ============================================================================

  const addAction = useCallback(async (goalId: string, description: string, quarter: Quarter) => {
    const tempId = crypto.randomUUID()
    const existing = allActions.filter(a => a.goalId === goalId && a.quarter === quarter)
    const optimistic: GoalAction = {
      id: tempId,
      goalId,
      description,
      quarter,
      completed: false,
      sortOrder: existing.length,
      createdAt: new Date(),
    }
    setAllActions(prev => [...prev, optimistic])

    const { data, error: insertError } = await supabase
      .from('goal_actions')
      .insert({
        goal_id: goalId,
        description,
        quarter,
        sort_order: optimistic.sortOrder,
      })
      .select()
      .single()

    if (insertError) {
      setAllActions(prev => prev.filter(a => a.id !== tempId))
      setError(insertError.message)
      return null
    }

    const real = dbActionToAction(data as DbGoalAction)
    setAllActions(prev => prev.map(a => a.id === tempId ? real : a))
    return real
  }, [allActions])

  const updateAction = useCallback(async (id: string, updates: Partial<Pick<GoalAction, 'description' | 'completed' | 'notes' | 'sortOrder'>>) => {
    const action = allActions.find(a => a.id === id)
    if (!action) return

    setAllActions(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a))

    const dbUpdates: Record<string, unknown> = {}
    if (updates.description !== undefined) dbUpdates.description = updates.description
    if (updates.completed !== undefined) dbUpdates.completed = updates.completed
    if (updates.notes !== undefined) dbUpdates.notes = updates.notes ?? null
    if (updates.sortOrder !== undefined) dbUpdates.sort_order = updates.sortOrder

    const { error: updateError } = await supabase
      .from('goal_actions')
      .update(dbUpdates)
      .eq('id', id)

    if (updateError) {
      setAllActions(prev => prev.map(a => a.id === id ? action : a))
      setError(updateError.message)
    }
  }, [allActions])

  const toggleAction = useCallback(async (id: string) => {
    const action = allActions.find(a => a.id === id)
    if (!action) return
    await updateAction(id, { completed: !action.completed })
  }, [allActions, updateAction])

  const deleteAction = useCallback(async (id: string) => {
    const actionToDelete = allActions.find(a => a.id === id)
    if (!actionToDelete) return

    setAllActions(prev => prev.filter(a => a.id !== id))

    const { error: deleteError } = await supabase
      .from('goal_actions')
      .delete()
      .eq('id', id)

    if (deleteError) {
      setAllActions(prev => [...prev, actionToDelete])
      setError(deleteError.message)
    }
  }, [allActions])

  // ============================================================================
  // Computed helpers
  // ============================================================================

  const getGoalsByArea = useCallback((areaId: string) => {
    return goalsWithData.filter(g => g.areaId === areaId)
  }, [goalsWithData])

  const getGoalById = useCallback((id: string) => {
    return goalsWithData.find(g => g.id === id)
  }, [goalsWithData])

  const getCurrentQuarter = useCallback((): Quarter => {
    const month = new Date().getMonth() // 0-indexed
    if (month < 3) return 'Q1'
    if (month < 6) return 'Q2'
    if (month < 9) return 'Q3'
    return 'Q4'
  }, [])

  // Allow external updates to milestones (used by useGoalMilestones)
  const addMilestoneLocal = useCallback((milestone: GoalMilestone) => {
    setAllMilestones(prev => [...prev, milestone])
  }, [])

  const updateMilestoneLocal = useCallback((id: string, updates: Partial<GoalMilestone>) => {
    setAllMilestones(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m))
  }, [])

  const removeMilestoneLocal = useCallback((id: string) => {
    setAllMilestones(prev => prev.filter(m => m.id !== id))
  }, [])

  return {
    areas,
    goals: goalsWithData,
    loading,
    error,
    // Area CRUD
    addArea,
    updateArea,
    deleteArea,
    // Goal CRUD
    addGoal,
    updateGoal,
    deleteGoal,
    // Action CRUD
    addAction,
    updateAction,
    toggleAction,
    deleteAction,
    // Milestone state helpers (for useGoalMilestones)
    addMilestoneLocal,
    updateMilestoneLocal,
    removeMilestoneLocal,
    // Helpers
    getGoalsByArea,
    getGoalById,
    getCurrentQuarter,
  }
}
