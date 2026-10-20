// src/components/plan/constellation/horizonPanel.tsx
//
// A month or season goal opened from its page (spec 2026-10-14, "The pages"):
// the task panel offers what the panel otherwise has no way to say — which goal one horizon up it serves ("For …",
// changed with Move under…), "Later: {next period}" and "Back to {the list
// above}" (or "Off {period}" when nothing above holds it) — the words the
// page's rows and planning use (reviewed design, 2026-10-20). Everything else
// (done, delete, its day, wording) the panel already holds. The two period
// verbs also sit on the page's rows (periodMoves, 2026-10-16).
//
// The page is read from the URL the panel opens over — /month, /season or
// /year, with `horizon` and `start` — so the selection itself carries nothing
// new. Every write goes through the canvas activity with Undo.

import type { ReactNode } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import type { Task } from '@/types/task'
import type { Goal } from '@/types/goal'
import type { Seasons } from '@/lib/cadence/seasons'
import { parseLocalYmd } from '@/lib/cadence/config'
import { periodBounds, isCurrentPeriod, selectPeriodTasks, type PlanLevel, type PeriodBounds } from '@/lib/planning/periodPage'
import { committedTo, liveCommitments, openCommitment } from '@/lib/placement/model'
import { bootstrapCommitments } from '@/lib/placement/intentions'
import { useCanvasActivity } from '@/contexts/CanvasActivityContext'
import { MoveUnderMenu } from '@/components/canvas/plan/MoveUnderMenu'
import { planNodes } from './model'
import { eligibleParents, moveUnderPatch } from './connections'
import { isDone } from '@/components/canvas/plan/planGroups'

const ROUTE_LEVEL: Record<string, number> = { '/year': 0, '/season': 1, '/month': 2 }
const LEVELS: readonly PlanLevel[] = ['year', 'season', 'month']

/** The horizon page the URL shows (0 Year, 1 Season, 2 Month) and a day in its
 *  period, or null off those pages. Mirrors ConstellationPage's reading. */
export function horizonOnScreen(pathname: string, params: URLSearchParams, today = new Date()): { level: 0 | 1 | 2; anchor: Date } | null {
  const routeLevel = ROUTE_LEVEL[pathname]
  if (routeLevel === undefined) return null
  const h = params.get('horizon')
  const level = (h !== null && /^[0-2]$/.test(h) ? Number(h) : routeLevel) as 0 | 1 | 2
  const raw = params.get('start')
  const parsed = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? parseLocalYmd(raw) : today
  return { level, anchor: Number.isNaN(parsed.getTime()) ? today : parsed }
}

/** "October", "Fall", "2026". */
const periodWord = (label: string) => label.replace(/\s\d{4}$/, '')

/** onClick settles true once the write is saved (the review waits on it). */
export interface HorizonPanelAction { id: string; label: string; onClick: () => Promise<boolean> }

export interface HorizonPanelDeps {
  tasks: readonly Task[]
  goals: readonly Goal[]
  seasons: Seasons
  updateTask: (id: string, updates: Partial<Task>) => Promise<unknown>
  keepForward: (id: string, period: { monthStart?: Date; seasonStart?: Date }, from?: Date) => Promise<string | undefined>
  dropCommitment: (id: string, level: 'month' | 'season', periodStart: Date) => Promise<boolean>
}

type Run = ReturnType<typeof useCanvasActivity>['run']

function commitmentIsOpen(task: Task, level: 'season' | 'month', bounds: PeriodBounds, seasons: Seasons, now: Date): boolean {
  const commitment = committedTo(task, level, bounds.start, { isCurrent: isCurrentPeriod(bounds, now), seasons })
  return commitment === 'legacy' || (!!commitment && commitment.status === 'open')
}

/** What holds a goal above its period: on Month, Fall (its season goal, or
 *  the season list itself, whose start a row Fall never held is put on);
 *  on Season, the year goal it serves. */
export interface PeriodAbove { word: string; seasonStart?: Date }

/** Where a month or season row stands above its period: "Back to Fall" when
 *  something above holds it, else none ("Off October"). */
export function aboveOf(task: Task, level: 'season' | 'month', hasParent: boolean, word: string, seasonStart?: Date): PeriodAbove | undefined {
  if (level === 'season') return hasParent ? { word } : undefined
  return hasParent || openCommitment({ commitments: bootstrapCommitments(task) }, 'season') ? { word, seasonStart } : undefined
}

