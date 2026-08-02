import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { ListItem, DbListItem } from '@/types/list'

export function dbListItemToListItem(dbItem: DbListItem): ListItem {
  return {
    id: dbItem.id,
    listId: dbItem.list_id,
    text: dbItem.text,
    note: dbItem.note ?? undefined,
    sortOrder: dbItem.sort_order,
    externalId: dbItem.external_id ?? undefined,
    externalSource: dbItem.external_source ?? undefined,
    completed: dbItem.completed,
    completedAt: dbItem.completed_at ? new Date(dbItem.completed_at) : undefined,
    parentItemId: dbItem.parent_item_id ?? undefined,
    createdAt: new Date(dbItem.created_at),
    updatedAt: new Date(dbItem.updated_at),
  }
}

export function useListItems(listId: string | null) {
  const { user } = useAuth()
  const [items, setItems] = useState<ListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchItems = useCallback(async () => {
    if (!user || !listId) {
      setItems([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('list_items')
      .select('*')
      .eq('list_id', listId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (fetchError) {
      setError(fetchError.message)
      setLoading(false)
      return
    }

    setItems((data as DbListItem[]).map(dbListItemToListItem))
    setLoading(false)
  }, [user, listId])

  // Fetch on mount and whenever the user or list changes.
  useEffect(() => {
    void fetchItems()
  }, [fetchItems])

  const addItem = useCallback(async (item: {
    text: string
    note?: string
    parentItemId?: string
  }) => {
    if (!user || !listId) return null

    // Sort order is scoped to siblings (same parent), so subitems sort
    // independently of top-level items.
    const siblings = items.filter((i) => i.parentItemId === item.parentItemId)
    const maxSortOrder = siblings.length > 0 ? Math.max(...siblings.map((i) => i.sortOrder)) : 0

    // Optimistic update
    const tempId = crypto.randomUUID()
    const optimisticItem: ListItem = {
      id: tempId,
      listId,
      text: item.text,
      note: item.note,
      sortOrder: maxSortOrder + 1,
      completed: false,
      parentItemId: item.parentItemId,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    setItems((prev) => [...prev, optimisticItem])

    const { data, error: insertError } = await supabase
      .from('list_items')
      .insert({
        user_id: user.id,
        list_id: listId,
        text: item.text,
        note: item.note ?? null,
        sort_order: maxSortOrder + 1,
        parent_item_id: item.parentItemId ?? null,
      })
      .select()
      .single()

    if (insertError) {
      // Rollback on error
      setItems((prev) => prev.filter((i) => i.id !== tempId))
      setError(insertError.message)
      return null
    }

    // Replace optimistic item with real one
    const realItem = dbListItemToListItem(data as DbListItem)
    setItems((prev) => prev.map((i) => (i.id === tempId ? realItem : i)))

    return realItem
  }, [user, listId, items])

  const updateItem = useCallback(async (id: string, updates: Partial<ListItem>) => {
    const item = items.find((i) => i.id === id)
    if (!item) return

    // Optimistic update — derive completedAt from completed if caller didn't supply it
    const optimisticUpdates: Partial<ListItem> = { ...updates }
    if (updates.completed !== undefined && updates.completedAt === undefined) {
      optimisticUpdates.completedAt = updates.completed ? new Date() : undefined
    }
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, ...optimisticUpdates, updatedAt: new Date() } : i))
    )

    // Convert ListItem updates to DB format
    const dbUpdates: Record<string, unknown> = {}
    if (updates.text !== undefined) dbUpdates.text = updates.text
    if (updates.note !== undefined) dbUpdates.note = updates.note ?? null
    if (updates.sortOrder !== undefined) dbUpdates.sort_order = updates.sortOrder
    if (updates.parentItemId !== undefined) dbUpdates.parent_item_id = updates.parentItemId ?? null
    if (updates.completed !== undefined) {
      dbUpdates.completed = updates.completed
      dbUpdates.completed_at = updates.completed ? new Date().toISOString() : null
    }

    const { error: updateError } = await supabase
      .from('list_items')
      .update(dbUpdates)
      .eq('id', id)

    if (updateError) {
      // Rollback on error
      setItems((prev) => prev.map((i) => (i.id === id ? item : i)))
      setError(updateError.message)
    }
  }, [items])

  const deleteItem = useCallback(async (id: string) => {
    // Save for rollback
    const itemToDelete = items.find((i) => i.id === id)
    if (!itemToDelete) return

    // Optimistic update
    setItems((prev) => prev.filter((i) => i.id !== id))

    const { error: deleteError } = await supabase
      .from('list_items')
      .delete()
      .eq('id', id)

    if (deleteError) {
      // Rollback on error
      setItems((prev) => [...prev, itemToDelete].sort((a, b) => a.sortOrder - b.sortOrder))
      setError(deleteError.message)
    }
  }, [items])

  // Clear all checked-off items — the "done shopping" action. Deletes propagate
  // to Apple Reminders via the reminders bridge.
  const clearCompleted = useCallback(async () => {
    if (!listId) return
    const completed = items.filter((i) => i.completed)
    if (completed.length === 0) return
    const ids = completed.map((i) => i.id)

    // Optimistic remove
    setItems((prev) => prev.filter((i) => !i.completed))

    const { error: deleteError } = await supabase
      .from('list_items')
      .delete()
      .in('id', ids)

    if (deleteError) {
      // Rollback on error
      setItems((prev) => [...prev, ...completed].sort((a, b) => a.sortOrder - b.sortOrder))
      setError(deleteError.message)
    }
  }, [listId, items])

  // Reorder items (update sort_order)
  const reorderItems = useCallback(async (itemIds: string[]) => {
    const originalItems = [...items]

    // Optimistic update - reorder based on new array order
    setItems((prev) => {
      const reordered = itemIds.map((id, index) => {
        const item = prev.find((i) => i.id === id)
        return item ? { ...item, sortOrder: index } : null
      }).filter((i): i is ListItem => i !== null)

      // Keep any items not in the reorder array
      const notReordered = prev.filter((i) => !itemIds.includes(i.id))
      return [...reordered, ...notReordered]
    })

    // Update each item's sort_order in DB
    const updates = itemIds.map((id, index) => ({
      id,
      sort_order: index,
    }))

    for (const update of updates) {
      const { error: updateError } = await supabase
        .from('list_items')
        .update({ sort_order: update.sort_order })
        .eq('id', update.id)

      if (updateError) {
        // Rollback on error
        setItems(originalItems)
        setError(updateError.message)
        return
      }
    }
  }, [items])

  // Search items by text (case-insensitive)
  const searchItems = useCallback((query: string): ListItem[] => {
    if (!query.trim()) return items
    const lowerQuery = query.toLowerCase()
    return items.filter((i) =>
      i.text.toLowerCase().includes(lowerQuery) ||
      (i.note && i.note.toLowerCase().includes(lowerQuery))
    )
  }, [items])

  // Get item by ID
  const getItemById = useCallback((id: string): ListItem | undefined => {
    return items.find((i) => i.id === id)
  }, [items])

  // Create items map for efficient lookup
  const itemsMap = useMemo(() => {
    const map = new Map<string, ListItem>()
    for (const item of items) {
      map.set(item.id, item)
    }
    return map
  }, [items])

  // Item count
  const itemCount = items.length

  return {
    items,
    itemsMap,
    itemCount,
    loading,
    error,
    refetch: fetchItems,
    addItem,
    updateItem,
    deleteItem,
    clearCompleted,
    reorderItems,
    searchItems,
    getItemById,
  }
}
