// Step 1 of planning a period: Choose (spec 2026-10-19, plan from the level
// above; card design approved 2026-10-19, mockup choose-v2). One goal of the
// level above per card — "October goals → this week" — with where it stands
// in one quiet line and three plain choices: Do this week, Not this week,
// Done. A decided card wears its stamp (the deck's, back) with Undo beside it.
// A goal's steps are listed on its card, each with its own choices. After the
// last goal, what isn't under a goal. All at once lays the same goals out as
// one list instead; the switch is remembered by the page.
//
// Presentational: the page builds the goals and binds every verb. Each verb
// saves through the page's canvas activity (receipt and Undo); this view says
// which one is saving, whether it failed, and stamps what was decided here.

import { useRef, useState, type ReactNode } from 'react'
import { InlineComposer } from '@/components/canvas/plan/InlineComposer'
import { Stamp } from '@/components/plan/v2/Stamp'
import type { Planned } from '@/lib/planning/chooseFromAbove'
import type { ChooseViewMode } from '@/lib/planning/chooseView'

/** What a verb does, so the card can place it: bring here, send back up, done, reopen, or anything else. */
export type ChooseRole = 'here' | 'back' | 'done' | 'reopen' | 'other'

export interface ChooseVerb {
  label: string
  run: () => Promise<boolean>
  role?: ChooseRole
  quiet?: boolean
  /** A verb that opens a short row of choices (Later ▸ Next week, Someday…). */
  menu?: ChooseVerb[]
}

