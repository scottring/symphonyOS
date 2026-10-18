// Dev-only fixture of the kiosk activity canvas: one fixed household, no
// session, no reads, no writes and no calls (grocery saves are simulated,
// the phone book is fixed and never dials, the clock is held still). For
// screenshotting every approved kiosk board in the wall's themes:
//
//   <KioskCanvasPreview scene="cooking" theme="dark" />
//
// scene: home-morning · home-afternoon · home-evening · quiet · dinner ·
//        groceries · cooking · held · departure · bedtime · call
// theme: 'light' (the wall's default) | 'dark' (the wall's dark view)
// v1Screen: a wall v1 Home screen instead (night · rest · weekend · …);
//        night is dark, the others follow theme.
//
// Not routed here — mount it on a dev-only route.

import { useMemo, useState } from 'react'
import { Sun, Plus, ClipboardList, StickyNote, Moon, Settings, Users } from 'lucide-react'
import type { FamilyMember } from '@/types/family'
import type { WallMoment } from '@/lib/wall/wallMoment'
import type { WallTodayRow } from '@/lib/wall/wallMomentsModel'
import type { KidRow } from '@/lib/wall/kidDayModel'
import { buildBedtimeGrid } from '@/lib/wall/activity/kioskRoutines'
import { normalizeGroceryText, proposeGroceries, type GroceryLine } from '@/lib/wall/activity/groceryProposal'
import { kioskReducer, initialKioskState, type KioskEvent, type KioskState } from '@/lib/wall/activity/kioskActivity'
import { MINUTE_MS } from '@/lib/wall/activity/kioskTimers'
import { KioskCanvas, type KioskTools, type KioskV1Data } from './KioskCanvas'
import type { KioskScreen } from '@/lib/wall/activity/kioskScreen'
import { useKioskActivity } from './useKioskActivity'
import type { ListenerPreview } from './useTellSymphony'
import type { KioskDinner } from './KioskStages'

import type { KioskScene } from './kioskScenes'
import type { KidMath } from '@/hooks/useKidMath'
import type { MathRow } from '@/lib/wall/math/mathProgress'
import { useLocalKidMath } from './useLocalKidMath'
import type { EnergyLive, EnergyPeriod } from '@/lib/wall/energy/homeEnergy'
import type { AgendaDay, AgendaRow } from '@/lib/wall/wallAgenda'

/** Math of the day with fixed problems: Liam's long division (with a story,
 *  six days in a row behind it), Mia's fractions in plain words. */
const PREVIEW_DAY = '2026-10-13'
const previewStreak = (memberId: string, days: number): MathRow[] =>
  Array.from({ length: days }, (_, i) => {
    const d = new Date(2026, 9, 12 - i)
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { id: `${memberId}-${ymd}`, memberId, forDate: ymd, slot: 0, kind: 'multiply', level: 2, spec: { kind: 'multiply', a: 48, b: 7 }, wording: null, status: 'solved', tries: 0, solvedAt: null }
  })
const PREVIEW_MATH: MathRow[] = [
  {
    id: 'pm-li', memberId: 'li', forDate: PREVIEW_DAY, slot: 0, kind: 'divide', level: 3, spec: { kind: 'divide', dividend: 742, divisor: 6, remainders: true },
    wording: { story: 'The bakery made 742 cookies for Liam’s school fair. They pack them in boxes of 6. How many full boxes can they fill, and how many cookies are left over?', hint: 'Start with the 7 hundreds. How many 6s fit in 7? Write that above the 7, take away 6, then bring down the 4.', labels: ['Full boxes', 'Left over'] },
    status: 'open', tries: 0, solvedAt: null,
  },
  { id: 'pm-mi', memberId: 'mi', forDate: PREVIEW_DAY, slot: 0, kind: 'fraction', level: 3, spec: { kind: 'fraction', form: 'add', x: { n: 1, d: 4 }, y: { n: 3, d: 8 } }, wording: null, status: 'open', tries: 0, solvedAt: null },
  ...previewStreak('li', 5),
  ...previewStreak('mi', 2),
]
function usePreviewMath(): KidMath {
  return useLocalKidMath(KIDS, PREVIEW_MATH, PREVIEW_DAY, { li: ['space', 'soccer'] })
}
export type { KioskScene } from './kioskScenes'

