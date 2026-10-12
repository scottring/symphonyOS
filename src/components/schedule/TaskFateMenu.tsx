// src/components/schedule/TaskFateMenu.tsx
//
// The one triage menu. A ⋯ trigger opens the whole contract
// (lib/triage/contract.ts) for the thing in hand, grouped and ordered the same
// everywhere:
//
//   [surface verbs]  what only this place can do (another day in the week on
//                    screen, a goal's period moves)
//   When             the shared RescheduleGrid — Today … Someday, Pick date &
//                    time…, each naming where it lands
//   Skip             scoped: "Skip this time" / "Skip this day", with the line
//                    that says exactly what it touches
//   More             Complete/Reopen · Open details · People… · Life area… ·
//                    Move under… · Delete
//
// A group a caller cannot honour is left out by not passing its handler; a
// When a kind cannot take is explained by the grid, never silently dropped.
// The writes are the caller's (activity strip, gated task actions, schedule
// actions) — this draws and asks.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal, ChevronDown, ChevronRight, CircleSlash } from 'lucide-react'
import type { TriageWhen } from './TriageWhenMenu'
import { RescheduleGrid } from './RescheduleGrid'
import { usePopoverFocus } from '@/hooks/usePopoverFocus'
import { MORE_ORDER, SKIP_LABEL, SKIP_NOTE, moreFor, moreLabel, skipFor, whenAvailability, type MoreId, type TriageEntity } from '@/lib/triage/contract'

export interface TaskFateMenuProps {
  /** What is being triaged; picks the contract (default: an undated task). */
  entity?: TriageEntity
  /** Accessible name of the ⋯ trigger. */
  label?: string
  triggerText?: string
  /** The trigger's class (a canvas row draws its own ⋯). */
  triggerClassName?: string
  /** The trigger's icon size. */
  iconSize?: number
  disabled?: boolean
  /** Flips Complete to Reopen, and leaves When and Skip out until reopened. */
  completed?: boolean
  /** Route a When — callers map it through applyTriageWhen (a task) or the
   *  occurrence writers (`day` is the day chosen inside a period). Omitted:
   *  no When group (a goal, an event). */
  onPickWhen?: (when: TriageWhen, day?: Date) => void
  onPickDate?: (date: Date, isAllDay: boolean) => void
  /** Limit the When tiles (a caller that cannot honour some). */
  whens?: readonly TriageWhen[]
  /** The day it is on now (its tile says so). */
  currentDay?: Date | null
  /** The scoped Skip ("Skip this time" / "Skip this day"). */
  onSkip?: () => void
  onComplete?: () => void
  /** Open the detail surface (an occurrence's is its routine's). */
  onOpen?: () => void
  onPeople?: () => void
  onArea?: () => void
  onMoveUnder?: () => void
  onDelete?: () => void
  /** Surface verbs, listed first (e.g. another day in the week on screen,
   *  a goal's "Carry to next month"). */
  extras?: { label: string; onSelect: () => void }[]
  /** File this task under a season pick — threads sourceId/goalId at the
   *  caller. Page-side parity with the wizard's move-by-pick step. */
  fileUnder?: {
    picks: { id: string; title: string; goalName?: string }[]
    onFile: (pickId: string) => void
  }
}

const itemClass = 'w-full flex items-center gap-2 text-left text-sm px-2 py-1.5 rounded-md text-neutral-700 hover:bg-neutral-50 focus:bg-neutral-50 focus:outline-none'
const headClass = 'px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400'

