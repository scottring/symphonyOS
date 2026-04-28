import type { RecipeFilter } from '@/hooks/useRecipes'

interface Props {
  active: RecipeFilter
  onChange: (filter: RecipeFilter) => void
}

const FILTERS: Array<{ id: RecipeFilter; label: string }> = [
  { id: 'all',           label: 'All' },
  { id: 'quick',         label: 'Quick (<30m)' },
  { id: 'kids_eat',      label: 'Both kids will eat' },
  { id: 'never_cooked',  label: 'Never cooked' },
  { id: 'prep_friendly', label: 'Prep-friendly' },
]

export function ShelfFilterRow({ active, onChange }: Props) {
  return (
    <div className="flex items-center gap-3 pb-5 border-b-2 border-neutral-800">
      <span className="text-[12px] font-bold uppercase tracking-widest text-neutral-500">Show:</span>
      {FILTERS.map((f) => (
        <button
          key={f.id}
          onClick={() => onChange(f.id)}
          className={`px-4 py-1.5 rounded-full text-[13px] font-medium transition ${
            active === f.id
              ? 'bg-neutral-800 text-white'
              : 'text-neutral-600 hover:bg-neutral-100'
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  )
}
