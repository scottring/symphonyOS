import { useEffect, useRef, useState } from 'react'
import type { FamilyMember } from '@/types/family'

interface Props {
  preparedBy: string | null
  members: FamilyMember[]
  onAssign: (familyMemberId: string | null) => void
  size?: 'sm' | 'md'
}

/** Compact circular chip showing who is cooking this meal. Tap to reassign.
 *  NULL preparedBy = unassigned (renders as a dim "?"). */
export function CookChip({ preparedBy, members, onAssign, size = 'sm' }: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  // Outside-click + Escape close.
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

  const cook = preparedBy ? members.find(m => m.id === preparedBy) : null
  const initial = cook ? (cook.name?.charAt(0) || '?').toUpperCase() : '?'
  const dim = !cook
  const px = size === 'sm' ? 'h-5 w-5 text-[10px]' : 'h-6 w-6 text-[11px]'

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
        title={cook ? `Cook: ${cook.name}` : 'Assign a cook'}
        aria-label={cook ? `Cook: ${cook.name}` : 'Assign a cook'}
        className={`${px} rounded-full flex items-center justify-center font-medium transition-colors ${dim ? 'bg-neutral-100 text-neutral-400 hover:bg-neutral-200' : 'bg-primary-100 text-primary-700 hover:bg-primary-200'}`}
      >
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 w-44 rounded-lg border border-neutral-200 bg-bg-elevated shadow-card overflow-hidden">
          <button
            type="button"
            onClick={() => { onAssign(null); setOpen(false) }}
            className="w-full text-left px-3 py-2 text-[13px] text-neutral-500 hover:bg-neutral-50"
          >
            Unassigned
          </button>
          {members.map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => { onAssign(m.id); setOpen(false) }}
              className={`w-full text-left px-3 py-2 text-[13px] hover:bg-primary-50 ${m.id === preparedBy ? 'bg-primary-50 text-primary-700' : 'text-neutral-700'}`}
            >
              {m.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
