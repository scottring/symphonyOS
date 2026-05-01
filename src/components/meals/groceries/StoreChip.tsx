import { useEffect, useRef, useState } from 'react'

interface Store {
  id: string
  title: string
}

interface Props {
  selectedListId: string
  stores: Store[]
  onSelect: (listId: string) => void
}

/** Compact chip showing the destination store. Tap to choose another. */
export function StoreChip({ selectedListId, stores, onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = stores.find(s => s.id === selectedListId)
  const label = current?.title ?? '?'

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
        className="text-[11px] uppercase tracking-wider text-neutral-500 hover:text-primary-500 px-2 py-0.5 rounded-full border border-neutral-200 hover:border-primary-200 transition-colors"
        title={`Destination: ${label}`}
      >
        → {label}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 w-52 rounded-lg border border-neutral-200 bg-bg-elevated shadow-card overflow-hidden">
          {stores.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => { onSelect(s.id); setOpen(false) }}
              className={`w-full text-left px-3 py-2 text-[13px] hover:bg-primary-50 ${s.id === selectedListId ? 'bg-primary-50 text-primary-700' : 'text-neutral-700'}`}
            >
              {s.title}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
