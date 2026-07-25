// src/components/schedule/TaskFateMenu.tsx
//
// The one fate vocabulary, in its compact form.
//
// A task should offer the same verbs wherever you meet it — a wizard review
// row, a Someday row, a shelf pill. The row surfaces render TriageWhenMenu
// inline (a chips row with fan-outs); a compact pill has no room for that, so
// this wraps the SAME TriageWhenMenu in a ⋯-triggered popover instead of
// re-listing the fates as bespoke menu items. Built ON TOP of TriageWhenMenu,
// not beside it, so the temporal vocabulary cannot drift between surfaces —
// same component, same options, same handlers (applyTriageWhen at the caller).
//
// The popover also carries the few verbs that only exist where the task is
// standing: Open (detail panel), surface extras ("Bring to this week" on a
// stale placement), and File under a pick (the month rung's page-side twin of
// the wizard's MoveByPickStep).

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal, ChevronDown, ChevronRight, PanelRight } from 'lucide-react'
import { TriageWhenMenu, type TriageWhen } from './TriageWhenMenu'

export interface TaskFateMenuProps {
  /** Route to a when — callers map it through applyTriageWhen. */
  onPickWhen: (when: TriageWhen) => void
  onPickDate?: (date: Date, isAllDay: boolean) => void
  onComplete?: () => void
  onDelete?: () => void
  /** Open the task's detail surface. */
  onOpen?: () => void
  /** Surface-specific verbs, listed above the when chips (e.g. "Bring to
   *  this week" on a pill stranded by a passed week). */
  extras?: { label: string; onSelect: () => void }[]
  /** File this task under a season pick — threads sourceId/goalId at the
   *  caller. Page-side parity with the wizard's move-by-pick step. */
  fileUnder?: {
    picks: { id: string; title: string; goalName?: string }[]
    onFile: (pickId: string) => void
  }
}

export function TaskFateMenu({ onPickWhen, onPickDate, onComplete, onDelete, onOpen, extras, fileUnder }: TaskFateMenuProps) {
  const [open, setOpen] = useState(false)
  const [picksOpen, setPicksOpen] = useState(false)
  const containerRef = useRef<HTMLSpanElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Portal + fixed positioning (the PushDropdown pattern): a pill can sit at
  // either edge of a wrap lane, so an absolutely-positioned panel clips under
  // the sidebar or off the right edge. Measured and placed by direct style
  // mutation (DOM is the external system here — no setState, no cascading
  // render), clamped to the viewport, flipped above when the bottom is tight.
  // No dep array: every render resets the JSX style to hidden, so every
  // render must re-place before paint.
  useLayoutEffect(() => {
    if (!open) return
    const trigger = containerRef.current?.getBoundingClientRect()
    const panel = panelRef.current
    if (!trigger || !panel) return
    const w = panel.offsetWidth
    const h = panel.offsetHeight
    const left = Math.max(8, Math.min(trigger.right - w, window.innerWidth - w - 8))
    const below = trigger.bottom + 4
    const top = below + h > window.innerHeight - 8 && trigger.top - h - 4 > 8
      ? trigger.top - h - 4
      : below
    panel.style.top = `${top}px`
    panel.style.left = `${left}px`
    panel.style.visibility = 'visible'
  })

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (containerRef.current?.contains(t) || panelRef.current?.contains(t)) return
      setOpen(false); setPicksOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); setPicksOpen(false) }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const close = () => { setOpen(false); setPicksOpen(false) }

  return (
    // Hosts are often draggable (dnd-kit pills, native-drag pills) — the menu
    // must never start a drag or bubble a click into the pill's open-task.
    <span
      ref={containerRef}
      className="relative inline-flex"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label="Task actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="p-0.5 rounded text-neutral-400 hover:text-neutral-700"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          role="menu"
          style={{ top: 0, left: 0, visibility: 'hidden' }}
          className="fixed z-[100] w-max max-w-[26rem] rounded-xl border border-neutral-200 bg-white shadow-lg p-2"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {(onOpen || extras?.length || fileUnder) && (
            <div className="mb-1.5 pb-1.5 border-b border-neutral-100">
              {onOpen && (
                <button role="menuitem" type="button"
                  onClick={() => { close(); onOpen() }}
                  className="w-full flex items-center gap-2 text-left text-sm px-2 py-1.5 rounded-md text-neutral-700 hover:bg-neutral-50">
                  <PanelRight className="w-3.5 h-3.5 text-neutral-400" /> Open
                </button>
              )}
              {extras?.map((x) => (
                <button key={x.label} role="menuitem" type="button"
                  onClick={() => { close(); x.onSelect() }}
                  className="w-full flex items-center gap-2 text-left text-sm px-2 py-1.5 rounded-md text-neutral-700 hover:bg-neutral-50">
                  <ChevronRight className="w-3.5 h-3.5 text-neutral-400" /> {x.label}
                </button>
              ))}
              {fileUnder && fileUnder.picks.length > 0 && (
                <>
                  <button role="menuitem" type="button"
                    aria-expanded={picksOpen}
                    onClick={() => setPicksOpen((v) => !v)}
                    className="w-full flex items-center gap-2 text-left text-sm px-2 py-1.5 rounded-md text-neutral-700 hover:bg-neutral-50">
                    <ChevronDown className={`w-3.5 h-3.5 text-neutral-400 transition-transform ${picksOpen ? '' : '-rotate-90'}`} />
                    File under a pick
                  </button>
                  {picksOpen && (
                    <div className="ml-4 mt-0.5 space-y-0.5 max-h-56 overflow-auto">
                      {fileUnder.picks.map((p) => (
                        <button key={p.id} role="menuitem" type="button"
                          onClick={() => { close(); fileUnder.onFile(p.id) }}
                          className="w-full rounded-md px-2 py-1.5 text-left hover:bg-primary-50">
                          <span className="block text-sm text-neutral-800 leading-snug">{p.title}</span>
                          {p.goalName && <span className="block text-[11px] text-neutral-400">serves {p.goalName}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          <TriageWhenMenu
            onPick={(when) => { close(); onPickWhen(when) }}
            onPickDate={onPickDate ? (date, isAllDay) => { close(); onPickDate(date, isAllDay) } : undefined}
            onComplete={onComplete ? () => { close(); onComplete() } : undefined}
            onDelete={onDelete ? () => { close(); onDelete() } : undefined}
          />
        </div>,
        document.body,
      )}
    </span>
  )
}
