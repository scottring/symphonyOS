import { useState, useRef, useEffect, useMemo } from 'react'
import { CalendarClock } from 'lucide-react'
import type { ParserContext } from '@/lib/quickInputParser'
import { useQuickParse } from '@/hooks/useQuickParse'
import { ParsedFieldChips } from '@/components/capture/ParsedFieldChips'

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate()

const dayLabel = (d: Date) =>
  d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })

const BARE_WEEKDAY = new Set([
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'mon', 'tue', 'tues', 'wed', 'weds', 'thu', 'thur', 'thurs', 'fri', 'sat', 'sun',
])

// A "soft" date is a bare weekday with no relative cue, time, or number — e.g.
// the "Friday" in "about Friday's deck", which chrono parses but the user
// probably didn't mean as a schedule. Only these trigger the confirm-to-move
// guard at a tapped slot; clearly typed dates ("tomorrow", "next Friday",
// "May 15") still apply immediately.
function isSoftDate(matchText?: string): boolean {
  if (!matchText) return false
  const t = matchText.trim().toLowerCase()
  if (/\d/.test(t)) return false
  if (/\b(today|tonight|tomorrow|yesterday|next|this|coming|in|on|after|end of)\b/.test(t)) return false
  return BARE_WEEKDAY.has(t)
}

export interface TimelineCaptureResult {
  title: string
  scheduledFor: Date | null
  category?: 'task' | 'chore' | 'errand' | 'event' | 'activity'
  projectId?: string
  contactId?: string
  assignedMemberIds?: string[]
}

interface Props {
  kind: 'task' | 'event' | 'routine'
  anchorTime: Date | null
  parserContext: ParserContext
  onSubmit: (r: TimelineCaptureResult) => void
  onCancel: () => void
}

export function TimelineQuickInput({ kind, anchorTime, parserContext, onSubmit, onCancel }: Props) {
  const [title, setTitle] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus() }, [])

  // useQuickParse requires a referentially-stable ctx (its parse memo keys on identity)
  const ctx = useMemo<ParserContext>(
    () => parserContext,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [parserContext.projects, parserContext.contacts, parserContext.familyMembers],
  )
  const qp = useQuickParse(title, ctx)
  const p = qp.effectiveParsed

  // Safety net: when a typed date would move the task OFF the slot the user
  // tapped (anchorTime), don't silently apply it on Enter. Default to the slot
  // and require an explicit tap to move. Prevents a topic word that survived
  // parsing (e.g. "about Friday's deck") from quietly rescheduling.
  const [dateConfirmed, setDateConfirmed] = useState(false)
  const parsedMovesOff = !!(p.dueDate && anchorTime && !sameDay(p.dueDate, anchorTime))
  const pendingMove = parsedMovesOff && !dateConfirmed && isSoftDate(p.dueDateMatch)
  // Reset the confirmation whenever the parsed day changes (user edited the title).
  const parsedDayKey = p.dueDate ? p.dueDate.toDateString() : ''
  useEffect(() => { setDateConfirmed(false) }, [parsedDayKey])

  // Apply the parsed date unless it's a pending (soft, unconfirmed) move off the
  // tapped slot — in which case the slot wins until the user taps "Move".
  const applyParsedDate = !!p.dueDate && !pendingMove
  const effectiveScheduledFor = applyParsedDate ? p.dueDate! : (anchorTime ?? p.dueDate ?? null)

  const timeLabel = anchorTime
    ? anchorTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null
  const placeholder = `New ${kind}${timeLabel ? ` · ${timeLabel}` : ''}`

  const submit = () => {
    const t = title.trim()
    if (!t) return
    onSubmit({
      title: p.title?.trim() || t,
      scheduledFor: effectiveScheduledFor,
      category: p.category,
      projectId: p.projectId,
      contactId: p.contactId,
      assignedMemberIds: p.assignedMemberIds,
    })
  }

  // While a move is pending we suppress the auto date chip (we render our own
  // confirm row instead) so the user isn't shown a date we haven't applied.
  const chipsParsed = pendingMove ? { ...p, dueDate: undefined } : p

  return (
    <div className="w-full px-1 py-1">
      <input
        ref={ref}
        type="text"
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); submit() }
          if (e.key === 'Escape') { e.preventDefault(); onCancel() }
        }}
        onBlur={onCancel}
        placeholder={placeholder}
        className="w-full bg-transparent text-lg md:text-2xl font-display text-neutral-800 placeholder:text-neutral-400 outline-none"
      />
      <ParsedFieldChips
        parsed={chipsParsed}
        projectName={qp.projectName}
        contactName={qp.contactName}
        onClearDate={qp.clearDate}
        onClearProject={qp.clearProject}
        onClearContact={qp.clearContact}
        onClearCategory={qp.clearCategory}
        onClearContext={qp.clearContext}
      />
      {pendingMove && p.dueDate && (
        <div className="mt-1 flex items-center gap-2 text-[12px] text-amber-700">
          <CalendarClock className="w-3.5 h-3.5 shrink-0" />
          <span>
            Stays on {anchorTime ? dayLabel(anchorTime) : 'today'} unless you move it.
          </span>
          <button
            type="button"
            // Prevent the input's onBlur→onCancel from firing before the click.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setDateConfirmed(true)}
            className="shrink-0 px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-medium hover:bg-amber-200 transition-colors"
          >
            Move to {dayLabel(p.dueDate)}
          </button>
        </div>
      )}
    </div>
  )
}
