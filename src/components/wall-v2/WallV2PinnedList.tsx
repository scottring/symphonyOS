// src/components/wall-v2/WallV2PinnedList.tsx
//
// Container for one pinned list: owns the items and the poll, renders the
// card. `list_items` has no realtime subscription, so the wall re-pulls on
// the same 12-minute cadence and under the same guards as useWallData —
// wall polling is the known driver of the Supabase egress bill, so this
// deliberately does not poll faster.

import { useEffect, useMemo } from 'react';
import { useListItems } from '@/hooks/useListItems';
import { WALL_POLL_INTERVAL_MS } from '@/hooks/useWallData';
import { isQuietHours } from '@/lib/quietHours';
import { WallV2PinnedListCard } from './WallV2PinnedListCard';

/** Poll only when someone could be looking and it isn't the middle of the night. */
export function shouldPollLists(hidden: boolean, quiet: boolean): boolean {
  return !hidden && !quiet;
}

interface Props {
  listId: string;
  title: string;
  onOpen: () => void;
}

export function WallV2PinnedList({ listId, title, onOpen }: Props) {
  const { items, updateItem, refetch } = useListItems(listId);
  const openItems = useMemo(() => items.filter((i) => !i.completed), [items]);

  useEffect(() => {
    const interval = setInterval(() => {
      const hidden = typeof document !== 'undefined' && document.hidden;
      if (!shouldPollLists(hidden, isQuietHours())) return;
      void refetch();
    }, WALL_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refetch]);

  return (
    <WallV2PinnedListCard
      title={title}
      openItems={openItems}
      onToggle={(id) => void updateItem(id, { completed: true })}
      onOpen={onOpen}
    />
  );
}
