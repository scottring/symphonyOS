// src/components/plan/v2/YearPageV2.tsx
//
// The year, v2. Same page as the month and season — our plan, one toolbar, a
// meeting that opens by closing out last year — but a year's lines are rows of
// the `goals` table, not tasks, so its verbs are the goal writers v1 uses:
// Done → status completed, Carry → a copy for next year (carriedFrom), Drop →
// archived. A year has no Someday.

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { GoalsProvider, useGoalsContext } from '@/contexts/GoalsContext'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useDomain } from '@/hooks/useDomain'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { usePlanningSession, yearToken } from '@/hooks/usePlanningSession'
import { useAuth } from '@/hooks/useAuth'
import { useAppShellChromeOptional } from '@/contexts/AppShellChromeContext'
import { HomeChromeControls } from '@/components/home/HomeChromeControls'
import { MastheadCard, PeriodNavEyebrow } from '@/components/layout/MastheadCard'
import { DomainSwitcher } from '@/components/domain/DomainSwitcher'
import { showToast } from '@/hooks/useToast'
import { filterTasksForLayers, matchesLayers } from '@/lib/today/domainFilter'
import { readPlanView, writePlanView, type PlanView } from '@/lib/planning/v2/planV2'
import type { Goal } from '@/types/goal'
import type { Task } from '@/types/task'
import { PlanLine, type LineActions, type LineVM } from './PlanLine'
import { FocusDeck, CloseOut, type CloseDecision } from './FocusDeck'
import { FromPaper } from './FromPaper'
import { ViewSwitch } from './ViewSwitch'
import { useAddArea } from './AddArea'

const shortDay = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

/** A goal row in the task shape the shared line and card draw. */
function asLine(g: Goal): Task {
  return {
    id: g.id, title: g.name, isGoal: true, completed: g.status === 'completed', notes: g.strategy?.trim() || g.notes || '',
    assignedToAll: g.assignedToAll, context: g.context ?? undefined, createdAt: g.createdAt, updatedAt: g.updatedAt,
  } as Task
}

