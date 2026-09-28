// src/components/plan/v2/PlanLine.tsx
//
// One line on a v2 plan, and the actions it carries. Production's rule for a
// row (RowActionRail, 2026-08-05): the row shows STATE — who, done — and the
// rail on the right holds ACTIONS, fading in on hover. A click on the words
// folds the line open where it is; "All details" is the existing Details pane.

import { useEffect, useRef, useState } from 'react'
import { Check, MoreHorizontal, ArrowRight, Moon, X, PanelRight } from 'lucide-react'
import type { Task } from '@/types/task'
import type { FamilyMember } from '@/types/family'
import type { SupportLink } from '@/lib/planning/goalSupport'
import type { LineFate } from '@/lib/planning/v2/planV2'
import { MultiAssigneeDropdown } from '@/components/family'
import { assigneesOf } from '@/lib/planning/v2/planV2'

export interface LineVM {
  task: Task
  fate: LineFate
  /** The goal one rung up this line is part of, when it has one. */
  partOf: SupportLink | null
  /** Where its work is now — "Week of Sep 14", "Thursday, September 17". */
  where: string | null
}

export interface LineActions {
  done: (t: Task) => void
  carry: (t: Task) => void
  someday: (t: Task) => void
  drop: (t: Task) => void
  assign: (t: Task, ids: string[]) => void
  details: (t: Task) => void
  rename: (t: Task, title: string) => void
  openPartOf: (link: SupportLink) => void
}


/** The ⋯ menu: the verbs a planning row offers, in one place. */
export function LineMenu({ vm, actions, nextLabel }: { vm: LineVM; actions: LineActions; nextLabel: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  const t = vm.task
  const pick = (fn: (t: Task) => void) => () => { setOpen(false); fn(t) }
  return (
    <div ref={ref} className="relative">
      <button type="button" className={`pv2-rb ${open ? '' : 'pv2-hov'}`} aria-label={`More for ${t.title}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <div role="menu" className="pv2-menu">
          <button role="menuitem" type="button" onClick={pick(actions.done)}><Check className="w-3.5 h-3.5" />{t.completed ? 'Reopen' : 'Done'}</button>
          {!t.completed && vm.fate !== 'carried' && <button role="menuitem" type="button" onClick={pick(actions.carry)}><ArrowRight className="w-3.5 h-3.5" />Carry to {nextLabel}</button>}
          {!t.completed && vm.fate !== 'someday' && <button role="menuitem" type="button" onClick={pick(actions.someday)}><Moon className="w-3.5 h-3.5" />Someday</button>}
          {!t.completed && <button role="menuitem" type="button" onClick={pick(actions.drop)}><X className="w-3.5 h-3.5" />Drop it</button>}
          <div className="pv2-msep" />
          <button role="menuitem" type="button" onClick={pick(actions.details)}><PanelRight className="w-3.5 h-3.5" />All details</button>
        </div>
      )}
    </div>
  )
}

export function PlanLine({ vm, actions, members, nextLabel, open, onToggle, editable }: {
  vm: LineVM
  actions: LineActions
  members: FamilyMember[]
  nextLabel: string
  open: boolean
  onToggle: () => void
  /** In a planning meeting the fold edits the wording. */
  editable: boolean
}) {
  const t = vm.task
  const who = assigneesOf(t)
  const muted = vm.fate !== 'open'
  return (
    <li className={`pv2-line${open ? ' is-open' : ''}${muted ? ' is-muted' : ''}${vm.fate === 'dropped' ? ' is-dropped' : ''}`}>
      <div className="pv2-line-main">
        <span className="pv2-mark" aria-hidden="true">
          {t.isGoal ? <span className="pv2-goal" /> : <span className="pv2-dash" />}
        </span>
        <button type="button" className={`pv2-line-text${t.isGoal ? ' is-goal' : ''}`} aria-expanded={open} onClick={onToggle}>
          {t.title}
          {t.completed && <Check className="pv2-tick" aria-label="done" />}
        </button>
        <span className="pv2-rail">
          <button type="button" className="pv2-rb pv2-hov" aria-label={t.completed ? `Reopen ${t.title}` : `Mark ${t.title} done`} title={t.completed ? 'Reopen' : 'Done'} onClick={() => actions.done(t)}>
            <Check className="w-4 h-4" />
          </button>
          {members.length > 0 && (
            <span className={who.length ? '' : 'pv2-hov'}>
              <MultiAssigneeDropdown members={members} selectedIds={who} onSelect={(ids) => actions.assign(t, ids)} size="sm" triggerLabel={`Assign people to ${t.title}`} />
            </span>
          )}
          <LineMenu vm={vm} actions={actions} nextLabel={nextLabel} />
        </span>
      </div>
      {open && (
        <div className="pv2-fold">
          {editable && (
            <input
              key={t.title} className="pv2-input" defaultValue={t.title} aria-label="Wording"
              onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== t.title) actions.rename(t, v) }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            />
          )}
          {vm.partOf && (
            <div className="pv2-fact"><span className="pv2-k">Part of</span>
              <button type="button" className="pv2-link" onClick={() => actions.openPartOf(vm.partOf!)}>{vm.partOf.title}</button>
              {vm.partOf.period && <span className="pv2-hint"> · {vm.partOf.period}</span>}
            </div>
          )}
          {vm.where && <div className="pv2-fact"><span className="pv2-k">Now</span><span>{vm.where}</span></div>}
          {t.notes?.trim() && <div className="pv2-fact"><span className="pv2-k">Notes</span><span className="pv2-notes">{t.notes.trim().split('\n')[0]}</span></div>}
          <div className="pv2-acts">
            <button type="button" className="pv2-qbtn" onClick={() => actions.details(t)}>All details →</button>
            <button type="button" className="pv2-link" onClick={onToggle}>Close</button>
          </div>
        </div>
      )}
    </li>
  )
}

