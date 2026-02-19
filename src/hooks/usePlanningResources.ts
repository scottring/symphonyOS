import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { PlanningResource, CreatePlanningResourceInput, UpdatePlanningResourceInput } from '@/types/planning'

function rowToResource(row: Record<string, unknown>): PlanningResource {
  return {
    id: row.id as string,
    title: row.title as string,
    content: row.content as string | null,
    resourceType: (row.resource_type || 'note') as PlanningResource['resourceType'],
    sourceUrl: row.source_url as string | null,
    filePath: row.file_path as string | null,
    fileName: row.file_name as string | null,
    fileType: row.file_type as string | null,
    fileSize: row.file_size as number | null,
    tags: (row.tags || []) as string[],
    sortOrder: (row.sort_order || 0) as number,
    workspaceId: (row.workspace_id || null) as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'image/png', 'image/jpeg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv', 'text/plain',
]
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

export function usePlanningResources() {
  const [resources, setResources] = useState<PlanningResource[]>([])
  const [loading, setLoading] = useState(true)

  const fetchResources = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setResources([]); setLoading(false); return }

    const { data, error } = await supabase
      .from('planning_resources')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) { console.error('fetchResources:', error); setLoading(false); return }
    setResources((data || []).map(rowToResource))
    setLoading(false)
  }, [])

  const addResource = useCallback(async (input: CreatePlanningResourceInput) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await supabase
      .from('planning_resources')
      .insert({
        user_id: user.id,
        title: input.title,
        content: input.content || null,
        resource_type: input.resourceType || 'note',
        source_url: input.sourceUrl || null,
        tags: input.tags || [],
        workspace_id: input.workspaceId || null,
      })
      .select()
      .single()

    if (error) { console.error('addResource:', error); return null }
    const newResource = rowToResource(data)
    setResources(prev => [newResource, ...prev])
    return newResource
  }, [])

  const updateResource = useCallback(async (id: string, updates: UpdatePlanningResourceInput) => {
    const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (updates.title !== undefined) dbUpdates.title = updates.title
    if (updates.content !== undefined) dbUpdates.content = updates.content
    if (updates.sourceUrl !== undefined) dbUpdates.source_url = updates.sourceUrl
    if (updates.tags !== undefined) dbUpdates.tags = updates.tags
    if (updates.workspaceId !== undefined) dbUpdates.workspace_id = updates.workspaceId

    const { error } = await supabase
      .from('planning_resources')
      .update(dbUpdates)
      .eq('id', id)

    if (error) { console.error('updateResource:', error); return }
    setResources(prev => prev.map(r => r.id === id ? { ...r, ...updates, updatedAt: new Date().toISOString() } : r))
  }, [])

  const deleteResource = useCallback(async (id: string) => {
    // If it has a file, remove from storage first
    const resource = resources.find(r => r.id === id)
    if (resource?.filePath) {
      await supabase.storage.from('planning').remove([resource.filePath])
    }

    const { error } = await supabase.from('planning_resources').delete().eq('id', id)
    if (error) { console.error('deleteResource:', error); return }
    setResources(prev => prev.filter(r => r.id !== id))
  }, [resources])

  const uploadFile = useCallback(async (resourceId: string, file: File) => {
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      console.error('File type not allowed:', file.type)
      return null
    }
    if (file.size > MAX_FILE_SIZE) {
      console.error('File too large:', file.size)
      return null
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${user.id}/${resourceId}/${timestamp}_${safeName}`

    const { error: uploadError } = await supabase.storage
      .from('planning')
      .upload(storagePath, file)

    if (uploadError) { console.error('uploadFile:', uploadError); return null }

    // Update the resource with file metadata
    const { error: updateError } = await supabase
      .from('planning_resources')
      .update({
        file_path: storagePath,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        resource_type: 'upload',
        updated_at: new Date().toISOString(),
      })
      .eq('id', resourceId)

    if (updateError) { console.error('updateFile:', updateError); return null }

    setResources(prev => prev.map(r => r.id === resourceId ? {
      ...r,
      filePath: storagePath,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      resourceType: 'upload' as const,
    } : r))

    return storagePath
  }, [])

  const getSignedUrl = useCallback(async (filePath: string) => {
    const { data, error } = await supabase.storage
      .from('planning')
      .createSignedUrl(filePath, 3600) // 1 hour

    if (error) { console.error('getSignedUrl:', error); return null }
    return data.signedUrl
  }, [])

  useEffect(() => { fetchResources() }, [fetchResources])

  return { resources, loading, addResource, updateResource, deleteResource, uploadFile, getSignedUrl, fetchResources }
}
