// One filter control for the phone Today header (Scott, 2026-09-22): life
// areas and people in a single sheet, instead of a domain button in its own
// header row plus a separate person button. The trigger carries a dot when
// anything is narrowed, so a filtered view never passes for the whole day.
import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, SlidersHorizontal } from 'lucide-react'
import { useDomain } from '@/hooks/useDomain'
import { useDialogFocus } from '@/hooks/useDialogFocus'
import { LAYER_ROWS } from '@/components/domain/DomainSwitcher'
import type { FamilyMember } from '@/types/family'

interface PhoneFilterControlProps {
  /** Empty = everyone; 'unassigned' = unassigned only (AssigneeFilter's contract). */
  selectedAssignees?: string[]
  onSelectAssignees?: (ids: string[]) => void
  assigneesWithTasks?: FamilyMember[]
  hasUnassignedTasks?: boolean
}

function CheckRow({ on, disabled, label, onClick, color }: {
  on: boolean; disabled?: boolean; label: string; onClick: () => void; color?: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[15px] ${on ? 'text-neutral-800' : 'text-neutral-500'} disabled:cursor-default`}
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${on ? 'border-transparent' : 'border-neutral-300'}`}
        style={on ? { background: color ?? 'var(--color-primary-600)' } : undefined}
      >
        {on && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
      </span>
      <span className="flex-1">{label}</span>
    </button>
  )
}

export function PhoneFilterControl({
  selectedAssignees = [],
  onSelectAssignees,
  assigneesWithTasks = [],
  hasUnassignedTasks = false,
}: PhoneFilterControlProps) {
  const { layers, toggle, all } = useDomain()
  const [open, setOpen] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)
  useDialogFocus(open, sheetRef, () => setOpen(false))

  const domainsNarrowed = LAYER_ROWS.some((r) => !layers.has(r.id))
  const peopleNarrowed = selectedAssignees.length > 0
  const active = domainsNarrowed || peopleNarrowed
  const showPeople = !!onSelectAssignees && (assigneesWithTasks.length > 0 || hasUnassignedTasks)

  const togglePerson = (id: string) => {
    if (!onSelectAssignees) return
    onSelectAssignees(selectedAssignees.includes(id)
      ? selectedAssignees.filter((s) => s !== id)
      : [...selectedAssignees, id])
  }
  const clear = () => {
    all()
    onSelectAssignees?.([])
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={active ? 'Filters, on' : 'Filters'}
        title={active ? 'Filters are on' : 'Filters'}
        className={`relative inline-flex h-10 w-10 items-center justify-center rounded-lg ${active ? 'bg-primary-50 text-primary-700' : 'text-neutral-500'}`}
      >
        <SlidersHorizontal className="h-[18px] w-[18px]" aria-hidden="true" />
        {active && <span data-testid="filters-on-dot" aria-hidden="true" className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary-600" />}
      </button>

      {open && createPortal(
        <>
          <div className="fixed inset-0 z-50 bg-black/30" onClick={() => setOpen(false)} />
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="Filters"
            className="fixed bottom-0 left-0 right-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-bg-elevated px-4 pt-3"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
          >
            <div className="mb-2 flex justify-center"><div className="h-1 w-10 rounded-full bg-neutral-300" /></div>

            <section aria-labelledby="phone-filter-areas">
              <h3 id="phone-filter-areas" className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Life areas</h3>
              {LAYER_ROWS.map(({ id, label, color }) => {
                const on = layers.has(id)
                return (
                  <CheckRow key={id} on={on} label={label} color={color}
                    // The last checked area stays on — an empty lens shows nothing.
                    disabled={on && layers.size === 1}
                    onClick={() => toggle(id)} />
                )
              })}
            </section>

            {showPeople && (
              <section aria-labelledby="phone-filter-people" className="mt-3">
                <h3 id="phone-filter-people" className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">People</h3>
                <CheckRow on={!peopleNarrowed} label="Everyone" onClick={() => onSelectAssignees?.([])} />
                {assigneesWithTasks.map((m) => (
                  <CheckRow key={m.id} on={selectedAssignees.includes(m.id)} label={m.name} onClick={() => togglePerson(m.id)} />
                ))}
                {hasUnassignedTasks && (
                  <CheckRow on={selectedAssignees.includes('unassigned')} label="Unassigned" onClick={() => togglePerson('unassigned')} />
                )}
              </section>
            )}

            <div className="mt-4 flex items-center gap-3">
              <button type="button" onClick={clear} disabled={!active}
                className="flex-1 rounded-xl border border-neutral-200 py-3 text-sm font-medium text-neutral-600 disabled:opacity-40">
                Show everything
              </button>
              <button type="button" onClick={() => setOpen(false)}
                className="flex-1 rounded-xl bg-primary-600 py-3 text-sm font-semibold text-white">
                Done
              </button>
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  )
}
