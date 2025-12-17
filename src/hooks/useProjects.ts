import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Project, DbProject, ProjectStatus } from '@/types/project'
import type { Task } from '@/types/task'

/**
 * Calculate what status a project should have based on its tasks.
 * Returns the calculated status, but callers should respect manual overrides.
 */
export function calculateProjectStatus(tasks: Task[]): ProjectStatus {
  if (tasks.length === 0) return 'not_started'

  const completed = tasks.filter(t => t.completed).length
  const total = tasks.length

  if (completed === 0) return 'not_started'
  if (completed === total) return 'completed'
  return 'in_progress'
}

function dbProjectToProject(dbProject: DbProject): Project {
  return {
    id: dbProject.id,
    name: dbProject.name,
    status: dbProject.status,
    notes: dbProject.notes ?? undefined,
    parentId: dbProject.parent_id ?? undefined,
    createdAt: new Date(dbProject.created_at),
    updatedAt: new Date(dbProject.updated_at),
  }
}

export function useProjects() {
  const { user } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch projects on mount and when user changes
  useEffect(() => {
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing on auth change is valid
      setProjects([])
      setLoading(false)
      return
    }

    async function fetchProjects() {
      if (!user) return

      setLoading(true)
      setError(null)

      // RLS policies handle household sharing - no need to filter by user_id
      const { data, error: fetchError } = await supabase
        .from('projects')
        .select('*')
        .order('name', { ascending: true })

      if (fetchError) {
        setError(fetchError.message)
        setLoading(false)
        return
      }

      setProjects((data as DbProject[]).map(dbProjectToProject))
      setLoading(false)
    }

    fetchProjects()
  }, [user])

  const addProject = useCallback(async (project: { name: string; notes?: string; parentId?: string }) => {
    if (!user) return null

    // Optimistic update
    const tempId = crypto.randomUUID()
    const optimisticProject: Project = {
      id: tempId,
      name: project.name,
      status: 'not_started',
      notes: project.notes,
      parentId: project.parentId,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    setProjects((prev) => [...prev, optimisticProject].sort((a, b) => a.name.localeCompare(b.name)))

    const { data, error: insertError } = await supabase
      .from('projects')
      .insert({
        user_id: user.id,
        name: project.name,
        notes: project.notes ?? null,
        parent_id: project.parentId ?? null,
      })
      .select()
      .single()

    if (insertError) {
      // Rollback on error
      setProjects((prev) => prev.filter((p) => p.id !== tempId))
      setError(insertError.message)
      return null
    }

    // Replace optimistic project with real one
    const realProject = dbProjectToProject(data as DbProject)
    setProjects((prev) =>
      prev.map((p) => (p.id === tempId ? realProject : p)).sort((a, b) => a.name.localeCompare(b.name))
    )

    return realProject
  }, [user])

  const updateProject = useCallback(async (id: string, updates: Partial<Project>) => {
    const project = projects.find((p) => p.id === id)
    if (!project) return

    // Optimistic update
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updates } : p)).sort((a, b) => a.name.localeCompare(b.name))
    )

    // Convert Project updates to DB format
    const dbUpdates: Record<string, unknown> = {}
    if (updates.name !== undefined) dbUpdates.name = updates.name
    if (updates.status !== undefined) dbUpdates.status = updates.status
    if (updates.notes !== undefined) dbUpdates.notes = updates.notes ?? null
    if (updates.parentId !== undefined) dbUpdates.parent_id = updates.parentId ?? null

    const { error: updateError } = await supabase
      .from('projects')
      .update(dbUpdates)
      .eq('id', id)

    if (updateError) {
      // Rollback on error
      setProjects((prev) =>
        prev.map((p) => (p.id === id ? project : p))
      )
      setError(updateError.message)
    }
  }, [projects])

  const deleteProject = useCallback(async (id: string) => {
    // Save for rollback
    const projectToDelete = projects.find((p) => p.id === id)
    if (!projectToDelete) return

    // Optimistic update
    setProjects((prev) => prev.filter((p) => p.id !== id))

    const { error: deleteError } = await supabase
      .from('projects')
      .delete()
      .eq('id', id)

    if (deleteError) {
      // Rollback on error
      setProjects((prev) => [...prev, projectToDelete].sort((a, b) => a.name.localeCompare(b.name)))
      setError(deleteError.message)
    }
  }, [projects])

  // Search projects by name (case-insensitive)
  const searchProjects = useCallback((query: string): Project[] => {
    if (!query.trim()) return projects
    const lowerQuery = query.toLowerCase()
    return projects.filter((p) => p.name.toLowerCase().includes(lowerQuery))
  }, [projects])

  // Get project by ID
  const getProjectById = useCallback((id: string): Project | undefined => {
    return projects.find((p) => p.id === id)
  }, [projects])

  // Get active projects (not completed)
  const activeProjects = useMemo(() => {
    return projects.filter((p) => p.status !== 'completed')
  }, [projects])

  // Get child projects for a given parent
  const getChildProjects = useCallback((parentId: string): Project[] => {
    return projects.filter((p) => p.parentId === parentId)
  }, [projects])

  // Create a projects map for efficient lookup
  const projectsMap = useMemo(() => {
    const map = new Map<string, Project>()
    for (const project of projects) {
      map.set(project.id, project)
    }
    return map
  }, [projects])

  /**
   * Recalculate and update a project's status based on its tasks.
   * Only auto-updates if current status is 'not_started' or 'in_progress'.
   * If user has manually set 'on_hold' or 'completed', it won't be overwritten.
   */
  const recalculateProjectStatus = useCallback(async (projectId: string, projectTasks: Task[]) => {
    const project = projects.find((p) => p.id === projectId)
    if (!project) return

    // Don't auto-update if user has manually set to on_hold or completed
    if (project.status === 'on_hold' || project.status === 'completed') {
      return
    }

    const calculatedStatus = calculateProjectStatus(projectTasks)

    // Only update if status actually changed
    if (calculatedStatus !== project.status) {
      await updateProject(projectId, { status: calculatedStatus })
    }
  }, [projects, updateProject])

  return {
    projects,
    projectsMap,
    activeProjects,
    loading,
    error,
    addProject,
    updateProject,
    deleteProject,
    searchProjects,
    getProjectById,
    getChildProjects,
    recalculateProjectStatus,
  }
}
