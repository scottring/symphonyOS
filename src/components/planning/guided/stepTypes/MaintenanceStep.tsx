// src/components/planning/guided/stepTypes/MaintenanceStep.tsx
//
// The month session's life-maintenance sweep (Best Laid Plans): a durable
// "Monthly upkeep" List is the template; this step pulls chosen items onto
// the month as ordinary moves. The template is never mutated here — edit it
// in the Lists UI. First run seeds the template (host.ensureUpkeepList).
import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Plus, Wrench } from 'lucide-react'
import { useGuided } from '../GuidedContext'

export function MaintenanceStep() {
  const { host } = useGuided()
  const [added, setAdded] = useState<Set<string>>(new Set())

  // Idempotent: creates + seeds only when the list is absent.
  useEffect(() => { void host.ensureUpkeepList() }, [host])

  const openMonthTitles = useMemo(
    () => new Set(host.tasks
      .filter((t) => !t.completed && t.bucket === 'month')
      .map((t) => t.title.trim().toLowerCase())),
    [host.tasks],
  )

  if (host.upkeepLoading) {
    return <p className="text-sm text-neutral-400">Loading your upkeep list…</p>
  }
  if (host.upkeepItems.length === 0) {
    return (
      <p className="text-sm text-neutral-400">
        Your upkeep template is empty — add the recurring chores of adulthood to the
        &ldquo;Monthly upkeep&rdquo; list and they&rsquo;ll appear here every month.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-neutral-400 inline-flex items-center gap-1.5">
        <Wrench className="w-3.5 h-3.5" />
        Your template — edit it anytime in Lists. Pull this month&rsquo;s picks onto the list.
      </p>
      <ul className="space-y-1.5">
        {host.upkeepItems.map((item) => {
          const key = item.text.trim().toLowerCase()
          const onList = added.has(key) || openMonthTitles.has(key)
          return (
            <li key={item.id}
              className="flex items-center gap-2 rounded-lg bg-neutral-50/70 px-3 py-2 text-sm text-neutral-700">
              <span className="flex-1 min-w-0">{item.text}</span>
              {onList ? (
                <span className="inline-flex items-center gap-1 text-xs text-primary-600 shrink-0">
                  <CheckCircle2 className="w-3.5 h-3.5" /> On the list
                </span>
              ) : (
                <button type="button"
                  onClick={() => {
                    setAdded((s) => new Set(s).add(key))
                    void host.createTaskInBucket(item.text, 'month')
                  }}
                  className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-primary-600 hover:bg-primary-50 rounded-md px-2 py-1 transition-colors shrink-0">
                  <Plus className="w-3.5 h-3.5" /> Add to month
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
