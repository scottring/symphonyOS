// src/components/plan/v2/PlanLine.tsx
//
// One line on a v2 plan, and the actions it carries. Production's rule for a
// row (RowActionRail, 2026-08-05): the row shows STATE — who, done — and the
// rail on the right holds ACTIONS, fading in on hover. A click on the words
// folds the line open where it is; "All details" is the existing Details pane.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDraggable } from '@dnd-kit/core'
import { Check, CornerDownRight, GripVertical, MoreHorizontal, ArrowRight, Moon, X, PanelRight, Target, Sun, ArrowDownRight, Unlink, Link2 } from 'lucide-react'
import type { Task, TaskContext } from '@/types/task'
import { ContextPicker } from '@/components/triage/ContextPicker'
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
  /** A goal's next actions (goal_task_id), each with where it is. */
  steps?: { id: string; title: string; done: boolean; where: string | null }[]
  /** Drawn beneath its goal on the same list. */
  nested?: boolean
}

export interface LineActions {
  done: (t: Task) => void
  carry: (t: Task) => void
  /** Absent where a period has no Someday (a year goal). */
  someday?: (t: Task) => void
  drop: (t: Task) => void
  assign: (t: Task, ids: string[]) => void
  details: (t: Task) => void
  rename: (t: Task, title: string) => void
  openPartOf: (link: SupportLink) => void
  // Production's other row verbs (PlanRow / RowActionRail), where a page offers them.
  /** "Make it a goal" / "Make it a single action". */
  toggleGoal?: (t: Task) => void
  /** Down a rung: "Into this week" on a month, "Into October" on a season. */
  intoLower?: { label: string; run: (t: Task) => void }
  /** Dated today, chosen for today; the broader commitment stays. */
  today?: (t: Task) => void
  /** Only the link to its goal goes. */
  unlink?: (t: Task) => void
  /** Life area (Work / Family / Personal), through the gated update. */
  setContext?: (t: Task, c: TaskContext | undefined) => void
  /** Tie a line already on the plan to a goal one rung up — "Link to a Fall
   *  goal…" (walkthrough 2026-09-30: October's lines, carried from
   *  September, had no way to say which Fall goal they serve). */
  linkUp?: { rung: string; goals: { id: string; title: string }[]; applies: (t: Task) => boolean; run: (t: Task, goalId: string) => void }
}


/** The ⋯ menu: the verbs a planning row offers, in one place. Rendered in a
 *  portal, pinned to its button: the Year and Season lists are two CSS
 *  columns, and a menu inside them was split across the columns — half under
 *  the row, half floating at the top of the other column (Scott, 2026-09-29:
 *  "the year page is all wonky when I click ⋯"). */
