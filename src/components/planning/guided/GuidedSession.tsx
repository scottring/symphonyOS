// src/components/planning/guided/GuidedSession.tsx
//
// The guided ritual shell: one step on screen at a time, spoken + written
// narration, Next/Back/Skip, resume via notes.stepIndex. Step bodies come
// from the registry; unknown types render nothing (the config integrity test
// is the real guard).
import { useMemo, useState, useCallback, useEffect, useRef, type ComponentType } from 'react'
import { X, ArrowLeft, ArrowRight, Volume2, VolumeX, Check, Briefcase, Users, User } from 'lucide-react'
import { usePlanningSession } from '@/hooks/usePlanningSession'
import type { PlanningHorizon } from '@/hooks/usePlanningSession'
import { domainSessionToken, DOMAIN_LABELS, type PlanningDomain } from '@/lib/today/domainFilter'
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
// Test/integrity-check hook: registry.test.ts verifies every step type used by
// a session config has a registered component. Step components register via
// the `./stepTypes` side-effect import, which GuidedSessionContainer pulls in
// before rendering — GuidedSession.tsx itself must NOT import it (cycle).
export function getRegisteredTypes(): StepType[] {
  return Object.keys(REGISTRY) as StepType[]
}

const DOMAIN_ICONS = { work: Briefcase, family: Users, personal: User } as const

interface Props {
  horizon: PlanningHorizon
  /** Which domain this session runs in. 'universal' = the whole-life session
   *  (bare period token — all pre-existing sessions). A domain gets its own
   *  planning_sessions row via the suffixed token, so Work and Family can
   *  plan the same week independently. */
  domain: PlanningDomain
  host: GuidedHost
  /** Abandon (the header X): close the overlay, stay where you were. */
  onClose: () => void
  /** Completing the ritual (Finish). Falls back to onClose when omitted —
   *  hosts use it to land on the finished horizon's own page. */
  onFinished?: () => void
  /** Cascade into the next-lower session ("Plan the season now"). The host
   *  swaps `horizon`; the `key={horizon}` remount gives the new session a
   *  clean shell. Rendered only when the config declares a chain. */
  onChain?: (next: PlanningHorizon) => void
}

