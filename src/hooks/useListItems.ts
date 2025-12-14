import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { ListItem, DbListItem } from '@/types/list'

function dbListItemToListItem(dbItem: DbListItem): ListItem {
  return {
    id: dbItem.id,
    listId: dbItem.list_id,
    text: dbItem.text,
    note: dbItem.note ?? undefined,
    isChecked: dbItem.is_checked,
    sortOrder: dbItem.sort_order,
    createdAt: new Date(dbItem.created_at),
    updatedAt: new Date(dbItem.updated_at),
  }
}

export function useListItems(listId: string | null) {
  const { user } = useAuth()
  const [items, setItems] = useState<ListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch items when listId changes
  useEffect(() => {
    if (!user || !listId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing on dependency change is valid
      setItems([])
      setLoading(false)
      return
    }

    async function fetchItems() {
      if (!user || !listId) return

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
    }

    fetchItems()
  }, [user, listId])

  const addItem = useCallback(async (item: {
    text: string
    note?: string
  }) => {
    if (!user || !listId) return null

    // Determine next sort order
    const maxSortOrder = items.length > 0 ? Math.max(...items.map((i) => i.sortOrder)) : 0

    // Optimistic update
    const tempId = crypto.randomUUID()
    const optimisticItem: ListItem = {
      id: tempId,
      listId,
      text: item.text,
      note: item.note,
      isChecked: false,
      sortOrder: maxSortOrder + 1,
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

    // Optimistic update
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, ...updates, updatedAt: new Date() } : i))
    )

    // Convert ListItem updates to DB format
    const dbUpdates: Record<string, unknown> = {}
    if (updates.text !== undefined) dbUpdates.text = updates.text
    if (updates.note !== undefined) dbUpdates.note = updates.note ?? null
    if (updates.isChecked !== undefined) dbUpdates.is_checked = updates.isChecked
    if (updates.sortOrder !== undefined) dbUpdates.sort_order = updates.sortOrder

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

  // Toggle item checked state
  const toggleItem = useCallback(async (id: string) => {
    const item = items.find((i) => i.id === id)
    if (!item) return

    const newCheckedState = !item.isChecked

    // Optimistic update
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, isChecked: newCheckedState, updatedAt: new Date() } : i))
    )

    const { error: updateError } = await supabase
      .from('list_items')
      .update({ is_checked: newCheckedState })
      .eq('id', id)

    if (updateError) {
      // Rollback on error
      setItems((prev) =>
        prev.map((i) => (i.id === id ? item : i))
      )
      setError(updateError.message)
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

  // Item counts
  const itemCount = items.length
  const checkedCount = useMemo(() => items.filter((i) => i.isChecked).length, [items])
  const uncheckedCount = useMemo(() => items.filter((i) => !i.isChecked).length, [items])

  return {
    items,
    itemsMap,
    itemCount,
    checkedCount,
    uncheckedCount,
    loading,
    error,
    addItem,
    updateItem,
    deleteItem,
    toggleItem,
    reorderItems,
    searchItems,
    getItemById,
  }
}
