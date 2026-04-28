import { useState, useMemo, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { CATEGORY_ORDER, type GroceryCategory } from '@/lib/categorizeIngredient'
import type { ConsolidatedIngredient } from '@/lib/consolidateIngredients'
import { IngredientLineRow } from './IngredientLineRow'

interface Props {
  isOpen: boolean
  onClose: () => void
  consolidated: ConsolidatedIngredient[]
  groceriesListId: string | null
  currentItemTexts: string[]
  onSent: () => void
}

export function SendToGroceriesModal({ isOpen, onClose, consolidated, groceriesListId, currentItemTexts, onSent }: Props) {
  const [items, setItems] = useState<ConsolidatedIngredient[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      const lower = currentItemTexts.map(t => t.toLowerCase())
      setItems(consolidated.filter(c => {
        const key = c.text.toLowerCase()
        return !lower.some(it => it.includes(key) || key.includes(it))
      }))
      setError(null)
    }
  }, [isOpen, consolidated, currentItemTexts])

  const grouped = useMemo(() => {
    const groups = new Map<GroceryCategory, ConsolidatedIngredient[]>()
    CATEGORY_ORDER.forEach(c => groups.set(c, []))
    items.forEach(i => groups.get(i.category)?.push(i))
    return groups
  }, [items])

  const handleSend = async () => {
    if (!groceriesListId || items.length === 0) return
    setSending(true)
    setError(null)
    const { data: userResult } = await supabase.auth.getUser()
    const userId = userResult?.user?.id
    if (!userId) { setError('not authenticated'); setSending(false); return }

    const inserts = items.map((it, idx) => ({
      list_id: groceriesListId,
      user_id: userId,
      text: it.text,
      sort_order: idx,
      completed: false,
    }))
    const { error: insertErr } = await supabase.from('list_items').insert(inserts)
    if (insertErr) { setError(insertErr.message); setSending(false); return }
    setSending(false)
    onSent()
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-bg-elevated rounded-3xl shadow-elevated max-w-2xl w-full mx-6 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-8 pb-4 border-b border-neutral-200">
          <div className="text-[0.7rem] font-bold uppercase tracking-[0.25em] text-neutral-500 mb-2">REVIEW & SEND</div>
          <h2 className="font-display text-3xl text-neutral-800">
            {items.length} item{items.length === 1 ? '' : 's'} to <span className="italic text-primary-500">Groceries.</span>
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {items.length === 0 && (
            <p className="text-center text-neutral-500 py-8">All planned ingredients are already on your Groceries list.</p>
          )}
          {Array.from(grouped.entries()).map(([category, list]) => list.length > 0 && (
            <div key={category} className="mb-5">
              <div className="text-[11px] font-bold uppercase tracking-widest text-neutral-500 mb-2">{category}</div>
              <div>
                {list.map((item, idx) => (
                  <IngredientLineRow
                    key={`${item.text}-${idx}`}
                    item={item}
                    onChange={(text) => setItems(prev => prev.map(i => i === item ? { ...i, text } : i))}
                    onRemove={() => setItems(prev => prev.filter(i => i !== item))}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {error && <p className="px-6 pb-2 text-[14px] text-accent-500">{error}</p>}

        <div className="p-4 border-t border-neutral-200 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2 rounded-2xl text-neutral-600 hover:bg-neutral-100">Cancel</button>
          <button onClick={handleSend} disabled={sending || items.length === 0 || !groceriesListId}
                  className="px-6 py-2 rounded-2xl bg-primary-500 text-white font-medium disabled:opacity-40 hover:bg-primary-600">
            {sending ? 'Sending…' : `Send ${items.length} to Groceries`}
          </button>
        </div>
      </div>
    </div>
  )
}
