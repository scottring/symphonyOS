import { useState, useEffect, useCallback, useRef } from 'react'

export type InsertKind = 'note' | 'task' | 'event' | 'routine'

const SEGMENTS: { kind: InsertKind; label: string; icon: string }[] = [
  { kind: 'note', label: 'Note', icon: '📝' },
  { kind: 'task', label: 'Task', icon: '✅' },
  { kind: 'event', label: 'Event', icon: '📅' },
  { kind: 'routine', label: 'Routine', icon: '🔁' },
]

interface Props {
  onPick: (kind: InsertKind) => void
}

export function TimelineInsertPoint({ onPick }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDocClick)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDocClick) }
  }, [open])

  const pick = useCallback((k: InsertKind) => { setOpen(false); onPick(k) }, [onPick])

  return (
    <div ref={rootRef} className="relative flex items-center justify-center h-6 group">
      <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-neutral-200 opacity-40 group-hover:opacity-100 transition-opacity" />
      <button
        type="button"
        aria-label="Add between items"
        onClick={() => setOpen(v => !v)}
        className="relative z-10 w-7 h-7 min-w-[28px] rounded-full bg-primary-500 text-white text-base leading-none flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 focus-visible:opacity-100 md:opacity-0 max-md:opacity-100 transition-opacity"
      >+</button>

      {open && (
        <div role="menu" className="absolute z-20 bottom-8 flex gap-2 bg-white border border-neutral-200 rounded-2xl shadow-lg px-3 py-2">
          {SEGMENTS.map(s => (
            <button
              key={s.kind}
              type="button"
              aria-label={s.label}
              onClick={() => pick(s.kind)}
              className="w-16 h-16 min-w-[64px] rounded-xl border border-neutral-200 bg-white flex flex-col items-center justify-center gap-1 text-xs hover:bg-primary-50 active:scale-95 transition"
            >
              <span className="text-xl">{s.icon}</span>{s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
