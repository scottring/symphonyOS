// src/components/planning/guided/GuidedSession.tsx
//
// The guided ritual shell: one step on screen at a time, spoken + written
// narration, Next/Back/Skip, resume via notes.stepIndex. Step bodies come
// from the registry; unknown types render nothing (the config integrity test
// is the real guard).
import { useMemo, useState, useCallback, type ComponentType } from 'react'
import { X, ArrowLeft, ArrowRight, Volume2, VolumeX, Check } from 'lucide-react'
import { usePlanningSession } from '@/hooks/usePlanningSession'
import type { PlanningHorizon } from '@/hooks/usePlanningSession'
import { SESSIONS } from './sessions'
import { guidedPeriod } from './periods'
import { narrationClip } from './narration'
import { useNarrationPlayer } from './useNarrationPlayer'
import { GuidedProvider, type GuidedHost } from './GuidedContext'
import type { StepType } from './types'

const REGISTRY: Partial<Record<StepType, ComponentType>> = {}
export function registerStepType(type: StepType, component: ComponentType) {
  REGISTRY[type] = component
}

interface Props {
  horizon: PlanningHorizon
  host: GuidedHost
  onClose: () => void
}

export function GuidedSession({ horizon, host, onClose }: Props) {
  const config = SESSIONS[horizon]
  const period = useMemo(() => guidedPeriod(horizon), [horizon])
  const { notes, patchNotes } = usePlanningSession(horizon, period.token)

  const persisted = typeof notes.stepIndex === 'number' ? (notes.stepIndex as number) : 0
  const [index, setIndex] = useState(() => Math.min(Math.max(persisted, 0), config.steps.length - 1))
  const step = config.steps[index]
  const last = index === config.steps.length - 1

  const go = useCallback((next: number) => {
    const clamped = Math.min(Math.max(next, 0), config.steps.length - 1)
    setIndex(clamped)
    patchNotes({ stepIndex: clamped })
  }, [config.steps.length, patchNotes])

  const finish = useCallback(() => {
    patchNotes({ stepIndex: 0 })
    if (horizon === 'daily') localStorage.setItem('guided.daily.completed', '1')
    onClose()
  }, [patchNotes, horizon, onClose])

  const clipUrl = narrationClip(horizon, step.id, step.narration)
  const { muted, toggleMuted } = useNarrationPlayer(horizon, clipUrl)

  const Body = REGISTRY[step.type]

  return (
    <div className="fixed inset-0 z-50 bg-bg-base flex flex-col" role="dialog" aria-label={config.title}>
      <header className="flex items-center justify-between px-6 py-4 border-b border-neutral-200/70 shrink-0">
        <div>
          <h1 className="font-display text-2xl text-neutral-800">{config.title}</h1>
          <p className="text-sm text-neutral-500">
            {period.label} · Step {index + 1} of {config.steps.length}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={toggleMuted}
            aria-label={muted ? 'Unmute narration' : 'Mute narration'}
            className="p-2 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors">
            {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
          <button type="button" onClick={onClose} aria-label="Close"
            className="p-2 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* thin progress track */}
      <div className="h-1 bg-neutral-100 shrink-0">
        <div className="h-full bg-primary-500 transition-all"
          style={{ width: `${((index + 1) / config.steps.length) * 100}%` }} />
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <div className="max-w-[680px] w-full mx-auto px-6 py-8 space-y-6">
          <div>
            <h2 className="font-display text-xl text-neutral-800 mb-2">{step.title}</h2>
            <p className="text-[15px] leading-relaxed text-neutral-600">{step.narration}</p>
          </div>
          <GuidedProvider value={{
            horizon, periodToken: period.token, periodLabel: period.label,
            periodStart: period.start, periodEnd: period.end,
            notes, patchNotes, host, step, goNext: () => (last ? finish() : go(index + 1)),
          }}>
            {Body ? <Body /> : null}
          </GuidedProvider>
        </div>
      </div>

      <footer className="flex items-center justify-between px-6 py-4 border-t border-neutral-200/70 shrink-0">
        <button type="button" onClick={() => go(index - 1)} disabled={index === 0}
          className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg transition-colors ${
            index === 0 ? 'text-neutral-300 cursor-not-allowed' : 'text-neutral-600 hover:bg-neutral-100'}`}>
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-center gap-2">
          {!last && (
            <button type="button" onClick={() => go(index + 1)}
              className="text-sm font-medium px-3 py-2 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors">
              Skip
            </button>
          )}
          {last ? (
            <button type="button" onClick={finish}
              className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors">
              <Check className="w-4 h-4" /> Finish
            </button>
          ) : (
            <button type="button" onClick={() => go(index + 1)}
              className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors">
              Next <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </footer>
    </div>
  )
}
