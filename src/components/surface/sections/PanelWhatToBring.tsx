import { useState } from 'react'
import { PanelSection } from './PanelSection'

interface PanelWhatToBringProps {
  notes: string | undefined
  /** Optional. When absent the section is display-only (PanelLinks pattern). */
  onChange?: (next: string) => void
}

export function PanelWhatToBring({ notes, onChange }: PanelWhatToBringProps) {
  const [draft, setDraft] = useState(notes ?? '')
  const hasText = (notes ?? '').trim().length > 0
  if (!hasText && !onChange) return null

  return (
    <PanelSection id="what-to-bring" label="What to bring" preview={hasText ? (notes ?? '').trim().slice(0, 60) : undefined}>
      {onChange ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { if (draft !== (notes ?? '')) onChange(draft) }}
          placeholder="Add notes…"
          rows={2}
          className="w-full text-sm px-2 py-1.5 rounded-md bg-transparent text-neutral-700 placeholder:text-neutral-400 focus:outline-none focus:bg-neutral-50 hover:bg-neutral-50 resize-none"
        />
      ) : (
        <p className="text-sm text-neutral-700 whitespace-pre-wrap">{notes}</p>
      )}
    </PanelSection>
  )
}