const m = (id: string, name: string, role: string, color?: string): FamilyMember => ({ id, name, initials: name.slice(0, 1), role_label: role, color } as unknown as FamilyMember)
const MEMBERS = [m('sk', 'Scott', 'parent', '#2B4FD8'), m('ir', 'Iris', 'parent', '#7A2A8A'), m('li', 'Liam', 'child', '#1D8A74'), m('mi', 'Mia', 'child', '#C7861C')]
const KIDS = MEMBERS.slice(2)

const SCENE_CLOCK: Record<KioskScene, { moment: WallMoment; h: number; min: number }> = {
  'home-morning': { moment: 'morning', h: 7, min: 24 },
  'home-afternoon': { moment: 'after', h: 15, min: 40 },
  'home-evening': { moment: 'dinner', h: 17, min: 50 },
  quiet: { moment: 'after', h: 13, min: 15 },
  dinner: { moment: 'dinner', h: 17, min: 52 },
  groceries: { moment: 'dinner', h: 17, min: 53 },
  cooking: { moment: 'dinner', h: 18, min: 8 },
  held: { moment: 'dinner', h: 18, min: 11 },
  departure: { moment: 'morning', h: 7, min: 43 },
  bedtime: { moment: 'evening', h: 20, min: 6 },
  call: { moment: 'after', h: 16, min: 52 },
  math: { moment: 'after', h: 15, min: 42 },
  energy: { moment: 'dinner', h: 18, min: 20 },
  agenda: { moment: 'after', h: 14, min: 5 },
  'agenda-weekend': { moment: 'after', h: 14, min: 5 },
}

// Wall v2 moments (mockups 2026-10-14): each at the time its mockup shows.
const V1_CLOCK: Record<KioskScreen, { moment: WallMoment; h: number; min: number }> = {
  'out-the-door': { moment: 'morning', h: 7, min: 4 },
  rest: { moment: 'after', h: 10, min: 40 },
  home: { moment: 'after', h: 17, min: 52 },
  dinner: { moment: 'dinner', h: 18, min: 24 },
  bedtime: { moment: 'evening', h: 19, min: 52 },
  night: { moment: 'evening', h: 21, min: 15 },
  weekend: { moment: 'after', h: 9, min: 5 },
}
const V1_NEXT: Record<KioskScreen, { time: string; title: string }> = {
  'out-the-door': { time: '7:20', title: 'Walk to school' }, rest: { time: '5:45', title: 'Home from school' }, home: { time: '6:30', title: 'Turkey chili' },
  dinner: { time: '6:30', title: 'Turkey chili' }, bedtime: { time: '8:30', title: 'Lights out' }, night: { time: '6:45', title: 'Wake the kids' }, weekend: { time: '12:30', title: 'Lunch' },
}
const V1_TITLE: Record<KioskScreen, string> = {
  'out-the-door': 'Out the door in 16 minutes', rest: 'A quiet morning', home: 'Home from school', dinner: 'Dinner',
  bedtime: 'Bedtime · lights out in 38 min', night: 'Goodnight', weekend: 'Saturday',
}
const otd = (i: number, id: string, title: string, timeOfDay: string | null, by: string[] | undefined, done = false): KidRow =>
  ({ entityType: 'routine', id: `${id}-${i}`, title, done, timeOfDay, target: null, ...(by ? { by } : {}) })
const otdMorning = (i: number, kid: string): KidRow[] => [
  otd(i, 'wake', 'Wake the kids', '06:45', ['sk']),
  otd(i, 'dress', 'Get dressed', null, [kid], i === 0),
  otd(i, 'hamper', 'Dirty clothes in the hamper', null, [kid]),
  otd(i, 'bed', 'Make bed & tidy room', null, [kid]),
  otd(i, 'teeth', 'Brush teeth', null, [kid]),
  otd(i, 'table', 'Breakfast on the table', '06:50', ['ir']),
  otd(i, 'eat', 'Eat breakfast', '07:00', [kid]),
  otd(i, 'dishes', 'Clear your place & put dishes away', '07:10', [kid]),
  otd(i, 'bag', 'Bag packed: homework folder', '07:15', [kid]),
  otd(i, 'shoes', 'Shoes & jacket on', '07:18', [kid]),
  otd(i, 'walk', 'Walk to school', '07:20', ['sk']),
]

