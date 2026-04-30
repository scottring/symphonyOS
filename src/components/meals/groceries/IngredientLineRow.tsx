import type { ConsolidatedIngredient } from '@/lib/consolidateIngredients'

interface Props {
  item: ConsolidatedIngredient
  onChange: (newText: string) => void
  onRemove: () => void
}

export function IngredientLineRow({ item, onChange, onRemove }: Props) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-neutral-100">
      <input
        type="text"
        value={item.text}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 px-2 py-1 text-[15px] text-neutral-800 bg-transparent focus:outline-none focus:bg-bg-base rounded"
      />
      {item.fromRecipeIds.length > 1 && (
        <span className="text-[11px] uppercase tracking-wider font-bold text-neutral-400 mt-1.5">
          {item.fromRecipeIds.length}×
        </span>
      )}
      <button onClick={onRemove}
              className="text-neutral-400 hover:text-accent-500 px-2 mt-0.5 text-[16px]"
              aria-label="Remove">
        ×
      </button>
    </div>
  )
}
