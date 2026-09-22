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
    // Wraps on phones: in one row at 390px the chips squeezed into narrow
    // columns and the last one was pushed off-screen.
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pb-5 border-b-2 border-neutral-800">
      <span className="text-[12px] font-bold uppercase tracking-widest text-neutral-500">Show:</span>
      {FILTERS.map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={() => onChange(f.id)}
          aria-pressed={active === f.id}
          className={`whitespace-nowrap px-4 py-1.5 rounded-full text-[13px] font-medium transition ${
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
