// Reading the level above (spec 2026-11-01): Month's "Read the season list",
// and the Week's "Read November" (ReadMonth). Each goal above with where it
// stands and what is planned under it, so it is plain which goals have
// nothing yet. For reading only: nothing here writes.

import type { ChooseItemView, ChooseLineView } from '@/components/plan/choose/ChoosePlan'

export function ReadAbove({ aboveWord, lines, doneLines }: {
  /** "Fall", "November" */
  aboveWord: string
  /** The open goals above (ChoosePlan's lines), already filtered as the page is. */
  lines: readonly ChooseLineView[]
  doneLines: readonly ChooseLineView[]
}) {
  const steps = (items: readonly ChooseItemView[]) => <ul className="gw-steps">
    {items.map((s) => <li key={s.key} className={s.planned.kind === 'done' ? 'is-done' : undefined}>
      <span className="gw-step-title">{s.title}</span> <span className="gw-row-note">{s.planned.label}</span>
      {s.children.length > 0 && steps(s.children)}
    </li>)}
  </ul>

  return <div className="gw-body">
    {lines.length === 0 ? <p className="choose-empty">{doneLines.length ? `Every ${aboveWord} goal is done.` : `Nothing on ${aboveWord} yet.`}</p>
      : <ul className="gw-rows" aria-label={`${aboveWord} goals`}>
        {lines.map((l) => <li key={l.key} className="gw-row" aria-label={l.title}>
          <span className="gw-row-title">{l.title}</span>
          {l.counts && <span className="gw-row-note">{l.counts}</span>}
          {l.steps.length > 0 ? steps(l.steps) : <span className="gw-row-note">Nothing under it yet</span>}
        </li>)}
      </ul>}
    {doneLines.length > 0 && lines.length > 0 && <p className="choose-was">{doneLines.length} done on {aboveWord}</p>}
  </div>
}
