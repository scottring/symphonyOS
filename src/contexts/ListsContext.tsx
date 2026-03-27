import { createContext, useContext, useState, useMemo, type ReactNode } from 'react'
import { useLists } from '@/hooks/useLists'
import { useListItems } from '@/hooks/useListItems'
import type { List, ListItem, ListCategory, ListVisibility } from '@/types/list'

export interface ListsContextValue {
  lists: List[]
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
  reorderItems: (itemIds: string[]) => Promise<void>
}

const ListsContext = createContext<ListsContextValue | null>(null)

export function ListsProvider({ children }: { children: ReactNode }) {
  const [selectedListId, setSelectedListId] = useState<string | null>(null)

  const {
    lists,
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
