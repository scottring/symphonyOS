// src/components/voice/PlanSteps.tsx
//
// The screens of a "Build my plan" session: one horizon at a time, every
// goal on the same screen. The question on top is about one goal; the rows
// below show every goal's state at this horizon, what is already on the
// plan, and the line above it — so the broader commitments stay in view.
// Each horizon ends at a checkpoint that shows it whole.

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, CalendarCheck, Check, CornerDownRight, Pencil, X } from 'lucide-react'
import {
  FREE, LEVEL_NAME, SUGGESTED_GOALS, SUGGESTED_TODAY, WEEK_FULL, limitNote, activeGoals, goalColumns, goalTitle, hasNewAt, horizonOf,
  isToday, linesFor, looksExecutable, questionFor, rowKeys, rowState, sourceCandidates, stepsFor, weekEntries,
  type ExistingPlan, type SourceCandidate, type FlowAction, type Horizon, type ListHorizon, type PeriodLabels, type RowState, type VoicePlanDraft,
} from '@/lib/voiceOnboarding/flow'

/** "Fall", "October", "this week" — the period as a sentence says it. */
function periodWord(h: Horizon, labels: PeriodLabels): string {
  return h === 'week' ? 'this week' : h === 'today' ? 'today' : labels[h]
}

interface StepProps {
  draft: VoicePlanDraft
  existing: ExistingPlan
  labels: PeriodLabels
  dispatch: (a: FlowAction) => void
}

/** The answer field: a typed line, kept until submitted. */
function useLine(initial = '') {
  const [text, setText] = useState(initial)
  return { text, setText, take: () => { const t = text.trim(); setText(''); return t } }
}

function StepNav({ draft, dispatch, primary, skip }: { draft: VoicePlanDraft; dispatch: (a: FlowAction) => void; primary: string; skip?: string }) {
  return (
    <div className="vo-steps">
      <button type="button" className="vo-primary" onClick={() => dispatch({ type: 'continue' })}>
        {primary} <ArrowRight size={15} aria-hidden />
      </button>
      <button type="button" className="vo-quiet" onClick={() => dispatch({ type: 'back' })} disabled={draft.trail.length === 0}>
        <ArrowLeft size={14} aria-hidden /> Back
      </button>
      {skip && <button type="button" className="vo-quiet" onClick={() => dispatch({ type: 'skip' })}>{skip}</button>}
    </div>
  )
}

function nextLabel(draft: VoicePlanDraft, h: Horizon, labels: PeriodLabels): string {
  const steps = stepsFor(draft.startAt)
  const n = steps[steps.indexOf(h) + 1]
  return n ? `Continue to ${n === 'week' ? 'the week' : n === 'today' ? 'today' : labels[n]}` : 'Review the plan'
}

function Eyebrow({ h, labels, check }: { h: Horizon; labels: PeriodLabels; check?: boolean }) {
  return <p className="vo-eyebrow">{LEVEL_NAME[h]} · {labels[h]}{check ? ' · checkpoint' : ''}</p>
}

// ── Year: the goals ────────────────────────────────────────────────────────

export function YearStep({ draft, labels, dispatch }: StepProps) {
  const q = questionFor(draft, 'year', labels)
  const line = useLine()
  const goals = draft.goals
  const active = activeGoals(draft).length
  const limit = limitNote(draft, 'goal')
  const full = !!limit
  const submit = (e: FormEvent) => { e.preventDefault(); const t = line.take(); if (t) dispatch({ type: 'addGoal', text: t }) }
  return (
    <div className="vo-ask">
      <Eyebrow h="year" labels={labels} />
      <h2 className="vo-question" id="vo-question">{q.prompt}</h2>
      <p className="vo-hint">{q.hint}</p>
      {goals.length > 0 && (
        <ul className="vo-goal-list" aria-label={`Goals for ${labels.year}`}>
          {goals.map((g) => (
            <GoalItem key={g.id} title={g.title} existing={g.existing} leftOut={!!g.leftOut}
              onLeaveOut={(out) => dispatch({ type: 'leaveOut', id: g.id, out })}
              onRename={(t) => dispatch({ type: 'renameGoal', id: g.id, text: t })}
              onRemove={() => dispatch({ type: 'removeGoal', id: g.id })} />
          ))}
        </ul>
      )}
      <p className="vo-count-line" role="status">
        {active === 0 ? 'No goals yet.' : `${active} ${active === 1 ? 'goal' : 'goals'}${active >= 4 && active <= SUGGESTED_GOALS ? ' — a good number.' : active > SUGGESTED_GOALS ? ' — that’s a lot to carry; you can leave some out of this session.' : '.'}`}
      </p>
      <form className="vo-answer" onSubmit={submit}>
        <input className="vo-input" value={line.text} onChange={(e) => line.setText(e.target.value)} placeholder={q.placeholder}
          aria-label="Add a goal" maxLength={140} disabled={full} />
        <button type="submit" className="vo-secondary" disabled={full || !line.text.trim()}>Add goal</button>
      </form>
      {limit && <p className="vo-limit" role="status">{limit}</p>}
      <StepNav draft={draft} dispatch={dispatch} primary="Look at the whole year" skip={hasNewAt(draft, 'year') ? undefined : 'Nothing new for the year'} />
    </div>
  )
}

