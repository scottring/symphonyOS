import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { KioskHomeV1, stepIcon, type KioskHomeV1Props } from './KioskHomeV1'
import { Backpack, BedDouble, CircleCheck, Footprints, Shirt, ShoppingBasket, Smile, Sparkles, Utensils } from 'lucide-react'
import type { FamilyMember } from '@/types/family'

const member = (id: string, name: string, color: string) => ({ id, name, initials: name[0], color }) as FamilyMember
const ella = member('e', 'Ella', '#0a7'), kaleb = member('k', 'Kaleb', '#f90'), scott = member('s', 'Scott', '#00f'), iris = member('i', 'Iris', '#808')
const step = (id: string, title: string, timeOfDay: string | null, by?: string[], done = false) => ({ entityType: 'routine' as const, id, title, done, timeOfDay, target: null, ...(by ? { by } : {}) })

function props(over: Partial<KioskHomeV1Props> = {}): KioskHomeV1Props {
  const morning = [
    step('w', 'Wake the kids', '06:45', ['s']),
    step('d', 'Get dressed', '06:45', ['e', 'k'], true),
    step('b', 'Breakfast on the table', '06:50', ['i']),
    step('bag', 'Bag packed: homework folder, take-home folder', '07:15', ['e', 'k']),
    step('out', 'Out the door, walk to school', '07:20', ['s']),
  ]
  return {
    pick: { screen: 'out-the-door', title: 'Out the door in 22 minutes', dark: false },
    now: new Date(2026, 9, 13, 6, 58),
    anchors: { morning: { start: 405, end: 440 }, home: { start: 1035 }, dinner: 1080, bedtime: { start: 1170, end: 1230 } },
    members: [scott, iris, ella, kaleb],
    kids: [
      { member: ella, special: 'Library', tomorrowSpecial: null, bag: ['Library book'], morning, after: [] },
      { member: kaleb, special: 'Art', tomorrowSpecial: null, bag: [], morning, after: [] },
    ],
    restLine: 'Home from school at 5:45 · Tacos at 6:30', restSub: null, notes: [], talks: [],
    dinner: null, have: [], scale: 1, question: 'What is the best advice anyone has ever given you?',
    bedtime: { title: 'Bedtime', people: [], steps: [], done: 0, total: 0, inProgress: false },
    tomorrow: { label: 'Wednesday', outTheDoor: '7:20', specials: [] },
    weekend: { rows: [], anytime: [], tomorrow: [], tomorrowLabel: 'Sunday' },
    onTick: vi.fn(), onOpenKid: vi.fn(), onToggleHave: vi.fn(), onScale: vi.fn(), onAddMissing: vi.fn(),
    onOpenRecipe: vi.fn(), onStartCooking: vi.fn(), onTapRow: vi.fn(),
    onNotes: vi.fn(),
    ...over,
  }
}

