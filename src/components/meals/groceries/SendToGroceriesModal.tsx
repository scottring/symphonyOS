import { useState, useMemo, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { CATEGORY_ORDER, type GroceryCategory } from '@/lib/categorizeIngredient'
import type { ConsolidatedIngredient } from '@/lib/consolidateIngredients'
import type { Recipe } from '@/types/meal-planner'
import type { PantryInventory, PantryLevel } from '@/types/meal-planner'
import { IngredientLineRow } from './IngredientLineRow'
import { useStoreOverrides } from '@/hooks/useStoreOverrides'
import { usePantryInventory } from '@/hooks/usePantryInventory'
import { StoreChip } from './StoreChip'
import { PantryLevelPicker } from './PantryLevelPicker'

interface Props {
  isOpen: boolean
  onClose: () => void
  consolidated: ConsolidatedIngredient[]
  groceriesListId: string | null
  currentItemTexts: string[]
  /** Optional. When provided, the modal annotates each ingredient with the
   *  source recipe titles so the planner sees what they're stocking up for. */
  recipesById?: Map<string, Recipe>
  stores: { id: string; title: string }[]
  onSent: () => void
}

function keyOf(text: string): string {
  return text.toLowerCase().trim()
}

const PANTRY_CATEGORIES: Set<string> = new Set(['Pantry', 'Other', 'Spices'])

function pantryContext(pantry: PantryInventory | undefined, useCount: number): string | undefined {
  if (!pantry) return undefined
  const days = Math.max(1, Math.round((Date.now() - pantry.lastCheckedAt.getTime()) / 86400000))
  return `marked ${pantry.level} ${days}d ago — used in ${useCount} recipe${useCount === 1 ? '' : 's'}`
}

export function SendToGroceriesModal({ isOpen, onClose, consolidated, groceriesListId, currentItemTexts, recipesById, stores, onSent }: Props) {
  const [items, setItems] = useState<ConsolidatedIngredient[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [localDestinationByItem, setLocalDestinationByItem] = useState<Map<string, string>>(new Map())
  const [suppressedHighItems, setSuppressedHighItems] = useState<ConsolidatedIngredient[]>([])

  const { items: storeOverrides, upsert: upsertStoreOverride } = useStoreOverrides()
  const { items: pantryItems, setLevel: setPantryLevel, clear: clearPantryLevel } = usePantryInventory()

  useEffect(() => {
    if (isOpen) {
      const lower = currentItemTexts.map(t => t.toLowerCase())
      setItems(consolidated.filter(c => {
        const key = c.text.toLowerCase()
        return !lower.some(it => it.includes(key) || key.includes(it))
      }))
      setError(null)
      setLocalDestinationByItem(new Map())
      setSuppressedHighItems([])
    }
  }, [isOpen, consolidated, currentItemTexts])

  const pantryByPattern = useMemo(() => {
    const m = new Map<string, PantryInventory>()
    for (const p of pantryItems) m.set(p.pattern, p)
    return m
  }, [pantryItems])

  const grouped = useMemo(() => {
    const groups = new Map<GroceryCategory, ConsolidatedIngredient[]>()
    CATEGORY_ORDER.forEach(c => groups.set(c, []))
    items.forEach(i => groups.get(i.category)?.push(i))
    return groups
  }, [items])

  function getDestinationListId(item: ConsolidatedIngredient): string | null {
    const localOverride = localDestinationByItem.get(keyOf(item.text))
    if (localOverride) return localOverride
    const persistentOverride = storeOverrides.find(o => o.pattern === keyOf(item.text))
    if (persistentOverride) return persistentOverride.targetListId
    return groceriesListId
  }

  const handlePantryLevel = useCallback(async (item: ConsolidatedIngredient, level: PantryLevel) => {
    await setPantryLevel(keyOf(item.text), level)
    if (level === 'high') {
      setItems(prev => prev.filter(i => i !== item))
      setSuppressedHighItems(prev => [...prev, item])
    }
  }, [setPantryLevel])

  function sendButtonLabel(): string {
    if (sending) return 'Sending…'
    const groups = new Map<string, number>()
    for (const it of items) {
      const dest = getDestinationListId(it)
      if (!dest) continue
      groups.set(dest, (groups.get(dest) ?? 0) + 1)
    }
    if (groups.size <= 1) return `Send ${items.length} to Groceries`
    const parts: string[] = []
    for (const [listId, count] of groups) {
      const store = stores.find(s => s.id === listId)
      parts.push(`${count} to ${store?.title ?? '?'}`)
    }
    return `Send ${items.length} — ${parts.join(' · ')}`
  }

  const handleSend = async () => {
    if (items.length === 0) return
    setSending(true); setError(null)
    const { data: userResult } = await supabase.auth.getUser()
    const userId = userResult?.user?.id
    if (!userId) { setError('not authenticated'); setSending(false); return }

    // Group items by destination list id
    const groups = new Map<string, ConsolidatedIngredient[]>()
    for (const it of items) {
      const dest = getDestinationListId(it)
      if (!dest) continue
      const arr = groups.get(dest) ?? []
      arr.push(it)
      groups.set(dest, arr)
    }

    if (groups.size === 0) { setError('no destination list available'); setSending(false); return }

    for (const [listId, list] of groups) {
      const inserts = list.map((it, idx) => ({
        list_id: listId,
        user_id: userId,
        text: it.text,
        sort_order: idx,
        completed: false,
      }))
      const { error: err } = await supabase.from('list_items').insert(inserts)
      if (err) { setError(err.message); setSending(false); return }
    }

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
                {list.map((item, idx) => {
                  const titles = recipesById
                    ? item.fromRecipeIds
                        .map(id => recipesById.get(id)?.title)
                        .filter((t): t is string => !!t)
                    : []
                  const dest = getDestinationListId(item)
                  const isPantry = PANTRY_CATEGORIES.has(item.category)
                  const pantry = pantryByPattern.get(keyOf(item.text))
                  const ctx = pantryContext(pantry, item.fromRecipeIds.length)
                  const showAccessory = (stores.length >= 2 && dest != null) || isPantry
                  const accessory = showAccessory ? (
                    <div className="flex flex-col items-end gap-1">
                      {stores.length >= 2 && dest != null && (
                        <StoreChip
                          selectedListId={dest}
                          stores={stores}
                          onSelect={async (listId) => {
                            setLocalDestinationByItem(prev => {
                              const next = new Map(prev)
                              next.set(keyOf(item.text), listId)
                              return next
                            })
                            await upsertStoreOverride(keyOf(item.text), listId)
                          }}
                        />
                      )}
                      {isPantry && (
                        <PantryLevelPicker
                          level={pantry?.level ?? null}
                          onSelect={(level) => handlePantryLevel(item, level)}
                          context={ctx}
                        />
                      )}
                    </div>
                  ) : undefined
                  return (
                    <IngredientLineRow
                      key={`${item.text}-${idx}`}
                      item={item}
                      fromRecipeTitles={titles}
                      rightAccessory={accessory}
                      onChange={(text) => setItems(prev => prev.map(i => i === item ? { ...i, text } : i))}
                      onRemove={() => setItems(prev => prev.filter(i => i !== item))}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {suppressedHighItems.length > 0 && (
          <div className="px-6 pt-2 pb-1 text-[12px] italic text-neutral-500">
            {suppressedHighItems.length} item{suppressedHighItems.length === 1 ? '' : 's'} marked sufficient: {suppressedHighItems.map(i => i.text).join(', ')}.{' '}
            <button
              onClick={async () => {
                setItems(prev => [...prev, ...suppressedHighItems])
                for (const it of suppressedHighItems) {
                  await clearPantryLevel(keyOf(it.text))
                }
                setSuppressedHighItems([])
              }}
              className="not-italic text-primary-500 hover:text-primary-600 underline"
            >
              Show / Restore
            </button>
          </div>
        )}

        {error && <p className="px-6 pb-2 text-[14px] text-accent-500">{error}</p>}

        <div className="p-4 border-t border-neutral-200 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2 rounded-2xl text-neutral-600 hover:bg-neutral-100">Cancel</button>
          <button onClick={handleSend} disabled={sending || items.length === 0 || (!groceriesListId && stores.length === 0)}
                  className="px-6 py-2 rounded-2xl bg-primary-500 text-white font-medium disabled:opacity-40 hover:bg-primary-600">
            {sendButtonLabel()}
          </button>
        </div>
      </div>
    </div>
  )
}
