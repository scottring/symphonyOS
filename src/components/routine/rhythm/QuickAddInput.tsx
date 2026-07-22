import { useState } from 'react'
import { Plus } from 'lucide-react'

/** A quiet "+ add" affordance that expands into an inline input.
 *  Enter creates and closes; Escape or blur-while-empty closes. */
export function QuickAddInput({ label, placeholder, onSubmit, variant = 'row' }: {
  label: string
  placeholder: string
  onSubmit: (name: string) => void
  variant?: 'row' | 'pill'
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        aria-label={label}
        className={
          variant === 'pill'
            ? `rounded-full border border-dashed border-neutral-300 px-3 py-1 text-sm text-neutral-400
               hover:border-amber-300 hover:text-neutral-600 transition-colors inline-flex items-center gap-1`
            : `w-full flex items-center gap-1 rounded-md px-1.5 py-1 text-left text-[11px] text-neutral-300
               hover:bg-neutral-50 hover:text-neutral-500 transition-colors`
        }
      >
        <Plus className={variant === 'pill' ? 'w-3.5 h-3.5' : 'w-3 h-3'} />
        add
      </button>
    )
  }

  return (
    <input
      autoFocus
      value={value}
      onChange={e => setValue(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter' && value.trim()) {
          onSubmit(value.trim())
          setValue('')
          setEditing(false)
        }
        if (e.key === 'Escape') { setValue(''); setEditing(false) }
      }}
      onBlur={() => { if (!value.trim()) setEditing(false) }}
      placeholder={placeholder}
      className={
        variant === 'pill'
          ? `rounded-full border border-amber-300 px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400`
          : `w-full rounded-md border border-amber-300 px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400`
      }
    />
  )
}
