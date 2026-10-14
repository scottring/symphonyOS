// A kid's Math of the day, for the grown-ups (Scott, 2026-10-14): on their
// page in the app, the last four weeks — level and results per problem type,
// the type that needs the most help, and the recent days. Read-only; the
// kitchen wall is where the problems are made and solved.

import type { MathSummary, DayResult } from '@/lib/wall/math/mathHistory'
import { parseLocalYmd } from '@/lib/cadence/config'
import { topicLabels } from '@/lib/wall/math/mathTopics'
import { SUMMARY_DAYS } from '@/lib/wall/math/mathHistory'

const RESULT_TONE: Record<DayResult, string> = {
  'Solved': 'bg-emerald-50 text-emerald-700',
  'Solved after the hint': 'bg-amber-50 text-amber-700',
  'Shown the answer': 'bg-rose-50 text-rose-700',
  'Working on it': 'bg-sky-50 text-sky-700',
  'Not finished': 'bg-neutral-100 text-neutral-500',
  'Not tried': 'bg-neutral-100 text-neutral-500',
}

const dayLabel = (ymd: string) => parseLocalYmd(ymd).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

export function KidMathSection({ name, summary, topics, loading }: { name: string; summary: MathSummary | null; topics: string[]; loading: boolean }) {
  const heading = <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-400 mb-2">Math of the day</h2>
  if (loading) return <section className="mb-6">{heading}<p className="text-sm text-neutral-400">Loading…</p></section>
  if (!summary) {
    return (
      <section className="mb-6">
        {heading}
        <p className="text-sm text-neutral-400">No math problems yet. {name}’s first one appears on the kitchen wall.</p>
      </section>
    )
  }
  const tried = summary.kinds.filter((k) => k.solved + k.revealed > 0)
  const hardest = summary.kinds.find((k) => k.kind === summary.hardest)
  return (
    <section className="mb-6" aria-label={`${name}’s Math of the day`}>
      {heading}
      <p className="text-sm text-neutral-700 mb-3">
        <span className="font-medium">★ {summary.streak} {summary.streak === 1 ? 'day' : 'days'} in a row</span>
        {summary.bonusSolved > 0 && <span className="text-neutral-500"> · {summary.bonusSolved} bonus solved in {SUMMARY_DAYS} days</span>}
        {topics.length > 0 && <span className="text-neutral-500"> · stories about {topicLabels(topics).join(', ').toLowerCase()}</span>}
      </p>

      {hardest && (
        <p className="text-sm rounded-lg bg-amber-50 text-amber-800 px-3 py-2 mb-3">
          {hardest.label} needs the most help lately: {hardest.revealed} shown the answer, {hardest.hinted} solved after the hint, out of {hardest.solved + hardest.revealed}.
        </p>
      )}

      {tried.length > 0 && (
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-left text-xs text-neutral-400">
                <th className="font-medium py-1 pr-3">Type</th>
                <th className="font-medium py-1 pr-3">Level</th>
                <th className="font-medium py-1 pr-3">Solved</th>
                <th className="font-medium py-1 pr-3">After hint</th>
                <th className="font-medium py-1">Shown answer</th>
              </tr>
            </thead>
            <tbody>
              {tried.map((k) => (
                <tr key={k.kind} className={`border-t border-neutral-100 ${k.kind === summary.hardest ? 'text-amber-800' : 'text-neutral-800'}`}>
                  <td className="py-1.5 pr-3">{k.label}</td>
                  <td className="py-1.5 pr-3">{k.level} of 5</td>
                  <td className="py-1.5 pr-3">{k.solved - k.hinted}</td>
                  <td className="py-1.5 pr-3">{k.hinted}</td>
                  <td className="py-1.5">{k.revealed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ul className="space-y-1.5">
        {summary.recent.map((d) => (
          <li key={d.forDate} className="flex items-center gap-3 text-sm">
            <span className="w-24 shrink-0 text-neutral-400">{dayLabel(d.forDate)}</span>
            <span className="flex-1 min-w-0 text-neutral-800 truncate">
              {d.label}: {d.problem} = {d.answer}
              {d.bonus > 0 && <span className="text-neutral-400"> · +{d.bonus} bonus</span>}
            </span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${RESULT_TONE[d.result]}`}>{d.result}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
