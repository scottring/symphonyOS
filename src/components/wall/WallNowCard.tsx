import { Pin } from 'lucide-react'
import { RHYTHM_MODE_LABELS, type RhythmMode } from './rhythm/rhythmMode'
import type { NowFocus } from './nowFocus'
import type { TodayItem } from './today/todayItem'
import type { RoutineGroup } from './today/groupRoutineStepsByOwner'
import { WallNowGrid } from './now/WallNowGrid'
import type { DayGridData, DayGridTapTarget } from './now/buildDayGrid'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import './now/wallNowFade.css'

// ─── helpers ─────────────────────────────────────────────────────

function formatRowTime(d: Date): string {
  const h = d.getHours()
  const m = d.getMinutes()
  const period = h >= 12 ? 'p' : 'a'
  const dispH = h % 12 || 12
  return m === 0 ? `${dispH}${period}` : `${dispH}:${m.toString().padStart(2, '0')}${period}`
}

function RoutineStepRow({
  step,
  onCheckItem,
}: {
  step: TodayItem
  onCheckItem?: (id: string, completed: boolean) => void
}) {
  return (
    <li className="flex items-center gap-3 text-base">
      <button
        type="button"
        aria-label={`Check ${step.title}`}
        onClick={() => onCheckItem?.(step.id, !step.completed)}
        className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-colors shrink-0 ${
          step.completed
            ? 'bg-emerald-700 border-emerald-700'
            : 'border-white/30 hover:border-white/60'
        }`}
      >
        {step.completed && <span className="text-white">✓</span>}
      </button>
      <span className={step.completed ? 'text-white/50 line-through' : 'text-white/90'}>
        {step.title}
      </span>
    </li>
  )
}

// ─── mode content renderers ───────────────────────────────────────

interface ModeContentProps {
  mode: RhythmMode
  todayItems?: TodayItem[]
  routineSteps?: TodayItem[]
  routineGroups?: RoutineGroup[]
  dinnerPlanTitle?: string | null
  tomorrowPreview?: { title: string; startTime: Date | null } | null
  familyPrompt: string | null
  onCheckItem?: (id: string, completed: boolean) => void
}

function renderModeContent(props: ModeContentProps) {
  const { mode } = props

  switch (mode) {
    case 'morning':
    case 'bedtime': {
      const label = mode === 'morning' ? 'Morning routine' : 'Bedtime routine'
      const groups = props.routineGroups ?? []
      // Grouped-by-child view: each child's routine as its own labeled
      // section, so two kids' identically-named steps no longer read as
      // duplicates. Falls back to the flat list when no groups are supplied.
      if (groups.length > 0) {
        const incomplete = groups.reduce(
          (n, g) => n + g.steps.filter(s => !s.completed).length,
          0,
        )
        return (
          <>
            <div className="text-xs uppercase tracking-widest text-white/60">{label}</div>
            <h2 className="font-display text-2xl font-semibold mt-1 mb-4">
              {incomplete} step{incomplete !== 1 ? 's' : ''} left
            </h2>
            <div
              className={`grid gap-x-8 gap-y-5 ${groups.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}
            >
              {groups.map(group => {
                const done = group.steps.filter(s => s.completed).length
                return (
                  <div key={group.ownerId ?? 'anyone'} className="flex gap-3 min-w-0">
                    <div
                      className="w-1 rounded-full shrink-0"
                      style={{ background: group.color ?? 'rgba(255,255,255,0.2)' }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        {group.initials && (
                          <span
                            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                            style={{ background: group.color ?? 'rgba(255,255,255,0.25)' }}
                          >
                            {group.initials}
                          </span>
                        )}
                        <span className="text-sm font-semibold tracking-wide text-white/90 truncate">
                          {group.label}
                        </span>
                        <span className="ml-auto text-[11px] font-semibold tracking-widest text-white/45 shrink-0">
                          {done}/{group.steps.length}
                        </span>
                      </div>
                      <ul className="space-y-2">
                        {group.steps.map(step => (
                          <RoutineStepRow key={step.id} step={step} onCheckItem={props.onCheckItem} />
                        ))}
                      </ul>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )
      }

      const steps = (props.routineSteps ?? []).slice(0, 8)
      const incomplete = steps.filter(s => !s.completed)
      return (
        <>
          <div className="text-xs uppercase tracking-widest text-white/60">{label}</div>
          <h2 className="font-display text-2xl font-semibold mt-1 mb-3">
            {incomplete.length} step{incomplete.length !== 1 ? 's' : ''} left
          </h2>
          {steps.length === 0 ? (
            <p className="text-white/60">No routine steps scheduled.</p>
          ) : (
            <ul className="space-y-2">
              {steps.map(step => (
                <RoutineStepRow key={step.id} step={step} onCheckItem={props.onCheckItem} />
              ))}
            </ul>
          )}
        </>
      )
    }

    case 'day':
    case 'after-school': {
      const items = (props.todayItems ?? []).filter(i => !i.completed).slice(0, 4)
      const label = mode === 'day' ? "Today's focus" : 'After school'
      return (
        <>
          <div className="text-xs uppercase tracking-widest text-white/60">{label}</div>
          <h2 className="font-display text-2xl font-semibold mt-1 mb-3">
            {items.length === 0 ? 'All clear' : `${items.length} thing${items.length === 1 ? '' : 's'} left`}
          </h2>
          {items.length === 0 ? (
            <p className="text-white/60">Nothing pressing right now.</p>
          ) : (
            <ul className="space-y-2 text-base text-white/90">
              {items.map(it => (
                <li key={it.id} className="flex items-baseline gap-3">
                  <span className="text-white/40 text-sm tabular-nums w-12 shrink-0">
                    {it.startTime ? formatRowTime(it.startTime) : '—'}
                  </span>
                  <span className="truncate">{it.title}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )
    }

    case 'dinner':
      return (
        <>
          <div className="text-xs uppercase tracking-widest text-white/60">Tonight's dinner</div>
          <h2 className="font-display text-3xl font-semibold mt-1 leading-tight">
            {props.dinnerPlanTitle ?? 'No dinner planned'}
          </h2>
          {props.familyPrompt && (
            <div className="mt-auto text-sm text-white/80 bg-white/10 rounded-lg px-4 py-3">
              💬 Tonight's question: <span className="italic">"{props.familyPrompt}"</span>
            </div>
          )}
        </>
      )

    case 'wind-down':
      return (
        <>
          <div className="text-xs uppercase tracking-widest text-white/60">Wind down</div>
          <h2 className="font-display text-2xl font-semibold mt-1 mb-3">Tomorrow</h2>
          {props.tomorrowPreview ? (
            <p className="text-base text-white/90">
              {props.tomorrowPreview.startTime
                ? formatRowTime(props.tomorrowPreview.startTime) + ' · '
                : ''}
              {props.tomorrowPreview.title}
            </p>
          ) : (
            <p className="text-white/60">Nothing scheduled for tomorrow yet.</p>
          )}
        </>
      )
  }
}

// ─── component ───────────────────────────────────────────────────

interface WallNowCardProps {
  focus: NowFocus
  pinned: boolean
  onPinToggle: () => void
  familyPrompt: string | null
  // data for mode-specific rendering
  todayItems?: TodayItem[]
  routineSteps?: TodayItem[]
  routineGroups?: RoutineGroup[]
  dinnerPlanTitle?: string | null
  tomorrowPreview?: { title: string; startTime: Date | null } | null
  onCheckItem?: (id: string, completed: boolean) => void
  dayGrid?: DayGridData
  onQuadrantTap?: (target: DayGridTapTarget) => void
}

export function WallNowCard({
  focus,
  pinned,
  onPinToggle,
  familyPrompt,
  todayItems,
  routineSteps,
  routineGroups,
  dinnerPlanTitle,
  tomorrowPreview,
  onCheckItem,
  dayGrid,
  onQuadrantTap,
}: WallNowCardProps) {

  function renderContent() {
    // Imminent: "Up next" with event/task title
    if (focus.kind === 'imminent') {
      const entity = focus.entity.entity as { title: string }
      return (
        <>
          <div className="text-xs uppercase tracking-widest text-white/60">Up next</div>
          <h2 className="font-display text-3xl font-semibold leading-tight">{entity.title}</h2>
        </>
      )
    }

    // Tapped item override (detail view placeholder — kept minimal)
    if (focus.kind === 'override-item') {
      return (
        <>
          <div className="text-xs uppercase tracking-widest text-white/60">Detail</div>
          <h2 className="font-display text-3xl font-semibold leading-tight">Tapped item</h2>
        </>
      )
    }

    // Day grid → render whenever the resolved mode is Day, whether that's the
    // auto default, a rhythm-bar override, or pinned — so tapping/pinning
    // "Day" summons it on demand, not only during the 9a–3p clock window.
    if (
      (focus.kind === 'mode-default' || focus.kind === 'override-mode' || focus.kind === 'pinned-mode') &&
      focus.mode === 'day' &&
      dayGrid
    ) {
      return <WallNowGrid grid={dayGrid} onQuadrantTap={(t) => onQuadrantTap?.(t)} />
    }

    // Pinned mode, override mode, or default — all render mode content
    const mode: RhythmMode =
      focus.kind === 'pinned-mode' ? focus.mode
      : focus.kind === 'override-mode' ? focus.mode
      : focus.mode  // mode-default

    const eyebrow =
      focus.kind === 'pinned-mode'
        ? `Pinned · ${RHYTHM_MODE_LABELS[mode].label}`
        : undefined

    return (
      <>
        {eyebrow && (
          <div className="text-xs uppercase tracking-widest text-amber-300/80 mb-1">{eyebrow}</div>
        )}
        {renderModeContent({
          mode,
          todayItems,
          routineSteps,
          routineGroups,
          dinnerPlanTitle,
          tomorrowPreview,
          familyPrompt,
          onCheckItem,
        })}
      </>
    )
  }

  const reducedMotion = usePrefersReducedMotion()
  const focusKey =
    focus.kind === 'mode-default' || focus.kind === 'pinned-mode' || focus.kind === 'override-mode'
      ? `${focus.kind}:${focus.mode}`
      : focus.kind === 'override-item'
        ? `override-item:${focus.itemId}`
        : 'imminent'

  return (
    <div className="rounded-2xl bg-gradient-to-br from-emerald-900 to-teal-900 p-7 text-white flex flex-col gap-3 h-full shadow-lg overflow-hidden">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0" />
        <button
          type="button"
          aria-label="Pin"
          onClick={onPinToggle}
          className={`p-2 rounded-md transition-colors ${pinned ? 'text-amber-300 bg-amber-900/30' : 'text-white/40 hover:text-white/80'}`}
        >
          <Pin className="w-5 h-5" />
        </button>
      </div>
      <div
        key={focusKey}
        className={`flex-1 min-h-0 flex flex-col ${reducedMotion ? '' : 'wall-now-fade-in'}`}
      >
        {renderContent()}
      </div>
    </div>
  )
}
