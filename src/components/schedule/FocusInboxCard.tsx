import { useState, useEffect, useCallback } from 'react'
import { Check } from 'lucide-react'
import { ConceptIcon } from '@/lib/conceptIcons'
import { SchedulePopover } from '@/components/triage'
import type { Task } from '@/types/task'
import type { Project } from '@/types/project'
import type { FamilyMember } from '@/types/family'

type FocusBucket = 'today' | 'week' | 'month' | 'quarter'

interface FocusInboxCardProps {
  tasks: Task[]
  projects: Project[]
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
  tasks, projects, familyMembers: _familyMembers,
  onTriage, onDelete, onComplete, onUpdate: _onUpdate, onSelectDetail, onExitFocus,
  onSendToCalendar, sending = false,
}: FocusInboxCardProps) {
  const [index, setIndex] = useState(0)
  const [calendarOpen, setCalendarOpen] = useState(false)

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

  // Opens the calendar picker rather than converting directly — the picker
  // needs a day, a time, and (optionally) a duration before there's anything
  // to send. It does NOT call advance(): the card only leaves the list once
  // the task is actually deleted (after a confirmed Google write), and the
  // popover it opens anchors to this card's own trigger button, which must
  // stay mounted behind it.
  const openSendToCalendar = useCallback(() => {
    if (!current || !onSendToCalendar || sending) return
    setCalendarOpen(true)
  }, [current, onSendToCalendar, sending])

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return

      // While the calendar picker is open, every other shortcut is
      // suppressed — otherwise 'd'/'c'/digit keys typed while browsing dates
      // would delete/complete/triage the card out from under the open
      // popover. Escape closes the picker instead of exiting focus mode.
      if (calendarOpen) {
        if (e.key === 'Escape') { e.stopPropagation(); setCalendarOpen(false) }
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
  }, [triage, del, complete, openSendToCalendar, advance, goBack, current, onSelectDetail, onExitFocus, calendarOpen])

  if (total === 0 || !current) {
    return (
      <div className="text-center py-16">
        <p className="font-display text-xl text-neutral-700 mb-2">Inbox zero</p>
        <p className="text-neutral-500">Press Esc to return to list</p>
      </div>
    )
  }

  const project = projects.find((p) => p.id === current.projectId)

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
          {project && (
            <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs">
              <ConceptIcon name="project" decorative /> {project.name}
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
            itemTitle={current.title}
            open={calendarOpen}
            onOpenChange={setCalendarOpen}
            onSchedule={(date, isAllDay, durationMinutes) => {
              onSendToCalendar(current.id, date, isAllDay, durationMinutes)
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
