// The one page search (layout system, 2026-10-01): a compact, quiet field that
// lives in the masthead's tools row beside the page's action — not a full-width
// white box between the masthead and the list. Notes had this shape first;
// Contacts and the recipe shelf now share it.
import { Search, X } from 'lucide-react'

export function PageSearch({ value, onChange, placeholder, ariaLabel, className = '' }: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  ariaLabel?: string
  className?: string
}) {
  return (
    <label className={`relative block ${className}`}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape' && value) onChange('') }}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className="w-40 rounded-lg border border-neutral-200 bg-transparent py-2 pl-8 pr-7 text-[14px] text-neutral-800 transition-[width] placeholder:text-neutral-400 focus:border-primary-400 focus:bg-bg-elevated/70 focus:outline-none sm:w-48 sm:focus:w-64 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-neutral-400 hover:text-neutral-700"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </label>
  )
}
