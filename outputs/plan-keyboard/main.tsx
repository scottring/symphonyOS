// A HYDRATED dense goals list, in a real browser.
//
// Codex, 2026-09-24: "static geometry is not enough". outputs/plan-dense
// renders the same components to static markup and measures the layout; this
// one mounts React and is driven with real Tab / Enter / Space / Escape keys,
// so the questions a DOM without layout cannot answer — does the focus ring
// actually paint, is the focused control on screen at 390px — get a real
// answer.
//
// The COMPONENTS are the app's own (PlanRow, GoalParentLink, goalListView).
// The state around them is this harness's, written to match what
// PeriodPlanPage does with the same pieces; the page's own wiring is covered
// by the hydrated tests in PeriodPlanPage.test.tsx. Nothing here reads or
// writes the shared demo account.
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { PlanRow, type PlanRowModel } from '@/components/plan/PlanRow'
import { GoalParentLink, GoalStatusControl } from '@/components/plan/GoalParentLink'
import { goalListView, hiddenLabel, clearFilterOnEscape } from '@/lib/planning/goalListView'
// No stylesheet import: the checker injects the app's BUILT css (dist/assets),
// so what is measured is exactly the CSS production serves.

const noop = () => {}
const step = (id: string, title: string, done = false): PlanRowModel =>
  ({ id, title, isGoal: false, kind: 'task', fate: done ? 'done' : 'open' })

/** 30 goals, one with 60 steps — the acceptance shape. */
const GOALS: PlanRowModel[] = [
  {
    id: 'g-big', isGoal: true, kind: 'task', fate: 'open',
    title: 'Record the album — a deliberately long goal title that has to wrap on a narrow screen without pushing the status control off the row',
    steps: Array.from({ length: 60 }, (_, i) => step(`big-${i}`, `Album step ${i}`, i % 4 === 0)),
    supports: { id: 'sg', title: 'A season of music', rung: 'season', period: 'Fall 2026' },
  },
  ...Array.from({ length: 29 }, (_, k) => {
    const g = k + 1
    return {
      id: `g${g}`, title: `Goal number ${g}`, isGoal: true, kind: 'task', fate: 'open',
      steps: Array.from({ length: g % 5 }, (_, i) => step(`g${g}-s${i}`, `Step ${i} of goal ${g}`, i === 0)),
    } as PlanRowModel
  }),
]

function DenseList() {
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const [showCompleted, setShowCompleted] = useState(false)
  const view = goalListView(GOALS, [], { query, expanded, revealed, showCompleted })
  const hidden = hiddenLabel(view)
  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  }
  return (
    <div className="period-plan-page">
      <section className="period-goals-card" aria-label="September goals">
        <div className="period-goals-tools">
          <input
            type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={clearFilterOnEscape(query, () => setQuery(''))}
            aria-label="Filter September 2026 goals and steps"
            placeholder="Filter goals and steps…" className="period-goals-filter"
          />
          <button type="button" className="period-goals-toggle" onClick={() => setShowCompleted((v) => !v)}>
            {showCompleted ? 'Hide completed steps' : 'Show completed steps'}
          </button>
        </div>
        {hidden && <p role="status" className="period-goals-hidden">{hidden}. Filtering does not change what will be saved.</p>}
        <ul>
          {view.goals.map((g) => (
            <PlanRow
              key={g.row.id} row={g.row} actions={['complete', 'drop']} onAction={noop} onOpen={noop}
              expanded={g.expanded}
              onToggleExpand={(row) => setExpanded((s) => toggle(s, row.id))}
              onAddStep={noop}
              stepActionsFor={() => ['complete']}
              stepsToDraw={g.steps} counts={g.counts} hiddenByReveal={g.hiddenByReveal}
              hiddenByFilter={g.hiddenByFilter}
              onShowAllSteps={(row) => setRevealed((s) => new Set(s).add(row.id))}
              planWeek={() => <button type="button" className="plan-timing-trigger">Choose when ▾</button>}
              timingReachesLower
              goalControls={(
                <span className="goal-head-controls">
                  <GoalParentLink goalTitle={g.row.title} rungLabel="a season goal"
                    current={g.row.supports ?? null}
                    choices={[{ id: 'sg', title: 'A season of music' }]}
                    onLink={async () => true} onUnlink={async () => true} />
                  <GoalStatusControl goalTitle={g.row.title} status="active" onChange={async () => true} />
                </span>
              )}
            />
          ))}
        </ul>
      </section>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><DenseList /></StrictMode>)
