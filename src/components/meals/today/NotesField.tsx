import { useEffect, useRef, useState } from 'react'

interface Props {
  value?: string
  onChange: (next: string | null) => void
}

/** One italic line. Quiet placeholder. Persistent across the day. */
export function NotesField({ value, onChange }: Props) {
  const [draft, setDraft] = useState(value ?? '')
  const ref = useRef<HTMLInputElement | null>(null)

  // Keep local draft in sync if upstream changes (e.g. fetch).
  useEffect(() => { setDraft(value ?? '') }, [value])

  const commit = () => {
    const next = draft.trim()
    if (next === (value ?? '').trim()) return
    onChange(next.length === 0 ? null : next)
  }

  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-400 mb-1">NOTES</div>
      <input
        ref={ref}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') ref.current?.blur() }}
        placeholder="Easy win. Minimal cleanup."
        className="w-full px-3 py-2 rounded-xl border border-dashed border-neutral-200 bg-bg-base
                   font-display italic text-[1rem] text-neutral-700 placeholder:text-neutral-400
                   focus:border-primary-300 focus:outline-none"
      />
    </div>
  )
}
