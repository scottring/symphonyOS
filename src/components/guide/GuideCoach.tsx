// src/components/guide/GuideCoach.tsx
//
// "Show me where things go": the guide's optional coach. On a guided step it
// points to ONE real control on the real page (outlined, with one sentence
// of what and why), waits for the person to use it — watching the saved
// data, not a "Next" click — then says what changed and where it lives.
// It never writes the plan: it reads the tasks list (and the year's goals)
// and records only its own progress in the guide state.
//
// Desktop: a quiet block inside the guide bar, in its tab order. Phone: a
// compact card above the dock that scrolls the control clear of itself and
// steps aside while you type. Esc hides it; the guide carries on.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Check, LocateFixed, X } from 'lucide-react'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { onGoalAdded } from '@/hooks/useGoals'
import { useTextEntryActive } from '@/hooks/useKeyboardInset'
import { ackFor, coachPlan, CONTINUE_POINT, goalAck, landsOnStep, type CoachNames, type CoachPoint } from '@/lib/guide/coach'
import { isSkipped, parseYmd, type CoachSaw, type GuideState, type GuideStep } from '@/lib/guide/guidedPlan'
import type { Task } from '@/types/task'

export interface GuideCoachProps {
  state: GuideState
  step: GuideStep
  names: CoachNames & { week?: string; weekStart?: string }
  mobile: boolean
  /** Esc or ✕: out of sight until the toggle (or the next step) brings it back. */
  hidden: boolean
  onHide: () => void
  /** Keep what the coach saw on this step (or that it was skipped). */
  onRecord: (saw: CoachSaw) => void
  /** The guide bar's own way on, as it reads now ("Mark October planned and continue"). */
  continueLabel: string
}

const CONTINUE_POINTS = [CONTINUE_POINT]

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Laid out on screen (a real browser), or — where nothing has layout, as in
 *  tests — simply in the document and not hidden. */
function visible(el: HTMLElement): boolean {
  if (!el.isConnected || el.closest('[hidden]')) return false
  const hasLayout = document.documentElement.getClientRects().length > 0
  return hasLayout ? el.getClientRects().length > 0 : true
}

interface Found { el: HTMLElement; point: CoachPoint }

function findTarget(points: CoachPoint[]): Found | null {
  for (const point of points) {
    const all = Array.from(document.querySelectorAll<HTMLElement>(`[data-guide-target="${point.target}"]`))
    const list = point.itemId ? all.filter((el) => el.dataset.guideId === point.itemId) : all
    const el = list.find(visible)
    if (el) return { el, point }
  }
  return null
}

/** The first of the points on the page now, followed as the page changes
 *  (lists load, a column opens). Missing → null, and the coach says it in words. */
