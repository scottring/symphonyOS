import { useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import type { RecurrencePattern } from '@/types/actionable'
import type { DomainId } from '@/lib/domains'

/** A routine born from a slot. The slot supplies the recurrence, so a name is
 *  the only thing left to ask for. `assigned_to` carries the Routines page's
 *  member lens, when one is locked in. */
export interface SlotRoutineDraft {
  name: string
  recurrence_pattern: RecurrencePattern
  time_of_day?: string
  assigned_to?: string | null
}

export type CreateRoutineInSlot = (draft: SlotRoutineDraft) => void

/** What a slot-created routine's context/assigned_to should be. A domain
 *  lens (soleDomain) always wins — same rule as a deliberate create. With no
 *  domain lens, a locked-in member lens shares only with that person;
 *  otherwise ("Everyone", no lens at all) it goes to the whole family. */
export function resolveSlotRoutineFields(
  soleDomain: DomainId | null,
  assignedTo: string | null | undefined,
): { context: DomainId | undefined; assigned_to: string | null | undefined } {
  return {
    context: soleDomain ?? (assignedTo ? undefined : 'family'),
    assigned_to: assignedTo,
  }
}

/**
 * The bare input half. Exported on its own for slots whose *position* carries
 * the meaning — the arc's axis, where where-you-click is the time, so the host
 * opens the input at a point rather than parking a button somewhere.
 */
export function SlotAddInput({ placeholder, onCreate, onCancel }: {
  placeholder: string
  onCreate: (name: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLInputElement>(null)

  return (
    <input
      ref={ref}
      autoFocus
      value={value}
      placeholder={placeholder}
      aria-label={placeholder}
      onChange={e => setValue(e.target.value)}
      onBlur={onCancel}
      onKeyDown={e => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onCancel()
          return
        }
        if (e.key !== 'Enter') return
        e.preventDefault()
        // A nameless routine is not a routine. Hold the box open rather than
        // silently discarding what looks to the user like a submission.
        const name = value.trim()
        if (!name) return
        onCreate(name)
        setValue('')
      }}
      className="w-full rounded-lg border border-emerald-300 bg-white px-2 py-1 text-xs
                 text-neutral-700 outline-none focus:border-emerald-500"
    />
  )
}

/**
 * Create a routine in the slot you are looking at. The slot supplies the
 * recurrence — a Tuesday column means weekly-on-Tuesday, an October row means
 * yearly-in-October — which is why a one-line name is enough here, where the
 * Today timeline has to hand off to the full form.
 */
export function SlotAdd({ label, onCreate, alwaysVisible = false }: {
  label: string
  onCreate: (name: string) => void
  /** Empty slots keep the affordance on screen; busy ones reveal it on hover. */
  alwaysVisible?: boolean
}) {
  const [open, setOpen] = useState(false)

  if (open) {
    return (
      <SlotAddInput
        placeholder={label}
        onCreate={name => { onCreate(name); setOpen(false) }}
        onCancel={() => setOpen(false)}
      />
    )
  }

  return (
    <button
      onClick={() => setOpen(true)}
      aria-label={label}
      title={label}
      className={`flex w-full items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-neutral-400
                  transition-opacity hover:bg-emerald-50/60 hover:text-emerald-700
                  ${alwaysVisible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}`}
    >
      <Plus className="h-3 w-3" />
      add
    </button>
  )
}
