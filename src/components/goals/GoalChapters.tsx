import { Check } from 'lucide-react'
import type { Task } from '@/types/task'
import { goalChapters } from '@/lib/planning/betPulse'

/** The goal's story across seasons — which bet each season carried for it. */
export function GoalChapters({ goalId, tasks }: { goalId: string; tasks: readonly Task[] }) {
  const chapters = goalChapters(goalId, tasks)
  if (chapters.length === 0) return null
  return (
    <section className="mt-6">
      <h3 className="font-display text-sm tracking-wide text-neutral-400 uppercase mb-2">Chapters</h3>
      <ul className="space-y-1.5">
        {chapters.map(({ label, bet, state }) => (
          <li key={bet.id} className="flex items-center gap-2 text-sm">
            <span className="w-24 shrink-0 text-[11px] text-neutral-400">{label}</span>
            <span className="flex-1 min-w-0 text-neutral-700 truncate">{bet.title}</span>
            {state === 'won' && <Check className="w-3.5 h-3.5 text-primary-500 shrink-0" strokeWidth={3} />}
          </li>
        ))}
      </ul>
    </section>
  )
}
