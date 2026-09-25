// src/components/surface/sections/EventWhenLine.tsx
//
// When an event is — and, on a calendar we may write to, the way to change it
// by clicking the line that says so.
//
// Scott, on the walkthrough: the date and time directly under an event's
// title should be editable in place. It was a plain statement, and the only
// ways to change it were the Reschedule popover (relative days) and the
// duration menu (the end). Neither lets you say "Thursday, 2:15".
//
// Not a second scheduler. The relative tiles and the duration menu stay
// exactly as they are and are reached the same way; this is the precise path,
// on the line that already states the answer — the same "click the text to
// edit it" the title above it has always had.
//
// What it is careful about:
//
//   DURATION IS KEPT when only the day or the start moves. That is the whole
//   point of `computeEventReschedule`, so this calls it rather than doing the
//   arithmetic again. Touch the end and the end is what you said.
//   AN EVENT ENDS SOMEWHERE. There is no "either day" here and no flexible
//   event: every save names a start and an end.
//   LOCAL TIME, as the rest of the panel reads it. The fields are local wall
//   clock, the Dates are built local, and the write path converts — unchanged.
//   A REFUSED SAVE KEEPS THE EDIT. Google can decline; when it does, the
//   editor stays open with what you typed and says so, rather than closing
//   over a change that did not happen.
import { useEffect, useRef, useState } from 'react'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { computeEventReschedule } from '@/lib/planning/planningReschedule'

const pad = (n: number) => String(n).padStart(2, '0')
const dateValue = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const timeValue = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

/** Split a `YYYY-MM-DD` / `HH:MM` pair into a local Date, or null if unusable. */
export function parseWhenFields(date: string, time: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const t = /^(\d{2}):(\d{2})$/.exec(time)
  if (!d || !t) return null
  const at = new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]), 0, 0)
  return Number.isNaN(at.getTime()) ? null : at
}

export interface WhenEdit {
  /** `YYYY-MM-DD` */ date: string
  /** `HH:MM` */ start: string
  /** `HH:MM` */ end: string
  /** `YYYY-MM-DD`, only for an event that already spans days. */
  endDate?: string
  /** False until the reader changes the end themselves. */
  endTouched: boolean
}

/**
 * What a save should write.
 *
 * The rule, stated once so the tests can hold it: an untouched end FOLLOWS
 * the start, keeping the event exactly as long as it was. A touched end is
 * taken literally, and an end at or before its start rolls to the next day —
 * an 11pm–1am event is one night, not a negative duration.
 */
export function whenEditResult(event: CalendarEvent, edit: WhenEdit): { startTime: Date; endTime: Date } | null {
  const start = parseWhenFields(edit.date, edit.start)
  if (!start) return null
  if (!edit.endTouched) {
    return computeEventReschedule(event, {
      year: start.getFullYear(), month: start.getMonth(), day: start.getDate(),
      hour: start.getHours(), minute: start.getMinutes(),
    })
  }
  const end = parseWhenFields(edit.endDate ?? edit.date, edit.end)
  if (!end) return null
  if (end.getTime() > start.getTime()) return { startTime: start, endTime: end }
  const rolled = new Date(end)
  rolled.setDate(rolled.getDate() + 1)
  return { startTime: start, endTime: rolled }
}

interface Props {
  event: CalendarEvent
  startTime: Date
  endTime: Date | null
  /** The read-only line, drawn when not editing. */
  children: React.ReactNode
  /** Omitted on a view-only calendar: the line stays a statement. */
  onSave?: (startTime: Date, endTime: Date) => void | Promise<boolean | void>
  spansDays: boolean
}

export function EventWhenLine({ event, startTime, endTime, children, onSave, spansDays }: Props) {
  const [edit, setEdit] = useState<WhenEdit | null>(null)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const firstField = useRef<HTMLInputElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  /** Focus goes back to the line the editor replaced — after the render that
   *  restores it: a cancelled or saved edit must not leave the reader on <body>. */
  const returnFocus = useRef(false)
  const editing = edit !== null

  useEffect(() => {
    if (editing) { firstField.current?.focus(); return }
    if (!returnFocus.current) return
    returnFocus.current = false
    trigger.current?.focus()
  }, [editing])

  if (!onSave) return <>{children}</>

  const open = () => {
    setFailed(false)
    setEdit({
      date: dateValue(startTime),
      start: timeValue(startTime),
      end: endTime ? timeValue(endTime) : timeValue(startTime),
      endDate: spansDays && endTime ? dateValue(endTime) : undefined,
      endTouched: false,
    })
  }

  // Escape returns to the line it came from, unchanged and focused — a
  // cancelled edit must not leave the reader nowhere.
  const cancel = () => {
    setEdit(null)
    setFailed(false)
    returnFocus.current = true
  }

  const commit = async () => {
    if (!edit || saving) return
    const next = whenEditResult(event, edit)
    if (!next) { setFailed(true); return }
    setSaving(true)
    const ok = await onSave(next.startTime, next.endTime)
    setSaving(false)
    // Only `false` is a refusal. A host that returns nothing has said nothing,
    // and the edit is treated as landed — the behaviour before this existed.
    if (ok === false) { setFailed(true); return }
    setEdit(null)
    returnFocus.current = true
  }

  if (!edit) {
    return (
      <button
        ref={trigger}
        type="button"
        onClick={open}
        aria-label={`Change when this event is. ${startTime.toLocaleString()}`}
        className="event-when-line -mx-1 rounded px-1 text-left hover:bg-neutral-100 focus-visible:bg-neutral-100"
      >
        {children}
      </button>
    )
  }

  const field = 'rounded-md border border-neutral-200 px-2 py-1 text-[15px] tabular-nums focus:border-primary-500 focus:outline-none'
  const set = (patch: Partial<WhenEdit>) => setEdit((e) => (e ? { ...e, ...patch } : e))

  return (
    <div
      className="mt-1.5 flex flex-wrap items-center gap-2"
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel() }
        if (e.key === 'Enter') { e.preventDefault(); void commit() }
      }}
    >
      <input ref={firstField} type="date" aria-label="Date" value={edit.date}
        onChange={(e) => set({ date: e.target.value })} className={field} />
      <input type="time" aria-label="Start time" value={edit.start}
        onChange={(e) => set({ start: e.target.value })} className={field} />
      <span className="text-neutral-400">–</span>
      {edit.endDate !== undefined && (
        <input type="date" aria-label="End date" value={edit.endDate}
          onChange={(e) => set({ endDate: e.target.value, endTouched: true })} className={field} />
      )}
      <input type="time" aria-label="End time" value={edit.end}
        onChange={(e) => set({ end: e.target.value, endTouched: true })} className={field} />
      <button type="button" onClick={() => void commit()} disabled={saving}
        className="rounded-md bg-primary-600 px-3 py-1 text-[14px] font-semibold text-white disabled:opacity-60">
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button type="button" onClick={cancel} disabled={saving}
        className="rounded-md border border-neutral-200 px-3 py-1 text-[14px] text-neutral-600">
        Cancel
      </button>
      {failed && (
        <p role="alert" className="w-full text-[13px] text-accent-700">
          That didn’t save. Your change is still here — try again, or Cancel to leave it as it was.
        </p>
      )}
    </div>
  )
}