function GoalItem({ title, existing, leftOut, onLeaveOut, onRename, onRemove }: {
  title: string; existing: boolean; leftOut: boolean; onLeaveOut: (out: boolean) => void; onRename: (t: string) => void; onRemove: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(title)
  if (editing) {
    return (
      <li className="vo-goal is-editing">
        <form className="vo-inline" onSubmit={(e) => { e.preventDefault(); onRename(text); setEditing(false) }}>
          <input className="vo-input vo-input-sm" value={text} onChange={(e) => setText(e.target.value)} aria-label={`Change “${title}”`} autoFocus maxLength={140} />
          <button type="submit" className="vo-link">Done</button>
        </form>
      </li>
    )
  }
  return (
    <li className={`vo-goal${leftOut ? ' is-out' : ''}`}>
      <span className="vo-goal-title">{title}</span>
      {existing
        ? <>
            <span className="vo-tag">{leftOut ? 'Not in this session' : 'On your plan'}</span>
            <button type="button" className="vo-link" onClick={() => onLeaveOut(!leftOut)}>{leftOut ? 'Bring back' : 'Leave out this time'}</button>
          </>
        : <>
            <span className="vo-tag is-new">New</span>
            <button type="button" className="vo-icon-sm" onClick={() => setEditing(true)} aria-label={`Change “${title}”`}><Pencil size={13} aria-hidden /></button>
            <button type="button" className="vo-icon-sm" onClick={onRemove} aria-label={`Remove “${title}”`}><X size={14} aria-hidden /></button>
          </>}
    </li>
  )
}

// ── Season and month: every goal, one question at a time ───────────────────

const STATE_WORD: Record<RowState, string> = { new: 'Written', existing: 'Already planned', week: 'Straight to this week', deferred: 'Not this time', open: 'Open' }

export function ListStep({ draft, existing, labels, dispatch, h }: StepProps & { h: ListHorizon }) {
  const q = questionFor(draft, h, labels)
  const keys = rowKeys(draft)
  const goals = activeGoals(draft).length
  const settled = activeGoals(draft).filter((g) => rowState(draft, h, g.id, existing) !== 'open').length
  return (
    <div className="vo-ask">
      <Eyebrow h={h} labels={labels} />
      <h2 className="vo-question" id="vo-question">{q.prompt}</h2>
      <p className="vo-hint">{q.hint}</p>
      {goals > 0 && <p className="vo-count-line" role="status">{settled} of {goals} goals have an answer for {labels[h]}. Nothing has to move every {h}.</p>}
      <ol className="vo-rows" aria-label={`${labels[h]}, goal by goal`}>
        {keys.map((key) => (
          <GoalRow key={key} goalKey={key} draft={draft} existing={existing} labels={labels} h={h} dispatch={dispatch} focused={draft.focus === key} />
        ))}
      </ol>
      <StepNav draft={draft} dispatch={dispatch} primary={`Look at ${labels[h]} across your goals`} skip={hasNewAt(draft, h) ? undefined : `Nothing new for ${labels[h]}`} />
    </div>
  )
}

function GoalRow({ goalKey, draft, existing, labels, h, dispatch, focused }: StepProps & { goalKey: string; h: ListHorizon; focused: boolean }) {
  const title = goalTitle(draft, goalKey)
  const state = rowState(draft, h, goalKey, existing)
  const goalId = goalKey === FREE ? null : goalKey
  const already = existing.items.filter((i) => i.horizon === h && (i.goalId ?? null) === goalId)
  const mine = linesFor(draft, h, goalKey)
  const onWeek = draft.week.filter((w) => w.goalId === goalId && w.from)
  // The Fall lines a month line can be for: the actual rows, new or kept.
  const fall = h === 'month' ? sourceCandidates(draft, existing, 'month', goalId) : []
  const line = useLine()
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (focused) inputRef.current?.focus({ preventScroll: true }) }, [focused])
  const submit = (e: FormEvent) => {
    e.preventDefault()
    // Adds a line — another one for this goal, never in place of the last.
    const t = line.take()
    if (t) dispatch({ type: 'answer', text: t, goal: goalKey })
    inputRef.current?.focus()
  }
  return (
    <li className={`vo-row${focused ? ' is-focused' : ''} is-${state}`}>
      <button type="button" className="vo-row-head" onClick={() => dispatch({ type: 'focus', goal: goalKey })} aria-expanded={focused}>
        <span className="vo-row-title">{title}</span>
        <span className={`vo-state is-${state}`}>{goalKey === FREE && state === 'open' ? 'Optional' : STATE_WORD[state]}</span>
      </button>
      {h === 'month' && fall.length > 0 && !focused && <p className="vo-row-above"><CornerDownRight size={13} aria-hidden /> {labels.season}: {fall.map((a) => a.title).join(' · ')}</p>}
      {already.length > 0 && (
        <p className="vo-row-existing"><Check size={13} aria-hidden /> On {labels[h]} already: {already.map((a) => a.title).join(' · ')}</p>
      )}
      {onWeek.length > 0 && <p className="vo-row-existing"><CalendarCheck size={13} aria-hidden /> On this week: {onWeek.map((w) => w.text).join(' · ')}</p>}
      {mine.length > 0 && (
        <ul className="vo-lines" aria-label={`${labels[h]} for “${title}”`}>
          {mine.map((l) => (
            <LineItem key={l.id} text={l.text} saved={draft.saved.includes(l.id)} canEdit={focused}
              onEdit={(t) => dispatch({ type: 'editLine', level: h, id: l.id, text: t })}
              onRemove={() => dispatch({ type: 'removeLine', level: h, id: l.id })}
              source={h === 'month' && fall.length > 0 ? (
                <SourcePick label={`Which ${labels.season} line is “${l.text}” for?`} lead={`for ${labels.season}:`} value={l.sourceId ?? null}
                  options={fall} disabled={draft.saved.includes(l.id)} onChange={(id) => dispatch({ type: 'setLineSource', id: l.id, sourceId: id })} />
              ) : undefined}
              toWeek={focused && !draft.saved.includes(l.id) && looksExecutable(l.text) ? () => dispatch({ type: 'toWeek', id: l.id }) : undefined} />
          ))}
        </ul>
      )}
      {focused && (
        <div className="vo-row-body">
          <form className="vo-answer" onSubmit={submit}>
            <input ref={inputRef} className="vo-input" value={line.text} onChange={(e) => line.setText(e.target.value)}
              placeholder={mine.length || already.length ? `Add another for ${labels[h]} (optional)` : questionFor(draft, h, labels).placeholder}
              aria-label={`${mine.length ? 'Add another' : 'Add'} — ${labels[h]} for “${title}”`} maxLength={140} />
            <button type="submit" className="vo-secondary" disabled={!line.text.trim()}>{mine.length ? 'Add another' : 'Add'}</button>
          </form>
          <div className="vo-row-acts">
            {state !== 'deferred'
              ? <button type="button" className="vo-link" onClick={() => dispatch({ type: 'defer', goal: goalKey })}>Not this {h === 'season' ? 'season' : 'month'}</button>
              : <button type="button" className="vo-link" onClick={() => dispatch({ type: 'undefer', goal: goalKey })}>Add something after all</button>}
            {goalKey !== FREE && <button type="button" className="vo-link" onClick={() => dispatch({ type: 'nextGoal' })}>Next goal →</button>}
          </div>
        </div>
      )}
    </li>
  )
}

