import { useState, useRef, useEffect, useCallback } from 'react'
import { Trash2, ChevronDown, Check, CalendarPlus } from 'lucide-react'
import { ConceptIcon } from '@/lib/conceptIcons'
import { SpecificDatePicker } from './SpecificDatePicker'
import { WHEN_LABEL, type TriageWhen } from '@/lib/triage/contract'
import { whenDetail } from '@/lib/triage/periods'

// The temporal vocabulary and its order live in the triage contract
// (lib/triage/contract.ts); this is its inline chip form. Re-exported so the
// many `import type { TriageWhen } from './TriageWhenMenu'` keep working.
export type { TriageWhen }

interface WhenOption { when: TriageWhen; label: string }
interface WhenGroup {
  label: string
  primary: TriageWhen      // applied if the group has no fan-out (single option)
  options: WhenOption[]    // the fan-out menu (first = the "whole period")
}

const opt = (when: TriageWhen): WhenOption => ({ when, label: WHEN_LABEL[when] })

// The days are chips of their own — Tomorrow is never buried under a chip
// labelled Today (Scott, 2026-10-12). The periods fan out, in contract order.
const GROUPS: WhenGroup[] = [
  { label: 'Today', primary: 'today', options: [opt('today')] },
  { label: 'Tonight', primary: 'tonight', options: [opt('tonight')] },
  { label: 'Tomorrow', primary: 'tomorrow', options: [opt('tomorrow')] },
  { label: 'Week', primary: 'this-week', options: [opt('this-week'), opt('next-week'), opt('this-weekend'), opt('next-weekend')] },
  { label: 'Month', primary: 'this-month', options: [opt('this-month'), opt('next-month'), opt('this-season')] },
  { label: 'Someday', primary: 'someday', options: [opt('someday')] },
]

interface TriageWhenMenuProps {
  contained?: boolean
  onPick: (when: TriageWhen) => void
  /** When provided, renders a Delete (trash) action. */
  onDelete?: () => void
  /** When provided, renders a "Note" action (send the item to a note) before
   *  Delete. Used by the Inbox triage surface. */
  onNote?: () => void
  /** When provided, renders a Done (check) action — used in planning reviews
   *  where completing an item is a first-class move. */
  onComplete?: () => void
  /** When provided, adds a "Pick date" chip for a specific date/time. */
  onPickDate?: (date: Date, isAllDay: boolean) => void
  /** A ready-made control rendered between Note and Delete. A slot rather than a
   *  handler because the Inbox's "Send to calendar" chip must BE the trigger of
   *  its own SchedulePopover — the popover anchors itself to the element it
   *  clones, so the caller has to own that element. */
  calendarAction?: React.ReactNode
}

/**
 * Triage control for a horizon/inbox row. Each horizon "group" is a chip; groups
 * with more than one option fan out into a small popover on hover or click
 * (click-to-open is the touch/precision path, hover is the desktop convenience).
 * Picking an option applies it and closes. Single-option groups (Someday) apply
 * directly with no popover.
 */
// How long a HOVER-opened fan-out survives after the pointer leaves it. Long
// enough to cross the gap to the panel and read four options; short enough
// that a menu you drifted past still tidies itself away.
const HOVER_CLOSE_MS = 600

