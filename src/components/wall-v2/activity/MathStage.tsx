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
import { Delete, Eraser, Undo2, Minus, Plus, Sparkles, Pencil, Lightbulb } from 'lucide-react'
import type { KidMath, KidMathEntry } from '@/hooks/useKidMath'
import { firstName } from '@/hooks/useKidMath'
import {
  answerOf, answerText, generateSpec, inputReady, KIND_LABEL, LEVEL_LABEL, MATH_KINDS, MAX_LEVEL, MIN_LEVEL, seededRng,
  type MathAnswer, type MathKind, type MathSpec,
} from '@/lib/wall/math/mathProblem'
import { cellsThrough, workedSolution, type Worked, type WorkCell } from '@/lib/wall/math/mathWorked'
import { attempt, MAX_BONUS, MAX_TRIES, HINT_AFTER, type MathRow, type Verdict } from '@/lib/wall/math/mathProgress'
import { shownWording } from '@/lib/wall/math/mathWording'
import { MATH_TOPICS, MAX_TOPICS, toggleTopic, topicLabels } from '@/lib/wall/math/mathTopics'
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

// ─── One problem: the paper and the side column ───

type ProblemRow = Pick<MathRow, 'id' | 'forDate' | 'slot' | 'kind' | 'level' | 'spec' | 'wording' | 'status' | 'tries'>

function celebrate(side: HTMLElement | null) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  const r = side?.getBoundingClientRect()
  const origin = r ? { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height * 0.4) / window.innerHeight } : { x: 0.7, y: 0.4 }
  void confetti({ particleCount: 160, spread: 80, startVelocity: 42, origin, disableForReducedMotion: true })
}

function ProblemView({ row, name, header, eyebrow, onCheck, solved, revealedEnd, under }: {
  row: ProblemRow
  name: string
  /** Above the paper: the kids' buttons, or the practice bar. */
  header: React.ReactNode
  eyebrow: string
  onCheck: (input: { a: string; b: string }) => Verdict | null
  /** The panel shown once it's solved. */
  solved: React.ReactNode
  /** The last walkthrough step's closing line. */
  revealedEnd: React.ReactNode
  /** Under the story (the topics chip). */
  under?: React.ReactNode
}) {
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const [pen, setPen] = useState<Pen>('ink')
  const sideRef = useRef<HTMLElement>(null)
  const ui = uiFor(row.id)
  // Cheap and pure: worked out on every render.
  const worked = workedSolution(row.spec)
  const answer = answerOf(row.spec)
  const words = shownWording(row.spec, row.wording, name)
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
    const verdict = onCheck({ a: ui.a, b: ui.b })
    if (!verdict) return
    if (verdict === 'correct') { set({ msg: null }); celebrate(sideRef.current) }
    else if (verdict === 'reveal') set({ msg: null, step: 0 })
    else set({ msg: verdict === 'hint' ? 'Still not it. Here’s a hint for the first step.' : 'Not quite. Check your work and try again.' })
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
    bottom = solved
  } else if (revealed) {
    const step = Math.min(ui.step, lastStep)
    bottom = (
      <div className="km-panel is-walk" role="status">
        <p className="km-count">Let’s work it through · Step {step + 1} of {worked.steps.length}</p>
        <p className="km-say">{worked.steps[step].say}</p>
        {step === lastStep && revealedEnd}
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
      <section className="km-lead" aria-label={`${name}’s paper`}>
        {header}
        <div className="km-desk">
          <Paper key={row.id} worked={worked} revealedStep={revealed ? Math.min(ui.step, lastStep) : -1} strokes={ui.strokes} pen={pen} onStrokes={(next) => set({ strokes: next })} />
          {tools}
        </div>
      </section>
      <div className="km-rule" />
      <section className="km-side" ref={sideRef} aria-label="The problem">
        <p className="km-eyebrow">{eyebrow} <span className="km-level">{LEVEL_LABEL[row.kind][row.level - 1]}</span></p>
        <p className={`km-story ${showHint || words.story.length > 170 ? 'is-compact' : ''}`}>{words.story}</p>
        {(row.status !== 'open' || answer.type !== 'fraction') && <Expression spec={row.spec} />}
        {under}
        {showHint && <div className="km-hint" role="status"><strong>Not quite · here’s a hint</strong>{words.hint}</div>}
        {bottom}
      </section>
    </div>
  )
}

