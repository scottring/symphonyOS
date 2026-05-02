import type { WeeklyBrief } from '@/types/meal-planner'
import { formatDateMonthDay } from '@/lib/weekHelpers'

interface Props {
  weekStart: Date
  brief: WeeklyBrief | null
  /** Optional — most-recent prior brief (for the footnote line). */
  lastBrief?: { weekStart: Date; body: string } | null
  habitsCount?: number
  /** Hooked up by the parent. Defaults to scrolling to #brief if omitted. */
  onWriteBrief?: () => void
  onRepeatLastWeek?: () => void
}

/** Mounted inside MealPlanRitualPage when the user has neither a brief nor
 *  any meal-plan entries for the week. The CTA scrolls/focuses the inline
 *  brief composer (anchor #brief) so the user keeps the same composer they
 *  already have. See spec artboard B. */
export function EmptyState({
  weekStart, lastBrief, habitsCount, onWriteBrief, onRepeatLastWeek,
}: Props) {
  const sundayLabel = formatDateMonthDay(weekStart).toUpperCase()

  const handleWriteBrief = () => {
    if (onWriteBrief) {
      onWriteBrief()
      return
    }
    const target = document.getElementById('brief')
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
      const ta = target.querySelector('textarea') as HTMLTextAreaElement | null
      ta?.focus()
    }
  }

  return (
    <section className="grid gap-15 items-center px-2 py-8" style={{ gridTemplateColumns: '1.2fr 1fr', gap: 60 }}>
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-neutral-400">
          NO PLAN YET FOR THE WEEK OF {sundayLabel}
        </div>
        <div className="h-3.5" />
        <h2 className="font-display text-[44px] leading-[1.1] text-neutral-800">
          Ready when you are.
        </h2>
        <div className="h-3.5" />
        <p className="font-display italic text-[18px] text-neutral-500 max-w-[540px] leading-[1.4]">
          Symphony plans the week from a few lines of brief. Habits and goals are already saved — we just need to know what's special this week.
        </p>

        <div className="h-7" />

        <div className="flex gap-2.5 items-center flex-wrap">
          <button
            type="button"
            onClick={handleWriteBrief}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary-500 text-white text-[14px] font-medium shadow-primary hover:bg-primary-600 transition-colors"
          >
            <span className="w-3.5 h-3.5 rounded-full bg-white/25 inline-grid place-items-center font-display italic text-[10px]">S</span>
            Write this week's brief →
          </button>
          {onRepeatLastWeek && (
            <>
              <span className="text-[13px] text-neutral-500">or</span>
              <button
                type="button"
                onClick={onRepeatLastWeek}
                className="text-[13px] text-primary-500 underline italic hover:text-primary-600"
              >
                Repeat last week's plan
              </button>
            </>
          )}
        </div>

        {(lastBrief || (habitsCount ?? 0) > 0) && (
          <>
            <div className="h-9" />
            <div className="flex gap-4 text-[12px] text-neutral-400 flex-wrap items-center">
              {lastBrief && (
                <span>
                  Last brief:{' '}
                  <span className="text-neutral-600">
                    {formatDateMonthDay(lastBrief.weekStart)} · "{truncate(lastBrief.body, 60)}"
                  </span>
                </span>
              )}
              {lastBrief && (habitsCount ?? 0) > 0 && <span>·</span>}
              {(habitsCount ?? 0) > 0 && (
                <span>{habitsCount} standing habit{habitsCount === 1 ? '' : 's'} saved</span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Right: dashed-border preview of what'll appear */}
      <div className="p-8 bg-bg-elevated border border-dashed border-neutral-300 rounded-[18px] relative">
        <div className="absolute -top-2.5 left-6 px-2.5 py-0.5 bg-bg-base text-[10px] font-bold tracking-[0.18em] text-neutral-400">
          WHAT'LL APPEAR HERE
        </div>
        <Skel w="60%" h={32} />
        <Skel w="80%" h={18} mt={10} />
        <Skel w="40%" h={14} mt={28} kicker />
        <Skel w="100%" h={56} mt={10} />
        <Skel w="100%" h={56} mt={8} />
        <Skel w="40%" h={14} mt={20} kicker />
        <Skel w="100%" h={42} mt={10} />
        <Skel w="100%" h={42} mt={8} />
      </div>
    </section>
  )
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

function Skel({ w, h, mt, kicker }: { w: string; h: number; mt?: number; kicker?: boolean }) {
  return (
    <div
      className={`rounded-md ${kicker ? 'bg-neutral-200/60' : 'bg-neutral-200/40'}`}
      style={{ width: w, height: h, marginTop: mt }}
    />
  )
}
