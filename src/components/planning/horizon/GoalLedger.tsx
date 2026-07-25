// src/components/planning/horizon/GoalLedger.tsx
//
// The year's goals as a ledger, sharing the ribbon's altitude: four columns
// that say how far each goal has actually descended.
//
//   Picked     season picks threading to this goal (bucket='quarter' + pickedAt)
//   Moves      month moves threading to it (bucket='month')
//   On a week  those that have been given a week (weekStart set)
//   Done       goalRollup, leaf-altitude only
//
// Why a ledger and not the per-goal timeline lanes the design brief asked for:
// `picked_at` only started being written on 2026-07-15. Every mark would sit
// within ten days of today, so sixteen lanes would render sixteen identical
// clusters under the today line — the same "shipped without looking" failure as
// the errand titles, one layer up. The columns are lane-shaped: when picked_at
// has two seasons of history, a lane slots in beside them without a rewrite.
//
// The column that earns its place today is **On a week**. Thirty moves are
// written and not one has a week, and no other surface in Symphony says so.
import { useMemo } from 'react'
import { ChevronRight, Target } from 'lucide-react'
import type { Task } from '@/types/task'
import type { Goal } from '@/types/goal'
import { goalRollup } from '@/lib/planning/lineage'

interface LedgerArea {
  id: string
  name: string
}

interface GoalLedgerProps {
  goals: readonly Goal[]
  areas: readonly LedgerArea[]
  /** Full task list — goalRollup reads the whole thread, across domains. */
  tasks: readonly Task[]
  /** Domain-scoped tasks — the pick/move/week counts are deliberately local,
   *  so a work goal's picks stay off the Family year page. */
  domainTasks: readonly Task[]
  onOpenGoal: (goalId: string) => void
}

interface Counts {
  picked: number
  moves: number
  onWeek: number
  done: number
  untouched: boolean
  stalled: boolean
}

function Cell({ value, stall = false }: { value: number; stall?: boolean }) {
  if (value === 0 && !stall) {
    return <span className="w-[62px] shrink-0 text-center text-xs text-neutral-300">—</span>
  }
  return (
    <span
      {...(stall ? { 'data-stall': 'true' } : {})}
      className={`w-[62px] shrink-0 text-center text-xs font-semibold ${
        stall ? 'text-amber-700' : 'text-primary-700'
      }`}
    >
      {value}
    </span>
  )
}

export function GoalLedger({ goals, areas, tasks, domainTasks, onOpenGoal }: GoalLedgerProps) {
  const countsFor = useMemo(() => {
    const map = new Map<string, Counts>()
    for (const g of goals) {
      let picked = 0
      let moves = 0
      let onWeek = 0
      for (const t of domainTasks) {
        if (t.goalId !== g.id || t.completed) continue
        if (t.bucket === 'quarter' && t.pickedAt) picked += 1
        if (t.bucket === 'month') moves += 1
        if (t.weekStart) onWeek += 1
      }
      const { done } = goalRollup(g.id, tasks)
      map.set(g.id, {
        picked,
        moves,
        onWeek,
        done,
        untouched: picked === 0 && moves === 0 && done === 0,
        // The stall: work was written but never given a week. This is the one
        // fact the year rung can tell you that nothing else does.
        stalled: moves > 0 && onWeek === 0,
      })
    }
    return map
  }, [goals, tasks, domainTasks])

  const grouped = useMemo(
    () =>
      areas
        .map((area) => ({ area, items: goals.filter((g) => g.areaId === area.id) }))
        .filter(({ items }) => items.length > 0),
    [areas, goals],
  )
  const orphans = useMemo(
    () => goals.filter((g) => !areas.some((a) => a.id === g.areaId)),
    [goals, areas],
  )

  const totals = useMemo(() => {
    let moves = 0
    let onWeek = 0
    let untouched = 0
    for (const c of countsFor.values()) {
      moves += c.moves
      onWeek += c.onWeek
      if (c.untouched) untouched += 1
    }
    return { moves, onWeek, untouched }
  }, [countsFor])

  const renderRow = (goal: Goal) => {
    const c = countsFor.get(goal.id)
    if (!c) return null
    return (
      <button
        key={goal.id}
        type="button"
        data-testid={`ledger-row-${goal.id}`}
        data-untouched={c.untouched ? 'true' : 'false'}
        onClick={() => onOpenGoal(goal.id)}
        className={`flex w-full items-center gap-3 rounded-xl border border-neutral-100 bg-white px-4 py-2.5 text-left transition-colors hover:bg-neutral-50 ${
          c.untouched ? 'opacity-60' : ''
        }`}
      >
        <Target className="mt-0.5 h-4 w-4 shrink-0 text-primary-500" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-[13px] leading-snug text-neutral-800">
          {goal.name}
        </span>
        <Cell value={c.picked} />
        <Cell value={c.moves} />
        <Cell value={c.onWeek} stall={c.stalled} />
        <Cell value={c.done} />
        <ChevronRight className="h-4 w-4 shrink-0 text-neutral-300" aria-hidden="true" />
      </button>
    )
  }

  return (
    <section>
      <header className="mb-2 flex items-baseline justify-between">
        <h2 className="font-display text-base font-semibold text-neutral-800">Goals</h2>
        <div className="flex pr-7 text-[9px] uppercase tracking-[0.08em] text-neutral-400">
          <span className="w-[62px] text-center">Picked</span>
          <span className="w-[62px] text-center">Moves</span>
          <span className="w-[62px] text-center">On a week</span>
          <span className="w-[62px] text-center">Done</span>
        </div>
      </header>

      {grouped.map(({ area, items }) => (
        <div key={area.id} className="mb-4">
          <h3 className="mb-1.5 text-[9.5px] uppercase tracking-[0.1em] text-neutral-400">
            {area.name}
          </h3>
          <div className="space-y-1">{items.map(renderRow)}</div>
        </div>
      ))}

      {orphans.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-1.5 text-[9.5px] uppercase tracking-[0.1em] text-neutral-400">
            Unfiled
          </h3>
          <div className="space-y-1">{orphans.map(renderRow)}</div>
        </div>
      )}

      {totals.moves > 0 && totals.onWeek === 0 && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-amber-900">
          <strong className="font-semibold">
            {totals.moves} move{totals.moves === 1 ? '' : 's'} written. None has a week.
          </strong>{' '}
          The descent stops at the month rung — nothing planned this season has reached a calendar.
        </p>
      )}

      {totals.untouched > 0 && (
        <p className="mt-2 text-xs text-neutral-400">
          {totals.untouched} goal{totals.untouched === 1 ? ' has' : 's have'} nothing under
          {totals.untouched === 1 ? ' it' : ' them'} yet.
        </p>
      )}
    </section>
  )
}
