// Math of the day on the kitchen wall (Scott, 2026-10-14 — "absolutely
// incredible, ship it"; mockup "Math of the Day"). The lead column is grid
// paper a kid works on with a finger (pens, eraser, undo, clear) under their
// own button with their streak; the side column is the problem, the answer
// boxes and a number pad. A miss keeps the answer; the second shows the hint;
// the third walks through the solution step by step, drawn onto the paper.
//
// Presentation only: useKidMath (the Shell's) owns the rows and every write.
// The drawing and what's typed live here, per problem, for as long as the
// wall stays open; they are never saved.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import confetti from 'canvas-confetti'
import { Delete, Eraser, Undo2 } from 'lucide-react'
import type { KidMath, KidMathEntry } from '@/hooks/useKidMath'
import { firstName } from '@/hooks/useKidMath'
import { answerOf, inputReady, KIND_LABEL, LEVEL_LABEL, type MathAnswer, type MathSpec } from '@/lib/wall/math/mathProblem'
import { cellsThrough, workedSolution, type Worked, type WorkCell } from '@/lib/wall/math/mathWorked'
import { MAX_TRIES, HINT_AFTER, type MathRow } from '@/lib/wall/math/mathProgress'
import { shownWording } from '@/lib/wall/math/mathWording'
import { Face } from './KioskHomeV1'

// ─── What a kid has on the go, per problem (kept while the wall is open) ───

type Pen = 'ink' | 'sym' | 'now' | 'erase'
interface Stroke { pen: Pen; pts: [number, number][] }
interface KidUi {
  a: string
  b: string
  focus: 'a' | 'b'
  msg: string | null
  step: number
  strokes: Stroke[]
}

const uiByRow = new Map<string, KidUi>()
const EMPTY_UI: KidUi = { a: '', b: '', focus: 'a', msg: null, step: 0, strokes: [] }
const uiFor = (rowId: string): KidUi => uiByRow.get(rowId) ?? EMPTY_UI
/** Replace a problem's state (never mutate it: the stage renders from it). */
function patchUi(rowId: string, patch: Partial<KidUi>) {
  uiByRow.set(rowId, { ...uiFor(rowId), ...patch })
}

const MAX_DIGITS = 6
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** One design pixel, as kiosk-v1.css computes --p. */
const designPx = () => Math.min(window.innerWidth / 1920, window.innerHeight / 1080) || 1

// ─── Grid paper ───

function Cell({ c, cell }: { c: WorkCell; cell: number }) {
  return (
    <span
      className={`km-cell is-${c.tone}`}
      style={{
        left: `calc(${c.col * cell + (c.nudge ?? 0)} * var(--p))`,
        top: `calc(${c.row * cell} * var(--p))`,
      }}
    >{c.text}</span>
  )
}

