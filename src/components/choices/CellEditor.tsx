import { useRef, useState } from 'react'
import type { CellValue, ChoiceColumn } from '@/types/choice'
import { parseCell } from '@/lib/choices/db'
import { formatCell } from './cells'

const HINT: Record<string, string> = {
  money: 'Use a number, like 19,750',
  date: 'Use a date',
  yesno: 'Use yes or no',
}

const editText = (column: ChoiceColumn, value: CellValue | undefined): string => {
  if (value == null) return ''
  if (column.kind === 'money' && typeof value === 'number') return (value / 100).toLocaleString('en-US')
  return String(value)
}

/** One column value: tap to edit it inline in its kind. Yes/no taps through
 *  blank → Yes → No. A value that doesn't parse shows a hint and isn't saved. */
export function CellEditor({ column, value, optionName, onSave }: {
  column: ChoiceColumn
  value: CellValue | undefined
  optionName: string
  /** A value, or (yes/no) an updater from the latest value. */
  onSave: (value: CellValue | ((prev: CellValue | undefined) => CellValue)) => Promise<boolean> | void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [hint, setHint] = useState<string | null>(null)
  const done = useRef(false)
  const text = formatCell(column, value)
  const label = `${column.label} for ${optionName}`

  if (column.kind === 'yesno') {
    return (
      <button type="button" aria-label={label}
        onClick={() => void onSave((prev) => (prev === true ? false : prev === false ? null : true))}
        className={`text-left hover:text-neutral-900 ${text ? 'text-neutral-800' : 'text-neutral-400'}`}>
        {text ?? '—'}
      </button>
    )
  }

  if (!editing) {
    return (
      <button type="button" aria-label={label}
        onClick={() => { setDraft(editText(column, value)); setHint(null); done.current = false; setEditing(true) }}
        className={`text-left hover:text-neutral-900 ${text ? 'text-neutral-800' : 'text-neutral-400'}`}>
        {text ?? '—'}
      </button>
    )
  }

  const commit = async () => {
    if (done.current) return
    const parsed = parseCell(column.kind, draft)
    if (parsed === undefined) { setHint(HINT[column.kind] ?? null); return }
    const same = (parsed ?? null) === (value ?? null)
    done.current = true
    setEditing(false)
    if (!same) await onSave(parsed)
  }
  return (
    <div>
      <input
        autoFocus
        aria-label={column.label}
        type={column.kind === 'date' ? 'date' : 'text'}
        inputMode={column.kind === 'money' ? 'decimal' : undefined}
        value={draft}
        onChange={(e) => { setDraft(e.target.value); setHint(null) }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void commit()
          if (e.key === 'Escape') { done.current = true; setEditing(false) }
        }}
        onBlur={() => { if (!hint) void commit() }}
        className="w-full min-w-[90px] rounded-md border border-neutral-200 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
      {hint && <div className="mt-1 text-xs text-amber-700">{hint}</div>}
    </div>
  )
}
