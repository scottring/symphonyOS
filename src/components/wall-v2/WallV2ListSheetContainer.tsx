// src/components/wall-v2/WallV2ListSheetContainer.tsx
//
// Data wiring for the wall's list editor: owns which list is selected, pulls
// that list's items, and maps the sheet's callbacks onto useListItems. Kept
// out of WallV2Shell so the shell doesn't grow another hook's worth of state.

import { useEffect, useMemo, useState } from 'react';
import { useListItems } from '@/hooks/useListItems';
import { WallV2ListSheet, type WallListSummary } from './WallV2ListSheet';
import type { List } from '@/types/list';

interface Props {
  lists: List[];
  initialListId: string | null;
  pinnedIds: string[];
  onTogglePin: (id: string) => void;
  /** Surface a failed mutation — the shell passes its flash-toast helper. */
  onError: (message: string) => void;
  onClose: () => void;
}

export function WallV2ListSheetContainer({
  lists, initialListId, pinnedIds, onTogglePin, onError, onClose,
}: Props) {
  const [selectedListId, setSelectedListId] = useState<string | null>(
    initialListId ?? lists[0]?.id ?? null,
  );
  const { items, addItem, updateItem, deleteItem, clearCompleted, refetch, error } =
    useListItems(selectedListId);

  // The card that opened the sheet may hold items up to a poll interval old.
  useEffect(() => { void refetch(); }, [refetch]);

  // useListItems rolls its optimistic update back on failure; without this the
  // row would just silently reappear and nobody would know why.
  useEffect(() => {
    if (error) onError(`Couldn't save — ${error}`);
  }, [error, onError]);

  const summaries = useMemo<WallListSummary[]>(
    () => lists.map((list) => ({
      id: list.id,
      title: list.title,
      // Only the selected list's items are loaded, so other rows show no
      // count rather than a stale one.
      openCount: list.id === selectedListId ? items.filter((i) => !i.completed).length : 0,
    })),
    [lists, selectedListId, items],
  );

  return (
    <WallV2ListSheet
      lists={summaries}
      selectedListId={selectedListId}
      onSelectList={setSelectedListId}
      items={items}
      pinnedIds={pinnedIds}
      onTogglePin={onTogglePin}
      onAdd={(text) => void addItem({ text })}
      onToggle={(id, completed) => void updateItem(id, { completed })}
      onEditText={(id, text) => void updateItem(id, { text })}
      onDelete={(id) => void deleteItem(id)}
      onClearDone={() => void clearCompleted()}
      onClose={onClose}
    />
  );
}
