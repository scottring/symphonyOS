// Step 1 of planning a period: Choose (spec 2026-10-19, plan from the level
// above). The lines of the level above, each with its steps and what every
// step is planned for; then what isn't under a line. Two views of the same
// items — All at once (each line one folded row) and One at a time (a line per
// card) — switched at the top and remembered by the page.
//
// Presentational: the page builds the lines and binds every verb. Each verb
// saves through the page's canvas activity (receipt and Undo); this view only
// says which one is saving and whether it failed.

import { useRef, useState, type ReactNode } from 'react'
import { InlineComposer } from '@/components/canvas/plan/InlineComposer'
import type { Planned } from '@/lib/planning/chooseFromAbove'

export interface ChooseVerb {
  label: string
  run: () => Promise<boolean>
  quiet?: boolean
  /** A verb that opens a short row of choices (Later ▸ Next week, Someday…). */
  menu?: ChooseVerb[]
}

export interface ChooseItemView {
  key: string
  title: string
  planned: Planned
  /** "from last week" */
  note?: string
  verbs: ChooseVerb[]
  children: ChooseItemView[]
  /** "Break it down": add a smaller step under this one, planned for this period. */
  onBreakDown?: (title: string) => Promise<boolean>
}

export interface ChooseLineView {
  key: string
  title: string
  planned: Planned
  note?: string
  /** "1 done · 2 this week · 4 on October" */
  counts: string
  verbs: ChooseVerb[]
  steps: ChooseItemView[]
  onAddStep?: (title: string) => Promise<boolean>
}

export type ChooseViewMode = 'all' | 'one'

export interface ChoosePlanProps {
  /** "this week", "October" */
  hereWord: string
  /** "October", "Fall"; undefined on Year, which has no level above. */
  aboveWord?: string
  lines: ChooseLineView[]
  /** Lines already done on the level above: the record, folded to one row. */
  doneLines?: ChooseLineView[]
  loose: ChooseItemView[]
  onAddLoose: (title: string) => Promise<boolean>
  /** Drop something in: filed under its line, or in Not under a line. Resolves
   *  to where it went ("under Organize documents"), or false. */
  onDropIn?: (title: string) => Promise<string | false>
  view: ChooseViewMode
  onViewChange: (v: ChooseViewMode) => void
  /** The step's way on: "Give them a day", or "I’m happy with October". */
  primary: { label: string; run: () => void | Promise<void>; busy?: boolean }
  /** Shown above the list when planned already ("October was planned Oct 2 by you"). */
  planned?: ReactNode
  loading?: boolean
}

const pillClass = (p: Planned) => `choose-pill is-${p.kind}`

