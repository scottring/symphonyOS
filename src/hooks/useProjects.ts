import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { Project, DbProject } from '@/types/project'

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
      setProjects([])
      setLoading(false)
      return
    }

    async function fetchProjects() {
      if (!user) return

      setLoading(true)
      setError(null)

      const { data, error: fetchError } = await supabase
        .from('projects')
        .select('*')
        .eq('user_id', user.id)
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
  }
}
