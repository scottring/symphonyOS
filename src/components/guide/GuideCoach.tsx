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
import { stepsFor, wordsIn, type GuideLevel, type GuideStep, type StepWords } from '@/lib/guide/steps'
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
/** The step's anchor, else its fallback (Today's look back with nothing
 *  left: the week's fold), else the page title (a missing section, a phone
 *  layout): laid out first, then merely present. */
function anchorOf(at: string, fallback?: string): { at: string; el: HTMLElement | null } {
  const tried = [at, ...(fallback && fallback !== at ? [fallback] : []), ...(at !== 'title' && fallback !== 'title' ? ['title'] : [])]
  const found = tried.map((id) => ({ at: id, el: findAnchor(id) }))
  return found.find((x) => x.el && sized(x.el)) ?? found.find((x) => x.el) ?? { at: '', el: null }
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
function placeCoach(coach: HTMLElement | null, at: string, fallback?: string) {
  if (!coach || coach.hidden) return
  const { at: used, el } = anchorOf(at, fallback)
  const r = el?.getBoundingClientRect()
  const cw = coach.offsetWidth, ch = coach.offsetHeight
  const W = window.innerWidth, H = window.innerHeight
  const side = !r || !el || (r.width === 0 && r.height === 0) ? 'none'
    : used === 'left' && !stacked(el) ? 'left'
      : used === 'right' && !stacked(el) ? 'right'
        : 'top'
  // Something on the sheet folded open at the left (Today's leftovers, its
  // routines): beside the sheet, level with it, so the rows under it and
  // their + stay in reach (Task 4).
  const sheet = side === 'top' && el ? el.closest<HTMLElement>('[data-guide-anchor="left"]') : null
  let x: number, y: number, arrow = side
  if (side === 'none' || !r) { x = W - cw - 16; y = 72 }
  else if (sheet && !stacked(sheet)) { x = sheet.getBoundingClientRect().right + 14; y = r.top + r.height / 2 - 28; arrow = 'left' }
  // Beside a fold's sheet, low in the view (Scott, 2026-11-05: it sat over
  // the top of November's list): the period's first lines stay in sight.
  else if (side === 'left') { x = r.right + 14; y = Math.max(r.top + 96, Math.min(r.bottom, H) - ch - 24) }
  else if (side === 'right') { x = r.left - 14 - cw; y = Math.max(r.top + 96, Math.min(r.bottom, H) - ch - 24) }
  else {
    x = r.left + 8; y = r.bottom + 12
    if (y + ch > H - 12 && r.top - ch - 12 > 12) { y = r.top - 12 - ch; arrow = 'bottom' }
    // Never over the sheet folded open at the left: it is the list the step
    // chooses from (Scott, 2026-11-06: "Choose this week's tasks" sat on top
    // of November's list). Beside what the anchor draws (the Week's composer
    // is a short card in a full-width row), else past the sheet's edge.
    const open = findAnchor('left')
    const s = el && open && !stacked(open) && sized(open) && !open.contains(el) ? open.getBoundingClientRect() : null
    if (s && x < s.right && x + cw > s.left && y < s.bottom && y + ch > s.top) {
      const drawn = [...el!.children].map((c) => c.getBoundingClientRect()).filter((c) => c.width > 0)
      const end = drawn.length ? Math.max(...drawn.map((c) => c.right)) : r.right
      if (end + 14 + cw <= W - 12) { x = end + 14; y = r.top; arrow = 'left' }
      else x = s.right + 14
    }
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

/** The short form, remembered on this device (every level, every session). */
const SHORT_KEY = 'symphony-coach:short'
function readShort(): boolean {
  try { return localStorage.getItem(SHORT_KEY) === '1' } catch { return false }
}
function writeShort(v: boolean) {
  try { if (v) localStorage.setItem(SHORT_KEY, '1'); else localStorage.removeItem(SHORT_KEY) } catch { /* private mode: not remembered */ }
}

const buzz = () => { try { navigator.vibrate?.(6) } catch { /* no haptics */ } }

/** A step's one small fact, asked inside its own tooltip (Scott, 2026-11-04:
 *  nothing is added to the page for it). Two kinds:
 *  - `choice`: a few words to pick from (Energy: Low · Medium · High). The
 *    chosen one shows as chosen; a pick saves at once.
 *  - `book`: Year's Share and book, "Book the first Winter session". With
 *    `date`, a tap first opens a day to book (starting on `initial`), and
 *    "Book it" runs it on the day picked. It says when it is done. */
export type CoachAsk = CoachChoiceAsk | CoachBookAsk
export interface CoachChoiceAsk {
  kind: 'choice'
  /** The group's name ("Energy"). */
  label: string
  choices: readonly { value: string; label: string }[]
  /** The one saved now, if any. */
  value?: string
  /** Saves a pick; false when it did not. */
  pick: (value: string) => Promise<boolean>
}
export interface CoachBookAsk {
  kind: 'book'
  label: string
  date?: { label: string; initial: Date }
  /** Said once it has run ("Booked: Plan Winter, Tue, Dec 1"). */
  done: (day?: Date) => string
  run: (day?: Date) => Promise<boolean>
}

const ymdOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const dayOf = (ymd?: string) => {
  const m = ymd && /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined
}
const DIDNT_SAVE = 'Didn’t save. Try again.'

/** Low · Medium · High: the pick shows at once and stays until what is
 *  saved changes (the header's menu, another period), and goes back to what
 *  is saved if it did not save. Only the latest pick counts. */
function ChoiceAsk({ ask }: { ask: CoachChoiceAsk }) {
  const [sent, setSent] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [saved, setSaved] = useState(ask.value)
  if (saved !== ask.value) { setSaved(ask.value); setSent(null) }
  const latest = useRef(0)
  const shown = sent ?? ask.value
  const pick = async (value: string) => {
    const n = ++latest.current
    setSent(value); setFailed(false)
    const ok = await ask.pick(value).catch(() => false)
    if (n !== latest.current) return
    if (!ok) { setSent(null); setFailed(true) }
  }
  return <>
    <div className="coach-choices" role="radiogroup" aria-label={ask.label}>
      {ask.choices.map((c) => <button key={c.value} type="button" role="radio" aria-checked={shown === c.value}
        className={`coach-choice${shown === c.value ? ' is-on' : ''}`} onClick={() => { void pick(c.value) }}>{c.label}</button>)}
    </div>
    {failed && <p className="coach-error" role="alert">{DIDNT_SAVE}</p>}
  </>
}

/** The booking: its button, then (with a date) the day and "Book it"; done,
 *  what was booked. A second tap while it runs does nothing (a ref, not
 *  state: two taps can land before a render). */
function BookAsk({ ask }: { ask: CoachBookAsk }) {
  const [state, setState] = useState<'idle' | 'picking' | 'running' | 'done' | 'failed'>('idle')
  const [day, setDay] = useState<string | undefined>(undefined)
  const busy = useRef(false)
  const run = async (d?: Date) => {
    if (busy.current) return
    busy.current = true
    setState('running')
    const ok = await ask.run(d).catch(() => false)
    busy.current = false
    setState(ok ? 'done' : 'failed')
  }
  const picking = !!ask.date && state !== 'idle'
  return <>
    {state === 'done'
      ? <p className="coach-done" role="status">{ask.done(dayOf(day))}</p>
      : picking
        ? <div className="coach-pick">
          <label className="coach-pick-label">{ask.date!.label}
            <input type="date" className="coach-pick-date" value={day ?? ''} disabled={state === 'running'}
              onChange={(e) => { setDay(e.target.value); if (state === 'failed') setState('picking') }} />
          </label>
          <button type="button" className="coach-action" disabled={state === 'running' || !dayOf(day)}
            onClick={() => { void run(dayOf(day)) }}>Book it</button>
        </div>
        : <button type="button" className="coach-action" disabled={state === 'running'}
          onClick={() => { if (ask.date) { setDay(ymdOf(ask.date.initial)); setState('picking') } else void run() }}>{ask.label}</button>}
    {state === 'failed' && <p className="coach-error" role="alert">{DIDNT_SAVE}</p>}
  </>
}

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
  /** The current step's one small fact, asked in the tooltip, if it has one. */
  ask?: CoachAsk
  /** The words the steps name ("October", "Fall"): wordsIn. */
  words?: StepWords
}

export function GuideCoach({ level, current, word, titleFor, onNext, onBack, onFinish, onStop, error, ask, words }: GuideCoachProps) {
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
  // The short form (Scott, 2026-11-05: "a way to hide tooltips so experts can
  // breeze through"): the step's title with Back and Next, remembered on this
  // device for every session. Its title opens the step's words, for this step.
  const [short, setShort] = useState(readShort)
  const [openFor, setOpenFor] = useState<string | null>(null)
  const full = !short || openFor === step.id
  const setShortForm = (v: boolean) => { setShort(v); writeShort(v); setOpenFor(null); setShows((n) => n + 1) }
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
  const fallback = step.fallback

  // A step shown (a new one, or again): placed now, its entrance replayed
  // (none under reduced motion), then followed while the folds settle
  // (~0.6s; placeCoachSoon).
  useLayoutEffect(() => {
    const coach = ref.current
    if (!coach || hidden) return
    coach.classList.remove('is-in')
    if (!matches('(prefers-reduced-motion: reduce)')) { void coach.offsetWidth; coach.classList.add('is-in') }
    placeCoach(coach, at, fallback)
    return follow(900, () => placeCoach(coach, at, fallback))
  }, [step.id, hidden, shows, at, fallback, full])
  // On scroll (any scroller, so capture) and resize.
  useEffect(() => {
    const coach = ref.current
    const place = () => placeCoach(coach, at, fallback)
    let rt: ReturnType<typeof setTimeout> | undefined
    const onResize = () => { clearTimeout(rt); rt = setTimeout(place, 80) }
    window.addEventListener('scroll', place, { capture: true, passive: true })
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('scroll', place, { capture: true }); window.removeEventListener('resize', onResize); clearTimeout(rt) }
  }, [at, fallback])
  // While it shows, it follows its anchor as the page moves under it: a line
  // written above the write line, a list that grows, a section that loads.
  // The anchor, what holds it, and the page are watched; once a frame.
  useEffect(() => {
    const coach = ref.current
    if (!coach || hidden || typeof ResizeObserver !== 'function') return
    const frame = perFrame(() => placeCoach(coach, at, fallback))
    const ro = new ResizeObserver(frame.run)
    const { el } = anchorOf(at, fallback)
    for (const n of new Set([el, el?.parentElement, document.body])) if (n) ro.observe(n)
    return () => { ro.disconnect(); frame.cancel() }
  }, [step.id, hidden, shows, at, fallback])
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

  const title = wordsIn(titleFor ? titleFor(step) : step.title, words)
  return createPortal(
    <div ref={ref} className={`coach${full ? '' : ' is-short'}`} role="dialog" aria-label="Planning guide" hidden={hidden} data-level={level}>
      <div className="coach-k">
        <span>Step {n} of {m}</span>
        <button type="button" className="coach-form" onClick={() => setShortForm(!short)}
          aria-pressed={short}>{short ? 'Show tips' : 'Hide tips'}</button>
      </div>
      {full
        ? <div className="coach-t">{title}</div>
        : <button type="button" className="coach-t coach-t-open" aria-expanded={false}
          onClick={() => { setOpenFor(step.id); setShows((x) => x + 1) }}>{title} <span aria-hidden="true">▾</span></button>}
      {full && <p className="coach-why">{wordsIn(step.why, words)}</p>}
      {full && <p className="coach-you">{wordsIn(step.you, words)}</p>}
      {/* Keyed by the step: what was picked or booked is that step's alone. */}
      {ask?.kind === 'choice' && <ChoiceAsk key={step.id} ask={ask} />}
      {ask?.kind === 'book' && <BookAsk key={step.id} ask={ask} />}
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
