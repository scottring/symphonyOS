import type { ReactNode } from 'react'
import type { WorkPiece } from '@/types/choice'

interface Props {
  work: readonly WorkPiece[]
  selected: readonly string[]
  onToggle: (id: string) => void
  /** Place for "Edit the work" (Task 6). */
  action?: ReactNode
  /** A decided choice: the pieces show, but don't toggle. */
  disabled?: boolean
}

export function WorkBar({ work, selected, onToggle, action, disabled }: Props) {
  if (work.length === 0) return null
  return (
    <section className="mb-5 rounded-xl border border-neutral-200 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 text-[13px]">
        <b className="font-semibold text-neutral-800">The work</b>
        {!disabled && <span className="text-neutral-500">Tap to change what you're pricing.</span>}
        {action && <span className="ml-auto">{action}</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        {work.map((w) => {
          const on = selected.includes(w.id)
          return (
            <button
              key={w.id}
              type="button"
              aria-pressed={on}
              disabled={disabled}
              onClick={() => onToggle(w.id)}
              className={`min-w-[150px] max-w-[260px] rounded-lg border px-3 py-2 text-left transition-colors ${
                on ? 'border-primary-400 bg-primary-50' : `border-neutral-200 bg-white ${disabled ? '' : 'hover:bg-neutral-50'}`
              }`}
            >
              <b className="block text-sm font-medium text-neutral-900">{w.label}</b>
              {w.description && <small className="mt-0.5 block text-xs leading-snug text-neutral-500">{w.description}</small>}
            </button>
          )
        })}
      </div>
    </section>
  )
}
