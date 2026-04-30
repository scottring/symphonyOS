import { GramRing } from './GramRing'
import type { HabitMap } from '@/types/meal-planner'

interface HabitDef {
  key: string
  label: string
}

interface Props {
  habitDefs: HabitDef[]
  gramsActual: number
  gramsTarget: number | null
  kcalPlanned: number
  habits: HabitMap
  variant: 'desktop' | 'mobile'
}

/** Three stacked metrics, equal visual weight. Grams target gets the bar
 *  because it's the only metric with an explicit goal. Calories ambient. */
export function TodayHeader({ habitDefs, gramsActual, gramsTarget, kcalPlanned, habits, variant }: Props) {
  const habitsHit = habitDefs.reduce((n, h) => n + (habits[h.key] ? 1 : 0), 0)

  if (variant === 'mobile') {
    return (
      <div className="flex flex-col items-center text-center pt-2 pb-6">
        {gramsTarget !== null && (
          <GramRing actual={gramsActual} target={gramsTarget} size={172} stroke={10} />
        )}
        <div className="mt-3 text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500">
          {gramsTarget !== null ? `~${gramsActual}G / ${gramsTarget}G TARGET` : 'NO GRAM TARGET THIS WEEK'}
        </div>
        <div className="mt-1 font-display italic text-[0.95rem] text-neutral-500">
          {kcalPlanned > 0 ? `~${kcalPlanned.toLocaleString()} kcal planned` : 'kcal — quietly off'}
        </div>
        <div className="mt-2 text-[12px] text-neutral-500">
          {habitsHit} of {habitDefs.length} habits hit
        </div>
      </div>
    )
  }

  // Desktop: three stacked metrics, no rings on calories or habits.
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-6 pb-4 border-b border-neutral-100">
      <div className="space-y-3 min-w-0">
        {/* Row 1 — grams */}
        {gramsTarget !== null ? (
          <div>
            <div className="flex items-baseline gap-3">
              <span className="font-display text-[1.6rem] italic text-primary-700">~{gramsActual}g</span>
              <span className="text-[12px] text-neutral-500">/ {gramsTarget}g target</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-neutral-100 overflow-hidden">
              <div className="h-full bg-primary-500 transition-all"
                   style={{ width: `${Math.min(100, (gramsActual / gramsTarget) * 100)}%` }} />
            </div>
          </div>
        ) : (
          <div className="font-display italic text-[1rem] text-neutral-400">No gram target this week.</div>
        )}

        {/* Row 2 — calories (no goal, no comparison) */}
        <div className="flex items-baseline gap-3">
          <span className="font-display text-[1.4rem] text-neutral-800">
            {kcalPlanned > 0 ? `~${kcalPlanned.toLocaleString()}` : '—'}
          </span>
          <span className="font-display italic text-[0.95rem] text-neutral-500">kcal planned</span>
        </div>

        {/* Row 3 — habits as filled-circle row */}
        <div className="flex items-center gap-3">
          <span className="font-display text-[1.2rem] text-neutral-800">~{habitsHit} of {habitDefs.length}</span>
          <span className="text-[12px] text-neutral-500">habits hit</span>
          <span className="ml-2 flex items-center gap-1">
            {habitDefs.map(h => (
              <span key={h.key}
                    className={`inline-block w-2 h-2 rounded-full ${
                      habits[h.key] ? 'bg-sage-500' : 'border border-neutral-300'
                    }`} />
            ))}
          </span>
        </div>
      </div>

      {/* Right-side optional ring as a subtle counterweight on desktop */}
      {gramsTarget !== null && (
        <div className="hidden md:block">
          <GramRing actual={gramsActual} target={gramsTarget} size={92} stroke={7} />
        </div>
      )}
    </div>
  )
}
