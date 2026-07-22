import { useEffect, useRef, useState } from 'react'
import type { RhythmCard } from './rhythmModel'

/** Inline popover under an auto-group title: name it into a rhythm, or fold
 *  its members into an existing routine (exact name match folds too). */
export function GroupNamePopover({ card, foldTargets, onName, onFoldInto, onClose }: {
  card: RhythmCard
  foldTargets: { id: string; name: string }[]
  onName: (card: RhythmCard, name: string) => void
  onFoldInto: (targetId: string, memberIds: string[]) => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const memberIds = card.routines.map(r => r.id)
  const targets = foldTargets.filter(t => !memberIds.includes(t.id))
  const typed = name.trim().toLowerCase()
  const suggestions = targets.filter(t => !typed || t.name.toLowerCase().includes(typed)).slice(0, 4)

  const submit = () => {
    if (!name.trim()) return
    const exact = targets.find(t => t.name.toLowerCase() === typed)
    if (exact) onFoldInto(exact.id, memberIds)
    else onName(card, name.trim())
    onClose()
  }

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [onClose])

  return (
    <div
      ref={rootRef}
      className="absolute left-0 top-full z-30 mt-1 w-56 rounded-xl border border-neutral-200 bg-white p-2.5 shadow-lg"
      onClick={e => e.stopPropagation()}
      draggable
      onDragStart={e => { e.preventDefault(); e.stopPropagation() }}
    >
      <input
        autoFocus
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') onClose()
        }}
        placeholder="Name this rhythm"
        className="w-full rounded-lg border border-neutral-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
      />
      {suggestions.length > 0 && (
        <div className="mt-1.5 flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-neutral-400">or add these into</span>
          {suggestions.map(t => (
            <button
              key={t.id}
              onClick={() => { onFoldInto(t.id, memberIds); onClose() }}
              className="text-left text-xs rounded-lg bg-emerald-50 px-2 py-1 text-emerald-900 hover:bg-emerald-100 transition-colors"
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
