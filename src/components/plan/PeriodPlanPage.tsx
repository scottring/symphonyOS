// src/components/plan/PeriodPlanPage.tsx
//
// One page, three levels. This Month, This Season and This Year are the same
// surface with a different period: the level's own list (tasks and goals, or
// goals alone for the year), the level above folded beneath it to reference
// while you write, and a look-back at the period just ended (Scott, 2026-09-05: "plan
// the year, then the season referencing the year, then the month referencing
// the season… then at the end of each period, review it").
//
// Nothing here is scheduled. A month or season TASK can be copied down (from
// the rail into this page, or from this page onward in a look-back); a goal
// is only ever ticked, kept or dropped.

import { useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Target } from 'lucide-react'
import { MastheadCard, PeriodNavEyebrow } from '@/components/layout/MastheadCard'
import { HomeChromeControls } from '@/components/home/HomeChromeControls'
import { DomainSwitcher } from '@/components/domain/DomainSwitcher'
import { useAppShellChromeOptional } from '@/contexts/AppShellChromeContext'
import { PAGE_COLUMN_WIDE } from '@/components/layout/pageLayout'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useGatedTaskActions } from '@/hooks/useGatedTaskActions'
import { useDomain } from '@/hooks/useDomain'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { useHouseholdSeasons } from '@/hooks/useHouseholdSeasons'
import { GoalsProvider, useGoalsContext } from '@/contexts/GoalsContext'
import { filterTasksForLayers, matchesLayers } from '@/lib/today/domainFilter'
import { placementFate } from '@/lib/planning/lineage'
import { seasonStartFor } from '@/lib/cadence/seasons'
import {
  periodBounds, isCurrentPeriod, selectPeriodTasks, actionsFor, railLevel,
  type PlanLevel, type RowAction,
} from '@/lib/planning/periodPage'
import type { Task } from '@/types/task'
import type { Goal } from '@/types/goal'
import { PlanRow, type PlanRowModel } from './PlanRow'
import { PlanRail } from './PlanRail'

const TITLE: Record<PlanLevel, string> = { month: 'This Month', season: 'This Season', year: 'This Year' }
const NOUN: Record<PlanLevel, string> = { month: 'month', season: 'season', year: 'year' }

function taskRow(t: Task, all: readonly Task[]): PlanRowModel {
  return { id: t.id, title: t.title, isGoal: !!t.isGoal, fate: placementFate(t, all), kind: 'task' }
}
function goalRow(g: Goal): PlanRowModel {
  return { id: g.id, title: g.name, isGoal: true, fate: g.status === 'completed' ? 'done' : 'open', kind: 'goal' }
}

