/**
 * List items marked "needed today", across every list the caller can see.
 *
 * ListsContext can't serve this: its `listItems` come from
 * useListItems(selectedListId) and are empty whenever no list is open, which is
 * always true on Today. This queries the marked day directly — the partial index
 * on (needed_on) makes it a cheap lookup, not a table scan.
 *
 * SCOPE — by `list_id`, exactly the way /lists scopes its own read, with NO
 * `user_id` filter. `useListItems` fetches by list and lets RLS govern the rows;
 * the note must agree, because the "To buy" list is created
 * `visibility: 'family'` and /lists therefore renders — and offers "Need today"
 * on — items owned by another household member. Filtering to `user_id = me`
 * made those marks land on nobody's note: a silent no-op behind a
 * confirmed-looking amber icon. The list_items SELECT policy
 * (supabase/migrations/020_lists_family_sharing.sql) already restricts this to
 * own items plus items in accessible lists, so passing the list ids the caller
 * can see is the whole filter needed.
 */
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { dbListItemToListItem } from '@/hooks/useListItems'
import { localYmd } from '@/lib/cadence/config'
import { TO_BUY_CHANGED_EVENT, announceToBuyChanged } from '@/lib/lists/toBuy'
import type { ListItem, DbListItem } from '@/types/list'

/**
 * @param viewedDate the day whose marks to read — a mark expires by ceasing to
 *   match it, so this is the whole definition of "needed today".
 * @param listIds the lists the caller can see (ListsContext's `lists`). Empty
 *   means nothing to read: before lists load there is nothing to show anyway.
 */
export function useNeededListItems(viewedDate: Date, listIds: string[]) {
  const [items, setItems] = useState<ListItem[]>([])
  // A Date object is a new identity every render; key the effect on the stable
  // day string (shared helper — same semantics used to write needed_on) so
  // this doesn't refetch in a loop.
  const day = localYmd(viewedDate)
  // Same reason, same trick for the list set: `lists` is a fresh array on every
  // context render. Sorted so a reorder isn't mistaken for a change.
  const idsKey = [...listIds].sort().join(',')

  const fetchItems = useCallback(async () => {
    const ids = idsKey ? idsKey.split(',') : []
    if (ids.length === 0) { setItems([]); return }

    const { data, error } = await supabase
      .from('list_items')
      .select('*')
      .in('list_id', ids)
      .eq('needed_on', day)
      .eq('completed', false)

    if (!error && data) setItems((data as DbListItem[]).map(dbListItemToListItem))
  }, [day, idsKey])

  useEffect(() => {
    void fetchItems()
    // Same-tab writes announce on this event; without it the note shows stale
    // state immediately after the user's own action.
    window.addEventListener(TO_BUY_CHANGED_EVENT, fetchItems)
    return () => window.removeEventListener(TO_BUY_CHANGED_EVENT, fetchItems)
  }, [fetchItems])

  /**
   * Tick a marked row off from the note.
   *
   * A DIRECT write, deliberately not ListsContext.updateItem: that function
   * opens with `const item = items.find(...); if (!item) return`, and on Today
   * its `items` are always empty (selectedListId is null on every surface but
   * /lists), so the call returned before touching the database — the row came
   * straight back on the next fetch. Same trap this hook exists to dodge on the
   * read side, and the same reason `sendTaskToBuy` (HomeViewContainer) bypasses
   * the context for its off-list write. The write lives here, next to the read
   * that justifies it, rather than as a raw query in TodayView.
   *
   * Mirrors useListItems.updateItem's completion shape (`completed_at` derived
   * from `completed`) so a row completed here is indistinguishable from one
   * completed on /lists.
   */
  const complete = useCallback(async (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id))

    const { error } = await supabase
      .from('list_items')
      .update({ completed: true, completed_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      // Resync from the DB rather than restoring a snapshot — the fetch is the
      // authority and the row may have changed elsewhere meanwhile.
      void fetchItems()
      return
    }

    // /lists' own view and Today's "To buy · N" line both key off this signal.
    announceToBuyChanged()
  }, [fetchItems])

  return { items, refetch: fetchItems, complete }
}
