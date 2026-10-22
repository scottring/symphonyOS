// One kid's tablet (2026-10-21; the first draft Scott approved on the
// "Kids Kiosk" canvas). Two layouts of the same day (kidPanelModel):
//
//   * trail: one thing at a time. The day as a row of stops, the one to do
//     NOW large with its timer, NEXT under it, the rest as one line. For a
//     kid who does best with the next step in front of him and the rest of
//     the day out of the way.
//   * list: everything for now, in any order, each with its own check and
//     timer; later today below with times.
//
// Both have a timer for anything (with the sound it ends on) and the
// thought catcher: say or type a thought so it stops pulling at you, and go
// over it with a grown-up at bedtime.
//
// While one of the kid's routines is on (the door panel, 2026-10-22), either
// layout shows that routine as one checklist instead: a picture, the step and
// a big check per row, tap again to undo.
//
// Presentational: the route passes the day, the clock and the handlers; the
// preview passes fixed ones.

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  ArrowUp, Backpack, Bed, BookOpen, Calculator, Droplets, Footprints, GlassWater, Hand, HandPlatter, Moon, Music, PawPrint, Pencil, Pill,
  Puzzle, Shirt, ShoppingBasket, ShowerHead, Smile, Sparkles, Toilet, ToyBrick, Trash2, Utensils, Wind,
  type LucideIcon,
} from 'lucide-react'
import { clockLabel, headTitle, type KidPanel, type KidRoutineNow, type KidStop } from '@/lib/kids/kidPanelModel'
import { stepIcon, type StepIcon } from '@/lib/kids/stepIcon'
import {
  fractionLeft, hasRung, isRunning, leftLabel, pauseTimer, readTimer, resumeTimer, soundKey, startTimer, timerKey, writeTimer, type KidTimer,
} from '@/lib/kids/kidTimer'
import { TIMER_SOUNDS, asTimerSound, playTimerSound, unlockAudio, type TimerSound } from '@/lib/kids/timerSounds'
import { THOUGHT_KINDS, kindLabel, type KidThought, type ThoughtKind } from '@/lib/kids/kidThoughts'
import type { KidLayout } from '@/lib/display/pairing'

export interface KidPanelMember { id: string; name: string; color: string }

export interface KidPanelViewProps {
  member: KidPanelMember
  layout: KidLayout
  panel: KidPanel
  now: Date
  onToggle: (stop: KidStop, done: boolean) => void
  /** Thoughts saved and not yet gone over. */
  thoughts: KidThought[]
  /** Absent: no thought catcher (nowhere to save it). */
  onSaveThought?: (text: string, kind: ThoughtKind | null) => Promise<boolean>
  /** The browser can listen (Web Speech). Fire tablets usually cannot. */
  canListen?: boolean
  /** The preview opens a sheet for its screenshot. */
  initialSheet?: 'timer' | 'thoughts' | 'grownups' | null
  /** Leaving kid mode: a grown-up holds the clock and answers a question.
   *  `note` says what leaving does here. Absent: no way out from the screen. */
  exit?: { note: string; onExit: () => void | Promise<void> }
}

const KID_COLORS: Record<string, string> = {
  blue: '#476d9a', purple: '#7a5a9a', green: '#3b7650', orange: '#bd5c3b', pink: '#b5527a', teal: '#1b6a64',
}
const TIMER_CHOICES = [5, 10, 15, 20, 30, 45]
const HOLD_MS = 2000
/** The real clock, for a tap (the `now` prop is the screen's clock). */
const tapMs = () => Date.now()

const storage = (): Storage | null => {
  try { return typeof localStorage !== 'undefined' ? localStorage : null } catch { return null }
}

/** What follows the short title: "20 minutes — a real book". */
function restOf(stop: KidStop): string | null {
  const rest = stop.title.slice(stop.short.replace(/…$/, '').length).replace(/^[\s,:—–-]+/, '').trim()
  return rest && !stop.short.endsWith('…') ? rest : null
}

