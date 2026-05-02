import { useEffect, useMemo, useRef, useState } from 'react'
import type { MealPlanEntry, MealSlot } from '@/types/meal-planner'
import type { FamilyMember } from '@/types/family'

interface Props {
  isOpen: boolean
  onClose: () => void
  prep: { id: string; title: string; recipeId?: string; adHocTitle?: string }
  /** All entries on the current plan, used to compute existing leftover state. */
  allEntries: MealPlanEntry[]
  familyMembers: FamilyMember[]
  /** Add a leftover entry at (day, slot, familyMemberId), referencing prep.id. */
  onAdd: (input: { dayOfWeek: number; slot: MealSlot; familyMemberId: string | null }) => Promise<void>
  /** Remove an entry by id. */
  onRemove: (entryId: string) => Promise<void>
}

const DAYS: { dow: number; label: string }[] = [
  { dow: 0, label: 'Mon' },
  { dow: 1, label: 'Tue' },
  { dow: 2, label: 'Wed' },
  { dow: 3, label: 'Thu' },
  { dow: 4, label: 'Fri' },
  { dow: 5, label: 'Sat' },
  { dow: 6, label: 'Sun' },
]

const SLOTS: { value: MealSlot; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch',     label: 'Lunch' },
  { value: 'snack',     label: 'Snack' },
  { value: 'dinner',    label: 'Dinner' },
]

/** Returns a Map<string, string> of `${dow}|${familyMemberId}` cells that already have
 *  a leftover entry from this prep at the given slot. Map value is the entry id (so we
 *  can remove on uncheck). */
function existingCells(entries: MealPlanEntry[], prepId: string, slot: MealSlot): Map<string, string> {
  const m = new Map<string, string>()
  for (const e of entries) {
    if (e.leftoverFrom !== prepId) continue
    if (e.slot !== slot) continue
    const memberKey = e.familyMemberId ?? 'family'
    m.set(`${e.dayOfWeek}|${memberKey}`, e.id)
  }
  return m
}

export function DistributeLeftoversModal({
  isOpen, onClose, prep, allEntries, familyMembers, onAdd, onRemove,
}: Props) {
  const [slot, setSlot] = useState<MealSlot>('lunch')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const cancelRef = useRef<HTMLButtonElement | null>(null)

  const existing = useMemo(() => existingCells(allEntries, prep.id, slot), [allEntries, prep.id, slot])

  // When the modal opens (or slot changes), seed `selected` with what's already there.
  useEffect(() => {
    if (!isOpen) return
    setSelected(new Set(existing.keys()))
  }, [isOpen, slot, existing])

  // Escape closes; autofocus Cancel.
  useEffect(() => {
    if (!isOpen) return
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  // Members + a synthetic "Whole family" row (familyMemberId = null) for shared meals.
  const rows: { key: string; label: string; familyMemberId: string | null }[] = [
    { key: 'family', label: 'Whole family', familyMemberId: null },
    ...familyMembers.map(m => ({ key: m.id, label: m.name, familyMemberId: m.id })),
  ]

  const toggle = (dow: number, memberKey: string) => {
    const cell = `${dow}|${memberKey}`
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(cell)) next.delete(cell)
      else next.add(cell)
      return next
    })
  }

  const handleSave = async () => {
    setBusy(true)
    try {
      // Diff vs existing.
      // ADD: in selected, not in existing.
      for (const cell of selected) {
        if (existing.has(cell)) continue
        const [dowStr, memberKey] = cell.split('|')
        const dayOfWeek = parseInt(dowStr, 10)
        const familyMemberId = memberKey === 'family' ? null : memberKey
        await onAdd({ dayOfWeek, slot, familyMemberId })
      }
      // REMOVE: in existing, not in selected.
      for (const [cell, entryId] of existing.entries()) {
        if (selected.has(cell)) continue
        await onRemove(entryId)
      }
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="distribute-dialog-title"
    >
      <div className="bg-bg-elevated rounded-2xl shadow-elevated max-w-2xl w-full p-6">
        <div className="text-[0.7rem] font-bold uppercase tracking-[0.25em] text-neutral-500 mb-2">
          DISTRIBUTE LEFTOVERS
        </div>
        <h2 id="distribute-dialog-title" className="font-display text-2xl text-neutral-800 mb-2">
          {prep.title}
        </h2>
        <p className="text-[13px] text-neutral-600 mb-4">
          Tap a cell to schedule a leftover meal. Existing leftovers are pre-selected.
        </p>

        <div className="flex items-center gap-2 mb-4">
          <span className="text-[12px] uppercase tracking-wider text-neutral-500">Slot:</span>
          <select
            value={slot}
            onChange={e => setSlot(e.target.value as MealSlot)}
            className="px-2 py-1 rounded-md bg-bg-base border border-neutral-200 text-[13px] focus:outline-none focus:border-primary-500"
          >
            {SLOTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="text-left text-[11px] uppercase tracking-wider text-neutral-500 pb-2">Eater</th>
                {DAYS.map(d => (
                  <th key={d.dow} className="text-center text-[11px] uppercase tracking-wider text-neutral-500 pb-2 px-1">
                    {d.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.key} className="border-t border-neutral-100">
                  <td className="py-2 text-[14px] font-medium text-neutral-700">{r.label}</td>
                  {DAYS.map(d => {
                    const cell = `${d.dow}|${r.key}`
                    const isSelected = selected.has(cell)
                    return (
                      <td key={d.dow} className="text-center px-1">
                        <button
                          type="button"
                          onClick={() => toggle(d.dow, r.key)}
                          aria-label={`${r.label} ${d.label} — ${isSelected ? 'selected' : 'not selected'}`}
                          className={`h-7 w-7 rounded transition-colors ${isSelected ? 'bg-primary-500 text-white' : 'bg-neutral-100 text-neutral-300 hover:bg-neutral-200'}`}
                        >
                          {isSelected ? '✓' : ''}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            ref={cancelRef}
            onClick={onClose}
            className="px-4 py-2 text-[13px] text-neutral-500 hover:text-neutral-800"
          >
            Cancel
          </button>
          <button
            disabled={busy}
            onClick={handleSave}
            className="px-4 py-2 text-[13px] rounded-lg bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  )
}
