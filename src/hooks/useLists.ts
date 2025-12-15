import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { List, DbList, ListCategory, ListVisibility } from '@/types/list'

function dbListToList(dbList: DbList): List {
  return {
    id: dbList.id,
    title: dbList.title,
    icon: dbList.icon ?? undefined,
    category: dbList.category,
    visibility: dbList.visibility,
    hiddenFrom: dbList.hidden_from ?? undefined,
    projectId: dbList.project_id ?? undefined,
    isTemplate: dbList.is_template,
    sortOrder: dbList.sort_order,
    createdAt: new Date(dbList.created_at),
    updatedAt: new Date(dbList.updated_at),
  }
}

export function useLists() {
  const { user } = useAuth()
  const [lists, setLists] = useState<List[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch lists on mount and when user changes
  useEffect(() => {
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing on auth change is valid
      setLists([])
      setLoading(false)
      return
    }

    async function fetchLists() {
      if (!user) return

      setLoading(true)
      setError(null)

      // Fetch lists: own lists + family-visible lists (not hidden from this user)
      const { data, error: fetchError } = await supabase
        .from('lists')
        .select('*')
        .or(`user_id.eq.${user.id},and(visibility.eq.family,or(hidden_from.is.null,hidden_from.not.cs.{${user.id}}))`)
        .order('sort_order', { ascending: true })
        .order('title', { ascending: true })

      if (fetchError) {
        setError(fetchError.message)
        setLoading(false)
        return
      }

      setLists((data as DbList[]).map(dbListToList))
      setLoading(false)
    }

    fetchLists()
  }, [user])

  const addList = useCallback(async (list: {
    title: string
    icon?: string
    category?: ListCategory
    visibility?: ListVisibility
    hiddenFrom?: string[]
    projectId?: string
    isTemplate?: boolean
  }) => {
    if (!user) return null

    // Determine next sort order
    const maxSortOrder = lists.length > 0 ? Math.max(...lists.map((l) => l.sortOrder)) : 0

    // Optimistic update
    const tempId = crypto.randomUUID()
    const optimisticList: List = {
      id: tempId,
      title: list.title,
      icon: list.icon,
      category: list.category ?? 'other',
      visibility: list.visibility ?? 'self',
      hiddenFrom: list.hiddenFrom,
      projectId: list.projectId,
      isTemplate: list.isTemplate ?? false,
      sortOrder: maxSortOrder + 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    setLists((prev) => [...prev, optimisticList])

    const { data, error: insertError } = await supabase
      .from('lists')
      .insert({
        user_id: user.id,
        title: list.title,
        icon: list.icon ?? null,
        category: list.category ?? 'other',
        visibility: list.visibility ?? 'self',
        hidden_from: list.hiddenFrom ?? null,
        project_id: list.projectId ?? null,
        is_template: list.isTemplate ?? false,
        sort_order: maxSortOrder + 1,
      })
      .select()
      .single()

    if (insertError) {
      // Rollback on error
      setLists((prev) => prev.filter((l) => l.id !== tempId))
      setError(insertError.message)
      return null
    }

    // Replace optimistic list with real one
    const realList = dbListToList(data as DbList)
    setLists((prev) => prev.map((l) => (l.id === tempId ? realList : l)))

    return realList
  }, [user, lists])

  const updateList = useCallback(async (id: string, updates: Partial<List>) => {
    const list = lists.find((l) => l.id === id)
    if (!list) return

    // Optimistic update
    setLists((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...updates, updatedAt: new Date() } : l))
    )

    // Convert List updates to DB format
    const dbUpdates: Record<string, unknown> = {}
    if (updates.title !== undefined) dbUpdates.title = updates.title
    if (updates.icon !== undefined) dbUpdates.icon = updates.icon ?? null
    if (updates.category !== undefined) dbUpdates.category = updates.category
    if (updates.visibility !== undefined) dbUpdates.visibility = updates.visibility
    if (updates.hiddenFrom !== undefined) dbUpdates.hidden_from = updates.hiddenFrom ?? null
    if (updates.projectId !== undefined) dbUpdates.project_id = updates.projectId ?? null
    if (updates.isTemplate !== undefined) dbUpdates.is_template = updates.isTemplate
    if (updates.sortOrder !== undefined) dbUpdates.sort_order = updates.sortOrder

    const { error: updateError } = await supabase
      .from('lists')
      .update(dbUpdates)
      .eq('id', id)

    if (updateError) {
      // Rollback on error
      setLists((prev) => prev.map((l) => (l.id === id ? list : l)))
      setError(updateError.message)
    }
  }, [lists])

  const deleteList = useCallback(async (id: string) => {
    // Save for rollback
    const listToDelete = lists.find((l) => l.id === id)
    if (!listToDelete) return

    // Optimistic update
    setLists((prev) => prev.filter((l) => l.id !== id))

    const { error: deleteError } = await supabase
      .from('lists')
      .delete()
      .eq('id', id)

    if (deleteError) {
      // Rollback on error
      setLists((prev) => [...prev, listToDelete])
      setError(deleteError.message)
    }
  }, [lists])

  // Reorder lists (update sort_order)
  const reorderLists = useCallback(async (listIds: string[]) => {
    const originalLists = [...lists]

    // Optimistic update - reorder based on new array order
    setLists((prev) => {
      const reordered = listIds.map((id, index) => {
        const list = prev.find((l) => l.id === id)
        return list ? { ...list, sortOrder: index } : null
      }).filter((l): l is List => l !== null)

      // Keep any lists not in the reorder array
      const notReordered = prev.filter((l) => !listIds.includes(l.id))
      return [...reordered, ...notReordered]
    })

    // Update each list's sort_order in DB
    const updates = listIds.map((id, index) => ({
      id,
      sort_order: index,
    }))

    for (const update of updates) {
      const { error: updateError } = await supabase
        .from('lists')
        .update({ sort_order: update.sort_order })
        .eq('id', update.id)

      if (updateError) {
        // Rollback on error
        setLists(originalLists)
        setError(updateError.message)
        return
      }
    }
  }, [lists])

  // Search lists by title (case-insensitive)
  const searchLists = useCallback((query: string): List[] => {
    if (!query.trim()) return lists
    const lowerQuery = query.toLowerCase()
    return lists.filter((l) => l.title.toLowerCase().includes(lowerQuery))
  }, [lists])

  // Get list by ID
  const getListById = useCallback((id: string): List | undefined => {
    return lists.find((l) => l.id === id)
  }, [lists])

  // Get lists by category
  const getListsByCategory = useCallback((category: ListCategory): List[] => {
    return lists.filter((l) => l.category === category)
  }, [lists])

  // Get lists by project ID
  const getListsByProject = useCallback((projectId: string): List[] => {
    return lists.filter((l) => l.projectId === projectId)
  }, [lists])

  // Save an existing list as a reusable template (copies all items)
  const saveAsTemplate = useCallback(async (sourceListId: string, templateTitle?: string): Promise<List | null> => {
    if (!user) return null

    const sourceList = lists.find((l) => l.id === sourceListId)
    if (!sourceList) return null

    // First, fetch source list items
    const { data: sourceItems, error: fetchError } = await supabase
      .from('list_items')
      .select('*')
      .eq('list_id', sourceListId)
      .order('sort_order', { ascending: true })

    if (fetchError) {
      setError(fetchError.message)
      return null
    }

    // Create the template
    const maxSortOrder = lists.length > 0 ? Math.max(...lists.map((l) => l.sortOrder)) : 0
    const { data: templateData, error: insertError } = await supabase
      .from('lists')
      .insert({
        user_id: user.id,
        title: templateTitle || `${sourceList.title} (Template)`,
        icon: sourceList.icon ?? null,
        category: sourceList.category,
        visibility: sourceList.visibility,
        hidden_from: sourceList.hiddenFrom ?? null,
        project_id: null,
        is_template: true,
        sort_order: maxSortOrder + 1,
      })
      .select()
      .single()

    if (insertError) {
      setError(insertError.message)
      return null
    }

    const template = dbListToList(templateData as DbList)
    setLists((prev) => [...prev, template])

    // Copy items to the template (all unchecked)
    if (sourceItems && sourceItems.length > 0) {
      const templateItems = sourceItems.map((item: { text: string; note: string | null; sort_order: number }, index: number) => ({
        user_id: user.id,
        list_id: template.id,
        text: item.text,
        note: item.note,
        is_checked: false,
        sort_order: index,
      }))

      const { error: itemsError } = await supabase
        .from('list_items')
        .insert(templateItems)

      if (itemsError) {
        setError(itemsError.message)
        // Template was created but items failed - still return the template
      }
    }

    return template
  }, [user, lists])

  // Create a new list from a template (copies template items)
  const createFromTemplate = useCallback(async (templateId: string, newTitle?: string): Promise<List | null> => {
    if (!user) return null

    const template = lists.find((l) => l.id === templateId)
    if (!template) return null

    // First, fetch template items
    const { data: templateItems, error: fetchError } = await supabase
      .from('list_items')
      .select('*')
      .eq('list_id', templateId)
      .order('sort_order', { ascending: true })

    if (fetchError) {
      setError(fetchError.message)
      return null
    }

    // Create the new list (not a template)
    const maxSortOrder = lists.length > 0 ? Math.max(...lists.map((l) => l.sortOrder)) : 0
    const { data: newListData, error: insertError } = await supabase
      .from('lists')
      .insert({
        user_id: user.id,
        title: newTitle || template.title,
        icon: template.icon ?? null,
        category: template.category,
        visibility: template.visibility,
        hidden_from: template.hiddenFrom ?? null,
        project_id: null, // New list from template starts unlinked
        is_template: false,
        sort_order: maxSortOrder + 1,
      })
      .select()
      .single()

    if (insertError) {
      setError(insertError.message)
      return null
    }

    const newList = dbListToList(newListData as DbList)
    setLists((prev) => [...prev, newList])

    // Copy items to the new list (all unchecked)
    if (templateItems && templateItems.length > 0) {
      const newItems = templateItems.map((item: { text: string; note: string | null; sort_order: number }, index: number) => ({
        user_id: user.id,
        list_id: newList.id,
        text: item.text,
        note: item.note,
        is_checked: false,
        sort_order: index,
      }))

      const { error: itemsError } = await supabase
        .from('list_items')
        .insert(newItems)

      if (itemsError) {
        setError(itemsError.message)
        // List was created but items failed - still return the list
      }
    }

    return newList
  }, [user, lists])

  // Get lists grouped by category (excludes templates)
  const listsByCategory = useMemo(() => {
    const grouped: Record<ListCategory, List[]> = {
      entertainment: [],
      food_drink: [],
      shopping: [],
      travel: [],
      family_info: [],
      home: [],
      other: [],
    }

    for (const list of lists) {
      if (!list.isTemplate) {
        grouped[list.category].push(list)
      }
    }

    return grouped
  }, [lists])

  // Get templates only
  const templates = useMemo(() => lists.filter((l) => l.isTemplate), [lists])

  // Get non-template lists only
  const regularLists = useMemo(() => lists.filter((l) => !l.isTemplate), [lists])

  // Create a lists map for efficient lookup
  const listsMap = useMemo(() => {
    const map = new Map<string, List>()
    for (const list of lists) {
      map.set(list.id, list)
    }
    return map
  }, [lists])

  return {
    lists,
    listsMap,
    listsByCategory,
    templates,
    regularLists,
    loading,
    error,
    addList,
    updateList,
    deleteList,
    reorderLists,
    searchLists,
    getListById,
    getListsByCategory,
    getListsByProject,
    createFromTemplate,
    saveAsTemplate,
  }
}
