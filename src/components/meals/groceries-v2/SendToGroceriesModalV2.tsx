import { useState, useMemo, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { supabase, getAuthUser } from '@/lib/supabase'
import { CATEGORY_ORDER, type GroceryCategory } from '@/lib/categorizeIngredient'
import type { ConsolidatedIngredient } from '@/lib/consolidateIngredients'
import { isStaple } from '@/lib/isStaple'
import { GrocerySection } from './GrocerySection'
import { GroceryLineItemV2 } from './GroceryLineItemV2'

interface Props {
  isOpen: boolean
  onClose: () => void
  consolidated: ConsolidatedIngredient[]
  groceriesListId: string | null
  currentItemTexts: string[]
  onSent: () => void
}

/**
 * Map our internal grocery categories to the design-canvas section labels.
 *
 * TODO(meal-planner-v3): the design splits PRODUCE into "FOR SUNDAY BATCH" vs
 * "FOR WEEKNIGHT DINNERS & BOOSTS" and adds FROZEN / SCOTT'S LUNCHES /
 * PANTRY — CHECK BEFORE BUYING. Those sub-groupings depend on prep-window
 * metadata that is not yet on ConsolidatedIngredient. For v1 we use the
 * existing categorizer output and rename to the design copy.
 */
const SECTION_LABELS: Record<GroceryCategory, string> = {
  Produce: 'PRODUCE — FOR THE WEEK',
  Meat: 'PROTEIN & DAIRY',
  Dairy: 'PROTEIN & DAIRY',
  Pantry: 'CANNED & DRY GOODS',
  Spices: 'SPICES & SEASONINGS',
  Other: 'OTHER',
}

/**
 * Render order. Combines Meat + Dairy under one PROTEIN & DAIRY section by
 * walking categories in this order and grouping by label.
 */
const RENDER_ORDER: GroceryCategory[] = CATEGORY_ORDER

interface SectionBucket {
  label: string
  items: ConsolidatedIngredient[]
}

/**
 * SendToGroceriesModalV2 — visual replacement for SendToGroceriesModal.
 *
 * Prop signature is intentionally identical to v1 so the integrator can
 * swap the import (or add a feature flag) without touching call sites.
 */
export function SendToGroceriesModalV2({
  isOpen,
  onClose,
  consolidated,
  groceriesListId,
  currentItemTexts,
  onSent,
}: Props) {
  const [items, setItems] = useState<ConsolidatedIngredient[]>([])
  // Staples the household likely has — shown under "check before buying" and
  // NOT sent unless the user explicitly adds one.
  const [staples, setStaples] = useState<ConsolidatedIngredient[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      const lower = currentItemTexts.map(t => t.toLowerCase())
      const notAlreadyListed = consolidated.filter(c => {
        const key = c.text.toLowerCase()
        return !lower.some(it => it.includes(key) || key.includes(it))
      })
      setItems(notAlreadyListed.filter(c => !isStaple(c)))
      setStaples(notAlreadyListed.filter(c => isStaple(c)))
      setError(null)
    }
  }, [isOpen, consolidated, currentItemTexts])

  // Move a staple into the to-buy list (user is out of it this week).
  const addStaple = (item: ConsolidatedIngredient) => {
    setStaples(prev => prev.filter(p => p !== item))
    setItems(prev => [...prev, item])
  }

  /**
   * Group items into sections, merging any GroceryCategory values that share
   * a SECTION_LABELS entry (e.g. Meat + Dairy → "PROTEIN & DAIRY").
   */
  const sections = useMemo<SectionBucket[]>(() => {
    const byLabel = new Map<string, ConsolidatedIngredient[]>()
    const labelOrder: string[] = []

    for (const cat of RENDER_ORDER) {
      const label = SECTION_LABELS[cat]
      if (!byLabel.has(label)) {
        byLabel.set(label, [])
        labelOrder.push(label)
      }
    }

    for (const item of items) {
      const label = SECTION_LABELS[item.category]
      byLabel.get(label)?.push(item)
    }

    return labelOrder
      .map(label => ({ label, items: byLabel.get(label) ?? [] }))
      .filter(s => s.items.length > 0)
  }, [items])

  const totalCount = items.length

  const handleEditAll = () => {
    // TODO(meal-planner-v3): launch bulk-edit mode. For now this is a stub
    // so the link is present but inert.
  }

  const handleSend = async () => {
    if (!groceriesListId || items.length === 0) return
    setSending(true)
    setError(null)
    const { data: userResult } = await getAuthUser()
    const userId = userResult?.user?.id
    if (!userId) {
      setError('not authenticated')
      setSending(false)
      return
    }

    const inserts = items.map((it, idx) => ({
      list_id: groceriesListId,
      user_id: userId,
      text: it.text,
      sort_order: idx,
      completed: false,
    }))
    const { error: insertErr } = await supabase.from('list_items').insert(inserts)
    if (insertErr) {
      setError(insertErr.message)
      setSending(false)
      return
    }
    setSending(false)
    onSent()
    onClose()
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-bg-elevated rounded-3xl shadow-elevated max-w-2xl w-full mx-6 max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-8 pt-7 pb-5 border-b border-neutral-200">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-display text-neutral-800" style={{ fontSize: '1.6rem', lineHeight: 1.15 }}>
              Review shopping list
            </h2>
            <button
              type="button"
              onClick={handleEditAll}
              className="text-[13px] text-primary-500 hover:text-primary-600 hover:underline shrink-0"
            >
              Edit all
            </button>
          </div>
          <p className="mt-1 text-[13px] italic text-neutral-400">From this week's plan</p>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-8 py-5">
          {totalCount === 0 && staples.length === 0 ? (
            <p className="text-center text-neutral-500 py-12 italic font-display">
              All planned ingredients are already on your Groceries list.
            </p>
          ) : (
            <>
              {sections.map((section, idx) => (
                <GrocerySection
                  key={section.label}
                  label={section.label}
                  count={section.items.length}
                  defaultOpen={idx < 2}
                >
                  {section.items.map((item, i) => (
                    <GroceryLineItemV2
                      key={`${section.label}-${item.text}-${i}`}
                      item={item}
                      onChange={(text) =>
                        setItems(prev => prev.map(p => (p === item ? { ...p, text } : p)))
                      }
                      onRemove={() => setItems(prev => prev.filter(p => p !== item))}
                    />
                  ))}
                </GrocerySection>
              ))}

              {staples.length > 0 && (
                <GrocerySection label="STAPLES — CHECK BEFORE BUYING" count={staples.length} defaultOpen={false}>
                  {staples.map((item, i) => (
                    <div key={`staple-${item.text}-${i}`} className="group flex items-center gap-3 py-2.5 border-b border-neutral-100 last:border-b-0">
                      <span className="flex-1 min-w-0 text-[16px] text-neutral-500">{item.text}</span>
                      <button
                        onClick={() => addStaple(item)}
                        className="shrink-0 inline-flex items-center gap-1 text-[13px] text-primary-500 hover:text-primary-600 px-2 py-1 rounded-lg hover:bg-primary-50"
                        aria-label={`Add ${item.text} to the list`}
                      >
                        <Plus className="w-3.5 h-3.5" /> Add
                      </button>
                    </div>
                  ))}
                </GrocerySection>
              )}
            </>
          )}
        </div>

        {error && <p className="px-8 pb-2 text-[13px] text-accent-500">{error}</p>}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-neutral-200 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-2xl text-neutral-600 hover:bg-neutral-100 text-[15px]"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || totalCount === 0 || !groceriesListId}
            className="px-6 py-2.5 rounded-2xl bg-primary-500 text-white font-medium text-[15px] disabled:opacity-40 hover:bg-primary-600 transition-colors"
          >
            {sending ? 'Sending…' : 'Send to Apple Reminders'}
          </button>
        </div>
      </div>
    </div>
  )
}
