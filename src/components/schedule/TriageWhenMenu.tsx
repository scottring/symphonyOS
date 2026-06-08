import { useState, useRef, useEffect, useCallback } from 'react'
import { Trash2, ChevronDown, Check, CalendarPlus } from 'lucide-react'
import { ConceptIcon } from '@/lib/conceptIcons'
import { SpecificDatePicker } from './SpecificDatePicker'

// The full temporal vocabulary a triage row can route into. The granular options
// fan out from a small set of horizon "groups" so the common case stays one
// glance while the precise case is one hover away.
export type TriageWhen =
  | 'today' | 'tonight' | 'tomorrow'
  | 'this-week' | 'next-week' | 'this-weekend' | 'next-weekend'
  | 'this-month' | 'next-month'
  | 'someday'

interface WhenOption { when: TriageWhen; label: string }
interface WhenGroup {
  label: string
  primary: TriageWhen      // applied if the group has no fan-out (single option)
  options: WhenOption[]    // the fan-out menu (first = the "whole period")
}

const GROUPS: WhenGroup[] = [
  {
    label: 'Today', primary: 'today', options: [
      { when: 'today', label: 'Today' },
      { when: 'tonight', label: 'Tonight' },
      { when: 'tomorrow', label: 'Tomorrow' },
    ],
  },
  {
    label: 'Week', primary: 'this-week', options: [
      { when: 'this-week', label: 'This week' },
      { when: 'next-week', label: 'Next week' },
      { when: 'this-weekend', label: 'This weekend' },
      { when: 'next-weekend', label: 'Next weekend' },
    ],
  },
  {
    label: 'Month', primary: 'this-month', options: [
      { when: 'this-month', label: 'This month' },
      { when: 'next-month', label: 'Next month' },
    ],
  },
  {
    label: 'Someday', primary: 'someday', options: [
      { when: 'someday', label: 'Someday' },
    ],
  },
]

interface TriageWhenMenuProps {
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
}

/**
 * Triage control for a horizon/inbox row. Each horizon "group" is a chip; groups
 * with more than one option fan out into a small popover on hover or click
 * (click-to-open is the touch/precision path, hover is the desktop convenience).
 * Picking an option applies it and closes. Single-option groups (Someday) apply
 * directly with no popover.
 */
export function TriageWhenMenu({ onPick, onDelete, onNote, onComplete, onPickDate }: TriageWhenMenuProps) {
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Click-outside closes the open fan-out.
  useEffect(() => {
    if (!openGroup) return
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenGroup(null)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [openGroup])

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current) }, [])

  const cancelClose = useCallback(() => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null }
  }, [])
  const scheduleClose = useCallback(() => {
    cancelClose()
    closeTimer.current = setTimeout(() => setOpenGroup(null), 160)
  }, [cancelClose])

  const pick = useCallback((when: TriageWhen) => {
    setOpenGroup(null)
    onPick(when)
  }, [onPick])

  return (
    <div ref={containerRef} className="flex items-center gap-1">
      {GROUPS.map((group) => {
        const single = group.options.length === 1
        const isOpen = openGroup === group.label
        const isPrimary = group.label === 'Today'
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
              aria-haspopup={single ? undefined : 'menu'}
              aria-expanded={single ? undefined : isOpen}
              onClick={() => {
                if (single) { pick(group.primary); return }
                // Always open (don't toggle-close): on desktop the hover already
                // opened it, so a toggle would dismiss it on the click that
                // follows the hover. Close happens via outside-click / leave / pick.
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
                role="menu"
                className="absolute z-40 top-full right-0 mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg py-1 min-w-[150px]"
                onMouseEnter={cancelClose}
                onMouseLeave={scheduleClose}
              >
                {group.options.map((opt) => (
                  <button
                    key={opt.when}
                    type="button"
                    role="menuitem"
                    className="block w-full text-left px-3 py-1.5 text-sm text-neutral-700 hover:bg-primary-50 hover:text-primary-700 transition-colors"
                    onClick={() => pick(opt.when)}
                  >
                    {opt.label}
                  </button>
                ))}
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
              className="absolute z-40 top-full right-0 mt-1 w-56 bg-white border border-neutral-200 rounded-lg shadow-lg p-2"
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
