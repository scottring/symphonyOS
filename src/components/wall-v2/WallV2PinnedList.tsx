// src/components/wall-v2/WallV2PinnedList.tsx
//
// Container for one pinned list: owns the items and the poll, renders the
// card. `list_items` has no realtime subscription, so the wall re-pulls on
// the same 12-minute cadence and under the same guards as useWallData —
// wall polling is the known driver of the Supabase egress bill, so this
// deliberately does not poll faster. Two other signals also trigger a
// refetch: the tab regaining visibility (mirrors useWallData's own
// visibilitychange listener) and `refreshKey` bumping, which the shell does
// when the list sheet — a separate useListItems instance with no shared
// state — closes, so edits made there are reflected here without waiting
// out the poll.

import { useEffect, useMemo, useRef } from 'react';
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
  /** Bump from the shell to force a refetch (e.g. the list sheet just closed). */
  refreshKey: number;
  onOpen: () => void;
}

export function WallV2PinnedList({ listId, title, refreshKey, onOpen }: Props) {
  const { items, updateItem, refetch, loading } = useListItems(listId);
  const openItems = useMemo(() => items.filter((i) => !i.completed), [items]);

  useEffect(() => {
    const interval = setInterval(() => {
      const hidden = typeof document !== 'undefined' && document.hidden;
      if (!shouldPollLists(hidden, isQuietHours())) return;
      void refetch();
    }, WALL_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refetch]);

  // Refetch when the tab regains visibility — mirrors useWallData.ts, which
  // every other wall surface benefits from but this card was left out of.
  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) void refetch();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [refetch]);

  // Refetch when the shell bumps refreshKey (list sheet closed). Skip the
  // very first render — useListItems already fetches on mount, and firing
  // again here would just double the initial request.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    void refetch();
  }, [refreshKey, refetch]);

  return (
    <WallV2PinnedListCard
      title={title}
      openItems={openItems}
      loading={loading}
      onToggle={(id) => void updateItem(id, { completed: true })}
      onOpen={onOpen}
    />
  );
}
