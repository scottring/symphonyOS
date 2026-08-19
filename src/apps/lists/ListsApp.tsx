import { Suspense, useCallback } from 'react'
import { ListsProvider, useListsContext } from '@/contexts/ListsContext'
import { ListsList, ListView } from '@/components/lazy'
import { LoadingFallback } from '@/components/layout/LoadingFallback'
import { announceToBuyChanged } from '@/lib/lists/toBuy'
import type { ListItem } from '@/types/list'

/**
 * Lists surface, mounted by the Shell at /lists. Mirrors the legacy
 * ViewRouter `ListsSection`: ListsProvider supplies state + actions, and we show
 * the list index or the selected list via the provider's internal selection.
 *
 * Pin controls (onPin/onUnpin) are intentionally omitted — ListView only renders
 * the pin button when both are passed, and sidebar pins are wired in the chrome
 * migration (Task #19), not here.
 */
function ListsInner() {
  const {
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
    addItem,
    updateItem,
    deleteItem,
    clearCompleted,
    reorderItems,
  } = useListsContext()

  // useNeededListItems (feeding Today's note) only refetches on
  // TO_BUY_CHANGED_EVENT — ListsContext.updateItem doesn't fire it itself
  // (same reasoning as TodayView's handleToggleNeededListItem). Without this,
  // marking/clearing here leaves the note showing stale state until reload.
  const handleUpdateItem = useCallback((id: string, updates: Partial<ListItem>) => {
    void (async () => {
      await updateItem(id, updates)
      if ('neededOn' in updates) {
        announceToBuyChanged()
      }
    })()
  }, [updateItem])

  return (
    <>
      {!selectedListId && (
        <Suspense fallback={<LoadingFallback />}>
          <ListsList
            lists={lists}
            loading={loading}
            listsByCategory={listsByCategory}
            onSelectList={setSelectedListId}
            onAddList={addList}
          />
        </Suspense>
      )}
      {selectedList && (
        <Suspense fallback={<LoadingFallback />}>
          <ListView
            list={selectedList}
            items={listItems}
            onBack={() => setSelectedListId(null)}
            onUpdateList={updateList}
            onDeleteList={deleteList}
            onAddItem={addItem}
            onUpdateItem={handleUpdateItem}
            onDeleteItem={deleteItem}
            onClearCompleted={clearCompleted}
            onReorderItems={reorderItems}
          />
        </Suspense>
      )}
    </>
  )
}

export function ListsApp() {
  return (
    <ListsProvider>
      <ListsInner />
    </ListsProvider>
  )
}