describe('the wall, version 1', () => {
  it("out the door: one table, steps × kids — the step's icon labels the row, each kid's cell is a check circle", () => {
    const p = props()
    render(<KioskHomeV1 {...p} />)
    // Ella and Kaleb share the routine: one row per step, grown-ups' steps left out.
    const table = screen.getByRole('table', { name: 'Steps' })
    const heads = within(table).getAllByRole('columnheader')
    expect(heads.map((h) => h.textContent)).toEqual(['', 'EEllaLibrary today1 of 2', 'KKalebArt today1 of 2'])
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((r) => within(r).getByRole('rowheader').textContent)).toEqual(['Get dressed', 'Bag packedElla: Library book7:15'])
    // Done = filled; that kid's next step = the ember ring; the row is tinted.
    const dressed = within(table).getByRole('button', { name: 'Ella: Get dressed' })
    expect(dressed).toHaveAttribute('aria-pressed', 'true')
    expect(dressed).toHaveClass('is-done')
    const bag = within(table).getByRole('button', { name: 'Kaleb: Bag packed' })
    expect(bag).toHaveClass('is-now')
    expect(rows[1]).toHaveClass('is-next')
    expect(rows[0]).not.toHaveClass('is-next')
    // Tapping a cell ticks that kid's step, exactly as before.
    fireEvent.click(bag)
    expect(p.onTick).toHaveBeenCalledWith(kaleb, expect.objectContaining({ id: 'bag' }))
    expect(screen.getByRole('heading', { name: 'Out the door at 7:20' })).toBeInTheDocument()
    expect(screen.getByText('22')).toBeInTheDocument()
    const grownUps = screen.getByRole('list', { name: 'Grown-ups this morning' })
    expect(within(grownUps).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'S6:45 Wake the kidsScott', 'I6:50 Breakfast on the tableIris', 'S7:20 Out the door, walk to schoolScott',
    ])
  })

  it('out the door: the union of the kids\' steps in routine order, in two halves split at the first timed step', () => {
    const mine = [
      step('d', 'Get dressed', '06:45', ['e'], true),
      step('h', 'Dirty clothes in the hamper', null, ['e']),
      step('t', 'Brush teeth', null, ['e']),
      step('eat', 'Eat breakfast', '07:00', ['e']),
      step('bag', 'Bag packed', '07:15', ['e']),
    ]
    const his = [
      step('d2', 'Get dressed', '06:45', ['k']),
      step('feed', 'Feed the cat', null, ['k']),
      step('t2', 'Brush teeth', null, ['k']),
      step('eat2', 'Eat breakfast', '07:00', ['k']),
    ]
    render(<KioskHomeV1 {...props({ kids: [
      { member: ella, special: null, tomorrowSpecial: null, bag: [], morning: mine, after: [] },
      { member: kaleb, special: null, tomorrowSpecial: null, bag: [], morning: his, after: [] },
    ] })} />)
    const before = screen.getByRole('table', { name: 'Before breakfast' })
    const after = screen.getByRole('table', { name: 'Breakfast & out the door' })
    const names = (t: HTMLElement) => within(t).getAllByRole('rowheader').map((h) => h.querySelector('.kw-otd-name > span')?.textContent)
    // Kaleb's own step sits right after the step before it in his routine.
    expect(names(before)).toEqual(['Get dressed', 'Feed the cat', 'Dirty clothes in the hamper', 'Brush teeth'])
    expect(names(after)).toEqual(['Eat breakfast', 'Bag packed'])
    // No step for that kid: an empty cell, no circle.
    expect(within(before).queryByRole('button', { name: 'Ella: Feed the cat' })).toBeNull()
    expect(within(before).queryByRole('button', { name: 'Kaleb: Dirty clothes in the hamper' })).toBeNull()
    expect(within(after).getByText('7:00')).toBeInTheDocument()
    // Each kid's next step: Ella's hamper, Kaleb's dressing.
    expect(within(before).getByRole('button', { name: 'Ella: Dirty clothes in the hamper' })).toHaveClass('is-now')
    expect(within(before).getByRole('button', { name: 'Kaleb: Get dressed' })).toHaveClass('is-now')
    expect(screen.getAllByText('1 of 5')).toHaveLength(2)
  })

  it('rest: the next landmark large, then dinner; notes for the house; the rest of today beside it; no places row', () => {
    const row = { id: 'dent', kind: 'event' as const, time: '3:30p', end: null, title: 'Dentist', sub: 'Iris drives', owners: [], past: false, now: false }
    const p = props({ pick: { screen: 'rest', title: 'A quiet morning', dark: false }, notes: [{ id: 'n1', text: 'Plumber at 2', by: 'Scott' }], weekend: { rows: [row], anytime: [], tomorrow: [], tomorrowLabel: 'Thursday' } })
    render(<KioskHomeV1 {...p} />)
    expect(screen.getByRole('heading', { name: 'Home from school at 5:45' })).toBeInTheDocument()
    expect(screen.getByText('Tacos at 6:30')).toBeInTheDocument()
    const side = screen.getByRole('complementary', { name: 'The rest of today' })
    fireEvent.click(within(side).getByRole('button', { name: /3:30.*Dentist.*Iris drives/ }))
    expect(p.onTapRow).toHaveBeenCalledWith('dent')
    expect(screen.getByText('Plumber at 2')).toBeInTheDocument()
    // Calmer screens: the places live in More, never at the foot of a moment.
    expect(screen.queryByRole('navigation', { name: 'Places' })).toBeNull()
    for (const name of ['Groceries', 'Recipes', 'Call', 'Notes']) expect(screen.queryByRole('button', { name })).toBeNull()
  })

  it('rest: a task past its time but not done stays on the rest of today; a past event does not', () => {
    const base = { end: null, sub: null, owners: [], now: false }
    const rows = [
      { ...base, id: 'task-poop', kind: 'task' as const, time: '10:00a', title: 'pick up poop in backyard', past: true, open: true },
      { ...base, id: 'event-swim', kind: 'event' as const, time: '9:00a', title: 'Swim', past: true },
    ]
    render(<KioskHomeV1 {...props({ pick: { screen: 'rest', title: 'A quiet afternoon', dark: false }, weekend: { rows, anytime: [], tomorrow: [], tomorrowLabel: 'Sunday' } })} />)
    const side = screen.getByRole('complementary', { name: 'The rest of today' })
    expect(within(side).getByText('pick up poop in backyard')).toBeInTheDocument()
    expect(within(side).queryByText('Swim')).toBeNull()
    expect(within(side).queryByText('Nothing else on the clock today.')).toBeNull()
  })

  it('every moment centres its lead group: nothing pinned to the foot by a spacer', () => {
    const screens = ['rest', 'out-the-door', 'home', 'dinner', 'bedtime', 'night', 'weekend'] as const
    for (const s of screens) {
      const { container, unmount } = render(<KioskHomeV1 {...props({ pick: { screen: s, title: s, dark: false }, talks: [{ id: 't', text: 'Camp', by: null }] })} />)
      expect(container.querySelector('.kw-col.is-lead')).not.toBeNull()
      expect(container.querySelector('.kw-col > .kw-grow, .kw-col.is-lead > .kw-grow, .kw-side > .kw-grow')).toBeNull()
      expect(container.querySelector('.kw-places')).toBeNull()
      unmount()
    }
  })

  it('weekend: one row of sometime-today under the lead, with the count of the rest', () => {
    const anytime = ['Bikes', 'Garden', 'Library', 'Laundry', 'Cards'].map((title) => ({ title, owners: [] }))
    render(<KioskHomeV1 {...props({ pick: { screen: 'weekend', title: 'Saturday', dark: false }, weekend: { rows: [], anytime, tomorrow: [], tomorrowLabel: 'Sunday' } })} />)
    expect(within(screen.getByRole('list', { name: 'Sometime today' })).getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByText('5 to do')).toBeInTheDocument()
  })

  it('More takes the side column; the lead stays', () => {
    render(<KioskHomeV1 {...props({ pick: { screen: 'dinner', title: 'Dinner', dark: false }, aside: <section aria-label="More">tiles</section> })} />)
    expect(screen.getByRole('region', { name: 'More' })).toBeInTheDocument()
    expect(screen.queryByText('What is the best advice anyone has ever given you?')).toBeNull()
    expect(screen.getByRole('region', { name: "Tonight's dinner" })).toBeInTheDocument()
  })

  it('dinner: the question of the day is the centrepiece', () => {
    render(<KioskHomeV1 {...props({ pick: { screen: 'dinner', title: 'Dinner', dark: false } })} />)
    expect(screen.getByText('What is the best advice anyone has ever given you?')).toBeInTheDocument()
  })

  it('night: tomorrow, and the things to talk about (never at dinner)', () => {
    const talks = [{ id: 't1', text: 'Summer camp', by: null }]
    const { unmount } = render(<KioskHomeV1 {...props({ pick: { screen: 'night', title: 'Goodnight', dark: true }, talks })} />)
    expect(screen.getByText('7:20')).toBeInTheDocument()
    expect(screen.getByText('Summer camp')).toBeInTheDocument()
    unmount()
    render(<KioskHomeV1 {...props({ pick: { screen: 'dinner', title: 'Dinner', dark: false }, talks })} />)
    expect(screen.queryByText('Summer camp')).toBeNull()
  })

  it('night: the first thing in the morning, the rest of tomorrow, and talk-abouts open the notes', () => {
    const p = props({
      pick: { screen: 'night', title: 'Goodnight', dark: true },
      talks: [{ id: 't1', text: 'Summer camp', by: null }, { id: 't2', text: 'Grandma', by: null }],
      weekend: { rows: [], anytime: [], tomorrow: [{ id: 'm', kind: 'event', time: '6:30p', end: null, title: 'Math night', sub: null, owners: [], past: false, now: false, startsAt: null, endsAt: null }], tomorrowLabel: 'Wednesday' },
    })
    render(<KioskHomeV1 {...p} />)
    const side = screen.getByRole('complementary', { name: 'Also tomorrow' })
    expect(within(side).getByText('6:45')).toBeInTheDocument()
    expect(within(side).getByText('Wake the kids')).toBeInTheDocument()
    expect(within(side).getByText('Math night')).toBeInTheDocument()
    // The talk-abouts sit with tomorrow, not pinned under the lead.
    fireEvent.click(within(side).getByRole('button', { name: /2 things to talk about/ }))
    expect(p.onNotes).toHaveBeenCalled()
  })

  it('step icons come from the words in the step', () => {
    expect(stepIcon('Get dressed')).toBe(Shirt)
    expect(stepIcon('Dirty clothes in the hamper')).toBe(ShoppingBasket)
    expect(stepIcon('Laundry downstairs')).toBe(ShoppingBasket)
    expect(stepIcon('Make bed & tidy room')).toBe(BedDouble)
    expect(stepIcon('Brush teeth')).toBe(Smile)
    expect(stepIcon('Eat breakfast')).toBe(Utensils)
    expect(stepIcon('Clear your place & put dishes away')).toBe(Sparkles)
    expect(stepIcon('Bag packed: homework folder')).toBe(Backpack)
    expect(stepIcon('Shoes & jacket on')).toBe(Footprints)
    expect(stepIcon('Feed the cat')).toBe(CircleCheck)
  })
})

