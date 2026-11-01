// Planning the year, step 7 (spec 2026-11-01): share and book the next
// session. Scott's own Work and Personal year goals, each with "Share with
// the family", which asks once on the page before it moves the goal to
// Family (its season and month steps keep their own space). Then a date for
// the first season session: "Book it" puts a personal, all-day
// "Plan {Season}" on that day. The date starts empty;
// nothing is shared or booked without a tap.

import { useId, useState } from 'react'
import { parseLocalYmd } from '@/lib/cadence/config'

type Goal = { id: string; title: string; context: 'work' | 'personal' }
const SPACE = { work: 'Work', personal: 'Personal' } as const
const dayLabel = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

export function ShareBook<G extends Goal>({ goals, seasonWord, onShare, onBook }: {
  /** The year's open Work and Personal goals that are Scott's own. */
  goals: readonly G[]
  /** The next season's name ("Spring"): the task is "Plan Spring". */
  seasonWord: string
  onShare: (goal: G) => Promise<boolean>
  /** Adds the season session on that day (local midnight). */
  onBook: (day: Date) => Promise<boolean>
}) {
  const dateId = useId()
  const [confirming, setConfirming] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [date, setDate] = useState('')
  const [booked, setBooked] = useState<Date | null>(null)
  const title = `Plan ${seasonWord}`

  const run = async (key: string, write: () => Promise<boolean>) => {
    setPending(key); setFailed(null)
    const ok = await write().catch(() => false)
    setPending(null)
    if (!ok) setFailed(key)
    return ok
  }
  const status = (key: string) => <>
    {pending === key && <p className="choose-status" role="status">Saving…</p>}
    {failed === key && <p className="choose-status is-failed" role="alert">Didn’t save. Try again.</p>}
  </>
  const day = /^\d{4}-\d{2}-\d{2}$/.test(date) ? parseLocalYmd(date) : null
  const book = async () => {
    if (!day) return
    setBooked(null)
    if (await run('book', () => onBook(day))) setBooked(day)
  }

  return <div className="gw-body">
    <h4 className="gw-h">Share with the family</h4>
    {goals.length === 0 ? <p className="choose-empty">No Work or Personal goals for this year.</p>
      : <ul className="gw-rows" aria-label="Work and Personal goals">
        {goals.map((g) => <li key={g.id} className="gw-row" aria-label={g.title}>
          <span className="gw-row-title">{g.title}</span>
          <span className="gw-row-note">{SPACE[g.context]}</span>
          {confirming === g.id
            ? <span className="gw-row-acts" role="group" aria-label={`Share ${g.title}?`}>
              <span className="gw-row-note">Everyone in the family will see it. Its steps stay yours.</span>
              <button type="button" className="choose-verb" disabled={pending !== null}
                onClick={() => { void run(g.id, () => onShare(g)).then((ok) => { if (ok) setConfirming(null) }) }}>Share it</button>
              <button type="button" className="choose-verb is-quiet" disabled={pending !== null} onClick={() => setConfirming(null)}>Not now</button>
            </span>
            : <span className="gw-row-acts">
              <button type="button" className="choose-verb is-quiet" disabled={pending !== null} aria-label={`Share with the family: ${g.title}`}
                onClick={() => { setFailed(null); setConfirming(g.id) }}>Share with the family</button>
            </span>}
          {status(g.id)}
        </li>)}
      </ul>}
    <label className="gw-h" htmlFor={dateId}>First season session</label>
    <div className="gy-book">
      <input id={dateId} type="date" className="gd-time-input" value={date} onChange={(e) => { setDate(e.target.value); setBooked(null) }} />
      <button type="button" className="choose-verb" disabled={!day || pending !== null} onClick={() => { void book() }}>Book it</button>
    </div>
    <p className="gw-row-note">Adds “{title}” to that day, for you.</p>
    {booked && pending === null && <p className="choose-status" role="status">Booked: {title}, {dayLabel(booked)}</p>}
    {status('book')}
  </div>
}
