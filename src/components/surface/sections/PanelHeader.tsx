import { useState } from 'react'

interface PanelHeaderProps {
  title: string
  onTitleChange: (next: string) => void
  onClose: () => void
}

export function PanelHeader({ title, onTitleChange, onClose }: PanelHeaderProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)

  function commit() {
    setEditing(false)
    if (draft.trim() && draft !== title) onTitleChange(draft.trim())
  }

  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          className="flex-1 text-lg font-display font-semibold bg-transparent border-b border-neutral-300 focus:outline-none focus:border-primary-500"
        />
      ) : (
        <button
          onClick={() => { setDraft(title); setEditing(true) }}
          className="flex-1 text-left text-lg font-display font-semibold text-neutral-900 hover:text-primary-700"
        >
          {title}
        </button>
      )}
      <button
        onClick={onClose}
        aria-label="Close"
        className="text-neutral-400 hover:text-neutral-700 text-xl leading-none mt-1"
      >
        ×
      </button>
    </div>
  )
}
