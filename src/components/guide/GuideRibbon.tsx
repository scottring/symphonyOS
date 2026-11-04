// Planning is a ribbon on the same page (Scott, 2026-11-04: "yeah", ribbon
// over rail). A satin bookmark hangs from the top of this period's sheet
// ("Plan November", RibbonTab). Pulled, it lays a band across the top of the
// page with the session's steps, the current step's Why and You, and Back,
// Next and Leave; the last step's Next is "Done planning November". There is
// no second layout: each step drives the page's own folds (the sheet above,
// this period's calendar, the write line) through the step list's `drives`,
// and a step with its own editor shows it in a card that drops under the
// band for that step only.
//
// On a phone the band is a sideways-scrolling row of step chips under the
// header, with the drop card under it; the chip of the current step is
// brought into view as the session moves.
//
// The look, the sound (a low satin slide, a stamp on done) and the motion
// are the approved prototype's, docs/superpowers/specs/2026-11-04-paper-fold-
// prototype.html (.band, .ribbon-tab, .stamp). Presentational: progress and
// every move come in.

import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { stepsFor, type GuideLevel, type GuideStep, type StepDrives } from '@/lib/guide/steps'
import type { GuideProgress } from '@/lib/guide/progress'
import { paperSound } from '@/lib/fold/paperSound'
import { useMobile } from '@/hooks/useMobile'
import { useAssistantLauncher } from '@/contexts/AssistantLaunchContext'
import './ribbon.css'

/** A session's bookmark while it runs: pulled, and pulling it puts it back. */
const RibbonContext = createContext<{ label: string; onPull: () => void; controls: string } | null>(null)

const PHONE = '(max-width: 760px)'
function onPhone(): boolean {
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia(PHONE).matches
  } catch {
    return false
  }
}

const buzz = () => { try { navigator.vibrate?.(6) } catch { /* no haptics */ } }

export interface GuideRibbonProps {
  level: GuideLevel
  progress: GuideProgress
  titleFor?: (s: GuideStep) => string
  /** What each step with its own editor shows in the drop card, by step id. */
  bodies: Partial<Record<string, ReactNode>>
  onJump: (id: string) => void
  onNext: () => void
  onBack: () => void
  /** Leave writes nothing and keeps where the session is. */
  onLeave: () => void
  /** Done planning: the page's closing writes. */
  onFinish: () => void
  /** "Done planning November" */
  finishLabel: string
  /** What each step opens on the page; by default the step list's own. */
  drives?: (stepId: string) => StepDrives | undefined
  /** The bookmark on the sheet ("Plan November"); pulling it while the
   *  session runs puts the ribbon back (Leave). */
  tab: { label: string; onPull: () => void }
  /** A quiet line in the band: the week's count, a period planned before. */
  status?: ReactNode
  /** Where the session is could not be saved. */
  error?: string | null
  /** The page itself, under the band. */
  children?: ReactNode
}

