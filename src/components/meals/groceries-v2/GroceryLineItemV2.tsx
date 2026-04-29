import type { ConsolidatedIngredient } from '@/lib/consolidateIngredients'

interface Props {
  item: ConsolidatedIngredient
  /**
   * Optional day-context string ("Mon-Wed lunches"). Render only when present —
   * never fabricate. Currently the consolidation pipeline does not surface this,
   * so the v2 modal will simply omit the italic flourish for now.
   */
  dayContext?: string
  onChange: (newText: string) => void
  onRemove: () => void
}

/**
 * GroceryLineItemV2 — a single grocery row in the v2 review modal.
 *
 * Visual idiom:
 *   ⋮⋮  Spinach — large bag        Dal Mon-Wed lunches
 *
 * The drag handle is visual-only for v1; reordering is not wired up.
 */
export function GroceryLineItemV2({ item, dayContext, onChange, onRemove }: Props) {
  return (
    <div className="group flex items-start gap-3 py-2.5 border-b border-neutral-100 last:border-b-0">
      <span
        aria-hidden
        className="select-none text-neutral-300 text-[14px] leading-6 pt-0.5 cursor-grab"
        title="Drag to reorder (coming soon)"
      >
        ⋮⋮
      </span>

      <div className="flex-1 min-w-0">
        <input
          type="text"
          value={item.text}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent text-[16px] text-neutral-800 focus:outline-none focus:bg-bg-base rounded px-1 -mx-1"
        />
        {dayContext && (
          <div className="mt-0.5 text-[13px] italic font-display text-neutral-500 px-1">
            {dayContext}
          </div>
        )}
      </div>

      {item.fromRecipeIds.length > 1 && (
        <span className="text-[11px] uppercase tracking-wider font-bold text-neutral-400 mt-1.5 shrink-0">
          {item.fromRecipeIds.length}×
        </span>
      )}

      <button
        onClick={onRemove}
        className="text-neutral-300 hover:text-accent-500 px-1 mt-0.5 text-[18px] leading-none opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Remove"
      >
        ×
      </button>
    </div>
  )
}
