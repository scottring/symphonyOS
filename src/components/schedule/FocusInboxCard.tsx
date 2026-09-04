import { useState, useEffect, useCallback } from 'react'
import { Check } from 'lucide-react'
import { ConceptIcon } from '@/lib/conceptIcons'
import { SchedulePopover } from '@/components/triage'
import type { Task } from '@/types/task'
import type { FamilyMember } from '@/types/family'

type FocusBucket = 'today' | 'week' | 'month' | 'quarter'

// The project chip is gone (2026-09-02 — see the note in Sidebar.tsx): Projects
// are hidden from the product, so a triage card no longer names one.
interface FocusInboxCardProps {
  tasks: Task[]
  familyMembers: FamilyMember[]
  onTriage: (taskId: string, bucket: FocusBucket) => void
  onDelete: (taskId: string) => void
  onComplete: (taskId: string) => void
  onUpdate: (taskId: string, updates: Partial<Task>) => void
  onSelectDetail: (taskId: string) => void
  onExitFocus: () => void
  /** Converts the current card into a real calendar event. Omitted entirely
   *  hides the button — mirrors the other optional-callback props here. */
  onSendToCalendar?: (taskId: string, start: Date, isAllDay: boolean, durationMinutes?: number) => void
  /** True while a send-to-calendar write is in flight anywhere on the page
   *  (one hook instance serves both list and focus mode) — disables the
   *  button so a second click can't race the first, matching list mode. */
  sending?: boolean
}

const WHEN_BUTTONS: Array<{ key: string; bucket: FocusBucket; label: string; sub: string }> = [
  { key: '1', bucket: 'today', label: 'Today', sub: 'Do it now' },
  { key: '2', bucket: 'week', label: 'This Week', sub: 'Soon' },
  { key: '3', bucket: 'month', label: 'This Month', sub: 'Eventually' },
  { key: '4', bucket: 'quarter', label: 'Someday', sub: 'No rush' },
]

