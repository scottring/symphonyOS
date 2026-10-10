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
//
// Not routed here — mount it on a dev-only route.

import { useMemo, useState } from 'react'
import { Sun, Plus, ClipboardList, StickyNote, Moon, Settings } from 'lucide-react'
import type { FamilyMember } from '@/types/family'
import type { WallMoment } from '@/lib/wall/wallMoment'
import type { WallTodayRow } from '@/lib/wall/wallMomentsModel'
import type { KidRow } from '@/lib/wall/kidDayModel'
import { buildBedtimeGrid } from '@/lib/wall/activity/kioskRoutines'
import { normalizeGroceryText, proposeGroceries, type GroceryLine } from '@/lib/wall/activity/groceryProposal'
import { kioskReducer, initialKioskState, type KioskEvent, type KioskState } from '@/lib/wall/activity/kioskActivity'
import { MINUTE_MS } from '@/lib/wall/activity/kioskTimers'
import { KioskCanvas, type KioskTools } from './KioskCanvas'
import { useKioskActivity } from './useKioskActivity'
import type { KioskDinner } from './KioskStages'

import type { KioskScene } from './kioskScenes'
export type { KioskScene } from './kioskScenes'

const m = (id: string, name: string, role: string): FamilyMember => ({ id, name, initials: name.slice(0, 1), role_label: role } as unknown as FamilyMember)
const MEMBERS = [m('sk', 'Scott', 'parent'), m('ir', 'Iris', 'parent'), m('li', 'Liam', 'child'), m('mi', 'Mia', 'child')]
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
}

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
  }
  let s = events[scene].reduce(kioskReducer, initialKioskState(dateKey))
  // "Cumin — probably in the pantry": the board shows one line left off.
  if (scene === 'groceries' && s.groceries) s = kioskReducer(s, { type: 'GROCERY_TOGGLE', key: s.groceries.lines[3].key })
  return s
}

export function KioskCanvasPreview({ scene = 'home-evening', theme = 'light' }: { scene?: KioskScene; theme?: 'light' | 'dark' }) {
  const clock = SCENE_CLOCK[scene]
  const now = useMemo(() => { const d = new Date(2026, 9, 13); d.setHours(clock.h, clock.min, 0, 0); return d }, [clock])
  const dateKey = `fixture-${scene}`
  const [isDark, setIsDark] = useState(theme === 'dark')
  const activity = useKioskActivity(dateKey, { initial: sceneState(scene, dateKey, now.getTime()), fixedNow: now.getTime(), persist: false })
  const at = (h: number, min = 0) => new Date(now).setHours(h, min, 0, 0)
  const row = (id: string, h: number, min: number, title: string, owners: string[], sub: string | null = null, endH?: number, endMin = 0, kind: WallTodayRow['kind'] = 'event'): WallTodayRow => {
    const end = at(endH ?? h + 1, endH != null ? endMin : min)
    return {
      id, kind, time: `${h % 12 || 12}${min ? `:${String(min).padStart(2, '0')}` : ''}${h < 12 ? 'a' : 'p'}`, end: null, title, sub, owners,
      past: end <= now.getTime(), now: at(h, min) <= now.getTime() + 45 * 60_000 && end > now.getTime(), startsAt: at(h, min), endsAt: end,
    }
  }
  const rows = [
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
      { id: 'list', label: 'Lists', sub: 'Family lists', icon: ClipboardList, onSelect: noop },
      { id: 'notes', label: 'Notes', sub: 'The family scratchpad', icon: StickyNote, onSelect: noop },
      { id: 'theme', label: isDark ? 'Light view' : 'Dark view', sub: isDark ? 'Switch the wall to light' : 'Switch the wall to dark', icon: isDark ? Sun : Moon, onSelect: () => setIsDark((d) => !d) },
      { id: 'settings', label: 'Settings', sub: 'Guest mode, refresh, routines', icon: Settings, onSelect: noop },
    ],
  }
  return (
    <div className={`${isDark ? 'dark ' : ''}h-screen w-screen overflow-hidden`} data-kiosk-scene={scene}>
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
      />
    </div>
  )
}