export function LineMenu({ vm, actions, nextLabel }: { vm: LineVM; actions: LineActions; nextLabel: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null)
  useLayoutEffect(() => {
    if (!open) { setPos(null); return }
    const place = () => {
      const r = ref.current?.getBoundingClientRect()
      if (!r) return
      const right = Math.max(8, window.innerWidth - r.right)
      // Open upward when there isn't room below.
      setPos(window.innerHeight - r.bottom < 320 && r.top > 320 ? { bottom: window.innerHeight - r.top + 4, right } : { top: r.bottom + 4, right })
    }
    place()
    const close = () => setOpen(false)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', place, true)
    return () => { window.removeEventListener('resize', close); window.removeEventListener('scroll', place, true) }
  }, [open])
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const n = e.target as Node
      if (!ref.current?.contains(n) && !menuRef.current?.contains(n)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  const t = vm.task
  const pick = (fn: (t: Task) => void) => () => { setOpen(false); fn(t) }
  const [linking, setLinking] = useState(false)
  useEffect(() => { if (!open) setLinking(false) }, [open])
  const linkUp = actions.linkUp && !t.completed && actions.linkUp.applies(t) && actions.linkUp.goals.some((g) => g.id !== t.id) ? actions.linkUp : null
  return (
    <div ref={ref} className="relative">
      <button type="button" className={`pv2-rb ${open ? '' : 'pv2-hov'}`} aria-label={`More for ${t.title}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && pos && createPortal(
        <div ref={menuRef} role="menu" className="pv2-menu is-floating" style={{ top: pos.top, bottom: pos.bottom, right: pos.right }}>
          {linking && linkUp ? <>
            <div className="pv2-mhead">Part of which {linkUp.rung} goal?</div>
            {linkUp.goals.filter((g) => g.id !== t.id).map((g) => (
              <button key={g.id} role="menuitemradio" aria-checked={vm.partOf?.id === g.id} type="button"
                onClick={() => { setOpen(false); linkUp.run(t, g.id) }}>
                <Target className="w-3.5 h-3.5" /><span className="truncate">{g.title}</span>{vm.partOf?.id === g.id && <Check className="w-3.5 h-3.5 ml-auto" />}
              </button>
            ))}
            <div className="pv2-msep" />
            <button role="menuitem" type="button" onClick={() => setLinking(false)}>Back</button>
          </> : <>
          <button role="menuitem" type="button" onClick={pick(actions.done)}><Check className="w-3.5 h-3.5" />{t.completed ? 'Reopen' : 'Done'}</button>
          {!t.completed && vm.fate !== 'carried' && <button role="menuitem" type="button" onClick={pick(actions.carry)}><ArrowRight className="w-3.5 h-3.5" />Carry to {nextLabel}</button>}
          {!t.completed && vm.fate !== 'someday' && actions.someday && <button role="menuitem" type="button" onClick={pick(actions.someday)}><Moon className="w-3.5 h-3.5" />Someday</button>}
          {!t.completed && <button role="menuitem" type="button" onClick={pick(actions.drop)}><X className="w-3.5 h-3.5" />Drop it</button>}
          {(actions.intoLower || actions.today || actions.toggleGoal || (actions.unlink && t.goalTaskId)) && !t.completed && <div className="pv2-msep" />}
          {actions.intoLower && !t.completed && !t.isGoal && <button role="menuitem" type="button" onClick={pick(actions.intoLower.run)}><ArrowDownRight className="w-3.5 h-3.5" />{actions.intoLower.label}</button>}
          {actions.today && !t.completed && !t.isGoal && <button role="menuitem" type="button" onClick={pick(actions.today)}><Sun className="w-3.5 h-3.5" />Do it today</button>}
          {actions.toggleGoal && !t.completed && <button role="menuitem" type="button" onClick={pick(actions.toggleGoal)}><Target className="w-3.5 h-3.5" />{t.isGoal ? 'Make it a single action' : 'Make it a goal'}</button>}
          {actions.unlink && t.goalTaskId && <button role="menuitem" type="button" onClick={pick(actions.unlink)}><Unlink className="w-3.5 h-3.5" />Remove from goal</button>}
          {linkUp && <button role="menuitem" type="button" onClick={() => setLinking(true)}><Link2 className="w-3.5 h-3.5" />{vm.partOf ? `Change ${linkUp.rung} goal…` : `Link to a ${linkUp.rung} goal…`}</button>}
          <div className="pv2-msep" />
          <button role="menuitem" type="button" onClick={pick(actions.details)}><PanelRight className="w-3.5 h-3.5" />All details</button>
          </>}
        </div>,
        document.body,
      )}
    </div>
  )
}

export function PlanLine({ vm, actions, members, nextLabel, open, onToggle, editable, draggable = false, onHoverPartOf, onShowPartOf, hideParent = false }: {
  vm: LineVM
  actions: LineActions
  members: FamilyMember[]
  nextLabel: string
  open: boolean
  onToggle: () => void
  /** In a planning meeting the fold edits the wording. */
  editable: boolean
  /** The month's lines pick up onto its calendar (PlanPageV2's DndContext). */
  draggable?: boolean
  /** Hovering the line lights what it is part of in the reference column;
   *  its "↳ Part of …" shows it there (the week list's rule). */
  onHoverPartOf?: (id: string | null) => void
  onShowPartOf?: (link: SupportLink) => void
  /** The list already draws this line under its goal's heading. */
  hideParent?: boolean
}) {
  const t = vm.task
  const who = assigneesOf(t)
  const muted = vm.fate !== 'open'
  const movable = draggable && vm.fate === 'open' && !t.completed
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `line:${t.id}`, data: { kind: 'line', taskId: t.id }, disabled: !movable })
  return (
    <li ref={setNodeRef} onMouseEnter={vm.partOf && onHoverPartOf ? () => onHoverPartOf(vm.partOf!.id) : undefined}
      onMouseLeave={vm.partOf && onHoverPartOf ? () => onHoverPartOf(null) : undefined} className={`pv2-line${vm.nested ? ' is-nested' : ''}${open ? ' is-open' : ''}${muted ? ' is-muted' : ''}${vm.fate === 'dropped' ? ' is-dropped' : ''}${t.completed ? ' is-done' : ''}${isDragging ? ' is-dragging' : ''}`}>
      <div className="pv2-line-main">
        {movable && <span className="pv2-grip pv2-linegrip pv2-hov" {...listeners} {...attributes} aria-label={`Drag ${t.title} onto a week or a day`} title="Drag onto a week or a day"><GripVertical className="h-3.5 w-3.5" /></span>}
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
          {actions.setContext && (
            <span className="pv2-hov">
              <ContextPicker size="sm" value={t.context ?? null} onChange={(c) => actions.setContext!(t, c)} />
            </span>
          )}
          {members.length > 0 && (
            <span className="pv2-hov">
              <MultiAssigneeDropdown members={members} selectedIds={who} onSelect={(ids) => actions.assign(t, ids)} size="sm" triggerLabel={`Assign people to ${t.title}`} />
            </span>
          )}
          <LineMenu vm={vm} actions={actions} nextLabel={nextLabel} />
        </span>
      </div>
      {vm.partOf && !open && !hideParent && (
        <button type="button" className="pv2-line-parent" onClick={() => (onShowPartOf ?? actions.openPartOf)(vm.partOf!)}
          aria-label={`Part of ${vm.partOf.title} — show it`}>
          <CornerDownRight className="h-3 w-3 shrink-0" aria-hidden="true" /><span className="truncate">Part of “{vm.partOf.title}”</span>
        </button>
      )}
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
          {t.isGoal ? <>
            {/* A goal says what it means and holds its possible work — the Fall
                page Scott liked (prototype, 2026-09-28). Both are the goal's own
                records: its notes and its steps. */}
            <div className="pv2-fact"><span className="pv2-k">Notes</span>
              {t.notes?.trim() ? <span className="pv2-notes">{t.notes.trim()}</span> : <span className="pv2-hint">None yet — add some in its details.</span>}</div>
            <div className="pv2-fact"><span className="pv2-k">Work</span>
              {vm.steps?.length ? <ul className="pv2-steps-list">{vm.steps.map((s) => (
                <li key={s.id}><button type="button" className={`pv2-step${s.done ? ' is-done' : ''}`} onClick={() => actions.details({ ...t, id: s.id })}>{s.title}</button>
                  {s.where && <span className="pv2-hint"> · {s.where}</span>}</li>
              ))}</ul> : <span className="pv2-hint">No possible work written yet.</span>}</div>
          </> : t.notes?.trim() && <div className="pv2-fact"><span className="pv2-k">Notes</span><span className="pv2-notes">{t.notes.trim().split('\n')[0]}</span></div>}
          <div className="pv2-acts">
            <button type="button" className="pv2-qbtn" onClick={() => actions.details(t)}>All details →</button>
            <button type="button" className="pv2-link" onClick={onToggle}>Close</button>
          </div>
        </div>
      )}
    </li>
  )
}


/** A line being named on the list it will join, opened from the level above
 *  ("+ Add" / "+ Step" in the reference column): it says whose part it is.
 *  Enter adds; Escape, or leaving it empty, lets it go. */
export function DraftLine({ parentTitle, isGoal, placeholder, onAdd, onCancel }: {
  parentTitle: string
  isGoal: boolean
  placeholder: string
  onAdd: (title: string) => void
  onCancel: () => void
}) {
  const [v, setV] = useState('')
  return (
    <li className="pv2-line is-draft">
      <form className="pv2-line-main" onSubmit={(e) => { e.preventDefault(); const t = v.trim(); if (t) onAdd(t) }}>
        <span className="pv2-mark" aria-hidden="true">{isGoal ? <span className="pv2-goal" /> : <span className="pv2-dash" />}</span>
        <input autoFocus className="pv2-line-draft" value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder}
          aria-label={`${placeholder} — part of ${parentTitle}`}
          onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }} onBlur={() => { if (!v.trim()) onCancel() }} />
      </form>
      <span className="pv2-line-parent is-shown"><CornerDownRight className="h-3 w-3 shrink-0" aria-hidden="true" /><span className="truncate">Part of “{parentTitle}” · Enter to add</span></span>
    </li>
  )
}