const RECIPE = {
  title: 'Turkey chili',
  ingredients: ['1 lb ground turkey', '2 tbsp olive oil', '1 onion, diced', '2 tbsp chili powder', '1 tsp cumin', '2 cans kidney beans, drained', '28 oz crushed tomatoes', '1 cup shredded cheddar'],
  instructions: [
    'Heat the oil in a large pot over medium heat.',
    'Add the onion and soften it, about 5 minutes.',
    'Stir in the chili powder and cumin for 1 minute.',
    'Add the turkey. Break it up with a spoon and brown it all over, about 8 minutes.',
    'Stir in the tomatoes and kidney beans and bring to a simmer.',
    'Simmer uncovered for 20 minutes, stirring now and then.',
    'Taste and season.',
    'Serve with the cheddar on top.',
  ],
}
const DINNER = (now: Date): KioskDinner => ({
  key: 'fixture-chili', title: RECIPE.title, imageUrl: null, timeLabel: 'Dinner at 6:30 PM', at: new Date(now).setHours(18, 30, 0, 0), minutes: 45,
  cue: 'Thaw the turkey', ingredients: RECIPE.ingredients, source: { inline: RECIPE }, hasRecipe: false, baseServes: 4,
})
const kr = (id: string, title: string, done = false): KidRow => ({ entityType: 'routine', id, title, done, timeOfDay: null, target: null })

function sceneState(scene: KioskScene, dateKey: string, nowMs: number): KioskState {
  const cook: KioskEvent = { type: 'START_COOKING', key: 'fixture-chili', title: RECIPE.title, source: { inline: RECIPE }, baseServes: 4, now: nowMs - 20 * MINUTE_MS }
  const cooking: KioskEvent[] = [
    { type: 'SET_SERVES', serves: 6 }, cook, { type: 'STEPS_LOADED', key: 'fixture-chili', stepCount: RECIPE.instructions.length }, { type: 'GO_STEP', step: 3 },
    { type: 'START_TIMER', id: 'brown', label: 'Brown the turkey', minutes: 8, now: nowMs - 1 * MINUTE_MS - 18_000 },
    { type: 'START_TIMER', id: 'rice', label: 'Rice', minutes: 18, now: nowMs - 3 * MINUTE_MS - 50_000 },
  ]
  const missing = [RECIPE.ingredients[0], RECIPE.ingredients[5], RECIPE.ingredients[7]].map((l) => l.replace(/^1 lb/, '1 1/2 lb').replace(/^2 cans/, '3 cans').replace(/^1 cup/, '1 1/2 cup'))
  const key = (id: string, kind: string, text: string) => `${id}:${kind}:${normalizeGroceryText(text)}`
  const events: Record<KioskScene, KioskEvent[]> = {
    'home-morning': [{ type: 'DEPARTURE_TOGGLE', key: key('li', 'bring', 'Library book') }, { type: 'DEPARTURE_TOGGLE', key: key('mi', 'bring', 'Water bottle') }],
    'home-afternoon': [],
    'home-evening': [],
    quiet: [],
    dinner: [{ type: 'OPEN', stage: { kind: 'dinner' } }, { type: 'SET_SERVES', serves: 6 }, { type: 'TOGGLE_HAVE', index: 1 }, { type: 'TOGGLE_HAVE', index: 2 }, { type: 'TOGGLE_HAVE', index: 3 }, { type: 'TOGGLE_HAVE', index: 4 }, { type: 'TOGGLE_HAVE', index: 6 }],
    groceries: [{ type: 'OPEN', stage: { kind: 'dinner' } }, { type: 'SET_SERVES', serves: 6 }, { type: 'GROCERY_PROPOSE', proposal: proposeGroceries([...missing, '1 1/2 tsp cumin'], 'dinner') }],
    cooking,
    held: [...cooking, { type: 'OPEN', stage: { kind: 'calling' } }],
    departure: [{ type: 'OPEN', stage: { kind: 'departure' } }, { type: 'DEPARTURE_TOGGLE', key: key('li', 'bring', 'Library book') }, { type: 'DEPARTURE_TOGGLE', key: key('mi', 'bring', 'Swim bag') }, { type: 'DEPARTURE_TOGGLE', key: key('mi', 'bring', 'Water bottle') }],
    bedtime: [{ type: 'OPEN', stage: { kind: 'bedtime' } }],
    call: [{ type: 'OPEN', stage: { kind: 'calling' } }],
    math: [{ type: 'OPEN', stage: { kind: 'math' } }],
    energy: [{ type: 'OPEN', stage: { kind: 'energy' } }],
    agenda: [{ type: 'OPEN', stage: { kind: 'agenda', view: 'today' } }],
    'agenda-weekend': [{ type: 'OPEN', stage: { kind: 'agenda', view: 'weekend' } }],
  }
  let s = events[scene].reduce(kioskReducer, initialKioskState(dateKey))
  // "Cumin — probably in the pantry": the board shows one line left off.
  if (scene === 'groceries' && s.groceries) s = kioskReducer(s, { type: 'GROCERY_TOGGLE', key: s.groceries.lines[3].key })
  return s
}

