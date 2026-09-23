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
    <div className="flex items-start justify-between gap-3">
      {editing ? (
        <input
          autoFocus
          aria-label="Title"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            // Escape cancels the edit; consumed so the panel itself stays open.
            if (e.key === 'Escape') { e.preventDefault(); setDraft(title); setEditing(false) }
          }}
          className="flex-1 border-b border-neutral-300 bg-transparent font-display text-[22px] leading-tight focus:border-primary-500 focus:outline-none"
        />
      ) : (
        <button
          onClick={() => { setDraft(title); setEditing(true) }}
          className="flex-1 text-left font-display text-[22px] leading-tight text-neutral-900 hover:text-primary-700"
        >
          {title}
        </button>
      )}
      <button
        onClick={onClose}
        aria-label="Close"
        className="panel-close -mt-1 -mx-2 -mb-2 p-2 text-xl leading-none text-neutral-400 hover:text-neutral-700"
      >
        ×
      </button>
    </div>
  )
}