export function GuideRibbon({ level, progress, titleFor, bodies, onJump, onNext, onBack, onLeave, onFinish, finishLabel, drives, tab, status, error, children }: GuideRibbonProps) {
  const steps = stepsFor(level)
  const index = Math.max(0, steps.findIndex((s) => s.id === progress.current))
  const step = steps[index]
  const isLast = index === steps.length - 1
  const bandId = useId()
  const phone = useMobile()
  const { openAssistant } = useAssistantLauncher()
  const pageRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLOListElement>(null)
  const driveOf = drives ?? ((id: string) => steps.find((s) => s.id === id)?.drives)

  // The ribbon laid down: a low satin slide, once, and the band unrolls.
  const [on, setOn] = useState(false)
  useEffect(() => {
    paperSound.ribbon()
    const id = requestAnimationFrame(() => setOn(true))
    return () => cancelAnimationFrame(id)
  }, [])

  // A new step: a soft crinkle (never on arrival); on a phone, its chip in
  // view; a writing step puts the pencil on the write line.
  const current = progress.current
  const first = useRef(true)
  const write = !!driveOf(current)?.write
  useEffect(() => {
    if (first.current) first.current = false
    else paperSound.crinkle(3, 0.1, 0.6)
    if (onPhone()) listRef.current?.querySelector('[aria-current="step"]')?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' })
  }, [current])
  useEffect(() => {
    if (!write) return
    const id = requestAnimationFrame(() => {
      const form = pageRef.current?.querySelector<HTMLElement>('.sheet-write')
      const input = form?.querySelector<HTMLInputElement>('input')
      if (!form || !input) return
      form.classList.add('is-glow')
      input.focus({ preventScroll: true })
      setTimeout(() => form.classList.remove('is-glow'), 1400)
    })
    return () => cancelAnimationFrame(id)
  }, [current, write])

  const leave = () => { paperSound.ribbon(); onLeave() }
  const stateOf = (id: string) =>
    id === current ? 'current'
      : progress.done.includes(id) ? 'done'
        : progress.skipped.includes(id) ? 'skipped'
          : 'todo'
  const title = (s: GuideStep) => (titleFor ? titleFor(s) : s.title)
  const card = step.card ? bodies[current] : undefined

  return (
    <RibbonContext.Provider value={{ label: tab.label, onPull: () => { paperSound.ribbon(); tab.onPull() }, controls: bandId }}>
      <div className="ribbon-session" data-level={level}>
        <div className={`ribbon-band-wrap${on ? ' is-on' : ''}`}>
          <div>
            <section id={bandId} className="ribbon-band" aria-label={tab.label}>
              <div className="ribbon-band-top">
                <span className="ribbon-band-title">{tab.label}</span>
                <ol className="ribbon-steps" ref={listRef} aria-label="Steps">
                  {steps.map((s, i) => {
                    const state = stateOf(s.id)
                    return (
                      <li key={s.id} data-state={state}>
                        <button type="button" className="ribbon-step" aria-current={state === 'current' ? 'step' : undefined}
                          onClick={() => { if (s.id !== current) onJump(s.id) }}>
                          <span className="ribbon-step-n" aria-hidden="true">{state === 'done' ? <Check size={11} strokeWidth={2.75} /> : i + 1}</span>
                          <span className="ribbon-step-title">{title(s)}</span>
                          {(state === 'done' || state === 'skipped') && <span className="ribbon-sr-only"> ({state})</span>}
                        </button>
                      </li>
                    )
                  })}
                </ol>
                <div className="ribbon-band-nav">
                  <button type="button" disabled={index === 0} onClick={onBack}>Back</button>
                  {isLast
                    ? <button type="button" className="is-primary" onClick={() => { buzz(); onFinish() }}>{finishLabel}</button>
                    : <button type="button" className="is-primary" onClick={onNext}>Next</button>}
                  <button type="button" onClick={leave}>Leave</button>
                  {phone && <button type="button" onClick={() => openAssistant()}>Talk to the guide</button>}
                </div>
              </div>
              <dl className="ribbon-band-note">
                <dt>Why</dt><dd>{step.why}</dd>
                <dt>You</dt><dd>{step.you}</dd>
              </dl>
              {status && <p className="ribbon-band-status">{status}</p>}
              {error && <p className="ribbon-band-status is-error" role="alert">{error}</p>}
            </section>
          </div>
        </div>
        {card && <section key={current} className="ribbon-card" aria-label={title(step)}>{card}</section>}
        <div className="ribbon-page" ref={pageRef}>{children}</div>
      </div>
    </RibbonContext.Provider>
  )
}

/** The bookmark hanging from the top of this period's sheet. Before a
 *  session it reads "Plan November" and pulling it starts planning; inside a
 *  running session (GuideRibbon) it is the ribbon already pulled, and pulling
 *  it puts the ribbon back. */
export function RibbonTab({ label, onPull }: { label: string; onPull: () => void }) {
  const session = useContext(RibbonContext)
  const pulled = !!session
  return (
    <button type="button" className="ribbon-tab" aria-expanded={pulled} aria-controls={session?.controls}
      aria-label={session?.label ?? label}
      onClick={() => { if (session) session.onPull(); else { paperSound.ribbon(); onPull() } }}>
      <span aria-hidden="true">Plan</span>
    </button>
  )
}

/** Done planning: "Planned" with the day, stamped on the sheet with a soft
 *  thump. */
export function PlannedStamp({ at }: { at: Date }) {
  useEffect(() => {
    const t = setTimeout(() => { paperSound.stamp(); buzz() }, 120)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className="ribbon-stamp" role="img" aria-label={`Planned ${at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}>
      <span>Planned</span>
      <span>{at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
    </div>
  )
}
