import { useState } from 'react'

interface PanelWhyProps {
  notes: string | undefined
  onChange?: (next: string) => void
  /** Override the default "Why" label. Used by Plan 2 for events ("What to bring"). */
  label?: string
}

export function PanelWhy({ notes, onChange, label = 'Why' }: PanelWhyProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(notes ?? '')

  if (!notes && !onChange) return null

  function commit() {
    setEditing(false)
    if (onChange && draft !== (notes ?? '')) onChange(draft)
  }

  return (
    <section className="mb-4">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 mb-1">{label}</div>
      {editing ? (
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          className="w-full text-sm text-neutral-700 bg-neutral-50 border border-neutral-200 rounded-md p-2 focus:outline-none focus:border-primary-400"
          rows={3}
        />
      ) : (
        <button
          onClick={() => { setDraft(notes ?? ''); setEditing(true) }}
          className="w-full text-left text-sm italic text-neutral-600 border-l-2 border-neutral-300 pl-3 py-1 hover:text-neutral-900"
        >
          {notes || <span className="not-italic text-neutral-400">Add notes…</span>}
        </button>
      )}
    </section>
  )
}
