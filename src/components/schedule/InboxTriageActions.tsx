// Inbox row triage (Scott, 2026-09-22): the three destinations used most —
// Today, This week, Someday — are one tap on the row; everything else (other
// days and periods, a specific date, a note, the calendar, the life area,
// delete) sits behind one More menu. The row used to carry nine controls.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal } from 'lucide-react'
import { usePopoverFocus } from '@/hooks/usePopoverFocus'
import { SchedulePopover } from '@/components/triage/SchedulePopover'
import { SpecificDatePicker } from './SpecificDatePicker'
import type { TriageWhen } from './TriageWhenMenu'
import type { TaskContext } from '@/types/task'

const INBOX_MORE_WHEN: { when: TriageWhen; label: string }[] = [
  { when: 'tonight', label: 'Tonight' },
  { when: 'tomorrow', label: 'Tomorrow' },
  { when: 'this-weekend', label: 'This weekend' },
  { when: 'next-week', label: 'Next week' },
  { when: 'next-weekend', label: 'Next weekend' },
  { when: 'this-month', label: 'This month' },
  { when: 'next-month', label: 'Next month' },
  { when: 'this-season', label: 'This season' },
]

const AREAS: { label: string; value: TaskContext | null }[] = [
  { label: 'Work', value: 'work' },
  { label: 'Family', value: 'family' },
  { label: 'Personal', value: 'personal' },
  { label: 'Unsorted', value: null },
]

interface InboxTriageActionsProps {
  title: string
  onPick: (when: TriageWhen) => void
  onPickDate: (date: Date) => void
  onNote: () => void
  onSendToCalendar: (date: Date, isAllDay: boolean, durationMinutes?: number) => void
  calendarBusy?: boolean
  onSetArea: (context: TaskContext | null) => void
  onDelete: () => void
}

const itemClass = 'block w-full rounded-md px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-primary-50 hover:text-primary-700 disabled:opacity-50'
const headingClass = 'px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-400'

export function InboxTriageActions({
  title, onPick, onPickDate, onNote, onSendToCalendar, calendarBusy, onSetArea, onDelete,
}: InboxTriageActionsProps) {
  const [menu, setMenu] = useState<null | 'menu' | 'date'>(null)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const close = () => setMenu(null)
  usePopoverFocus(menu !== null, triggerRef, menuRef, close)

  // Portalled and fixed to the viewport: inside the row, the phone-wide
  // overflow rule clipped the menu to a sliver. Opens upward when the row is
  // low on the screen, and never runs past the viewport.
  const [position, setPosition] = useState<CSSProperties>({})
  useLayoutEffect(() => {
    if (!menu || !triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    const below = window.innerHeight - r.bottom - 8
    const above = r.top - 8
    const up = below < 320 && above > below
    setPosition({
      right: Math.max(8, window.innerWidth - r.right),
      ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
      maxHeight: Math.max(160, (up ? above : below) - 4),
    })
  }, [menu])
  useEffect(() => {
    if (!menu) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setMenu(null)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('touchstart', onDown) }
  }, [menu])
  const choose = (fn: () => void) => () => { close(); fn() }

  const direct = 'text-xs px-2.5 py-1 rounded-md font-medium transition-colors'
  return (
    <div ref={wrapRef} className="inbox-triage relative flex flex-wrap items-center gap-1">
      <button type="button" onClick={() => onPick('today')} className={`${direct} bg-primary-50 text-primary-700 hover:bg-primary-100`}>
        Today
      </button>
      <button type="button" onClick={() => onPick('this-week')} className={`${direct} bg-neutral-50 text-neutral-600 hover:bg-neutral-100`}>
        This week
      </button>
      <button type="button" onClick={() => onPick('someday')} className={`${direct} bg-neutral-50 text-neutral-600 hover:bg-neutral-100`}>
        Someday
      </button>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`More actions for ${title}`}
        aria-haspopup="menu"
        aria-expanded={menu !== null}
        onClick={() => setMenu(menu ? null : 'menu')}
        className={`rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 ${menu ? 'bg-neutral-100' : ''}`}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>

      {menu === 'menu' && createPortal(
        <div ref={menuRef} role="menu" aria-label={`More actions for ${title}`} style={position}
          className="inbox-triage-menu fixed z-[60] w-52 overflow-y-auto rounded-lg border border-neutral-200 bg-white py-1 shadow-lg">
          <p className={headingClass} aria-hidden="true">When</p>
          {INBOX_MORE_WHEN.map(({ when, label }) => (
            <button key={when} type="button" role="menuitem" className={itemClass} onClick={choose(() => onPick(when))}>{label}</button>
          ))}
          <button type="button" role="menuitem" className={itemClass} onClick={() => setMenu('date')}>Pick a date…</button>
          <p className={headingClass} aria-hidden="true">Send</p>
          <button type="button" role="menuitem" className={itemClass} onClick={choose(onNote)}>To a note…</button>
          <button type="button" role="menuitem" className={itemClass} disabled={calendarBusy}
            onClick={choose(() => setCalendarOpen(true))}>To calendar…</button>
          <p className={headingClass} aria-hidden="true">Life area</p>
          {AREAS.map(({ label, value }) => (
            <button key={label} type="button" role="menuitem" className={itemClass} onClick={choose(() => onSetArea(value))}>{label}</button>
          ))}
          <div className="my-1 border-t border-neutral-100" />
          <button type="button" role="menuitem" className={`${itemClass} text-rose-600 hover:bg-rose-50 hover:text-rose-700`} onClick={choose(onDelete)}>Delete</button>
        </div>,
        document.body,
      )}

      {menu === 'date' && createPortal(
        <div ref={menuRef} role="dialog" aria-label="Pick a date" style={position}
          className="fixed z-[60] w-56 overflow-y-auto rounded-lg border border-neutral-200 bg-white p-2 shadow-lg">
          <SpecificDatePicker onSubmit={(date) => { close(); onPickDate(date) }} />
        </div>,
        document.body,
      )}

      {/* The calendar picker anchors to this spot (under More); it opens
          only from the menu's "To calendar…". */}
      <SchedulePopover
        showDuration
        itemTitle={title}
        open={calendarOpen}
        onOpenChange={(open) => { if (!open) setCalendarOpen(false) }}
        onSchedule={(date, isAllDay, durationMinutes) => { setCalendarOpen(false); onSendToCalendar(date, isAllDay, durationMinutes) }}
        trigger={<span aria-hidden="true" className="pointer-events-none absolute right-0 top-full h-0 w-0" />}
      />
    </div>
  )
}
