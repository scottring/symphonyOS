// The kiosk's activity state machine (conversational canvas, slice 7).
//
// The wall is a stable frame around a STAGE. The stage shows one activity at
// a time — home, dinner, groceries, cooking, leaving, bedtime, calling, a
// person's day, a recipe — and a stack remembers how you got there, so Back
// always returns to the previous activity and Home always means the
// household view.
//
// Cooking and timers are not stages: they are held state that survives any
// stage change. Leave the cooking stage for a question, a call or a grocery
// run and the session is HELD — same step, timers still counting — and
// "Back to cooking" returns to exactly that step. Activities in progress are
// never closed by inactivity (stageHoldsOpen); idle only brings an untouched
// browsing screen back home, and held chips stay.
//
// PURE: no React, no storage, no clock reads. Time arrives on events.

import { addMinute, soonestTimer, startTimer, formatRemaining, remainingMs, isTimerDone, type KioskTimer } from './kioskTimers'
import {
  applyGroceryResults, markSaving, toggleGroceryLine,
  type GroceryLineResult, type GroceryProposal,
} from './groceryProposal'

export type KioskStage =
  | { kind: 'home' }
  | { kind: 'dinner' }
  | { kind: 'groceries' }
  | { kind: 'cooking' }
  | { kind: 'departure' }
  | { kind: 'bedtime' }
  | { kind: 'calling' }
  | { kind: 'person'; memberId: string }
  | { kind: 'recipe'; source: 'dinner' | 'picked' }

export type KioskStageKind = KioskStage['kind']

/** Where a recipe's steps come from: a stored recipe, else its web page, or
 *  content carried inline (previews; a recipe with no row of its own). */
export interface CookingSource {
  recipeId?: string
  url?: string
  inline?: { title: string; ingredients: string[]; instructions: string[] }
}

export interface CookingSession {
  /** Identity of the recipe being cooked (recipe id, or date + title). */
  key: string
  title: string
  source: CookingSource
  /** 0-based current step. */
  step: number
  /** Known once the steps load; 0 while unknown. */
  stepCount: number
  serves: number
  baseServes: number
  startedAt: number
}

export interface KioskState {
  /** stack[0] is always home; the last entry is on the stage. */
  stack: KioskStage[]
  /** The dinner card's chosen servings (null = the recipe's own). */
  serves: number | null
  /** Indices of tonight's ingredients marked "we have it". */
  have: number[]
  cooking: CookingSession | null
  timers: KioskTimer[]
  groceries: GroceryProposal | null
  departure: { checked: string[]; done: boolean }
  dateKey: string
}

export const MIN_SERVES = 1
export const MAX_SERVES = 24
/** Recipes don't store a yield. Until they do, the wall assumes a stored
 *  recipe serves 4 and says so on screen ("recipe serves 4"). */
export const DEFAULT_BASE_SERVES = 4
/** An untouched browsing screen goes home after this long. */
export const KIOSK_IDLE_MS = 120_000

export type KioskEvent =
  | { type: 'OPEN'; stage: KioskStage }
  | { type: 'BACK' }
  | { type: 'HOME' }
  | { type: 'SET_SERVES'; serves: number }
  | { type: 'TOGGLE_HAVE'; index: number }
  | { type: 'START_COOKING'; key: string; title: string; source: CookingSource; baseServes: number; now: number }
  | { type: 'STEPS_LOADED'; key: string; stepCount: number }
  | { type: 'NEXT_STEP' }
  | { type: 'PREV_STEP' }
  | { type: 'GO_STEP'; step: number }
  | { type: 'RESUME_COOKING' }
  | { type: 'FINISH_COOKING' }
  | { type: 'START_TIMER'; id: string; label: string; minutes: number; now: number }
  | { type: 'ADD_MINUTE'; id: string; now: number }
  | { type: 'STOP_TIMER'; id: string }
  | { type: 'GROCERY_PROPOSE'; proposal: GroceryProposal }
  | { type: 'GROCERY_TOGGLE'; key: string }
  | { type: 'GROCERY_SAVING'; keys: string[] }
  | { type: 'GROCERY_RESULTS'; results: GroceryLineResult[] }
  | { type: 'DEPARTURE_TOGGLE'; key: string }
  | { type: 'DEPARTURE_DONE' }
  | { type: 'IDLE'; ctx: HoldContext }
  | { type: 'NEW_DAY'; dateKey: string }

/** Facts the reducer can't see itself (they live in the household's data). */
export interface HoldContext {
  /** Someone has ticked part of tonight's bedtime routine, not all of it. */
  bedtimeInProgress: boolean
}

