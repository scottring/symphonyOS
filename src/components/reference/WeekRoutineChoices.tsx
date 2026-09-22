import { useState } from 'react'
import { ChevronDown, ChevronRight, Repeat } from 'lucide-react'
import { localYmd } from '@/lib/cadence/config'
import type { WeekRoutineDay } from '@/lib/planning/weekRoutineChoices'
import type { DayPlanEntry } from '@/lib/today/dayPlan'

export function WeekRoutineChoices({ days, onChoose, onOpen }: {
  days: WeekRoutineDay[]
  onChoose?: (entry: DayPlanEntry, date: Date) => Promise<boolean>
  onOpen?: (entry: DayPlanEntry) => void
}) {
  const [open, setOpen] = useState(true)
  const [selected, setSelected] = useState(() => {
    const today = localYmd(new Date())
    return days.find(day => localYmd(day.date) === today && day.entries.length)?.date
      ?? days.find(day => day.entries.length)?.date ?? days[0]?.date
  })
  const day = days.find(day => selected && localYmd(day.date) === localYmd(selected)) ?? days[0]
  if (!day) return <p className="shelf-intro">No routine occurrences available for this week.</p>
  return <section aria-label="Routine choices" className="chooser-section">
    <h3 className="chooser-section-heading">
      <button type="button" aria-expanded={open} aria-controls="week-routine-choices" onClick={() => setOpen(!open)} className="chooser-section-toggle">
        {open ? <ChevronDown aria-hidden className="h-3.5 w-3.5" /> : <ChevronRight aria-hidden className="h-3.5 w-3.5" />}
        <Repeat aria-hidden className="h-3.5 w-3.5" />Routines
      </button>
    </h3>
    {open && <div id="week-routine-choices">
      <label className="mt-2 block text-[12px] text-neutral-500">Add an occurrence to
        <select aria-label="Routine day" className="mt-1 block w-full rounded border border-neutral-200 bg-white px-2 py-2 text-[13px] text-neutral-800" value={localYmd(day.date)} onChange={event => setSelected(days.find(day => localYmd(day.date) === event.target.value)!.date)}>
          {days.map(day => <option key={localYmd(day.date)} value={localYmd(day.date)}>{day.date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</option>)}
        </select>
      </label>
      <ul className="mt-2">{day.entries.map(entry => <Occurrence key={`${entry.key}:${localYmd(day.date)}`} entry={entry} date={day.date} onChoose={onChoose} onOpen={onOpen} />)}</ul>
      {!day.entries.length && <p className="py-3 text-[13px] text-neutral-500">No unplanned routines for this day.</p>}
      <p className="mt-2 text-[12px] text-neutral-500">Adds only this occurrence. The repeating schedule stays the same.</p>
    </div>}
  </section>
}

function Occurrence({ entry, date, onChoose, onOpen }: { entry: DayPlanEntry; date: Date; onChoose?: (entry: DayPlanEntry, date: Date) => Promise<boolean>; onOpen?: (entry: DayPlanEntry) => void }) {
  const [saving, setSaving] = useState(false)
  const [added, setAdded] = useState(false)
  const [failed, setFailed] = useState(false)
  return <li className="border-b border-neutral-200 py-3 text-[14px]">
    <div className="flex items-start gap-2">
      <button type="button" onClick={() => onOpen?.(entry)} className="min-w-0 flex-1 text-left text-neutral-800 hover:underline">{entry.title}</button>
      <button type="button" aria-label={`Add ${entry.title} to ${date.toLocaleDateString('en-US', { weekday: 'long' })}`} disabled={saving || added || !onChoose} className="shrink-0 text-[12px] font-medium text-primary-700 disabled:opacity-50" onClick={async () => {
        setSaving(true); setFailed(false)
        try { const ok = await onChoose!(entry, date); setAdded(ok); setFailed(!ok) }
        catch { setFailed(true) }
        finally { setSaving(false) }
      }}>{added ? 'Added' : saving ? 'Adding…' : '+ Add'}</button>
    </div>
    {failed && <p role="alert" className="mt-1 text-xs text-red-600">Could not add the occurrence. Try again.</p>}
  </li>
}
