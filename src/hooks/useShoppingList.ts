import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { ListItem, DbListItem } from '../types/list'

interface UseShoppingListResult {
  items: ListItem[]
  loading: boolean
  error: string | null
  toggleComplete: (id: string, completed: boolean) => Promise<void>
  refresh: () => Promise<void>
}

function rowToItem(row: DbListItem): ListItem {
  return {
    id: row.id,
    listId: row.list_id,
    text: row.text,
    note: row.note ?? undefined,
    sortOrder: row.sort_order,
    externalId: row.external_id ?? undefined,
    externalSource: row.external_source ?? undefined,
    completed: row.completed,
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

export function useShoppingList(appleListName: string): UseShoppingListResult {
  const [items, setItems] = useState<ListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    // Resolve list id by external_id (the Apple list name)
    const { data: lists, error: lerr } = await supabase
      .from('lists')
      .select('id')
      .eq('external_source', 'apple_reminders')
      .eq('external_id', appleListName)
    if (lerr || !lists || lists.length === 0) {
      setError(lerr?.message ?? `list "${appleListName}" not found`)
      setLoading(false)
      return
    }
    const listId = lists[0].id

    const { data: rows, error: ierr } = await supabase
      .from('list_items')
      .select('*')
      .eq('list_id', listId)
      .order('sort_order', { ascending: true })

    if (ierr) {
      setError(ierr.message)
      setLoading(false)
      return
    }
    setItems((rows ?? []).map(rowToItem))
    setLoading(false)
  }, [appleListName])

  const toggleComplete = useCallback(async (id: string, completed: boolean) => {
    const { error: uerr } = await supabase
      .from('list_items')
      .update({
        completed,
        completed_at: completed ? new Date().toISOString() : null,
      })
      .eq('id', id)
    if (uerr) {
      setError(uerr.message)
      return
    }
    // Optimistic local update
    setItems(prev => prev.map(i => i.id === id
      ? { ...i, completed, completedAt: completed ? new Date() : undefined }
      : i
    ))
  }, [])

  useEffect(() => { refresh() }, [refresh])

  return { items, loading, error, toggleComplete, refresh }
}
