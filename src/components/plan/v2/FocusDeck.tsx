// src/components/plan/v2/FocusDeck.tsx
//
// "One at a time": a card per line, for focused work — and the close-out that
// opens the next period's meeting, which is the same card with the decision
// buttons in front. A decided card wears its stamp.

import { useEffect, useState } from 'react'
import type { FamilyMember } from '@/types/family'
import { MultiAssigneeDropdown } from '@/components/family'
import { Stamp, type StampKind } from './Stamp'
import type { LineActions, LineVM } from './PlanLine'
import { assigneesOf } from '@/lib/planning/v2/planV2'

function stampFor(vm: LineVM): StampKind | null {
  if (vm.task.completed) return 'done'
  if (vm.fate === 'carried' || vm.fate === 'someday' || vm.fate === 'dropped') return vm.fate
  return null
}

function useArrowKeys(onPrev: () => void, onNext: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (/INPUT|TEXTAREA|SELECT/.test(el.tagName) || el.isContentEditable) return
      if (e.key === 'ArrowRight') onNext()
      else if (e.key === 'ArrowLeft') onPrev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onPrev, onNext])
}

function Card({ vm, context, carryTo, children, fresh }: { vm: LineVM; context: string; carryTo: string; children: React.ReactNode; fresh?: boolean }) {
  const kind = stampFor(vm)
  return (
    <article className={`pv2-card${kind ? ' is-stamped' : ''}`}>
      {kind && <Stamp kind={kind} context={kind === 'carried' ? `to ${carryTo}` : context} on={kind === 'done' ? vm.task.completedAt ?? null : null} fresh={fresh} />}
      <h2 className="pv2-card-title">
        {vm.task.isGoal ? <span className="pv2-goal" aria-hidden="true" /> : <span className="pv2-dash" aria-hidden="true" />}
        <span>{vm.task.title}</span>
      </h2>
      {children}
    </article>
  )
}

function Facts({ vm, actions, members }: { vm: LineVM; actions: LineActions; members: FamilyMember[] }) {
  return (
    <>
      <div className="pv2-fact"><span className="pv2-k">Part of</span>
        {vm.partOf
          ? <span><button type="button" className="pv2-link" onClick={() => actions.openPartOf(vm.partOf!)}>{vm.partOf.title}</button>{vm.partOf.period && <span className="pv2-hint"> · {vm.partOf.period}</span>}</span>
          : <span className="pv2-hint">Not tied to a goal</span>}
      </div>
      {members.length > 0 && (
        <div className="pv2-fact"><span className="pv2-k">Who</span>
          {assigneesOf(vm.task).length === 0 && <span className="pv2-hint">No one yet ·</span>}
          <MultiAssigneeDropdown members={members} selectedIds={assigneesOf(vm.task)} onSelect={(ids) => actions.assign(vm.task, ids)} size="sm" triggerLabel={`Assign people to ${vm.task.title}`} />
        </div>
      )}
      {vm.origin
        ? <div className="pv2-fact"><span className="pv2-k">Earlier</span><span>{vm.origin}</span></div>
        : !vm.task.isGoal && <div className="pv2-fact"><span className="pv2-k">Now</span><span>{vm.where ?? <span className="pv2-hint">Not in a week yet</span>}</span></div>}
      {vm.task.isGoal ? <>
        <div className="pv2-fact"><span className="pv2-k">Notes</span>{vm.task.notes?.trim() ? <span className="pv2-notes">{vm.task.notes.trim()}</span> : <span className="pv2-hint">None yet — add some in its details.</span>}</div>
        <div className="pv2-fact"><span className="pv2-k">Work</span>{vm.steps?.length ? <ul className="pv2-steps-list">{vm.steps.map((st) => (
          <li key={st.id}><span className={`pv2-step${st.done ? ' is-done' : ''}`}>{st.title}</span>{st.where && <span className="pv2-hint"> · {st.where}</span>}</li>
        ))}</ul> : <span className="pv2-hint">No possible work written yet.</span>}</div>
      </> : vm.task.notes?.trim() && <div className="pv2-fact"><span className="pv2-k">Notes</span><span className="pv2-notes">{vm.task.notes.trim()}</span></div>}
    </>
  )
}

