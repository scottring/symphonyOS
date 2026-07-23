import { useEffect, useRef, useState } from 'react'

interface PlanningSlotQuickCreateProps {
  /** DOM node of the clicked slot — the popover anchors just right of it. */
  anchorEl: HTMLElement
  onSubmit: (title: string) => void
  onCancel: () => void
}

// Small, unobtrusive click-to-create popover for an empty week-grid slot
// (week-grid-click spec). Title only — no duration/type picker, matching the
// non-goals in the spec. Enter creates, Escape or an outside click cancels.
export function PlanningSlotQuickCreate({ anchorEl, onSubmit, onCancel }: PlanningSlotQuickCreateProps) {
  const [title, setTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Click-outside to cancel — same pattern as SlotQuickCreatePopover (home/week).
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onCancel()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onCancel])

  const rect = anchorEl.getBoundingClientRect()
  const style: React.CSSProperties = {
    position: 'fixed',
    top: rect.top,
    left: Math.min(rect.left + rect.width + 8, window.innerWidth - 240),
    width: 220,
    zIndex: 60,
  }

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Create task"
      style={style}
      className="card p-2 shadow-xl"
    >
      <input
        ref={inputRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            const trimmed = title.trim()
            if (trimmed) onSubmit(trimmed)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            onCancel()
          }
        }}
        placeholder="New task"
        className="input-base w-full text-sm"
      />
    </div>
  )
}