function PeriodPlanPageInner({ level }: { level: PlanLevel }) {
  const navigate = useNavigate()
  const { tasks, toggleTask, deleteTask, updateTask, updateTasksBulk, addTask, setGoal, pushTask, keepForward } = useSupabaseTasks()
  const gated = useGatedTaskActions({ updateTask, pushTask, updateTasksBulk }, (id) => tasks.find((t) => t.id === id))
  const { layers, soleDomain } = useDomain()
  const { getCurrentUserMember } = useFamilyMembers()
  const meId = getCurrentUserMember()?.id ?? null
  const { seasons } = useHouseholdSeasons()
  const { goals, areas, addGoal, updateGoal, deleteGoal, addArea } = useGoalsContext()

  const today = useMemo(() => new Date(), [])
  const [anchor, setAnchor] = useState<Date>(() => new Date())
  const bounds = useMemo(() => periodBounds(level, anchor, seasons), [level, anchor, seasons])
  const isCurrent = isCurrentPeriod(bounds, today)
  const isPast = bounds.end <= today
  // Page chrome for the card's corner — only inside an AppShell (tests mount bare).
  const chrome = useAppShellChromeOptional()

  const layered = useMemo(() => filterTasksForLayers(tasks, layers), [tasks, layers])

  // ── The list ─────────────────────────────────────────────────────────────
  const rows = useMemo<PlanRowModel[]>(() => {
    if (level === 'year') {
      const year = bounds.start.getFullYear()
      return goals.filter((g) => g.year === year && matchesLayers(g.context, layers)).map(goalRow)
    }
    const list = selectPeriodTasks(layered, level, bounds.start, isCurrent, meId).map((t) => taskRow(t, tasks))
    // Goals first — a goal is what the period is for — then tasks, each in
    // the order they were written.
    return [...list.filter((r) => r.isGoal), ...list.filter((r) => !r.isGoal)]
  }, [level, goals, layers, layered, bounds.start, isCurrent, meId, tasks])

  // ── The fold: the level above, for the CURRENT period, read-only ─────────
  const above = railLevel(level)
  const railRows = useMemo<PlanRowModel[]>(() => {
    if (above === 'season') {
      return selectPeriodTasks(layered, 'season', seasonStartFor(today, seasons), true, meId).map((t) => taskRow(t, tasks))
    }
    if (above === 'year') {
      return goals.filter((g) => g.year === today.getFullYear() && matchesLayers(g.context, layers)).map(goalRow)
    }
    return []
  }, [above, layered, today, seasons, meId, tasks, goals, layers])
  const railBounds = useMemo(() => (above ? periodBounds(above, today, seasons) : null), [above, today, seasons])

  // ── Verbs ────────────────────────────────────────────────────────────────
  const open = useCallback((row: PlanRowModel) => {
    navigate(row.kind === 'goal' ? `/goals/${row.id}` : `/task/${row.id}`)
  }, [navigate])

  const act = useCallback(async (action: RowAction, row: PlanRowModel) => {
    if (row.kind === 'goal') {
      const g = goals.find((x) => x.id === row.id)
      if (!g) return
      if (action === 'complete') await updateGoal(g.id, { status: g.status === 'completed' ? 'active' : 'completed' })
      else if (action === 'drop') await deleteGoal(g.id)
      else if (action === 'keep') {
        const kept = await addGoal(g.areaId, g.name, g.context ?? undefined)
        if (kept) await updateGoal(kept.id, { year: bounds.next.getFullYear() })
      }
      return
    }
    if (action === 'complete') await toggleTask(row.id)
    else if (action === 'drop') await deleteTask(row.id)
    else if (action === 'someday') await gated.updateTask(row.id, { bucket: 'someday', scheduledFor: undefined, isAllDay: undefined })
    else if (action === 'make-goal') await setGoal(row.id, true)
    else if (action === 'make-task') await setGoal(row.id, false)
    else if (action === 'keep') {
      await keepForward(row.id, level === 'month' ? { monthStart: bounds.next } : { seasonStart: bounds.next })
    }
  }, [goals, updateGoal, deleteGoal, addGoal, bounds.next, toggleTask, deleteTask, gated, setGoal, keepForward, level])

  // The rail's one verb: copy an open season task down into this month.
  const pullDown = useCallback((row: PlanRowModel) => {
    void gated.pushTask(row.id, 'month')
  }, [gated])

  // ── Add ──────────────────────────────────────────────────────────────────
  const [draft, setDraft] = useState('')
  const [asGoal, setAsGoal] = useState(level === 'year')
  const submit = useCallback(async () => {
    const title = draft.trim()
    if (!title) return
    setDraft('')
    if (level === 'year') {
      const areaId = areas[0]?.id ?? (await addArea('General'))?.id
      if (!areaId) return
      const g = await addGoal(areaId, title, soleDomain ?? undefined)
      const year = bounds.start.getFullYear()
      if (g && g.year !== year) await updateGoal(g.id, { year })
      return
    }
    await addTask(title, undefined, undefined, undefined, {
      bucket: level === 'month' ? 'month' : 'quarter',
      monthStart: level === 'month' ? bounds.start : undefined,
      seasonStart: level === 'season' ? bounds.start : undefined,
      isGoal: asGoal,
      context: soleDomain,
    })
  }, [draft, level, areas, addArea, addGoal, soleDomain, bounds.start, updateGoal, addTask, asGoal])

  const noun = NOUN[level]
  const emptyCopy = isPast ? `Nothing was on this ${noun}'s list.` : `Nothing on this ${noun}'s list yet.`

  return (
    <div className={`${PAGE_COLUMN_WIDE} py-6`}>
      {/* The same masthead card Today and Week wear: the period in the
          eyebrow, the page name as the title, the look-back cue on the quiet
          line when the period has ended. */}
      <MastheadCard
        eyebrow={(
          <PeriodNavEyebrow
            label={bounds.label}
            onPrev={() => setAnchor(bounds.prev)}
            onNext={() => setAnchor(bounds.next)}
            prevLabel={`Previous ${noun}`}
            nextLabel={`Next ${noun}`}
            trailing={isCurrent ? (
              <button type="button" onClick={() => setAnchor(bounds.prev)}
                className="ml-1 rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50 transition-colors">
                Last {noun}
              </button>
            ) : (
              <button type="button" onClick={() => setAnchor(new Date())}
                className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-full border border-primary-100 bg-primary-50 px-2 py-0.5 text-[11px] font-semibold text-primary-600 transition-colors hover:bg-primary-100">
                Back to this {noun}
              </button>
            )}
          />
        )}
        title={TITLE[level]}
        subline={isPast ? 'Look back: what got done, what didn\'t. Keep what still matters, drop the rest.' : undefined}
        // The plan pages mount outside TasksApp's chrome context, so the
        // assistant toggle isn't reachable here; the domain lens still is,
        // and this page scopes by it (soleDomain).
        controls={chrome ? <HomeChromeControls className="flex" /> : <DomainSwitcher />}
      />

      <div className="flex flex-col gap-3">
        <section aria-label={`${bounds.label} list`} className="min-w-0 rounded-xl border border-neutral-200 bg-white px-3 py-3 shadow-sm">
          {rows.length === 0 ? (
            <p className="px-2 py-3 text-sm text-neutral-400">{emptyCopy}</p>
          ) : (
            <ul className="space-y-0.5">
              {rows.map((row) => (
                <PlanRow key={row.id} row={row} onOpen={open} onAction={(a, r) => { void act(a, r) }}
                  actions={actionsFor({ fate: row.fate, isGoal: row.isGoal, isPast })} />
              ))}
            </ul>
          )}

          {!isPast && (
            <form
              className="mt-2 flex items-center gap-2 px-2"
              onSubmit={(e) => { e.preventDefault(); void submit() }}
            >
              <Plus className="w-4 h-4 shrink-0 text-neutral-400" />
              <input
                aria-label={`Add to this ${noun}`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={level === 'year' ? 'Add a goal for the year…' : `Add to this ${noun}…`}
                className="min-w-0 flex-1 bg-transparent text-sm text-neutral-800 placeholder:text-neutral-400 focus:outline-none py-1.5"
              />
              {level !== 'year' && (
                <button
                  type="button"
                  aria-pressed={asGoal}
                  aria-label="Add as a goal"
                  title={asGoal ? 'Adding as a goal' : 'Adding as a task'}
                  onClick={() => setAsGoal((v) => !v)}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                    asGoal ? 'bg-amber-50 text-amber-700' : 'text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100'
                  }`}
                >
                  <Target className="w-3.5 h-3.5" /> Goal
                </button>
              )}
            </form>
          )}
        </section>

        {above && railBounds && (
          <PlanRail
            title={TITLE[above]}
            subtitle={railBounds.label}
            rows={railRows}
            onOpen={open}
            onPullDown={level === 'month' ? pullDown : undefined}
            pullLabel="Add to this month:"
            emptyCopy={`Nothing on this ${NOUN[above]}'s list.`}
            storageKey={`symphony-plan-rail-${level}`}
          />
        )}
      </div>
    </div>
  )
}

/** Mounted at /month, /season and /year. Mounts its own GoalsProvider (the
 *  Shell tree doesn't), the way GoalsApp does. */
export function PeriodPlanPage({ level }: { level: PlanLevel }) {
  return (
    <GoalsProvider>
      <PeriodPlanPageInner level={level} />
    </GoalsProvider>
  )
}