export function FocusDeck({ lines, actions, members, nextLabel, context, label, empty }: {
  lines: LineVM[]
  actions: LineActions
  members: FamilyMember[]
  nextLabel: string
  /** The rim text: "September plan". */
  context: string
  label: string
  /** What an empty deck says — where its lines come from. */
  empty?: string
}) {
  const [k, setK] = useState(0)
  const [fresh, setFresh] = useState<string | null>(null)
  const n = lines.length
  const i = Math.min(k, Math.max(0, n - 1))
  const prev = () => setK((x) => Math.max(0, x - 1))
  const next = () => setK((x) => Math.min(n - 1, x + 1))
  useArrowKeys(prev, next)
  if (!n) return <div className="pv2-focus"><div className="pv2-card"><p className="pv2-hint">{empty ?? 'Nothing on this plan yet.'}</p></div></div>
  const vm = lines[i]
  const t = vm.task
  const stamped = (fn: (t: typeof vm.task) => void) => () => { setFresh(t.id); fn(t); window.setTimeout(() => setFresh(null), 700) }
  return (
    <div className="pv2-focus">
      <div className="pv2-fnav"><span className="pv2-pos">{label} · {i + 1} of {n}</span><span className="pv2-hint">← → to move</span></div>
      <div className="pv2-bar"><i style={{ width: `${((i + 1) / n) * 100}%` }} /></div>
      <Card vm={vm} context={context} carryTo={nextLabel} fresh={fresh === t.id}>
        <Facts vm={vm} actions={actions} members={members} />
        <div className="pv2-fates">
          <button type="button" className={`pv2-qbtn${t.completed ? ' is-on' : ''}`} onClick={stamped(actions.done)}>{t.completed ? 'Reopen' : 'Done'}</button>
          {!t.completed && <>
            <button type="button" className={`pv2-qbtn${vm.fate === 'carried' ? ' is-on' : ''}`} disabled={vm.fate === 'carried'} onClick={stamped(actions.carry)}>Carry to {nextLabel}</button>
            {actions.someday && <button type="button" className={`pv2-qbtn${vm.fate === 'someday' ? ' is-on' : ''}`} disabled={vm.fate === 'someday'} onClick={stamped(actions.someday)}>Someday</button>}
            <button type="button" className="pv2-qbtn" onClick={() => actions.drop(t)}>Drop it</button>
          </>}
          <span className="flex-1" />
          <button type="button" className="pv2-link" onClick={() => actions.details(t)}>All details →</button>
        </div>
      </Card>
      <div className="pv2-fnav2">
        <button type="button" className="pv2-qbtn" disabled={i === 0} onClick={prev}>← Previous</button>
        <button type="button" className="pv2-qbtn" disabled={i === n - 1} onClick={next}>Next →</button>
      </div>
    </div>
  )
}

export type CloseDecision = 'carried' | 'done' | 'someday' | 'dropped' | 'left'

/**
 * Close out the last period: every unfinished line, one card at a time. The
 * candidate list is fixed when the close-out opens, so a decided card does not
 * slide out from under the reader — it wears its stamp, then the next arrives.
 */