const STEP_ICONS: Record<StepIcon, LucideIcon> = {
  trash: Trash2, pullup: ArrowUp, hamper: ShoppingBasket, towel: Wind, floor: Droplets, shower: ShowerHead, teeth: Smile,
  toilet: Toilet, wash: Hand, dressed: Shirt, shoes: Footprints, bag: Backpack, bed: Bed, breakfast: Utensils,
  dishes: HandPlatter, read: BookOpen, music: Music, lights: Moon, pet: PawPrint, math: Calculator, homework: Pencil,
  medicine: Pill, tidy: ToyBrick, puzzle: Puzzle, water: GlassWater, step: Sparkles,
}

/** "Tuesday night", "Wednesday morning". */
function partOfDay(now: Date): string {
  const h = now.getHours()
  const part = h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 19 ? 'evening' : 'night'
  return `${now.toLocaleDateString('en-US', { weekday: 'long' })} ${part}`
}

function Check({ done }: { done: boolean }) {
  return done
    ? <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10.5l4 4 8-9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    : null
}

function Dial({ timer, nowMs }: { timer: KidTimer; nowMs: number }) {
  const f = fractionLeft(timer, nowMs)
  // A wedge from 12 o'clock, clockwise, the size of the time left.
  const a = f * 2 * Math.PI
  const x = 110 + 100 * Math.sin(a)
  const y = 110 - 100 * Math.cos(a)
  const large = f > 0.5 ? 1 : 0
  return (
    <svg className="kk-dial" viewBox="0 0 220 220" role="img" aria-label={`Timer: ${leftLabel(timer, nowMs)} left`}>
      <circle cx="110" cy="110" r="104" className="kk-dial-face" />
      {f >= 0.999 ? <circle cx="110" cy="110" r="100" className="kk-dial-wedge" />
        : f > 0 && <path d={`M110 110 L110 10 A100 100 0 ${large} 1 ${x.toFixed(1)} ${y.toFixed(1)} Z`} className="kk-dial-wedge" />}
      <circle cx="110" cy="110" r="10" className="kk-dial-hub" />
    </svg>
  )
}

