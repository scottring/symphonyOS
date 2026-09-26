// src/components/plan/NextLevelStrip.tsx
//
// "Plan work for a week" — the periods one rung down, with how much is on each
// and a way to open it (lib/planning/nextLevel). The month page ends here once
// its work has weeks, instead of folding everything away with no next step.

import { ArrowRight } from 'lucide-react'
import type { NextLevelChoice } from '@/lib/planning/nextLevel'

const NOUN: Record<NextLevelChoice['level'], string> = { week: 'week', month: 'month', season: 'season' }

export function NextLevelStrip({ heading, note, choices, onOpen }: {
  heading: string
  note: string
  choices: readonly NextLevelChoice[]
  onOpen: (choice: NextLevelChoice) => void
}) {
  if (choices.length === 0) return null
  return (
    <section aria-label={heading} className="period-next-level mt-4">
      <h2 className="px-1 font-display text-xl text-neutral-800">{heading}</h2>
      <p className="period-section-note">{note}</p>
      <ul className="mt-2 divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-bg-elevated">
        {choices.map((c) => {
          const noun = NOUN[c.level]
          const count = c.open === 0 ? 'nothing on its list yet' : `${c.open} on its list`
          return (
            <li key={c.href} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <span className="min-w-0 flex-1 text-[15px] text-neutral-800">
                {c.label}
                {c.current && <span className="ml-1.5 text-[12px] text-primary-700">this {noun}</span>}
                <span className="block text-[12px] text-neutral-500">{count}</span>
              </span>
              <button
                type="button"
                onClick={() => onOpen(c)}
                aria-label={`Open the ${noun} of ${c.label} — ${count}`}
                className="inline-flex min-h-[44px] items-center gap-1 rounded-md px-2 text-sm font-medium text-primary-700 hover:bg-primary-50 sm:min-h-0 sm:py-1"
              >
                Open {noun}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