// All of today · This weekend: a school day's family items, and a weekend.
const ar = (id: string, kind: AgendaRow['kind'], time: string | null, title: string, owners: string[], o: Partial<AgendaRow> = {}): AgendaRow =>
  ({ id, kind, time, title, sub: null, owners, done: false, past: false, checkable: kind !== 'event', on: new Date(), ...o })
const AGENDA: Record<'today' | 'weekend', AgendaDay[]> = {
  today: [{
    key: 'today', label: 'Today', isToday: true, allDay: ['Specials — Liam: Library · Mia: Art', 'Grandma visiting'],
    timed: [
      ar('event-school', 'event', '7:30a', 'School — Liam & Mia', [], { sub: 'Hampden Elementary', past: true }),
      ar('task-vet', 'task', '9a', 'Call the vet about Biscuit', ['sk'], { done: true, past: true }),
      ar('task-poop', 'task', '10a', 'Pick up dog poop in the yard', ['sk', 'li'], { past: true }),
      ar('routine-piano', 'routine', '4:15p', 'Piano practice', ['mi']),
      ar('event-swim', 'event', '5p', 'Swim lessons', ['li'], { sub: 'Y on Elm St' }),
      ar('task-chili', 'task', '6p', 'Start the chili', ['ir']),
      ar('routine-trash', 'routine', '7:30p', 'Trash and recycling out', ['li']),
    ],
    anytime: [
      ar('task-form', 'task', null, 'Sign the field trip form', ['ir']),
      ar('task-library', 'task', null, 'Return library books', ['mi']),
      ar('routine-plants', 'routine', null, 'Water the plants', []),
      ar('task-batteries', 'task', null, 'Buy AA batteries', [], { done: true }),
    ],
  }],
  weekend: [
    { key: 'sat', label: 'Saturday', isToday: false, allDay: ['Grandma visiting'],
      timed: [
        ar('event-soccer', 'event', '9a', 'Soccer — Liam', ['li'], { sub: 'Field 3' }),
        ar('task-mow', 'task', '11a', 'Mow the lawn', ['sk']),
        ar('event-party', 'event', '2p', 'Ava’s birthday party', ['mi']),
        ar('routine-pizza', 'routine', '6p', 'Pizza night', []),
      ],
      anytime: [ar('task-gift', 'task', null, 'Wrap Ava’s present', ['mi']), ar('task-garage', 'task', null, 'Clean out the garage', ['sk', 'ir'])] },
    { key: 'sun', label: 'Sunday', isToday: false, allDay: [],
      timed: [
        ar('event-brunch', 'event', '10a', 'Brunch with the Parks', []),
        ar('routine-plan', 'routine', '4p', 'Plan the week', ['sk', 'ir']),
      ],
      anytime: [ar('task-bags', 'task', null, 'Pack school bags', ['li', 'mi'])] },
  ],
}

