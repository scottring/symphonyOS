// The family grocery list as GroceryIO for saveGroceryLines: read the open
// items (to skip duplicates), insert one line at a time. Runs as the signed-
// in user, under list_items RLS — never a service role.

import { supabase } from '@/lib/supabase'
import type { GroceryIO } from '@/lib/wall/activity/groceryProposal'

export function supabaseGroceryIO(listId: string, userId: string): GroceryIO {
  return {
    fetchOpenTexts: async () => {
      const { data, error } = await supabase
        .from('list_items')
        .select('text')
        .eq('list_id', listId)
        .eq('completed', false)
      if (error) throw error
      return ((data ?? []) as { text: string | null }[]).map((r) => r.text ?? '')
    },
    insertLine: async (text, index) => {
      const { error } = await supabase
        .from('list_items')
        .insert({ list_id: listId, user_id: userId, text, sort_order: 10_000 + index, completed: false })
      if (error) console.error('[wall-v2] grocery line failed:', error)
      return !error
    },
  }
}
