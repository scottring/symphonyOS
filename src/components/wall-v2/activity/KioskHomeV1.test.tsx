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
    places: { onGroceries: vi.fn(), onRecipes: vi.fn(), onCall: vi.fn(), onNotes: vi.fn() },
    ...over,
  }
}

describe('the wall, version 1', () => {
  it("out the door: each kid's own steps as a checklist; done steps fold to one line; the grown-ups' line on top", () => {
    const p = props()
    render(<KioskHomeV1 {...p} />)
    const ellaCol = screen.getByRole('region', { name: "Ella's morning" })
    // "Bag packed: …" shows as "Bag packed"; the walk and wake-up are Scott's, breakfast is Iris's.
    // One leading element per row: the step's icon is the completion circle.
    const rows = within(ellaCol).getAllByRole('button', { name: /^Mark / })
    expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual(['Mark Bag packed done'])
    expect(within(rows[0]).getByText('Bag packed')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Library book')).toBeInTheDocument()
    expect(rows[0]).toHaveClass('is-next')
    expect(rows[0].querySelectorAll('.kw-ck-c')).toHaveLength(1)
    // Get dressed is done: folded into one line, which opens to untick it.
    const fold = within(ellaCol).getByRole('button', { name: 'Done: Get dressed. Show them' })
    fireEvent.click(fold)
    const dressed = within(ellaCol).getByRole('button', { name: 'Mark Get dressed not done' })
    expect(dressed).toHaveClass('is-done')
    fireEvent.click(dressed)
    expect(p.onTick).toHaveBeenCalledWith(ella, expect.objectContaining({ id: 'd' }))
    expect(within(ellaCol).getByText('Library today')).toBeInTheDocument()
    expect(within(ellaCol).getByText('1 of 2')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Out the door at 7:20' })).toBeInTheDocument()
    expect(screen.getByText('22')).toBeInTheDocument()
    expect(screen.getByText('minutes')).toBeInTheDocument()
    const grownUps = screen.getByRole('list', { name: 'Grown-ups this morning' })
    expect(within(grownUps).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'S6:45 Wake the kidsScott', 'I6:50 Breakfast on the tableIris', 'S7:20 Out the door, walk to schoolScott',
    ])
    fireEvent.click(within(ellaCol).getByRole('button', { name: 'Mark Bag packed done' }))
    expect(p.onTick).toHaveBeenCalledWith(ella, expect.objectContaining({ id: 'bag' }))
  })

  it('out the door: the first undone step is NEXT, and the list stops before it would scroll', () => {
    const morning = [
      step('d', 'Get dressed', '06:45', ['e'], true),
      step('h', 'Dirty clothes in the hamper', null, ['e']),
      step('t', 'Brush teeth', null, ['e']),
      step('eat', 'Eat breakfast', '07:00', ['e']),
      step('bag', 'Bag packed', '07:15', ['e']),
      step('sh', 'Shoes & jacket on', null, ['e']),
    ]
    render(<KioskHomeV1 {...props({ kids: [{ member: ella, special: 'Music', tomorrowSpecial: null, bag: [], morning, after: [] }] })} />)
    const col = screen.getByRole('region', { name: "Ella's morning" })
    const names = within(col).getAllByRole('button', { name: /^Mark / }).map((r) => r.getAttribute('aria-label'))
    // Five rows fit: the folded line and four steps; the count says the rest.
    expect(names).toEqual(['Mark Dirty clothes in the hamper done', 'Mark Brush teeth done', 'Mark Eat breakfast done', 'Mark Bag packed done'])
    const next = within(col).getByRole('button', { name: 'Mark Dirty clothes in the hamper done' })
    expect(next).toHaveClass('is-next')
    expect(within(next).getByText('NEXT')).toBeInTheDocument()
    expect(within(col).getAllByText('NEXT')).toHaveLength(1)
    expect(within(col).getByText('1 of 6')).toBeInTheDocument()
    expect(within(col).getByText('7:00')).toBeInTheDocument()
  })

  it('rest: the next landmark large, then dinner; notes for the house; the places; the rest of today beside it', () => {
    const row = { id: 'dent', kind: 'event' as const, time: '3:30p', end: null, title: 'Dentist', sub: 'Iris drives', owners: [], past: false, now: false }
    const p = props({ pick: { screen: 'rest', title: 'A quiet morning', dark: false }, notes: [{ id: 'n1', text: 'Plumber at 2', by: 'Scott' }], weekend: { rows: [row], anytime: [], tomorrow: [], tomorrowLabel: 'Thursday' } })
    render(<KioskHomeV1 {...p} />)
    expect(screen.getByRole('heading', { name: 'Home from school at 5:45' })).toBeInTheDocument()
    expect(screen.getByText('Tacos at 6:30')).toBeInTheDocument()
    const side = screen.getByRole('complementary', { name: 'The rest of today' })
    fireEvent.click(within(side).getByRole('button', { name: /3:30.*Dentist.*Iris drives/ }))
    expect(p.onTapRow).toHaveBeenCalledWith('dent')
    expect(screen.getByText('Plumber at 2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Groceries' }))
    expect(p.places.onGroceries).toHaveBeenCalled()
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
    fireEvent.click(screen.getByRole('button', { name: /2 things to talk about/ }))
    expect(p.places.onNotes).toHaveBeenCalled()
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