// The Energy scene: an evening with the car charging, the sun nearly down.
function energyFixture(now: Date): EnergyLive {
  const ts = Math.floor(now.getTime() / 1000)
  const hour = new Date(now.getTime() - 3600_000)
  const key = `${hour.getFullYear()}-${String(hour.getMonth() + 1).padStart(2, '0')}-${String(hour.getDate()).padStart(2, '0')}T${String(hour.getHours()).padStart(2, '0')}:00:00`
  return {
    site: { rate_cents: 13.04, sell_back_cents: 13.04, co2_kg_per_kwh: 0.3, tz: 'America/New_York' },
    now: { ts, pv: 600, house: 9400, grid: 8800, devices: { 'Electric Vehicle': 7200, AC: 900, 'Heat 4': 300, Microwave: 250, 'Always On': 154, Other: 476, 'Light 9': 40, 'Coffee grinder': 20 } },
    price_now: [13.04, 13.04],
    catalog: [
      { id: 'ev', name: 'Electric Vehicle', status: 'ev', type: 'Electric Vehicle', first_used: null },
      { id: 'ac', name: 'AC', status: 'verified', type: 'AC', first_used: '2019-06-23' },
      { id: 'mw', name: 'Microwave', status: 'verified', type: 'Microwave', first_used: '2019-06-23' },
      { id: 'l9', name: 'Light 9', status: 'verified', type: 'Light', first_used: '2020-10-24' },
      { id: 'cg', name: 'Coffee grinder', status: 'verified', type: 'Coffee Grinder', first_used: '2020-02-01' },
      { id: 'h4', name: 'Heat 4', status: 'unverified', type: 'Mystery Heat', first_used: '2019-11-26' },
      { id: 'always_on', name: 'Always On', status: 'always_on', type: 'Always On', first_used: null },
      { id: 'unknown', name: 'Other', status: 'unattributed', type: 'Unknown', first_used: null },
    ],
    mix: { [key]: { Nuclear: 27082, Gas: 26016, Coal: 11245, Wind: 6100, Solar: 4200, Hydro: 642, 'Multiple Fuels': 2697, Oil: 197 } },
  }
}

// The Energy scene's period buttons: a month like the house's real one, scaled.
const energyPeriodFixture = async (days: number): Promise<EnergyPeriod> => {
  const k = days / 30
  return {
    first: days === 1 ? '2026-10-13T00:00:00-04:00' : '2026-09-14T00:00:00-04:00', last: '2026-10-13T18:00:00-04:00',
    usage: 585 * k, solar: 412 * k, bought: 432 * k, sent: 259 * k, cents: 2260 * k, co2_kg: 149 * k,
    fuels: { Nuclear: 136 * k, Gas: 175 * k, Coal: 67 * k, Wind: 20 * k, Solar: 10 * k, Hydro: 8 * k, Oil: 8 * k, 'Multiple Fuels': 8 * k },
    devices: { 'Electric Vehicle': 184 * k, AC: 40 * k, Microwave: 6 * k, 'Light 9': 4 * k, 'Coffee grinder': 1 * k, 'Heat 4': 5 * k, 'Always On': 168 * k, Other: 177 * k },
  }
}

