// Planning the season, step 2 (spec 2026-11-01, paper-style 2026-11-04):
// choose from the year. The year's goals are for reading: the season is
// written in its own words, so nothing here makes a season goal from a year
// goal or says what the season holds under one. Someday, folded to one line,
// is a holding list, not a horizon: an item there can be put on the season.
// Bringing one in is not choosing: the season counts as planned from its
// goals by area.

import { useState } from 'react'

type Item = { id: string; title: string }

export function FromYear<S extends Item>({ yearWord, seasonWord, goals, someday, onBring }: {
  /** "2026" */
  yearWord: string
  /** "Fall" */
  seasonWord: string
  /** The year's open goals, as the page lists them, for reading. */
  goals: readonly Item[]
  /** What is in Someday, under the same filters (never what was let go). */
  someday: readonly S[]
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

  return <div className="gw-body">
    {goals.length === 0 ? <p className="choose-empty">No {yearWord} goals yet.</p>
      : <ul className="gw-rows" aria-label={`${yearWord} goals`}>
        {goals.map((g) => <li key={g.id} className="gw-row" aria-label={g.title}>
          <span className="gw-row-title">{g.title}</span>
        </li>)}
      </ul>}
    {someday.length > 0 && <>
      <button type="button" className="canvas-link choose-add" aria-expanded={showSomeday} onClick={() => setShowSomeday((v) => !v)}>
        Someday · {someday.length}
      </button>
      {showSomeday && <ul className="gw-rows" aria-label="Someday">
        {someday.map((s) => <li key={s.id} className="gw-row" aria-label={s.title}>
          <span className="gw-row-title">{s.title}</span>
          <span className="gw-row-acts">
            <button type="button" className="choose-verb" disabled={pending !== null} aria-label={`${seasonWord}: ${s.title}`}
              onClick={() => { void run(s.id, () => onBring(s)) }}>{seasonWord}</button>
          </span>
          {pending === s.id && <p className="choose-status" role="status">Saving…</p>}
          {failed === s.id && <p className="choose-status is-failed" role="alert">Didn’t save. Try again.</p>}
        </li>)}
      </ul>}
    </>}
  </div>
}