function Paper({ worked, revealedStep, strokes, pen, onStrokes }: {
  worked: Worked
  /** -1 = nothing revealed; else the walkthrough's current step. */
  revealedStep: number
  strokes: Stroke[]
  pen: Pen
  onStrokes: (next: Stroke[]) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const live = useRef<Stroke | null>(null)
  const cell = worked.rows >= 10 ? 60 : 64
  const shown = useMemo(() => (revealedStep >= 0 ? cellsThrough(worked, revealedStep) : { cells: [], bars: [] }), [worked, revealedStep])

  const color = useCallback((p: Pen) => {
    const el = canvasRef.current
    if (!el) return '#000'
    const v = getComputedStyle(el).getPropertyValue(p === 'sym' ? '--kw-sym' : p === 'now' ? '--kw-now' : '--kw-ink').trim()
    return v || '#1e2628'
  }, [])

  const draw = useCallback((ctx: CanvasRenderingContext2D, s: Stroke, from = 0) => {
    ctx.save()
    ctx.globalCompositeOperation = s.pen === 'erase' ? 'destination-out' : 'source-over'
    ctx.strokeStyle = s.pen === 'erase' ? '#000' : color(s.pen)
    ctx.lineWidth = s.pen === 'erase' ? 44 : 5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    const pts = s.pts.slice(Math.max(0, from - 1))
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    if (pts.length === 1) ctx.lineTo(pts[0][0] + 0.1, pts[0][1])
    ctx.stroke()
    ctx.restore()
  }, [color])

  const context = useCallback(() => {
    const el = canvasRef.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx) return null
    const scale = (window.devicePixelRatio || 1) * designPx()
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    return ctx
  }, [])

  const redraw = useCallback(() => {
    const el = canvasRef.current
    const ctx = context()
    if (!el || !ctx) return
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, el.width, el.height); ctx.restore()
    strokes.forEach((s) => draw(ctx, s))
  }, [context, draw, strokes])

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const size = () => {
      const r = el.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      el.width = Math.max(1, Math.round(r.width * dpr))
      el.height = Math.max(1, Math.round(r.height * dpr))
      redraw()
    }
    size()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(size)
    ro.observe(el)
    return () => ro.disconnect()
  }, [redraw])

  const at = (e: ReactPointerEvent<HTMLCanvasElement> | PointerEvent): [number, number] => {
    const r = canvasRef.current!.getBoundingClientRect()
    const p = designPx()
    return [(e.clientX - r.left) / p, (e.clientY - r.top) / p]
  }

  const down = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const s: Stroke = { pen, pts: [at(e)] }
    live.current = s
    // The stroke grows in place as the finger moves (drawn as it goes); the
    // list itself is replaced so the stage knows there's work on the paper.
    onStrokes([...strokes, s])
  }
  const move = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const s = live.current
    if (!s) return
    const from = s.pts.length
    const evs = e.nativeEvent.getCoalescedEvents?.() ?? []
    if (evs.length) evs.forEach((ev) => s.pts.push(at(ev)))
    else s.pts.push(at(e))
    const ctx = context()
    if (ctx) draw(ctx, s, from)
  }
  const up = () => { live.current = null }

  return (
    <div className={`km-paper ${revealedStep >= 0 ? 'is-revealed' : ''}`} style={{ ['--km-cell' as string]: `calc(${cell} * var(--p))` }}>
      <div className="km-printed" aria-hidden="true">
        {worked.given.map((c, i) => <Cell key={`g${i}`} c={c} cell={cell} />)}
        {worked.givenBars.map((b, i) => (
          <span key={`gb${i}`} className="km-bar is-given" style={{ left: `calc(${b.col * cell + 6} * var(--p))`, width: `calc(${b.span * cell - 12} * var(--p))`, top: `calc(${(b.row + 1) * cell - 3} * var(--p))` }} />
        ))}
        {worked.bracket && (
          <span className="km-bracket" style={{
            left: `calc(${worked.bracket.col * cell - 8} * var(--p))`,
            top: `calc(${worked.bracket.row * cell + 4} * var(--p))`,
            width: `calc(${worked.bracket.span * cell + 14} * var(--p))`,
            height: `calc(${cell - 6} * var(--p))`,
          }} />
        )}
      </div>
      <canvas
        ref={canvasRef}
        className="km-ink"
        aria-label="Grid paper. Work out the problem here with your finger."
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      />
      <div className="km-overlay" aria-hidden="true">
        {shown.cells.map((c) => <Cell key={`${c.col}:${c.row}`} c={c} cell={cell} />)}
        {shown.bars.map((b, i) => (
          <span key={`b${i}`} className="km-bar" style={{ left: `calc(${b.col * cell + 8} * var(--p))`, width: `calc(${b.span * cell - 16} * var(--p))`, top: `calc(${(b.row + 1) * cell - 3} * var(--p))` }} />
        ))}
      </div>
      <span className="km-paper-note">Your work clears tomorrow</span>
    </div>
  )
}

// ─── Side column pieces ───

function FracText({ n, d }: { n: number | string; d: number | string }) {
  return <span className="km-frac"><span>{n}</span><span>{d}</span></span>
}

/** The bare problem, large, for problems not printed on the paper. */
function Expression({ spec }: { spec: MathSpec }) {
  if (spec.kind !== 'fraction') return null
  return (
    <p className="km-expr" aria-label={spec.form === 'of' ? `${spec.x.n}/${spec.x.d} of ${spec.whole}` : undefined}>
      <FracText n={spec.x.n} d={spec.x.d} />
      {spec.form === 'of' ? <span className="km-op">of {spec.whole}</span> : <><span className="km-op">{spec.form === 'add' ? '+' : '−'}</span><FracText n={spec.y.n} d={spec.y.d} /></>}
    </p>
  )
}

function Box({ field, ui, label, short, on, onFocus }: { field: 'a' | 'b'; ui: KidUi; label: string; short?: boolean; on: boolean; onFocus: () => void }) {
  const v = ui[field]
  return (
    <button type="button" className={`km-box ${short ? 'is-short' : ''}`} aria-pressed={on} aria-label={`${label}${v ? `: ${v}` : ''}`} onClick={onFocus}>
      {v || (!on && <span className="km-ph">?</span>)}
      {on && <span className="km-caret" aria-hidden="true" />}
    </button>
  )
}

