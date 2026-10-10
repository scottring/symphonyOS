// Design preview of the kiosk activity canvas: a fixed household, no
// session, no reads and no writes (grocery saves are simulated; calling is
// not offered). For judging the frame, the daypart compositions and the
// cooking flow on the real display. Not routed by default — mount it on a
// dev route to use it. ?part=morning|after|dinner|evening|quiet  ?dark=1

import { useMemo } from 'react'
import { Sun, Phone, ShoppingCart } from 'lucide-react'
import type { FamilyMember } from '@/types/family'
import type { WallMoment } from '@/lib/wall/wallMoment'
import type { WallTodayRow } from '@/lib/wall/wallMomentsModel'
import type { KidRow } from '@/lib/wall/kidDayModel'
import { buildBedtimeGrid } from '@/lib/wall/activity/kioskRoutines'
import type { GroceryLine } from '@/lib/wall/activity/groceryProposal'
import { KioskCanvas } from './KioskCanvas'
import { useKioskActivity } from './useKioskActivity'
import type { KioskDinner } from './KioskStages'

const m = (id: string, name: string, role: string): FamilyMember => ({ id, name, initials: name.slice(0, 1), role_label: role } as unknown as FamilyMember)
const MEMBERS = [m('sk', 'Scott', 'parent'), m('ir', 'Iris', 'parent'), m('li', 'Liam', 'child'), m('mi', 'Mia', 'child')]
const KIDS = MEMBERS.slice(2)
const PARTS: Record<string, { moment: WallMoment; h: number; min: number }> = {
  morning: { moment: 'morning', h: 7, min: 20 },
  after: { moment: 'after', h: 15, min: 30 },
  dinner: { moment: 'dinner', h: 17, min: 30 },
  evening: { moment: 'evening', h: 20, min: 0 },
  quiet: { moment: 'evening', h: 22, min: 30 },
}
const RECIPE = {
  title: 'Turkey chili',
  ingredients: ['2 lb ground turkey', '1 tbsp olive oil', '1 onion, diced', '3 cloves garlic, minced', '2 tbsp chili powder', '1 tsp cumin', '2 cans kidney beans, drained', '1 can crushed tomatoes', 'Salt and pepper'],
  instructions: [
    'Heat the oil in a large pot over medium heat and soften the onion, about 5 minutes.',
    'Add the garlic, chili powder and cumin; stir for 1 minute until fragrant.',
    'Add the turkey and brown it, breaking it up, 8–10 minutes.',
    'Stir in the tomatoes and beans and bring to a simmer.',
    'Simmer uncovered for 20 minutes, stirring now and then.',
    'Season with salt and pepper and serve.',
  ],
}
const kr = (id: string, title: string, done = false): KidRow => ({ entityType: 'routine', id, title, done, timeOfDay: null, target: null })

