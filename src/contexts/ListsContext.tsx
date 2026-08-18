import { createContext, useContext, useEffect, useState, useMemo, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLists } from '@/hooks/useLists'
import { useListItems } from '@/hooks/useListItems'
import type { List, ListItem, ListCategory, ListVisibility } from '@/types/list'

export interface ListsContextValue {
  lists: List[]
  loading: boolean
  listsByCategory: Record<ListCategory, List[]>
  selectedListId: string | null
  setSelectedListId: (id: string | null) => void
  selectedList: List | null
  listItems: ListItem[]
  addList: (list: { title: string; icon?: string; category?: ListCategory; visibility?: ListVisibility; hiddenFrom?: string[] }) => Promise<List | null>
  updateList: (id: string, updates: Partial<List>) => Promise<void>
  deleteList: (id: string) => Promise<void>
  getListById: (id: string) => List | undefined
  addItem: (item: { text: string; note?: string }) => Promise<ListItem | null>
  updateItem: (id: string, updates: Partial<ListItem>) => Promise<void>
  deleteItem: (id: string) => Promise<void>
  clearCompleted: () => Promise<void>
  reorderItems: (itemIds: string[]) => Promise<void>
}

const ListsContext = createContext<ListsContextValue | null>(null)

export function ListsProvider({ children }: { children: ReactNode }) {
  const [selectedListId, setSelectedListId] = useState<string | null>(null)

  // Deep link: /lists?list=<id> selects that list (Today's "To buy · N" line
  // navigates this way). Reactive, not init-only — this provider mounts once
  // at the shell and outlives every navigation. One-shot: the param is
  // stripped after applying so back/refresh don't force the selection.
  const [searchParams, setSearchParams] = useSearchParams()
  const listParam = searchParams.get('list')
  useEffect(() => {
    if (!listParam) return
    setSelectedListId(listParam)
    const next = new URLSearchParams(searchParams)
    next.delete('list')
    setSearchParams(next, { replace: true })
  }, [listParam, searchParams, setSearchParams])

  const {
    lists,
    loading,
    listsByCategory,
    addList,
    updateList,
    deleteList,
    getListById,
  } = useLists()

  const {
    items: listItems,
    addItem,
    updateItem,
    deleteItem,
    clearCompleted,
    reorderItems,
  } = useListItems(selectedListId)

  const selectedList = useMemo(() => {
    if (!selectedListId) return null
    return getListById(selectedListId) ?? null
  }, [selectedListId, getListById])

  return (
    <ListsContext.Provider
      value={{
        lists,
        loading,
        listsByCategory,
        selectedListId,
        setSelectedListId,
        selectedList,
        listItems,
        addList,
        updateList,
        deleteList,
        getListById,
        addItem,
        updateItem,
        deleteItem,
        clearCompleted,
        reorderItems,
      }}
    >
      {children}
    </ListsContext.Provider>
  )
}

export function useListsContext(): ListsContextValue {
  const ctx = useContext(ListsContext)
  if (!ctx) throw new Error('useListsContext must be used within ListsProvider')
  return ctx
}

/** For components that render on surfaces which may mount without the provider
 *  (e.g. TodayView under test): null instead of a throw. */
export function useListsContextOrNull(): ListsContextValue | null {
  return useContext(ListsContext)
}
