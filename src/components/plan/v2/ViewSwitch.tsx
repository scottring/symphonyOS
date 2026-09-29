// src/components/plan/v2/ViewSwitch.tsx
//
// List · With <level above> · One at a time — the same three views on every
// horizon, as icons (2026-09-29). The words stay in the tooltip and the
// accessible name, and "With September" keeps the period's name there: the
// reference column's own heading names it too.

import { List, Columns2, SquareStack } from 'lucide-react'
import type { PlanView } from '@/lib/planning/v2/planV2'

const ICONS = { list: List, ref: Columns2, focus: SquareStack } as const

export function ViewSwitch({ view, onChange, aboveName, withRef = true }: {
  view: PlanView
  onChange: (v: PlanView) => void
  /** The level above ("September", "Fall"); omitted where there is none (Year). */
  aboveName?: string
  withRef?: boolean
}) {
  const views: [PlanView, string][] = [
    ['list', 'List'],
    ...(withRef && aboveName ? [['ref', `With ${aboveName}`] as [PlanView, string]] : []),
    ['focus', 'One at a time'],
  ]
  return (
    <div className="pv2-seg is-icons" role="group" aria-label="View">
      {views.map(([v, label]) => {
        const Icon = ICONS[v]
        return (
          <button key={v} type="button" aria-pressed={view === v} aria-label={label} title={label} onClick={() => onChange(v)}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
}
