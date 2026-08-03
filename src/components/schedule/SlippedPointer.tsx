import { useMemo } from 'react'
import { Archive } from 'lucide-react'
import type { Task } from '@/types/task'

interface SlippedPointerProps {
  tasks: Task[]
  onReview: () => void
}

/** Whole days between a past date and now, both floored to local midnight. */
function ageInDays(scheduledFor: Date): number {
  const a = new Date(scheduledFor)
  a.setHours(0, 0, 0, 0)
  const b = new Date()
  b.setHours(0, 0, 0, 0)
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

/**
 * One line closing Today's carried-over lane: "35 slipped · oldest 245 days".
 *
 * The floor guarantee. Expiry means work leaves Today on its own, so the
 * pointer back to it must be impossible to lose: whenever the slipped queue is
 * non-empty this renders, it never expands inline, and it has no dismiss
 * control. That is the whole answer to "will something important get
 * permanently buried".
 */
export function SlippedPointer({ tasks, onReview }: SlippedPointerProps) {
  const oldestDays = useMemo(() => {
    let max = 0
    for (const t of tasks) {
      if (!t.scheduledFor) continue
      const days = ageInDays(t.scheduledFor)
      if (days > max) max = days
    }
    return max
  }, [tasks])

  if (tasks.length === 0) return null

  return (
    <button
      type="button"
      onClick={onReview}
      className="w-full flex items-center gap-2 px-3 md:px-0 py-2 mt-1 text-left text-[13px] text-neutral-500 hover:text-neutral-700 transition-colors"
    >
      <Archive className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
      <span className="font-medium text-neutral-600 shrink-0">
        {tasks.length} slipped
      </span>
      <span className="text-neutral-400 shrink-0">· oldest {oldestDays} days</span>
      <span className="ml-auto text-primary-600 shrink-0">Review</span>
    </button>
  )
}