export interface ChooseItemView {
  key: string
  title: string
  planned: Planned
  /** "from last week", "in your Inbox" */
  note?: string
  verbs: ChooseVerb[]
  children: ChooseItemView[]
  /** Break it down: a smaller step under this one, planned for this period. */
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

export interface ChoosePlanProps {
  /** "this week", "October" */
  hereWord: string
  /** "October", "Fall"; undefined on Year, which has no level above. */
  aboveWord?: string
  lines: ChooseLineView[]
  /** Goals already done on the level above: the record, folded to one row. */
  doneLines?: ChooseLineView[]
  loose: ChooseItemView[]
  onAddLoose: (title: string) => Promise<boolean>
  view: ChooseViewMode
  onViewChange: (v: ChooseViewMode) => void
  /** The way on after the last card: "Give them a day", "I’m happy with October". */
  primary: { label: string; run: () => void | Promise<void>; busy?: boolean }
  /** "October was planned Oct 2 by you. You can still change it." */
  planned?: ReactNode
  /** The kicker over the cards: "October goals → this week". */
  kicker: string
  onLeave: () => void
  loading?: boolean
}

type Decision = 'here' | 'stay' | 'done'

const NOOP: ChooseVerb = { label: '', run: async () => true }

export function ChoosePlan(p: ChoosePlanProps) {
  const [pending, setPending] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  // The one composer open: `step:<lineKey>`, `break:<itemKey>`, or 'loose'.
  const [adding, setAdding] = useState<string | null>(null)
  const [added, setAdded] = useState(0)
  const [openLine, setOpenLine] = useState<string | null>(null)
  const [showDone, setShowDone] = useState(false)
  // Decided here, this sitting: the card wears the stamp with Undo beside it.
  const [decided, setDecided] = useState<Record<string, Decision>>({})
  const [index, setIndexRaw] = useState(0)
  const cardRef = useRef<HTMLDivElement>(null)
  const setIndex = (i: number) => {
    setIndexRaw(i)
    // The new card from its title, clear of the page's top bar.
    requestAnimationFrame(() => {
      const el = cardRef.current
      if (!el) return
      const top = el.getBoundingClientRect().top + window.scrollY - 140
      if (el.getBoundingClientRect().top < 120) window.scrollTo?.({ top: Math.max(0, top), behavior: 'smooth' })
    })
  }

  const here = p.hereWord
  // "this week" reads on its own; "October" takes an "in".
  const inHere = /^(this|next|last) /.test(here) ? here : `in ${here}`
  const above = p.aboveWord
  const doneLines = p.doneLines ?? []
  // What is on this period but not under a goal of the level above.
  const looseTitle = above ? `Also ${inHere}` : `On ${here}`
  const looseNote = above ? `${cap(here === inHere ? `on ${here}` : inHere)}, not part of ${/^[aeiou]/i.test(above) ? 'an' : 'a'} ${above} goal.` : null
  const [showSettled, setShowSettled] = useState(false)

  const run = async (key: string, v: ChooseVerb, then?: Decision | null) => {
    setPending(key); setFailed(null); setMenuOpen(null)
    const ok = await v.run()
    setPending(null)
    if (!ok) { setFailed(key); return false }
    if (then !== undefined) setDecided((d) => { const n = { ...d }; if (then) n[key] = then; else delete n[key]; return n })
    return true
  }
  const role = (verbs: ChooseVerb[], r: ChooseRole) => verbs.find((v) => v.role === r)
  const add = (key: string, save: (title: string) => Promise<boolean>) => async (title: string) => {
    const ok = await save(title)
    if (ok) { setAdded((x) => x + 1); setAdding(key) }
    return ok
  }
  const status = (key: string) => <>
    {pending === key && <p className="choose-status" role="status">Saving…</p>}
    {failed === key && <p className="choose-status is-failed" role="alert">Didn’t save. Try again.</p>}
  </>

  // Where a goal or step stands now, in plain words.
  const whereNow = (pl: Planned, d?: Decision): string => {
    if (d === 'stay') return `Stays on ${above}`
    if (d === 'done' || pl.kind === 'done') return 'Done'
    if (d === 'here' && pl.kind !== 'day') return `On ${here}`
    if (pl.kind === 'missed') return pl.label
    if (pl.kind === 'day') return `On ${pl.label[0].toLowerCase()}${pl.label.slice(1)}`
    if (pl.kind === 'here') return `On ${here}`
    if (pl.kind === 'last') return `From ${pl.label.toLowerCase()}, not done`
    return above ? `On ${above}` : `On ${here}`
  }
  // A stamp marks a choice made here, this sitting — never a state found on
  // arrival (Scott, 2026-10-19: a stamp on every row meant nothing).
  const stampFor = (key: string, _pl: Planned, small = false): ReactNode => {
    const d = decided[key]
    const cls = small ? 'choose-stamp-mini' : 'choose-stamp'
    if (d === 'stay') return <Stamp kind="someday" word={`On ${above}`} context={`Not ${inHere}`} fresh className={cls} />
    if (d === 'done') return <Stamp kind="done" context="Done" fresh className={cls} />
    if (d === 'here') return <Stamp kind="carried" word={here} context={above ? `${above} goal` : here} fresh className={cls} />
    return null
  }
  const menuRow = (key: string, title: string, verbs: ChooseVerb[]) => menuOpen === key && <div className="choose-menu" role="group" aria-label={`Later: ${title}`}>
    {(verbs.find((v) => v.menu)?.menu ?? []).map((m) => <button key={m.label} type="button" className="choose-when" disabled={pending !== null}
      onClick={() => { void run(key, m) }}>{m.label}</button>)}
  </div>

  // ---- A goal's choices: three plain ones, or Undo once decided here.
  const choices = (key: string, title: string, pl: Planned, verbs: ChooseVerb[]) => {
    const d = decided[key]
    const doIt = role(verbs, 'here'), back = role(verbs, 'back'), done = role(verbs, 'done'), reopen = role(verbs, 'reopen')
    const others = verbs.filter((v) => !v.role || v.role === 'other')
    if (d) {
      const undo = d === 'stay' ? NOOP : d === 'done' ? reopen : back
      return undo ? <div className="choose-choices is-one"><button type="button" className="deck-btn is-quiet" disabled={pending !== null}
        aria-label={`Undo: ${title}`} onClick={() => { void run(key, undo, null) }}>Undo</button></div> : null
    }
    // A year goal on the Season page is planned through its steps, never placed itself.
    if (pl.kind === 'done' || verbs.length === 0) return null
    const onHere = pl.kind === 'here' || pl.kind === 'day'
    const list: { label: string; v: ChooseVerb; then: Decision | null; primary?: boolean }[] = [
      ...(!onHere && doIt ? [{ label: `Do ${inHere}`, v: doIt, then: 'here' as Decision, primary: true }] : []),
      ...(onHere && back ? [{ label: `Not ${inHere}`, v: back, then: null }] : []),
      // Not this week on a goal still on October changes nothing: it stays, stamped.
      ...(!onHere && above ? [{ label: `Not ${inHere}`, v: pl.kind === 'last' && back ? back : NOOP, then: 'stay' as Decision }] : []),
      ...(done ? [{ label: 'Done', v: done, then: 'done' as Decision }] : []),
    ]
    return <>
      {list.length > 0 && <div className={`choose-choices${list.length === 1 ? ' is-one' : ''}`} role="group" aria-label={`Plan ${title}`}>
        {list.map((c) => <button key={c.label} type="button" className={`deck-btn${c.primary ? '' : ' is-quiet'}`} disabled={pending !== null}
          aria-label={`${c.label}: ${title}`} onClick={() => { void run(key, c.v, c.then) }}>{c.label}</button>)}
      </div>}
      {others.length > 0 && <div className="choose-more" role="group" aria-label={`More for ${title}`}>
        {others.map((v) => v.menu
          ? <button key={v.label} type="button" className="canvas-link" aria-expanded={menuOpen === key} onClick={() => setMenuOpen(menuOpen === key ? null : key)}>{v.label} ▸</button>
          : <button key={v.label} type="button" className="canvas-link" disabled={pending !== null} aria-label={`${v.label}: ${title}`} onClick={() => { void run(key, v) }}>{v.label}</button>)}
      </div>}
      {menuRow(key, title, others)}
    </>
  }

  // ---- A step row: title, where it stands, its own choices (or a small stamp).
  const step = (it: ChooseItemView, depth: number): ReactNode => {
    const d = decided[it.key]
    const doIt = role(it.verbs, 'here'), back = role(it.verbs, 'back'), done = role(it.verbs, 'done'), reopen = role(it.verbs, 'reopen')
    const onHere = it.planned.kind === 'here' || it.planned.kind === 'day'
    const stamp = stampFor(it.key, it.planned, true)
    const others = it.verbs.filter((v) => !v.role || v.role === 'other')
    const undo = d === 'stay' ? NOOP : d === 'done' ? reopen : back
    return <li key={it.key} className={`choose-row${it.planned.kind === 'done' ? ' is-done' : ''}${depth ? ' is-sub' : ''}`}>
      <div className="choose-row-main">
        <span className="choose-row-title">{it.title}</span>
        <span className="choose-row-where">{it.note ?? (it.planned.kind === 'done' ? '' : whereNow(it.planned, d))}</span>
        {stamp}
        <span className="choose-row-acts" role="group" aria-label={`Plan ${it.title}`}>
          {d ? (undo && <button type="button" className="choose-verb is-quiet" disabled={pending !== null} aria-label={`Undo: ${it.title}`} onClick={() => { void run(it.key, undo, null) }}>Undo</button>)
            : it.planned.kind === 'done' ? null
            : onHere ? <>
              {back && <button type="button" className="choose-verb is-quiet" disabled={pending !== null} aria-label={`Not ${inHere}: ${it.title}`} onClick={() => { void run(it.key, back) }}>Not {inHere}</button>}
              {done && <button type="button" className="choose-verb is-quiet" disabled={pending !== null} aria-label={`Done: ${it.title}`} onClick={() => { void run(it.key, done, 'done') }}>Done</button>}
              {others.map((v) => v.menu
                ? <button key={v.label} type="button" className="choose-verb is-quiet" aria-expanded={menuOpen === it.key} aria-label={`${v.label}: ${it.title}`} onClick={() => setMenuOpen(menuOpen === it.key ? null : it.key)}>{v.label} ▸</button>
                : null)}
            </>
            : <>
              {doIt && <button type="button" className="choose-verb" disabled={pending !== null} aria-label={`${cap(inHere)}: ${it.title}`} onClick={() => { void run(it.key, doIt, 'here') }}>{cap(inHere)}</button>}
              {back && (it.planned.kind === 'missed' || it.planned.kind === 'last') && <button type="button" className="choose-verb is-quiet" disabled={pending !== null} aria-label={`Not ${inHere}: ${it.title}`} onClick={() => { void run(it.key, back, 'stay') }}>Not {inHere}</button>}
              {done && <button type="button" className="choose-verb is-quiet" disabled={pending !== null} aria-label={`Done: ${it.title}`} onClick={() => { void run(it.key, done, 'done') }}>Done</button>}
              {others.map((v) => v.menu
                ? <button key={v.label} type="button" className="choose-verb is-quiet" aria-expanded={menuOpen === it.key} aria-label={`${v.label}: ${it.title}`} onClick={() => setMenuOpen(menuOpen === it.key ? null : it.key)}>{v.label} ▸</button>
                : <button key={v.label} type="button" className="choose-verb is-quiet" disabled={pending !== null} aria-label={`${v.label}: ${it.title}`} onClick={() => { void run(it.key, v) }}>{v.label}</button>)}
              {it.onBreakDown && <button type="button" className="canvas-link choose-break" aria-label={`Break it down: ${it.title}`} onClick={() => setAdding(`break:${it.key}`)}>Break down</button>}
            </>}
        </span>
      </div>
      {menuRow(it.key, it.title, others)}
      {status(it.key)}
      {(it.children.length > 0 || adding === `break:${it.key}`) && <ul className="choose-rows is-sub">
        {it.children.map((c) => step(c, depth + 1))}
        {adding === `break:${it.key}` && it.onBreakDown && <li className="choose-row is-sub is-new">
          <InlineComposer key={added} label={`A smaller step under ${it.title}`} saveLabel="Add" onSave={add(`break:${it.key}`, it.onBreakDown)} onCancel={() => setAdding(null)} />
        </li>}
      </ul>}
    </li>
  }

  const goalBody = (line: ChooseLineView) => <>
    <p className="choose-fact">{whereNow(line.planned, decided[line.key])}{line.steps.length ? '' : ' · no steps yet'}</p>
    {choices(line.key, line.title, line.planned, line.verbs)}
    {status(line.key)}
    {(line.steps.length > 0 || line.onAddStep) && <div className="choose-steps-box">
      {line.steps.length > 0 && <h4 className="choose-steps-h">Steps</h4>}
      {line.steps.length > 0 && <ul className="choose-rows" aria-label={`Steps of ${line.title}`}>{line.steps.map((s) => step(s, 0))}</ul>}
      {line.onAddStep && (adding === `step:${line.key}`
        ? <InlineComposer key={added} label={`A step ${inHere} under ${line.title}`} saveLabel="Add" onSave={add(`step:${line.key}`, line.onAddStep)} onCancel={() => setAdding(null)} />
        : <button type="button" className="canvas-link choose-add" aria-label={`Add a step ${inHere} under ${line.title}`} onClick={() => setAdding(`step:${line.key}`)}>+ Add a step</button>)}
    </div>}
  </>

  // Only what needs a choice gets buttons; what already has its place folds
  // to one line ("2 already this week: Reschedule dentist (Thu) · …").
  const settled = p.loose.filter((it) => (it.planned.kind === 'here' || it.planned.kind === 'day') && !decided[it.key])
  const needs = p.loose.filter((it) => !settled.includes(it))
  const dayOf = (it: ChooseItemView) => it.planned.kind === 'day' ? ` (${it.planned.label.replace(/^.*· /, '')})` : ''
  const looseBody = <>
    {looseNote && <p className="choose-fact">{looseNote}</p>}
    {needs.length > 0 && <ul className="choose-rows">{needs.map((it) => step(it, 0))}</ul>}
    {settled.length > 0 && <div className="choose-settled">
      <button type="button" className="choose-settled-line" aria-expanded={showSettled} onClick={() => setShowSettled(!showSettled)}>
        <span><b>{settled.length} already {inHere}:</b> {settled.slice(0, 4).map((it) => `${it.title}${dayOf(it)}`).join(' · ')}{settled.length > 4 ? ' · …' : ''}</span>
        <span className="canvas-link">{showSettled ? 'Hide' : 'Show'}</span>
      </button>
      {showSettled && <ul className="choose-rows">{settled.map((it) => step(it, 0))}</ul>}
    </div>}
    {p.loose.length === 0 && adding !== 'loose' && <p className="choose-empty">Nothing else {inHere} yet.</p>}
    {adding === 'loose'
      ? <InlineComposer key={added} label={`Something ${inHere}`} saveLabel="Add" onSave={add('loose', p.onAddLoose)} onCancel={() => setAdding(null)} />
      : <button type="button" className="canvas-link choose-add" onClick={() => setAdding('loose')}>+ Add</button>}
  </>

  const cards = p.lines.length + 1
  const at = Math.min(index, cards - 1)
  const current = at < p.lines.length ? p.lines[at] : null
  const last = at === cards - 1
  const primaryBtn = <button type="button" className="deck-btn is-primary" disabled={p.primary.busy} onClick={() => { void p.primary.run() }}>{p.primary.busy ? 'Saving…' : p.primary.label}</button>

  return <div className="choose" data-view={p.view}>
    <div className="choose-top">
      <span className="deck-kicker">{p.kicker}</span>
      <span className="choose-top-right">
        <span className="choose-switch" role="radiogroup" aria-label="View">
          {(['one', 'all'] as const).map((v) => <button key={v} type="button" role="radio" aria-checked={p.view === v}
            className={`choose-switch-btn${p.view === v ? ' is-on' : ''}`} onClick={() => p.onViewChange(v)}>{v === 'one' ? 'One at a time' : 'All at once'}</button>)}
        </span>
        <button type="button" className="choose-leave" onClick={p.onLeave}>Leave</button>
      </span>
    </div>
    {p.planned && <p className="choose-was">{p.planned}</p>}

    {p.loading ? <p className="plan-status" role="status">Loading…</p> : p.view === 'one' ? <>
      <p className="choose-count">{current ? `${at + 1} of ${p.lines.length}` : p.lines.length ? `After the ${p.lines.length} ${above} goals` : ''}</p>
      <div className="deck-stack choose-stack" ref={cardRef}>
        <div className="deck-ghost is-far" /><div className="deck-ghost" />
        {current
          ? <article key={current.key} className="deck-card choose-card" aria-label={current.title}>
            <h3 className="choose-card-title">{current.title}</h3>
            {goalBody(current)}
            {stampFor(current.key, current.planned)}
          </article>
          : <article className="deck-card choose-card" aria-label={looseTitle}>
            <h3 className="choose-card-title">{looseTitle}</h3>
            <section aria-label={looseTitle}>{looseBody}</section>
          </article>}
      </div>
      <div className="choose-pager">
        {at > 0 ? <button type="button" className="canvas-link" onClick={() => setIndex(at - 1)}>‹ Previous</button> : <span />}
        {last ? primaryBtn : <button type="button" className="deck-btn is-primary" onClick={() => setIndex(at + 1)}>Next</button>}
      </div>
    </> : <>
      {above && (p.lines.length === 0
        ? <p className="choose-empty">{doneLines.length ? `Every ${above} goal is done.` : `Nothing open on ${above}.`}</p>
        : <ul className="choose-lines" aria-label={`${above} goals`}>
          {p.lines.map((line) => {
            const open = openLine === line.key
            return <li key={line.key} className={`choose-line${open ? ' is-open' : ''}`}>
              <button type="button" className="choose-line-row" aria-expanded={open} onClick={() => setOpenLine(open ? null : line.key)}>
                <span className="choose-line-title">{line.title}</span>
                <span className="choose-counts">{line.counts}</span>
                <span className="choose-chev" aria-hidden="true">{open ? '▾' : '▸'}</span>
              </button>
              {open && <div className="choose-line-body">{goalBody(line)}{stampFor(line.key, line.planned, true)}</div>}
            </li>
          })}
        </ul>)}
      {above && doneLines.length > 0 && <div className="choose-done">
        <button type="button" className="choose-done-fold" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>
          <span>{doneLines.length} done on {above}</span><span className="canvas-link">{showDone ? 'Hide' : 'Show'}</span>
        </button>
        {showDone && <ul className="choose-done-list">{doneLines.map((l) => <li key={l.key}>{l.title}</li>)}</ul>}
      </div>}
      <section className="choose-loose" aria-label={looseTitle}>
        <h3 className="choose-loose-title">{looseTitle}</h3>
        {looseBody}
      </section>
      <div className="choose-foot">{primaryBtn}</div>
    </>}
  </div>
}

function cap(s: string): string { return s ? s[0].toUpperCase() + s.slice(1) : s }
