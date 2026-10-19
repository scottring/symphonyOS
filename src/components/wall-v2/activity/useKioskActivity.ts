// The kiosk's activity state, wired to the device: the pure reducer
// (lib/wall/activity/kioskActivity), today's kitchen + departure persisted in
// localStorage (a reload or a build auto-reload restores cooking exactly),
// a clock that ticks while anything time-based is on screen, the idle rule,
// and the alarm when a timer finishes (rings until stopped; see kioskAlarm).

import { useCallback, useEffect, useReducer, useRef, useState, type Dispatch } from 'react'
import {
  kioskReducer, initialKioskState, kitchenRecord, readKitchen, writeKitchen, readDeparture, writeDeparture,
  currentStage, KIOSK_IDLE_MS, KITCHEN_KEY_PREFIX, DEPARTURE_KEY_PREFIX,
  type KioskEvent, type KioskState, type HoldContext,
} from '@/lib/wall/activity/kioskActivity'
import { isTimerDone } from '@/lib/wall/activity/kioskTimers'
import { finishedLive, ringDue, ringingTimers } from '@/lib/wall/activity/kioskAlarm'

const safeStorage = (): Storage | null => {
  try { return typeof localStorage !== 'undefined' ? localStorage : null } catch { return null }
}

/** Drop other days' kitchen/departure records so the Pi's storage never grows. */
function pruneOtherDays(store: Storage | null, dateKey: string) {
  if (!store) return
  try {
    const stale: string[] = []
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i)
      if (!k) continue
      if ((k.startsWith(KITCHEN_KEY_PREFIX) || k.startsWith(DEPARTURE_KEY_PREFIX)) && !k.endsWith(dateKey)) stale.push(k)
    }
    stale.forEach((k) => store.removeItem(k))
  } catch { /* best effort */ }
}

function init(dateKey: string): KioskState {
  const store = safeStorage()
  const kitchen = readKitchen(store, dateKey)
  const departure = readDeparture(store, dateKey)
  return initialKioskState(dateKey, {
    cooking: kitchen?.cooking ?? null,
    timers: kitchen?.timers ?? [],
    onCookingStage: kitchen?.onCookingStage ?? false,
    departure: departure ?? undefined,
  })
}

/** One AudioContext for the page, resumed on every touch, so a ring that
 *  comes minutes after the last tap isn't blocked by the autoplay rule. */
let audio: AudioContext | null = null
function audioContext(): AudioContext | null {
  try {
    if (!audio) {
      const Ctx = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctx) return null
      audio = new Ctx()
    }
    if (audio.state === 'suspended') void audio.resume()
    return audio
  } catch { return null }
}

/** A kitchen-timer ring: four quick beeps through Web Audio, no asset to
 *  load. Silent when the browser blocks audio. */
function ring() {
  const ctx = audioContext()
  if (!ctx) return
  try {
    ;[0, 0.18, 0.36, 0.54].forEach((t) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = 1046
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + t)
      gain.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + t + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.12)
      osc.connect(gain).connect(ctx.destination)
      osc.start(ctx.currentTime + t)
      osc.stop(ctx.currentTime + t + 0.14)
    })
  } catch { /* no audio on this device */ }
}

export interface KioskActivity {
  state: KioskState
  dispatch: Dispatch<KioskEvent>
  /** Epoch ms, ticking every second while timers, cooking or a departure
   *  countdown are on screen; otherwise once a minute. */
  nowMs: number
  /** Call from a capture-phase pointerdown on the kiosk root. */
  touched: () => void
  /** Facts the idle rule needs from the household's data (bedtime under way). */
  setHold: (ctx: HoldContext) => void
}

export interface KioskActivityOptions {
  /** Start from this state instead of today's saved kitchen (fixtures). */
  initial?: KioskState
  /** Hold the clock still at this epoch ms (fixtures / screenshots). */
  fixedNow?: number
  /** Save to and read from localStorage. Default true. */
  persist?: boolean
}

export function useKioskActivity(dateKey: string, opts: KioskActivityOptions = {}): KioskActivity {
  const persist = opts.persist ?? true
  const [state, dispatch] = useReducer(kioskReducer, dateKey, (k) => opts.initial ?? (persist ? init(k) : initialKioskState(k)))

  // Persist today's kitchen and departure whenever they change.
  const onCookingStage = currentStage(state).kind === 'cooking'
  useEffect(() => {
    if (persist) writeKitchen(safeStorage(), state.dateKey, kitchenRecord(state))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.cooking, state.timers, onCookingStage, state.dateKey, persist])
  useEffect(() => {
    if (persist) writeDeparture(safeStorage(), state.dateKey, state.departure)
  }, [state.departure, state.dateKey, persist])
  useEffect(() => { if (persist) pruneOtherDays(safeStorage(), dateKey) }, [dateKey, persist])
  useEffect(() => { dispatch({ type: 'NEW_DAY', dateKey }) }, [dateKey])

  // The clock.
  const [nowMs, setNowMs] = useState(() => Date.now())
  const stageKind = currentStage(state).kind
  const fast = state.timers.length > 0 || state.cooking !== null || stageKind === 'departure'
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), fast ? 1000 : 60_000)
    return () => clearInterval(id)
  }, [fast])
  // A timer started since the last tick reads from its own start, not from
  // the stale tick (a new 5-minute timer shows 5:00, never 5:01).
  const shownNow = opts.fixedNow ?? state.timers.reduce((n, t) => Math.max(n, t.endsAt - t.totalMs), nowMs)

  // The alarm: a timer that finishes while the wall is watching rings until
  // it's stopped or given +1 min (which re-arms it), and goes quiet after
  // five minutes. One that finished while the page was closed only shows Done.
  const judged = useRef<Set<string>>(new Set())
  const live = useRef<Set<string>>(new Set())
  const lastRang = useRef(0)
  useEffect(() => {
    if (opts.fixedNow !== undefined) return
    const ids = new Set(state.timers.map((t) => t.id))
    for (const set of [judged.current, live.current]) for (const id of [...set]) if (!ids.has(id)) set.delete(id)
    for (const t of state.timers) {
      if (!isTimerDone(t, shownNow)) { judged.current.delete(t.id); live.current.delete(t.id); continue }
      if (judged.current.has(t.id)) continue
      judged.current.add(t.id)
      if (finishedLive(t, shownNow)) live.current.add(t.id)
    }
    if (ringDue(ringingTimers(state.timers, live.current, shownNow), lastRang.current, shownNow)) {
      lastRang.current = shownNow
      ring()
    }
  }, [state.timers, shownNow, opts.fixedNow])

  // Idle: only an untouched browsing screen goes home (the reducer decides
  // what counts — activities in progress never time out).
  const holdRef = useRef<HoldContext>({ bedtimeInProgress: false })
  const setHold = useCallback((ctx: HoldContext) => { holdRef.current = ctx }, [])
  const [touchVersion, setTouchVersion] = useState(0)
  const touched = useCallback(() => { setTouchVersion((v) => v + 1); if (opts.fixedNow === undefined) audioContext() }, [opts.fixedNow])
  const away = state.stack.length > 1
  useEffect(() => {
    if (!away) return
    const id = setTimeout(() => dispatch({ type: 'IDLE', ctx: holdRef.current }), KIOSK_IDLE_MS)
    return () => clearTimeout(id)
  }, [away, touchVersion, stageKind])

  return { state, dispatch, nowMs: shownNow, touched, setHold }
}