export function TriageWhenMenu({ onPick, onDelete, onNote, onComplete, onPickDate, calendarAction, contained = false }: TriageWhenMenuProps) {
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Click-outside closes the open fan-out.
  useEffect(() => {
    if (!openGroup) return
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        openedByClick.current = false
        setOpenGroup(null)
      }
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); openedByClick.current = false; setOpenGroup(null) } }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [openGroup])

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current) }, [])

  const cancelClose = useCallback(() => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null }
  }, [])
  // A menu the user OPENED ON PURPOSE stays open until they pick, click away,
  // or press Escape — leaving the button must not dismiss it. Only the
  // hover-opened fan-out tidies itself away, and then on a human-sized delay:
  // the old 160ms closed the menu while the pointer was still crossing the gap
  // to it (or while the user was reading the four options), so the click landed
  // on nothing and the tap appeared to do nothing at all.
  const openedByClick = useRef(false)
  const scheduleClose = useCallback(() => {
    if (openedByClick.current) return
    cancelClose()
    closeTimer.current = setTimeout(() => setOpenGroup(null), HOVER_CLOSE_MS)
  }, [cancelClose])

  const close = useCallback(() => {
    openedByClick.current = false
    setOpenGroup(null)
  }, [])

  const pick = useCallback((when: TriageWhen) => {
    close()
    onPick(when)
  }, [close, onPick])

  return (
    <div ref={containerRef} className={contained ? "flex flex-wrap items-start gap-1" : "flex items-center gap-1"}>
      {GROUPS.map((group) => {
        const single = group.options.length === 1
        const isOpen = openGroup === group.label
        const isPrimary = group.label === 'Today' || group.label === 'Tomorrow'
        return (
          <div
            key={group.label}
            className="relative"
            onMouseEnter={single ? undefined : () => { cancelClose(); setOpenGroup(group.label) }}
            onMouseLeave={single ? undefined : scheduleClose}
          >
            <button
              type="button"
              aria-label={group.label}
              title={single ? `${group.label} · ${whenDetail(group.primary)}` : undefined}
              aria-haspopup={single ? undefined : 'menu'}
              aria-expanded={single ? undefined : isOpen}
              onClick={() => {
                if (single) { pick(group.primary); return }
                // Always open (don't toggle-close): on desktop the hover already
                // opened it, so a toggle would dismiss it on the click that
                // follows the hover. Close happens via outside-click / pick /
                // Escape — a deliberate open is no longer at the mercy of the
                // pointer wandering off.
                cancelClose()
                openedByClick.current = true
                setOpenGroup(group.label)
              }}
              className={`flex items-center gap-0.5 text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                isPrimary
                  ? 'bg-primary-50 text-primary-700 hover:bg-primary-100'
                  : 'bg-neutral-50 text-neutral-600 hover:bg-neutral-100'
              } ${isOpen ? 'ring-1 ring-primary-300' : ''}`}
            >
              {group.label}
              {!single && <ChevronDown className="w-3 h-3 opacity-60" />}
            </button>

            {!single && isOpen && (
              <div
                className={contained ? "relative pt-1" : "absolute z-40 top-full right-0 pt-1"}
                onMouseEnter={cancelClose}
                onMouseLeave={scheduleClose}
              >
              <div
                role="menu"
                className="bg-white border border-neutral-200 rounded-lg shadow-lg py-1 min-w-[190px]"
              >
                {group.options.map((opt) => (
                  <button
                    key={opt.when}
                    type="button"
                    role="menuitem"
                    aria-label={opt.label}
                    className="flex w-full items-center justify-between whitespace-nowrap text-left px-3 py-1.5 text-sm text-neutral-700 hover:bg-primary-50 hover:text-primary-700 transition-colors"
                    onClick={() => pick(opt.when)}
                  >
                    <span>{opt.label}</span>
                    <span className="ml-2 text-[11px] text-neutral-400">{whenDetail(opt.when)}</span>
                  </button>
                ))}
              </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Pick a specific date/time — opens a small native date+time form. */}
      {onPickDate && (
        <div
          className="relative"
          onMouseEnter={() => { cancelClose(); setOpenGroup('__date__') }}
          onMouseLeave={scheduleClose}
        >
          <button
            type="button"
            aria-label="Pick date"
            title="Pick a specific date"
            onClick={() => setOpenGroup('__date__')}
            className={`flex items-center text-xs px-2 py-1 rounded-md font-medium bg-neutral-50 text-neutral-600 hover:bg-neutral-100 transition-colors ${openGroup === '__date__' ? 'ring-1 ring-primary-300' : ''}`}
          >
            <CalendarPlus className="w-3.5 h-3.5" />
          </button>
          {openGroup === '__date__' && (
            <div
              role="menu"
              className={(contained ? "relative" : "absolute z-40 top-full right-0") + " mt-1 w-56 bg-white border border-neutral-200 rounded-lg shadow-lg p-2"}
              onMouseEnter={cancelClose}
              onMouseLeave={scheduleClose}
            >
              <SpecificDatePicker onSubmit={(date, isAllDay) => { setOpenGroup(null); onPickDate(date, isAllDay) }} />
            </div>
          )}
        </div>
      )}

      {onNote && (
        <button
          type="button"
          aria-label="Send to note"
          onClick={onNote}
          className="text-xs px-2.5 py-1 rounded-md font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
        >
          <ConceptIcon name="note" decorative /> Note
        </button>
      )}

      {calendarAction}

      {onComplete && (
        <button
          type="button"
          aria-label="Mark done"
          title="Done"
          onClick={onComplete}
          className="p-1.5 rounded-md text-neutral-400 hover:text-primary-700 hover:bg-primary-50 transition-colors"
        >
          <Check className="w-3.5 h-3.5" strokeWidth={3} />
        </button>
      )}

      {onDelete && (
      <button
        type="button"
        aria-label="Delete"
        title="Delete"
        onClick={onDelete}
        className="p-1.5 rounded-md text-neutral-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
      )}
    </div>
  )
}