/** "Later: {next period}" and "Back to {above}" / "Off {period}" for a month
 *  or season goal on that period's list. The task panel and the page's row
 *  both offer them, with the same writes and the same Undo (it puts back the
 *  list of periods the task was on, planPlacement's stated list). Back to
 *  Fall puts a row Fall never held on it first, as planning's does, so it
 *  lands under its line. */
export function periodMoves(
  task: Task, level: 'season' | 'month', bounds: Pick<PeriodBounds, 'start' | 'next' | 'label'>, seasons: Seasons,
  deps: Pick<HorizonPanelDeps, 'updateTask' | 'keepForward' | 'dropCommitment'>, run: Run, above?: PeriodAbove,
): HorizonPanelAction[] {
  const name = periodWord(bounds.label)
  const nextName = periodWord(periodBounds(level, bounds.next, seasons).label)
  const before = liveCommitments({ commitments: bootstrapCommitments(task) })
  const undo = async () => (await deps.updateTask(task.id, { commitments: before })) !== false
  const offLabel = above ? `Back to ${above.word}` : `Off ${name}`
  return [
    {
      id: 'horizon-carry', label: `Later: ${nextName}`,
      onClick: () => run(`Move “${task.title}” to ${nextName}`, async () => !!await deps.keepForward(task.id, level === 'month' ? { monthStart: bounds.next } : { seasonStart: bounds.next }, bounds.start), { ids: [task.id], undo }),
    },
    {
      id: 'horizon-remove', label: offLabel,
      onClick: () => run(`${offLabel}: “${task.title}”`, async () => {
        if (level === 'month' && above?.seasonStart && !openCommitment({ commitments: bootstrapCommitments(task) }, 'season')
          && !(await deps.keepForward(task.id, { seasonStart: above.seasonStart }))) return false
        return deps.dropCommitment(task.id, level, bounds.start)
      }, { ids: [task.id], undo }),
    },
  ]
}

/** For the task panel: the "For …" line and the period verbs, when the panel
 *  is open over a Month or Season page and the task is on that page's list. */
export function useHorizonPanel(task: Task | null, deps: HorizonPanelDeps): { forLine: ReactNode; actions: HorizonPanelAction[] } {
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const { run } = useCanvasActivity()
  const where = horizonOnScreen(pathname, params)
  if (!task || !where || where.level === 0 || task.isGoal) return { forLine: null, actions: [] }

  const { tasks, goals, seasons, updateTask } = deps
  const level = LEVELS[where.level] as 'season' | 'month'
  const now = new Date()
  const bounds = periodBounds(level, where.anchor, seasons)
  const seasonB = periodBounds('season', where.anchor, seasons)
  const monthB = periodBounds('month', where.anchor, seasons)
  const year = where.anchor.getFullYear()
  // The lists as the page draws them, so "For" names what the page names.
  const nodes = planNodes(goals.filter((g) => g.year === year && g.status !== 'archived'), [
    selectPeriodTasks(tasks, 'season', seasonB.start, isCurrentPeriod(seasonB, now), null, seasons),
    selectPeriodTasks(tasks, 'month', monthB.start, isCurrentPeriod(monthB, now), null, seasons),
  ])
  const node = nodes.find((n) => n.level === where.level && n.id === task.id)
  if (!node) return { forLine: null, actions: [] }

  const parent = node.parent ? nodes.find((n) => n.key === node.parent) : undefined
  const onList = commitmentIsOpen(task, level, bounds, seasons, now)
  const above = aboveOf(task, level, !!parent, level === 'month' ? periodWord(seasonB.label) : String(year), seasonB.start)
  const actions = onList && !task.completed ? periodMoves(task, level, bounds, seasons, deps, run, above) : []

  const parents = eligibleParents(nodes, node).filter((p) => !isDone(p) || p.key === node.parent)
  const parentTerm = where.level === 1 ? 'year goal' : 'season goal'
  const moveUnder = (to: typeof parent | null) => {
    const patch = moveUnderPatch(nodes, node, to ?? null)
    if (!patch) return
    void run(to ? `Move “${task.title}” under “${to.title}”` : `Unlink “${task.title}”`, async () => (await updateTask(task.id, patch.after)) !== false, {
      ids: [task.id], undo: async () => (await updateTask(task.id, patch.before)) !== false,
    })
  }
  const forLine = <p className="plan-panel-for">
    <span className="plan-panel-for-kind">For</span>{' '}
    <span className="plan-panel-for-title">{parent ? parent.title : `no ${parentTerm}`}</span>{' '}
    <MoveUnderMenu item={node} parents={parents} parentTerm={parentTerm} onPick={moveUnder} />
  </p>
  return { forLine, actions }
}
