import { describe, it, expect } from 'vitest'
import {
  kioskReducer, initialKioskState, currentStage, stageHoldsOpen, heldChips, kioskPlace, servesFactor,
  kitchenRecord, readKitchen, writeKitchen, readDeparture, writeDeparture, KITCHEN_KEY_PREFIX,
  type KioskEvent, type KioskState, type PlaceContext,
} from './kioskActivity'
import { proposeGroceries } from './groceryProposal'
import { MINUTE_MS } from './kioskTimers'

const T0 = Date.UTC(2026, 9, 10, 22, 0, 0)
const quiet = { bedtimeInProgress: false }
const run = (events: KioskEvent[], s: KioskState = initialKioskState('2026-10-10')) => events.reduce(kioskReducer, s)
const cook: KioskEvent = { type: 'START_COOKING', key: 'r1', title: 'Turkey chili', source: { recipeId: 'r1' }, baseServes: 4, now: T0 }
const ctx: PlaceContext = {
  daypartLabel: 'Evening', dinnerTitle: 'Turkey chili', recipeTitle: 'Turkey chili', departureLabel: 'school run',
  memberName: (id) => (id === 'el' ? 'Ella' : null),
}

class MemoryStore {
  map = new Map<string, string>()
  getItem(k: string) { return this.map.get(k) ?? null }
  setItem(k: string, v: string) { this.map.set(k, v) }
  removeItem(k: string) { this.map.delete(k) }
}

describe('kiosk activity: navigation', () => {
  it('starts home; OPEN pushes, BACK pops, HOME clears the stack', () => {
    let s = initialKioskState('2026-10-10')
    expect(currentStage(s)).toEqual({ kind: 'home' })
    s = run([{ type: 'OPEN', stage: { kind: 'dinner' } }, { type: 'OPEN', stage: { kind: 'calling' } }], s)
    expect(s.stack.map((x) => x.kind)).toEqual(['home', 'dinner', 'calling'])
    s = kioskReducer(s, { type: 'BACK' })
    expect(currentStage(s).kind).toBe('dinner')
    s = kioskReducer(s, { type: 'HOME' })
    expect(s.stack).toEqual([{ kind: 'home' }])
    expect(kioskReducer(s, { type: 'BACK' })).toBe(s) // back at home is a no-op
  })

  it('reopening a stage in the stack returns to it instead of stacking a copy', () => {
    const s = run([{ type: 'OPEN', stage: { kind: 'dinner' } }, cook, { type: 'OPEN', stage: { kind: 'groceries' } }, { type: 'RESUME_COOKING' }])
    expect(s.stack.map((x) => x.kind)).toEqual(['home', 'dinner', 'cooking'])
  })

  it('a different person replaces the person on top', () => {
    const s = run([{ type: 'OPEN', stage: { kind: 'person', memberId: 'el' } }, { type: 'OPEN', stage: { kind: 'person', memberId: 'ka' } }])
    expect(s.stack).toEqual([{ kind: 'home' }, { kind: 'person', memberId: 'ka' }])
  })
})

