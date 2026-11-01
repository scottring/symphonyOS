// Planning the year, step 6 (spec 2026-11-01): refine the list. The year's
// goals that may say the same thing (findOverlaps), two at a time, each pair
// with Scott's three calls: Keep both (set aside, kept in his notes for the
// year so the pair does not come back next session), Let go of one, or
// Someday for one — he picks which. Nothing is merged or changed on its own;
// each call saves through the page's writers.

import { useState } from 'react'
import { findOverlaps } from '@/lib/guide/overlaps'
import type { NotesPatch } from '@/hooks/usePlanningNotes'
import { useNoteSave } from '../season/useNoteSave'
import { SaveFailed } from '../season/SeasonNotes'

type Goal = { id: string; title: string }
type Verb = 'let-go' | 'someday'
const ASK: Record<Verb, string> = { 'let-go': 'Let go of which?', someday: 'Someday: which?' }

type Pair = [string, string]
const pairKey = (a: string, b: string) => `${a}|${b}`
const NONE: Pair[] = []

export function Refine<G extends Goal>({ goals, kept, onKeepBoth, onLetGo, onSomeday }: {
  /** The year's open goals, as the page lists them. */
  goals: readonly G[]
  /** Pairs set aside with Keep both ([earlier id, later id]). */
  kept: readonly (readonly [string, string])[]
  onKeepBoth: (pair: Pair) => void
  onLetGo: (goal: G) => Promise<boolean>
  onSomeday: (goal: G) => Promise<boolean>
}) {
  const [asking, setAsking] = useState<{ key: string; verb: Verb } | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const byId = new Map(goals.map((g) => [g.id, g]))
  const keptKeys = new Set(kept.map(([a, b]) => pairKey(a, b)))
  const pairs = findOverlaps(goals).map(([a, b]) => ({ key: pairKey(a, b), a: byId.get(a)!, b: byId.get(b)! })).filter((p) => !keptKeys.has(p.key))

  const run = async (key: string, write: () => Promise<boolean>) => {
    setPending(key); setFailed(null)
    const ok = await write().catch(() => false)
    setPending(null); setAsking(null)
    if (!ok) setFailed(key)
  }

  return <div className="gy-refine">
    {pairs.length === 0 ? <p className="choose-empty">Nothing on the list looks alike.</p>
      : <ul className="gw-rows" aria-label="May overlap">
        {pairs.map(({ key, a, b }) => <li key={key} className="gw-row" aria-label={`${a.title} and ${b.title}`}>
          <span className="gw-row-title">{a.title}</span>
          <span className="gw-row-title">{b.title}</span>
          {asking?.key === key
            ? <span className="gw-row-acts" role="group" aria-label={ASK[asking.verb]}>
              <span className="gw-row-note">{ASK[asking.verb]}</span>
              {[a, b].map((g) => <button key={g.id} type="button" className="choose-verb" disabled={pending !== null}
                onClick={() => { void run(key, () => (asking.verb === 'let-go' ? onLetGo : onSomeday)(g)) }}>{g.title}</button>)}
              <button type="button" className="choose-verb is-quiet" disabled={pending !== null} onClick={() => setAsking(null)}>Cancel</button>
            </span>
            : <span className="gw-row-acts" role="group" aria-label={`Decide ${a.title} and ${b.title}`}>
              <button type="button" className="choose-verb" disabled={pending !== null} onClick={() => onKeepBoth([a.id, b.id])}>Keep both</button>
              <button type="button" className="choose-verb is-quiet" disabled={pending !== null} onClick={() => { setFailed(null); setAsking({ key, verb: 'let-go' }) }}>Let go of one</button>
              <button type="button" className="choose-verb is-quiet" disabled={pending !== null} onClick={() => { setFailed(null); setAsking({ key, verb: 'someday' }) }}>Someday</button>
            </span>}
          {pending === key && <p className="choose-status" role="status">Saving…</p>}
          {failed === key && <p className="choose-status is-failed" role="alert">Didn’t save. Try again.</p>}
        </li>)}
      </ul>}
  </div>
}

/** The step's body: Keep both saved into the year's notes (`keptPairs`),
 *  each one building on the last sent, with Try again. */
export function YearRefine<G extends Goal>({ value, patch, ...rest }: {
  goals: readonly G[]
  value?: Pair[]
  patch: (p: NotesPatch) => Promise<boolean>
  onLetGo: (goal: G) => Promise<boolean>
  onSomeday: (goal: G) => Promise<boolean>
}) {
  const note = useNoteSave(value ?? NONE, (keptPairs) => patch({ keptPairs }))
  return <div className="gw-body">
    <Refine {...rest} kept={note.value} onKeepBoth={(pair) => note.set([...note.value, pair])} />
    <SaveFailed on={note.failed} retry={note.retry} />
  </div>
}