function Inner() {
  const navigate = useNavigate()
  const { goals, areas, addGoal, updateGoal, addArea, loading } = useGoalsContext()
  const { tasks } = useSupabaseTasks()
  const { layers } = useDomain()
  const { members } = useFamilyMembers()
  const { user } = useAuth()
  const chrome = useAppShellChromeOptional()
  const [params, setParams] = useSearchParams()
  const startParam = params.get('start')
  const year = startParam ? Number(startParam.slice(0, 4)) : new Date().getFullYear()
  useEffect(() => {
    if (startParam) return
    const next = new URLSearchParams(params); next.set('start', `${year}-01-01`); setParams(next, { replace: true })
  }, [startParam, params, setParams, year])
  const goTo = (y: number) => { const next = new URLSearchParams(params); next.set('start', `${y}-01-01`); setParams(next) }

  const layered = useMemo(() => filterTasksForLayers(tasks, layers), [tasks, layers])
  const visible = useCallback((g: Goal) => matchesLayers(g.context, layers), [layers])
  const toVM = useCallback((g: Goal): LineVM => {
    const carried = goals.some((x) => x.carriedFrom === g.id)
    const fate = g.status === 'completed' ? 'done' : g.status === 'archived' ? 'dropped' : carried ? 'carried' : 'open'
    const seasonWork = layered.filter((t) => t.isGoal && t.goalId === g.id)
      .map((t) => ({ id: t.id, title: t.title, done: !!t.completed, where: t.seasonStart ? t.seasonStart.toLocaleDateString('en-US', { month: 'short' }) + ' season' : null }))
    return { task: asLine(g), fate, partOf: null, where: null, steps: seasonWork }
  }, [goals, layered])
  const lines = useMemo(() => goals.filter((g) => g.year === year && visible(g)).map(toVM), [goals, year, visible, toVM])
  const prevLines = useMemo(() => goals.filter((g) => g.year === year - 1 && visible(g)).map(toVM), [goals, year, visible, toVM])

  const session = usePlanningSession('annual', yearToken(year))
  const [meeting, setMeeting] = useState<null | { step: 1 | 2; candidateIds: string[] }>(null)
  const [view, setViewState] = useState<PlanView>(() => { const v = readPlanView('year'); return v === 'ref' ? 'list' : v })
  const setView = (v: PlanView) => { setViewState(v); writePlanView('year', v) }
  const [openLine, setOpenLine] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [showDropped, setShowDropped] = useState(false)

  const byId = (id: string) => goals.find((g) => g.id === id)
  const carryInto = async (g: Goal, into: number) => {
    const copy = await addGoal(g.areaId, g.name, g.context ?? undefined, { notes: g.notes ?? null, strategy: g.strategy ?? null, year: into, carriedFrom: g.id, assignedToAll: g.assignedToAll })
    return !!copy
  }
  const actions: LineActions = {
    done: async (t) => {
      const g = byId(t.id); if (!g) return
      const finishing = g.status !== 'completed'
      await updateGoal(g.id, { status: finishing ? 'completed' : 'active' })
      showToast(finishing ? `Done — “${g.name}”.` : `Reopened “${g.name}”.`, 'success', 5000, { label: 'Undo', onClick: () => { void updateGoal(g.id, { status: finishing ? 'active' : 'completed' }) } })
    },
    carry: async (t) => { const g = byId(t.id); if (g && await carryInto(g, year + 1)) showToast(`“${g.name}” carried to ${year + 1}. ${year}’s plan keeps the record.`, 'success', 5000) },
    drop: async (t) => { const g = byId(t.id); if (!g) return; await updateGoal(g.id, { status: 'archived' }); showToast(`Dropped “${g.name}” — kept in ${year}’s history.`, 'success', 5000, { label: 'Undo', onClick: () => { void updateGoal(g.id, { status: 'active' }) } }) },
    assign: (t, ids) => { void updateGoal(t.id, { assignedToAll: ids }) },
    details: (t) => navigate(`/goals/${t.id}`),
    rename: (t, title) => { void updateGoal(t.id, { name: title }) },
    openPartOf: () => {},
    setContext: async (t, c) => {
      // Re-tagging moves who may read it; the database refuses a partner who
      // would make the owner's shared goal private (two-account check,
      // 2026-09-29) — say so rather than let the chip quietly spring back.
      if ((await updateGoal(t.id, { context: c ?? null })) === false) {
        showToast(`Couldn’t change “${t.title}”. A shared goal can only be made private by the person who wrote it.`, 'error', 7000)
      }
    },
  }
  const decide = async (vm: LineVM, d: CloseDecision) => {
    const g = byId(vm.task.id); if (!g) return
    if (d === 'carried') await carryInto(g, year)
    else if (d === 'done') await updateGoal(g.id, { status: 'completed' })
    else if (d === 'dropped') await updateGoal(g.id, { status: 'archived' })
  }
  const addAreaChoice = useAddArea()
  const addLine = async (name: string) => {
    const areaId = areas[0]?.id ?? (await addArea('General'))?.id ?? null
    await addGoal(areaId, name, addAreaChoice.area, { year })
  }
  // The year's review (see PlanPageV2): prominent only while one is due.
  const reviewIds = prevLines.filter((l) => l.fate === 'open').map((l) => l.task.id)
  const reviewDue = !session.saved || reviewIds.length > 0
  const startMeeting = () => {
    const candidateIds = reviewIds
    setMeeting({ step: candidateIds.length ? 1 : 2, candidateIds })
    window.scrollTo({ top: 0 })
  }
  const endMeeting = async (keep: boolean) => {
    if (keep) {
      if (!(await session.save({ wentWell: session.mine?.wentWell ?? '', didnt: session.mine?.didnt ?? '' }))) { showToast('Couldn’t save the plan — try again.', 'error', 5000); return }
      showToast(`Saved as our ${year} plan.`, 'success', 5000)
    }
    setMeeting(null)
  }
  const agreedBy = session.saved
    ? (session.saved.authorId === user?.id ? 'you' : members.find((m) => m.auth_user_id === session.saved!.authorId)?.name ?? 'your household')
    : null
  const inMeeting = !!meeting
  const main = lines.filter((l) => l.fate === 'open' || l.fate === 'done')
  const carried = lines.filter((l) => l.fate === 'carried')
  const dropped = lines.filter((l) => l.fate === 'dropped')
  const row = (vm: LineVM) => <PlanLine key={vm.task.id} vm={vm} actions={actions} members={members} nextLabel={String(year + 1)}
    open={openLine === vm.task.id} onToggle={() => setOpenLine((o) => (o === vm.task.id ? null : vm.task.id))} editable={inMeeting} />
  const viewSwitch = <ViewSwitch view={view} onChange={setView} withRef={false} />

  let body: ReactElement
  if (meeting?.step === 1) {
    body = <CloseOut lines={prevLines} candidateIds={meeting.candidateIds} members={members} actions={actions} prevName={String(year - 1)} nextName={String(year)}
      onDecide={decide} onFinish={() => setMeeting({ ...meeting, step: 2 })} />
  } else if (view === 'focus') {
    body = <FocusDeck lines={lines} actions={actions} members={members} nextLabel={String(year + 1)} context={`${year} plan`} label={`${year}’s plan`} />
  } else {
    body = (
      <section aria-label={`${year} plan`}>
        <div className="pv2-colh">{inMeeting ? `${year}’s goals` : 'Our plan'}<FromPaper altitude="year" periodStart={new Date(year, 0, 1)} tasks={layered} /></div>
        {loading && !main.length ? <p className="pv2-hint">Loading…</p> : null}
        {!loading && !main.length && <p className="pv2-hint">{inMeeting ? 'Write what you want this year to hold.' : `Nothing on ${year}’s plan yet. That’s fine.`}</p>}
        <ul className="pv2-list pv2-brain">{main.map(row)}</ul>
        {/* Always open, as on every horizon: the review is not a gate on writing. */}
        <form className="pv2-write" onSubmit={(e) => { e.preventDefault(); const v = draft.trim(); if (v) { void addLine(v); setDraft('') } }}>
          <span className="pv2-goal" aria-hidden="true" />
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a goal for the year" aria-label={`Add to ${year}`} />
          {addAreaChoice.picker}
        </form>
        {carried.length > 0 && <><div className="pv2-sect">Carried to {year + 1}</div><ul className="pv2-list">{carried.map(row)}</ul></>}
        {dropped.length > 0 && <>
          <div className="pv2-sect">Dropped</div>
          {showDropped && <ul className="pv2-list">{dropped.map(row)}</ul>}
          <button type="button" className="pv2-link pv2-quiet" onClick={() => setShowDropped((s) => !s)}>{showDropped ? 'Hide' : 'Show'} {dropped.length} dropped</button>
        </>}
      </section>
    )
  }

  return (
    <div className="pv2-page">
      <MastheadCard variant="page" numeral={String(year)} title={`Jan – Dec ${year}`}
        eyebrow={<PeriodNavEyebrow label="Year" onPrev={() => goTo(year - 1)} onNext={() => goTo(year + 1)} prevLabel={String(year - 1)} nextLabel={String(year + 1)} />}
        subline={meeting?.step === 1 ? `First, decide what happens to what’s left of ${year - 1}.` : inMeeting ? 'Write what this year is for.' : undefined}
        controls={chrome ? <HomeChromeControls className="flex" /> : <DomainSwitcher />} />
      {inMeeting ? (
        <div className="pv2-sbar" role="region" aria-label={`Year review, ${year}`}>
          <span className="pv2-st">Year review<small>{year}</small></span>
          {meeting!.candidateIds.length > 0 ? (
            <div className="pv2-steps">
              <button type="button" aria-current={meeting!.step === 1 ? 'step' : undefined} onClick={() => setMeeting({ ...meeting!, step: 1 })}><b>1</b>Close out {year - 1}</button>
              <button type="button" aria-current={meeting!.step === 2 ? 'step' : undefined} onClick={() => setMeeting({ ...meeting!, step: 2 })}><b>2</b>Write {year}</button>
            </div>
          ) : <span className="flex-1" />}
          {/* With steps in the bar there is no room for the views too — the
              review writes with the level above beside it anyway. */}
          {meeting!.step === 2 && meeting!.candidateIds.length === 0 && viewSwitch}
          <button type="button" className="pv2-link pv2-quiet" onClick={() => void endMeeting(false)}>Leave for now</button>
          <button type="button" className="pv2-btn" onClick={() => void endMeeting(true)}>This is our {year} plan</button>
        </div>
      ) : (
        <div className="pv2-toolbar">
          <div className="pv2-status">
            {session.saved
              ? <><span className="pv2-seal" aria-hidden="true" /><span><b>Our {year} plan</b> · agreed {shortDay(session.saved.at)} · {agreedBy}</span></>
              : <span className="pv2-hint">{session.loading ? '' : `No ${year} plan yet`}</span>}
          </div>
          {viewSwitch}
          <button type="button" className={reviewDue ? 'pv2-btn' : 'pv2-qbtn'} onClick={startMeeting}>Year review</button>
        </div>
      )}
      {body}
    </div>
  )
}

export function YearPageV2() { return <GoalsProvider><Inner /></GoalsProvider> }
