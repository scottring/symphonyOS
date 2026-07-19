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
import { getDueSession, readCadenceConfig, dismissNudgeForToken } from '@/lib/cadence/config'
import { SESSIONS } from './sessions'
import { resolveGuidedTarget, daysRemainingIn, type GuidedTargetChoice } from './periods'
import { narrationClip } from './narration'
import { useNarrationPlayer } from './useNarrationPlayer'
import { GuidedProvider, type GuidedHost } from './GuidedContext'
import { CoachLines } from './CoachLines'
import { GuideChat } from './GuideChat'
import { GuidedScene } from './GuidedScene'
import { placeAt } from './altitude'
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
  // Which period this session plans: the threshold rule by default (late in a
  // period → the next one), with a header toggle to pin the other candidate.
  const [targetChoice, setTargetChoice] = useState<GuidedTargetChoice>('auto')
  const target = useMemo(() => resolveGuidedTarget(horizon, targetChoice), [horizon, targetChoice])
  const period = target.period
  const { notes, patchNotes, loading } = usePlanningSession(horizon, domainSessionToken(period.token, domain))

  // Resume position starts at 0 and is synced from notes.stepIndex exactly
  // once per horizon+period, the first time loading flips false. `syncedKeyRef`
  // is the guard: after the initial sync, later notes changes (including the
  // ones this component itself writes via patchNotes) must never override the
  // user's live navigation. Changing horizons — or flipping the period toggle
  // — resets the guard so the freshly-targeted session resyncs to its own
  // persisted position.
  const [index, setIndex] = useState(0)
  const syncedKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (loading) return
    const syncKey = `${horizon}|${period.token}`
    if (syncedKeyRef.current === syncKey) return
    const persisted = typeof notes.stepIndex === 'number' ? notes.stepIndex : 0
    setIndex(Math.min(Math.max(persisted, 0), config.steps.length - 1))
    syncedKeyRef.current = syncKey
  }, [loading, horizon, period.token, notes.stepIndex, config.steps.length])

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
  // Finishing also answers the rhythm nudge: quiet today's due nudge when it's
  // this horizon's, else the planned period's token (they byte-match — the
  // weekly session token IS the nudge's weekToken).
  const completeSession = useCallback(() => {
    patchNotes({ stepIndex: 0 })
    if (horizon === 'daily') {
      localStorage.setItem('guided.daily.completed', '1')
      return
    }
    const kindByHorizon: Partial<Record<PlanningHorizon, string>> = {
      weekly: 'week', monthly: 'month', seasonal: 'season', annual: 'year',
    }
    const due = getDueSession(readCadenceConfig(), new Date())
    dismissNudgeForToken(due && due.kind === kindByHorizon[horizon] ? due.token : period.token)
  }, [patchNotes, horizon, period.token])

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
  // Terrain-review and schedule steps need room — a calendar/grid crammed into
  // the 680px reading column overflows and can't show more than a sliver of the
  // week (walkthrough #10, #16). Give them a wide container; the title/narration
  // stay at reading width inside it.
  const wideStep = step.type === 'calendar' || step.type === 'schedule-grid'

  // The descent: session progress drives the scene camera and the altimeter.
  // On step 1 you're at this horizon's highest point; Finish is the doorstep.
  const progress = config.steps.length > 1 ? safeIndex / (config.steps.length - 1) : 1
  const altitude = placeAt(horizon, progress)

  return (
    <div className="fixed inset-0 z-50 flex flex-col" role="dialog" aria-label={config.title}>
      <GuidedScene horizon={horizon} progress={progress} />

      {/* floating header — session name left, altimeter + controls right */}
      <header className="relative z-10 flex items-start justify-between px-6 pt-5 shrink-0">
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
          {/* Mid-period targeting: say which period is being planned when it
              isn't the obvious one, and offer the flip (threshold rule —
              week-boundary spec). Quiet on fresh period-start sessions. */}
          {target.alt && !loading && (
            <p className="mt-0.5 text-xs text-neutral-400">
              {target.mode === 'next'
                ? `Planning ahead — ${target.alt.label} is nearly done.`
                : `Midway through — ${daysRemainingIn(period)} day${daysRemainingIn(period) === 1 ? '' : 's'} left.`}{' '}
              <button
                type="button"
                onClick={() => setTargetChoice(target.alt!.target)}
                className="underline decoration-neutral-300 underline-offset-2 hover:text-primary-700 transition-colors"
              >
                {target.mode === 'next' ? `Plan the rest of ${target.alt.label} instead` : `Plan ${target.alt.label} instead`}
              </button>
            </p>
          )}
          {/* Persistence is real (usePlanningSession autosaves + flushes on
              exit, resumes at this step) — say so, so leaving to e.g. connect a
              calendar never feels like a gamble (walkthrough #8). */}
          <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-neutral-400">
            <Check className="w-3 h-3 text-primary-500" strokeWidth={3} />
            Saved — you can leave and come back anytime
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* altimeter — where you are on the mountain */}
          <div className="hidden sm:block text-right mr-1">
            <div className="font-display italic text-[15px] leading-tight text-primary-700">{altitude.place}</div>
            <div className="text-[10px] tracking-[.18em] uppercase text-neutral-400">{altitude.sub}</div>
          </div>
          <button type="button" onClick={toggleMuted}
            aria-label={muted ? 'Unmute narration' : 'Mute narration'}
            className="p-2 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-white/60 transition-colors">
            {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
          <button type="button" onClick={onClose} aria-label="Close"
            className="p-2 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-white/60 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* waypoint trail — the progress bar you can feel (and tap). Labels live
          in title/aria-label only: visible text here would duplicate the step
          h2 in the accessibility tree (and in getByText). */}
      {!loading && (
        <nav aria-label="Session waypoints"
          className="hidden md:flex absolute left-7 top-0 bottom-0 z-10 flex-col justify-center">
          {config.steps.map((s, j) => {
            const done = j < safeIndex
            const here = j === safeIndex
            return (
              <button key={s.id} type="button" onClick={() => go(j)}
                className="relative flex items-center py-[7px]" title={s.title}
                aria-label={`Go to step ${j + 1}: ${s.title}`} aria-current={here ? 'step' : undefined}>
                {j > 0 && <span className={`absolute left-[7px] -top-[9px] h-[18px] w-[2px] rounded ${done || here ? 'bg-primary-600' : 'bg-neutral-300/70'}`} />}
                <span aria-hidden className={`grid place-items-center w-4 h-4 rounded-full border-2 shrink-0 transition-all text-[8px] text-white ${
                  done ? 'bg-primary-600 border-primary-600'
                  : here ? 'bg-white border-primary-600 scale-110 shadow-[0_0_0_5px_rgba(46,93,67,.14)]'
                  : 'bg-white/80 border-neutral-300'}`}>
                  {done ? '✓' : ''}
                </span>
              </button>
            )
          })}
        </nav>
      )}

      <div className="relative z-10 flex-1 min-h-0 overflow-auto">
        <div className={`w-full mx-auto px-6 py-10 md:py-14 space-y-7 ${wideStep ? 'max-w-[1120px]' : 'max-w-[680px]'}`}>
          {loading ? (
            <p className="text-sm text-neutral-500">Gathering your session…</p>
          ) : (
            <>
              <div className={wideStep ? 'max-w-[680px]' : undefined}>
                <div className="text-[11px] font-bold tracking-[.22em] uppercase text-primary-700 mb-3">
                  {config.title} · {safeIndex + 1} / {config.steps.length}
                </div>
                <h2 className="font-display text-4xl md:text-[44px] leading-[1.06] tracking-tight text-neutral-800 mb-4">{step.title}</h2>
                <p className="text-lg leading-relaxed text-neutral-600 max-w-[58ch]">{narrationText}</p>
              </div>
              <GuidedProvider value={{
                horizon, domain, periodToken: period.token, periodLabel: period.label,
                periodStart: period.start, periodEnd: period.end,
                notes, patchNotes, host, step, goNext: () => (last ? finish() : go(safeIndex + 1)),
              }}>
                {/* The data-aware coach: what the scripted narration can't say. */}
                <CoachLines />
                {Body ? <Body key={step.id} /> : null}
                <GuideChat />
              </GuidedProvider>
            </>
          )}
        </div>
      </div>

      <footer className="relative z-10 flex items-center justify-between px-8 pb-6 pt-10 shrink-0 bg-gradient-to-t from-[#faf7f0] via-[#faf7f0]/80 to-transparent">
        <button type="button" onClick={() => go(safeIndex - 1)} disabled={loading || safeIndex === 0}
          className={`inline-flex items-center gap-1.5 text-[15px] font-medium px-4 py-2.5 rounded-xl transition-colors ${
            loading || safeIndex === 0 ? 'text-neutral-300 cursor-not-allowed' : 'text-neutral-600 hover:bg-white/70'}`}>
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-center gap-2">
          {!last && (
            <button type="button" onClick={() => go(safeIndex + 1)} disabled={loading}
              className="text-[15px] font-medium px-4 py-2.5 rounded-xl text-neutral-400 hover:text-neutral-600 hover:bg-white/70 transition-colors disabled:cursor-not-allowed disabled:opacity-50">
              Skip
            </button>
          )}
          {last ? (
            <>
              {config.chain && onChain && (
                <button type="button" onClick={chain} disabled={loading}
                  className="inline-flex items-center gap-1.5 text-[15px] font-medium px-4 py-2.5 rounded-xl text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors disabled:cursor-not-allowed disabled:opacity-50">
                  {config.chain.label}
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
              <button type="button" onClick={finish} disabled={loading}
                className="inline-flex items-center gap-1.5 text-[15px] font-semibold px-6 py-2.5 rounded-xl bg-primary-600 text-white hover:bg-primary-700 shadow-[0_6px_18px_-6px_rgba(46,93,67,.5)] transition-all hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:translate-y-0">
                <Check className="w-4 h-4" /> Finish
              </button>
            </>
          ) : (
            <button type="button" onClick={() => go(safeIndex + 1)} disabled={loading}
              className="inline-flex items-center gap-1.5 text-[15px] font-semibold px-6 py-2.5 rounded-xl bg-primary-600 text-white hover:bg-primary-700 shadow-[0_6px_18px_-6px_rgba(46,93,67,.5)] transition-all hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:translate-y-0">
              Next <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </footer>
    </div>
  )
}