export function KioskCanvasPreview() {
  const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
  const part = PARTS[params.get('part') ?? 'dinner'] ?? PARTS.dinner
  const isDark = params.get('dark') === '1'
  const now = useMemo(() => { const d = new Date(); d.setHours(part.h, part.min, 0, 0); return d }, [part])
  const at = (h: number, min = 0) => { const d = new Date(now); d.setHours(h, min, 0, 0); return d.getTime() }
  const row = (id: string, h: number, min: number, title: string, owners: string[], sub: string | null = null, endH?: number): WallTodayRow => ({
    id, kind: 'event', time: `${h % 12 || 12}${min ? `:${String(min).padStart(2, '0')}` : ''}${h < 12 ? 'a' : 'p'}`, end: null, title, sub, owners,
    past: at(endH ?? h + 1) <= now.getTime(), now: false, startsAt: at(h, min), endsAt: at(endH ?? h + 1),
  })
  const rows = [
    row('e1', 7, 45, 'School — Liam & Mia', ['li', 'mi'], 'Hampden Elementary', 14),
    row('e2', 15, 30, 'Soccer practice', ['mi'], 'Field 3', 17),
    row('e3', 16, 0, 'Piano', ['li'], 'Ms. Ortiz'),
    row('e4', 18, 30, 'Dinner', []),
    row('e5', 19, 0, 'Trash night', []),
  ]
  const activity = useKioskActivity(`preview-${now.toDateString()}`)
  const kidsNow = KIDS.map((k, i) => ({
    member: k, special: i ? 'Art' : 'Library', hint: i ? null : 'Return the library book.',
    needed: i ? ['Shin guards'] : [], homeworkDue: i ? [] : ['Spelling sheet'],
    afterSchool: [kr(`hw${i}`, i ? 'Math practice' : 'Reading · 20 min', i === 1)],
  }))
  const evening = part.moment === 'evening' || part.moment === 'dinner'
  const lists = KIDS.map((k, i) => ({
    member: k,
    list: evening
      ? { title: 'Bedtime', rows: [kr(`b1${i}`, 'Pajamas', i === 0), kr(`b2${i}`, 'Brush teeth'), kr(`b3${i}`, i ? 'Pick a book' : 'Read'), ...(i ? [] : [kr('b4', 'Lights out')])] }
      : { title: 'Out the door', rows: [kr(`o1${i}`, 'Shoes', i === 0), kr(`o2${i}`, 'Backpack'), kr(`o3${i}`, 'Water bottle')] },
  }))
  const dinner: KioskDinner = {
    key: 'preview-chili', title: RECIPE.title, imageUrl: null, timeLabel: 'Dinner at 6:30 PM', minutes: 45, cue: 'Thaw the turkey by 4.',
    ingredients: RECIPE.ingredients, source: { inline: RECIPE }, hasRecipe: false, baseServes: 4,
  }
  const save = async (lines: GroceryLine[]) => {
    await new Promise((r) => setTimeout(r, 600))
    return lines.map((l, i) => ({ key: l.key, ok: i !== 1 || lines.length === 1 }))
  }
  return (
    <div className={`${isDark ? 'dark ' : ''}h-screen w-screen overflow-hidden`}>
      <KioskCanvas
        isDark={isDark} activity={activity} now={now} moment={part.moment}
        dateLabel={now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        clock={now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        weather={{ icon: Sun, temp: 61, condition: 'Clear' }}
        tools={<>
          <button type="button" className="kc-btn kc-tool is-primary"><Phone aria-hidden="true" />kidsPhone</button>
          <button type="button" className="kc-btn kc-tool"><ShoppingCart aria-hidden="true" />Groceries</button>
        </>}
        members={MEMBERS} rows={rows} homeRows={rows} kidsNow={kidsNow} focusRows={[]}
        handoffs={part.moment === 'after' ? [{ key: 'h', time: '5p', prompt: 'Who’s picking up Mia from soccer?' }] : []}
        checklists={lists} bedtime={buildBedtimeGrid(evening ? lists : [])} dinner={dinner}
        nextMeal={part.moment === 'dinner' ? null : { label: part.moment === 'evening' ? 'Dinner tomorrow' : 'Dinner at 6:30 PM', title: part.moment === 'evening' ? 'Sheet-pan salmon' : RECIPE.title, imageUrl: null }}
        comingUp={[{ dateKey: 'a', dayLabel: 'Fri', summary: 'Grandpa picks up Liam & Mia' }, { dateKey: 'b', dayLabel: 'Sat', summary: 'Mia’s birthday party, 2p' }]}
        scratchpad={{ rows: [], onOpen: () => {} }}
        question={{ text: 'If our family had a flag, what would be on it?', isHandoff: false }}
        groceryListTitle="Groceries" saveGroceries={save}
        personPage={null} recipePage={null} recipeTitle={null}
        onOpenRecipe={() => {}} onTapRow={() => {}} onTick={() => {}} onClaim={() => {}} onTapQuestion={() => {}} flash={() => {}}
      />
    </div>
  )
}