function Answer({ answer, ui, labels, onFocus }: { answer: MathAnswer; ui: KidUi; labels: string[]; onFocus: (f: 'a' | 'b') => void }) {
  if (answer.type === 'fraction') {
    return (
      <div className="km-answer is-frac">
        <div className="km-frac-boxes">
          <Box field="a" ui={ui} label="Top" on={ui.focus === 'a'} onFocus={() => onFocus('a')} short />
          <span className="km-frac-line" aria-hidden="true" />
          <Box field="b" ui={ui} label="Bottom" on={ui.focus === 'b'} onFocus={() => onFocus('b')} short />
        </div>
        <small>Top, then bottom</small>
      </div>
    )
  }
  return (
    <div className="km-answer">
      <div className="km-slot">
        <Box field="a" ui={ui} label={labels[0]} on={ui.focus === 'a'} onFocus={() => onFocus('a')} />
        <small>{labels[0]}</small>
      </div>
      {answer.type === 'remainder' && (
        <>
          <span className="km-r" aria-hidden="true">R</span>
          <div className="km-slot">
            <Box field="b" ui={ui} label={labels[1]} on={ui.focus === 'b'} onFocus={() => onFocus('b')} short />
            <small>{labels[1]}</small>
          </div>
        </>
      )}
    </div>
  )
}

// ─── The stage ───

export interface MathStageProps {
  math: KidMath
  now: Date
}

