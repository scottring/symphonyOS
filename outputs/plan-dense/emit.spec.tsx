// A dense goals list, rendered to a self-contained page with the app's BUILT
// stylesheet, so the layout can be measured in a real browser WITHOUT seeding
// anything into the shared demo account (Codex: another session is using it).
//
//   npm run build
//   npx vitest run --config outputs/plan-dense/vitest.config.mts
//   node outputs/plan-dense/check-dense.mjs
import { it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PlanRow, type PlanRowModel } from '@/components/plan/PlanRow'
import { GoalParentLink, GoalStatusControl } from '@/components/plan/GoalParentLink'
import { goalListView } from '@/lib/planning/goalListView'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const noop = () => {}

const step = (id: string, title: string, done = false): PlanRowModel =>
  ({ id, title, isGoal: false, kind: 'task', fate: done ? 'done' : 'open' })

/** 30 goals, 200 tasks, one goal with 60 steps — the acceptance shape. */
function dense(): PlanRowModel[] {
  const goals: PlanRowModel[] = [{
    id: 'g-big', isGoal: true, kind: 'task', fate: 'open',
    title: 'Record the album — a deliberately long goal title that has to wrap on a narrow screen without pushing the status control off the row',
    steps: Array.from({ length: 60 }, (_, i) => step(`big-${i}`, `Album step ${i}`, i % 4 === 0)),
    supports: { id: 'sg', title: 'A season of music', rung: 'season', period: 'Fall 2026' },
  }]
  for (let g = 1; g < 30; g++) {
    goals.push({
      id: `g${g}`, title: `Goal number ${g}`, isGoal: true, kind: 'task', fate: 'open',
      steps: Array.from({ length: g % 5 }, (_, i) => step(`g${g}-s${i}`, `Step ${i} of goal ${g}`, i === 0)),
    })
  }
  return goals
}

it('emits the dense goals list for measurement', () => {
  const assets = join(root, 'dist', 'assets')
  const cssFile = readdirSync(assets).filter((f) => f.endsWith('.css')).sort()[0]
  if (!cssFile) throw new Error('no built stylesheet in dist/assets — run npm run build first')

  const goals = dense()
  // Every goal open, so the steps are on the page and can be measured.
  const view = goalListView(goals, [], {
    showCompleted: true,
    expanded: new Set(goals.map((g) => g.id)),
  })

  const body = renderToStaticMarkup(
    <div className="period-plan-page">
      <section className="period-goals-card">
        <div className="period-goals-tools">
          <input type="search" aria-label="Filter October goals and steps" placeholder="Filter goals and steps…" className="period-goals-filter" />
          <button type="button" className="period-goals-toggle">Hide completed steps</button>
        </div>
        <ul>
          {view.goals.map((g) => (
            <PlanRow
              key={g.row.id} row={g.row} actions={[]} onAction={noop} onOpen={noop}
              expanded onToggleExpand={noop} onAddStep={noop} stepActionsFor={() => []}
              stepsToDraw={g.steps} counts={g.counts} hiddenByReveal={g.hiddenByReveal}
              onShowAllSteps={noop}
              planWeek={() => <button type="button" className="plan-timing-trigger">Choose when ▾</button>}
              timingReachesLower
              goalControls={(
                <span className="goal-head-controls">
                  <GoalParentLink goalTitle={g.row.title} rungLabel="a season goal"
                    current={g.row.supports ?? null}
                    choices={[{ id: 'sg', title: 'A season of music' }]}
                    onLink={noop} onUnlink={noop} />
                  <GoalStatusControl goalTitle={g.row.title} status="active" onChange={noop} />
                </span>
              )}
            />
          ))}
        </ul>
      </section>
    </div>,
  )

  writeFileSync(join(here, 'dense-goals.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Dense goals</title>
<style>${readFileSync(join(assets, cssFile), 'utf8')}</style>
</head><body>${body}</body></html>`)
})
