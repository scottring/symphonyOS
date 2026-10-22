import { useId, useState } from 'react'
import { LOG_KINDS, LOG_KIND_LABEL, type LogEntry, type LogKind } from '@/types/goalLog'
import { isAhead, localYmd, shortTime, weekdayLabel } from '@/lib/choices/log'
import { DialogFrame, inputClass, primaryButton, quietButton } from './DialogFrame'
import type { LogInput } from './useChoiceEditing'

const PROJECT = ''

/** Log a call, visit, message, meeting or note: what, when, one line, and
 *  what it is about. A later day plans it instead (a task on the calendar).
 *  With `initial` it edits that entry; what it is about stays. */
export function LogDialog({ title, options, about, initial, now, onSave, onCancel }: {
  title: string
  options: readonly { id: string; name: string }[]
  /** The option it is about; left out = the project. */
  about?: string
  initial?: LogEntry
  now: Date
  onSave: (input: LogInput) => Promise<boolean>
  onCancel: () => void
}) {
  const ids = { when: useId(), summary: useId(), about: useId() }
  const today = localYmd(now)
  const [kind, setKind] = useState<LogKind>(initial?.kind ?? 'call')
  const [on, setOn] = useState(initial?.on ?? today)
  const [time, setTime] = useState(initial?.time ?? '')
  const [summary, setSummary] = useState(initial?.summary ?? '')
  const [optionId, setOptionId] = useState(initial ? (initial.optionId ?? PROJECT) : (about ?? PROJECT))
  const [busy, setBusy] = useState(false)

  const validDay = /^\d{4}-\d{2}-\d{2}$/.test(on)
  const ahead = validDay && isAhead(on, now)
  // An entry stays in the past; only a new one can be planned ahead.
  const canSave = !busy && validDay && summary.trim().length > 0 && !(initial && ahead)

  const save = async () => {
    if (!canSave) return
    setBusy(true)
    const ok = await onSave({
      ...(optionId ? { optionId } : {}),
      kind, on, ...(time ? { time } : {}), summary: summary.trim(),
    })
    setBusy(false)
    if (ok) onCancel()
  }

  const heading = 'mb-1 block text-[12px] text-neutral-500'
  const label = `${heading} mt-3`
  return (
    <DialogFrame title={title} onClose={onCancel}>
      <div className={heading}>What</div>
      <div className="flex flex-wrap gap-1.5">
        {LOG_KINDS.map((k) => (
          <button key={k} type="button" aria-pressed={k === kind} onClick={() => setKind(k)}
            className={`rounded-full border px-3 py-1 text-[13px] ${
              k === kind ? 'border-primary-600 bg-primary-600 text-white' : 'border-neutral-200 text-neutral-600 hover:border-neutral-300'
            }`}>
            {LOG_KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <label htmlFor={ids.when} className={label}>When</label>
      <div className="grid grid-cols-2 gap-2">
        <input id={ids.when} type="date" value={on} max={initial ? today : undefined}
          onChange={(e) => setOn(e.target.value)} className={inputClass} />
        <input type="time" aria-label="Time" value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} />
      </div>
      <label htmlFor={ids.summary} className={label}>What happened, or what it's for</label>
      <input id={ids.summary} autoFocus value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={500}
        onKeyDown={(e) => { if (e.key === 'Enter') void save() }} className={inputClass} />
      {!initial && options.length > 0 && (
        <>
          <label htmlFor={ids.about} className={label}>About</label>
          <select id={ids.about} value={optionId} onChange={(e) => setOptionId(e.target.value)} className={inputClass}>
            <option value={PROJECT}>The project (no one contractor)</option>
            {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </>
      )}
      {ahead && !initial && (
        <p className="mt-3 rounded-lg bg-primary-50 px-3 py-2 text-[13px] text-primary-700">
          {`That date is ahead, so this goes on your calendar for ${weekdayLabel(on)}${time ? ` at ${shortTime(time)}` : ''}. It joins the log when you tick it done.`}
        </p>
      )}
      <div className="mt-4 flex justify-end gap-1">
        <button type="button" onClick={onCancel} className={quietButton}>Cancel</button>
        <button type="button" disabled={!canSave} onClick={() => void save()} className={primaryButton}>Save</button>
      </div>
    </DialogFrame>
  )
}
