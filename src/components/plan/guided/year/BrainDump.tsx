// Planning the year, step 5, the choosing step (spec 2026-11-01): brain dump
// goals. The year's goals under each of Scott's life areas, an area with none
// pointed out ("Nothing in Money yet.") and never filled, and a line under
// each to add another there; goals with no area last. Every add saves
// through the page's writer, which the session wraps so the first one that
// saves marks the year planned.

import { useId, useState } from 'react'

type Area = { id: string; name: string }
type Goal = { id: string; title: string; areaId: string | null }

function Group({ name, heading, empty, fieldLabel, goals, onAdd }: {
  name: string
  heading: boolean
  empty?: string
  fieldLabel: string
  goals: readonly Goal[]
  onAdd: (title: string) => Promise<boolean>
}) {
  const headId = useId()
  const [text, setText] = useState('')
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const add = async () => {
    const title = text.trim()
    if (!title || pending) return
    setPending(true); setFailed(false)
    const ok = await onAdd(title).catch(() => false)
    setPending(false)
    if (ok) setText(''); else setFailed(true)
  }
  return <section className="gy-dump-area" aria-labelledby={heading ? headId : undefined} aria-label={heading ? undefined : name}>
    {heading && <h4 className="gw-h" id={headId}>{name}</h4>}
    {goals.length > 0
      ? <ul className="gw-steps" aria-label={`${name} goals`}>
        {goals.map((g) => <li key={g.id}><span className="gw-step-title">{g.title}</span></li>)}
      </ul>
      : empty && <p className="gw-row-note">{empty}</p>}
    <form className="gy-dump-add" onSubmit={(e) => { e.preventDefault(); void add() }}>
      <input type="text" className="guide-areas-name" aria-label={fieldLabel} placeholder="Add a goal" value={text}
        onChange={(e) => { setText(e.target.value); setFailed(false) }} />
      <button type="submit" className="choose-verb" disabled={!text.trim() || pending}>Add</button>
    </form>
    {pending && <p className="choose-status" role="status">Saving…</p>}
    {failed && <p className="choose-status is-failed" role="alert">Didn’t save. Try again.</p>}
  </section>
}

export function BrainDump({ yearWord, areas, goals, onAdd }: {
  /** "2027" */
  yearWord: string
  /** Scott's life areas under the page's space filter, in order. */
  areas: readonly Area[]
  /** The year's open goals, as the page lists them. */
  goals: readonly Goal[]
  /** Adds a year goal in that area (null: no area). */
  onAdd: (title: string, areaId: string | null) => Promise<boolean>
}) {
  if (!areas.length) {
    return <div className="gw-body">
      <Group name={`${yearWord} goals`} heading={false} fieldLabel={`New ${yearWord} goal`} goals={goals} onAdd={(t) => onAdd(t, null)} />
    </div>
  }
  const known = new Set(areas.map((a) => a.id))
  const loose = goals.filter((g) => !g.areaId || !known.has(g.areaId))
  return <div className="gw-body gy-dump">
    {areas.map((a) => <Group key={a.id} name={a.name} heading empty={`Nothing in ${a.name} yet.`} fieldLabel={`New goal in ${a.name}`}
      goals={goals.filter((g) => g.areaId === a.id)} onAdd={(t) => onAdd(t, a.id)} />)}
    <Group name="No area" heading fieldLabel="New goal, no area" goals={loose} onAdd={(t) => onAdd(t, null)} />
  </div>
}
