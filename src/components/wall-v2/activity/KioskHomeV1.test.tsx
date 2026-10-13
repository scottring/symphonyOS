import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { KioskHomeV1, type KioskHomeV1Props } from './KioskHomeV1'
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
    scenery: null,
    onTick: vi.fn(), onOpenKid: vi.fn(), onToggleHave: vi.fn(), onScale: vi.fn(), onAddMissing: vi.fn(),
    onOpenRecipe: vi.fn(), onStartCooking: vi.fn(), onTapRow: vi.fn(),
    places: { onGroceries: vi.fn(), onRecipes: vi.fn(), onCall: vi.fn(), onNotes: vi.fn() },
    ...over,
  }
}

describe('the wall, version 1', () => {
  it("out the door: each kid's own steps as chips; the grown-ups' steps beside the countdown", () => {
    const p = props()
    render(<KioskHomeV1 {...p} />)
    const ellaCard = screen.getByText('Ella').closest('.kv-kid') as HTMLElement
    const chips = within(ellaCard).getAllByRole('button', { name: /^Ella: / }).map((b) => b.textContent)
    // "Bag packed: …" shows as "Bag packed"; the walk and wake-up are Scott's, breakfast is Iris's.
    expect(chips).toEqual(['Get dressed', 'Bag packed7:15'])
    expect(within(ellaCard).getByText('Library today')).toBeInTheDocument()
    expect(within(ellaCard).getByText('Library book')).toBeInTheDocument()
    expect(screen.getByText('Out the door at 7:20')).toBeInTheDocument()
    expect(screen.getByText('Wake the kids')).toBeInTheDocument()
    expect(screen.getByText('Breakfast on the table')).toBeInTheDocument()
    fireEvent.click(within(ellaCard).getByRole('button', { name: 'Ella: Bag packed: homework folder, take-home folder' }))
    expect(p.onTick).toHaveBeenCalledWith(ella, expect.objectContaining({ id: 'bag' }))
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
})