export function KioskCanvasPreview({ scene = 'home-evening', theme = 'light', v1Screen, dock }: { scene?: KioskScene; theme?: 'light' | 'dark'; v1Screen?: KioskScreen; dock?: ListenerPreview }) {
  const clock = v1Screen ? V1_CLOCK[v1Screen] : SCENE_CLOCK[scene]
  const now = useMemo(() => { const d = new Date(2026, 9, 13); d.setHours(clock.h, clock.min, 0, 0); return d }, [clock])
  const dateKey = `fixture-${scene}`
  const [isDark, setIsDark] = useState(theme === 'dark')
  const activity = useKioskActivity(dateKey, { initial: sceneState(scene, dateKey, now.getTime()), fixedNow: now.getTime(), persist: false })
  const math = usePreviewMath()
  const at = (h: number, min = 0) => new Date(now).setHours(h, min, 0, 0)
  const row = (id: string, h: number, min: number, title: string, owners: string[], sub: string | null = null, endH?: number, endMin = 0, kind: WallTodayRow['kind'] = 'event'): WallTodayRow => {
    const end = at(endH ?? h + 1, endH != null ? endMin : min)
    return {
      id, kind, time: `${h % 12 || 12}${min ? `:${String(min).padStart(2, '0')}` : ''}${h < 12 ? 'a' : 'p'}`, end: null, title, sub, owners,
      past: end <= now.getTime(), now: at(h, min) <= now.getTime() + 45 * 60_000 && end > now.getTime(), startsAt: at(h, min), endsAt: end,
    }
  }
  const weekendRows = [
    row('outing', 9, 0, 'Family outing', ['sk', 'ir', 'li', 'mi'], 'Walk, bike ride or hike, with breakfast along the way', 12, 0),
    row('lunch', 12, 30, 'Lunch', [], null, 13, 15),
    row('prep', 17, 30, 'Prep dinner', ['sk'], null, 18, 15, 'task'),
    row('showers', 19, 30, 'Showers', ['li', 'mi'], 'Bed at 8:30', 20, 0),
  ]
  const rows = v1Screen === 'weekend' ? weekendRows : [
    row('school', 7, 55, 'School', ['li', 'mi'], 'Hampden Elementary', 14, 30),
    row('dentist', 15, 30, 'Dentist', ['li'], 'Iris drives', 16, 30),
    row('swim', 16, 0, 'Swim', ['mi'], 'Scott picks up 5:00', 17),
    row('rice', 18, 0, 'Start the rice', [], null, 18, 15, 'task'),
    row('dinner', 18, 30, 'Dinner', [], 'Turkey chili', 19, 15),
    row('dishes', 19, 0, 'Empty the dishwasher', [], null, 19, 20, 'task'),
    row('lunches', 19, 30, 'Lunches for tomorrow', [], null, 19, 45, 'task'),
  ]
  const morning = clock.moment === 'morning'
  const evening = clock.moment === 'evening' || clock.moment === 'dinner'
  const kidsNow = KIDS.map((k, i) => ({
    member: k, special: i ? 'Art' : 'Library', hint: null,
    needed: morning ? (i ? ['Swim bag', 'Water bottle', 'Rain jacket'] : ['Library book', 'Signed field-trip form', 'Rain jacket']) : (i ? ['Swim bag'] : []),
    homeworkDue: [],
    afterSchool: i ? [kr('sp', 'Spelling list', true), kr('ms', 'Math sheet')] : [kr('rd', 'Reading, 20 min')],
  }))
  const lists = KIDS.map((k, i) => ({
    member: k,
    list: evening
      ? { title: 'Bedtime', rows: [kr(`b1${i}`, 'Bath or shower', true), kr(`b2${i}`, 'Pajamas', i === 0), kr(`b3${i}`, 'Teeth'), kr(`b4${i}`, 'Pack tomorrow’s bag'), kr(`b5${i}`, 'Reading')] }
      : { title: 'Morning routine', rows: [kr(`m1${i}`, 'Dressed', true), kr(`m2${i}`, 'Breakfast', i === 0), kr(`m3${i}`, 'Teeth'), kr(`m4${i}`, 'Shoes')] },
  }))
  const dinner = DINNER(now)
  const save = async (lines: GroceryLine[]) => lines.map((l) => ({ key: l.key, ok: true }))
  const noop = () => {}
  const tools: KioskTools = {
    onGroceries: noop, onRecipes: noop,
    more: [
      { id: 'task', label: 'Add', sub: 'A task for the household', icon: Plus, onSelect: noop },
      { id: 'list', label: 'Lists', sub: 'Groceries and family lists', icon: ClipboardList, onSelect: noop },
      { id: 'notes', label: 'Notes', sub: '2 on the scratchpad', icon: StickyNote, onSelect: noop },
      { id: 'theme', label: isDark ? 'Light view' : 'Dark view', sub: 'Until the wall switches by itself', icon: isDark ? Sun : Moon, onSelect: () => setIsDark((d) => !d) },
      { id: 'guest', label: 'Guest mode', sub: 'Hides the family’s day', icon: Users, onSelect: noop },
      { id: 'settings', label: 'Settings', sub: 'Refresh and daily routines', icon: Settings, onSelect: noop },
    ],
  }
  const v1: KioskV1Data | undefined = v1Screen && {
    pick: { screen: v1Screen, title: V1_TITLE[v1Screen], dark: v1Screen === 'night' || v1Screen === 'bedtime' || isDark },
    anchors: { morning: { start: 405, end: 440 }, home: { start: 1035 }, dinner: 1080, bedtime: { start: 1170, end: 1230 } },
    kids: KIDS.map((k, i) => ({
      member: k, special: v1Screen === 'out-the-door' ? (i ? 'Library' : 'Music') : i ? 'Art' : 'Library', tomorrowSpecial: i ? 'Library' : 'Music', bag: v1Screen === 'out-the-door' && i ? ['Library book'] : [],
      after: [
        { entityType: 'routine' as const, id: `folder-${i}`, title: 'Take-home folder', done: i === 0, timeOfDay: '17:45', target: null },
        { entityType: 'routine' as const, id: `math-${i}`, title: i ? 'Reading, 20 minutes' : 'Math sheet', done: false, timeOfDay: '17:45', target: null },
      ],
      morning: v1Screen === 'out-the-door' ? otdMorning(i, k.id) : [
        { entityType: 'routine' as const, id: `wake-${i}`, title: 'Wake the kids', done: false, timeOfDay: '06:45', target: null, by: [MEMBERS[0].id] },
        { entityType: 'routine' as const, id: `out-${i}`, title: 'Out the door', done: false, timeOfDay: '07:20', target: null },
      ],
    })),
    restLine: 'Home from school at 5:45 · Turkey chili at 6:30', restSub: null,
    notes: [{ id: 'n1', text: 'Plumber Thursday between 10 and 12', by: 'Iris' }, { id: 'n2', text: 'Library books back by Friday', by: 'Scott' }], talks: [{ id: 't1', text: 'Summer camp', by: null }, { id: 't2', text: 'Grandma’s visit', by: null }],
    question: 'If our family had a flag, what would be on it?',
    tomorrow: { label: 'Thursday', outTheDoor: v1Screen === 'night' ? '7:20' : null, specials: KIDS.map((k, i) => ({ member: k, text: i ? 'Library' : 'Music' })) },
    weekend: { rows, anytime: [{ title: 'Kids’ laundry', owners: ['sk', 'ir'] }, { title: 'Food planning', owners: ['ir'] }, { title: 'Paper mail', owners: [] }], tomorrow: [row('soccer', 16, 0, 'Soccer', ['mi']), row('math', 18, 30, 'Math night', ['li'])], tomorrowLabel: 'Thursday' },
    onNotes: noop, next: V1_NEXT[v1Screen],
  }
  return (
    <div className={`${(v1 ? v1.pick.dark : isDark) ? 'dark ' : ''}h-screen w-screen overflow-hidden`} data-kiosk-scene={scene}>
      <KioskCanvas
        isDark={isDark} activity={activity} now={now} moment={clock.moment}
        dateLabel={now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        clock={now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/, '')}
        weather={{ icon: Sun, temp: morning ? 44 : 51, condition: morning ? 'Light rain' : 'Clear' }}
        tools={tools}
        members={MEMBERS} rows={rows} homeRows={rows} kidsNow={kidsNow} focusRows={[]}
        handoffs={scene === 'home-afternoon' ? [{ key: 'h', time: '5p', prompt: 'Who’s picking up Mia from swim?' }] : []}
        checklists={lists} bedtime={buildBedtimeGrid(evening ? lists : [])} dinner={dinner}
        nextMeal={scene === 'quiet' ? { label: 'Tonight', title: 'Turkey chili', imageUrl: null } : scene === 'bedtime' ? { label: 'Dinner tomorrow', title: 'Sheet-pan salmon', imageUrl: null } : null}
        comingUp={[{ dateKey: 'a', dayLabel: 'Wed', summary: 'Trash day · early release 12:30' }, { dateKey: 'b', dayLabel: 'Sat', summary: 'Mia’s swim meet, 9:00' }]}
        question={{ text: 'If our family had a flag, what would be on it?', isHandoff: false }}
        groceryListTitle="Groceries" groceryListItems={['Milk', 'Apples', 'Sandwich bread']} saveGroceries={save}
        phoneFixture={{
          contacts: [
            { contactId: 'g', name: 'Grandma', favorite: true, enabled: true },
            { contactId: 'p', name: 'Grandpa', favorite: true, enabled: true },
            { contactId: 'i', name: 'Iris', favorite: false, enabled: true },
            { contactId: 's', name: 'Scott', favorite: false, enabled: true },
            { contactId: 'd', name: 'Pediatrician', favorite: false, enabled: true },
          ],
          selectedId: scene === 'call' ? 'g' : undefined,
        }}
        personPage={null} recipePage={null} recipeTitle={null}
        onOpenRecipe={noop} onTapRow={noop} onTick={noop} onClaim={noop} onTapQuestion={noop} flash={noop}
        v1={v1}
        math={math}
        energy={energyFixture(now)}
        loadEnergyPeriod={energyPeriodFixture}
        agenda={AGENDA}
        onSetDone={noop}
        onAddSticky={async () => true}
        listenerPreview={v1Screen ? dock ?? (v1Screen === 'night' ? 'quiet' : 'idle') : undefined}
      />
    </div>
  )
}
