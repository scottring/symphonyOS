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
  it("out the door: each kid's own steps as a checklist; the grown-ups' steps in a strip below", () => {
    const p = props()
    render(<KioskHomeV1 {...p} />)
    const ellaCol = screen.getByRole('region', { name: "Ella's morning" })
    const rows = within(ellaCol).getAllByRole('button', { name: /^Mark / })
    // "Bag packed: …" shows as "Bag packed"; the walk and wake-up are Scott's, breakfast is Iris's.
    // One leading element per row: the step's icon is the completion circle.
    expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual(['Mark Get dressed not done', 'Mark Bag packed done'])
    expect(within(rows[0]).getByText('Get dressed')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Bag packed')).toBeInTheDocument()
    expect(within(rows[1]).getByText('7:15')).toBeInTheDocument()
    expect(rows[0]).toHaveClass('is-done')
    expect(rows[1]).not.toHaveClass('is-done')
    expect(ellaCol.querySelector('.kv-chip')).toBeNull()
    expect(ellaCol.querySelector('.kv-check')).toBeNull()
    expect(rows[0].querySelectorAll('.kv-step-dot')).toHaveLength(1)
    expect(within(ellaCol).getByText('Library today')).toBeInTheDocument()
    expect(within(ellaCol).getByText('Library book')).toBeInTheDocument()
    expect(within(ellaCol).getByText('1 of 2 done')).toBeInTheDocument()
    expect(screen.getByText('Getting ready for school')).toBeInTheDocument()
    expect(screen.getByText('22')).toBeInTheDocument()
    expect(screen.getByText('minutes to go')).toBeInTheDocument()
    expect(screen.getByText('Out the door').parentElement).toHaveTextContent('Out the door7:20')
    const grownUps = screen.getByRole('list', { name: 'Grown-ups this morning' })
    expect(within(grownUps).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '6:45SWake the kids · Scott', '6:50IBreakfast on the table · Iris', '7:20SOut the door, walk to school · Scott',
    ])
    fireEvent.click(rows[1])
    expect(p.onTick).toHaveBeenCalledWith(ella, expect.objectContaining({ id: 'bag' }))
  })

  it('out the door: steps group by time, and the first undone step is NEXT', () => {
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
    const before = within(col).getByRole('group', { name: 'Before breakfast' })
    const rest = within(col).getByRole('group', { name: 'Breakfast & out the door' })
    const names = (el: HTMLElement) => within(el).getAllByRole('button').map((r) => r.getAttribute('aria-label'))
    expect(names(before)).toEqual(['Mark Get dressed not done', 'Mark Dirty clothes in the hamper done', 'Mark Brush teeth done'])
    expect(names(rest)).toEqual(['Mark Eat breakfast done', 'Mark Bag packed done', 'Mark Shoes & jacket on done'])
    const next = within(col).getByRole('button', { name: 'Mark Dirty clothes in the hamper done' })
    expect(next).toHaveClass('is-next')
    expect(within(next).getByText('NEXT')).toBeInTheDocument()
    expect(within(col).getAllByText('NEXT')).toHaveLength(1)
    expect(within(col).getByText('1 of 6 done')).toBeInTheDocument()
    expect(within(rest).getByText('7:00')).toBeInTheDocument()
  })

  it('out the door: with no untimed steps first, one unlabelled list', () => {
    const morning = [step('eat', 'Eat lunch', '11:00', ['e']), step('bag', 'Bag packed', '11:15', ['e'])]
    render(<KioskHomeV1 {...props({ kids: [{ member: ella, special: null, tomorrowSpecial: null, bag: [], morning, after: [] }] })} />)
    const col = screen.getByRole('region', { name: "Ella's morning" })
    expect(within(col).queryAllByRole('group')).toHaveLength(1)
    expect(within(col).getByRole('group', { name: "Ella's steps" })).toBeInTheDocument()
  })

  it('out the door: section names come from the first timed step', () => {
    const morning = [step('a', 'Make bed', null, ['e']), step('b', 'Feed the cat', '07:05', ['e'])]
    render(<KioskHomeV1 {...props({ kids: [{ member: ella, special: null, tomorrowSpecial: null, bag: [], morning, after: [] }] })} />)
    expect(screen.getByRole('group', { name: 'Before 7:05' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: '7:05 & out the door' })).toBeInTheDocument()
  })

  it('rest: one sentence and the places; notes for the house on the fridge door', () => {
    const p = props({ pick: { screen: 'rest', title: 'A quiet morning', dark: false }, notes: [{ id: 'n1', text: 'Plumber at 2', by: 'Scott' }] })
    render(<KioskHomeV1 {...p} />)
    expect(screen.getByText('Home from school at 5:45 · Tacos at 6:30')).toBeInTheDocument()
    expect(screen.getByText('Plumber at 2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Groceries' }))
    expect(p.places.onGroceries).toHaveBeenCalled()
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
