import { Pin } from 'lucide-react'
import { RHYTHM_MODE_LABELS, type RhythmMode } from './rhythm/rhythmMode'
import type { NowFocus } from './nowFocus'
import type { TodayItem } from './today/todayItem'

// ─── helpers ─────────────────────────────────────────────────────

function formatRowTime(d: Date): string {
  const h = d.getHours()
  const m = d.getMinutes()
  const period = h >= 12 ? 'p' : 'a'
  const dispH = h % 12 || 12
  return m === 0 ? `${dispH}${period}` : `${dispH}:${m.toString().padStart(2, '0')}${period}`
}

// ─── mode content renderers ───────────────────────────────────────

interface ModeContentProps {
  mode: RhythmMode
  todayItems?: TodayItem[]
  routineSteps?: TodayItem[]
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
      const steps = (props.routineSteps ?? []).slice(0, 8)
      const incomplete = steps.filter(s => !s.completed)
      const label = mode === 'morning' ? 'Morning routine' : 'Bedtime routine'
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
                <li key={step.id} className="flex items-center gap-3 text-base">
                  <button
                    type="button"
                    aria-label={`Check ${step.title}`}
                    onClick={() => props.onCheckItem?.(step.id, !step.completed)}
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
  dinnerPlanTitle?: string | null
  tomorrowPreview?: { title: string; startTime: Date | null } | null
  onCheckItem?: (id: string, completed: boolean) => void
}

export function WallNowCard({
  focus,
  pinned,
  onPinToggle,
  familyPrompt,
  todayItems,
  routineSteps,
  dinnerPlanTitle,
  tomorrowPreview,
  onCheckItem,
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
          dinnerPlanTitle,
          tomorrowPreview,
          familyPrompt,
          onCheckItem,
        })}
      </>
    )
  }

  return (
    <div className="rounded-2xl bg-gradient-to-br from-emerald-900 to-teal-900 p-7 text-white flex flex-col gap-3 h-full shadow-lg">
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
      {renderContent()}
    </div>
  )
}
