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
import { MastheadCard, PeriodNavEyebrow } from '@/components/layout/MastheadCard'
import { showToast } from '@/hooks/useToast'
import { filterTasksForLayers, matchesLayers } from '@/lib/today/domainFilter'
import { readPlanView, writePlanView, type PlanView } from '@/lib/planning/v2/planV2'
import type { Goal } from '@/types/goal'
import type { Task } from '@/types/task'
import { PlanLine, type LineActions, type LineVM } from './PlanLine'
import { FocusDeck, CloseOut, type CloseDecision } from './FocusDeck'
import { PlanMeetingBar, PlanToolbar, PlanToolbarControls, PlanToolbarStatus, type PlanToolbarProps } from './PlanStatus'
import { GuideAnchor } from '@/components/guide/GuideBar'
import { useMobile } from '@/hooks/useMobile'
import { EMPTY_TALLY, addToTally, lookBackWhy, nextAfterSave, tallySentence, type Tally } from '@/lib/planning/v2/planTally'
import { periodBounds } from '@/lib/planning/periodPage'
import { readSeasons } from '@/lib/cadence/seasons'
import { FromPaper } from './FromPaper'
import { ViewSwitch } from './ViewSwitch'
import { useAddArea } from './AddArea'
import { PeopleFilter } from './PeopleFilter'
import { useAssigneeFilter } from '@/hooks/useAssigneeFilter'
import { planPeopleLens } from '@/lib/planning/peopleLens'


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
  // The people filter narrows the year drawn here; last year's look-back
  // keeps every goal, so a review never skips one.
  const [people] = useAssigneeFilter()
  const lens = useMemo(() => planPeopleLens(people, null), [people])
  const toVM = useCallback((g: Goal): LineVM => {
    const carried = goals.some((x) => x.carriedFrom === g.id)
    const fate = g.status === 'completed' ? 'done' : g.status === 'archived' ? 'dropped' : carried ? 'carried' : 'open'
    const seasonWork = layered.filter((t) => t.isGoal && t.goalId === g.id)
      .map((t) => ({ id: t.id, title: t.title, done: !!t.completed, where: t.seasonStart ? t.seasonStart.toLocaleDateString('en-US', { month: 'short' }) + ' season' : null }))
    return { task: asLine(g), fate, partOf: null, where: null, steps: seasonWork }
  }, [goals, layered])
  const lines = useMemo(() => goals.filter((g) => g.year === year && visible(g) && lens.keep(g)).map(toVM), [goals, year, visible, lens, toVM])
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
  const [tally, setTally] = useState<Tally>(EMPTY_TALLY)
  const [justSaved, setJustSaved] = useState<null | { detail: string }>(null)
  const decide = async (vm: LineVM, d: CloseDecision) => {
    setTally((x) => addToTally(x, d))
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
    setTally(EMPTY_TALLY)
    setJustSaved(null)
    setMeeting({ step: candidateIds.length ? 1 : 2, candidateIds })
    window.scrollTo({ top: 0 })
  }
  const endMeeting = async (keep: boolean) => {
    if (keep) {
      if (!(await session.save({ wentWell: session.mine?.wentWell ?? '', didnt: session.mine?.didnt ?? '' }))) { showToast('Couldn’t save the plan — try again.', 'error', 5000); return }
      const open = lines.filter((l) => l.fate === 'open').length
      const done = lines.filter((l) => l.fate === 'done').length
      setJustSaved({ detail: [`${open} open${done ? `, ${done} done` : ''}.`, tallySentence(tally, String(year - 1))].filter(Boolean).join(' ') })
    }
    setMeeting(null)
  }
  const agreedBy = session.saved
    ? (session.saved.authorId === user?.id ? 'you' : members.find((m) => m.auth_user_id === session.saved!.authorId)?.name ?? 'your household')
    : null
  const inMeeting = !!meeting
  const mobile = useMobile()
  // After a save, the season that takes the year forward.
  const seasons = readSeasons()
  const nextStep = nextAfterSave('year', new Date(year, 0, 1), year === new Date().getFullYear(), new Date(), {
    weekStartOf: (d) => d, weekNumber: () => 0,
    seasonOf: (d) => { const b = periodBounds('season', d, seasons); return { start: b.start, name: b.label.replace(/\s+\d{4}$/, '') } },
  })
  const main = lines.filter((l) => l.fate === 'open' || l.fate === 'done')
  const carried = lines.filter((l) => l.fate === 'carried')
  const dropped = lines.filter((l) => l.fate === 'dropped')
  const row = (vm: LineVM) => <PlanLine key={vm.task.id} vm={vm} actions={actions} members={members} nextLabel={String(year + 1)}
    open={openLine === vm.task.id} onToggle={() => setOpenLine((o) => (o === vm.task.id ? null : vm.task.id))} editable={inMeeting} />
  const viewSwitch = <ViewSwitch view={view} onChange={setView} withRef={false} />
  const toolbar: PlanToolbarProps = {
    period: String(year), saved: session.saved, loading: session.loading, error: !!session.error, agreedBy,
    reviewDue, onPlan: startMeeting, onRetry: session.reload, viewSwitch, tools: <PeopleFilter />,
    justSaved: justSaved && {
      detail: justSaved.detail,
      next: { label: nextStep.label, onClick: () => { writePlanView('season', 'ref'); navigate(nextStep.to) } },
      onDone: () => setJustSaved(null),
    },
  }
  // Desktop: the control row folds into the masthead; a meeting keeps its bar.
  const folded = !mobile && !inMeeting

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
        {!loading && !main.length && <p className="pv2-hint ds-empty-body">{inMeeting ? 'Write what you want this year to hold.' : `Nothing on ${year}’s plan yet. That’s fine.`}</p>}
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
        // Desktop folds the control row into the masthead (layout system,
        // 2026-10-01): status as the subline, views and "Plan <year>" at the
        // title's right. Phones keep the row.
        subline={folded ? <PlanToolbarStatus {...toolbar} /> : undefined}
        controls={folded ? <PlanToolbarControls {...toolbar} /> : undefined}
        />
      {inMeeting ? (
        <PlanMeetingBar period={String(year)} prevName={String(year - 1)} step={meeting!.step} lookBack={meeting!.candidateIds.length > 0}
          why={meeting!.step === 1 ? lookBackWhy(String(year - 1), String(year), meeting!.candidateIds.length)
            : 'Write what this year is for. A few lines is plenty; each can hold smaller plans later.'}
          onStep={(step) => setMeeting({ ...meeting!, step })}
          viewSwitch={meeting!.step === 2 && meeting!.candidateIds.length === 0 ? viewSwitch : undefined}
          onLeave={() => void endMeeting(false)} onSave={() => void endMeeting(true)} saveLabel={`Mark ${year} planned`} />
      ) : folded ? <GuideAnchor /> : <PlanToolbar {...toolbar} />}
      {body}
    </div>
  )
}

export function YearPageV2() { return <GoalsProvider><Inner /></GoalsProvider> }
