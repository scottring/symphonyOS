import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { ResearchWorkspace, CreateWorkspaceInput, UpdateWorkspaceInput } from '@/types/planning'

function rowToWorkspace(row: Record<string, unknown>): ResearchWorkspace {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description || null) as string | null,
    status: (row.status || 'active') as ResearchWorkspace['status'],
    lastSynthesizedAt: (row.last_synthesized_at || null) as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export function useResearchWorkspaces() {
  const [workspaces, setWorkspaces] = useState<ResearchWorkspace[]>([])
  const [loading, setLoading] = useState(true)

  const fetchWorkspaces = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setWorkspaces([]); setLoading(false); return }

    const { data, error } = await supabase
      .from('research_workspaces')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) { console.error('fetchWorkspaces:', error); setLoading(false); return }
    setWorkspaces((data || []).map(rowToWorkspace))
    setLoading(false)
  }, [])

  const addWorkspace = useCallback(async (input: CreateWorkspaceInput) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await supabase
      .from('research_workspaces')
      .insert({
        user_id: user.id,
        name: input.name,
        description: input.description || null,
      })
      .select()
      .single()

    if (error) { console.error('addWorkspace:', error); return null }
    const workspace = rowToWorkspace(data)
    setWorkspaces(prev => [workspace, ...prev])
    return workspace
  }, [])

  const updateWorkspace = useCallback(async (id: string, updates: UpdateWorkspaceInput) => {
    const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (updates.name !== undefined) dbUpdates.name = updates.name
    if (updates.description !== undefined) dbUpdates.description = updates.description
    if (updates.status !== undefined) dbUpdates.status = updates.status

    const { error } = await supabase
      .from('research_workspaces')
      .update(dbUpdates)
      .eq('id', id)

    if (error) { console.error('updateWorkspace:', error); return }
    setWorkspaces(prev => prev.map(w => w.id === id ? { ...w, ...updates, updatedAt: new Date().toISOString() } : w))
  }, [])

  const deleteWorkspace = useCallback(async (id: string) => {
    const { error } = await supabase.from('research_workspaces').delete().eq('id', id)
    if (error) { console.error('deleteWorkspace:', error); return }
    setWorkspaces(prev => prev.filter(w => w.id !== id))
  }, [])

  const markSynthesized = useCallback(async (id: string) => {
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('research_workspaces')
      .update({ status: 'synthesized', last_synthesized_at: now, updated_at: now })
      .eq('id', id)

    if (error) { console.error('markSynthesized:', error); return }
    setWorkspaces(prev => prev.map(w => w.id === id ? { ...w, status: 'synthesized' as const, lastSynthesizedAt: now, updatedAt: now } : w))
  }, [])

  useEffect(() => { fetchWorkspaces() }, [fetchWorkspaces])

  return { workspaces, loading, addWorkspace, updateWorkspace, deleteWorkspace, markSynthesized, fetchWorkspaces }
}
