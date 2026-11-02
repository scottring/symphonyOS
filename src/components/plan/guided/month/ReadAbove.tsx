// Reading the level above (spec 2026-11-01): Month's "Read the season list",
// and the Week's "Read November" (ReadMonth). Each goal above with where it
// stands and what is planned under it, so it is plain which goals have
// nothing yet. Reading, not choosing: tasks go under these goals at the
// choosing step, which the step says. Two things are done here as you read
// (walk 2026-11-02): a goal or a task already finished is ticked off, and a
// title opens its panel, as it does everywhere else.

import { useState } from 'react'
import type { ChooseItemView, ChooseLineView, ChooseVerb } from '@/components/plan/choose/ChoosePlan'

/** The row's own tick: Done on an open row, Reopen on a done one (the
 *  page's verbs, so it saves with its receipt and Undo). */
const tickOf = (verbs: readonly ChooseVerb[], done: boolean) => verbs.find((v) => v.role === (done ? 'reopen' : 'done'))

export function ReadAbove({ aboveWord, lines, doneLines, onOpen, chooseLater }: {
  /** "Fall", "November" */
  aboveWord: string
  /** The open goals above (ChoosePlan's lines), already filtered as the page is. */
  lines: readonly ChooseLineView[]
  doneLines: readonly ChooseLineView[]
  /** Opens a goal or task in its panel. */
  onOpen?: (taskId: string) => void
  /** "You'll put tasks under these at step 5, Choose." */
  chooseLater?: string
}) {
  const [pending, setPending] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const tick = async (key: string, verb: ChooseVerb) => {
    setPending(key); setFailed(null)
    const ok = await verb.run().catch(() => false)
    setPending(null)
    if (!ok) setFailed(key)
  }

  const row = (key: string, title: string, done: boolean, verbs: readonly ChooseVerb[], titleClass: string) => {
    const verb = tickOf(verbs, done)
    return <span className="gw-read-head">
      {verb && <input type="checkbox" className="gw-read-tick" checked={done} disabled={pending !== null}
        aria-label={`${done ? 'Not done' : 'Done'}: ${title}`} onChange={() => { void tick(key, verb) }} />}
      {onOpen
        ? <button type="button" className={`gw-read-title ${titleClass}`} onClick={() => onOpen(key)}>{title}</button>
        : <span className={titleClass}>{title}</span>}
    </span>
  }
  const status = (key: string) => <>
    {pending === key && <p className="choose-status" role="status">Saving…</p>}
    {failed === key && <p className="choose-status is-failed" role="alert">Didn’t save. Try again.</p>}
  </>
  const steps = (items: readonly ChooseItemView[]) => <ul className="gw-steps">
    {items.map((s) => {
      const done = s.planned.kind === 'done'
      return <li key={s.key} className={done ? 'is-done' : undefined}>
        {row(s.key, s.title, done, s.verbs, 'gw-step-title')} <span className="gw-row-note">{s.planned.label}</span>
        {status(s.key)}
        {s.children.length > 0 && steps(s.children)}
      </li>
    })}
  </ul>
  const goal = (l: ChooseLineView, done: boolean) => <li key={l.key} className={`gw-row${done ? ' is-done' : ''}`} aria-label={l.title}>
    {row(l.key, l.title, done, l.verbs, 'gw-row-title')}
    {l.counts && <span className="gw-row-note">{l.counts}</span>}
    {status(l.key)}
    {!done && (l.steps.length > 0 ? steps(l.steps) : <span className="gw-row-note">Nothing under it yet</span>)}
  </li>

  return <div className="gw-body">
    {lines.length === 0 && doneLines.length === 0 ? <p className="choose-empty">Nothing on {aboveWord} yet.</p>
      : <ul className="gw-rows" aria-label={`${aboveWord} goals`}>
        {lines.map((l) => goal(l, false))}
        {/* Done goals stay in sight, ticked, so a tick is seen to have
            taken and can be undone. */}
        {doneLines.map((l) => goal(l, true))}
      </ul>}
    {lines.length === 0 && doneLines.length > 0 && <p className="choose-was">Every {aboveWord} goal is done.</p>}
    {chooseLater && lines.length > 0 && <p className="gw-row-note">{chooseLater}</p>}
  </div>
}
