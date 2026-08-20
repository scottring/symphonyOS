import { Suspense, useCallback } from 'react'
import { ListsProvider, useListsContext } from '@/contexts/ListsContext'
import { ListsList, ListView } from '@/components/lazy'
import { LoadingFallback } from '@/components/layout/LoadingFallback'
import { announceToBuyChanged } from '@/lib/lists/toBuy'
import { usePinsContextOrNull } from '@/contexts/PinsContext'
import type { ListItem } from '@/types/list'

/**
 * Lists surface, mounted by the Shell at /lists. Mirrors the legacy
 * ViewRouter `ListsSection`: ListsProvider supplies state + actions, and we show
 * the list index or the selected list via the provider's internal selection.
 *
 * Pin controls come from the shell's shared PinsContext, NOT a local
 * `usePinnedItems()`. `pinned_items` already carried an entity type of 'list'
 * and the sidebar already drew list pins by name; the only missing piece was
 * this — ListView renders its pin button only when both onPin and onUnpin are
 * passed, so the button had simply never appeared. Reading the shared instance
 * is what makes a pin show up in the sidebar without a reload.
 *
 * Null-tolerant: ListsApp can be mounted outside the shell (tests), where the
 * pin control is absent rather than throwing.
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
  const pins = usePinsContextOrNull()

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
            isPinned={pins?.isPinned('list', selectedList.id)}
            canPin={pins?.canPin()}
            onPin={pins ? () => pins.pin('list', selectedList.id) : undefined}
            onUnpin={pins ? () => pins.unpin('list', selectedList.id) : undefined}
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
