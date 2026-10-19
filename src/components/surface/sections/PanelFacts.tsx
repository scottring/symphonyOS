import type { ReactNode } from 'react'

export interface PanelFact {
  id: string
  label: string
  /** The value, usually the control that changes it. Null leaves the row out. */
  value: ReactNode
}

/**
 * What the item IS, as labeled rows under the title: When, Who, Where, Area,
 * Goal. Every panel kind states its facts the same way, in the same order.
 *
 * These used to be a scatter of unlabeled controls — a date chip on its own
 * line, "Part of a goal… / Make it a goal" links on another, and a tag icon
 * beside a pair of initials further down that said nothing unless you hovered
 * them (detail pane standard, 2026-10-19). A label beside each value says what
 * it is; the value itself is still the thing you click to change it.
 */
export function PanelFacts({ facts }: { facts: PanelFact[] }) {
  const rows = facts.filter((f) => f.value != null && f.value !== false)
  if (rows.length === 0) return null
  return (
    <dl className="panel-facts mt-3 grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-0.5">
      {rows.map((f) => (
        <div key={f.id} data-fact={f.id} className="contents">
          <dt className="flex min-h-[34px] items-center text-[13px] text-neutral-500">{f.label}</dt>
          <dd className="m-0 flex min-h-[34px] min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-neutral-800">
            {f.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}