function useTarget(points: CoachPoint[] | null): Found | null {
  const key = points ? points.map((p) => `${p.target}:${p.itemId ?? ''}`).join('|') : ''
  // The last answer, kept while nothing changed, so the store reads stable.
  const last = useRef<Found | null>(null)
  const subscribe = useCallback((onChange: () => void) => {
    if (!key) return () => {}
    let raf = 0
    const mo = new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; onChange() }) })
    mo.observe(document.body, { childList: true, subtree: true })
    // Once after mount too: the page under the bar may commit after it.
    raf = requestAnimationFrame(() => { raf = 0; onChange() })
    return () => { mo.disconnect(); if (raf) cancelAnimationFrame(raf) }
  }, [key])
  const read = useCallback((): Found | null => {
    // Same key, same targets: the words are read fresh by the caller.
    const f = key && points ? findTarget(points) : null
    const prev = last.current
    if (prev?.el === f?.el && prev?.point.target === f?.point.target && prev?.point.itemId === f?.point.itemId) return prev
    last.current = f
    return f
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` names the points
  }, [key])
  return useSyncExternalStore(subscribe, read, () => null)
}

/** Move to the control and put the cursor there — only when asked. */
function takeThere(el: HTMLElement) {
  el.scrollIntoView?.({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' })
  const focusable = el.matches('input, button, select, textarea, a[href]') ? el : el.querySelector<HTMLElement>('input, button, select, textarea, a[href]')
  focusable?.focus({ preventScroll: true })
}

/**
 * Watches the tasks list for the step's action landing: a task that now sits
 * on the step's period (or today) and didn't when the step began. The hook
 * lists a write only once it has saved, so what's acknowledged is saved.
 */
function TaskWatch({ step, state, onSeen }: { step: GuideStep; state: GuideState; onSeen: (t: Task) => void }) {
  const { tasks, loading, error } = useSupabaseTasks()
  const today = useMemo(() => new Date(), [])
  const base = useRef<Set<string> | null>(null)
  const seen = useRef(onSeen)
  useLayoutEffect(() => { seen.current = onSeen })
  useEffect(() => {
    // Wait for a real reading: a failed load is not "nothing there yet".
    if (loading || (error && !tasks.length)) return
    const now = tasks.filter((t) => landsOnStep(step, t, state, today))
    if (!base.current) { base.current = new Set(now.map((t) => t.id)); return }
    const fresh = now.find((t) => !base.current!.has(t.id))
    if (fresh) { base.current.add(fresh.id); seen.current(fresh) }
  }, [tasks, loading, error, step, state, today])
  return null
}

/** The year's lines are goals: a goal saved for the step's year. */
function GoalWatch({ year, onSeen }: { year: number; onSeen: (title: string, id: string) => void }) {
  const seen = useRef(onSeen)
  useLayoutEffect(() => { seen.current = onSeen })
  useEffect(() => onGoalAdded((g) => { if (g.year === year) seen.current(g.name, g.id) }), [year])
  return null
}

export function GuideCoach({ state, step, names, mobile, hidden, onHide, onRecord, continueLabel }: GuideCoachProps) {
  const plan = coachPlan(step, state, names, { mobile })
  const saw = state.coachDone?.[step]
  const skipped = isSkipped(saw)
  const acked = saw && !skipped ? saw : null
  // Pointing until the action lands; then at the guide's own way on.
  const points = !plan || skipped ? null : acked ? CONTINUE_POINTS : plan.points
  const found = useTarget(hidden ? null : points)
  const typing = useTextEntryActive()
  const cardRef = useRef<HTMLElement>(null)

  // The outline on the real control, and Esc from it.
  useEffect(() => {
    const el = found?.el
    if (!el || hidden) return
    el.setAttribute('data-guide-coach', acked ? 'next' : 'do')
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onHide() }
    el.addEventListener('keydown', onKey)
    return () => { el.removeAttribute('data-guide-coach'); el.removeEventListener('keydown', onKey) }
  }, [found, hidden, acked, onHide])

  // Phone: never sit on top of the control — move it clear of the card.
  useLayoutEffect(() => {
    if (!mobile || hidden || !found || !cardRef.current) return
    const c = cardRef.current.getBoundingClientRect()
    const r = found.el.getBoundingClientRect()
    if (r.bottom > c.top - 8 && r.top < c.bottom) found.el.scrollIntoView?.({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' })
  }, [found, mobile, hidden])

  // Phone: leave room at the foot of the page for the card.
  useLayoutEffect(() => {
    if (!mobile || hidden || !cardRef.current) return
    const root = document.documentElement
    root.style.setProperty('--guide-coach-room', `${Math.ceil(cardRef.current.getBoundingClientRect().height) + 24}px`)
    return () => { root.style.removeProperty('--guide-coach-room') }
  })

  if (!plan || skipped) return null

  const record = (t: Task) => onRecord(ackFor(step, t, new Date(), {
    here: names.here, week: names.week, weekStart: names.weekStart ?? state.periods.week,
    monthName: (d) => d.toLocaleDateString('en-US', { month: 'long' }),
    dayName: (d) => d.toLocaleDateString('en-US', { weekday: 'long' }),
  }))
  const watch = acked ? null : step === 'year'
    ? <GoalWatch year={parseYmd(state.periods.year ?? `${new Date().getFullYear()}-01-01`).getFullYear()} onSeen={(title, id) => onRecord(goalAck(title, id, names.here))} />
    : <TaskWatch step={step} state={state} onSeen={record} />

  if (hidden) return watch

  const point = !acked && found ? plan.points.find((p) => p.target === found.point.target && p.itemId === found.point.itemId) ?? null : null
  const words = acked ? null : point ?? plan.textOnly
  const onKeyDown = (e: ReactKeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onHide() } }

  const card = (
    <aside ref={cardRef} className={`guide-coach${mobile ? ' is-sheet' : ''}${mobile && typing ? ' is-quiet' : ''}${acked ? ' is-saved' : ''}`}
      aria-label="Show me where things go" onKeyDown={onKeyDown}>
      <span className="guide-coach-icon" aria-hidden="true">{acked ? <Check size={15} strokeWidth={2.5} /> : <LocateFixed size={15} />}</span>
      <div className="guide-coach-main">
        {words && (
          <>
            <p className="guide-coach-title">{words.title}</p>
            <p className="guide-coach-body">{words.body}</p>
            {plan.paper && <p className="guide-coach-alt">{plan.paper}</p>}
          </>
        )}
        {/* Announced when the action lands; stays mounted so it is heard. */}
        <div aria-live="polite" className="guide-coach-live">
          {acked && (
            <>
              <p className="guide-coach-title">{acked.saved}</p>
              <p className="guide-coach-body">“{acked.title}”{acked.also ? `. ${acked.also}` : '.'}</p>
              <p className="guide-coach-alt">Add more if you like, or choose “{continueLabel}” when you’re ready.</p>
            </>
          )}
        </div>
        <div className="guide-coach-acts">
          {found && <button type="button" className="pv2-link" onClick={() => takeThere(found.el)}>{acked ? 'Show me' : 'Take me there'}</button>}
          {!acked && <button type="button" className="pv2-link pv2-quiet" onClick={() => onRecord({ skipped: true, at: new Date().toISOString() })}>Skip this</button>}
        </div>
      </div>
      <button type="button" className="guide-coach-hide" onClick={onHide} aria-label="Hide (Esc)" title="Hide (Esc)">
        <X size={14} aria-hidden="true" />
      </button>
    </aside>
  )
  return <>{watch}{mobile ? createPortal(card, document.body) : card}</>
}
