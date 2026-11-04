// src/components/plan/constellation/horizonPanel.tsx
//
// A month or season item opened from its page (paper-style horizons,
// 2026-11-04): the task panel acts on THIS period only — "Later: {next
// period}" carries it on, "Let go" ends this period's commitment. It shows and
// sets no ties (the page no longer draws them) and does not move the item to
// the level above. Everything else (done, delete, its day, wording) the panel
// already holds. The two verbs also serve planning's Choose cards (periodMoves).
//
// The page is read from the URL the panel opens over — /month, /season or
// /year, with `horizon` and `start` — so the selection itself carries nothing
// new. Every write goes through the canvas activity with Undo.

import { useLocation, useSearchParams } from 'react-router-dom'
import type { Task } from '@/types/task'
import type { Seasons } from '@/lib/cadence/seasons'
import { parseLocalYmd } from '@/lib/cadence/config'
import { periodBounds, isCurrentPeriod, type PlanLevel, type PeriodBounds } from '@/lib/planning/periodPage'
import { committedTo, liveCommitments } from '@/lib/placement/model'
import { bootstrapCommitments } from '@/lib/placement/intentions'
import { useCanvasActivity } from '@/contexts/CanvasActivityContext'
import { placementOf } from '@/lib/planning/placement'

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

/** "Later: {next period}" and "Let go" for a month or season item on that
 *  period's list. The task panel and planning's cards offer them, with the
 *  same writes and the same Undo (it puts back the periods the task was on,
 *  planPlacement's stated list). Let go ends THIS period's commitment only;
 *  if it was the item's last open commitment, the item goes to Someday. */
export function periodMoves(
  task: Task, level: 'season' | 'month', bounds: Pick<PeriodBounds, 'start' | 'next' | 'label'>, seasons: Seasons,
  deps: Pick<HorizonPanelDeps, 'updateTask' | 'keepForward' | 'dropCommitment'>, run: Run,
): HorizonPanelAction[] {
  const nextName = periodWord(periodBounds(level, bounds.next, seasons).label)
  const before = liveCommitments({ commitments: bootstrapCommitments(task) })
  const undo = async () => (await deps.updateTask(task.id, { commitments: before })) !== false
  const lastOpen = before.filter((c) => c.status === 'open').length <= 1
  const undoToSomeday = async () => (await deps.updateTask(task.id, { ...placementOf(task), commitments: before })) !== false
  return [
    {
      id: 'horizon-carry', label: `Later: ${nextName}`,
      onClick: () => run(`Move “${task.title}” to ${nextName}`, async () => !!await deps.keepForward(task.id, level === 'month' ? { monthStart: bounds.next } : { seasonStart: bounds.next }, bounds.start), { ids: [task.id], undo }),
    },
    {
      id: 'horizon-remove', label: 'Let go',
      onClick: () => run(`Let go: “${task.title}”`, async () => {
        if (lastOpen) return (await deps.updateTask(task.id, { bucket: 'someday', scheduledFor: undefined })) !== false
        return deps.dropCommitment(task.id, level, bounds.start)
      }, { ids: [task.id], undo: lastOpen ? undoToSomeday : undo }),
    },
  ]
}

/** For the task panel: the period verbs, when the panel is open over a Month
 *  or Season page and the task is on that page's list. */
export function useHorizonPanel(task: Task | null, deps: HorizonPanelDeps): { actions: HorizonPanelAction[] } {
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const { run } = useCanvasActivity()
  const where = horizonOnScreen(pathname, params)
  if (!task || !where || where.level === 0 || task.isGoal) return { actions: [] }

  const { seasons } = deps
  const level = LEVELS[where.level] as 'season' | 'month'
  const bounds = periodBounds(level, where.anchor, seasons)
  const onList = commitmentIsOpen(task, level, bounds, seasons, new Date())
  return { actions: onList && !task.completed ? periodMoves(task, level, bounds, seasons, deps, run) : [] }
}