export function TaskFateMenu({
  entity = 'task', onPickWhen, onPickDate, whens, currentDay, onSkip, onComplete, onOpen, onPeople, onArea, onMoveUnder, onDelete,
  extras, fileUnder, triggerText, triggerClassName, iconSize = 16, completed = false, label = 'Task actions', disabled = false,
}: TaskFateMenuProps) {
  const [open, setOpen] = useState(false)
  const [picksOpen, setPicksOpen] = useState(false)
  const containerRef = useRef<HTMLSpanElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Portal + fixed positioning (the PushDropdown pattern): a row can sit at
  // either edge of a lane, so an absolutely-positioned panel clips under the
  // sidebar or off the right edge. Measured and placed by direct style
  // mutation, clamped to the viewport, flipped above when the bottom is tight.
  // No dep array: every render resets the JSX style to hidden, so every
  // render must re-place before paint.
  useLayoutEffect(() => {
    if (!open) return
    const trigger = containerRef.current?.getBoundingClientRect()
    const panel = panelRef.current
    if (!trigger || !panel) return
    const place = () => {
      const w = panel.offsetWidth
      const h = panel.offsetHeight
      const left = Math.max(8, Math.min(trigger.right - w, window.innerWidth - w - 8))
      const below = trigger.bottom + 4
      const top = below + h > window.innerHeight - 8 && trigger.top - h - 4 > 8
        ? trigger.top - h - 4
        : below
      panel.style.top = `${Math.max(8, Math.min(top, window.innerHeight - h - 8))}px`
      panel.style.left = `${left}px`
      panel.style.visibility = 'visible'
    }
    place()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place)
    observer?.observe(panel)
    return () => observer?.disconnect()
  })

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (containerRef.current?.contains(t) || panelRef.current?.contains(t)) return
      setOpen(false); setPicksOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const close = () => { setOpen(false); setPicksOpen(false) }
  // Focus into the portalled menu, arrow keys between items, Escape back to ⋯.
  usePopoverFocus(open, triggerRef, panelRef, close)
  const run = (fn: () => void) => () => { close(); fn() }

  const allowed = new Set(moreFor(entity))
  const handlers: Partial<Record<MoreId, (() => void) | undefined>> = {
    complete: onComplete, open: onOpen, people: onPeople, area: onArea, 'move-under': onMoveUnder, delete: onDelete,
  }
  const more = MORE_ORDER.filter((id) => allowed.has(id) && handlers[id])
  const skip = skipFor(entity)
  // The contract decides: a goal or an event has no When, whatever is passed.
  const showWhen = !completed && !!onPickWhen && Object.keys(whenAvailability(entity)).length > 0
  const showSkip = !completed && !!skip && !!onSkip

  let body: ReactNode = null
  if (open && !disabled) {
    body = (
      <div
        ref={panelRef}
        role="menu"
        aria-label={label}
        style={{ top: 0, left: 0, visibility: 'hidden' }}
        className="fixed z-[100] w-80 max-w-[calc(100vw-16px)] max-h-[80dvh] overflow-y-auto rounded-xl border border-neutral-200 bg-white shadow-lg p-2 text-left"
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {(extras?.length || fileUnder) && (
          <div className="mb-1.5 pb-1.5 border-b border-neutral-100" role="group">
            {extras?.map((x) => (
              <button key={x.label} role="menuitem" type="button" onClick={run(x.onSelect)} className={itemClass}>
                <ChevronRight className="w-3.5 h-3.5 text-neutral-400" /> {x.label}
              </button>
            ))}
            {fileUnder && fileUnder.picks.length > 0 && (
              <>
                <button role="menuitem" type="button" aria-expanded={picksOpen} onClick={() => setPicksOpen((v) => !v)} className={itemClass}>
                  <ChevronDown className={`w-3.5 h-3.5 text-neutral-400 transition-transform ${picksOpen ? '' : '-rotate-90'}`} />
                  File under a pick
                </button>
                {picksOpen && (
                  <div className="ml-4 mt-0.5 space-y-0.5 max-h-56 overflow-auto">
                    {fileUnder.picks.map((p) => (
                      <button key={p.id} role="menuitem" type="button" onClick={run(() => fileUnder.onFile(p.id))}
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
        {showWhen && (
          <div role="group" aria-label="When" className="pb-1.5">
            <p className={headClass} aria-hidden="true">When</p>
            <RescheduleGrid
              entity={entity === 'occurrence' ? 'occurrence' : 'task'}
              flexibleWeekend={entity !== 'occurrence'}
              whens={whens}
              currentDay={currentDay}
              onPick={(when, day) => { close(); if (day) onPickWhen!(when, day); else onPickWhen!(when) }}
              onPickDate={onPickDate ? (date, isAllDay) => { close(); onPickDate(date, isAllDay) } : undefined}
              // An occurrence's Someday points at Skip this time and Open
              // routine, which sit right below in this same menu.
            />
          </div>
        )}
        {showSkip && (
          <div role="group" aria-label="Skip" className="border-t border-neutral-100 pt-1.5 pb-1.5">
            <button role="menuitem" type="button" onClick={run(onSkip!)} className={itemClass}>
              <CircleSlash className="w-3.5 h-3.5 text-neutral-400" /> {SKIP_LABEL[skip!]}
            </button>
            <p className="px-2 text-[11px] text-neutral-400">{SKIP_NOTE[skip!]}</p>
          </div>
        )}
        {more.length > 0 && (
          <div role="group" aria-label="More" className={showWhen || showSkip ? 'border-t border-neutral-100 pt-1.5' : ''}>
            {more.map((id) => (
              <button key={id} role="menuitem" type="button" onClick={run(handlers[id]!)}
                className={`${itemClass}${id === 'delete' ? ' text-rose-700 hover:bg-rose-50' : ''}`}>
                {moreLabel(id, { completed, entity })}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    // Hosts are often draggable (dnd-kit pills, native-drag rows) — the menu
    // must never start a drag or bubble a click into the row's open-task.
    <span
      ref={containerRef}
      className="relative inline-flex"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={triggerClassName ?? 'p-0.5 rounded text-neutral-400 hover:text-neutral-700'}
      >
        <MoreHorizontal size={iconSize} aria-hidden="true" />{triggerText && <span>{triggerText}</span>}
      </button>
      {body && createPortal(body, document.body)}
    </span>
  )
}
