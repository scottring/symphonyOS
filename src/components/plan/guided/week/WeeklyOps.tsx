// Planning the week, step 6 (spec 2026-11-01): weekly ops. What runs the week
// as it already stands: each day's dinner from the meal plan (with the way to
// the meal plan on this week), the routines on each day, and a line for what
// the weekend is for. Nothing here is suggested: an empty dinner says so, and
// the weekend note is only what is typed, saved on the person's own row.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Routine } from '@/types/actionable'
import { getRoutinesForDatePure } from '@/lib/routineUtils'
import { formatTimeCompact } from '@/lib/dateHelpers'
import { localYmd } from '@/lib/cadence/config'
import { usePlannedDinners } from '@/hooks/usePlannedDinners'
import { usePlanningNotes } from '@/hooks/usePlanningNotes'
import { weekToken } from '@/hooks/usePlanningSession'

const dayLabel = (d: Date) => `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${d.getDate()}`

/** "7a Walk the dog", "Bins out": timed ones first, by time. */
function routineLine(rs: readonly Routine[], day: Date): string {
  const at = (r: Routine) => {
    if (!r.time_of_day) return null
    const [h, m] = r.time_of_day.split(':').map(Number)
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m)
  }
  return [...rs]
    .map((r) => ({ r, t: at(r) }))
    .sort((a, b) => (a.t && b.t ? a.t.getTime() - b.t.getTime() : a.t ? -1 : b.t ? 1 : a.r.name.localeCompare(b.r.name)))
    .map(({ r, t }) => `${t ? `${formatTimeCompact(t)} ` : ''}${r.name}`)
    .join(' · ')
}

export function WeeklyOps({ weekStart, routines, draft, onDraft }: {
  weekStart: Date
  /** The routines the page shows under its filters (space and people). */
  routines: readonly Routine[]
  /** The weekend note as typed and not yet saved, kept by the session so it
   *  survives going to another step; null when nothing is being typed. */
  draft: string | null
  onDraft: (text: string | null) => void
}) {
  const days = Array.from({ length: 7 }, (_, i) => new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i))
  const dinners = usePlannedDinners(weekStart, 7)
  const notes = usePlanningNotes('weekly', weekToken(weekStart))
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<'saved' | 'failed' | null>(null)

  // Every day's routines once ("Every day"); each day lists the rest.
  const byDay = days.map((d) => getRoutinesForDatePure([...routines], d))
  const everyDay = byDay[0].filter((r) => byDay.every((rs) => rs.some((x) => x.id === r.id)))
  const daily = new Set(everyDay.map((r) => r.id))
  const rest = days.map((d, i) => ({ d, rs: byDay[i].filter((r) => !daily.has(r.id)) })).filter((x) => x.rs.length > 0)

  const saved = typeof notes.notes.weekend === 'string' ? notes.notes.weekend : ''
  const value = draft ?? saved
  const unsaved = draft !== null && draft.trim() !== saved.trim()
  const save = async () => {
    setSaving(true); setStatus(null)
    const ok = await notes.patch({ weekend: value.trim() }).catch(() => false)
    setSaving(false)
    setStatus(ok ? 'saved' : 'failed')
    if (ok) onDraft(null)
  }

  const hasDinner = days.some((d) => dinners.has(localYmd(d)))
  return <div className="gw-body gw-ops">
    <h4 className="gw-h">Dinners</h4>
    {hasDinner
      ? <ul className="gw-days" aria-label="Dinners">
        {days.map((d) => {
          const meal = dinners.get(localYmd(d))
          return <li key={localYmd(d)} className={meal ? undefined : 'is-empty'}><b>{dayLabel(d)}</b><span>{meal ? meal.title : 'No dinner yet'}</span></li>
        })}
      </ul>
      : <p className="gw-row-note">No dinners on the meal plan this week.</p>}
    <Link className="canvas-link gw-link" to={`/meals/plan?week=${localYmd(weekStart)}`}>Open the meal plan</Link>

    <h4 className="gw-h">Routines</h4>
    {everyDay.length === 0 && rest.length === 0
      ? <p className="gw-row-note">No routines this week.</p>
      : <>
        {everyDay.length > 0 && <p className="gw-every"><b>Every day:</b> <span>{routineLine(everyDay, days[0])}</span></p>}
        {rest.length > 0 && <ul className="gw-days" aria-label="Routines by day">
          {rest.map(({ d, rs }) => <li key={localYmd(d)}><b>{dayLabel(d)}</b><span>{routineLine(rs, d)}</span></li>)}
        </ul>}
      </>}

    <h4 className="gw-h">The weekend</h4>
    <textarea className="choose-textarea gw-textarea" aria-label="What the weekend is for" rows={2} value={value}
      disabled={notes.loading} onChange={(e) => { setStatus(null); onDraft(e.target.value) }} />
    <div className="gw-save">
      {unsaved && status === null && <p className="choose-status" role="status">Not saved yet</p>}
      {status === 'saved' && <p className="choose-status" role="status">Saved.</p>}
      {status === 'failed' && <p className="choose-status is-failed" role="alert">Didn’t save. Try again.</p>}
      <button type="button" className="deck-btn" disabled={saving || notes.loading} onClick={() => { void save() }}>{saving ? 'Saving…' : 'Save weekend note'}</button>
    </div>
  </div>
}