describe('kiosk activity: dinner → cooking', () => {
  it('serves are clamped and carry into a new cooking session', () => {
    let s = run([{ type: 'OPEN', stage: { kind: 'dinner' } }, { type: 'SET_SERVES', serves: 6 }])
    expect(s.serves).toBe(6)
    expect(kioskReducer(s, { type: 'SET_SERVES', serves: 99 }).serves).toBe(24)
    expect(kioskReducer(s, { type: 'SET_SERVES', serves: 0 }).serves).toBe(1)
    s = kioskReducer(s, cook)
    expect(s.cooking).toMatchObject({ key: 'r1', step: 0, serves: 6, baseServes: 4 })
    expect(servesFactor(6, 4)).toBe(1.5)
    // On the cooking stage, serves changes the session, not the dinner card.
    s = kioskReducer(s, { type: 'SET_SERVES', serves: 8 })
    expect(s.cooking?.serves).toBe(8)
    expect(s.serves).toBe(6)
  })

  it('TOGGLE_HAVE marks and unmarks an ingredient', () => {
    const s = run([{ type: 'TOGGLE_HAVE', index: 2 }, { type: 'TOGGLE_HAVE', index: 0 }])
    expect(s.have).toEqual([0, 2])
    expect(kioskReducer(s, { type: 'TOGGLE_HAVE', index: 2 }).have).toEqual([0])
  })

  it('steps clamp to the loaded step count', () => {
    let s = run([cook, { type: 'STEPS_LOADED', key: 'r1', stepCount: 3 }, { type: 'NEXT_STEP' }, { type: 'NEXT_STEP' }, { type: 'NEXT_STEP' }])
    expect(s.cooking?.step).toBe(2)
    s = run([{ type: 'PREV_STEP' }, { type: 'PREV_STEP' }, { type: 'PREV_STEP' }], s)
    expect(s.cooking?.step).toBe(0)
    expect(kioskReducer(s, { type: 'GO_STEP', step: 1 }).cooking?.step).toBe(1)
    // Steps for another recipe are ignored.
    expect(kioskReducer(s, { type: 'STEPS_LOADED', key: 'other', stepCount: 9 }).cooking?.stepCount).toBe(3)
  })

  it('starting the same recipe again resumes it exactly; another recipe starts fresh', () => {
    let s = run([cook, { type: 'STEPS_LOADED', key: 'r1', stepCount: 6 }, { type: 'GO_STEP', step: 3 }, { type: 'HOME' }])
    s = kioskReducer(s, { ...cook, now: T0 + 999 })
    expect(s.cooking).toMatchObject({ step: 3, stepCount: 6, startedAt: T0 })
    s = kioskReducer(s, { ...cook, key: 'r2', title: 'Soba' })
    expect(s.cooking).toMatchObject({ key: 'r2', step: 0 })
  })

  it('FINISH_COOKING ends the session, leaves the cooking stage and keeps running timers', () => {
    const s = run([{ type: 'OPEN', stage: { kind: 'dinner' } }, cook, { type: 'START_TIMER', id: 't', label: 'Simmer', minutes: 20, now: T0 }, { type: 'FINISH_COOKING' }])
    expect(s.cooking).toBeNull()
    expect(currentStage(s).kind).toBe('dinner')
    expect(s.timers).toHaveLength(1)
  })
})

describe('kiosk activity: interruption and exact return', () => {
  it('a call mid-cooking holds the step and timers; Back returns to the same step with timers still running', () => {
    let s = run([cook, { type: 'STEPS_LOADED', key: 'r1', stepCount: 6 }, { type: 'NEXT_STEP' },
      { type: 'START_TIMER', id: 't1', label: 'Simmer', minutes: 10, now: T0 }])
    const before = s.cooking
    s = kioskReducer(s, { type: 'OPEN', stage: { kind: 'calling' } })
    expect(currentStage(s).kind).toBe('calling')
    const chips = heldChips(s, T0 + 3 * MINUTE_MS + 48_000, quiet)
    expect(chips[0]).toMatchObject({ kind: 'cooking', label: 'Cooking · step 2', timer: '6:12', ringing: false })
    s = kioskReducer(s, { type: 'BACK' })
    expect(currentStage(s).kind).toBe('cooking')
    expect(s.cooking).toBe(before) // the very same session object: nothing reset
    expect(s.timers[0].endsAt).toBe(T0 + 10 * MINUTE_MS)
  })

  it('Home keeps the session held; the chip resumes it at the same step', () => {
    let s = run([cook, { type: 'STEPS_LOADED', key: 'r1', stepCount: 6 }, { type: 'GO_STEP', step: 4 }, { type: 'HOME' }])
    expect(heldChips(s, T0, quiet)[0]).toMatchObject({ kind: 'cooking', label: 'Cooking · step 5', timer: null })
    s = kioskReducer(s, { type: 'RESUME_COOKING' })
    expect(currentStage(s).kind).toBe('cooking')
    expect(s.cooking?.step).toBe(4)
  })

  it('no held chip while on the cooking stage itself; a lone timer is its own chip', () => {
    const s = run([cook])
    expect(heldChips(s, T0, quiet)).toEqual([])
    const timerOnly = run([{ type: 'START_TIMER', id: 't', label: 'Eggs', minutes: 1, now: T0 }])
    expect(heldChips(timerOnly, T0 + 2 * MINUTE_MS, quiet)[0]).toMatchObject({ kind: 'timer', label: 'Eggs', timer: 'Done', ringing: true })
  })

  it('"Out of something?" opens groceries over cooking and Back returns to cooking', () => {
    let s = run([cook, { type: 'GO_STEP', step: 0 }])
    s = kioskReducer(s, { type: 'GROCERY_PROPOSE', proposal: proposeGroceries(['Cumin'], 'cooking', false) })
    expect(currentStage(s).kind).toBe('groceries')
    expect(heldChips(s, T0, quiet)[0].kind).toBe('cooking')
    s = kioskReducer(s, { type: 'BACK' })
    expect(currentStage(s).kind).toBe('cooking')
  })

  it('+1 min and Stop act on one timer only', () => {
    let s = run([{ type: 'START_TIMER', id: 'a', label: 'A', minutes: 5, now: T0 }, { type: 'START_TIMER', id: 'b', label: 'B', minutes: 5, now: T0 }])
    s = kioskReducer(s, { type: 'ADD_MINUTE', id: 'a', now: T0 })
    expect(s.timers.map((t) => t.endsAt)).toEqual([T0 + 6 * MINUTE_MS, T0 + 5 * MINUTE_MS])
    s = kioskReducer(s, { type: 'STOP_TIMER', id: 'b' })
    expect(s.timers.map((t) => t.id)).toEqual(['a'])
  })
})

