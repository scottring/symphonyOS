// A line on a season's or a year's list, in large type (Scott, 2026-10-04:
// "larger fonts … for the season and year pages"): a box to tick by hand,
// the words (open the details), the ⋯ menu, and under it what the level
// below wrote for it, by period — "OCT  Make a budget". A line with nothing
// under it hasn't been started, and stands out when the list is reviewed.
import { Check } from 'lucide-react'
import type { LineActions, LineVM } from './PlanLine'
import { LineMenu } from './PlanLine'
import type { WrittenGroup } from '@/lib/week/monthLinks'

export function LineCard({ vm, actions, nextLabel, did = [], variant = 'card' }: {
  vm: LineVM
  actions: LineActions
  nextLabel: string
  did?: WrittenGroup[]
  /** 'card' — the season's brainstorm board; 'row' — the year's list. */
  variant?: 'card' | 'row'
}) {
  const t = vm.task
  const done = !!t.completed
  return (
    <li className={`ps-line is-${variant}${done ? ' is-done' : ''}${vm.fate !== 'open' && vm.fate !== 'done' ? ' is-muted' : ''}`}>
      <div className="ps-line-main">
        <button type="button" className={`ps-tick${done ? ' is-on' : ''}`} aria-label={done ? `Mark ${t.title} not done` : `Complete ${t.title}`} onClick={() => actions.done(t)}>
          {done && <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />}
        </button>
        <button type="button" className="ps-line-title" onClick={() => actions.details(t)}>{t.title}</button>
        <span className="ps-line-menu"><LineMenu vm={vm} actions={actions} nextLabel={nextLabel} /></span>
      </div>
      {vm.carriedFrom && <p className="ps-line-from">carried from {vm.carriedFrom}</p>}
      {did.length > 0 && (
        <p className="ps-did">{did.map((g) => (
          <span key={g.label} className="ps-did-group"><b>{g.label}</b>{g.items.map((d, i) => (
            <span key={d.id}>{i > 0 && ' · '}<span className={d.done ? 'is-done' : undefined}>{d.title}</span></span>
          ))}</span>
        ))}</p>
      )}
    </li>
  )
}
