// Planning is a few tooltips on the everyday page (Scott, 2026-11-04: "much
// better served by … just having the one interface for planning and for
// 'everyday' interactions … tooltips rather than this big, invasive modal").
// It replaces the ribbon (a band across the page, a card under it and the
// guide panel, all saying the same thing).
//
// - PlanChip sits in the page header: "Plan November" starts a session;
//   while one runs it reads "Planning November · 2 of 6" (tap: the tooltip
//   again) with an ✕ that stops planning.
// - GuideCoach is the session's one paper tooltip: "Step N of M", the step's
//   title, Why and You, dots, Back and Next ("Done planning November" on the
//   last step) and an ✕ that hides it without stopping the session (Escape
//   too). It points at the real thing on the page, the element marked
//   `data-guide-anchor` with the step's `at` (steps.ts), and falls back to
//   the page title. It follows its anchor while the folds move (900ms after a
//   step change), on scroll and on resize, and never covers the anchor.
//
// The page never changes shape for planning: the steps drive the page's own
// folds (PaperFold `drive`), and the conversation stays as it is every day
// (it never opens by itself). Look, placement and behaviour are the approved
// prototype's (docs/superpowers/specs/2026-11-04-paper-fold-prototype.html:
// planChip, anchorOf, placeCoach, showCoach, applyStep, .coach, .plan-chip).

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { stepsFor, type GuideLevel, type GuideStep } from '@/lib/guide/steps'
import { paperSound } from '@/lib/fold/paperSound'
import './coach.css'

// ---------- the running session, for the chip in the header ----------
// The chip and the tooltip live in different parts of the page (the header
// is often outside the session's own tree, or portalled into the masthead),
// so the running session is published here while its tooltip is mounted.

interface CoachSession {
  level: GuideLevel
  /** The session's place is still loading (no tooltip yet): the chip waits,
   *  so a tap cannot drop a `?step=` deep link. */
  loading?: boolean
  n: number
  m: number
  /** Shows the tooltip again (the chip). */
  show: () => void
  /** Ends the session (the chip's ✕). */
  stop: () => void
}
let running: CoachSession | null = null
const listeners = new Set<() => void>()
function publish(s: CoachSession | null) {
  running = s
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
const snapshot = () => running

/** A session at this level is mounted but its place is still loading: the
 *  chip shows, disabled, until the tooltip takes over. */
export function usePlanSessionLoading(level: GuideLevel, loading: boolean) {
  useEffect(() => {
    if (!loading) return
    const s: CoachSession = { level, loading: true, n: 0, m: 0, show: () => {}, stop: () => {} }
    publish(s)
    return () => { if (running === s) publish(null) }
  }, [level, loading])
}

/** The plan chip in a page header. Before a session: "Plan November", which
 *  starts one. While one runs at this level: "Planning November · 2 of 6"
 *  (shows the tooltip again) and ✕ "Stop planning". */
export function PlanChip({ level, word, onStart, disabled }: {
  level: GuideLevel
  /** "November", "Fall", "2026", "the week", "today". */
  word: string
  onStart: () => void
  disabled?: boolean
}) {
  const s = useSyncExternalStore(subscribe, snapshot, snapshot)
  const mine = s && s.level === level ? s : null
  if (mine?.loading) {
    return <button type="button" className="plan-chip" disabled aria-busy="true"
      data-explain="plan-chip" data-explain-label={`Plan ${word}`}>Plan {word}</button>
  }
  if (mine) {
    return (
      <span className="plan-chip is-on" data-explain="plan-chip" data-explain-label={`Planning ${word}`}>
        <button type="button" className="plan-chip-main" onClick={mine.show}>
          <span className="plan-chip-pip" aria-hidden="true" />Planning {word} · {mine.n} of {mine.m}
        </button>
        <button type="button" className="plan-chip-stop" aria-label="Stop planning" onClick={mine.stop}>✕</button>
      </span>
    )
  }
  return (
    <button type="button" className="plan-chip" disabled={disabled} onClick={onStart}
      data-explain="plan-chip" data-explain-label={`Plan ${word}`}>Plan {word}</button>
  )
}

// ---------- where the tooltip points ----------

const matches = (q: string): boolean => {
  try { return typeof window.matchMedia === 'function' && window.matchMedia(q).matches } catch { return false }
}
const sized = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 || r.height > 0 }
/** The first element marked with this anchor that is on the page (not inside
 *  something hidden), preferring one that is laid out. */
function findAnchor(id: string): HTMLElement | null {
  let first: HTMLElement | null = null
  for (const el of document.querySelectorAll<HTMLElement>(`[data-guide-anchor="${id}"]`)) {
    if (el.closest('[hidden]')) continue
    if (sized(el)) return el
    first ??= el
  }
  return first
}
/** The step's anchor, else the page title (a missing section, a phone
 *  layout): laid out first, then merely present. */