// ─── Hold to open (the Grown-ups corner, away from small fingers) ───

const HOLD_MS = 700

function HoldButton({ label, onHold }: { label: string; onHold: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [holding, setHolding] = useState(false)
  const stop = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; setHolding(false) }
  const start = () => {
    setHolding(true)
    timer.current = setTimeout(() => { stop(); onHold() }, HOLD_MS)
  }
  useEffect(() => stop, [])
  return (
    <button type="button" className={`km-hold ${holding ? 'is-holding' : ''}`} aria-label={`${label} (press and hold)`}
      onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onHold() }}>
      <span className="km-hold-fill" aria-hidden="true" />
      <span>{label}</span>
      <small>Hold</small>
    </button>
  )
}

// ─── The stage ───

type Mode =
  | { kind: 'kid' }
  | { kind: 'topics' }
  | { kind: 'grownups' }
  | { kind: 'practice'; row: ProblemRow }

export interface MathStageProps {
  math: KidMath
  now: Date
  /** A short confirmation on the wall's flash line. */
  flash?: (msg: string) => void
}

let practiceSeq = 0
function practiceRow(kind: MathKind, level: number): ProblemRow {
  practiceSeq += 1
  const spec = generateSpec(kind, level, seededRng(Date.now() + practiceSeq * 7919))
  return { id: `practice-${practiceSeq}`, forDate: '', slot: 0, kind, level, spec, wording: null, status: 'open', tries: 0 }
}