export function CloseOut({ lines, candidateIds, members, actions, prevName, nextName, onDecide, onFinish, finishLabel }: {
  /** Every line on the last period, so a decided card can still be shown. */
  lines: LineVM[]
  /** The unfinished lines, fixed by the caller when the close-out opened. */
  candidateIds: string[]
  members: FamilyMember[]
  actions: LineActions
  prevName: string
  nextName: string
  onDecide: (vm: LineVM, d: CloseDecision) => Promise<void> | void
  onFinish: () => void
  /** The last card's button, when it leads somewhere other than writing the next period. */
  finishLabel?: string
}) {
  const [ids] = useState(() => candidateIds)
  const [k, setK] = useState(0)
  const [log, setLog] = useState<Record<string, CloseDecision>>({})
  const [flash, setFlash] = useState<StampKind | null>(null)
  const byId = new Map(lines.map((l) => [l.task.id, l]))
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

  if (k >= ids.length) {
    // What was decided, in words — not "1 carried to November" (#30).
    const decided = new Set(Object.values(log))
    const parts = ([['carried', `Carried to ${nextName}`], ['done', 'Marked done'], ['someday', 'Kept for someday'], ['dropped', 'Let go'], ['left', `Left in ${prevName}`]] as const)
      .filter(([d]) => decided.has(d)).map(([, l]) => l)
    return (
      <div className="pv2-focus"><div className="pv2-card">
        <div className="pv2-eyebrow">{prevName} is closed</div>
        <div className="pv2-summary">{parts.join(' · ') || 'Nothing was left to decide'}</div>
        <p className="pv2-hint">Nothing is deleted. {prevName}’s plan keeps its history.</p>
        <div className="pv2-acts"><button type="button" className="pv2-btn" onClick={onFinish}>{finishLabel ?? `Write ${nextName} →`}</button></div>
      </div></div>
    )
  }
  const vm = byId.get(ids[k])
  if (!vm) {
    return <div className="pv2-focus"><div className="pv2-card"><p className="pv2-hint">This line is no longer on {prevName}’s plan.</p>
      <div className="pv2-acts"><button type="button" className="pv2-qbtn" onClick={() => setK(k + 1)}>Next →</button></div></div></div>
  }
  const decide = async (d: CloseDecision) => {
    setLog((x) => ({ ...x, [vm.task.id]: d }))
    await onDecide(vm, d)
    if (d === 'left') { setK(k + 1); return }
    setFlash(d)
    window.setTimeout(() => { setFlash(null); setK((x) => x + 1) }, reduced ? 250 : 750)
  }
  const shown: LineVM = flash ? { ...vm, fate: flash === 'done' ? vm.fate : flash, task: flash === 'done' ? { ...vm.task, completed: true } : vm.task } : vm
  return (
    <div className="pv2-focus">
      <div className="pv2-fnav"><span className="pv2-pos">Close out {prevName} · {k + 1} of {ids.length}</span><span className="pv2-hint">Decide each one, or leave it open</span></div>
      <div className="pv2-bar"><i style={{ width: `${(k / ids.length) * 100}%` }} /></div>
      <Card vm={shown} context={vm.origin ? 'earlier' : `${prevName} plan`} carryTo={nextName} fresh={!!flash}>
        <Facts vm={vm} actions={actions} members={members} />
        <div className="pv2-fates">
          <button type="button" className="pv2-btn" disabled={!!flash} onClick={() => void decide('carried')}>Carry to {nextName}</button>
          <button type="button" className="pv2-qbtn" disabled={!!flash} onClick={() => void decide('done')}>It’s done</button>
          {actions.someday && <button type="button" className="pv2-qbtn" disabled={!!flash} onClick={() => void decide('someday')}>Someday</button>}
          <button type="button" className="pv2-qbtn" disabled={!!flash} onClick={() => void decide('dropped')}>Drop it</button>
          <button type="button" className="pv2-link pv2-quiet" disabled={!!flash} onClick={() => void decide('left')}>{vm.origin ? 'Leave it for now' : `Leave it in ${prevName}`}</button>
        </div>
      </Card>
      <div className="pv2-fnav2"><button type="button" className="pv2-qbtn" disabled={k === 0 || !!flash} onClick={() => setK(k - 1)}>← Previous</button><span /></div>
    </div>
  )
}
