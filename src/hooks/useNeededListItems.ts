/**
 * List items marked "needed today", across every list.
 *
 * ListsContext can't serve this: its `listItems` come from
 * useListItems(selectedListId) and are empty whenever no list is open, which is
 * always true on Today. This queries the marked day directly — the partial index
 * on (needed_on) makes it a cheap lookup, not a table scan.
 */
import { useState, useEffect, useCallback } from 'react'
import { supabase, getAuthUser } from '@/lib/supabase'
import { dbListItemToListItem } from '@/hooks/useListItems'
import { localYmd } from '@/lib/cadence/config'
import { TO_BUY_CHANGED_EVENT } from '@/lib/lists/toBuy'
import type { ListItem, DbListItem } from '@/types/list'

export function useNeededListItems(viewedDate: Date) {
  const [items, setItems] = useState<ListItem[]>([])
  // A Date object is a new identity every render; key the effect on the stable
  // day string (shared helper — same semantics used to write needed_on) so
  // this doesn't refetch in a loop.
  const day = localYmd(viewedDate)

  const fetchItems = useCallback(async () => {
    const { data: { user } } = await getAuthUser()
    if (!user) { setItems([]); return }

    const { data, error } = await supabase
      .from('list_items')
      .select('*')
      .eq('user_id', user.id)
      .eq('needed_on', day)
      .eq('completed', false)

    if (!error && data) setItems((data as DbListItem[]).map(dbListItemToListItem))
  }, [day])

  useEffect(() => {
    void fetchItems()
    // Same-tab writes announce on this event; without it the note shows stale
    // state immediately after the user's own action.
    window.addEventListener(TO_BUY_CHANGED_EVENT, fetchItems)
    return () => window.removeEventListener(TO_BUY_CHANGED_EVENT, fetchItems)
  }, [fetchItems])

  return { items, refetch: fetchItems }
}
