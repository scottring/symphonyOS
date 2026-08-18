// One fixed-budget line on Today: "To buy · N". The purchases themselves live
// on the native family "To buy" list (full checkboxes/editing on /lists) — this
// line is Today's entire spend on them: one row at 4 items, one row at 40.
// Renders nothing when the list is absent or fully checked off.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, ShoppingBag } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useListsContextOrNull } from '@/contexts/ListsContext'
import { findToBuyList, TO_BUY_CHANGED_EVENT } from '@/lib/lists/toBuy'

export function ToBuyLine() {
  // The shared ListsContext, NOT a private useLists() instance: the To buy
  // list is created lazily by the first conversion, and only the context's
  // state learns about it without a remount — a private instance keeps
  // rendering nothing until the next full page load. Null-tolerant so a
  // provider-less mount (tests) renders nothing instead of throwing.
  const lists = useListsContextOrNull()?.lists ?? []
  const navigate = useNavigate()
  const list = findToBuyList(lists)
  const listId = list?.id
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!listId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing on dependency change is valid
      setCount(0)
      return
    }
    let cancelled = false
    const fetchCount = () => {
      void supabase
        .from('list_items')
        .select('id', { count: 'exact', head: true })
        .eq('list_id', listId)
        .eq('completed', false)
        .then(({ count: c }) => {
          if (!cancelled && typeof c === 'number') setCount(c)
        })
    }
    fetchCount()
    // Same-tab conversions/undos announce on this event; without it the line
    // shows a stale count right after the user's own action.
    window.addEventListener(TO_BUY_CHANGED_EVENT, fetchCount)
    return () => {
      cancelled = true
      window.removeEventListener(TO_BUY_CHANGED_EVENT, fetchCount)
    }
  }, [listId])

  if (!listId || count === 0) return null

  return (
    <button
      type="button"
      onClick={() => navigate(`/lists?list=${listId}`)}
      data-testid="to-buy-line"
      className="w-full flex items-center gap-2 px-3 md:px-0 py-2 text-left text-[13px] text-neutral-500 hover:text-neutral-700 transition-colors"
    >
      <ShoppingBag className="w-3.5 h-3.5 text-neutral-400 shrink-0" aria-hidden />
      <span className="font-medium text-neutral-600">To buy</span>
      <span className="text-neutral-400 tabular-nums">· {count}</span>
      <ChevronRight className="w-3.5 h-3.5 text-neutral-300" aria-hidden />
    </button>
  )
}