describe('kiosk activity: never time out an activity in progress', () => {
  const idle: KioskEvent = { type: 'IDLE', ctx: quiet }

  it('idle brings browsing screens home', () => {
    expect(currentStage(run([{ type: 'OPEN', stage: { kind: 'dinner' } }, idle])).kind).toBe('home')
    expect(currentStage(run([{ type: 'OPEN', stage: { kind: 'bedtime' } }, idle])).kind).toBe('home')
    expect(currentStage(run([{ type: 'OPEN', stage: { kind: 'departure' } }, idle])).kind).toBe('home')
  })

  it('idle never closes cooking, a call, a person page or a recipe', () => {
    for (const stage of [{ kind: 'calling' }, { kind: 'person', memberId: 'el' }, { kind: 'recipe', source: 'dinner' }] as const) {
      expect(currentStage(run([{ type: 'OPEN', stage }, idle])).kind).toBe(stage.kind)
    }
    const s = run([cook, { type: 'START_TIMER', id: 't', label: 'x', minutes: 30, now: T0 }, idle])
    expect(currentStage(s).kind).toBe('cooking')
    expect(s.timers).toHaveLength(1)
  })

  it('idle from a browsing screen keeps the held cooking session and its timers', () => {
    const s = run([cook, { type: 'START_TIMER', id: 't', label: 'x', minutes: 30, now: T0 }, { type: 'OPEN', stage: { kind: 'dinner' } }, idle])
    expect(currentStage(s).kind).toBe('home')
    expect(s.cooking).not.toBeNull()
    expect(heldChips(s, T0, quiet)[0].kind).toBe('cooking')
  })

  it('a departure or bedtime under way holds; grocery lines still saving hold', () => {
    const dep = run([{ type: 'OPEN', stage: { kind: 'departure' } }, { type: 'DEPARTURE_TOGGLE', key: 'el:bring:book' }])
    expect(stageHoldsOpen(dep, quiet)).toBe(true)
    expect(currentStage(kioskReducer(dep, idle)).kind).toBe('departure')
    const bed = run([{ type: 'OPEN', stage: { kind: 'bedtime' } }])
    expect(currentStage(kioskReducer(bed, { type: 'IDLE', ctx: { bedtimeInProgress: true } })).kind).toBe('bedtime')
    let g = run([{ type: 'GROCERY_PROPOSE', proposal: proposeGroceries(['A'], 'dinner') }])
    expect(stageHoldsOpen(g, quiet)).toBe(false)
    g = kioskReducer(g, { type: 'GROCERY_SAVING', keys: [g.groceries!.lines[0].key] })
    expect(currentStage(kioskReducer(g, idle)).kind).toBe('groceries')
  })

  it('"Everyone\'s out" finishes the departure and leaves its stage', () => {
    const s = run([{ type: 'OPEN', stage: { kind: 'departure' } }, { type: 'DEPARTURE_TOGGLE', key: 'k' }, { type: 'DEPARTURE_DONE' }])
    expect(s.departure).toEqual({ checked: ['k'], done: true })
    expect(currentStage(s).kind).toBe('home')
    expect(stageHoldsOpen(s, quiet)).toBe(false)
  })

  it('a new day clears the dinner card and departure but keeps a pot still cooking', () => {
    const s = run([{ type: 'SET_SERVES', serves: 6 }, { type: 'TOGGLE_HAVE', index: 1 }, { type: 'DEPARTURE_TOGGLE', key: 'k' }, cook, { type: 'NEW_DAY', dateKey: '2026-10-11' }])
    expect(s).toMatchObject({ dateKey: '2026-10-11', serves: null, have: [], departure: { checked: [], done: false } })
    expect(s.cooking?.key).toBe('r1')
  })
})