export function MathStage({ math, now, flash }: MathStageProps) {
  const [mode, setMode] = useState<Mode>({ kind: 'kid' })
  const [practiceKind, setPracticeKind] = useState<MathKind>('divide')
  const [practiceLevel, setPracticeLevel] = useState(3)
  const [confirmReset, setConfirmReset] = useState<string | null>(null)
  const entry: KidMathEntry | undefined = math.kids.find((k) => k.member.id === math.selectedId) ?? math.kids[0]

  useEffect(() => {
    if (!confirmReset) return
    const id = setTimeout(() => setConfirmReset(null), 4000)
    return () => clearTimeout(id)
  }, [confirmReset])

  if (!entry) return <div className="km-empty"><p>Math of the day is for the kids — add them in Settings → Family.</p></div>

  const grownupsButton = <HoldButton label="Grown-ups" onHold={() => setMode({ kind: 'grownups' })} />

  const kidButtons = (
    <div className="km-top">
      <div className="km-kids" role="group" aria-label="Whose problem">
        {math.kids.map((k) => {
          const r = k.current
          const state = !r ? 'Getting ready' : r.status === 'solved' ? 'Solved' : r.status === 'revealed' ? 'Done' : (r.tries || (uiByRow.get(r.id)?.strokes.length ?? 0)) ? 'Working on it' : r.slot > 0 ? `Bonus ${r.slot}` : 'Not started'
          return (
            <button key={k.member.id} type="button" className="km-kid" aria-pressed={k.member.id === entry.member.id} onClick={() => { math.select(k.member.id); setMode({ kind: 'kid' }) }}>
              <Face member={k.member} size="lg" />
              <span className="km-kid-name">{firstName(k.member)}</span>
              {k.streak > 0 && <span className="km-streak" aria-label={`${k.streak} days in a row`}>★ {k.streak}</span>}
              {k.bonusStars > 0 && <span className="km-bonus" aria-label={`${k.bonusStars} bonus today`}>+{k.bonusStars}</span>}
              <span className={`km-state ${r?.status === 'solved' ? 'is-solved' : ''}`}>{r?.status === 'solved' ? '✓ ' : ''}{state}</span>
            </button>
          )
        })}
      </div>
      {grownupsButton}
    </div>
  )

  // ── Grown-ups: practice, and resetting a kid's day ──
  if (mode.kind === 'grownups') {
    return (
      <div className="km-stage is-grownups">
        <section className="km-lead" aria-label="Practice">
          <div className="km-top"><h2 className="km-title">Grown-ups</h2><button type="button" className="km-btn" onClick={() => setMode({ kind: 'kid' })}>Done</button></div>
          <div className="km-card">
            <p className="km-eyebrow">Practice</p>
            <p className="km-copy">Work a problem together, or tap “Show me how” to walk through it on the paper. Nothing is saved and no stars change.</p>
            <div className="km-choices" role="group" aria-label="Problem type">
              {MATH_KINDS.map((k) => (
                <button key={k} type="button" className="km-choice" aria-pressed={practiceKind === k} onClick={() => setPracticeKind(k)}>{KIND_LABEL[k]}</button>
              ))}
            </div>
            <div className="km-levelpick">
              <button type="button" className="km-tool" aria-label="Easier" disabled={practiceLevel <= MIN_LEVEL} onClick={() => setPracticeLevel((l) => l - 1)}><Minus aria-hidden="true" /></button>
              <span><b>Level {practiceLevel}</b><small>{LEVEL_LABEL[practiceKind][practiceLevel - 1]}</small></span>
              <button type="button" className="km-tool" aria-label="Harder" disabled={practiceLevel >= MAX_LEVEL} onClick={() => setPracticeLevel((l) => l + 1)}><Plus aria-hidden="true" /></button>
              <button type="button" className="km-btn is-primary km-start" onClick={() => setMode({ kind: 'practice', row: practiceRow(practiceKind, practiceLevel) })}>Start practice</button>
            </div>
          </div>
        </section>
        <div className="km-rule" />
        <section className="km-side" aria-label="Reset today">
          <p className="km-eyebrow">Reset today</p>
          <p className="km-copy">Gives the kid today’s problem back from the start: no tries used, the paper cleared, bonus problems gone.</p>
          {math.kids.map((k) => {
            const d = k.daily
            const state = !d ? 'Not ready yet' : d.status === 'solved' ? `Solved${k.bonusStars ? ` · +${k.bonusStars} bonus` : ''}` : d.status === 'revealed' ? 'Shown the answer' : d.tries ? `${d.tries} ${d.tries === 1 ? 'try' : 'tries'}` : 'Not started'
            const armed = confirmReset === k.member.id
            return (
              <div key={k.member.id} className="km-reset-row">
                <Face member={k.member} size="md" />
                <span className="km-reset-who"><b>{firstName(k.member)}</b><small>{state}</small></span>
                <button type="button" className={`km-btn ${armed ? 'is-danger' : ''}`} disabled={!d}
                  onClick={async () => {
                    if (!armed) { setConfirmReset(k.member.id); return }
                    setConfirmReset(null)
                    const ids = math.kids.find((x) => x.member.id === k.member.id)?.current?.id
                    const ok = await math.resetToday(k.member.id)
                    if (d) uiByRow.delete(d.id)
                    if (ids) uiByRow.delete(ids)
                    flash?.(ok ? `${firstName(k.member)}’s problem is back to the start` : 'That reset didn’t save')
                  }}>
                  {armed ? 'Tap again to reset' : `Reset ${firstName(k.member)}’s`}
                </button>
              </div>
            )
          })}
        </section>
      </div>
    )
  }

  // ── Practice ──
  if (mode.kind === 'practice') {
    const row = mode.row
    const update = (patch: Partial<ProblemRow>) => setMode({ kind: 'practice', row: { ...row, ...patch } })
    const header = (
      <div className="km-top">
        <h2 className="km-title">Practice</h2>
        <div className="km-row">
          {row.status === 'open' && (
            <button type="button" className="km-btn" onClick={() => { patchUi(row.id, { step: 0 }); update({ status: 'revealed' }) }}><Lightbulb aria-hidden="true" />Show me how</button>
          )}
          <button type="button" className="km-btn" onClick={() => setMode({ kind: 'practice', row: practiceRow(row.kind, row.level) })}><Sparkles aria-hidden="true" />New problem</button>
          <button type="button" className="km-btn" onClick={() => setMode({ kind: 'grownups' })}>Done</button>
        </div>
      </div>
    )
    return (
      <ProblemView
        key={row.id}
        row={row}
        name="you"
        header={header}
        eyebrow={`Practice · ${KIND_LABEL[row.kind]}`}
        onCheck={(input) => { const res = attempt(row, input); update({ status: res.status, tries: res.tries }); return res.verdict }}
        solved={(
          <div className="km-panel is-win" role="status">
            <h3>That’s it!</h3>
            <p>The answer is {answerText(answerOf(row.spec))}.</p>
            <div className="km-row"><button type="button" className="km-btn is-primary" onClick={() => setMode({ kind: 'practice', row: practiceRow(row.kind, row.level) })}><Sparkles aria-hidden="true" />Another one</button></div>
          </div>
        )}
        revealedEnd={<div className="km-row"><button type="button" className="km-btn" onClick={() => setMode({ kind: 'practice', row: practiceRow(row.kind, row.level) })}><Sparkles aria-hidden="true" />Another one</button></div>}
      />
    )
  }

  const row = entry.current
  const name = firstName(entry.member)

  // ── A kid picking what their stories are about ──
  if (mode.kind === 'topics') {
    return (
      <div className="km-stage is-topics">
        <section className="km-lead" aria-label="Topics">
          {kidButtons}
          <div className="km-topics" role="group" aria-label={`What ${name} likes`}>
            {MATH_TOPICS.map((t) => (
              <button key={t.id} type="button" className="km-topic" aria-pressed={entry.topics.includes(t.id)}
                onClick={() => math.setTopics(entry.member.id, toggleTopic(entry.topics, t.id))}>{t.label}</button>
            ))}
          </div>
        </section>
        <div className="km-rule" />
        <section className="km-side">
          <p className="km-eyebrow">Stories about…</p>
          <p className="km-story">What do you like, {name}? Pick up to {MAX_TOPICS}, and your next math stories will be about them.</p>
          <p className="km-copy">{entry.topics.length ? `Picked: ${topicLabels(entry.topics).join(', ')}` : 'Nothing picked yet.'}</p>
          <div className="km-row"><button type="button" className="km-btn is-primary" onClick={() => setMode({ kind: 'kid' })}>Done</button></div>
        </section>
      </div>
    )
  }

  if (!row) {
    return (
      <div className="km-stage">
        <section className="km-lead">{kidButtons}<div className="km-paper is-waiting"><p>Getting {name}’s problem ready…</p></div></section>
        <div className="km-rule" />
        <section className="km-side" />
      </div>
    )
  }

  const weekday = WEEKDAY[new Date(`${row.forDate}T12:00:00`).getDay()]
  const isToday = weekday === WEEKDAY[now.getDay()]
  const eyebrow = row.slot > 0
    ? `Bonus ${row.slot} of ${MAX_BONUS} · ${KIND_LABEL[row.kind]}`
    : `${isToday ? '' : `${weekday} · `}${KIND_LABEL[row.kind]}`
  const answer = answerOf(row.spec)
  const more = async () => {
    const ok = await math.addBonus(entry.member.id)
    if (!ok) flash?.('Couldn’t get another problem')
  }
  const bonusButton = entry.canBonus && (
    <button type="button" className="km-btn is-primary" onClick={() => void more()}>
      <Sparkles aria-hidden="true" />Want another? {row.slot === 0 ? 'A bonus, a little harder' : `Bonus ${row.slot + 1} of ${MAX_BONUS}`}
    </button>
  )
  const topicsChip = (
    <button type="button" className="km-chip" onClick={() => setMode({ kind: 'topics' })}>
      <Pencil aria-hidden="true" />{entry.topics.length ? `Next stories: ${topicLabels(entry.topics).join(', ').toLowerCase()}` : 'What should your stories be about?'}
    </button>
  )
  const solved = row.slot === 0 ? (
    <div className="km-panel is-win" role="status">
      <p className="km-bigstar">★ {entry.streak} {entry.streak === 1 ? 'day' : 'days in a row'}</p>
      <h3>You got it!</h3>
      <p>The answer is {answerText(answer)}.</p>
      {bonusButton || <p className="km-muted">A new problem comes tomorrow.</p>}
      {topicsChip}
    </div>
  ) : (
    <div className="km-panel is-win" role="status">
      <p className="km-bigstar">+{entry.bonusStars} bonus ★</p>
      <h3>Bonus solved!</h3>
      <p>The answer is {answerText(answer)}.</p>
      {bonusButton || <p className="km-muted">That’s every bonus for today. A new problem comes tomorrow.</p>}
      {topicsChip}
    </div>
  )
  const revealedEnd = (
    <>
      <p className="km-muted">{row.slot === 0 ? `Done for today. ${entry.streak ? `Your ★ stays at ${entry.streak}.` : ''}` : 'That one was tricky.'}</p>
      {bonusButton}
    </>
  )
  return (
    <ProblemView
      key={row.id}
      row={row}
      name={name}
      header={kidButtons}
      eyebrow={eyebrow}
      onCheck={(input) => math.check(row.id, input)}
      solved={solved}
      revealedEnd={revealedEnd}
    />
  )
}