export function MathStage({ math, now }: MathStageProps) {
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const [pen, setPen] = useState<Pen>('ink')
  const entry: KidMathEntry | undefined = math.kids.find((k) => k.member.id === math.selectedId) ?? math.kids[0]
  const row: MathRow | null = entry?.today ?? null
  const ui = row ? uiFor(row.id) : null
  // Cheap and pure: worked out on every render.
  const worked = row ? workedSolution(row.spec) : null
  const answer = row ? answerOf(row.spec) : null
  const sideRef = useRef<HTMLElement>(null)

  if (!entry) return <div className="km-empty"><p>Math of the day is for the kids — add them in Settings → Family.</p></div>

  const kidButtons = (
    <div className="km-kids" role="group" aria-label="Whose problem">
      {math.kids.map((k) => {
        const r = k.today
        const state = !r ? 'Getting ready' : r.status === 'solved' ? 'Solved' : r.status === 'revealed' ? 'Done' : (r.tries || (uiByRow.get(r.id)?.strokes.length ?? 0)) ? 'Working on it' : 'Not started'
        return (
          <button key={k.member.id} type="button" className="km-kid" aria-pressed={k.member.id === entry.member.id} onClick={() => math.select(k.member.id)}>
            <Face member={k.member} size="lg" />
            <span className="km-kid-name">{firstName(k.member)}</span>
            {k.streak > 0 && <span className="km-streak" aria-label={`${k.streak} days in a row`}>★ {k.streak}</span>}
            <span className={`km-state ${r?.status === 'solved' ? 'is-solved' : ''}`}>{r?.status === 'solved' ? '✓ ' : ''}{state}</span>
          </button>
        )
      })}
    </div>
  )

  if (!row || !ui || !worked || !answer) {
    return (
      <div className="km-stage">
        <section className="km-lead">{kidButtons}<div className="km-paper is-waiting"><p>Getting {firstName(entry.member)}’s problem ready…</p></div></section>
        <div className="km-rule" />
        <section className="km-side" />
      </div>
    )
  }

  const words = shownWording(row.spec, row.wording, firstName(entry.member))
  const weekday = WEEKDAY[new Date(`${row.forDate}T12:00:00`).getDay()]
  const revealed = row.status === 'revealed'
  // The walkthrough replaces the hint (and needs its room).
  const showHint = row.status === 'open' && row.tries >= HINT_AFTER
  const lastStep = worked.steps.length - 1

  const set = (patch: Partial<KidUi>) => { patchUi(row.id, patch); rerender() }

  const type = (key: string) => {
    if (row.status !== 'open') return
    const cur = ui[ui.focus]
    if (key === 'back') set({ [ui.focus]: cur.slice(0, -1) })
    else if (cur.length < MAX_DIGITS) set({ [ui.focus]: (cur + key).replace(/^0+(?=\d)/, '') })
  }

  const check = () => {
    if (!inputReady(answer, ui)) return
    const verdict = math.check(entry.member.id, { a: ui.a, b: ui.b })
    if (!verdict) return
    if (verdict === 'correct') {
      set({ msg: null })
      if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        const r = sideRef.current?.getBoundingClientRect()
        const origin = r ? { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height * 0.4) / window.innerHeight } : { x: 0.7, y: 0.4 }
        void confetti({ particleCount: 160, spread: 80, startVelocity: 42, origin, disableForReducedMotion: true })
      }
    } else if (verdict === 'reveal') {
      set({ msg: null, step: 0 })
    } else {
      set({ msg: verdict === 'hint' ? 'Still not it. Here’s a hint for the first step.' : 'Not quite. Check your work and try again.' })
    }
  }

  const tools = (
    <div className="km-tools" role="toolbar" aria-label="Pens">
      {(['ink', 'sym', 'now'] as const).map((p) => (
        <button key={p} type="button" className="km-tool" aria-pressed={pen === p} aria-label={p === 'ink' ? 'Dark pen' : p === 'sym' ? 'Green pen' : 'Orange pen'} onClick={() => setPen(p)}>
          <span className={`km-dot is-${p}`} />
        </button>
      ))}
      <button type="button" className="km-tool" aria-pressed={pen === 'erase'} aria-label="Eraser" onClick={() => setPen('erase')}><Eraser aria-hidden="true" /></button>
      <span className="km-tool-gap" />
      <button type="button" className="km-tool" aria-label="Undo" onClick={() => set({ strokes: ui.strokes.slice(0, -1) })}><Undo2 aria-hidden="true" /></button>
      <button type="button" className="km-tool is-label" onClick={() => set({ strokes: [] })}>Clear</button>
    </div>
  )

  let bottom
  if (row.status === 'solved') {
    bottom = (
      <div className="km-panel is-win" role="status">
        <p className="km-bigstar">★ {entry.streak} {entry.streak === 1 ? 'day' : 'days in a row'}</p>
        <h3>You got it!</h3>
        <p>The answer is {answer.type === 'remainder' ? `${answer.quotient} R${answer.remainder}` : answer.type === 'fraction' ? `${answer.n}/${answer.d}` : answer.value}. A new problem comes tomorrow.</p>
      </div>
    )
  } else if (revealed) {
    const step = Math.min(ui.step, lastStep)
    bottom = (
      <div className="km-panel is-walk" role="status">
        <p className="km-count">Let’s work it through · Step {step + 1} of {worked.steps.length}</p>
        <p className="km-say">{worked.steps[step].say}</p>
        {step === lastStep && <p className="km-muted">Done for today. {entry.streak ? `Your ★ stays at ${entry.streak}.` : ''} Tomorrow is a fresh one.</p>}
        <div className="km-row">
          <button type="button" className="km-btn" disabled={step === 0} onClick={() => set({ step: step - 1 })}>Back</button>
          <button type="button" className="km-btn is-primary" disabled={step === lastStep} onClick={() => set({ step: step + 1 })}>Next step</button>
        </div>
      </div>
    )
  } else {
    bottom = (
      <>
        <div className="km-answer-row">
          {/* A fraction is answered beside the problem: 1/4 + 3/8 = □/□. */}
          {answer.type === 'fraction' && <><Expression spec={row.spec} /><span className="km-equals" aria-hidden="true">=</span></>}
          <Answer answer={answer} ui={ui} labels={words.labels} onFocus={(f) => set({ focus: f })} />
          <div className="km-tries" aria-label={`${row.tries} of ${MAX_TRIES} tries used`}>
            Tries<span>{Array.from({ length: MAX_TRIES }, (_, i) => <i key={i} className={i < row.tries ? 'is-used' : ''} />)}</span>
          </div>
        </div>
        {/* Once the hint is up it says what the miss line would; the pad needs the room. */}
        {!showHint && <p className={`km-feedback ${ui.msg ? 'is-warn' : ''}`} aria-live="polite">{ui.msg ?? 'Work it out on the paper, then tap your answer.'}</p>}
        <div className="km-pad">
          {['1', '2', '3', '4', '5'].map((k) => <button key={k} type="button" className="km-key" onClick={() => type(k)}>{k}</button>)}
          <button type="button" className="km-key" aria-label="Delete" onClick={() => type('back')}><Delete aria-hidden="true" /></button>
          {['6', '7', '8', '9', '0'].map((k) => <button key={k} type="button" className="km-key" onClick={() => type(k)}>{k}</button>)}
          <button type="button" className="km-key is-check" disabled={!inputReady(answer, ui)} onClick={check}>Check</button>
        </div>
      </>
    )
  }

  return (
    <div className="km-stage" data-kind={row.kind}>
      <section className="km-lead" aria-label={`${firstName(entry.member)}’s paper`}>
        {kidButtons}
        <div className="km-desk">
          <Paper key={row.id} worked={worked} revealedStep={revealed ? Math.min(ui.step, lastStep) : -1} strokes={ui.strokes} pen={pen} onStrokes={(next) => set({ strokes: next })} />
          {tools}
        </div>
      </section>
      <div className="km-rule" />
      <section className="km-side" ref={sideRef} aria-label="The problem">
        <p className="km-eyebrow">{weekday === WEEKDAY[now.getDay()] ? '' : `${weekday} · `}{KIND_LABEL[row.kind]} <span className="km-level">{LEVEL_LABEL[row.kind][row.level - 1]}</span></p>
        <p className={`km-story ${showHint || words.story.length > 170 ? 'is-compact' : ''}`}>{words.story}</p>
        {(row.status !== 'open' || answer.type !== 'fraction') && <Expression spec={row.spec} />}
        {showHint && <div className="km-hint" role="status"><strong>Not quite · here’s a hint</strong>{words.hint}</div>}
        {bottom}
      </section>
    </div>
  )
}
