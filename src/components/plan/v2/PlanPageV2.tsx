// src/components/plan/v2/PlanPageV2.tsx
//
// The v2 month and season pages (docs/planning/2026-09-28-planning-v2.md).
//
// Each horizon has its OWN planning meeting and its own plan (Scott and Iris,
// 2026-09-28). So the page opens on "our plan" — calm, read-only, one toolbar —
// and the meeting is an explicit mode with its own stopping point. The next
// period's meeting opens by closing out the last one, a card at a time.
//
// Nothing new is stored. Lines, fates, people, the plan's "agreed" date and the
// Details pane are the records and writers v1 uses.

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { GoalsProvider, useGoalsContext } from '@/contexts/GoalsContext'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useGatedTaskActions } from '@/hooks/useGatedTaskActions'
import { useDomain } from '@/hooks/useDomain'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { useHouseholdSeasons } from '@/hooks/useHouseholdSeasons'
import { useDayLoadEvents } from '@/hooks/useDayLoadEvents'
import { usePlanningSession, monthToken } from '@/hooks/usePlanningSession'
import { useSelectionOptional } from '@/shell/providers/SelectionProvider'
import { useAuth } from '@/hooks/useAuth'
import { useAppShellChromeOptional } from '@/contexts/AppShellChromeContext'
import { HomeChromeControls } from '@/components/home/HomeChromeControls'
import { DomainSwitcher } from '@/components/domain/DomainSwitcher'
import { showToast } from '@/hooks/useToast'
import { filterTasksForLayers, matchesLayers } from '@/lib/today/domainFilter'
import { seasonToken } from '@/lib/cadence/seasons'
import { parseLocalYmd, localYmd } from '@/lib/cadence/config'
import { lowerPlacement } from '@/lib/placement/model'
import { supportedGoal, goalOfTask, type SupportLink } from '@/lib/planning/goalSupport'
import { periodBounds, isCurrentPeriod, planningPeriod, selectPeriodTasks } from '@/lib/planning/periodPage'
import {
  lineFate, endedIn, closeOutCandidates, landmarksIn, leavePlanV2, readPlanView, writePlanView,
  type PlanView, type Landmark,
} from '@/lib/planning/v2/planV2'
import type { Task } from '@/types/task'
import { PlanLine, type LineActions, type LineVM } from './PlanLine'
import { DatesCalendar } from './DatesCalendar'
import { FocusDeck, CloseOut, type CloseDecision } from './FocusDeck'

type Level = 'month' | 'season'
const NOUN: Record<Level, string> = { month: 'Month', season: 'Season' }

const two = (n: number) => String(n).padStart(2, '0')
const monthName = (d: Date) => d.toLocaleDateString('en-US', { month: 'long' })
const shortDay = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

