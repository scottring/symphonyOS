// Emits a goal with its steps, with the app's BUILT stylesheet inlined, so the
// indentation can be measured in a real browser. happy-dom does no layout, so
// "is the child's title to the right of its parent's" is not a question the
// test suite can answer.
//
//   npm run build
//   npx vitest run --config outputs/plan-hierarchy/vitest.config.mts
//   node outputs/plan-hierarchy/check-indent.mjs
import { it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PlanRow, type PlanRowModel } from '@/components/plan/PlanRow'
import { PlanWeekMenu } from '@/components/plan/PlanWeekMenu'
import type { RowAction } from '@/lib/planning/periodPage'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const noop = () => {}

const step = (id: string, title: string): PlanRowModel =>
  ({ id, title, isGoal: false, kind: 'task', fate: 'open' })

const goal = (id: string, title: string, steps: PlanRowModel[] = []): PlanRowModel =>
  ({ id, title, isGoal: true, kind: 'task', fate: 'open', steps })

/** The persistent timing control exactly as a plan row mounts it. */
const planWeek = (row: PlanRowModel) => (
  <PlanWeekMenu
    size="sm"
    title={row.title}
    periodStart={new Date(2026, 10, 1)}
    periodLabel="November"
    timing={{ day: null, timed: false, week: null, weekOfDay: null }}
    currentWeekStart={null}
    onPickWeek={() => {}}
    onPickDay={() => {}}
  />
)

/** What a live month row is offered — including the shortcut that overlapped. */
const TASK_ACTIONS: RowAction[] = ['complete', 'to-lower', 'today', 'drop']

it('emits a goal, its steps and its siblings for measurement', () => {
  const assets = join(root, 'dist', 'assets')
  const cssFile = readdirSync(assets).filter((f) => f.endsWith('.css')).sort()[0]
  if (!cssFile) throw new Error('no built stylesheet in dist/assets — run npm run build first')

  const body = renderToStaticMarkup(
    <div className="period-plan-page">
      <section className="period-goals-card">
        <ul>
          <PlanRow
            row={goal('g1', 'GOAL WITH STEPS', [step('s1', 'STEP ONE'), step('s2', 'STEP TWO')])}
            actions={[]} onAction={noop} onOpen={noop} expanded onToggleExpand={noop} onAddStep={noop}
            stepActionsFor={() => TASK_ACTIONS}
            planWeek={planWeek}
            timingReachesLower
          />
          {/* A goal with no disclosure of its own — a year row, or a completed
              one. Its title must still start where its siblings' do. */}
          <PlanRow row={{ ...goal('g2', 'GOAL WITHOUT STEPS'), kind: 'goal' }}
            actions={[]} onAction={noop} onOpen={noop} />
        </ul>
      </section>
    </div>,
  )

  writeFileSync(join(here, 'plan-rows.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Plan rows</title>
<style>${readFileSync(join(assets, cssFile), 'utf8')}</style>
</head><body>${body}</body></html>`)
})
