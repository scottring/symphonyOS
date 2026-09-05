import { useState, useCallback, useRef, type ReactNode } from 'react'
import { MoreHorizontal } from 'lucide-react'

interface Props {
  /** The secondary controls. Hidden until asked for — not removed. */
  children: ReactNode
}

/**
 * Holds Today's secondary controls behind one button.
 *
 * Today accumulated a permanent control for every feature that ever shipped —
 * roughly fifteen affordances above two tasks. None of them were wrong; they
 * were just all present at once, all the time. This keeps every capability and
 * charges one tap for the ones you don't use daily.
 */
export function TodayOverflowMenu({ children }: Props) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const close = useCallback(() => setOpen(false), [])

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          const rect = triggerRef.current?.getBoundingClientRect()
          setAnchor(rect ? { top: rect.bottom + 4, right: Math.max(8, window.innerWidth - rect.right) } : null)
          setOpen((v) => !v)
        }}
        aria-label="More controls"
        aria-expanded={open}
        title="More controls"
        className="flex items-center rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={close}
            className="fixed inset-0 z-40 cursor-default"
          />
          {/* Fixed at z-[9999], the rule the row menus and pickers already
              follow (ScheduleItemActionsMenu). As `absolute … z-50` inside the
              header this menu lost to the rows below it: their rail cells
              escape to z-[9999] and paint later, so assignee avatars sat on
              top of the menu text (demo walkthrough 2026-09-04). */}
          <div
            role="menu"
            style={{ top: anchor?.top, right: anchor?.right }}
            className="fixed z-[9999] flex min-w-[240px] flex-col items-stretch gap-1 rounded-xl border border-neutral-200 bg-white p-2 shadow-lg"
            onClick={close}
          >
            {children}
          </div>
        </>
      )}
    </div>
  )
}
