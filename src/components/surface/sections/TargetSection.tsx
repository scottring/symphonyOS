import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { TargetUnit } from '@/types/actionable'

interface TargetSectionProps {
  amount: number | null
  unit: TargetUnit | null
  onChange: (t: { amount: number; unit: TargetUnit } | null) => void
}

const UNITS: { value: TargetUnit; label: string }[] = [
  { value: 'minutes', label: 'Minutes' },
  { value: 'count', label: 'Count' },
]

export function TargetSection({ amount, unit, onChange }: TargetSectionProps) {
  const [open, setOpen] = useState(amount != null)
  const [draftAmount, setDraftAmount] = useState(amount != null ? String(amount) : '')
  const [draftUnit, setDraftUnit] = useState<TargetUnit>(unit ?? 'minutes')

  const report = (value: string, nextUnit: TargetUnit) => {
    const parsed = Number(value)
    if (value !== '' && parsed > 0) {
      onChange({ amount: parsed, unit: nextUnit })
    }
  }

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setDraftAmount(value)
    report(value, draftUnit)
  }

  const handleUnitChange = (nextUnit: TargetUnit) => {
    setDraftUnit(nextUnit)
    report(draftAmount, nextUnit)
  }

  const handleClear = () => {
    setOpen(false)
    setDraftAmount('')
    setDraftUnit('minutes')
    onChange(null)
  }

  return (
    <section className="pb-4 mb-4 border-b border-neutral-200">
      <h3 className="text-sm font-medium text-neutral-700 mb-2">Daily target</h3>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700"
        >
          <Plus className="w-4 h-4" /> Add a daily target
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="number"
            min={0}
            inputMode="numeric"
            aria-label="Target amount"
            value={draftAmount}
            onChange={handleAmountChange}
            className="w-20 rounded-lg border border-neutral-200 px-2 py-1 text-sm text-neutral-700"
          />
          <div className="flex gap-2">
            {UNITS.map(u => (
              <button
                key={u.value}
                type="button"
                aria-pressed={draftUnit === u.value}
                onClick={() => handleUnitChange(u.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${draftUnit === u.value ? 'bg-primary-600 text-white' : 'bg-neutral-100 text-neutral-700'}`}
              >
                {u.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleClear}
            className="text-sm font-medium text-neutral-500 hover:text-red-600"
          >
            Clear
          </button>
        </div>
      )}
    </section>
  )
}