function anchorOf(at: string): { at: string; el: HTMLElement | null } {
  const own = findAnchor(at)
  const title = at === 'title' ? own : findAnchor('title')
  if (own && sized(own)) return { at, el: own }
  if (title && sized(title)) return { at: 'title', el: title }
  if (own) return { at, el: own }
  if (title) return { at: 'title', el: title }
  return { at: '', el: null }
}
// The highlight is an attribute, not a class: a re-render of the page
// rewrites className and would wipe it (coordinator ruling, fix round 1).
const LIT = 'data-guide-lit'
const unlight = () => document.querySelectorAll(`[${LIT}]`).forEach((n) => n.removeAttribute(LIT))
/** The anchor's fold lies stacked (a phone: PaperFold's 'v' mode). */
const stacked = (el: Element) => (el.closest<HTMLElement>('[data-fold-mode]')?.dataset.foldMode ?? '') === 'v'

/** Places the tooltip beside its anchor (the prototype's placeCoach): a
 *  fold's edge from the side, on a spread; anything else from below, or above
 *  when there is no room below. Kept on screen, and never over the anchor
 *  itself; with nothing to point at, in the top right corner, under the bar. */
function placeCoach(coach: HTMLElement | null, at: string) {
  if (!coach || coach.hidden) return
  const { at: used, el } = anchorOf(at)
  const r = el?.getBoundingClientRect()
  const cw = coach.offsetWidth, ch = coach.offsetHeight
  const W = window.innerWidth, H = window.innerHeight
  const side = !r || !el || (r.width === 0 && r.height === 0) ? 'none'
    : used === 'left' && !stacked(el) ? 'left'
      : used === 'right' && !stacked(el) ? 'right'
        : 'top'
  let x: number, y: number, arrow = side
  if (side === 'none' || !r) { x = W - cw - 16; y = 72 }
  else if (side === 'left') { x = r.right + 14; y = r.top + 96 }
  else if (side === 'right') { x = r.left - 14 - cw; y = r.top + 96 }
  else {
    x = r.left + 8; y = r.bottom + 12
    if (y + ch > H - 12 && r.top - ch - 12 > 12) { y = r.top - 12 - ch; arrow = 'bottom' }
  }
  x = Math.max(12, Math.min(W - cw - 12, x))
  y = Math.max(12, Math.min(H - ch - 12, y))
  coach.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`
  coach.dataset.side = arrow
  coach.dataset.at = used
  // The anchor gets a soft highlight (not the folds or the title).
  unlight()
  if (el && used === at && used !== 'left' && used !== 'right' && used !== 'title') el.setAttribute(LIT, '')
}

/** Runs `fn` every frame for `ms` (the folds take ~0.6s to settle); returns
 *  the way to stop. */
function follow(ms: number, fn: () => void): () => void {
  let raf = 0
  const t0 = performance.now()
  const tick = () => { fn(); if (performance.now() - t0 < ms) raf = requestAnimationFrame(tick) }
  raf = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(raf)
}

/** Calls `fn` at most once a frame. */
function perFrame(fn: () => void): { run: () => void; cancel: () => void } {
  let raf = 0
  return {
    run: () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; fn() }) },
    cancel: () => { cancelAnimationFrame(raf); raf = 0 },
  }
}

const buzz = () => { try { navigator.vibrate?.(6) } catch { /* no haptics */ } }

export interface GuideCoachProps {
  level: GuideLevel
  /** The current step's id. */
  current: string
  /** "November", "Fall", "the week", "today": "Done planning November". */
  word: string
  titleFor?: (s: GuideStep) => string
  onNext: () => void
  onBack: () => void
  /** Done planning: the page's closing writes. */
  onFinish: () => void
  /** The chip's ✕: the session ends, nothing more is written. */
  onStop: () => void
  /** Where the session is could not be saved. */
  error?: string | null
}

export function GuideCoach({ level, current, word, titleFor, onNext, onBack, onFinish, onStop, error }: GuideCoachProps) {
  const steps = stepsFor(level)
  const index = Math.max(0, steps.findIndex((s) => s.id === current))
  const step = steps[index]
  const isLast = index === steps.length - 1
  const ref = useRef<HTMLDivElement>(null)

  // Hidden by its ✕ or Escape; a new step, or the chip, shows it again.
  const [hidden, setHidden] = useState(false)
  const [shownFor, setShownFor] = useState(step.id)
  if (shownFor !== step.id) { setShownFor(step.id); setHidden(false) }
  const [shows, setShows] = useState(0)
  const show = useCallback(() => { setHidden(false); setShows((n) => n + 1) }, [])
  const hide = useCallback(() => { setHidden(true); unlight() }, [])

  // The chip in the header follows the session.
  const stopRef = useRef(onStop)
  useEffect(() => { stopRef.current = onStop })
  const n = index + 1, m = steps.length
  useEffect(() => {
    const s: CoachSession = { level, n, m, show, stop: () => stopRef.current() }
    publish(s)
    return () => { if (running === s) publish(null) }
  }, [level, n, m, show])

  const at = step.at

  // A step shown (a new one, or again): placed now, its entrance replayed
  // (none under reduced motion), then followed while the folds settle
  // (~0.6s; placeCoachSoon).
  useLayoutEffect(() => {
    const coach = ref.current
    if (!coach || hidden) return
    coach.classList.remove('is-in')
    if (!matches('(prefers-reduced-motion: reduce)')) { void coach.offsetWidth; coach.classList.add('is-in') }
    placeCoach(coach, at)
    return follow(900, () => placeCoach(coach, at))
  }, [step.id, hidden, shows, at])
  // On scroll (any scroller, so capture) and resize.
  useEffect(() => {
    const coach = ref.current
    const place = () => placeCoach(coach, at)
    let rt: ReturnType<typeof setTimeout> | undefined
    const onResize = () => { clearTimeout(rt); rt = setTimeout(place, 80) }
    window.addEventListener('scroll', place, { capture: true, passive: true })
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('scroll', place, { capture: true }); window.removeEventListener('resize', onResize); clearTimeout(rt) }
  }, [at])
  // While it shows, it follows its anchor as the page moves under it: a line
  // written above the write line, a list that grows, a section that loads.
  // The anchor, what holds it, and the page are watched; once a frame.
  useEffect(() => {
    const coach = ref.current
    if (!coach || hidden || typeof ResizeObserver !== 'function') return
    const frame = perFrame(() => placeCoach(coach, at))
    const ro = new ResizeObserver(frame.run)
    const { el } = anchorOf(at)
    for (const n of new Set([el, el?.parentElement, document.body])) if (n) ro.observe(n)
    return () => { ro.disconnect(); frame.cancel() }
  }, [step.id, hidden, shows, at])
  useEffect(() => unlight, [])

  // Escape hides it (the session stays).
  useEffect(() => {
    if (hidden) return
    // Something else that took the Escape (a menu, a dialog) keeps it.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) hide() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [hidden, hide])

  // A soft crinkle as the session opens and at each new step; a writing step
  // puts the pencil on the write line.
  const first = useRef(true)
  const write = !!step.drives?.write
  useEffect(() => {
    if (first.current) { first.current = false; paperSound.crinkle(4, 0.12, 0.7) }
    else paperSound.crinkle(3, 0.1, 0.6)
  }, [step.id])
  useEffect(() => {
    if (!write) return
    const id = requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>('[data-guide-anchor="write"] input')?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(id)
  }, [step.id, write])

  const title = titleFor ? titleFor(step) : step.title
  return createPortal(
    <div ref={ref} className="coach" role="dialog" aria-label="Planning guide" hidden={hidden} data-level={level}>
      <div className="coach-k">Step {n} of {m}</div>
      <div className="coach-t">{title}</div>
      <p className="coach-why">{step.why}</p>
      <p className="coach-you">{step.you}</p>
      {error && <p className="coach-error" role="alert">{error}</p>}
      <div className="coach-nav">
        <button type="button" disabled={index === 0} onClick={onBack}>Back</button>
        <span className="coach-dots" aria-hidden="true">
          {steps.map((s, i) => <i key={s.id} className={i === index ? 'is-on' : i < index ? 'is-past' : undefined} />)}
        </span>
        {isLast
          ? <button type="button" className="is-primary" onClick={() => { buzz(); onFinish() }}>Done planning {word}</button>
          : <button type="button" className="is-primary" onClick={onNext}>Next</button>}
      </div>
      <button type="button" className="coach-x" aria-label="Hide the guide" onClick={hide}>✕</button>
    </div>,
    document.body,
  )
}

/** Done planning: "Planned" with the day, stamped on the sheet with a soft
 *  thump. */
export function PlannedStamp({ at }: { at: Date }) {
  useEffect(() => {
    const t = setTimeout(() => { paperSound.stamp(); buzz() }, 120)
    return () => clearTimeout(t)
  }, [])
  const day = at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return (
    <div className="plan-stamp" role="img" aria-label={`Planned ${day}`}>
      <span>Planned</span>
      <span>{day}</span>
    </div>
  )
}