/** One written line: its words, changed only on purpose (pencil), removable;
 *  a saved line is locked — it is in Symphony already. */
function LineItem({ text, saved, canEdit, onEdit, onRemove, source, toWeek }: {
  text: string; saved: boolean; canEdit: boolean; onEdit: (t: string) => void; onRemove: () => void; source?: ReactNode; toWeek?: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(text)
  if (editing && !saved) {
    return (
      <li className="vo-line is-editing">
        <form className="vo-inline" onSubmit={(e) => { e.preventDefault(); onEdit(draft); setEditing(false) }}>
          <input className="vo-input vo-input-sm" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={`Change “${text}”`} autoFocus maxLength={140} />
          <button type="submit" className="vo-link">Done</button>
          <button type="button" className="vo-link" onClick={() => { setDraft(text); setEditing(false) }}>Cancel</button>
        </form>
      </li>
    )
  }
  return (
    <li className={`vo-line${saved ? ' is-saved' : ''}`}>
      <span className="vo-line-text">{text}</span>
      {saved ? <span className="vo-tag">Saved</span> : canEdit && <>
        <button type="button" className="vo-icon-sm" onClick={() => { setDraft(text); setEditing(true) }} aria-label={`Change “${text}”`}><Pencil size={13} aria-hidden /></button>
        <button type="button" className="vo-icon-sm" onClick={onRemove} aria-label={`Remove “${text}”`}><X size={14} aria-hidden /></button>
      </>}
      {source && <span className="vo-line-source">{source}</span>}
      {toWeek && <span className="vo-shortcut">Already something to do. <button type="button" className="vo-link" onClick={toWeek}>Put it on this week instead</button></span>}
    </li>
  )
}

/** Which line one level up something is for — the actual rows, or none. */
function SourcePick({ label, lead, value, options, disabled, onChange }: {
  label: string; lead: string; value: string | null; options: SourceCandidate[]; disabled?: boolean; onChange: (id: string | null) => void
}) {
  return (
    <label className="vo-source-pick">
      <span>{lead}</span>
      <select aria-label={label} value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">{options.length > 1 ? 'Choose…' : 'None'}</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.title}{o.existing ? '' : ' (new)'}</option>)}
      </select>
    </label>
  )
}

// ── The week: one list for every goal ──────────────────────────────────────

export function WeekStep({ draft, existing, labels, dispatch }: StepProps) {
  const q = questionFor(draft, 'week', labels)
  const line = useLine()
  const entries = weekEntries(draft, existing)
  const kept = entries.filter((e) => e.existing).length
  const keys = rowKeys(draft)
  const cols = goalColumns(draft, existing)
  const goalOf = (key: string) => (key === FREE ? null : key)
  // The month line a new task is for: the person's pick among the goal's
  // actual month lines; with only one, that one; never "the first".
  const options = sourceCandidates(draft, existing, 'week', goalOf(draft.focus))
  const [pick, setPick] = useState<{ goal: string; id: string | null }>({ goal: draft.focus, id: null })
  const chosen = pick.goal === draft.focus && options.some((o) => o.id === pick.id) ? pick.id : options.length === 1 ? options[0].id : null
  const weekLimit = limitNote(draft, 'week')
  const submit = (e: FormEvent) => { e.preventDefault(); if (weekLimit) return; const t = line.take(); if (t) dispatch({ type: 'addWeek', text: t, goal: draft.focus, sourceId: chosen }) }
  return (
    <div className="vo-ask">
      <Eyebrow h="week" labels={labels} />
      <h2 className="vo-question" id="vo-question">{q.prompt}</h2>
      <p className="vo-hint">{q.hint}</p>

      <section className="vo-sources" aria-label="What this week can serve">
        <p className="vo-mini-head">From {labels.month}</p>
        <ul>
          {cols.filter((c) => c.key !== FREE).map((c) => (
            <li key={c.key}>
              <span className="vo-source-goal">{c.title}</span>
              <span className="vo-source-line">{c.month.length ? c.month.map((m) => m.text).join(' · ') : c.week.length ? 'On the week already' : 'Nothing this month'}</span>
            </li>
          ))}
        </ul>
      </section>

      <form className="vo-answer vo-answer-week" onSubmit={submit}>
        <input className="vo-input" value={line.text} onChange={(e) => line.setText(e.target.value)} placeholder={q.placeholder} aria-label="Add a task for this week" maxLength={140} />
        <label className="vo-select">
          <span className="sr-only">Serves</span>
          <select value={draft.focus} onChange={(e) => { dispatch({ type: 'focus', goal: e.target.value }); setPick({ goal: e.target.value, id: null }) }} aria-label="Which goal it serves">
            {keys.map((k) => <option key={k} value={k}>{k === FREE ? 'No goal' : goalTitle(draft, k)}</option>)}
          </select>
        </label>
        {options.length > 0 && (
          <SourcePick label={`Which ${labels.month} line it is for`} lead={`for ${labels.month}:`} value={chosen} options={options}
            onChange={(id) => setPick({ goal: draft.focus, id })} />
        )}
        <button type="submit" className="vo-secondary" disabled={!line.text.trim() || !!weekLimit}>Add</button>
      </form>

      <p className={`vo-capacity${entries.length > WEEK_FULL ? ' is-full' : ''}`} role="status">
        {entries.length} {entries.length === 1 ? 'thing' : 'things'} this week{kept ? `, ${kept} already on it` : ''}.
        {entries.length > WEEK_FULL ? ' That’s a full week — is there anything that can wait?' : ''}
      </p>
      {weekLimit && <p className="vo-limit" role="status">{weekLimit}</p>}
      <ul className="vo-week" aria-label="This week">
        {entries.map((w) => {
          const task = draft.week.find((x) => x.id === w.id)
          const saved = draft.saved.includes(w.id)
          const rowOptions = task ? sourceCandidates(draft, existing, 'week', task.goalId) : []
          return (
            <li key={w.id} className={w.existing ? 'is-existing' : ''}>
              <span className="vo-week-text">{w.text}</span>
              {w.existing || saved || !task
                ? <span className="vo-week-goal">{goalTitle(draft, w.goalId)}</span>
                : <select className="vo-week-goalpick" aria-label={`Which goal “${w.text}” serves`} value={task.goalId ?? FREE} onChange={(e) => dispatch({ type: 'setWeekGoal', id: w.id, goal: e.target.value })}>
                    {keys.map((k) => <option key={k} value={k}>{k === FREE ? 'No goal' : goalTitle(draft, k)}</option>)}
                  </select>}
              {task && rowOptions.length > 0 && (
                <SourcePick label={`Which ${labels.month} line “${w.text}” is for`} lead={`for ${labels.month}:`} value={task.sourceId ?? null}
                  options={rowOptions} disabled={saved} onChange={(id) => dispatch({ type: 'setWeekSource', id: w.id, sourceId: id })} />
              )}
              {w.existing ? <span className="vo-tag">On your week</span>
                : saved ? <span className="vo-tag">Saved</span>
                : <button type="button" className="vo-icon-sm" onClick={() => dispatch({ type: 'removeWeek', id: w.id })} aria-label={`Remove “${w.text}”`}><X size={14} aria-hidden /></button>}
            </li>
          )
        })}
      </ul>
      <StepNav draft={draft} dispatch={dispatch} primary="Look at the whole week" skip={hasNewAt(draft, 'week') ? undefined : 'Nothing new this week'} />
    </div>
  )
}

// ── Today: chosen from the week ────────────────────────────────────────────

export function TodayStep({ draft, existing, labels, dispatch }: StepProps) {
  const q = questionFor(draft, 'today', labels)
  const line = useLine()
  const entries = weekEntries(draft, existing)
  const chosen = entries.filter((w) => isToday(draft, existing, w.id)).length
  const limit = limitNote(draft, 'today')
  const submit = (e: FormEvent) => { e.preventDefault(); if (limit) return; const t = line.take(); if (t) dispatch({ type: 'answer', text: t }) }
  return (
    <div className="vo-ask">
      <Eyebrow h="today" labels={labels} />
      <h2 className="vo-question" id="vo-question">{q.prompt}</h2>
      <p className="vo-hint">{q.hint}</p>
      <ul className="vo-picks" aria-label="This week — choose for today">
        {entries.map((w) => {
          const already = existing.items.some((i) => i.id === w.id && i.today)
          const on = isToday(draft, existing, w.id)
          return (
            <li key={w.id}>
              <button type="button" className={`vo-pick${on ? ' is-picked' : ''}`} aria-pressed={on} disabled={already || (!on && !!limit)}
                onClick={() => dispatch({ type: 'toggleToday', id: w.id })}>
                <span className="vo-pick-box" aria-hidden>{on && <Check size={14} />}</span>
                <span className="vo-pick-text">{w.text}</span>
                <span className="vo-pick-goal">{already ? 'Already chosen' : goalTitle(draft, w.goalId)}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <form className="vo-answer" onSubmit={submit}>
        <input className="vo-input" value={line.text} onChange={(e) => line.setText(e.target.value)} placeholder={q.placeholder} aria-label="Add something small for today" maxLength={140} disabled={!!limit} />
        <button type="submit" className="vo-secondary" disabled={!line.text.trim() || !!limit}>Add for today</button>
      </form>
      <p className={`vo-capacity${chosen > SUGGESTED_TODAY ? ' is-full' : ''}`} role="status">
        {chosen === 0 ? 'Nothing chosen for today yet.' : `${chosen} chosen for today.`}
        {chosen > SUGGESTED_TODAY ? ' That’s more than most days hold — fine if they’re small.' : ''}
      </p>
      {limit && <p className="vo-limit" role="status">{limit}</p>}
      <StepNav draft={draft} dispatch={dispatch} primary="Review the plan" skip={hasNewAt(draft, 'today') ? undefined : 'Nothing for today'} />
    </div>
  )
}

// ── Checkpoints: the horizon, whole ────────────────────────────────────────

export function Checkpoint({ draft, existing, labels, dispatch }: StepProps) {
  const h = horizonOf(draft.step) as Horizon
  // The year is goals only: "Something else" is not a goal, so it is not listed here.
  const cols = goalColumns(draft, existing).filter((c) => h !== 'year' || c.key !== FREE)
  const edit = (key?: string) => dispatch({ type: 'edit', level: h, goal: key })
  const title = h === 'year' ? `Your ${labels.year}, as a whole`
    : h === 'week' ? `This week, across your goals`
    : `${labels[h]}, across your goals`
  const note = h === 'year'
    ? 'Each of these gets a turn at every horizon below. Nothing is saved yet.'
    : h === 'week'
      ? 'One list for everything. A goal with nothing this week is fine.'
      : `A goal with nothing for ${labels[h]} is fine — it’s still on your year.`
  const entries = weekEntries(draft, existing)
  return (
    <div className="vo-ask">
      <Eyebrow h={h} labels={labels} check />
      <h2 className="vo-question">{title}</h2>
      <p className="vo-hint">{note}</p>
      <ul className="vo-check" aria-label={title}>
        {cols.map((c) => {
          const items = h === 'year' ? [] : h === 'week' ? c.week : c[h as ListHorizon]
          const deferred = h !== 'year' && h !== 'week' && c.deferred.includes(h as ListHorizon)
          const moved = (h === 'season' || h === 'month') && draft.week.some((w) => w.goalId === (c.key === FREE ? null : c.key) && (w.from === h || (h === 'month' && w.from === 'season')))
          return (
            <li key={c.key}>
              <div className="vo-check-goal">
                <span>{c.title}</span>
                {h === 'year' && <span className={`vo-tag${c.existing ? '' : ' is-new'}`}>{c.existing ? 'On your plan' : 'New'}</span>}
              </div>
              {h !== 'year' && (
                <div className="vo-check-items">
                  {items.length > 0
                    ? items.map((it, i) => <span key={i} className={`vo-check-item${it.existing ? ' is-existing' : ''}`}>{it.text}{it.existing ? <em> · kept</em> : null}</span>)
                    : <span className="vo-check-none">{deferred ? `Not this ${h === 'season' ? 'season' : 'month'}` : moved ? 'Gone straight to this week' : 'Nothing'}</span>}
                </div>
              )}
              <button type="button" className="vo-link vo-check-edit" onClick={() => edit(c.key)} aria-label={`Change ${c.title} for ${periodWord(h, labels)}`}>Change</button>
            </li>
          )
        })}
      </ul>
      {h === 'week' && <p className={`vo-capacity${entries.length > WEEK_FULL ? ' is-full' : ''}`}>{entries.length} {entries.length === 1 ? 'thing' : 'things'} this week.{entries.length > WEEK_FULL ? ' That’s a full week.' : ''}</p>}
      <StepNav draft={draft} dispatch={dispatch} primary={nextLabel(draft, h, labels)} />
    </div>
  )
}
