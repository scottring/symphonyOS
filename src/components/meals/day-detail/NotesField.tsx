import { useEffect, useRef, useState } from 'react'

interface Props {
  value: string
  placeholder?: string
  onCommit?: (next: string) => void | Promise<void>
}

/** Dashed-border italic notes field at the bottom of the day detail page.
 *  Holds soft, hand-feel sentences like "Easy win. Minimal clean-up." */
export function NotesField({ value, placeholder, onCommit }: Props) {
  const [draft, setDraft] = useState(value)
  const original = useRef(value)

  useEffect(() => {
    setDraft(value)
    original.current = value
  }, [value])

  const handleBlur = () => {
    const next = draft.trim()
    if (next !== original.current.trim()) {
      original.current = next
      void onCommit?.(next)
    }
  }

  return (
    <div className="mt-8">
      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-neutral-400 mb-2">
        NOTES
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleBlur}
        placeholder={placeholder ?? 'Add a note about this day…'}
        rows={2}
        className="w-full px-4 py-3 rounded-xl bg-bg-elevated/40
                   border-2 border-dashed border-neutral-200
                   focus:border-primary-200 focus:outline-none
                   font-display italic text-[1.05rem] text-neutral-700
                   placeholder:text-neutral-400 placeholder:italic
                   resize-none transition-colors"
      />
    </div>
  )
}