describe('Math of the day on Home', () => {
  it('each kid’s after-school card opens their problem, with their streak', () => {
    const onOpenMath = vi.fn()
    const spec = { kind: 'multiply' as const, a: 48, b: 7 }
    const today = (memberId: string, status: 'open' | 'solved') => ({ id: memberId, memberId, forDate: '2026-10-13', slot: 0, kind: 'multiply' as const, level: 2, spec, wording: null, status, tries: 0, solvedAt: null })
    const entry = (member: typeof ella, status: 'open' | 'solved', streak: number) => ({ member, daily: today(member.id, status), current: today(member.id, status), streak, bonusStars: 0, canBonus: false, topics: [] })
    render(<KioskHomeV1 {...props({
      pick: { screen: 'home', title: 'After school', dark: false },
      math: {
        kids: [entry(ella, 'solved', 4), entry(kaleb, 'open', 0)],
        selectedId: 'e', select: vi.fn(), check: vi.fn(), addBonus: vi.fn(), resetToday: vi.fn(), setTopics: vi.fn(),
      },
      onOpenMath,
    })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Kaleb: Math of the day, ready' }))
    expect(onOpenMath).toHaveBeenCalledWith(kaleb)
    expect(screen.getByRole('button', { name: 'Ella: Math of the day, solved, 4 days in a row' })).toBeInTheDocument()
  })
})
