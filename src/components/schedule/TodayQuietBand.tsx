import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { TimelineItem } from '@/types/timeline'
import type { FamilyMember } from '@/types/family'
import type { QuietBand } from '@/lib/today/dayRoutines'
import { formatTimeLong } from '@/lib/timeUtils'
import { usePopoverFocus } from '@/hooks/usePopoverFocus'
import { timedRoutineRows } from '@/lib/today/dayRoutines'
import { RoutineRow } from './TodayRoutineChecklist'

const MENU_WIDTH = 340

/**
 * A quiet band on the day grid: the time routines off the grid take. It names
 * them, and a click opens them as the checklist's rows — tick one off, open
 * it, or keep it on the grid (Scott, 2026-11-10: "2 routines" with no way in
 * was no help). A Background routine is in no checklist, so here is where it
 * can be reached; it has no pin, since Background keeps it off the grid.
 */
export function TodayQuietBand({ band, style, peopleOf, onSelect, onToggleDone, onPin }: {
  band: QuietBand
  style: CSSProperties
  peopleOf: (item: TimelineItem) => FamilyMember[]
  onSelect: (id: string) => void
  onToggleDone?: (item: TimelineItem) => void
  onPin?: (item: TimelineItem) => void
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; above: boolean } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  usePopoverFocus(open, triggerRef, menuRef, () => setOpen(false))

  const rows = timedRoutineRows(band.items)
  const names = rows.map((r) => r.item.title)
  const label = `${formatTimeLong(band.start)}: ${names.join(', ')}`

  const toggle = () => {
    if (open || !triggerRef.current) { setOpen(false); return }
    const r = triggerRef.current.getBoundingClientRect()
    const height = 16 + rows.length * 40
    const above = window.innerHeight - r.bottom < height && r.top > height
    const left = Math.max(8, Math.min(r.left, window.innerWidth - MENU_WIDTH - 8))
    setPos({ top: above ? r.top - 6 : r.bottom + 6, left, above })
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const outside = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', outside)
    document.addEventListener('touchstart', outside)
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('touchstart', outside) }
  }, [open])

  // Nothing to name (no routine has a time): the band only holds the time.
  if (rows.length === 0) {
    return <div className="today-scale-quiet" style={style}>{band.count} {band.count === 1 ? 'routine' : 'routines'}</div>
  }

  return (
    <>
      <button ref={triggerRef} type="button" className={`today-scale-quiet is-opener${open ? ' is-open' : ''}`} style={style}
        aria-haspopup="dialog" aria-expanded={open} aria-label={`Routines at ${label}`} title={names.join(' · ')}
        onClick={toggle}>
        <span className="today-scale-quiet-names">
          {rows.map(({ item }, i) => (
            <span key={item.id}>
              {i > 0 && ' · '}<span className={item.completed || item.skipped ? 'is-done' : undefined}>{item.title}</span>
            </span>
          ))}
        </span>
      </button>
      {open && pos && createPortal(
        <div ref={menuRef} role="dialog" aria-label={`Routines at ${formatTimeLong(band.start)}`} className="today-quiet-pop"
          style={{ top: pos.top, left: pos.left, width: MENU_WIDTH, transform: pos.above ? 'translateY(-100%)' : undefined }}>
          <ul className="today-routines-list">
            {rows.map(({ item, start }) => (
              <RoutineRow key={item.id} item={item} start={start} peopleOf={peopleOf}
                onSelect={(id) => { setOpen(false); onSelect(id) }}
                onToggleDone={(it) => onToggleDone?.(it)}
                onPin={onPin && !item.originalRoutine?.background ? (it) => { setOpen(false); onPin(it) } : undefined} />
            ))}
          </ul>
        </div>,
        document.body,
      )}
    </>
  )
}