describe('kiosk activity: place labels', () => {
  it('names the activity on stage', () => {
    expect(kioskPlace(initialKioskState('d'), ctx)).toBe('Home · Evening')
    expect(kioskPlace(initialKioskState('d'), { ...ctx, daypartLabel: null })).toBe('Home')
    expect(kioskPlace(run([{ type: 'OPEN', stage: { kind: 'dinner' } }]), ctx)).toBe('Dinner · Turkey chili')
    const c = run([{ type: 'SET_SERVES', serves: 6 }, cook, { type: 'STEPS_LOADED', key: 'r1', stepCount: 6 }, { type: 'NEXT_STEP' }])
    expect(kioskPlace(c, ctx)).toBe('Cooking · Turkey chili for 6 · step 2 of 6')
    expect(kioskPlace(run([{ type: 'OPEN', stage: { kind: 'bedtime' } }]), ctx)).toBe('Bedtime')
    expect(kioskPlace(run([{ type: 'OPEN', stage: { kind: 'departure' } }]), ctx)).toBe('Leaving · school run')
    expect(kioskPlace(run([{ type: 'OPEN', stage: { kind: 'calling' } }]), ctx)).toBe('Calling')
    expect(kioskPlace(run([{ type: 'OPEN', stage: { kind: 'person', memberId: 'el' } }]), ctx)).toBe('Ella')
  })
})

describe('kiosk activity: persistence', () => {
  it('a reload restores the cooking session, its step and its timers exactly', () => {
    const store = new MemoryStore()
    const s = run([{ type: 'SET_SERVES', serves: 6 }, cook, { type: 'STEPS_LOADED', key: 'r1', stepCount: 6 }, { type: 'GO_STEP', step: 2 },
      { type: 'START_TIMER', id: 't1', label: 'Simmer', minutes: 20, now: T0 }])
    writeKitchen(store, '2026-10-10', kitchenRecord(s))
    const rec = readKitchen(store, '2026-10-10')!
    const restored = initialKioskState('2026-10-10', rec)
    expect(currentStage(restored).kind).toBe('cooking')
    expect(restored.cooking).toEqual(s.cooking)
    expect(restored.timers).toEqual(s.timers)
    // Another day's key is not read.
    expect(readKitchen(store, '2026-10-11')).toBeNull()
  })

  it('a held session restores held (home on stage, chip in the bar)', () => {
    const store = new MemoryStore()
    const s = run([cook, { type: 'HOME' }])
    writeKitchen(store, 'd', kitchenRecord(s))
    const restored = initialKioskState('d', readKitchen(store, 'd')!)
    expect(currentStage(restored).kind).toBe('home')
    expect(restored.cooking?.key).toBe('r1')
  })

  it('nothing cooking and no timers clears the key; junk is ignored', () => {
    const store = new MemoryStore()
    writeKitchen(store, 'd', kitchenRecord(run([cook])))
    writeKitchen(store, 'd', kitchenRecord(initialKioskState('d')))
    expect(store.map.size).toBe(0)
    store.setItem(KITCHEN_KEY_PREFIX + 'd', '{not json')
    expect(readKitchen(store, 'd')).toBeNull()
    store.setItem(KITCHEN_KEY_PREFIX + 'd', JSON.stringify({ v: 1, cooking: { key: 1 }, timers: [{ id: 'x' }] }))
    expect(readKitchen(store, 'd')).toEqual({ v: 1, cooking: null, timers: [], onCookingStage: false })
    expect(readKitchen(null, 'd')).toBeNull()
  })

  it('departure packing marks survive a reload for the day', () => {
    const store = new MemoryStore()
    writeDeparture(store, 'd', { checked: ['a', 'b'], done: false })
    expect(readDeparture(store, 'd')).toEqual({ checked: ['a', 'b'], done: false })
    writeDeparture(store, 'd', { checked: [], done: false })
    expect(readDeparture(store, 'd')).toBeNull()
  })
})