export function initialKioskState(dateKey: string, restore?: Partial<Pick<KioskState, 'cooking' | 'timers' | 'departure'>> & { onCookingStage?: boolean }): KioskState {
  const cooking = restore?.cooking ?? null
  return {
    stack: cooking && restore?.onCookingStage ? [{ kind: 'home' }, { kind: 'cooking' }] : [{ kind: 'home' }],
    serves: null,
    have: [],
    cooking,
    timers: restore?.timers ?? [],
    groceries: null,
    departure: restore?.departure ?? { checked: [], done: false },
    dateKey,
  }
}

export function currentStage(s: KioskState): KioskStage {
  return s.stack[s.stack.length - 1] ?? { kind: 'home' }
}

function sameStage(a: KioskStage, b: KioskStage): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'person' && b.kind === 'person') return a.memberId === b.memberId
  if (a.kind === 'recipe' && b.kind === 'recipe') return a.source === b.source
  return true
}

/** Put `stage` on top. If it is already in the stack, return to it (drop
 *  what's above) rather than stacking a second copy — Back never loops. */
function open(s: KioskState, stage: KioskStage): KioskState {
  if (stage.kind === 'home') return { ...s, stack: [{ kind: 'home' }] }
  const at = s.stack.findIndex((x) => sameStage(x, stage))
  if (at >= 0) return { ...s, stack: s.stack.slice(0, at + 1) }
  // A different person / recipe replaces the one on top instead of stacking.
  const top = currentStage(s)
  const base = top.kind === stage.kind ? s.stack.slice(0, -1) : s.stack
  return { ...s, stack: [...base, stage] }
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

function withStep(s: KioskState, step: number): KioskState {
  if (!s.cooking) return s
  const hi = s.cooking.stepCount > 0 ? s.cooking.stepCount - 1 : 0
  return { ...s, cooking: { ...s.cooking, step: clamp(step, 0, hi) } }
}

/** Does the activity on stage keep the wall where it is when nobody touches
 *  it? Cooking, a call, a person's page (KidDayView guards itself), a recipe
 *  being read, grocery lines still saving, a departure or bedtime under way:
 *  yes. Home and dinner browsing: no. */
export function stageHoldsOpen(s: KioskState, ctx: HoldContext): boolean {
  const stage = currentStage(s)
  switch (stage.kind) {
    case 'home':
    case 'dinner':
      return false
    case 'cooking':
    case 'calling':
    case 'person':
    case 'recipe':
      return true
    case 'groceries':
      return !!s.groceries?.lines.some((l) => l.state === 'saving')
    case 'departure':
      return s.departure.checked.length > 0 && !s.departure.done
    case 'bedtime':
      return ctx.bedtimeInProgress
  }
}

export function kioskReducer(s: KioskState, e: KioskEvent): KioskState {
  switch (e.type) {
    case 'OPEN':
      return open(s, e.stage)
    case 'BACK':
      return s.stack.length > 1 ? { ...s, stack: s.stack.slice(0, -1) } : s
    case 'HOME':
      return { ...s, stack: [{ kind: 'home' }] }
    case 'SET_SERVES': {
      const serves = clamp(Math.round(e.serves), MIN_SERVES, MAX_SERVES)
      if (currentStage(s).kind === 'cooking' && s.cooking) return { ...s, cooking: { ...s.cooking, serves } }
      return { ...s, serves }
    }
    case 'TOGGLE_HAVE':
      return {
        ...s,
        have: s.have.includes(e.index) ? s.have.filter((i) => i !== e.index) : [...s.have, e.index].sort((a, b) => a - b),
      }
    case 'START_COOKING': {
      // The same recipe resumes exactly where it was; a different one starts
      // fresh at step 1 with the dinner card's servings.
      const resumed = s.cooking && s.cooking.key === e.key
      const cooking: CookingSession = resumed && s.cooking
        ? s.cooking
        : {
            key: e.key, title: e.title, source: e.source, step: 0, stepCount: 0,
            baseServes: e.baseServes, serves: s.serves ?? e.baseServes, startedAt: e.now,
          }
      return open({ ...s, cooking }, { kind: 'cooking' })
    }
    case 'STEPS_LOADED': {
      if (!s.cooking || s.cooking.key !== e.key) return s
      const stepCount = Math.max(0, e.stepCount)
      return withStep({ ...s, cooking: { ...s.cooking, stepCount } }, s.cooking.step)
    }
    case 'NEXT_STEP':
      return s.cooking ? withStep(s, s.cooking.step + 1) : s
    case 'PREV_STEP':
      return s.cooking ? withStep(s, s.cooking.step - 1) : s
    case 'GO_STEP':
      return withStep(s, e.step)
    case 'RESUME_COOKING':
      return s.cooking ? open(s, { kind: 'cooking' }) : s
    case 'FINISH_COOKING': {
      // Timers keep running — a finished recipe never silently drops a pot
      // still on the stove.
      const at = s.stack.findIndex((x) => x.kind === 'cooking')
      return { ...s, cooking: null, stack: at > 0 ? s.stack.slice(0, at) : s.stack }
    }
    case 'START_TIMER':
      return { ...s, timers: [...s.timers, startTimer(e.id, e.label, e.minutes, e.now)] }
    case 'ADD_MINUTE':
      return { ...s, timers: s.timers.map((t) => (t.id === e.id ? addMinute(t, e.now) : t)) }
    case 'STOP_TIMER':
      return { ...s, timers: s.timers.filter((t) => t.id !== e.id) }
    case 'GROCERY_PROPOSE':
      return open({ ...s, groceries: e.proposal }, { kind: 'groceries' })
    case 'GROCERY_TOGGLE':
      return s.groceries ? { ...s, groceries: toggleGroceryLine(s.groceries, e.key) } : s
    case 'GROCERY_SAVING':
      return s.groceries ? { ...s, groceries: markSaving(s.groceries, e.keys) } : s
    case 'GROCERY_RESULTS':
      return s.groceries ? { ...s, groceries: applyGroceryResults(s.groceries, e.results) } : s
    case 'DEPARTURE_TOGGLE': {
      const checked = s.departure.checked.includes(e.key)
        ? s.departure.checked.filter((k) => k !== e.key)
        : [...s.departure.checked, e.key]
      return { ...s, departure: { ...s.departure, checked } }
    }
    case 'DEPARTURE_DONE': {
      const at = s.stack.findIndex((x) => x.kind === 'departure')
      return { ...s, departure: { ...s.departure, done: true }, stack: at > 0 ? s.stack.slice(0, at) : s.stack }
    }
    case 'IDLE':
      return stageHoldsOpen(s, e.ctx) || s.stack.length === 1 ? s : { ...s, stack: [{ kind: 'home' }] }
    case 'NEW_DAY':
      if (e.dateKey === s.dateKey) return s
      // A new day clears the dinner card and the morning's departure; a pot
      // that is still cooking at midnight keeps cooking.
      return { ...s, dateKey: e.dateKey, serves: null, have: [], departure: { checked: [], done: false }, groceries: null }
  }
}

// ─── What the frame shows ──────────────────────────────────────────

export interface HeldChip {
  kind: 'cooking' | 'timer' | 'departure' | 'bedtime'
  label: string
  /** The soonest timer, "6:12", or "Done" when it has rung. */
  timer: string | null
  ringing: boolean
}

/** Activities held while the stage shows something else — the bottom bar's
 *  chips. Cooking first; a lone timer when nothing is cooking. */
export function heldChips(s: KioskState, now: number, ctx: HoldContext): HeldChip[] {
  const stage = currentStage(s).kind
  const chips: HeldChip[] = []
  const t = soonestTimer(s.timers, now)
  const timerText = t ? (isTimerDone(t, now) ? 'Done' : formatRemaining(remainingMs(t, now))) : null
  const ringing = !!t && isTimerDone(t, now)
  if (s.cooking && stage !== 'cooking') {
    chips.push({ kind: 'cooking', label: `Cooking · step ${s.cooking.step + 1}`, timer: timerText, ringing })
  } else if (!s.cooking && t) {
    chips.push({ kind: 'timer', label: s.timers.length > 1 ? `${s.timers.length} timers` : t.label || 'Timer', timer: timerText, ringing })
  }
  if (stage !== 'departure' && s.departure.checked.length > 0 && !s.departure.done) {
    chips.push({ kind: 'departure', label: 'Leaving', timer: null, ringing: false })
  }
  if (stage !== 'bedtime' && ctx.bedtimeInProgress) {
    chips.push({ kind: 'bedtime', label: 'Bedtime', timer: null, ringing: false })
  }
  return chips
}

export interface PlaceContext {
  /** "Evening", "Morning" … or null for the quiet hours. */
  daypartLabel: string | null
  dinnerTitle: string | null
  recipeTitle: string | null
  departureLabel: string | null
  memberName: (id: string) => string | null
}

/** The frame's centre: where the household is right now. */
export function kioskPlace(s: KioskState, ctx: PlaceContext): string {
  const stage = currentStage(s)
  switch (stage.kind) {
    case 'home':
      return ctx.daypartLabel ? `Home · ${ctx.daypartLabel}` : 'Home'
    case 'dinner':
      return ctx.dinnerTitle ? `Dinner · ${ctx.dinnerTitle}` : 'Dinner'
    case 'groceries':
      return s.groceries?.origin === 'cooking' ? 'Cooking · out of something' : 'Dinner · Groceries'
    case 'cooking': {
      const c = s.cooking
      if (!c) return 'Cooking'
      const steps = c.stepCount > 0 ? ` · step ${c.step + 1} of ${c.stepCount}` : ''
      return `Cooking · ${c.title} for ${c.serves}${steps}`
    }
    case 'departure':
      return ctx.departureLabel ? `Leaving · ${ctx.departureLabel}` : 'Leaving'
    case 'bedtime':
      return 'Bedtime'
    case 'calling':
      return 'Calling'
    case 'person':
      return ctx.memberName(stage.memberId) ?? 'Family'
    case 'recipe':
      return ctx.recipeTitle ? `Recipe · ${ctx.recipeTitle}` : 'Recipe'
  }
}

/** Is a cooking session (or a lone timer) held behind another activity?
 *  Home shows held work only as bottom-bar chips; any other activity gets
 *  the held column beside it. */
export function showsHeldColumn(s: KioskState): boolean {
  const kind = currentStage(s).kind
  if (kind === 'home' || kind === 'cooking') return false
  return !!s.cooking || s.timers.length > 0
}

/** The place, with the held activity named when there is one: "Calling ·
 *  cooking is held". */
export function kioskPlaceWithHold(s: KioskState, ctx: PlaceContext): string {
  const place = kioskPlace(s, ctx)
  return showsHeldColumn(s) && s.cooking && !place.startsWith('Cooking') ? `${place} · cooking is held` : place
}

/** Scaling factor for the chosen servings. */
export function servesFactor(serves: number, baseServes: number): number {
  return baseServes > 0 ? serves / baseServes : 1
}

// ─── Persistence (today's kitchen) ─────────────────────────────────

export const KITCHEN_KEY_PREFIX = 'symphony-wall-kitchen:'
export const DEPARTURE_KEY_PREFIX = 'symphony-wall-departure:'

export interface KitchenRecord {
  v: 1
  cooking: CookingSession | null
  timers: KioskTimer[]
  onCookingStage: boolean
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function isSession(x: unknown): x is CookingSession {
  const c = x as CookingSession
  return !!c && typeof c.key === 'string' && typeof c.title === 'string' && typeof c.step === 'number'
    && typeof c.stepCount === 'number' && typeof c.serves === 'number' && typeof c.baseServes === 'number'
    && !!c.source && typeof c.source === 'object'
}

function isTimer(x: unknown): x is KioskTimer {
  const t = x as KioskTimer
  return !!t && typeof t.id === 'string' && typeof t.endsAt === 'number' && typeof t.totalMs === 'number'
}

export function kitchenRecord(s: KioskState): KitchenRecord {
  return { v: 1, cooking: s.cooking, timers: s.timers, onCookingStage: currentStage(s).kind === 'cooking' }
}

export function readKitchen(store: Store | null, dateKey: string): KitchenRecord | null {
  if (!store) return null
  try {
    const raw = store.getItem(KITCHEN_KEY_PREFIX + dateKey)
    if (!raw) return null
    const p = JSON.parse(raw) as Partial<KitchenRecord>
    if (p.v !== 1) return null
    return {
      v: 1,
      cooking: isSession(p.cooking) ? p.cooking : null,
      timers: Array.isArray(p.timers) ? p.timers.filter(isTimer) : [],
      onCookingStage: !!p.onCookingStage,
    }
  } catch {
    return null
  }
}

export function writeKitchen(store: Store | null, dateKey: string, rec: KitchenRecord): void {
  if (!store) return
  try {
    if (!rec.cooking && rec.timers.length === 0) store.removeItem(KITCHEN_KEY_PREFIX + dateKey)
    else store.setItem(KITCHEN_KEY_PREFIX + dateKey, JSON.stringify(rec))
  } catch { /* storage full or blocked: the session still lives in memory */ }
}

export function readDeparture(store: Store | null, dateKey: string): KioskState['departure'] | null {
  if (!store) return null
  try {
    const raw = store.getItem(DEPARTURE_KEY_PREFIX + dateKey)
    if (!raw) return null
    const p = JSON.parse(raw) as { checked?: unknown; done?: unknown }
    return { checked: Array.isArray(p.checked) ? p.checked.filter((k): k is string => typeof k === 'string') : [], done: !!p.done }
  } catch {
    return null
  }
}

export function writeDeparture(store: Store | null, dateKey: string, dep: KioskState['departure']): void {
  if (!store) return
  try {
    if (!dep.checked.length && !dep.done) store.removeItem(DEPARTURE_KEY_PREFIX + dateKey)
    else store.setItem(DEPARTURE_KEY_PREFIX + dateKey, JSON.stringify(dep))
  } catch { /* best effort */ }
}
