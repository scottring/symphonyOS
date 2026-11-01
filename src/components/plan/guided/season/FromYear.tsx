// Planning the season, step 2 (spec 2026-11-01): choose from the year. The
// year's goals, each with what the season already holds under it, and
// Someday, folded to one line. A year goal with nothing on the season yet can
// be brought in (a season goal of the same words under it, as the Year
// page's own "Fall" does); a Someday item can be put on the season. Picking
// here is not choosing: the season counts as planned from its goals by area.

import { useState } from 'react'

type Goal = { id: string; title: string; here: readonly string[] }
type Item = { id: string; title: string }

export function FromYear<G extends Goal, S extends Item>({ yearWord, seasonWord, goals, someday, onPick, onBring }: {
  /** "2026" */
  yearWord: string
  /** "Fall" */
  seasonWord: string
  /** The year's open goals, as the page lists them, with the season's lines under each. */
  goals: readonly G[]
  /** What is in Someday, under the same filters. */
  someday: readonly S[]
  onPick: (goal: G) => Promise<boolean>
  onBring: (item: S) => Promise<boolean>
}) {
  const [pending, setPending] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [showSomeday, setShowSomeday] = useState(false)
  const run = async (key: string, write: () => Promise<boolean>) => {
    setPending(key); setFailed(null)
    const ok = await write().catch(() => false)
    setPending(null)
    if (!ok) setFailed(key)
  }
  const status = (key: string) => <>
    {pending === key && <p className="choose-status" role="status">Saving…</p>}
    {failed === key && <p className="choose-status is-failed" role="alert">Didn’t save. Try again.</p>}
  </>
  const pick = (key: string, title: string, write: () => Promise<boolean>) =>
    <button type="button" className="choose-verb" disabled={pending !== null} aria-label={`${seasonWord}: ${title}`}
      onClick={() => { void run(key, write) }}>{seasonWord}</button>

  return <div className="gw-body">
    {goals.length === 0 ? <p className="choose-empty">No {yearWord} goals yet.</p>
      : <ul className="gw-rows" aria-label={`${yearWord} goals`}>
        {goals.map((g) => <li key={g.id} className="gw-row" aria-label={g.title}>
          <span className="gw-row-title">{g.title}</span>
          {g.here.length > 0
            ? <span className="gw-row-note">On {seasonWord}: {g.here.join(', ')}</span>
            : <span className="gw-row-acts">{pick(g.id, g.title, () => onPick(g))}</span>}
          {status(g.id)}
        </li>)}
      </ul>}
    {someday.length > 0 && <>
      <button type="button" className="canvas-link choose-add" aria-expanded={showSomeday} onClick={() => setShowSomeday((v) => !v)}>
        Someday · {someday.length}
      </button>
      {showSomeday && <ul className="gw-rows" aria-label="Someday">
        {someday.map((s) => <li key={s.id} className="gw-row" aria-label={s.title}>
          <span className="gw-row-title">{s.title}</span>
          <span className="gw-row-acts">{pick(s.id, s.title, () => onBring(s))}</span>
          {status(s.id)}
        </li>)}
      </ul>}
    </>}
  </div>
}
