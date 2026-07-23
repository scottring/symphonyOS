// src/hooks/useUpkeepList.ts
//
// The "Monthly upkeep" template list backing the guided month session's
// maintenance sweep. Self-contained (not useLists/useListItems) so
// create-list-then-seed is one atomic ensure() with no optimistic-state
// races. The list is user-editable in the normal Lists UI; the wizard only
// reads open items and creates the list once.
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

export const UPKEEP_LIST_TITLE = 'Monthly upkeep'
export const UPKEEP_SEED_ITEMS = [
  'Reconcile budget (YNAB)',
  'Paper & mail sweep',
  'One declutter target',
  'Household supply blitz',
  'Meal-ops reset',
]

export interface UpkeepItem { id: string; text: string }

export function useUpkeepList(): {
  upkeepItems: UpkeepItem[]
  upkeepLoading: boolean
  ensureUpkeepList: () => Promise<void>
} {
  const { user } = useAuth()
  const [items, setItems] = useState<UpkeepItem[]>([])
  const [listId, setListId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const ensuring = useRef(false)

  useEffect(() => {
    if (!user) { setItems([]); setListId(null); setLoading(false); return }
    let cancelled = false
    async function load() {
      if (!user) return
      const { data: lists } = await supabase
        .from('lists')
        .select('id, title')
        .eq('user_id', user.id)
        .ilike('title', UPKEEP_LIST_TITLE)
        .limit(1)
      if (cancelled) return
      const list = lists?.[0] ?? null
      setListId(list?.id ?? null)
      if (!list) { setItems([]); setLoading(false); return }
      const { data: rows } = await supabase
        .from('list_items')
        .select('id, text, completed')
        .eq('list_id', list.id)
        .eq('completed', false)
        .order('sort_order', { ascending: true })
      if (cancelled) return
      setItems((rows ?? []).map((r) => ({ id: r.id, text: r.text })))
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [user])

  const ensureUpkeepList = useCallback(async () => {
    if (!user || listId || loading || ensuring.current) return
    ensuring.current = true
    try {
      // Find-or-create: re-check right before inserting so an errored initial
      // load or a second tab mid-session can't produce a duplicate template.
      const { data: existing, error: findError } = await supabase
        .from('lists')
        .select('id')
        .eq('user_id', user.id)
        .ilike('title', UPKEEP_LIST_TITLE)
        .limit(1)
      if (findError) return
      const found = existing?.[0]
      if (found) {
        setListId(found.id)
        const { data: rows } = await supabase
          .from('list_items')
          .select('id, text, completed')
          .eq('list_id', found.id)
          .eq('completed', false)
          .order('sort_order', { ascending: true })
        setItems((rows ?? []).map((r) => ({ id: r.id, text: r.text })))
        return
      }
      const { data: created, error } = await supabase
        .from('lists')
        .insert({
          user_id: user.id,
          title: UPKEEP_LIST_TITLE,
          icon: null,
          category: 'home',
          visibility: 'self',
          hidden_from: null,
          sort_order: 999,
        })
        .select()
        .single()
      if (error || !created) return
      const seedRows = UPKEEP_SEED_ITEMS.map((text, i) => ({
        user_id: user.id,
        list_id: created.id,
        text,
        note: null,
        sort_order: i,
        parent_item_id: null,
      }))
      await supabase.from('list_items').insert(seedRows)
      setListId(created.id)
      // Surface seeds immediately; ids are provisional until next full load,
      // which is fine — the wizard only reads text and needs a stable key.
      setItems(UPKEEP_SEED_ITEMS.map((text, i) => ({ id: `seed-${i}`, text })))
    } finally {
      ensuring.current = false
    }
  }, [user, listId, loading])

  return { upkeepItems: items, upkeepLoading: loading, ensureUpkeepList }
}
