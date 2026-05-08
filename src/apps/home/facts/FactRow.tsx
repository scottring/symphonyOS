import { useState } from 'react'
import type { Fact } from '@/types/home'
import { factTypeLabel } from '@/types/home'

const ICON: Record<Fact['type'], string> = {
  wifi: '📶', paint: '🎨', code: '🔢', supply: '📦', measurement: '📏', freetext: '📝',
}

interface Props {
  fact: Fact
  onChange: (patch: Partial<Fact>) => void
  onRemove: () => void
}

export function FactRow({ fact, onChange, onRemove }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(fact)

  if (!editing) {
    return (
      <div className="flex items-center gap-2 py-2 group">
        <span aria-hidden>{ICON[fact.type]}</span>
        <div className="flex-1">
          <div className="text-sm text-neutral-500">{fact.label}</div>
          <div className="text-base">{fact.value}</div>
        </div>
        <button
          className="opacity-0 group-hover:opacity-100 text-sm text-neutral-500 hover:text-neutral-800"
          onClick={() => setEditing(true)}
          aria-label={`Edit ${fact.label}`}
        >✎</button>
        <button
          className="opacity-0 group-hover:opacity-100 text-sm text-neutral-400 hover:text-red-600"
          onClick={onRemove}
          aria-label={`Remove ${fact.label}`}
        >✕</button>
      </div>
    )
  }

  return (
    <div className="py-2 space-y-2">
      <select
        className="input-base"
        value={draft.type}
        onChange={(e) => setDraft({ ...draft, type: e.target.value as Fact['type'] })}
        aria-label="Type"
      >
        {(['wifi','paint','code','supply','measurement','freetext'] as const).map((t) => (
          <option key={t} value={t}>{factTypeLabel(t)}</option>
        ))}
      </select>
      <input
        className="input-base"
        placeholder="Label"
        aria-label="Label"
        value={draft.label}
        onChange={(e) => setDraft({ ...draft, label: e.target.value })}
      />
      <input
        className="input-base"
        placeholder="Value"
        aria-label="Value"
        value={draft.value}
        onChange={(e) => setDraft({ ...draft, value: e.target.value })}
      />
      <div className="flex gap-2">
        <button
          className="btn-primary"
          onClick={() => { onChange(draft); setEditing(false) }}
        >Save</button>
        <button
          className="px-3 py-1 text-sm text-neutral-500"
          onClick={() => setEditing(false)}
        >Cancel</button>
      </div>
    </div>
  )
}