function Inner({ level }: { level: Level }) {
  const navigate = useNavigate()
  const { tasks, loading, toggleTask, updateTask, addTask, pushTask, keepForward, dropCommitment, updateTasksBulk } = useSupabaseTasks()
  const gated = useGatedTaskActions({ updateTask, pushTask, updateTasksBulk }, (id) => tasks.find((t) => t.id === id))
  const { layers, soleDomain } = useDomain()
  const { members, getCurrentUserMember } = useFamilyMembers()
  const meId = getCurrentUserMember()?.id ?? null
  const { seasons } = useHouseholdSeasons()
  const { goals } = useGoalsContext()
  const selection = useSelectionOptional()
  const { user } = useAuth()
  const chrome = useAppShellChromeOptional()
  const [params, setParams] = useSearchParams()
  const today = useMemo(() => new Date(), [])

  // ── The period ─────────────────────────────────────────────────────────
  const startParam = params.get('start')
  const anchor = useMemo(
    () => (startParam ? parseLocalYmd(startParam) : planningPeriod({ level, today, seasons }).start),
    [startParam, level, today, seasons],
  )
  const bounds = useMemo(() => periodBounds(level, anchor, seasons), [level, anchor, seasons])
  const prevBounds = useMemo(() => periodBounds(level, bounds.prev, seasons), [level, bounds.prev, seasons])
  const nextBounds = useMemo(() => periodBounds(level, bounds.next, seasons), [level, bounds.next, seasons])
  const isCurrent = isCurrentPeriod(bounds, today)
  const goTo = useCallback((d: Date) => {
    const next = new URLSearchParams(params)
    next.set('start', localYmd(periodBounds(level, d, seasons).start))
    setParams(next)
  }, [params, setParams, level, seasons])
  // Name the period in the URL, so the horizon rail and Back agree with the
  // page when it opened on the period ahead (planningPeriod looks ahead near
  // a month's end).
  useEffect(() => {
    if (startParam) return
    const next = new URLSearchParams(params)
    next.set('start', localYmd(bounds.start))
    setParams(next, { replace: true })
  }, [startParam, params, setParams, bounds.start])
  const nameOf = (b: typeof bounds) => (level === 'month' ? monthName(b.start) : b.label.replace(/\s+\d{4}$/, ''))
  const name = nameOf(bounds), prevName = nameOf(prevBounds), nextName = nameOf(nextBounds)

  // ── The lines ──────────────────────────────────────────────────────────
  const layered = useMemo(() => filterTasksForLayers(tasks, layers), [tasks, layers])
  const partOf = useCallback((t: Task): SupportLink | null => (
    t.isGoal ? supportedGoal(t, layered, goals, seasons) : goalOfTask(t, layered, seasons)
  ), [layered, goals, seasons])
  const toVM = useCallback((t: Task, b: typeof bounds): LineVM => {
    const fate = lineFate(t, level, b.start, b.end)
    const lower = t.completed ? null : lowerPlacement(t, level, b.start)
    const where = t.completed
      ? `Done${t.completedAt ? ` ${shortDay(t.completedAt)}` : ''}`
      : lower ? lower.label.replace(/^./, (c) => c.toUpperCase()) : null
    const steps = t.isGoal ? layered.filter((x) => x.goalTaskId === t.id).map((x) => {
      const lp = x.completed ? null : lowerPlacement(x, level, b.start)
      return { id: x.id, title: x.title, done: !!x.completed, where: x.completed ? 'done' : lp ? lp.label : null }
    }) : undefined
    return { task: t, fate, partOf: partOf(t), where, steps }
  }, [level, partOf, layered])

  const lines = useMemo(() => {
    const listed = selectPeriodTasks(layered, level, bounds.start, isCurrent, meId, seasons)
    const ids = new Set(listed.map((t) => t.id))
    const gone = endedIn(layered, level, bounds.start, bounds.end).filter((t) => !ids.has(t.id))
    return [...listed, ...gone].map((t) => toVM(t, bounds))
  }, [layered, level, bounds, isCurrent, meId, seasons, toVM])
  const prevLines = useMemo(() => (
    selectPeriodTasks(layered, level, prevBounds.start, isCurrentPeriod(prevBounds, today), meId, seasons).map((t) => toVM(t, prevBounds))
  ), [layered, level, prevBounds, today, meId, seasons, toVM])

  // A goal's steps on the same list read beneath it, not twice (v1 nests them too).
  const mainAll = lines.filter((l) => l.fate === 'open' || l.fate === 'done')
  const goalIds = new Set(mainAll.filter((l) => l.task.isGoal).map((l) => l.task.id))
  const main = mainAll.flatMap((l) => {
    if (l.task.goalTaskId && goalIds.has(l.task.goalTaskId)) return []
    if (!l.task.isGoal) return [l]
    return [l, ...mainAll.filter((s) => s.task.goalTaskId === l.task.id).map((s) => ({ ...s, nested: true }))]
  })
  const carried = lines.filter((l) => l.fate === 'carried')
  const someday = lines.filter((l) => l.fate === 'someday')
  const dropped = lines.filter((l) => l.fate === 'dropped')

  // ── The level above, for reference ─────────────────────────────────────
  const aboveRows = useMemo(() => {
    if (level === 'month') {
      const b = periodBounds('season', bounds.start, seasons)
      return selectPeriodTasks(layered, 'season', b.start, isCurrentPeriod(b, today), meId, seasons)
        .filter((t) => !t.completed)
        .map((t) => ({ id: t.id, title: t.title, isGoal: !!t.isGoal, task: t as Task | undefined, goal: undefined as undefined | typeof goals[number] }))
    }
    const year = bounds.start.getFullYear()
    return goals.filter((g) => g.year === year && g.status === 'active' && matchesLayers(g.context, layers))
      .map((g) => ({ id: g.id, title: g.name, isGoal: true, task: undefined as Task | undefined, goal: g }))
  }, [level, bounds.start, seasons, layered, today, meId, goals, layers])
  const aboveName = level === 'month' ? periodBounds('season', bounds.start, seasons).label.replace(/\s+\d{4}$/, '') : String(bounds.start.getFullYear())

  // ── Dates we can't move ────────────────────────────────────────────────
  const { events, available, loading: eventsLoading } = useDayLoadEvents(level === 'month')
  const landmarks = useMemo(() => landmarksIn(events, bounds.start, bounds.end), [events, bounds.start, bounds.end])
  const [openLm, setOpenLm] = useState<string | null>(null)
  const plannedOn = useCallback((l: Landmark) => layered
    .filter((t) => !t.completed && t.scheduledFor && t.scheduledFor >= l.start && t.scheduledFor < new Date(l.end.getFullYear(), l.end.getMonth(), l.end.getDate() + 1))
    .map((t) => ({ id: t.id, title: t.title, day: t.scheduledFor! })), [layered])

  // ── The plan record and the meeting ────────────────────────────────────
  const horizon = level === 'month' ? 'monthly' : 'seasonal'
  const token = level === 'month' ? monthToken(bounds.start) : seasonToken(bounds.start, seasons)
  const session = usePlanningSession(horizon, token)
  const [meeting, setMeeting] = useState<null | { step: 1 | 2; candidateIds: string[] }>(null)
  const [view, setViewState] = useState<PlanView>(() => readPlanView(level))
  const setView = (v: PlanView) => { setViewState(v); writePlanView(level, v) }
  const startMeeting = () => {
    const candidateIds = closeOutCandidates(prevLines.map((l) => l.task), level, prevBounds.start, prevBounds.end).map((t) => t.id)
    setMeeting({ step: candidateIds.length ? 1 : 2, candidateIds })
    if (view === 'list') setViewState('ref')
    window.scrollTo({ top: 0 })
  }
  const endMeeting = async (keep: boolean) => {
    if (keep) {
      const ok = await session.save({ wentWell: session.mine?.wentWell ?? '', didnt: session.mine?.didnt ?? '' })
      if (!ok) { showToast('Couldn’t save the plan — try again.', 'error', 5000); return }
      showToast(`Saved as our ${name} plan.`, 'success', 5000)
    }
    setMeeting(null)
    setViewState(readPlanView(level))
  }
  const agreedBy = session.saved
    ? (session.saved.authorId === user?.id ? 'you'
      : members.find((m) => m.auth_user_id === session.saved!.authorId)?.name ?? 'your household')
    : null

  // ── Verbs (the writers v1 uses) ────────────────────────────────────────
  const openTask = useCallback((id: string) => {
    if (selection) selection.setSelection({ kind: 'task', id })
    else navigate(`/task/${id}`)
  }, [selection, navigate])
  const periodPatch = (b: typeof bounds) => (level === 'month' ? { monthStart: b.start } : { seasonStart: b.start })
  const actions: LineActions = {
    done: async (t) => {
      const was = !!t.completed
      if ((await toggleTask(t.id)) === false) return
      showToast(was ? `Reopened “${t.title}”.` : `Done — “${t.title}”.`, 'success', 5000, { label: 'Undo', onClick: () => { void toggleTask(t.id) } })
    },
    carry: async (t) => {
      if (!(await keepForward(t.id, periodPatch(nextBounds), bounds.start))) return
      showToast(`“${t.title}” carried to ${nextName}. ${name}’s plan keeps the record.`, 'success', 5000)
    },
    someday: async (t) => {
      await gated.updateTask(t.id, { bucket: 'someday', scheduledFor: undefined, isAllDay: undefined })
      showToast(`“${t.title}” → Someday.`, 'success', 5000)
    },
    drop: async (t) => {
      // Drop ends THIS period's commitment and keeps the task (v1's look-back
      // rule), rather than deleting it from a hover menu. With nothing else
      // holding it, it waits in the Inbox.
      if (!(await dropCommitment(t.id, level, bounds.start))) return
      showToast(`Dropped “${t.title}” from ${name}. It’s in the Inbox if you want it back.`, 'success', 6000)
    },
    assign: (t, ids) => { void gated.updateTask(t.id, { assignedToAll: ids, assignedTo: ids[0] ?? undefined }) },
    details: (t) => openTask(t.id),
    rename: (t, title) => { void updateTask(t.id, { title }) },
    openPartOf: (link) => navigate(link.rung === 'year' ? `/goals/${link.id}` : `/task/${link.id}`),
  }
  const decide = async (vm: LineVM, d: CloseDecision) => {
    const t = vm.task
    if (d === 'carried') await keepForward(t.id, periodPatch(bounds), prevBounds.start)
    else if (d === 'done') { if (!t.completed) await toggleTask(t.id) }
    else if (d === 'someday') await gated.updateTask(t.id, { bucket: 'someday', scheduledFor: undefined, isAllDay: undefined })
    else if (d === 'dropped') await dropCommitment(t.id, level, prevBounds.start)
  }
  const addLine = async (title: string) => {
    await addTask(title, undefined, undefined, undefined, {
      bucket: level === 'month' ? 'month' : 'quarter', ...periodPatch(bounds), context: soleDomain ?? undefined,
    })
  }
  const addFromAbove = async (row: typeof aboveRows[number]) => {
    if (row.task && !row.isGoal) {
      // A season task taken into the month is the SAME task, now also on the month.
      await gated.updateTask(row.task.id, { bucket: 'month', monthStart: bounds.start })
    } else if (row.task) {
      await addTask(row.title, undefined, undefined, undefined, {
        bucket: 'month', monthStart: bounds.start, isGoal: true, supportsGoalTaskId: row.task.id,
        goalId: row.task.goalId, context: row.task.context ?? soleDomain ?? undefined,
      })
    } else if (row.goal) {
      await addTask(row.title, undefined, undefined, undefined, {
        bucket: 'quarter', seasonStart: bounds.start, isGoal: true, goalId: row.goal.id, context: row.goal.context ?? soleDomain ?? undefined,
      })
    }
    showToast(`Added to ${name}, as part of “${row.title}”.`, 'success', 4000)
  }

  // ── Rendering ──────────────────────────────────────────────────────────
  const [openLine, setOpenLine] = useState<string | null>(null)
  const [showDropped, setShowDropped] = useState(false)
  const [draft, setDraft] = useState('')
  const inMeeting = !!meeting
  const numeral = level === 'month'
    ? two(bounds.start.getMonth() + 1)
    : `${two(bounds.start.getMonth() + 1)}–${two(new Date(bounds.end.getTime() - 86400000).getMonth() + 1)}`

  const row = (vm: LineVM) => (
    <PlanLine key={vm.task.id} vm={vm} actions={actions} members={members} nextLabel={nextName}
      open={openLine === vm.task.id} onToggle={() => setOpenLine((o) => (o === vm.task.id ? null : vm.task.id))} editable={inMeeting} />
  )
  const section = (label: string, vms: LineVM[]) => vms.length ? <><div className="pv2-sect">{label}</div><ul className="pv2-list">{vms.map(row)}</ul></> : null
  const listColumn = (
    <section aria-label={`${name} plan`}>
      <div className="pv2-colh">{inMeeting ? `${name}’s list` : 'Our plan'}</div>
      {loading && !main.length ? <p className="pv2-hint">Loading…</p> : null}
      {!loading && !main.length && <p className="pv2-hint">{inMeeting ? 'Nothing yet. Write whatever comes up — no types, no dates needed.' : `Nothing on ${name}’s plan yet.`}</p>}
      <ul className={`pv2-list${level === 'season' && view === 'list' && !inMeeting ? ' pv2-brain' : ''}`}>{main.map(row)}</ul>
      {inMeeting && (
        <form className="pv2-write" onSubmit={(e) => { e.preventDefault(); const v = draft.trim(); if (v) { void addLine(v); setDraft('') } }}>
          <span className="pv2-dash" aria-hidden="true" />
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a line" aria-label={`Add to ${name}`} />
        </form>
      )}
      {section(`Carried to ${nextName}`, carried)}
      {section('Someday', someday)}
      {dropped.length > 0 && <>
        <div className="pv2-sect">Dropped</div>
        {showDropped && <ul className="pv2-list">{dropped.map(row)}</ul>}
        <button type="button" className="pv2-link pv2-quiet" onClick={() => setShowDropped((s) => !s)}>{showDropped ? 'Hide' : 'Show'} {dropped.length} dropped</button>
      </>}
    </section>
  )
  const refColumn = (
    <aside className="pv2-ref" aria-label={`${aboveName}, for reference`}>
      <div className="pv2-colh">{aboveName} <small>for reference</small></div>
      {aboveRows.length ? (
        <ul className="pv2-list">{aboveRows.map((r) => (
          <li key={r.id} className="pv2-rrow">
            <span className="pv2-goal is-small" aria-hidden="true" />
            <span className="flex-1">{r.title}</span>
            {inMeeting && <button type="button" className="pv2-addbtn" onClick={() => void addFromAbove(r)} aria-label={`Add a ${name} line from ${r.title}`}>+ Add</button>}
          </li>
        ))}</ul>
      ) : <p className="pv2-hint">Nothing written for {aboveName}. That’s fine.</p>}
    </aside>
  )
  const calendar = level === 'month' ? (
    <DatesCalendar start={bounds.start} end={bounds.end} landmarks={landmarks} today={today} selected={openLm} onSelect={setOpenLm}
      onOpenWeek={(ws) => navigate(`/week?start=${localYmd(ws)}`)} available={available || eventsLoading} planned={plannedOn} />
  ) : null

  const viewSwitch = (
    <div className="pv2-seg" role="group" aria-label="View">
      {([['list', 'List'], ['ref', `With ${aboveName}`], ['focus', 'One at a time']] as const).map(([v, l]) => (
        <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>{l}</button>
      ))}
    </div>
  )

  let body: ReactElement
  if (meeting?.step === 1) {
    body = <CloseOut lines={prevLines} candidateIds={meeting.candidateIds} members={members} actions={actions} prevName={prevName} nextName={name}
      onDecide={decide} onFinish={() => setMeeting({ ...meeting, step: 2 })} />
  } else if (view === 'focus') {
    body = <FocusDeck lines={lines} actions={actions} members={members} nextLabel={nextName} context={`${name} plan`} label={`${name}’s plan`} />
  } else if (view === 'ref') {
    body = <div className={level === 'month' ? 'pv2-grid3' : 'pv2-grid2 is-ref'}>{refColumn}{listColumn}{calendar}</div>
  } else {
    body = level === 'month' ? <div className="pv2-grid2">{listColumn}{calendar}</div> : listColumn
  }

  return (
    <div className="pv2-page">
      <header className="pv2-head">
        <div className={`pv2-numeral${level === 'season' ? ' is-wide' : ''}`} aria-hidden="true">{numeral}</div>
        <div className="min-w-0">
          <div className="pv2-eyebrow">{NOUN[level]}</div>
          <h1 className="pv2-title">
            {bounds.label}
            <span className="pv2-mnav">
              <button type="button" onClick={() => goTo(bounds.prev)}>← {prevName}</button>
              <button type="button" onClick={() => goTo(bounds.next)}>{nextName} →</button>
              {!isCurrent && <button type="button" onClick={() => goTo(today)}>This {NOUN[level].toLowerCase()}</button>}
            </span>
          </h1>
          <p className="pv2-purpose">
            {meeting?.step === 1 ? `First, decide what happens to what’s left of ${prevName}.`
              : inMeeting ? `Look at ${aboveName}${level === 'month' ? ' and the calendar' : ''}, then write what ${name} is for.`
              : level === 'month' ? 'Our plan for the month, and the dates we can’t move.' : `What we want this ${NOUN[level].toLowerCase()}.`}
          </p>
        </div>
        <div className="pv2-chrome">{chrome ? <HomeChromeControls className="flex" /> : <DomainSwitcher />}</div>
      </header>

      {inMeeting ? (
        <div className="pv2-sbar" role="region" aria-label={`Planning ${name}`}>
          <span className="pv2-st">Planning {name}<small>a planning meeting</small></span>
          {meeting!.candidateIds.length > 0 ? (
            <div className="pv2-steps">
              <button type="button" aria-current={meeting!.step === 1 ? 'step' : undefined} onClick={() => setMeeting({ ...meeting!, step: 1 })}><b>1</b>Close out {prevName}</button>
              <button type="button" aria-current={meeting!.step === 2 ? 'step' : undefined} onClick={() => setMeeting({ ...meeting!, step: 2 })}><b>2</b>Write {name}</button>
            </div>
          ) : <span className="flex-1" />}
          {meeting!.step === 2 && viewSwitch}
          <button type="button" className="pv2-link pv2-quiet" onClick={() => void endMeeting(false)}>Leave for now</button>
          <button type="button" className="pv2-btn" onClick={() => void endMeeting(true)}>This is our {name} plan</button>
        </div>
      ) : (
        <div className="pv2-toolbar">
          <div className="pv2-status">
            {session.saved
              ? <><span className="pv2-seal" aria-hidden="true" /><span><b>Our {name} plan</b> · agreed {shortDay(session.saved.at)} · {agreedBy}</span></>
              : <span className="pv2-hint">{session.loading ? '' : `No ${name} plan yet`}</span>}
          </div>
          {viewSwitch}
          <button type="button" className={session.saved ? 'pv2-qbtn' : 'pv2-btn'} onClick={startMeeting}>Plan {name}</button>
        </div>
      )}

      {body}

      <p className="pv2-foot">
        New planning page · <button type="button" className="pv2-link pv2-quiet" onClick={() => { leavePlanV2(); window.location.assign(window.location.pathname) }}>Back to the current page</button>
      </p>
    </div>
  )
}

/** /month and /season, v2. Mounts its own GoalsProvider, as v1 does. */
export function PlanPageV2({ level }: { level: Level }) {
  return <GoalsProvider><Inner level={level} /></GoalsProvider>
}