export function GuidedSession({ horizon, domain, host, onClose, onFinished, onChain }: Props) {
  const config = SESSIONS[horizon]
  const period = useMemo(() => guidedPeriod(horizon), [horizon])
  const { notes, patchNotes, loading } = usePlanningSession(horizon, domainSessionToken(period.token, domain))

  // Resume position starts at 0 and is synced from notes.stepIndex exactly
  // once per horizon, the first time loading flips false. `syncedHorizonRef`
  // is the guard: after the initial sync for a horizon, later notes changes
  // (including the ones this component itself writes via patchNotes) must
  // never override the user's live navigation. Changing horizons resets the
  // guard so a freshly-mounted-in-place session resyncs to its own position.
  const [index, setIndex] = useState(0)
  const syncedHorizonRef = useRef<PlanningHorizon | null>(null)

  useEffect(() => {
    if (loading) return
    if (syncedHorizonRef.current === horizon) return
    const persisted = typeof notes.stepIndex === 'number' ? notes.stepIndex : 0
    setIndex(Math.min(Math.max(persisted, 0), config.steps.length - 1))
    syncedHorizonRef.current = horizon
  }, [loading, horizon, notes.stepIndex, config.steps.length])

  // Safety net: if `horizon` changes, `config` swaps to a session with a
  // different (possibly shorter) step list in the same render that the sync
  // effect above hasn't run yet for. Never index straight off stale `index`.
  const safeIndex = Math.min(Math.max(index, 0), config.steps.length - 1)
  const step = config.steps[safeIndex]
  const last = safeIndex === config.steps.length - 1

  const go = useCallback((next: number) => {
    const clamped = Math.min(Math.max(next, 0), config.steps.length - 1)
    setIndex(clamped)
    patchNotes({ stepIndex: clamped })
  }, [config.steps.length, patchNotes])

  // Shared completion bookkeeping: reset the resume position (the flushed
  // unmount persist carries it to the DB) and stamp the daily first-run flag.
  const completeSession = useCallback(() => {
    patchNotes({ stepIndex: 0 })
    if (horizon === 'daily') localStorage.setItem('guided.daily.completed', '1')
  }, [patchNotes, horizon])

  const finish = useCallback(() => {
    completeSession()
    ;(onFinished ?? onClose)()
  }, [completeSession, onFinished, onClose])

  const chain = useCallback(() => {
    if (!config.chain || !onChain) return
    completeSession()
    onChain(config.chain.horizon)
  }, [completeSession, config.chain, onChain])

  // Domain sessions may override a step's whole-life wording. Variant text
  // misses the narration manifest's exact-text match and displays silently —
  // that fallback is the design until variant audio is generated.
  const variant = domain !== 'universal' ? step.byDomain?.[domain] : undefined
  const narrationText = variant?.narration ?? step.narration
  const clipUrl = loading ? null : narrationClip(horizon, step.id, narrationText)
  const { muted, toggleMuted } = useNarrationPlayer(horizon, clipUrl)
  const DomainIcon = domain !== 'universal' ? DOMAIN_ICONS[domain] : null

  const Body = REGISTRY[step.type]

  return (
    <div className="fixed inset-0 z-50 bg-bg-base flex flex-col" role="dialog" aria-label={config.title}>
      <header className="flex items-center justify-between px-6 py-4 border-b border-neutral-200/70 shrink-0">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-display text-2xl text-neutral-800">{config.title}</h1>
            {DomainIcon && domain !== 'universal' && (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border border-primary-200 bg-primary-50 text-primary-700">
                <DomainIcon className="w-3 h-3" /> {DOMAIN_LABELS[domain]}
              </span>
            )}
          </div>
          <p className="text-sm text-neutral-500">
            {period.label} · Step {safeIndex + 1} of {config.steps.length}
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
          style={{ width: `${((safeIndex + 1) / config.steps.length) * 100}%` }} />
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <div className="max-w-[680px] w-full mx-auto px-6 py-8 space-y-6">
          {loading ? (
            <p className="text-sm text-neutral-400">Gathering your session…</p>
          ) : (
            <>
              <div>
                <h2 className="font-display text-xl text-neutral-800 mb-2">{step.title}</h2>
                <p className="text-[15px] leading-relaxed text-neutral-600">{narrationText}</p>
              </div>
              <GuidedProvider value={{
                horizon, domain, periodToken: period.token, periodLabel: period.label,
                periodStart: period.start, periodEnd: period.end,
                notes, patchNotes, host, step, goNext: () => (last ? finish() : go(safeIndex + 1)),
              }}>
                {Body ? <Body key={step.id} /> : null}
              </GuidedProvider>
            </>
          )}
        </div>
      </div>

      <footer className="flex items-center justify-between px-6 py-4 border-t border-neutral-200/70 shrink-0">
        <button type="button" onClick={() => go(safeIndex - 1)} disabled={loading || safeIndex === 0}
          className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg transition-colors ${
            loading || safeIndex === 0 ? 'text-neutral-300 cursor-not-allowed' : 'text-neutral-600 hover:bg-neutral-100'}`}>
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-center gap-2">
          {!last && (
            <button type="button" onClick={() => go(safeIndex + 1)} disabled={loading}
              className="text-sm font-medium px-3 py-2 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors disabled:cursor-not-allowed disabled:opacity-50">
              Skip
            </button>
          )}
          {last ? (
            <>
              {config.chain && onChain && (
                <button type="button" onClick={chain} disabled={loading}
                  className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors disabled:cursor-not-allowed disabled:opacity-50">
                  {config.chain.label}
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
              <button type="button" onClick={finish} disabled={loading}
                className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors disabled:cursor-not-allowed disabled:opacity-50">
                <Check className="w-4 h-4" /> Finish
              </button>
            </>
          ) : (
            <button type="button" onClick={() => go(safeIndex + 1)} disabled={loading}
              className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors disabled:cursor-not-allowed disabled:opacity-50">
              Next <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </footer>
    </div>
  )
}
