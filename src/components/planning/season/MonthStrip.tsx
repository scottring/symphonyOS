import type { Task } from '@/types/task'
import { seasonStart } from '@/lib/cadence/periods'

export function MonthStrip({ tasks, onOpenMonth, now = new Date() }: {
  tasks: readonly Task[]
  onOpenMonth: () => void
  now?: Date
}) {
  const start = seasonStart(now)
  const cells = [0, 1, 2].map((i) => {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1)
    const isCurrent = d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    const moves = tasks.filter((t) => {
      if (t.completed && !t.scheduledFor) return false
      if (t.scheduledFor) {
        const s = new Date(t.scheduledFor)
        return s.getMonth() === d.getMonth() && s.getFullYear() === d.getFullYear()
      }
      return isCurrent && t.bucket === 'month'
    })
    const done = moves.filter((t) => t.completed).length
    return {
      key: d.toISOString(),
      label: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
      count: moves.length, done, isCurrent,
    }
  })
  return (
    <div className="grid grid-cols-3 gap-3">
      {cells.map((c) => (
        <button key={c.key} type="button" onClick={onOpenMonth}
          className={`rounded-xl border px-4 py-3 text-left transition-colors hover:bg-neutral-50 ${
            c.isCurrent ? 'border-primary-200 bg-primary-50/30' : 'border-neutral-100 bg-white'
          }`}>
          <span className="block text-[11px] tracking-wide font-medium text-neutral-500">{c.label}</span>
          <span className="block mt-1 text-sm text-neutral-800">
            {c.count === 0 ? 'no moves' : `${c.count} move${c.count === 1 ? '' : 's'}`}
          </span>
          {c.count > 0 && (
            <span className="mt-1.5 block h-1 rounded-full bg-neutral-100 overflow-hidden">
              <span className="block h-full bg-primary-400" style={{ width: `${Math.round((c.done / c.count) * 100)}%` }} />
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