export function KidPanelView({ member, layout, panel, now, onToggle, thoughts, onSaveThought, canListen = false, initialSheet = null, exit }: KidPanelViewProps) {
  const color = KID_COLORS[member.color] ?? KID_COLORS.teal
  const nowMs = now.getTime()

  // ── The timer: one at a time, kept across reloads ────────────────────
  const tKey = timerKey(member.id)
  const [timer, setTimerState] = useState<KidTimer | null>(() => readTimer(storage(), tKey))
  const setTimer = useCallback((t: KidTimer | null) => { setTimerState(t); writeTimer(storage(), tKey, t) }, [tKey])
  const [sound, setSoundState] = useState<TimerSound>(() => asTimerSound(storage()?.getItem(soundKey(member.id))))
  const setSound = (s: TimerSound) => { setSoundState(s); try { storage()?.setItem(soundKey(member.id), s) } catch { /* private window */ } }
  const rang = timer != null && hasRung(timer, nowMs)
  const rungFor = useRef<string | null>(null)
  useEffect(() => {
    if (!timer || !rang) return
    const id = `${timer.label}:${timer.endsAt}`
    if (rungFor.current === id) return
    rungFor.current = id
    playTimerSound(sound)
    // Twice more, ten seconds apart, unless someone says OK.
    const a = setTimeout(() => playTimerSound(sound), 10_000)
    const b = setTimeout(() => playTimerSound(sound), 20_000)
    return () => { clearTimeout(a); clearTimeout(b) }
  }, [timer, rang, sound])
  const start = (label: string, minutes: number, stopKey: string | null = null) => { unlockAudio(); setTimer(startTimer(label, minutes, tapMs(), stopKey)) }
  const timerFor = (stop: KidStop) => (timer && timer.stopKey === stop.key ? timer : null)

  const [sheet, setSheet] = useState<'timer' | 'thoughts' | 'grownups' | null>(initialSheet)
  // The way out is hidden from kids: hold the clock for two seconds.
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null)
  const endHold = () => { if (hold.current) clearTimeout(hold.current); hold.current = null }
  const startHold = () => { endHold(); hold.current = setTimeout(() => setSheet('grownups'), HOLD_MS) }
  useEffect(() => endHold, [])

  const done = (stop: KidStop) => {
    if (timer?.stopKey === stop.key) setTimer(null)
    onToggle(stop, true)
  }

  const weekday = now.toLocaleDateString('en-US', { weekday: 'long' })
  const routine = panel.routine
  const title = routine ? member.name : layout === 'trail' ? `${member.name}’s trail` : panel.isWeekend ? `${member.name}’s ${weekday}` : `${member.name}’s afternoon`
  const sub = routine ? partOfDay(now) : panel.isWeekend
    ? `${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · the whole day`
    : panel.dayNote ? `${weekday} · ${panel.dayNote}` : weekday
  const clock = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/i, '')

  const timerControls = (stop: KidStop, big: boolean) => {
    const t = timerFor(stop)
    if (!stop.minutes && !t) return null
    if (!t) {
      return <button type="button" className="kk-btn" onClick={() => start(stop.short, stop.minutes!, stop.key)}>Start {stop.minutes}-minute timer</button>
    }
    return (
      <div className={`kk-timer${big ? ' is-big' : ''}`}>
        {big && <Dial timer={t} nowMs={nowMs} />}
        <span className="kk-timer-left">{leftLabel(t, nowMs)}<small> left</small></span>
        <button type="button" className="kk-btn" onClick={() => setTimer(isRunning(t) ? pauseTimer(t, tapMs()) : resumeTimer(t, tapMs()))}>
          {isRunning(t) ? 'Pause' : 'Keep going'}
        </button>
      </div>
    )
  }

  return (
    <div className={`kid-kiosk ${routine ? 'is-routine' : `is-${layout}`}`} style={{ ['--kid' as string]: color }}>
      <header className="kk-head">
        <span className="kk-face" aria-hidden="true">{member.name.slice(0, 1).toUpperCase()}</span>
        <div className="kk-head-words">
          <h1>{title}</h1>
          <p>{sub}</p>
        </div>
        {exit ? (
          <button
            type="button"
            className="kk-clock"
            aria-label={`${clock}. For grown-ups: press and hold`}
            onPointerDown={startHold}
            onPointerUp={endHold}
            onPointerLeave={endHold}
            onPointerCancel={endHold}
            onContextMenu={(e) => e.preventDefault()}
          >
            {clock}
          </button>
        ) : <span className="kk-clock">{clock}</span>}
      </header>

      <main className="kk-main">
        {routine ? (
          <RoutineChecklist routine={routine} onToggle={(s) => (s.done ? onToggle(s, false) : done(s))} timerControls={timerControls} />
        ) : layout === 'trail' ? (
          <>
            {panel.stops.length > 0 && (
              <section className="kk-trail" aria-label="Today’s trail">
                <div className="kk-lab-row">
                  <span className="kk-lab">{panel.isWeekend ? 'TODAY’S TRAIL' : 'THIS AFTERNOON’S TRAIL'}</span>
                  <span className="kk-count">{panel.doneCount} of {panel.stops.length} stops</span>
                </div>
                <ol>
                  {panel.stops.map((s) => (
                    <li key={s.key} className={s.done ? 'is-done' : s === panel.now ? 'is-now' : s.missed ? 'is-missed' : ''}>
                      <span className="kk-dot"><Check done={s.done} /></span>
                      <span className="kk-stop">{s.short}</span>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {panel.now ? (
              <section className="kk-now" aria-label="Now">
                <div className="kk-now-band">
                  <span className="kk-badge">NOW</span>
                  <span>{panel.now.group ?? 'One thing at a time'}{panel.now.time ? ` · ${clockLabel(panel.now.time)}` : ''}</span>
                </div>
                <div className="kk-now-body">
                  <div>
                    <h2>{panel.now.short}</h2>
                    {restOf(panel.now) && <p className="kk-now-sub">{restOf(panel.now)}</p>}
                  </div>
                  {timerControls(panel.now, true)}
                  <button type="button" className="kk-done" onClick={() => done(panel.now!)}>I did it</button>
                </div>
              </section>
            ) : (
              <section className="kk-now is-clear" aria-label="Now">
                <h2>{panel.stops.length ? 'Trail done!' : 'Nothing on the trail'}</h2>
                <p className="kk-now-sub">{panel.stops.length ? 'Every stop is checked off. Nice work.' : 'A grown-up can add your routines in Symphony.'}</p>
              </section>
            )}

            {panel.next && (
              <section className="kk-next" aria-label="Next">
                <span className="kk-lab">NEXT</span>
                <span className="kk-next-title">{panel.next.short}</span>
                {panel.next.time && <span className="kk-next-time">{clockLabel(panel.next.time)}</span>}
              </section>
            )}
            {panel.later.length > 0 && (
              <section className="kk-later" aria-label="Later">
                <span className="kk-lab">LATER</span>
                <p>{panel.later.map((s) => (s.time ? `${s.short} ${clockLabel(s.time)}` : s.short)).join(' · ')}</p>
              </section>
            )}
            {panel.stops.some((s) => s.done) && (
              <UndoLine stops={panel.stops.filter((s) => s.done)} onUndo={(s) => onToggle(s, false)} />
            )}
          </>
        ) : (
          <>
            <section className="kk-list" aria-label="Now">
              <div className="kk-lab-row">
                <span className="kk-lab">NOW · ANY ORDER YOU LIKE</span>
                <span className="kk-count">{panel.listNow.filter((s) => s.done).length} of {panel.listNow.length} done</span>
              </div>
              {panel.listNow.length === 0 && <p className="kk-empty">Nothing right now. {panel.listLater.length ? 'Later is below.' : 'Enjoy it.'}</p>}
              {panel.listNow.map((s) => (
                <div key={s.key} className={`kk-row${s.done ? ' is-done' : ''}${timerFor(s) ? ' is-timing' : ''}`}>
                  <button type="button" className="kk-check" aria-label={s.done ? `Mark ${s.short} not done` : `Mark ${s.short} done`} aria-pressed={s.done}
                    onClick={() => (s.done ? onToggle(s, false) : done(s))}>
                    <Check done={s.done} />
                  </button>
                  <div className="kk-row-words">
                    <span className="kk-row-title">{s.short}</span>
                    {(restOf(s) || s.group) && <span className="kk-row-sub">{restOf(s) ?? s.group}</span>}
                  </div>
                  {!s.done && timerControls(s, false)}
                </div>
              ))}
            </section>
            {panel.listLater.length > 0 && (
              <section className="kk-tonight" aria-label="Later today">
                <span className="kk-lab">LATER TODAY</span>
                <ul>
                  {panel.listLater.map((s) => (
                    <li key={s.key}><span className="kk-t">{clockLabel(s.time)}</span><span>{s.short}</span></li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>

      <footer className="kk-foot">
        {onSaveThought && (
          <button type="button" className="kk-thought-btn" onClick={() => setSheet('thoughts')}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="7" y="2.5" width="6" height="10" rx="3" /><path d="M4.5 9.5a5.5 5.5 0 0011 0M10 15v2.5" /></svg>
            <span><b>Got a thought?</b><small>Save it for later{thoughts.length ? ` · ${thoughts.length} saved` : ''}</small></span>
          </button>
        )}
        <button type="button" className="kk-btn kk-timer-btn" onClick={() => setSheet('timer')}>
          {timer && !timer.stopKey ? <>{timer.label} · {leftLabel(timer, nowMs)}</> : 'Timer'}
        </button>
      </footer>

      {rang && timer && (
        <div className="kk-overlay" role="alertdialog" aria-label="Time’s up">
          <div className="kk-card kk-ring">
            <h2>Time’s up!</h2>
            <p>{timer.label}</p>
            <button type="button" className="kk-done" onClick={() => setTimer(null)}>OK</button>
          </div>
        </div>
      )}

      {sheet === 'timer' && (
        <div className="kk-overlay" role="dialog" aria-label="Timer" onClick={(e) => { if (e.target === e.currentTarget) setSheet(null) }}>
          <div className="kk-card">
            <h2>Set a timer</h2>
            {timer && !timer.stopKey && (
              <div className="kk-timer is-big">
                <Dial timer={timer} nowMs={nowMs} />
                <span className="kk-timer-left">{leftLabel(timer, nowMs)}<small> left</small></span>
                <button type="button" className="kk-btn" onClick={() => setTimer(isRunning(timer) ? pauseTimer(timer, tapMs()) : resumeTimer(timer, tapMs()))}>{isRunning(timer) ? 'Pause' : 'Keep going'}</button>
                <button type="button" className="kk-btn" onClick={() => setTimer(null)}>Stop</button>
              </div>
            )}
            <div className="kk-chips">
              {TIMER_CHOICES.map((m) => <button key={m} type="button" className="kk-btn" onClick={() => { start('Timer', m); setSheet(null) }}>{m} min</button>)}
            </div>
            <span className="kk-lab">IT ENDS WITH</span>
            <div className="kk-chips">
              {TIMER_SOUNDS.map((s) => (
                <button key={s.id} type="button" className="kk-btn" aria-pressed={sound === s.id} onClick={() => { unlockAudio(); setSound(s.id); playTimerSound(s.id) }}>{s.label}</button>
              ))}
            </div>
            <button type="button" className="kk-btn kk-close" onClick={() => setSheet(null)}>Done</button>
          </div>
        </div>
      )}

      {sheet === 'grownups' && exit && <GrownUpExit note={exit.note} onExit={exit.onExit} onClose={() => setSheet(null)} />}

      {sheet === 'thoughts' && onSaveThought && (
        <ThoughtCatcher
          thoughts={thoughts}
          canListen={canListen}
          backLabel={layout === 'trail' ? 'Back to my trail' : 'Back'}
          timerLine={timer && isRunning(timer) ? `Your timer keeps going · ${leftLabel(timer, nowMs)} left` : null}
          onSave={onSaveThought}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  )
}

/** A question a grown-up answers in their head and a young kid cannot. */
export function gateQuestion(rand: () => number = Math.random): { a: number; b: number } {
  return { a: 3 + Math.floor(rand() * 7), b: 11 + Math.floor(rand() * 9) }
}

/** For grown-ups: answer the question to leave kid mode. */
function GrownUpExit({ note, onExit, onClose }: { note: string; onExit: () => void | Promise<void>; onClose: () => void }) {
  const [q, setQ] = useState(() => gateQuestion())
  const [answer, setAnswer] = useState('')
  const [wrong, setWrong] = useState(false)
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (Number(answer.trim()) !== q.a * q.b) { setWrong(true); setAnswer(''); setQ(gateQuestion()); return }
    setBusy(true)
    try { await onExit() } finally { setBusy(false) }
  }
  return (
    <div className="kk-overlay" role="dialog" aria-label="For grown-ups" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <form className="kk-card" onSubmit={(e) => void submit(e)}>
        <h2>For grown-ups</h2>
        <p className="kk-muted kk-gate-note">{note}</p>
        <label className="kk-field">
          <span className="kk-gate-q">What is {q.a} × {q.b}?</span>
          <input className="kk-gate-input" inputMode="numeric" autoComplete="off" value={answer} onChange={(e) => { setAnswer(e.target.value); setWrong(false) }} autoFocus />
        </label>
        {wrong && <p role="alert" className="kk-error">Not quite. Try this one.</p>}
        <div className="kk-gate-actions">
          <button type="button" className="kk-btn" onClick={onClose}>Back</button>
          <button type="submit" className="kk-done" disabled={busy || !answer.trim()}>{busy ? 'Leaving…' : 'Leave kid mode'}</button>
        </div>
      </form>
    </div>
  )
}

/** The routine that is on now: every step in order, one tap each way. */
function RoutineChecklist({ routine, onToggle, timerControls }: {
  routine: KidRoutineNow
  onToggle: (stop: KidStop) => void
  timerControls: (stop: KidStop, big: boolean) => ReactNode
}) {
  const allDone = routine.doneCount === routine.steps.length
  return (
    <section className="kk-routine" aria-label={routine.title}>
      <div className="kk-routine-head">
        <h2>{routine.title}</h2>
        <span className="kk-count">{routine.doneCount} of {routine.steps.length}</span>
      </div>
      <div className="kk-routine-dots" aria-hidden="true">
        {routine.steps.map((s) => <i key={s.key} className={s.done ? 'is-done' : ''} />)}
      </div>
      <ul className="kk-steps">
        {routine.steps.map((s) => {
          const Icon = STEP_ICONS[stepIcon(s.title)]
          // The whole step, wrapped: the checklist has room the trail doesn't.
          const head = headTitle(s.title)
          const rest = s.title.slice(head.length).replace(/^[\s,:—–(-]+/, '').replace(/\)$/, '').trim() || null
          return (
            <li key={s.key} className={`kk-step${s.done ? ' is-done' : ''}`}>
              <button type="button" aria-pressed={s.done} aria-label={s.done ? `Mark ${head} not done` : `Mark ${head} done`} onClick={() => onToggle(s)}>
                <span className="kk-step-icon"><Icon aria-hidden="true" /></span>
                <span className="kk-step-words">
                  <span className="kk-step-title">{head}</span>
                  {rest && <span className="kk-step-sub">{rest}</span>}
                </span>
                <span className="kk-step-check"><Check done={s.done} /></span>
              </button>
              {!s.done && timerControls(s, false)}
            </li>
          )
        })}
      </ul>
      {allDone && (
        <p className="kk-routine-done" role="status"><Check done />All done</p>
      )}
      {routine.next && (
        <p className="kk-routine-next">Next: <b>{routine.next.title}</b> · {clockLabel(routine.next.time)}</p>
      )}
    </section>
  )
}

/** Took one back by mistake: the last few done, each one tap to undo. */
function UndoLine({ stops, onUndo }: { stops: KidStop[]; onUndo: (s: KidStop) => void }) {
  const [open, setOpen] = useState(false)
  if (!open) return <button type="button" className="kk-link" onClick={() => setOpen(true)}>Checked one by mistake?</button>
  return (
    <div className="kk-undo">
      {stops.map((s) => <button key={s.key} type="button" className="kk-btn" onClick={() => { onUndo(s); setOpen(false) }}>Undo {s.short}</button>)}
      <button type="button" className="kk-link" onClick={() => setOpen(false)}>Never mind</button>
    </div>
  )
}

type Recognition = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null }

function ThoughtCatcher({ thoughts, canListen, backLabel, timerLine, onSave, onClose }: {
  thoughts: KidThought[]
  canListen: boolean
  backLabel: string
  timerLine: string | null
  onSave: (text: string, kind: ThoughtKind | null) => Promise<boolean>
  onClose: () => void
}) {
  const [text, setText] = useState('')
  const [kind, setKind] = useState<ThoughtKind | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [listening, setListening] = useState(false)
  const rec = useRef<Recognition | null>(null)

  const listen = () => {
    const W = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
    const SR = W.SpeechRecognition ?? W.webkitSpeechRecognition
    if (!SR) return
    const r = new SR()
    r.lang = 'en-US'
    r.interimResults = true
    r.continuous = true
    r.onresult = (e) => setText(Array.from(e.results).map((x) => x[0]?.transcript ?? '').join(' ').trim())
    r.onend = () => setListening(false)
    r.onerror = () => setListening(false)
    rec.current = r
    try { r.start(); setListening(true) } catch { setListening(false) }
  }
  const stopListening = () => { rec.current?.stop(); setListening(false) }
  useEffect(() => () => rec.current?.stop(), [])

  const save = async () => {
    if (!text.trim() || busy) return
    setBusy(true)
    setError(null)
    const ok = await onSave(text, kind)
    setBusy(false)
    if (!ok) { setError('That didn’t save. Try again, or tell a grown-up.'); return }
    setText('')
    setKind(null)
    setSaved(true)
  }
  const time = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/i, '')
  const sorted = useMemo(() => [...thoughts].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()), [thoughts])

  return (
    <div className="kk-overlay is-full" role="dialog" aria-label="Thought catcher">
      <div className="kk-thoughts">
        <div className="kk-thoughts-top">
          <button type="button" className="kk-btn" onClick={onClose}>‹ {backLabel}</button>
          {timerLine && <span className="kk-muted">{timerLine}</span>}
        </div>
        <h2>What’s on your mind?</h2>
        <p className="kk-muted">{canListen ? 'Say it or type it.' : 'Type it.'} It stays safe here, so you can get back to what you were doing.</p>

        <div className="kk-catch">
          {canListen && (
            <button type="button" className={`kk-mic${listening ? ' is-on' : ''}`} aria-pressed={listening}
              onPointerDown={(e) => { e.preventDefault(); listen() }} onPointerUp={stopListening} onPointerLeave={() => { if (listening) stopListening() }}>
              <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="7" y="2.5" width="6" height="10" rx="3" /><path d="M4.5 9.5a5.5 5.5 0 0011 0M10 15v2.5" /></svg>
              <span>{listening ? 'Listening…' : 'Hold to talk'}</span>
            </button>
          )}
          <label className="kk-field">
            <span>{canListen ? 'Or type it' : 'Your thought'}</span>
            <textarea value={text} onChange={(e) => { setText(e.target.value); setSaved(false) }} placeholder="I’m thinking about…" maxLength={500} rows={2} />
          </label>
          <span className="kk-lab">WHAT KIND OF THOUGHT? (IF YOU KNOW)</span>
          <div className="kk-kinds">
            {THOUGHT_KINDS.map((k) => (
              <button key={k.id} type="button" className="kk-btn" aria-pressed={kind === k.id} onClick={() => setKind(kind === k.id ? null : k.id)}>{k.label}</button>
            ))}
          </div>
          {error && <p role="alert" className="kk-error">{error}</p>}
          <button type="button" className="kk-done" disabled={!text.trim() || busy} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save it for later'}
          </button>
          {saved && <p role="status" className="kk-saved">Saved. It’ll be here at bedtime.</p>}
        </div>

        {sorted.length > 0 && (
          <section aria-label="Saved thoughts">
            <div className="kk-lab-row">
              <span className="kk-lab">SAVED FOR LATER · {sorted.length}</span>
              <span className="kk-muted">You’ll go over them with a grown-up at bedtime</span>
            </div>
            <ul className="kk-saved-list">
              {sorted.map((t) => (
                <li key={t.id}>
                  <span className="kk-t">{time(t.createdAt)}</span>
                  <span className="kk-saved-text">{t.text}</span>
                  {t.kind && <span className="kk-pill">{kindLabel(t.kind)}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}
        <button type="button" className="kk-done kk-back" onClick={onClose}>{saved ? `Saved · ${backLabel.toLowerCase()}` : backLabel}</button>
      </div>
    </div>
  )
}
