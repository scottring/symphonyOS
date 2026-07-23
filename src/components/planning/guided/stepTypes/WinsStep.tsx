// src/components/planning/guided/stepTypes/WinsStep.tsx
//
// The month session's opening beat (Best Laid Plans): start from evidence,
// not guilt. Read-only list of what actually got closed this month — the
// same "win" shape as MonthPage's masthead monthDoneCount (kept separate;
// the spread page is its own artifact): completed AND (still bucket='month',
// finished before ever hitting a day, OR scheduled inside the period).
import { useMemo } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { makeAssigneeFilter } from '@/lib/today/assigneeFilter'
import { useGuided } from '../GuidedContext'

export function WinsStep() {
  const { host, periodStart, periodEnd } = useGuided()
  const match = useMemo(() => makeAssigneeFilter([]), [])

  const wins = useMemo(
    () => host.tasks.filter((t) => {
      if (!t.completed || !match(t.assignedTo, t.assignedToAll)) return false
      if (t.bucket === 'month') return true
      if (!t.scheduledFor) return false
      const d = new Date(t.scheduledFor)
      return d >= periodStart && d <= periodEnd
    }),
    [host.tasks, match, periodStart, periodEnd],
  )

  if (wins.length === 0) {
    return (
      <p className="text-sm text-neutral-400">
        Nothing closed out yet — that&rsquo;s what this month is for. The wins land here next time.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-neutral-700">
        You closed {wins.length} {wins.length === 1 ? 'move' : 'moves'} this month.
      </p>
      <ul className="space-y-1.5">
        {wins.map((t) => (
          <li key={t.id} className="flex items-start gap-2 text-sm text-neutral-600">
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-primary-500" />
            <span className="min-w-0">{t.title}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