export function ChoosePlan(p: ChoosePlanProps) {
  const [pending, setPending] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [openLine, setOpenLine] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  // The one composer open: `step:<lineKey>`, `break:<itemKey>`, or 'loose'.
  const [adding, setAdding] = useState<string | null>(null)
  const [added, setAdded] = useState(0)
  const [index, setIndexRaw] = useState(0)
  const cardRef = useRef<HTMLDivElement>(null)
  // A new card starts at its title, not wherever the last one was scrolled to.
  const setIndex = (i: number) => {
    setIndexRaw(i)
    requestAnimationFrame(() => cardRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }))
  }
  const [dropNote, setDropNote] = useState<string | null>(null)
  const [showDone, setShowDone] = useState(false)
  const doneLines = p.doneLines ?? []

  const cap = p.hereWord[0].toUpperCase() + p.hereWord.slice(1)
  const looseTitle = p.aboveWord ? 'Not under a line' : `${cap}, anything else`
  const runVerb = async (key: string, v: ChooseVerb) => {
    setPending(key); setFailed(null); setMenuOpen(null)
    const ok = await v.run()
    setPending(null)
    if (!ok) setFailed(key)
  }
  const add = (key: string, save: (title: string) => Promise<boolean>) => async (title: string) => {
    const ok = await save(title)
    if (ok) { setAdded((x) => x + 1); setAdding(key) }
    return ok
  }

  const verbRow = (key: string, title: string, verbs: ChooseVerb[], breakDown?: () => void) => (verbs.length || breakDown) ? <>
    <div className="choose-verbs" role="group" aria-label={`Plan ${title}`}>
      {verbs.map((v) => v.menu
        ? <button key={v.label} type="button" className={`choose-verb${v.quiet ? ' is-quiet' : ''}${menuOpen === key ? ' is-open' : ''}`} disabled={pending !== null}
            aria-expanded={menuOpen === key} aria-label={`${v.label}: ${title}`} onClick={() => setMenuOpen(menuOpen === key ? null : key)}>{v.label} ▸</button>
        : <button key={v.label} type="button" className={`choose-verb${v.quiet ? ' is-quiet' : ''}`} disabled={pending !== null}
            aria-label={`${v.label}: ${title}`} onClick={() => { void runVerb(key, v) }}>{v.label}</button>)}
      {breakDown && <button type="button" className="choose-verb is-quiet" disabled={pending !== null} aria-label={`Break it down: ${title}`} onClick={breakDown}>Break it down</button>}
    </div>
    {menuOpen === key && (() => {
      const menu = verbs.find((v) => v.menu)?.menu ?? []
      return <div className="choose-menu" role="group" aria-label={`Later: ${title}`}>
        {menu.map((m) => <button key={m.label} type="button" className="choose-when" disabled={pending !== null} onClick={() => { void runVerb(key, m) }}>{m.label}</button>)}
      </div>
    })()}
    {pending === key && <p className="choose-status" role="status">Saving…</p>}
    {failed === key && <p className="choose-status is-failed" role="alert">Didn’t save. Try again.</p>}
  </> : null

  const item = (it: ChooseItemView, depth: number): ReactNode => (
    <li key={it.key} className={`choose-step${it.planned.kind === 'done' ? ' is-done' : ''}${depth > 0 ? ' is-sub' : ''}`}>
      <div className="choose-step-head">
        <span className={pillClass(it.planned)}>{it.planned.label}</span>
        {it.note && <span className="choose-note">{it.note}</span>}
      </div>
      <p className="choose-step-title">{it.title}</p>
      {verbRow(it.key, it.title, it.verbs, it.onBreakDown ? () => setAdding(`break:${it.key}`) : undefined)}
      {(it.children.length > 0 || adding === `break:${it.key}`) && <ul className="choose-sub">
        {it.children.map((c) => item(c, depth + 1))}
        {adding === `break:${it.key}` && it.onBreakDown && <li className="choose-step is-sub is-new">
          <InlineComposer key={added} label={`A smaller step under ${it.title}`} saveLabel="Add" onSave={add(`break:${it.key}`, it.onBreakDown)} onCancel={() => setAdding(null)} />
        </li>}
      </ul>}
    </li>
  )

  const stepAdder = (line: ChooseLineView) => line.onAddStep && (adding === `step:${line.key}`
    ? <InlineComposer key={added} label={`A step ${p.hereWord} under ${line.title}`} saveLabel="Add" onSave={add(`step:${line.key}`, line.onAddStep)} onCancel={() => setAdding(null)} />
    : <button type="button" className="canvas-link choose-add" aria-label={`Add a step ${p.hereWord} under ${line.title}`} onClick={() => setAdding(`step:${line.key}`)}>+ A step {p.hereWord}</button>)

  const lineBody = (line: ChooseLineView) => <>
    {line.verbs.length > 0 && <div className="choose-line-verbs">
      <span className="choose-line-verbs-label">The whole line</span>
      {verbRow(line.key, line.title, line.verbs)}
    </div>}
    {line.steps.length > 0 && <ul className="choose-steps" aria-label={`Steps of ${line.title}`}>{line.steps.map((s) => item(s, 0))}</ul>}
    <div className="choose-add-row">{stepAdder(line)}</div>
  </>

  const looseSection = <section className="choose-loose" aria-label={looseTitle}>
    <h3 className="choose-loose-title">{looseTitle}</h3>
    {p.loose.length > 0 && <ul className="choose-steps">{p.loose.map((it) => item(it, 0))}</ul>}
    {adding === 'loose'
      ? <InlineComposer key={added} label={`Something for ${p.hereWord}`} saveLabel="Add" onSave={add('loose', p.onAddLoose)} onCancel={() => setAdding(null)} />
      : <button type="button" className="canvas-link choose-add" onClick={() => setAdding('loose')}>+ Add</button>}
  </section>

  const [drop, setDrop] = useState('')
  const dropIn = p.onDropIn && <form className="choose-dropin" onSubmit={async (e) => {
    e.preventDefault()
    const title = drop.trim()
    if (!title || !p.onDropIn) return
    const where = await p.onDropIn(title)
    if (where) { setDrop(''); setDropNote(`Added ${where}`) } else setDropNote('Didn’t save. Try again.')
  }}>
    <input id="choose-dropin" aria-label="Drop something in" placeholder="Drop something in…" value={drop} onChange={(e) => { setDrop(e.target.value); setDropNote(null) }} />
    <span className="choose-dropin-hint" role="status">{dropNote ?? (p.aboveWord ? `Filed under its ${p.aboveWord} line, or in Not under a line` : 'Added to the list')}</span>
  </form>

  // One at a time: one card per line, then Not under a line as the last card.
  const cards = p.lines.length + 1
  const at = Math.min(index, cards - 1)
  const current = at < p.lines.length ? p.lines[at] : null

  return <div className="choose" data-view={p.view}>
    <div className="choose-head">
      <h2 className="choose-h">{p.aboveWord ? `From ${p.aboveWord}` : `Plan ${p.hereWord}`}</h2>
      <div className="choose-switch" role="radiogroup" aria-label="View">
        {(['all', 'one'] as const).map((v) => <button key={v} type="button" role="radio" aria-checked={p.view === v}
          className={`choose-switch-btn${p.view === v ? ' is-on' : ''}`} onClick={() => p.onViewChange(v)}>{v === 'all' ? 'All at once' : 'One at a time'}</button>)}
      </div>
    </div>
    {p.planned && <p className="choose-was">{p.planned}</p>}

    {p.loading ? <p className="plan-status" role="status">Loading…</p> : p.view === 'all' ? <>
      {p.aboveWord && (p.lines.length === 0 && doneLines.length > 0
        ? <p className="choose-empty">Every {p.aboveWord} line is done.</p>
        : p.lines.length === 0
        ? <p className="choose-empty">Nothing open on {p.aboveWord}.</p>
        : <ul className="choose-lines" aria-label={`${p.aboveWord} lines`}>
          {p.lines.map((line) => {
            const open = openLine === line.key
            return <li key={line.key} className={`choose-line${open ? ' is-open' : ''}`}>
              <button type="button" className="choose-line-row" aria-expanded={open} onClick={() => setOpenLine(open ? null : line.key)}>
                <span className="choose-line-title">{line.title}</span>
                {line.planned.kind !== 'above' && <span className={pillClass(line.planned)}>{line.planned.label}</span>}
                <span className="choose-counts">{line.counts}</span>
                <span className="choose-chev" aria-hidden="true">{open ? '▾' : '▸'}</span>
              </button>
              {open && <div className="choose-line-body">{lineBody(line)}</div>}
            </li>
          })}
        </ul>)}
      {p.aboveWord && doneLines.length > 0 && <div className="choose-done">
        <button type="button" className="choose-done-fold" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>
          <span>{doneLines.length} done on {p.aboveWord}</span><span className="canvas-link">{showDone ? 'Hide' : 'Show'}</span>
        </button>
        {showDone && <ul className="choose-done-list">{doneLines.map((l) => <li key={l.key}><span className={pillClass(l.planned)}>{l.planned.label}</span> {l.title}</li>)}</ul>}
      </div>}
      {looseSection}
    </> : <>
      {current ? <div className="choose-card" ref={cardRef}>
        <div className="choose-card-head">
          <span className={pillClass(current.planned)}>{current.planned.kind === 'above' ? p.aboveWord : current.planned.label}</span>
          <h3 className="choose-card-title">{current.title}</h3>
          <p className="choose-counts">{current.counts}</p>
        </div>
        {lineBody(current)}
      </div> : <div className="choose-card" ref={cardRef}>{looseSection}</div>}
      <div className="choose-pager">
        <button type="button" className="canvas-link" disabled={at === 0} onClick={() => setIndex(at - 1)}>‹ Previous</button>
        <span className="choose-pager-count">{current ? `${at + 1} of ${p.lines.length} ${p.aboveWord ?? ''} lines` : looseTitle}</span>
        {at < cards - 1
          ? <button type="button" className="deck-btn choose-next" onClick={() => setIndex(at + 1)}>{at === p.lines.length - 1 ? looseTitle : 'Next line'}</button>
          : <span />}
      </div>
    </>}

    {dropIn}
    <div className="choose-foot">
      <button type="button" className="deck-btn is-primary" disabled={p.primary.busy} onClick={() => { void p.primary.run() }}>{p.primary.busy ? 'Saving…' : p.primary.label}</button>
    </div>
  </div>
}