export function FocusInboxCard({
  tasks, familyMembers: _familyMembers,
  onTriage, onDelete, onComplete, onUpdate: _onUpdate, onSelectDetail, onExitFocus,
  onSendToCalendar, sending = false,
}: FocusInboxCardProps) {
  const [index, setIndex] = useState(0)
  const [calendarOpen, setCalendarOpen] = useState(false)
  // The task the picker was opened ON, captured at open time. The picker stays
  // open for seconds (day -> duration -> time) and `tasks` is sorted newest
  // first, so a capture arriving meanwhile (Cmd+K, an iOS photo capture over
  // realtime) shifts every card down. Reading `current` at confirm time would
  // then convert — and DESTROY — a different task than the one on screen. List
  // mode is immune because its handler closes over its own row's task; this is
  // focus mode's equivalent.
  const [pendingCalendarTask, setPendingCalendarTask] = useState<Task | null>(null)

  const total = tasks.length
  const current = tasks[index]

  const advance = useCallback(() => {
    setIndex((i) => Math.min(i + 1, Math.max(total - 1, 0)))
  }, [total])

  const goBack = useCallback(() => {
    setIndex((i) => Math.max(i - 1, 0))
  }, [])

  const triage = useCallback((bucket: FocusBucket) => {
    if (!current) return
    onTriage(current.id, bucket)
    advance()
  }, [current, onTriage, advance])

  const del = useCallback(() => {
    if (!current) return
    onDelete(current.id)
    advance()
  }, [current, onDelete, advance])

  const complete = useCallback(() => {
    if (!current) return
    onComplete(current.id)
    advance()
  }, [current, onComplete, advance])

  // Single entry point for every way the picker opens (trigger click via the
  // popover's own onOpenChange, or the 'e' key) so the task is captured exactly
  // once, at open, no matter the route.
  const setCalendarPickerOpen = useCallback((next: boolean) => {
    if (next) {
      if (!current || !onSendToCalendar || sending) return
      setPendingCalendarTask(current)
    } else {
      setPendingCalendarTask(null)
    }
    setCalendarOpen(next)
  }, [current, onSendToCalendar, sending])

  // Opens the calendar picker rather than converting directly — the picker
  // needs a day, a time, and (optionally) a duration before there's anything
  // to send. It does NOT call advance(): the card only leaves the list once
  // the task is actually deleted (after a confirmed Google write), and the
  // popover it opens anchors to this card's own trigger button, which must
  // stay mounted behind it.
  const openSendToCalendar = useCallback(() => {
    setCalendarPickerOpen(true)
  }, [setCalendarPickerOpen])

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return

      // While the calendar picker is open, every other shortcut is
      // suppressed — otherwise 'd'/'c'/digit keys typed while browsing dates
      // would delete/complete/triage the card out from under the open
      // popover. Escape closes the picker instead of exiting focus mode.
      if (calendarOpen) {
        if (e.key === 'Escape') { e.stopPropagation(); setCalendarPickerOpen(false) }
        return
      }

      switch (e.key) {
        case '1': triage('today'); break
        case '2': triage('week'); break
        case '3': triage('month'); break
        case '4': triage('quarter'); break
        case 'c':
        case 'C': complete(); break
        case 'd':
        case 'D':
        case 'Backspace': del(); break
        case 'e':
        case 'E': openSendToCalendar(); break
        case 'ArrowRight':
        case ' ': e.preventDefault(); advance(); break
        case 'ArrowLeft': goBack(); break
        case 'Enter': if (current) onSelectDetail(current.id); break
        case 'Escape': onExitFocus(); break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [triage, del, complete, openSendToCalendar, setCalendarPickerOpen, advance, goBack, current, onSelectDetail, onExitFocus, calendarOpen])

  if (total === 0 || !current) {
    return (
      <div className="mx-auto max-w-md text-center py-16">
        <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-primary-50 flex items-center justify-center">
          <Check className="w-7 h-7 text-primary-500" />
        </div>
        <p className="font-display text-xl text-neutral-700 mb-2">Inbox zero</p>
        <p className="text-neutral-500">Every inbox item has a next place.</p>
        <button
          type="button"
          onClick={onExitFocus}
          className="mt-5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
        >
          Return to list
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-xs uppercase tracking-wide text-neutral-400 mb-3">
        Card {index + 1} of {total}
      </div>

      <div className="card p-8">
        <h2 className="font-display text-2xl text-neutral-900 mb-5 leading-snug">
          {current.title}
        </h2>

        <div className="flex flex-wrap gap-2 mb-6">
          {current.context && (
            <span className="px-3 py-1 rounded-full bg-neutral-50 text-neutral-700 text-xs">
              {current.context}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {WHEN_BUTTONS.map((btn) => (
            <button
              key={btn.key}
              type="button"
              onClick={() => triage(btn.bucket)}
              className="flex flex-col items-center gap-1 px-3 py-4 rounded-xl border-2 border-neutral-100 bg-white hover:border-primary-400 hover:bg-primary-50/40 transition-colors"
            >
              <span className="text-xs text-neutral-400 bg-neutral-50 rounded px-2 py-0.5 mb-1">{btn.key}</span>
              <span className="font-medium text-sm text-neutral-800">{btn.label}</span>
              <span className="text-xs text-neutral-500">{btn.sub}</span>
            </button>
          ))}
        </div>

        {onSendToCalendar && (
          <SchedulePopover
            showDuration
            // The card behind the picker may have shifted; the picker keeps
            // naming the task it was opened on.
            itemTitle={(pendingCalendarTask ?? current).title}
            open={calendarOpen}
            onOpenChange={setCalendarPickerOpen}
            onSchedule={(date, isAllDay, durationMinutes) => {
              if (!pendingCalendarTask) return
              onSendToCalendar(pendingCalendarTask.id, date, isAllDay, durationMinutes)
            }}
            trigger={
              <button
                type="button"
                aria-label="Send to calendar"
                aria-busy={sending}
                disabled={sending}
                className={`w-full flex items-center justify-center gap-2 px-3 py-3 mb-6 rounded-xl border-2 border-neutral-100 bg-white transition-colors ${
                  sending ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary-400 hover:bg-primary-50/40'
                }`}
              >
                <span className="text-xs text-neutral-400 bg-neutral-50 rounded px-2 py-0.5">e</span>
                <ConceptIcon name="when" decorative />
                <span className="font-medium text-sm text-neutral-800">Send to calendar</span>
              </button>
            }
          />
        )}

        {/* Resolve-without-scheduling: the item is already handled, so check it
            off rather than filing it to a horizon. (keyboard: C) */}
        <button
          type="button"
          onClick={complete}
          className="flex items-center justify-center gap-2 w-full px-3 py-3 mb-4 rounded-xl border-2 border-emerald-100 bg-emerald-50/50 text-emerald-700 font-medium text-sm hover:border-emerald-300 hover:bg-emerald-50 transition-colors"
        >
          <Check className="w-4 h-4" /> Mark done
          <span className="text-xs text-emerald-500/70 bg-white/60 rounded px-1.5 py-0.5">C</span>
        </button>

        <div className="flex justify-between text-xs text-neutral-400">
          <button type="button" onClick={goBack} className="hover:text-neutral-600">back</button>
          <button type="button" onClick={advance} className="hover:text-neutral-600">skip</button>
          <button type="button" onClick={del} className="hover:text-rose-500">delete</button>
          <button type="button" onClick={onExitFocus} className="hover:text-neutral-600">list view</button>
        </div>
      </div>
    </div>
  )
}
