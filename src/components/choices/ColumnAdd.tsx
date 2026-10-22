import { useState } from 'react'
import type { ChoiceColumn, ColumnKind } from '@/types/choice'
import { inputClass, linkButton, primaryButton, quietButton } from './DialogFrame'
import { PopMenu } from './StatusMenu'

const KINDS: { kind: ColumnKind; label: string }[] = [
  { kind: 'text', label: 'Text' },
  { kind: 'money', label: 'Money' },
  { kind: 'date', label: 'Date' },
  { kind: 'yesno', label: 'Yes/no' },
]

/** "+ Column": a name and one of four kinds. */
export function ColumnAdd({ onAdd }: { onAdd: (label: string, kind: ColumnKind) => Promise<boolean> }) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [kind, setKind] = useState<ColumnKind>('text')
  const close = () => { setOpen(false); setLabel(''); setKind('text') }
  const add = async () => {
    if (!label.trim()) return
    if (await onAdd(label.trim(), kind)) close()
  }
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={linkButton}>+ Column</button>
  return (
    <div className="w-56 space-y-2 text-left font-normal">
      <input
        autoFocus
        aria-label="Column name"
        placeholder="Column name"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') void add(); if (e.key === 'Escape') close() }}
        className={inputClass}
      />
      <div className="flex flex-wrap gap-1.5">
        {KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            aria-pressed={kind === k.kind}
            onClick={() => setKind(k.kind)}
            className={`rounded-full border px-2.5 py-0.5 text-[12px] ${
              kind === k.kind ? 'border-primary-400 bg-primary-50 text-primary-700' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>
      <div className="flex justify-end gap-1">
        <button type="button" onClick={close} className={quietButton}>Cancel</button>
        <button type="button" disabled={!label.trim()} onClick={() => void add()} className={primaryButton}>Add</button>
      </div>
    </div>
  )
}

/** A column heading's menu: Rename or Remove. Removing keeps the values. */
export function ColumnMenu({ column, onRename, onRemove }: {
  column: ChoiceColumn
  onRename: (label: string) => Promise<boolean>
  onRemove: () => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [label, setLabel] = useState(column.label)
  const save = async () => {
    const next = label.trim()
    if (!next || next === column.label) { setRenaming(false); return }
    if (await onRename(next)) setRenaming(false)
  }
  if (renaming) {
    return (
      <input
        autoFocus
        aria-label="Column name"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') setRenaming(false) }}
        onBlur={() => void save()}
        className="mt-1 block w-28 rounded-md border border-neutral-200 bg-white px-2 py-0.5 text-[12px] font-normal focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
    )
  }
  return (
    <PopMenu
      label={`${column.label} options`}
      trigger="▾"
      className="ml-1 text-neutral-400 hover:text-neutral-700"
      items={[
        { label: 'Rename', onPick: () => { setLabel(column.label); setRenaming(true) } },
        { label: 'Remove', onPick: onRemove, danger: true },
      ]}
    />
  )
}
