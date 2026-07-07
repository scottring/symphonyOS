/**
 * TodayProgress — a calm, rewarding progress band for the Today view.
 *
 * Shows how far you've come today (not just what's left), with momentum-aware
 * copy from progressReward(). On completion it becomes a quiet celebration
 * rather than the same flat "list" — the earned moment the old view never had.
 */
import { CheckCircle2, Sparkles } from 'lucide-react'
import { progressReward } from '@/lib/today/progressReward'

interface TodayProgressProps {
  completedCount: number
  actionableCount: number
  /** Only render the reward framing for the actual current day. */
  isToday: boolean
}

export function TodayProgress({ completedCount, actionableCount, isToday }: TodayProgressProps) {
  if (!isToday) return null

  const r = progressReward(completedCount, actionableCount)

  // A clear day with nothing scheduled gets no band — the list's own empty
  // state speaks for it.
  if (r.empty) return null

  // One-line band: headline · rail · count. Keeping the whole momentum story
  // to a single row is what lets the Up Next hero sit above the fold.
  return (
    <div className="flex items-center gap-3 min-w-0">
      {r.complete ? (
        <CheckCircle2 className="w-5 h-5 text-primary-600 shrink-0" />
      ) : (
        <Sparkles className="w-5 h-5 text-primary-500/70 shrink-0" />
      )}

      <h2 className="font-display text-lg md:text-xl leading-tight text-neutral-900 shrink-0 truncate max-w-[14rem]">
        {r.headline}
      </h2>

      {/* Progress rail — inline, takes the slack */}
      <div className="hidden sm:block flex-1 min-w-[4rem] h-1.5 rounded-full bg-neutral-200/70 overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] duration-700 ease-out ${
            r.complete ? 'bg-primary-600' : 'bg-primary-500/80'
          }`}
          style={{ width: `${r.pct}%` }}
        />
      </div>

      <span className="shrink-0 text-[13px] text-neutral-500 tabular-nums">{r.detail}</span>
    </div>
  )
}
