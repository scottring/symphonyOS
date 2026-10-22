import { useState } from 'react'
import { LOG_KIND_LABEL } from '@/types/goalLog'
import { dayLabel, shortTime, weekdayLabel, type LogLine } from '@/lib/choices/log'
import { PopMenu } from './StatusMenu'
import { linkButton } from './DialogFrame'

/** A planned event's line text is its task's title; the kind and option
 *  already have their own places on the line, so they're left off it. */
function lineText(l: LogLine, name: string | undefined): string {
  let t = l.text
  if (!l.taskId) return t
  const prefix = `${LOG_KIND_LABEL[l.kind]}: `
  if (t.startsWith(prefix)) t = t.slice(prefix.length)
  if (name && t.endsWith(` (${name})`)) t = t.slice(0, -(name.length + 3))
  return t
}

/** The log, as lines: Coming up (soonest first), then Done (newest first).
 *  Each line: date · kind · option or the project · what happened, and who
 *  logged it. Entry lines have ⋯ Edit and Delete. */
export function LogList({ log, optionNames, memberName, limit, onEdit, onDelete }: {
  log: { upcoming: LogLine[]; done: LogLine[] }
  optionNames: ReadonlyMap<string, string>
  memberName: (userId: string) => string | undefined
  /** Shows the newest N done lines, with "All n" for the rest. */
  limit?: number
  onEdit?: (entryId: string) => void
  onDelete?: (entryId: string) => Promise<boolean>
}) {
  const [all, setAll] = useState(false)
  const { upcoming, done } = log
  if (upcoming.length === 0 && done.length === 0) return null
  const cut = limit !== undefined && !all && done.length > limit
  const shownDone = cut ? done.slice(0, limit) : done
  const group = 'px-3.5 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400'
  const line = (l: LogLine) => (
    <Line key={l.key} line={l} optionNames={optionNames} memberName={memberName} onEdit={onEdit} onDelete={onDelete} />
  )
  return (
    <div className="rounded-xl border border-neutral-200 bg-white">
      {upcoming.length > 0 && (
        <>
          <div className={group}>Coming up</div>
          <ul>{upcoming.map(line)}</ul>
        </>
      )}
      {done.length > 0 && (
        <>
          <div className={group}>Done</div>
          <ul>{shownDone.map(line)}</ul>
        </>
      )}
      {cut && (
        <div className="border-t border-neutral-100 px-3.5 py-2">
          <button type="button" onClick={() => setAll(true)} className={linkButton}>
            {`All ${upcoming.length + done.length}`}
          </button>
        </div>
      )}
    </div>
  )
}

function Line({ line: l, optionNames, memberName, onEdit, onDelete }: {
  line: LogLine
  optionNames: ReadonlyMap<string, string>
  memberName: (userId: string) => string | undefined
  onEdit?: (entryId: string) => void
  onDelete?: (entryId: string) => Promise<boolean>
}) {
  const [confirming, setConfirming] = useState(false)
  const name = l.optionId ? optionNames.get(l.optionId) : 'The project'
  const about = [name, l.time && shortTime(l.time), lineText(l, name)].filter(Boolean).join(' · ')
  const who = l.upcoming ? 'on your calendar' : l.userId && memberName(l.userId)
  const entryId = l.entryId
  const items = entryId ? [
    ...(onEdit ? [{ label: 'Edit', onPick: () => onEdit(entryId) }] : []),
    ...(onDelete ? [{ label: 'Delete', danger: true, onPick: () => setConfirming(true) }] : []),
  ] : []
  const row = 'border-t border-neutral-100 px-3.5 py-2 text-sm'

  if (confirming && entryId && onDelete) {
    return (
      <li className={`${row} flex flex-wrap items-center gap-2`}>
        <span className="text-[13px] text-neutral-600">Delete this entry?</span>
        <button type="button" onClick={async () => { if (await onDelete(entryId)) setConfirming(false) }}
          className="rounded-lg bg-red-500 px-3 py-1 text-[13px] font-medium text-white hover:bg-red-600">Delete</button>
        <button type="button" onClick={() => setConfirming(false)}
          className="px-2 py-1 text-[13px] font-medium text-neutral-500 hover:text-neutral-700">Cancel</button>
      </li>
    )
  }
  return (
    <li className={`${row} grid grid-cols-[auto_1fr_auto] items-baseline gap-x-3 gap-y-0.5 sm:grid-cols-[84px_110px_1fr_auto]`}>
      <span className={`text-[13px] ${l.upcoming ? 'font-medium text-primary-600' : 'text-neutral-500'}`}>
        {l.upcoming ? weekdayLabel(l.on) : dayLabel(l.on)}
      </span>
      <span className="font-medium text-neutral-900">{LOG_KIND_LABEL[l.kind]}</span>
      <span className="col-span-3 text-neutral-700 sm:col-span-1">{about}</span>
      <span className="col-start-3 row-start-1 flex items-baseline gap-2 justify-self-end text-xs text-neutral-400 sm:col-start-auto sm:row-start-auto">
        {who}
        {items.length > 0 && <PopMenu label="Entry actions" trigger="⋯" items={items} />}
      </span>
    </li>
  )
}
